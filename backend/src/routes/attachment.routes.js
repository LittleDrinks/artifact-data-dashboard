const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');

const { mysqlPool } = require('../config/database');
const { exportKnowledgeGraphXlsxBuffer, importKnowledgeGraphFromXlsxBuffer } = require('../services/excel-kg.service');

const router = express.Router();

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

// 删除权限：仅管理员
const canDeleteAttachment = (req) => Boolean(req.user && isAdmin(req));

const writeLog = async ({ userId, action, targetId = null, details = null }) => {
  try {
    await mysqlPool.execute(
      'INSERT INTO logs (user_id, action, target_id, timestamp, details) VALUES (?, ?, ?, ?, ?)',
      [userId, action, targetId, new Date(), details]
    );
  } catch (error) {
    console.warn('写入日志失败:', error.message);
  }
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

    if (ownerType && ownerType.length > 50) {
      return res.status(400).json({ message: 'ownerType过长' });
    }
    if (ownerId !== null && !Number.isFinite(ownerId)) {
      return res.status(400).json({ message: 'ownerId无效' });
    }

    const [result] = await mysqlPool.execute(
      `INSERT INTO attachments (owner_type, owner_id, uploaded_by, original_name, mime_type, size_bytes, storage_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        ownerType,
        ownerId,
        req.user.id,
        req.file.originalname,
        req.file.mimetype || 'application/octet-stream',
        req.file.size,
        req.file.filename,
        new Date()
      ]
    );

    const attachmentId = result.insertId;

    await writeLog({
      userId: req.user.id,
      action: 'upload_attachment',
      targetId: attachmentId,
      details: JSON.stringify({
        ownerType,
        ownerId,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || 'application/octet-stream',
        sizeBytes: req.file.size
      })
    });

    return res.status(201).json({
      id: attachmentId,
      ownerType,
      ownerId,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      createdAt: new Date().toISOString(),
      downloadUrl: `/api/attachments/${attachmentId}/download`
    });
  } catch (error) {
    console.error('上传附件错误:', error);
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
    console.error('获取附件列表错误:', error);
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
    console.error('导出Excel错误:', error);
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
    console.error('导入Excel错误:', error);
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
    console.error('获取附件元数据错误:', error);
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
    console.error('下载附件错误:', error);
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
    if (!canDeleteAttachment(req)) {
      return res.status(403).json({ message: '权限不足：仅管理员可删除附件' });
    }

    const filePath = path.resolve(UPLOAD_DIR, attachment.storage_name);
    if (filePath.startsWith(RESOLVED_UPLOAD_DIR + path.sep) && fs.existsSync(filePath)) {
      try {
        await fsp.unlink(filePath);
      } catch (err) {
        console.warn('删除文件失败，继续删除数据库记录:', err.message);
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
    console.error('删除附件错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;
