const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');

const { mysqlPool } = require('../config/database');
const { exportKnowledgeGraphXlsxBuffer, importKnowledgeGraphFromXlsxBuffer } = require('../services/excel-kg.service');
const { AttachmentService, guessMimeType, normalizeOriginalName } = require('../services/core/attachment.service');
const { IntegrityService, parseBool } = require('../services/integrity.service');
const { getStorageDriver } = require('../services/storage');
const { writeAuditLog } = require('../services/audit.service');
const { createLogger } = require('../utils/logger');

const router = express.Router();
const logger = createLogger('AttachmentRoutes');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const RESOLVED_UPLOAD_DIR = path.resolve(UPLOAD_DIR);
const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 20);
const MAX_UPLOAD_SIZE_BYTES = Math.max(1, MAX_UPLOAD_SIZE_MB) * 1024 * 1024;

const ensureUploadDir = async () => {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadDir()
      .then(() => cb(null, UPLOAD_DIR))
      .catch((error) => cb(error));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 20);
    const random = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}_${random}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES
  }
});

const isAdmin = (req) => req.user && req.user.role === 'admin';

// 读取权限：所有已登录用户可见
const canReadAttachment = (req, attachmentRow) => Boolean(req.user && attachmentRow);

// 删除权限：管理员可删除任何文件；普通用户可删除自己上传的文件（特别是资产库文件）
const canDeleteAttachment = (req, attachmentRow) => {
  if (!req.user) return false;
  if (isAdmin(req)) return true;
  // 普通用户可删除自己上传的文件或资产库中的文件
  if (attachmentRow && attachmentRow.uploaded_by === req.user.id) return true;
  return false;
};

const writeLog = writeAuditLog;

const attachmentService = new AttachmentService();
const integrityService = new IntegrityService();
const storageDriver = getStorageDriver();

let _attachmentsHasMeta = null;
const ensureAttachmentsHasMeta = async () => {
  if (_attachmentsHasMeta !== null) {
    return _attachmentsHasMeta;
  }
  try {
    const [rows] = await mysqlPool.execute("SHOW COLUMNS FROM attachments LIKE 'meta'");
    _attachmentsHasMeta = Boolean(rows && rows.length);
  } catch {
    _attachmentsHasMeta = false;
  }
  return _attachmentsHasMeta;
};

const createAttachmentFromBuffer = async ({
  userId,
  ownerType,
  ownerId,
  originalName,
  mimeType,
  buffer
}) => {
  await ensureUploadDir();

  const ext = path.extname(originalName || '').slice(0, 20) || '.bin';
  const random = crypto.randomBytes(16).toString('hex');
  const storageName = `${Date.now()}_${random}${ext}`;

  const filePath = path.resolve(UPLOAD_DIR, storageName);
  if (!filePath.startsWith(RESOLVED_UPLOAD_DIR + path.sep)) {
    throw new Error('非法文件路径');
  }

  await fsp.writeFile(filePath, buffer);

  const [result] = await mysqlPool.execute(
    `INSERT INTO attachments (owner_type, owner_id, uploaded_by, original_name, mime_type, size_bytes, storage_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerType,
      ownerId,
      userId,
      originalName,
      mimeType,
      buffer.length,
      storageName,
      new Date()
    ]
  );

  const attachmentId = result.insertId;

  return {
    id: attachmentId,
    ownerType,
    ownerId,
    uploadedBy: userId,
    originalName,
    mimeType,
    sizeBytes: buffer.length,
    createdAt: new Date().toISOString(),
    downloadUrl: `/api/attachments/${attachmentId}/download`
  };
};

/**
 * @swagger
 * /api/attachments/upload:
 *   post:
 *     summary: 上传附件
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               ownerType:
 *                 type: string
 *                 description: 关联对象类型（可选，例如 artifact/chat）
 *               ownerId:
 *                 type: integer
 *                 description: 关联对象ID（可选）
 *     responses:
 *       201:
 *         description: 上传成功
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: '权限不足：仅管理员可上传附件' });
    }

    if (!req.file) {
      return res.status(400).json({ message: '未找到上传文件' });
    }

    const ownerType = req.body.ownerType ? String(req.body.ownerType).trim() : null;
    const ownerId = req.body.ownerId !== undefined && req.body.ownerId !== null && String(req.body.ownerId).trim() !== ''
      ? Number(req.body.ownerId)
      : null;
    const folderId = req.body.folderId !== undefined && req.body.folderId !== null && String(req.body.folderId).trim() !== ''
      ? Number(req.body.folderId)
      : null;

    if (ownerType && ownerType.length > 50) {
      return res.status(400).json({ message: 'ownerType过长' });
    }
    if (ownerId !== null && !Number.isFinite(ownerId)) {
      return res.status(400).json({ message: 'ownerId无效' });
    }
    if (folderId !== null && !Number.isFinite(folderId)) {
      return res.status(400).json({ message: 'folderId无效' });
    }

    // 统一走附件处理逻辑（hash/缩略图/去重）
    const result = await attachmentService.ingestLocalFile({
      uploadedBy: req.user.id,
      ownerType,
      ownerId,
      folderId,
      filePath: req.file.path,
      originalName: normalizeOriginalName(req.file.originalname),
      mimeType: req.file.mimetype || 'application/octet-stream'
    });

    const attachmentId = result.id;

    await writeLog({
      userId: req.user.id,
      action: 'upload_attachment',
      targetId: attachmentId,
      details: JSON.stringify({
        ownerType,
        ownerId,
        originalName: normalizeOriginalName(req.file.originalname),
        mimeType: req.file.mimetype || 'application/octet-stream',
        sizeBytes: req.file.size
      })
    });

    return res.status(201).json({
      id: attachmentId,
      ownerType,
      ownerId,
      originalName: normalizeOriginalName(req.file.originalname),
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      createdAt: new Date().toISOString(),
      downloadUrl: `/api/attachments/${attachmentId}/download`
    });
  } catch (error) {
    logger.error('上传附件错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/bulk:
 *   post:
 *     summary: 批量上传 ZIP（仅 Admin）
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               ownerType:
 *                 type: string
 *               ownerId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: 返回导入结果（每个文件对应的 attachmentId）
 */
router.post('/bulk', upload.single('file'), async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: '权限不足：仅管理员可批量上传附件' });
    }

    if (!req.file) {
      return res.status(400).json({ message: '未找到上传文件' });
    }

    const ownerType = req.body.ownerType ? String(req.body.ownerType).trim() : null;
    const ownerId = req.body.ownerId !== undefined && req.body.ownerId !== null && String(req.body.ownerId).trim() !== ''
      ? Number(req.body.ownerId)
      : null;

    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (ext !== '.zip') {
      return res.status(400).json({ message: '仅支持上传 .zip 文件' });
    }

    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries().filter(e => !e.isDirectory);

    const maxEntries = Number(process.env.ATTACHMENT_ZIP_MAX_ENTRIES || 2000);
    if (entries.length > maxEntries) {
      return res.status(400).json({ message: `ZIP 文件条目过多（>${maxEntries}）` });
    }

    const results = [];
    for (const entry of entries) {
      const entryName = entry.entryName || '';
      if (!entryName || entryName.startsWith('__MACOSX/')) {
        continue;
      }

      const relativePath = String(entryName)
        .replace(/\\/g, '/')
        .replace(/^\.\/?/, '')
        .trim();

      const baseName = normalizeOriginalName(path.basename(entryName));
      const entryExt = path.extname(baseName).toLowerCase();
      if (!entryExt) {
        continue;
      }

      const buffer = entry.getData();
      const mimeType = guessMimeType(baseName);

      try {
        const { id, deduped } = await attachmentService.ingestBuffer({
          uploadedBy: req.user.id,
          ownerType,
          ownerId,
          originalName: baseName,
          mimeType,
          buffer,
          extraMeta: relativePath
            ? {
              source: {
                relativePath
              }
            }
            : null
        });
        results.push({ filename: baseName, attachmentId: id, deduped });
      } catch (err) {
        results.push({ filename: baseName, error: err.message });
      }
    }

    await writeLog({
      userId: req.user.id,
      action: 'bulk_upload_attachments',
      targetId: null,
      details: JSON.stringify({
        originalName: req.file.originalname,
        count: results.length,
        ownerType,
        ownerId
      })
    });

    return res.status(200).json({
      message: '批量上传完成',
      data: results
    });
  } catch (error) {
    logger.error('批量上传附件错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/import-dir:
 *   post:
 *     summary: 从服务器目录导入图片（仅 Admin，白名单）
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 */
router.post('/import-dir', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: '权限不足：仅管理员可导入' });
    }

    const dir = req.body && req.body.dir ? String(req.body.dir).trim() : '';
    const ownerType = req.body && req.body.ownerType ? String(req.body.ownerType).trim() : null;
    const ownerId = req.body && req.body.ownerId !== undefined && req.body.ownerId !== null && String(req.body.ownerId).trim() !== ''
      ? Number(req.body.ownerId)
      : null;

    const resolvedDir = storageDriver.assertImportDirAllowed(dir);
    const files = await storageDriver.listFilesRecursive(resolvedDir);
    const imageFiles = files.filter(p => {
      const ext = path.extname(p).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'].includes(ext);
    });

    const envMaxFiles = Number(process.env.ATTACHMENT_IMPORT_MAX_FILES || 5000);
    const bodyMaxFilesRaw = req.body && req.body.maxFiles !== undefined && req.body.maxFiles !== null ? Number(req.body.maxFiles) : null;
    const resolvedMaxFiles = Number.isFinite(bodyMaxFilesRaw) && bodyMaxFilesRaw > 0
      ? Math.min(Math.floor(bodyMaxFilesRaw), envMaxFiles)
      : envMaxFiles;

    const sliced = imageFiles.slice(0, resolvedMaxFiles);
    const results = [];

    for (const fp of sliced) {
      const originalName = path.basename(fp);
      try {
        const relativePath = path
          .relative(resolvedDir, fp)
          .split(path.sep)
          .join('/');
        const { id, deduped } = await attachmentService.ingestLocalFile({
          uploadedBy: req.user.id,
          ownerType,
          ownerId,
          filePath: fp,
          originalName,
          mimeType: guessMimeType(originalName),
          extraMeta: {
            source: {
              relativePath
            }
          }
        });
        results.push({ filePath: fp, attachmentId: id, deduped });
      } catch (err) {
        results.push({ filePath: fp, error: err.message });
      }
    }

    await writeLog({
      userId: req.user.id,
      action: 'import_dir_attachments',
      targetId: null,
      details: JSON.stringify({ dir: resolvedDir, count: results.length, ownerType, ownerId })
    });

    return res.status(200).json({
      message: '目录导入完成',
      totalFiles: imageFiles.length,
      processed: sliced.length,
      maxFiles: resolvedMaxFiles,
      data: results
    });
  } catch (error) {
    logger.error('目录导入附件错误:', error);
    return res.status(500).json({ message: error.message || '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/integrity:
 *   get:
 *     summary: 悬空图片检测（红/黄）
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 */
router.get('/integrity', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: '权限不足：仅管理员可查看完整性报告' });
    }

    const includeFiles = parseBool(req.query.includeFiles, false);
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : 200;
    const report = await integrityService.getReport({ includeFileExistence: includeFiles, limit });
    return res.status(200).json(report);
  } catch (error) {
    logger.error('完整性检测错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/excel/link-import:
 *   post:
 *     summary: 从 Excel 导入文物-图片关联（仅 Admin）
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 */
router.post('/excel/link-import', upload.single('file'), async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: '权限不足：仅管理员可导入关联Excel' });
    }
    if (!req.file) {
      return res.status(400).json({ message: '请上传Excel文件' });
    }

    const buffer = await fsp.readFile(req.file.path);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'artifactattachments') || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    let linked = 0;
    const errors = [];

    for (const row of rows) {
      const rawArtifactId = row.artifact_id ?? row.artifactId ?? row.owner_id ?? row.ownerId;
      const artifactId = rawArtifactId !== undefined && rawArtifactId !== null && String(rawArtifactId).trim() !== ''
        ? Number(rawArtifactId)
        : null;
      const refCell = row.file_reference ?? row.fileReference ?? row.attachment ?? row.attachments ?? '';

      if (!artifactId || !Number.isFinite(artifactId)) {
        continue;
      }

      const refs = String(refCell)
        .split(/[,;，；\n\r\t]+/)
        .map(s => s.trim())
        .filter(Boolean);

      for (const ref of refs) {
        try {
          let attachmentId = null;
          if (/^\d+$/.test(ref)) {
            attachmentId = Number(ref);
          } else {
            const hasMeta = await ensureAttachmentsHasMeta();
            if (hasMeta) {
              const [aRows] = await mysqlPool.execute(
                `SELECT id
                 FROM attachments
                 WHERE original_name = ?
                    OR JSON_UNQUOTE(JSON_EXTRACT(meta, '$.source.relativePath')) = ?
                 ORDER BY id DESC
                 LIMIT 1`,
                [ref, ref]
              );
              attachmentId = aRows && aRows[0] ? aRows[0].id : null;
            } else {
              const [aRows] = await mysqlPool.execute(
                'SELECT id FROM attachments WHERE original_name = ? ORDER BY id DESC LIMIT 1',
                [ref]
              );
              attachmentId = aRows && aRows[0] ? aRows[0].id : null;
            }
          }

          if (!attachmentId) {
            errors.push({ artifactId, ref, error: '未找到对应附件' });
            continue;
          }

          await mysqlPool.execute(
            `INSERT IGNORE INTO attachment_refs (attachment_id, owner_type, owner_id, relation_type)
             VALUES (?, 'artifact', ?, 'image')`,
            [attachmentId, artifactId]
          );
          linked += 1;
        } catch (err) {
          errors.push({ artifactId, ref, error: err.message });
        }
      }
    }

    await writeLog({
      userId: req.user.id,
      action: 'import_attachment_links_excel',
      targetId: null,
      details: JSON.stringify({ sheet: sheetName, linked, errorCount: errors.length })
    });

    return res.status(200).json({ message: '导入完成', linked, errors });
  } catch (error) {
    logger.error('导入关联Excel错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments:
 *   get:
 *     summary: 获取附件列表（支持分页与过滤）
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码（从 1 开始）
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: 每页条数（默认 50）
 *       - in: query
 *         name: ownerType
 *         schema:
 *           type: string
 *         description: 关联对象类型（可选）
 *       - in: query
 *         name: ownerId
 *         schema:
 *           type: integer
 *         description: 关联对象ID（可选）
 *     responses:
 *       200:
 *         description: 返回附件列表（data + meta）
 *       400:
 *         description: 参数无效
 *       401:
 *         description: 未登录
 */
router.get('/', async (req, res) => {
  try {
    const ownerType = req.query.ownerType ? String(req.query.ownerType).trim() : null;
    const ownerId = req.query.ownerId !== undefined && req.query.ownerId !== null && String(req.query.ownerId).trim() !== ''
      ? Number(req.query.ownerId)
      : null;

    const rawPage = req.query.page !== undefined ? Number(req.query.page) : 1;
    const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : 50;
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : null;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : null;

    if (page === null) {
      return res.status(400).json({ message: 'page无效' });
    }
    if (limit === null) {
      return res.status(400).json({ message: 'limit无效' });
    }

    if (ownerType && ownerType.length > 50) {
      return res.status(400).json({ message: 'ownerType过长' });
    }
    if (ownerId !== null && !Number.isFinite(ownerId)) {
      return res.status(400).json({ message: 'ownerId无效' });
    }

    let whereSql = 'WHERE 1=1';
    const whereParams = [];

    if (ownerType) {
      whereSql += ' AND owner_type = ?';
      whereParams.push(ownerType);
    }
    if (ownerId !== null) {
      whereSql += ' AND owner_id = ?';
      whereParams.push(ownerId);
    }

    const [countRows] = await mysqlPool.execute(
      `SELECT COUNT(*) AS total FROM attachments ${whereSql}`,
      whereParams
    );
    const total = Number(countRows?.[0]?.total || 0);
    const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * limit;

    // NOTE: MySQL prepared statements can be picky about parameter markers in LIMIT/OFFSET.
    // limit/offset are validated integers, so we safely inline them.
    const pagedSql =
      `SELECT id, owner_type, owner_id, uploaded_by, original_name, mime_type, size_bytes, created_at
       FROM attachments
       ${whereSql}
       ORDER BY id DESC
       LIMIT ${limit} OFFSET ${offset}`;

    const [rows] = await mysqlPool.execute(pagedSql, whereParams);
    return res.status(200).json({
      data: rows.map(row => ({
        id: row.id,
        ownerType: row.owner_type,
        ownerId: row.owner_id,
        uploadedBy: row.uploaded_by,
        originalName: row.original_name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
        downloadUrl: `/api/attachments/${row.id}/download`
      })),
      meta: {
        total,
        page: safePage,
        limit,
        totalPages
      }
    });
  } catch (error) {
    logger.error('获取附件列表错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/excel/export:
 *   post:
 *     summary: 导出知识图谱 Excel（移自 Debug，生成附件，仅 Admin）
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: 导出成功（返回生成的附件元数据）
 *       403:
 *         description: 权限不足（仅管理员可导出）
 */
router.post('/excel/export', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: '权限不足：仅管理员可导出Excel' });
    }

    const { buffer, filename } = await exportKnowledgeGraphXlsxBuffer();

    const attachment = await createAttachmentFromBuffer({
      userId: req.user.id,
      ownerType: 'system_export',
      ownerId: 0,
      originalName: filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer
    });

    return res.status(201).json(attachment);
  } catch (error) {
    logger.error('导出Excel错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/{id}/excel/import:
 *   post:
 *     summary: 从附件触发知识图谱 Excel 导入（移自 Debug，仅 Admin）
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: strategy
 *         schema:
 *           type: string
 *           default: append
 *           enum: [append, overwrite]
 *         description: 导入策略（默认 append：仅新增；overwrite：全量覆盖）
 *     responses:
 *       200:
 *         description: 导入成功
 *       400:
 *         description: 参数无效/Excel schema 不匹配
 *       403:
 *         description: 权限不足（仅管理员可导入）
 *       404:
 *         description: 附件不存在
 */
router.post('/:id/excel/import', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: '权限不足：仅管理员可导入Excel' });
    }

    const attachmentId = Number(req.params.id);
    if (!Number.isFinite(attachmentId)) {
      return res.status(400).json({ message: '附件ID无效' });
    }

    const [rows] = await mysqlPool.execute('SELECT * FROM attachments WHERE id = ?', [attachmentId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: '附件不存在' });
    }

    const attachment = rows[0];
    if (attachment.owner_type !== 'system_import') {
      return res.status(400).json({ message: '该附件不是 system_import 类型，无法触发导入' });
    }

    const filePath = path.resolve(UPLOAD_DIR, attachment.storage_name);
    if (!filePath.startsWith(RESOLVED_UPLOAD_DIR + path.sep)) {
      return res.status(400).json({ message: '非法文件路径' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: '文件不存在或已被删除' });
    }

    const buffer = await fsp.readFile(filePath);
    const strategy = req.query.strategy ? String(req.query.strategy).trim() : 'append';

    try {
      const result = await importKnowledgeGraphFromXlsxBuffer({ buffer, strategy });
      return res.status(200).json({
        message: '导入成功',
        ...result,
        neo4jSynced: true
      });
    } catch (err) {
      if (err && err.statusCode === 400) {
        return res.status(400).json({
          message: err.message,
          issues: err.issues
        });
      }
      throw err;
    }
  } catch (error) {
    logger.error('导入Excel错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/{id}/references:
 *   get:
 *     summary: 获取附件的引用列表
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 返回引用该附件的文物和聊天记录列表
 *       404:
 *         description: 附件不存在
 */
router.get('/:id/references', async (req, res) => {
  try {
    const attachmentId = Number(req.params.id);
    if (!Number.isFinite(attachmentId)) {
      return res.status(400).json({ message: '附件ID无效' });
    }

    // 验证附件存在
    const [rows] = await mysqlPool.execute('SELECT id FROM attachments WHERE id = ?', [attachmentId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: '附件不存在' });
    }

    const references = await attachmentService.listReferences(attachmentId);
    return res.status(200).json(references);
  } catch (error) {
    logger.error('获取附件引用错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/{id}:
 *   get:
 *     summary: 获取单个附件元数据
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 返回附件元数据
 *       404:
 *         description: 附件不存在
 */
router.get('/:id', async (req, res) => {
  try {
    const attachmentId = Number(req.params.id);
    if (!Number.isFinite(attachmentId)) {
      return res.status(400).json({ message: '附件ID无效' });
    }

    const [rows] = await mysqlPool.execute('SELECT * FROM attachments WHERE id = ?', [attachmentId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: '附件不存在' });
    }

    const attachment = rows[0];
    if (!canReadAttachment(req, attachment)) {
      return res.status(403).json({ message: '无权访问此附件' });
    }

    return res.status(200).json({
      id: attachment.id,
      ownerType: attachment.owner_type,
      ownerId: attachment.owner_id,
      uploadedBy: attachment.uploaded_by,
      originalName: attachment.original_name,
      mimeType: attachment.mime_type,
      sizeBytes: attachment.size_bytes,
      createdAt: attachment.created_at,
      downloadUrl: `/api/attachments/${attachment.id}/download`
    });
  } catch (error) {
    logger.error('获取附件元数据错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/{id}/thumbnail:
 *   get:
 *     summary: 获取附件缩略图
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: size
 *         schema:
 *           type: string
 *           enum: [small, medium, large]
 *           default: small
 *         description: 缩略图大小
 *     responses:
 *       200:
 *         description: 返回缩略图
 *       404:
 *         description: 附件或缩略图不存在
 */
router.get('/:id/thumbnail', async (req, res) => {
  try {
    const attachmentId = Number(req.params.id);
    if (!Number.isFinite(attachmentId)) {
      return res.status(400).json({ message: '附件ID无效' });
    }

    const [rows] = await mysqlPool.execute('SELECT * FROM attachments WHERE id = ?', [attachmentId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: '附件不存在' });
    }

    const attachment = rows[0];
    if (!canReadAttachment(req, attachment)) {
      return res.status(403).json({ message: '无权访问此附件' });
    }

    // 获取缩略图大小参数
    const size = req.query.size || 'small';
    const sizeMap = { small: 200, medium: 800, large: 1200 };
    const thumbSize = sizeMap[size] || sizeMap.small;

    let thumbnail_name = null;

    // 优先从 meta.thumbnails 获取
    try {
      if (attachment.meta) {
        const meta = typeof attachment.meta === 'string' ? JSON.parse(attachment.meta) : attachment.meta;
        if (meta && meta.thumbnails) {
          if (size === 'small' && meta.thumbnails.small) {
            thumbnail_name = meta.thumbnails.small;
          } else if (size === 'medium' && meta.thumbnails.medium) {
            thumbnail_name = meta.thumbnails.medium;
          }
        }
      }
    } catch (err) {
      // meta 解析失败，继续
    }

    // 备选：使用 thumbnail_storage_name
    if (!thumbnail_name && size === 'small') {
      thumbnail_name = attachment.thumbnail_storage_name;
    }

    if (!thumbnail_name) {
      // 如果是图片且没有缩略图，返回原始文件
      if (attachment.mime_type && attachment.mime_type.startsWith('image/')) {
        const filePath = path.resolve(UPLOAD_DIR, attachment.storage_name);
        if (!filePath.startsWith(RESOLVED_UPLOAD_DIR + path.sep)) {
          return res.status(400).json({ message: '非法文件路径' });
        }
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ message: '文件不存在或已被删除' });
        }
        return res.sendFile(filePath);
      }
      return res.status(404).json({ message: '该附件没有缩略图' });
    }

    const thumbPath = path.resolve(UPLOAD_DIR, thumbnail_name);
    if (!thumbPath.startsWith(RESOLVED_UPLOAD_DIR + path.sep)) {
      return res.status(400).json({ message: '非法文件路径' });
    }

    if (!fs.existsSync(thumbPath)) {
      // 缩略图不存在，返回原始文件作为备选
      if (attachment.mime_type && attachment.mime_type.startsWith('image/')) {
        const filePath = path.resolve(UPLOAD_DIR, attachment.storage_name);
        if (!filePath.startsWith(RESOLVED_UPLOAD_DIR + path.sep)) {
          return res.status(400).json({ message: '非法文件路径' });
        }
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ message: '文件不存在或已被删除' });
        }
        return res.sendFile(filePath);
      }
      return res.status(404).json({ message: '缩略图不存在或已被删除' });
    }

    return res.sendFile(thumbPath);
  } catch (error) {
    logger.error('获取缩略图错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/{id}/download:
 *   get:
 *     summary: 下载附件
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 返回文件流
 */
router.get('/:id/download', async (req, res) => {
  try {
    const attachmentId = Number(req.params.id);
    if (!Number.isFinite(attachmentId)) {
      return res.status(400).json({ message: '附件ID无效' });
    }

    const [rows] = await mysqlPool.execute('SELECT * FROM attachments WHERE id = ?', [attachmentId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: '附件不存在' });
    }

    const attachment = rows[0];
    if (!canReadAttachment(req, attachment)) {
      return res.status(403).json({ message: '无权访问此附件' });
    }

    const filename = attachment.storage_name;
    const filePath = path.resolve(UPLOAD_DIR, filename);

    // 确保路径不越界
    if (!filePath.startsWith(RESOLVED_UPLOAD_DIR + path.sep)) {
      return res.status(400).json({ message: '非法文件路径' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: '文件不存在或已被删除' });
    }

    return res.download(filePath, attachment.original_name);
  } catch (error) {
    logger.error('下载附件错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/batch-delete:
 *   post:
 *     summary: 批量删除附件
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: 批量删除成功
 */
router.post('/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: '请提供有效的附件ID列表' });
    }
    
    if (ids.length > 100) {
      return res.status(400).json({ message: '单次最多删除100个文件' });
    }

    const validIds = ids.filter(id => Number.isFinite(Number(id))).map(Number);
    if (validIds.length === 0) {
      return res.status(400).json({ message: '未找到有效的附件ID' });
    }

    // 获取所有附件
    const placeholders = validIds.map(() => '?').join(',');
    const [rows] = await mysqlPool.execute(
      `SELECT * FROM attachments WHERE id IN (${placeholders})`,
      validIds
    );

    // 检查权限
    const deletableRows = rows.filter(row => canDeleteAttachment(req, row));
    if (deletableRows.length === 0) {
      return res.status(403).json({ message: '无权删除所选文件' });
    }

    let successCount = 0;
    let failedCount = 0;

    for (const attachment of deletableRows) {
      try {
        // 检查引用
        try {
          const [refRows] = await mysqlPool.execute(
            'SELECT COUNT(*) AS cnt FROM attachment_refs WHERE attachment_id = ?',
            [attachment.id]
          );
          if (Number(refRows?.[0]?.cnt || 0) > 0) {
            failedCount++;
            continue;
          }
        } catch (err) {
          // attachment_refs 可能尚未迁移，忽略
        }

        // 删除文件
        const filePath = path.resolve(UPLOAD_DIR, attachment.storage_name);
        if (filePath.startsWith(RESOLVED_UPLOAD_DIR + path.sep) && fs.existsSync(filePath)) {
          try {
            await fsp.unlink(filePath);
          } catch (err) {
            logger.warn('删除文件失败:', err.message);
          }
        }

        // 删除数据库记录
        await mysqlPool.execute('DELETE FROM attachments WHERE id = ?', [attachment.id]);

        await writeLog({
          userId: req.user.id,
          action: 'delete_attachment',
          targetId: attachment.id,
          details: JSON.stringify({
            originalName: attachment.original_name,
            batchDelete: true
          })
        });

        successCount++;
      } catch (err) {
        logger.error(`删除附件 ${attachment.id} 失败:`, err);
        failedCount++;
      }
    }

    return res.json({
      message: `成功删除 ${successCount} 个文件，失败 ${failedCount} 个`,
      successCount,
      failedCount
    });
  } catch (error) {
    logger.error('批量删除附件错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/{id}:
 *   delete:
 *     summary: 删除附件
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 删除成功
 */
router.delete('/:id', async (req, res) => {
  try {
    const attachmentId = Number(req.params.id);
    if (!Number.isFinite(attachmentId)) {
      return res.status(400).json({ message: '附件ID无效' });
    }

    const [rows] = await mysqlPool.execute('SELECT * FROM attachments WHERE id = ?', [attachmentId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: '附件不存在' });
    }

    const attachment = rows[0];
    if (!canDeleteAttachment(req, attachment)) {
      return res.status(403).json({ message: '权限不足：仅管理员或文件上传者可删除' });
    }

    try {
      const [refRows] = await mysqlPool.execute(
        'SELECT COUNT(*) AS cnt FROM attachment_refs WHERE attachment_id = ?',
        [attachmentId]
      );
      const cnt = Number(refRows?.[0]?.cnt || 0);
      if (cnt > 0) {
        return res.status(409).json({ message: '该附件已被引用，无法删除（请先解除引用）' });
      }
    } catch (err) {
      // attachment_refs 可能尚未迁移，忽略
    }

    const filePath = path.resolve(UPLOAD_DIR, attachment.storage_name);
    if (filePath.startsWith(RESOLVED_UPLOAD_DIR + path.sep) && fs.existsSync(filePath)) {
      try {
        await fsp.unlink(filePath);
      } catch (err) {
        logger.warn('删除文件失败，继续删除数据库记录:', err.message);
      }
    }

    await mysqlPool.execute('DELETE FROM attachments WHERE id = ?', [attachmentId]);

    await writeLog({
      userId: req.user.id,
      action: 'delete_attachment',
      targetId: attachmentId,
      details: JSON.stringify({
        ownerType: attachment.owner_type,
        ownerId: attachment.owner_id,
        originalName: attachment.original_name,
        storageName: attachment.storage_name
      })
    });

    return res.status(200).json({ message: '删除成功' });
  } catch (error) {
    logger.error('删除附件错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/attachments/bulk/tags:
 *   post:
 *     summary: 批量添加或移除标签
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - attachmentIds
 *               - tagIds
 *               - action
 *             properties:
 *               attachmentIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: 附件ID列表
 *               tagIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: 标签ID列表
 *               action:
 *                 type: string
 *                 enum: [add, remove]
 *                 description: 操作类型
 *     responses:
 *       200:
 *         description: 操作成功
 *       400:
 *         description: 参数无效
 *       403:
 *         description: 权限不足
 */
router.post('/bulk/tags', async (req, res) => {
  try {
    const { attachmentIds, tagIds, action } = req.body;

    if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
      return res.status(400).json({ message: '请提供附件ID列表' });
    }
    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      return res.status(400).json({ message: '请提供标签ID列表' });
    }
    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({ message: '操作类型无效，必须是 add 或 remove' });
    }

    // 动态导入避免循环依赖
    const tagService = require('../services/tag.service');

    let result;
    if (action === 'add') {
      result = await tagService.bulkAddTags(attachmentIds, tagIds, req.user.id);
    } else {
      result = await tagService.bulkRemoveTags(attachmentIds, tagIds);
    }

    await writeLog({
      userId: req.user.id,
      action: `bulk_${action}_tags`,
      targetId: null,
      details: JSON.stringify({
        attachmentIds,
        tagIds,
        result: result.message
      })
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ message: error.message });
    }
    logger.error('批量标签操作错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;
