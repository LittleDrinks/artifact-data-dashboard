/**
 * 公开访问中间件
 * 处理公开链接的访问验证
 */
const publicLinkService = require('../services/core/public-link.service');
const { createLogger } = require('../utils/logger');

const logger = createLogger('PublicAccessMiddleware');

/**
 * 验证公开链接访问
 * 用于需要验证公开链接有效性但不立即触发下载的场景
 */
const validatePublicLink = async (req, res, next) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({ error: '缺少访问令牌' });
    }

    // 获取链接信息（不增加计数）
    const link = await publicLinkService.getLinkByToken(token);

    // 验证链接状态
    if (link.is_revoked) {
      return res.status(410).json({ error: '该链接已被撤销' });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: '该链接已过期' });
    }

    if (link.max_downloads && link.download_count >= link.max_downloads) {
      return res.status(410).json({ error: '该链接已达到最大下载次数' });
    }

    // 检查密码（如果需要）
    if (link.password) {
      const providedPassword = req.query.password || req.headers['x-access-password'];
      if (!providedPassword) {
        return res.status(401).json({ 
          error: '该链接需要密码访问',
          requiresPassword: true
        });
      }
      if (providedPassword !== link.password) {
        return res.status(401).json({ error: '访问密码错误' });
      }
    }

    // 将链接信息附加到请求对象
    req.publicLink = link;
    next();
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: '链接不存在或已失效' });
    }
    logger.error('Public link validation error:', error);
    return res.status(500).json({ error: '服务器内部错误' });
  }
};

/**
 * 记录访问并验证（用于实际下载时）
 * 会增加下载计数并记录访问日志
 */
const validateAndLogAccess = async (req, res, next) => {
  try {
    const { token } = req.params;
    const password = req.query.password || req.headers['x-access-password'];
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'Unknown';

    if (!token) {
      return res.status(400).json({ error: '缺少访问令牌' });
    }

    // 验证并记录访问
    const result = await publicLinkService.validateAndAccess(
      token,
      password,
      clientIp,
      userAgent
    );

    // 将结果附加到请求对象
    req.publicLink = result.link;
    req.attachmentId = result.attachmentId;
    next();
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error('Public access validation error:', error);
    return res.status(500).json({ error: '服务器内部错误' });
  }
};

/**
 * 可选的公开访问中间件
 * 如果提供了 token 则验证，否则跳过
 */
const optionalPublicLink = async (req, res, next) => {
  const { token } = req.params;
  
  if (!token) {
    return next();
  }

  try {
    const link = await publicLinkService.getLinkByToken(token);
    
    // 基本验证
    if (!link.is_revoked && 
        (!link.expires_at || new Date(link.expires_at) >= new Date()) &&
        (!link.max_downloads || link.download_count < link.max_downloads)) {
      req.publicLink = link;
    }
  } catch (error) {
    // 静默失败，继续处理
    logger.debug('Optional public link validation failed:', error.message);
  }
  
  next();
};

module.exports = {
  validatePublicLink,
  validateAndLogAccess,
  optionalPublicLink
};
