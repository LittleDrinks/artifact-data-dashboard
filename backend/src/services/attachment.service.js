const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sharp = require('sharp');

const { mysqlPool } = require('../config/database');
const { getStorageDriver } = require('./storage');
const { getUploadQueue } = require('./queue/upload-queue');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg']);

const mergeMeta = (baseMeta, extraMeta) => {
  const baseOk = baseMeta && typeof baseMeta === 'object';
  const extraOk = extraMeta && typeof extraMeta === 'object';
  if (baseOk && extraOk) {
    return { ...baseMeta, ...extraMeta };
  }
  if (extraOk) {
    return { ...extraMeta };
  }
  return baseOk ? baseMeta : null;
};

const fixUtf8Mojibake = (value) => {
  const input = String(value || '');
  // 如果字符串里含有典型 latin1 误解码的高位字符（例如 é¾...），尝试 latin1 -> utf8 纠正
  // 纠正后如果出现更多 CJK 字符，则认为成功。
  const hasLatin1High = /[\u00C0-\u00FF]/.test(input);
  if (!hasLatin1High) {
    return input;
  }

  try {
    const repaired = Buffer.from(input, 'latin1').toString('utf8');
    const cjkCount = (s) => (s.match(/[\u4E00-\u9FFF]/g) || []).length;
    if (cjkCount(repaired) >= cjkCount(input) + 1) {
      return repaired;
    }
  } catch {
    // ignore
  }

  return input;
};

const normalizeOriginalName = (name) => {
  const fixed = fixUtf8Mojibake(name);
  // 防止路径穿越：只取 basename
  return path.basename(String(fixed || ''));
};

const guessMimeType = (filename) => {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.tiff') return 'image/tiff';
  return 'application/octet-stream';
};

const computeSha256FromBuffer = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

const computeSha256FromFile = async (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
};

const genStorageName = (originalName) => {
  const ext = path.extname(originalName || '').slice(0, 20) || '.bin';
  const random = crypto.randomBytes(16).toString('hex');
  return `${Date.now()}_${random}${ext}`;
};

const genThumbName = (storageName, size) => {
  const safe = String(storageName || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join('thumbnails', `${safe}.w${size}.jpg`);
};

class AttachmentService {
  constructor({ storageDriver = null, uploadQueue = null } = {}) {
    this.storage = storageDriver || getStorageDriver();
    this.queue = uploadQueue || getUploadQueue();

    this._schema = null;
    this._schemaPromise = null;
  }

  async _withMySqlLock(lockKey, fn, { timeoutSeconds = 10 } = {}) {
    const key = String(lockKey || '').slice(0, 200);
    if (!key) {
      return fn();
    }

    const [[acquired]] = await mysqlPool.execute(
      'SELECT GET_LOCK(?, ?) AS ok',
      [key, Math.max(0, Number(timeoutSeconds) || 0)]
    );

    if (!acquired || Number(acquired.ok) !== 1) {
      throw new Error('获取上传锁超时，请稍后重试');
    }

    try {
      return await fn();
    } finally {
      try {
        await mysqlPool.execute('SELECT RELEASE_LOCK(?)', [key]);
      } catch {
        // ignore
      }
    }
  }

  async _findExistingByHashForOwner({ hash, ownerType, ownerId }) {
    const schema = await this._ensureSchema();
    if (!schema.hasHash) {
      return null;
    }

    const fields = ['id', 'storage_name'];
    if (schema.hasThumbnailStorageName) {
      fields.push('thumbnail_storage_name');
    }
    if (schema.hasMeta) {
      fields.push('meta');
    }

    const where = [
      '`hash` = ?',
      // null-safe equality for optional owner fields
      'owner_type <=> ?',
      'owner_id <=> ?'
    ];
    const params = [hash, ownerType, ownerId];

    if (schema.hasStatus) {
      where.push("status = 'ok'");
    }

    const [rows] = await mysqlPool.execute(
      `SELECT ${fields.join(', ')} FROM attachments WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 1`,
      params
    );

    return rows && rows[0] ? rows[0] : null;
  }

  async _ensureSchema() {
    if (this._schema) {
      return this._schema;
    }

    if (!this._schemaPromise) {
      this._schemaPromise = (async () => {
        try {
          const [rows] = await mysqlPool.execute(
            'SHOW COLUMNS FROM attachments'
          );

          const names = new Set((rows || []).map(r => String(r.Field || '').toLowerCase()));
          this._schema = {
            hasHash: names.has('hash'),
            hasMeta: names.has('meta'),
            hasStatus: names.has('status'),
            hasThumbnailStorageName: names.has('thumbnail_storage_name')
          };
        } catch (err) {
          // 数据库不可用/权限不足时，退化为老 schema（不使用新增字段）
          this._schema = {
            hasHash: false,
            hasMeta: false,
            hasStatus: false,
            hasThumbnailStorageName: false
          };
        }
        return this._schema;
      })().finally(() => {
        this._schemaPromise = null;
      });
    }

    return this._schemaPromise;
  }

  async _findExistingByHash(hash) {
    const schema = await this._ensureSchema();
    if (!schema.hasHash) {
      return null;
    }

    const fields = ['id', 'storage_name'];
    if (schema.hasThumbnailStorageName) {
      fields.push('thumbnail_storage_name');
    }
    if (schema.hasMeta) {
      fields.push('meta');
    }

    const where = ['`hash` = ?'];
    const params = [hash];
    if (schema.hasStatus) {
      where.push("status = 'ok'");
    }

    const [rows] = await mysqlPool.execute(
      `SELECT ${fields.join(', ')} FROM attachments WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 1`,
      params
    );

    return rows && rows[0] ? rows[0] : null;
  }

  async _insertAttachmentRow({
    ownerType,
    ownerId,
    uploadedBy,
    originalName,
    mimeType,
    sizeBytes,
    storageName,
    hash,
    thumbnailStorageName,
    meta,
    status = 'ok',
    folderId = null
  }) {
    const schema = await this._ensureSchema();

    const cols = [
      'owner_type',
      'owner_id',
      'uploaded_by',
      'original_name',
      'mime_type',
      'size_bytes',
      'storage_name',
      'created_at',
      'folder_id'
    ];

    const values = [
      ownerType,
      ownerId,
      uploadedBy,
      originalName,
      mimeType,
      sizeBytes,
      storageName,
      new Date(),
      folderId
    ];

    if (schema.hasHash) {
      cols.push('`hash`');
      values.push(hash);
    }

    if (schema.hasMeta) {
      cols.push('meta');
      values.push(meta ? JSON.stringify(meta) : null);
    }

    if (schema.hasStatus) {
      cols.push('status');
      values.push(status);
    }

    if (schema.hasThumbnailStorageName) {
      cols.push('thumbnail_storage_name');
      values.push(thumbnailStorageName);
    }

    const placeholders = cols.map(() => '?').join(', ');
    const [result] = await mysqlPool.execute(
      `INSERT INTO attachments (${cols.join(', ')}) VALUES (${placeholders})`,
      values
    );

    return result.insertId;
  }

  async _generateThumbnailsFromBuffer(buffer, storageName) {
    const smallName = genThumbName(storageName, 200);
    const mediumName = genThumbName(storageName, 800);

    const image = sharp(buffer, { failOn: 'none' });
    const metadata = await image.metadata();

    const smallBuf = await image
      .clone()
      .resize({ width: 200, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const mediumBuf = await image
      .clone()
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    await this.storage.writeBuffer(smallName, smallBuf);
    await this.storage.writeBuffer(mediumName, mediumBuf);

    return {
      metadata,
      thumbnails: {
        small: smallName,
        medium: mediumName
      }
    };
  }

  async ingestBuffer({ uploadedBy, ownerType = null, ownerId = null, folderId = null, originalName, mimeType = null, buffer, extraMeta = null }) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('buffer 无效');
    }

    const normalizedName = normalizeOriginalName(originalName);

    const schema = await this._ensureSchema();
    const resolvedMime = mimeType || guessMimeType(normalizedName);
    const hash = schema.hasHash ? computeSha256FromBuffer(buffer) : null;

    const run = async () => {
      // 1) 如果同一个 owner 下已经有相同 hash 的记录，直接返回已有记录，避免重复行
      const existingForOwner = hash
        ? await this._findExistingByHashForOwner({ hash, ownerType, ownerId })
        : null;
      if (existingForOwner) {
        return { id: existingForOwner.id, deduped: true };
      }

      // 2) 若 hash 已存在（别的 owner），复用其存储文件/缩略图，但为当前 owner 插入一行
      const existing = hash ? await this._findExistingByHash(hash) : null;
      if (existing) {
        const existingMeta = existing.meta;
        const parsedMeta = existingMeta
          ? (typeof existingMeta === 'string' ? JSON.parse(existingMeta) : existingMeta)
          : null;

        const mergedMeta = mergeMeta(parsedMeta, extraMeta);

        const attachmentId = await this._insertAttachmentRow({
          ownerType,
          ownerId,
          uploadedBy,
          originalName: normalizedName,
          mimeType: resolvedMime,
          sizeBytes: buffer.length,
          storageName: existing.storage_name,
          hash,
          thumbnailStorageName: existing.thumbnail_storage_name,
          meta: mergedMeta,
          status: 'ok',
          folderId
        });

        return { id: attachmentId, deduped: true };
      }

      // 3) 新内容：写入存储并入库
      const storageName = genStorageName(normalizedName);
      await this.storage.writeBuffer(storageName, buffer);

      let thumb = null;
      let meta = null;

      const ext = path.extname(normalizedName || '').toLowerCase();
      if (IMAGE_EXTS.has(ext)) {
        try {
          const { metadata, thumbnails } = await this._generateThumbnailsFromBuffer(buffer, storageName);
          thumb = thumbnails.small;
          meta = {
            width: metadata.width || null,
            height: metadata.height || null,
            format: metadata.format || null,
            thumbnails
          };
        } catch (err) {
          meta = { thumbnailError: err.message };
        }
      }

      meta = mergeMeta(meta, extraMeta);

      const attachmentId = await this._insertAttachmentRow({
        ownerType,
        ownerId,
        uploadedBy,
        originalName: normalizedName,
        mimeType: resolvedMime,
        sizeBytes: buffer.length,
        storageName,
        hash,
        thumbnailStorageName: thumb,
        meta,
        status: 'ok',
        folderId
      });

      return { id: attachmentId, deduped: false };
    };

    if (hash) {
      const lockKey = computeSha256FromBuffer(
        Buffer.from(`attachments:ingest|${hash}|${ownerType || 'null'}|${ownerId ?? 'null'}`)
      );
      return this._withMySqlLock(lockKey, run);
    }

    return run();
  }

  async ingestLocalFile({ uploadedBy, ownerType = null, ownerId = null, folderId = null, filePath, originalName, mimeType = null, extraMeta = null }) {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      throw new Error('不是文件');
    }

    const normalizedName = normalizeOriginalName(originalName);

    const schema = await this._ensureSchema();
    const hash = schema.hasHash ? await computeSha256FromFile(filePath) : null;

    const run = async () => {
      // 1) 同 owner 下已存在相同 hash：直接返回已有记录
      const existingForOwner = hash
        ? await this._findExistingByHashForOwner({ hash, ownerType, ownerId })
        : null;
      if (existingForOwner) {
        return { id: existingForOwner.id, deduped: true };
      }

      // 2) 其他 owner 已存在相同 hash：复用存储文件，插入新行
      const existing = hash ? await this._findExistingByHash(hash) : null;
      if (existing) {
        const existingMeta = existing.meta;
        const parsedMeta = existingMeta
          ? (typeof existingMeta === 'string' ? JSON.parse(existingMeta) : existingMeta)
          : null;

        const mergedMeta = mergeMeta(parsedMeta, extraMeta);

        const attachmentId = await this._insertAttachmentRow({
          ownerType,
          ownerId,
          uploadedBy,
          originalName: normalizedName,
          mimeType: mimeType || guessMimeType(normalizedName),
          sizeBytes: stat.size,
          storageName: existing.storage_name,
          hash,
          thumbnailStorageName: existing.thumbnail_storage_name,
          meta: mergedMeta,
          status: 'ok',
          folderId
        });

        return { id: attachmentId, deduped: true };
      }

      // 3) 新内容：读入 buffer 交给 ingestBuffer 处理（含缩略图/入库）
      const buffer = await fsp.readFile(filePath);
      return this.ingestBuffer({
        uploadedBy,
        ownerType,
        ownerId,
        folderId,
        originalName: normalizedName,
        mimeType,
        buffer,
        extraMeta
      });
    };

    if (hash) {
      const lockKey = computeSha256FromBuffer(
        Buffer.from(`attachments:ingest|${hash}|${ownerType || 'null'}|${ownerId ?? 'null'}`)
      );
      return this._withMySqlLock(lockKey, run);
    }

    return run();
  }

  async ingestBuffersWithQueue(items) {
    const results = [];
    for (const item of items) {
      const result = await this.queue.enqueue(() => this.ingestBuffer(item));
      results.push(result);
    }
    return results;
  }

  /**
   * 获取附件的引用列表
   * 返回引用该附件的文物和聊天记录
   * @param {number} attachmentId - 附件ID
   * @returns {Promise<Object>} 引用信息 { artifacts: [], chats: [] }
   */
  async listReferences(attachmentId) {
    const results = {
      artifacts: [],
      chats: [],
      total: 0
    };

    // 1. 查询 attachment_refs 表中的引用（如果存在）
    try {
      const [refRows] = await mysqlPool.execute(
        `SELECT ar.owner_type, ar.owner_id, ar.relation_type, ar.created_at
         FROM attachment_refs ar
         WHERE ar.attachment_id = ?
         ORDER BY ar.created_at DESC`,
        [attachmentId]
      );

      for (const ref of refRows) {
        if (ref.owner_type === 'artifact') {
          // 获取文物信息
          const [artifactRows] = await mysqlPool.execute(
            'SELECT id, name, category, era FROM artifacts WHERE id = ?',
            [ref.owner_id]
          );
          if (artifactRows.length > 0) {
            results.artifacts.push({
              id: artifactRows[0].id,
              name: artifactRows[0].name,
              category: artifactRows[0].category,
              era: artifactRows[0].era,
              relationType: ref.relation_type,
              linkedAt: ref.created_at
            });
          }
        } else if (ref.owner_type === 'chat') {
          // 获取聊天记录信息
          const [chatRows] = await mysqlPool.execute(
            'SELECT id, user_id, created_at FROM chats WHERE id = ?',
            [ref.owner_id]
          );
          if (chatRows.length > 0) {
            results.chats.push({
              id: chatRows[0].id,
              userId: chatRows[0].user_id,
              createdAt: chatRows[0].created_at,
              relationType: ref.relation_type,
              linkedAt: ref.created_at
            });
          }
        }
      }
    } catch (err) {
      // attachment_refs 表可能不存在，尝试其他方式
    }

    // 2. 从 attachments 表的 owner_type/owner_id 查询
    try {
      const [attachmentRow] = await mysqlPool.execute(
        'SELECT owner_type, owner_id FROM attachments WHERE id = ?',
        [attachmentId]
      );

      if (attachmentRow.length > 0 && attachmentRow[0].owner_type && attachmentRow[0].owner_id) {
        const ownerType = attachmentRow[0].owner_type;
        const ownerId = attachmentRow[0].owner_id;

        if (ownerType === 'artifact') {
          // 检查是否已经在 artifacts 列表中
          const exists = results.artifacts.some(a => a.id === ownerId);
          if (!exists) {
            const [artifactRows] = await mysqlPool.execute(
              'SELECT id, name, category, era FROM artifacts WHERE id = ?',
              [ownerId]
            );
            if (artifactRows.length > 0) {
              results.artifacts.push({
                id: artifactRows[0].id,
                name: artifactRows[0].name,
                category: artifactRows[0].category,
                era: artifactRows[0].era,
                relationType: 'owner',
                linkedAt: null
              });
            }
          }
        } else if (ownerType === 'chat') {
          const exists = results.chats.some(c => c.id === ownerId);
          if (!exists) {
            const [chatRows] = await mysqlPool.execute(
              'SELECT id, user_id, created_at FROM chats WHERE id = ?',
              [ownerId]
            );
            if (chatRows.length > 0) {
              results.chats.push({
                id: chatRows[0].id,
                userId: chatRows[0].user_id,
                createdAt: chatRows[0].created_at,
                relationType: 'owner',
                linkedAt: null
              });
            }
          }
        }
      }
    } catch (err) {
      // 忽略错误
    }

    // 3. 查询 artifacts 表中 image_url 包含该附件的记录
    try {
      const [attachmentInfo] = await mysqlPool.execute(
        'SELECT id FROM attachments WHERE id = ?',
        [attachmentId]
      );
      
      if (attachmentInfo.length > 0) {
        // 搜索 image_url 包含附件下载链接的文物
        const downloadUrl = `/api/attachments/${attachmentId}/download`;
        const [artifactRows] = await mysqlPool.execute(
          'SELECT id, name, category, era FROM artifacts WHERE image_url LIKE ?',
          [`%${downloadUrl}%`]
        );
        
        for (const artifact of artifactRows) {
          const exists = results.artifacts.some(a => a.id === artifact.id);
          if (!exists) {
            results.artifacts.push({
              id: artifact.id,
              name: artifact.name,
              category: artifact.category,
              era: artifact.era,
              relationType: 'image_url',
              linkedAt: null
            });
          }
        }
      }
    } catch (err) {
      // 忽略错误
    }

    results.total = results.artifacts.length + results.chats.length;
    return results;
  }
}

module.exports = {
  AttachmentService,
  guessMimeType,
  normalizeOriginalName
};
