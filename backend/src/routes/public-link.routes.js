/**
 * 公开链接路由
 * 提供公开分享链接的 REST API 端点
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const publicLinkService = require('../services/core/public-link.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { mysqlPool } = require('../config/database');
const { createLogger } = require('../utils/logger');

const logger = createLogger('PublicLinkRoutes');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const RESOLVED_UPLOAD_DIR = path.resolve(UPLOAD_DIR);

/**
 * 获取所有公开链接（需要认证）
 * GET /api/public-links
 * Query:
 *   - attachmentId: number - 按附件ID过滤
 *   - includeExpired: boolean - 是否包含已过期链接
 */
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const attachmentId = req.query.attachmentId ? parseInt(req.query.attachmentId, 10) : undefined;
    const includeExpired = req.query.includeExpired === 'true';
    
    const links = await publicLinkService.getAllLinks({ attachmentId, includeExpired });
    res.json(links);
  } catch (error) {
    logger.error('Failed to get public links:', error);
    next(error);
  }
});

/**
 * 创建公开链接
 * POST /api/public-links
 * Body:
 *   - attachmentId: number - 附件ID
 *   - expiresAt: string - 过期时间（可选）
 *   - maxDownloads: number - 最大下载次数（可选）
 *   - password: string - 访问密码（可选）
 */
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { attachmentId, expiresAt, maxDownloads, password } = req.body;
    
    if (!attachmentId) {
      return res.status(400).json({ error: '附件ID不能为空' });
    }

    // 验证附件存在
    const [rows] = await mysqlPool.execute(
      'SELECT id FROM attachments WHERE id = ?',
      [attachmentId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '附件不存在' });
    }

    const link = await publicLinkService.createLink(
      { attachmentId, expiresAt, maxDownloads, password },
      req.user.id
    );
    res.status(201).json(link);
  } catch (error) {
    logger.error('Failed to create public link:', error);
    next(error);
  }
});

/**
 * 获取单个公开链接详情
 * GET /api/public-links/:id
 */
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const linkId = parseInt(req.params.id, 10);
    if (isNaN(linkId)) {
      return res.status(400).json({ error: '无效的链接ID' });
    }

    const link = await publicLinkService.getLinkById(linkId);
    res.json(link);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Failed to get public link:', error);
    next(error);
  }
});

/**
 * 更新公开链接
 * PUT /api/public-links/:id
 * Body:
 *   - expiresAt: string - 过期时间
 *   - maxDownloads: number - 最大下载次数
 *   - password: string - 访问密码
 */
router.put('/:id', authMiddleware, async (req, res, next) => {
  try {
    const linkId = parseInt(req.params.id, 10);
    if (isNaN(linkId)) {
      return res.status(400).json({ error: '无效的链接ID' });
    }

    const { expiresAt, maxDownloads, password } = req.body;
    const link = await publicLinkService.updateLink(linkId, { expiresAt, maxDownloads, password });
    res.json(link);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Failed to update public link:', error);
    next(error);
  }
});

/**
 * 撤销公开链接
 * POST /api/public-links/:id/revoke
 */
router.post('/:id/revoke', authMiddleware, async (req, res, next) => {
  try {
    const linkId = parseInt(req.params.id, 10);
    if (isNaN(linkId)) {
      return res.status(400).json({ error: '无效的链接ID' });
    }

    await publicLinkService.revokeLink(linkId);
    res.json({ success: true, message: '链接已撤销' });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Failed to revoke public link:', error);
    next(error);
  }
});

/**
 * 删除公开链接
 * DELETE /api/public-links/:id
 */
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const linkId = parseInt(req.params.id, 10);
    if (isNaN(linkId)) {
      return res.status(400).json({ error: '无效的链接ID' });
    }

    await publicLinkService.deleteLink(linkId);
    res.status(204).send();
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Failed to delete public link:', error);
    next(error);
  }
});

/**
 * 获取链接访问日志
 * GET /api/public-links/:id/logs
 */
router.get('/:id/logs', authMiddleware, async (req, res, next) => {
  try {
    const linkId = parseInt(req.params.id, 10);
    if (isNaN(linkId)) {
      return res.status(400).json({ error: '无效的链接ID' });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;

    const logs = await publicLinkService.getAccessLogs(linkId, { page, limit });
    res.json(logs);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Failed to get access logs:', error);
    next(error);
  }
});

/**
 * 获取附件的所有公开链接
 * GET /api/attachments/:attachmentId/public-links
 */
router.get('/attachment/:attachmentId', authMiddleware, async (req, res, next) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId, 10);
    if (isNaN(attachmentId)) {
      return res.status(400).json({ error: '无效的附件ID' });
    }

    const links = await publicLinkService.getLinksByAttachment(attachmentId);
    res.json(links);
  } catch (error) {
    logger.error('Failed to get attachment public links:', error);
    next(error);
  }
});

// ===================
// 公开访问端点（无需认证）
// ===================

/**
 * 公开下载文件
 * GET /public/:token/download
 * Query:
 *   - password: string - 访问密码（如果设置了）
 */
router.get('/public/:token/download', async (req, res, next) => {
  try {
    const { token } = req.params;
    const password = req.query.password || req.headers['x-access-password'];
    const clientIp = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // 验证并获取附件信息
    const { attachmentId } = await publicLinkService.validateAndAccess(
      token,
      password,
      clientIp,
      userAgent
    );

    // 获取附件信息
    const [rows] = await mysqlPool.execute(
      'SELECT * FROM attachments WHERE id = ?',
      [attachmentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '附件不存在' });
    }

    const attachment = rows[0];
    const filePath = path.resolve(UPLOAD_DIR, attachment.storage_name);

    // 安全检查
    if (!filePath.startsWith(RESOLVED_UPLOAD_DIR + path.sep)) {
      return res.status(400).json({ error: '非法文件路径' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在或已被删除' });
    }

    // 发送文件
    res.download(filePath, attachment.original_name);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error('Public download error:', error);
    next(error);
  }
});

/**
 * 公开预览文件信息（不触发下载计数）
 * GET /public/:token/info
 */
router.get('/public/:token/info', async (req, res, next) => {
  try {
    const { token } = req.params;
    
    const link = await publicLinkService.getLinkByToken(token);
    
    // 检查基本有效性（不增加计数）
    if (link.is_revoked) {
      return res.status(410).json({ error: '该链接已被撤销' });
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: '该链接已过期' });
    }
    if (link.max_downloads && link.download_count >= link.max_downloads) {
      return res.status(410).json({ error: '该链接已达到最大下载次数' });
    }

    // 获取附件基本信息
    const [rows] = await mysqlPool.execute(
      'SELECT id, original_name, mime_type, size_bytes FROM attachments WHERE id = ?',
      [link.attachment_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '附件不存在' });
    }

    const attachment = rows[0];
    res.json({
      filename: attachment.original_name,
      mimeType: attachment.mime_type,
      sizeBytes: attachment.size_bytes,
      requiresPassword: !!link.password,
      expiresAt: link.expires_at,
      remainingDownloads: link.max_downloads ? link.max_downloads - link.download_count : null
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Public info error:', error);
    next(error);
  }
});

module.exports = router;
