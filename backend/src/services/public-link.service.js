/**
 * 公开链接服务层
 * 处理公开分享链接的业务逻辑
 */
const { v4: uuidv4 } = require('uuid');
const PublicLinkModel = require('../models/public_link.model');
const logger = require('../config/logger');

class PublicLinkService {
  /**
   * 创建公开链接
   * @param {Object} data - 链接数据
   * @param {number} data.attachmentId - 附件ID
   * @param {string} data.expiresAt - 过期时间（可选）
   * @param {number} data.maxDownloads - 最大下载次数（可选）
   * @param {string} data.password - 访问密码（可选）
   * @param {number} userId - 创建者用户ID
   * @returns {Promise<Object>} 创建的链接
   */
  async createLink({ attachmentId, expiresAt, maxDownloads, password }, userId) {
    // 生成唯一 token
    const token = uuidv4().replace(/-/g, '');

    const linkId = await PublicLinkModel.create({
      attachment_id: attachmentId,
      token,
      created_by: userId,
      expires_at: expiresAt || null,
      max_downloads: maxDownloads || null,
      password: password || null
    });

    logger.info(`Public link created: ${token} for attachment ${attachmentId}`);

    const link = await PublicLinkModel.findById(linkId);
    return {
      ...link,
      url: `/public/${token}/download`
    };
  }

  /**
   * 获取所有公开链接（管理员用）
   * @param {Object} options - 查询选项
   * @param {number} options.attachmentId - 按附件ID过滤
   * @param {boolean} options.includeExpired - 是否包含已过期链接
   * @returns {Promise<Array>} 链接列表
   */
  async getAllLinks({ attachmentId, includeExpired = false } = {}) {
    const links = await PublicLinkModel.findAll({ attachmentId, includeExpired });
    return links.map(link => ({
      ...link,
      url: `/public/${link.token}/download`
    }));
  }

  /**
   * 获取链接详情
   * @param {number} linkId - 链接ID
   * @returns {Promise<Object>} 链接详情
   */
  async getLinkById(linkId) {
    const link = await PublicLinkModel.findById(linkId);
    if (!link) {
      const error = new Error('链接不存在');
      error.status = 404;
      throw error;
    }
    return {
      ...link,
      url: `/public/${link.token}/download`
    };
  }

  /**
   * 通过 token 获取链接
   * @param {string} token - 链接 token
   * @returns {Promise<Object>} 链接详情
   */
  async getLinkByToken(token) {
    const link = await PublicLinkModel.findByToken(token);
    if (!link) {
      const error = new Error('链接不存在');
      error.status = 404;
      throw error;
    }
    return link;
  }

  /**
   * 验证链接是否有效
   * @param {string} token - 链接 token
   * @param {string} password - 访问密码（可选）
   * @param {string} clientIp - 客户端IP
   * @param {string} userAgent - 用户代理
   * @returns {Promise<Object>} 验证结果和附件信息
   */
  async validateAndAccess(token, password, clientIp, userAgent) {
    const link = await PublicLinkModel.findByToken(token);
    
    if (!link) {
      const error = new Error('链接不存在或已失效');
      error.status = 404;
      throw error;
    }

    // 检查是否已撤销
    if (link.is_revoked) {
      const error = new Error('该链接已被撤销');
      error.status = 410;
      throw error;
    }

    // 检查是否过期
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      const error = new Error('该链接已过期');
      error.status = 410;
      throw error;
    }

    // 检查下载次数限制
    if (link.max_downloads && link.download_count >= link.max_downloads) {
      const error = new Error('该链接已达到最大下载次数');
      error.status = 410;
      throw error;
    }

    // 检查密码
    if (link.password && link.password !== password) {
      const error = new Error('访问密码错误');
      error.status = 401;
      throw error;
    }

    // 记录访问日志
    await PublicLinkModel.logAccess(link.id, clientIp, userAgent);

    // 增加下载计数
    await PublicLinkModel.incrementAccessCount(link.id);

    logger.info(`Public link accessed: ${token} from ${clientIp}`);

    return {
      valid: true,
      attachmentId: link.attachment_id,
      link
    };
  }

  /**
   * 撤销链接
   * @param {number} linkId - 链接ID
   * @returns {Promise<void>}
   */
  async revokeLink(linkId) {
    const link = await PublicLinkModel.findById(linkId);
    if (!link) {
      const error = new Error('链接不存在');
      error.status = 404;
      throw error;
    }

    await PublicLinkModel.revoke(linkId);
    logger.info(`Public link revoked: ${link.token}`);
  }

  /**
   * 删除链接
   * @param {number} linkId - 链接ID
   * @returns {Promise<void>}
   */
  async deleteLink(linkId) {
    const link = await PublicLinkModel.findById(linkId);
    if (!link) {
      const error = new Error('链接不存在');
      error.status = 404;
      throw error;
    }

    await PublicLinkModel.remove(linkId);
    logger.info(`Public link deleted: ${link.token}`);
  }

  /**
   * 获取链接访问日志
   * @param {number} linkId - 链接ID
   * @param {Object} options - 分页选项
   * @returns {Promise<Array>} 访问日志列表
   */
  async getAccessLogs(linkId, { page = 1, limit = 50 } = {}) {
    const link = await PublicLinkModel.findById(linkId);
    if (!link) {
      const error = new Error('链接不存在');
      error.status = 404;
      throw error;
    }

    return await PublicLinkModel.getAccessLogs(linkId, { page, limit });
  }

  /**
   * 获取附件的所有公开链接
   * @param {number} attachmentId - 附件ID
   * @returns {Promise<Array>} 链接列表
   */
  async getLinksByAttachment(attachmentId) {
    const links = await PublicLinkModel.findByAttachment(attachmentId);
    return links.map(link => ({
      ...link,
      url: `/public/${link.token}/download`
    }));
  }

  /**
   * 更新链接设置
   * @param {number} linkId - 链接ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新后的链接
   */
  async updateLink(linkId, { expiresAt, maxDownloads, password }) {
    const link = await PublicLinkModel.findById(linkId);
    if (!link) {
      const error = new Error('链接不存在');
      error.status = 404;
      throw error;
    }

    await PublicLinkModel.update(linkId, {
      expires_at: expiresAt,
      max_downloads: maxDownloads,
      password
    });

    logger.info(`Public link updated: ${link.token}`);
    return await this.getLinkById(linkId);
  }
}

module.exports = new PublicLinkService();
