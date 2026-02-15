const fs = require('fs');
const path = require('path');

const { mysqlPool } = require('../../config/database');
const { getStorageDriver } = require('../infra/storage');

const DEFAULT_EXCLUDED_OWNER_TYPES = new Set(['system_export', 'system_import']);

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  const s = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', '是'].includes(s);
};

const safeParseJson = (value) => {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
};

class IntegrityService {
  constructor({ storageDriver = null } = {}) {
    this.storage = storageDriver || getStorageDriver();
  }

  async getReport({ includeFileExistence = false, limit = 200 } = {}) {
    const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(5000, Number(limit))) : 200;

    let missingRows = [];
    let orphanRows = [];

    try {
      // Red-1: ref points to missing attachment row
      const [rows] = await mysqlPool.execute(
        `SELECT r.id AS ref_id, r.owner_type, r.owner_id, r.attachment_id
         FROM attachment_refs r
         LEFT JOIN attachments a ON a.id = r.attachment_id
         WHERE a.id IS NULL
         ORDER BY r.id DESC
         LIMIT ?`,
        [safeLimit]
      );
      missingRows = rows || [];
    } catch (err) {
      // 表不存在时：返回空报告（等迁移后生效）
      if (!(err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146))) {
        throw err;
      }
    }

    try {
      // Yellow: attachments not referenced by any ref (exclude some system types)
      const excluded = Array.from(DEFAULT_EXCLUDED_OWNER_TYPES);
      const [rows] = await mysqlPool.execute(
        `SELECT a.id, a.owner_type, a.owner_id, a.original_name, a.storage_name, a.thumbnail_storage_name, a.status, a.created_at
         FROM attachments a
         LEFT JOIN attachment_refs r ON r.attachment_id = a.id
         WHERE r.id IS NULL
           AND (a.owner_type IS NULL OR a.owner_type NOT IN (${excluded.map(() => '?').join(',')}))
         ORDER BY a.id DESC
         LIMIT ?`,
        [...excluded, safeLimit]
      );
      orphanRows = rows || [];
    } catch (err) {
      if (!(err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146))) {
        throw err;
      }
    }

    const report = {
      missingReferences: missingRows.map(r => ({
        refId: r.ref_id,
        ownerType: r.owner_type,
        ownerId: r.owner_id,
        attachmentId: r.attachment_id
      })),
      orphanAttachments: orphanRows.map(a => ({
        id: a.id,
        ownerType: a.owner_type,
        ownerId: a.owner_id,
        originalName: a.original_name,
        storageName: a.storage_name,
        thumbnailStorageName: a.thumbnail_storage_name,
        status: a.status,
        createdAt: a.created_at
      }))
    };

    if (includeFileExistence) {
      const [rows] = await mysqlPool.execute(
        `SELECT id, storage_name, thumbnail_storage_name, meta
         FROM attachments
         ORDER BY id DESC
         LIMIT ?`,
        [safeLimit]
      );

      const missingFiles = [];
      for (const row of rows) {
        const storageName = row.storage_name;
        if (storageName) {
          const p = this.storage.resolveUploadPath(storageName);
          if (!fs.existsSync(p)) {
            missingFiles.push({ id: row.id, kind: 'original', storageName });
          }
        }

        const thumbName = row.thumbnail_storage_name;
        if (thumbName) {
          const p = this.storage.resolveUploadPath(thumbName);
          if (!fs.existsSync(p)) {
            missingFiles.push({ id: row.id, kind: 'thumbnail', storageName: thumbName });
          }
        }

        const meta = safeParseJson(row.meta);
        if (meta && meta.thumbnails) {
          for (const [key, value] of Object.entries(meta.thumbnails)) {
            if (!value) continue;
            const p = this.storage.resolveUploadPath(value);
            if (!fs.existsSync(p)) {
              missingFiles.push({ id: row.id, kind: `thumbnail:${key}`, storageName: value });
            }
          }
        }
      }

      report.missingFiles = missingFiles;
    }

    return report;
  }
}

module.exports = {
  IntegrityService,
  parseBool
};
