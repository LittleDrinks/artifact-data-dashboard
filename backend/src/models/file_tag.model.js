/**
 * FileTag Model - 文件标签关联数据访问层
 * @module models/file_tag
 */
const { mysqlPool } = require('../config/database');

/**
 * 为文件添加标签
 * @param {number} attachmentId
 * @param {number} tagId
 * @returns {Promise<boolean>}
 */
const addTag = async (attachmentId, tagId) => {
  try {
    await mysqlPool.query(
      'INSERT IGNORE INTO file_tags (attachment_id, tag_id) VALUES (?, ?)',
      [attachmentId, tagId]
    );
    return true;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return true; // 已存在，视为成功
    }
    throw err;
  }
};

/**
 * 移除文件的标签
 * @param {number} attachmentId
 * @param {number} tagId
 * @returns {Promise<boolean>}
 */
const removeTag = async (attachmentId, tagId) => {
  const [result] = await mysqlPool.query(
    'DELETE FROM file_tags WHERE attachment_id = ? AND tag_id = ?',
    [attachmentId, tagId]
  );
  return result.affectedRows > 0;
};

/**
 * 获取文件的所有标签
 * @param {number} attachmentId
 * @returns {Promise<Array>}
 */
const getTagsByAttachment = async (attachmentId) => {
  const [rows] = await mysqlPool.query(
    `SELECT t.id, t.name, t.color, ft.created_at AS addedAt
     FROM tags t
     INNER JOIN file_tags ft ON t.id = ft.tag_id
     WHERE ft.attachment_id = ?
     ORDER BY t.name ASC`,
    [attachmentId]
  );
  return rows;
};

/**
 * 获取标签下的所有文件
 * @param {number} tagId
 * @param {Object} options - { page, limit }
 * @returns {Promise<{data: Array, total: number}>}
 */
const getAttachmentsByTag = async (tagId, { page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  
  const [rows] = await mysqlPool.query(
    `SELECT a.id, a.original_name AS originalName, a.storage_name AS storageName,
            a.mime_type AS mimeType, a.size_bytes AS sizeBytes,
            a.folder_id AS folderId, a.created_at AS createdAt
     FROM attachments a
     INNER JOIN file_tags ft ON a.id = ft.attachment_id
     WHERE ft.tag_id = ? AND a.is_deleted = 0
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [tagId, limit, offset]
  );
  
  const [[{ total }]] = await mysqlPool.query(
    `SELECT COUNT(*) AS total FROM file_tags ft
     INNER JOIN attachments a ON ft.attachment_id = a.id
     WHERE ft.tag_id = ? AND a.is_deleted = 0`,
    [tagId]
  );
  
  return { data: rows, total };
};

/**
 * 批量添加标签到多个文件
 * @param {Array<number>} attachmentIds
 * @param {Array<number>} tagIds
 * @returns {Promise<number>} 成功添加的关联数
 */
const bulkAddTags = async (attachmentIds, tagIds) => {
  if (!attachmentIds.length || !tagIds.length) return 0;
  
  const values = [];
  const placeholders = [];
  
  for (const attachmentId of attachmentIds) {
    for (const tagId of tagIds) {
      placeholders.push('(?, ?)');
      values.push(attachmentId, tagId);
    }
  }
  
  const [result] = await mysqlPool.query(
    `INSERT IGNORE INTO file_tags (attachment_id, tag_id) VALUES ${placeholders.join(', ')}`,
    values
  );
  
  return result.affectedRows;
};

/**
 * 批量移除标签
 * @param {Array<number>} attachmentIds
 * @param {Array<number>} tagIds
 * @returns {Promise<number>} 删除的关联数
 */
const bulkRemoveTags = async (attachmentIds, tagIds) => {
  if (!attachmentIds.length || !tagIds.length) return 0;
  
  const [result] = await mysqlPool.query(
    `DELETE FROM file_tags 
     WHERE attachment_id IN (${attachmentIds.map(() => '?').join(',')})
     AND tag_id IN (${tagIds.map(() => '?').join(',')})`,
    [...attachmentIds, ...tagIds]
  );
  
  return result.affectedRows;
};

/**
 * 移除文件的所有标签
 * @param {number} attachmentId
 * @returns {Promise<number>}
 */
const removeAllTags = async (attachmentId) => {
  const [result] = await mysqlPool.query(
    'DELETE FROM file_tags WHERE attachment_id = ?',
    [attachmentId]
  );
  return result.affectedRows;
};

/**
 * 根据多个标签过滤文件（OR 逻辑）
 * @param {Array<number>} tagIds
 * @param {Object} options - { folderId, page, limit }
 * @returns {Promise<{data: Array, total: number}>}
 */
const filterByTags = async (tagIds, { folderId = null, page = 1, limit = 20 } = {}) => {
  if (!tagIds.length) {
    return { data: [], total: 0 };
  }
  
  const offset = (page - 1) * limit;
  let query = `
    SELECT DISTINCT a.id, a.original_name AS originalName, a.storage_name AS storageName,
           a.mime_type AS mimeType, a.size_bytes AS sizeBytes,
           a.folder_id AS folderId, a.created_at AS createdAt
    FROM attachments a
    INNER JOIN file_tags ft ON a.id = ft.attachment_id
    WHERE ft.tag_id IN (${tagIds.map(() => '?').join(',')})
    AND a.is_deleted = 0
  `;
  const params = [...tagIds];
  
  if (folderId !== null) {
    query += ' AND a.folder_id = ?';
    params.push(folderId);
  }
  
  query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  const [rows] = await mysqlPool.query(query, params);
  
  // 计算总数
  let countQuery = `
    SELECT COUNT(DISTINCT a.id) AS total
    FROM attachments a
    INNER JOIN file_tags ft ON a.id = ft.attachment_id
    WHERE ft.tag_id IN (${tagIds.map(() => '?').join(',')})
    AND a.is_deleted = 0
  `;
  const countParams = [...tagIds];
  
  if (folderId !== null) {
    countQuery += ' AND a.folder_id = ?';
    countParams.push(folderId);
  }
  
  const [[{ total }]] = await mysqlPool.query(countQuery, countParams);
  
  return { data: rows, total };
};

module.exports = {
  addTag,
  removeTag,
  getTagsByAttachment,
  getAttachmentsByTag,
  bulkAddTags,
  bulkRemoveTags,
  removeAllTags,
  filterByTags
};
