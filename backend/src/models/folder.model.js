/**
 * Folder Model - 虚拟文件夹数据访问层
 * @module models/folder
 */
const { mysqlPool } = require('../config/database');

/**
 * 创建文件夹
 * @param {Object} data - { name, parentId, createdBy }
 * @returns {Promise<Object>} 新创建的文件夹
 */
const create = async ({ name, parentId = null, createdBy }) => {
  const conn = await mysqlPool.getConnection();
  try {
    // 计算 path 和 depth
    let path = '/';
    let depth = 0;
    
    if (parentId) {
      const [parents] = await conn.query(
        'SELECT path, depth FROM folders WHERE id = ?',
        [parentId]
      );
      if (parents.length > 0) {
        path = `${parents[0].path}${parents[0].path.endsWith('/') ? '' : '/'}`;
        depth = parents[0].depth + 1;
      }
    }
    
    const fullPath = `${path}${name}`;
    
    const [result] = await conn.query(
      `INSERT INTO folders (name, parent_id, path, depth, created_by) 
       VALUES (?, ?, ?, ?, ?)`,
      [name, parentId, fullPath, depth, createdBy]
    );
    
    return {
      id: result.insertId,
      name,
      parentId,
      path: fullPath,
      depth,
      createdBy
    };
  } finally {
    conn.release();
  }
};

/**
 * 获取所有文件夹（扁平或树形）
 * @param {Object} options - { flat: boolean }
 * @returns {Promise<Array>}
 */
const findAll = async ({ flat = false } = {}) => {
  const [rows] = await mysqlPool.query(
    `SELECT id, name, parent_id AS parentId, path, depth, 
            created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
     FROM folders 
     ORDER BY depth ASC, name ASC`
  );
  
  if (flat) {
    return rows;
  }
  
  // 构建树形结构
  return buildTree(rows);
};

/**
 * 构建树形结构
 * @param {Array} folders - 扁平文件夹列表
 * @returns {Array} 树形结构
 */
const buildTree = (folders) => {
  const map = new Map();
  const roots = [];
  
  // 第一遍：创建映射
  folders.forEach(folder => {
    map.set(folder.id, { ...folder, children: [] });
  });
  
  // 第二遍：构建树
  folders.forEach(folder => {
    const node = map.get(folder.id);
    if (folder.parentId && map.has(folder.parentId)) {
      map.get(folder.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  
  return roots;
};

/**
 * 根据 ID 获取文件夹
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await mysqlPool.query(
    `SELECT id, name, parent_id AS parentId, path, depth,
            created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
     FROM folders WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
};

/**
 * 更新文件夹（重命名）
 * @param {number} id
 * @param {Object} data - { name }
 * @returns {Promise<boolean>}
 */
const update = async (id, { name }) => {
  const conn = await mysqlPool.getConnection();
  try {
    // 获取当前文件夹信息
    const folder = await findById(id);
    if (!folder) return false;
    
    // 计算新路径
    const pathParts = folder.path.split('/').filter(Boolean);
    pathParts[pathParts.length - 1] = name;
    const newPath = '/' + pathParts.join('/');
    
    // 更新当前文件夹
    await conn.query(
      'UPDATE folders SET name = ?, path = ? WHERE id = ?',
      [name, newPath, id]
    );
    
    // 更新所有子文件夹的路径
    const oldPathPrefix = folder.path;
    await conn.query(
      `UPDATE folders 
       SET path = CONCAT(?, SUBSTRING(path, ?)) 
       WHERE path LIKE ? AND id != ?`,
      [newPath, oldPathPrefix.length + 1, `${oldPathPrefix}/%`, id]
    );
    
    return true;
  } finally {
    conn.release();
  }
};

/**
 * 移动文件夹
 * @param {number} id - 要移动的文件夹 ID
 * @param {number|null} newParentId - 新父文件夹 ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const move = async (id, newParentId) => {
  const conn = await mysqlPool.getConnection();
  try {
    const folder = await findById(id);
    if (!folder) {
      return { success: false, error: '文件夹不存在' };
    }
    
    // 检查循环依赖：不能移动到自己的子文件夹
    if (newParentId) {
      const [descendants] = await conn.query(
        'SELECT id FROM folders WHERE path LIKE ?',
        [`${folder.path}/%`]
      );
      const descendantIds = descendants.map(d => d.id);
      if (descendantIds.includes(newParentId)) {
        return { success: false, error: '不能将文件夹移动到其子文件夹中' };
      }
    }
    
    // 计算新路径和深度
    let newPath = '/';
    let newDepth = 0;
    
    if (newParentId) {
      const parent = await findById(newParentId);
      if (!parent) {
        return { success: false, error: '目标文件夹不存在' };
      }
      newPath = `${parent.path}/`;
      newDepth = parent.depth + 1;
    }
    
    const fullNewPath = `${newPath}${folder.name}`;
    const oldPath = folder.path;
    const depthDiff = newDepth - folder.depth;
    
    // 更新当前文件夹
    await conn.query(
      'UPDATE folders SET parent_id = ?, path = ?, depth = ? WHERE id = ?',
      [newParentId, fullNewPath, newDepth, id]
    );
    
    // 更新所有子文件夹
    await conn.query(
      `UPDATE folders 
       SET path = CONCAT(?, SUBSTRING(path, ?)),
           depth = depth + ?
       WHERE path LIKE ?`,
      [fullNewPath, oldPath.length + 1, depthDiff, `${oldPath}/%`]
    );
    
    return { success: true };
  } finally {
    conn.release();
  }
};

/**
 * 删除文件夹
 * @param {number} id
 * @returns {Promise<{success: boolean, affectedFiles: number}>}
 */
const remove = async (id) => {
  const conn = await mysqlPool.getConnection();
  try {
    // 将该文件夹下的文件移至根目录
    const [updateResult] = await conn.query(
      'UPDATE attachments SET folder_id = NULL WHERE folder_id = ?',
      [id]
    );
    
    // 将子文件夹变为根级
    await conn.query(
      'UPDATE folders SET parent_id = NULL, depth = 0 WHERE parent_id = ?',
      [id]
    );
    
    // 删除文件夹
    await conn.query('DELETE FROM folders WHERE id = ?', [id]);
    
    return { success: true, affectedFiles: updateResult.affectedRows };
  } finally {
    conn.release();
  }
};

/**
 * 获取文件夹内的文件
 * @param {number} folderId
 * @param {Object} options - { page, limit, tagIds }
 * @returns {Promise<{data: Array, total: number}>}
 */
const getFiles = async (folderId, { page = 1, limit = 20, tagIds = [] } = {}) => {
  const offset = (page - 1) * limit;
  
  // 根目录时使用 IS NULL，否则使用 = ?
  const folderCondition = folderId === null ? 'a.folder_id IS NULL' : 'a.folder_id = ?';
  const params = folderId === null ? [] : [folderId];
  
  let query = `
    SELECT a.id, a.original_name AS originalName, a.storage_name AS storageName,
           a.mime_type AS mimeType, a.size_bytes AS sizeBytes, a.hash,
           a.uploaded_by AS uploadedBy, a.created_at AS createdAt,
           a.folder_id AS folderId
    FROM attachments a
    WHERE ${folderCondition} AND a.is_deleted = 0
  `;
  
  // 标签过滤
  if (tagIds.length > 0) {
    query += ` AND a.id IN (
      SELECT attachment_id FROM file_tags WHERE tag_id IN (${tagIds.map(() => '?').join(',')})
    )`;
    params.push(...tagIds);
  }
  
  query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  const [rows] = await mysqlPool.query(query, params);
  
  // 获取总数（这里不使用表别名）
  const countFolderCondition = folderId === null ? 'folder_id IS NULL' : 'folder_id = ?';
  let countQuery = `SELECT COUNT(*) AS total FROM attachments WHERE ${countFolderCondition} AND is_deleted = 0`;
  const countParams = folderId === null ? [] : [folderId];
  
  if (tagIds.length > 0) {
    countQuery += ` AND id IN (
      SELECT attachment_id FROM file_tags WHERE tag_id IN (${tagIds.map(() => '?').join(',')})
    )`;
    countParams.push(...tagIds);
  }
  
  const [[{ total }]] = await mysqlPool.query(countQuery, countParams);
  
  return { data: rows, total };
};

/**
 * 检查同级文件夹名称是否重复
 * @param {string} name
 * @param {number|null} parentId
 * @param {number} [excludeId] - 排除的文件夹 ID（用于重命名场景）
 * @returns {Promise<boolean>}
 */
const existsByName = async (name, parentId, excludeId = null) => {
  let query = 'SELECT COUNT(*) AS count FROM folders WHERE name = ? AND parent_id <=> ?';
  const params = [name, parentId];
  
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
  update,
  move,
  remove,
  getFiles,
  existsByName,
  buildTree
};
