/**
 * Public Link Model
 * 公开链接数据模型
 */

const { mysqlPool } = require('../config/database');

class PublicLinkModel {
  async create(data) {
    const [result] = await mysqlPool.execute(
      `INSERT INTO public_links (attachment_id, token, expires_at, max_downloads, password, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.attachment_id,
        data.token,
        data.expires_at || null,
        data.max_downloads || null,
        data.password || null,
        data.created_by,
        new Date()
      ]
    );
    return result.insertId;
  }

  async findById(id) {
    const [rows] = await mysqlPool.execute(
      'SELECT * FROM public_links WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  async findByToken(token) {
    const [rows] = await mysqlPool.execute(
      'SELECT * FROM public_links WHERE token = ?',
      [token]
    );
    return rows[0] || null;
  }

  async findByAttachment(attachmentId) {
    const [rows] = await mysqlPool.execute(
      'SELECT * FROM public_links WHERE attachment_id = ? AND is_revoked = false',
      [attachmentId]
    );
    return rows;
  }

  async update(id, data) {
    const fields = [];
    const values = [];
    
    if (data.expires_at !== undefined) {
      fields.push('expires_at = ?');
      values.push(data.expires_at);
    }
    if (data.max_downloads !== undefined) {
      fields.push('max_downloads = ?');
      values.push(data.max_downloads);
    }
    if (data.password !== undefined) {
      fields.push('password = ?');
      values.push(data.password);
    }
    if (data.is_revoked !== undefined) {
      fields.push('is_revoked = ?');
      values.push(data.is_revoked);
    }
    
    if (fields.length === 0) return false;
    
    values.push(id);
    await mysqlPool.execute(
      `UPDATE public_links SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    return true;
  }

  async revoke(id) {
    return this.update(id, { is_revoked: true });
  }

  async delete(id) {
    await mysqlPool.execute('DELETE FROM public_links WHERE id = ?', [id]);
    return true;
  }

  async logAccess(linkId, ip, userAgent) {
    await mysqlPool.execute(
      `INSERT INTO public_link_logs (link_id, ip_address, user_agent, accessed_at)
       VALUES (?, ?, ?, ?)`,
      [linkId, ip, userAgent, new Date()]
    );
    return true;
  }

  async incrementAccessCount(id) {
    await mysqlPool.execute(
      'UPDATE public_links SET download_count = download_count + 1 WHERE id = ?',
      [id]
    );
    return true;
  }

  async getAccessLogs(linkId, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;
    const [rows] = await mysqlPool.execute(
      `SELECT * FROM public_link_logs 
       WHERE link_id = ? 
       ORDER BY accessed_at DESC 
       LIMIT ? OFFSET ?`,
      [linkId, limit, offset]
    );
    return rows;
  }
}

module.exports = new PublicLinkModel();
