/**
 * Tag Model - 标签数据访问层
 * @module models/tag
 */
const { mysqlPool } = require('../config/database');

/**
 * 创建标签
 * @param {Object} data - { name, color, createdBy }
 * @returns {Promise<Object>}
 */
const create = async ({ name, color = '#1890ff', createdBy }) => {
  const [result] = await mysqlPool.query(
    'INSERT INTO tags (name, color, created_by) VALUES (?, ?, ?)',
    [name, color, createdBy]
  );
  
  return {
    id: result.insertId,
    name,
    color,
    createdBy
  };
};

/**
 * 获取所有标签
 * @returns {Promise<Array>}
 */
const findAll = async () => {
  const [rows] = await mysqlPool.query(
    `SELECT id, name, color, created_by AS createdBy, created_at AS createdAt
     FROM tags ORDER BY name ASC`
  );
  return rows;
};

/**
 * 根据 ID 获取标签
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await mysqlPool.query(
    'SELECT id, name, color, created_by AS createdBy, created_at AS createdAt FROM tags WHERE id = ?',
    [id]
  );
  return rows[0] || null;
};

/**
 * 根据名称获取标签
 * @param {string} name
 * @returns {Promise<Object|null>}
 */
const findByName = async (name) => {
  const [rows] = await mysqlPool.query(
    'SELECT id, name, color, created_by AS createdBy, created_at AS createdAt FROM tags WHERE name = ?',
    [name]
  );
  return rows[0] || null;
};

/**
 * 更新标签
 * @param {number} id
 * @param {Object} data - { name, color }
 * @returns {Promise<boolean>}
 */
const update = async (id, { name, color }) => {
  const fields = [];
  const params = [];
  
  if (name !== undefined) {
    fields.push('name = ?');
    params.push(name);
  }
  if (color !== undefined) {
    fields.push('color = ?');
    params.push(color);
  }
  
  if (fields.length === 0) return false;
  
  params.push(id);
  const [result] = await mysqlPool.query(
    `UPDATE tags SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
  
  return result.affectedRows > 0;
};

/**
 * 删除标签
 * @param {number} id
 * @returns {Promise<boolean>}
 */
const remove = async (id) => {
  const [result] = await mysqlPool.query('DELETE FROM tags WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

/**
 * 获取标签使用统计
 * @returns {Promise<Array>} - [{ id, name, color, fileCount }]
 */
const getUsageStats = async () => {
  const [rows] = await mysqlPool.query(
    `SELECT t.id, t.name, t.color, COUNT(ft.attachment_id) AS fileCount
     FROM tags t
     LEFT JOIN file_tags ft ON t.id = ft.tag_id
     GROUP BY t.id
     ORDER BY fileCount DESC, t.name ASC`
  );
  return rows;
};

/**
 * 检查标签名称是否存在
 * @param {string} name
 * @param {number} [excludeId]
 * @returns {Promise<boolean>}
 */
const existsByName = async (name, excludeId = null) => {
  let query = 'SELECT COUNT(*) AS count FROM tags WHERE name = ?';
  const params = [name];
  
  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }
  
  const [[{ count }]] = await mysqlPool.query(query, params);
  return count > 0;
};

module.exports = {
  create,
  findAll,
  findById,
  findByName,
  update,
  remove,
  getUsageStats,
  existsByName
};
