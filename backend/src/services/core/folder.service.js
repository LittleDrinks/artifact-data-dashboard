/**
 * Folder Service - 文件夹业务逻辑层
 * @module services/folder
 */
const folderModel = require('../models/folder.model');
const { createLogger } = require('../utils/logger');

const logger = createLogger('FolderService');

/**
 * 创建文件夹
 * @param {Object} data - { name, parentId, createdBy }
 * @returns {Promise<Object>}
 */
const createFolder = async ({ name, parentId = null, createdBy }) => {
  // 验证名称
  if (!name || !name.trim()) {
    throw new Error('文件夹名称不能为空');
  }
  
  const trimmedName = name.trim();
  
  // 检查同级目录下是否有重名
  const exists = await folderModel.existsByName(trimmedName, parentId);
  if (exists) {
    throw new Error('同级目录下已存在同名文件夹');
  }
  
  // 如果有父文件夹，验证其存在
  if (parentId) {
    const parent = await folderModel.findById(parentId);
    if (!parent) {
      throw new Error('父文件夹不存在');
    }
  }
  
  const folder = await folderModel.create({
    name: trimmedName,
    parentId,
    createdBy
  });
  
  logger.info(`文件夹创建成功: ${folder.path} (id=${folder.id})`);
  return folder;
};

/**
 * 获取文件夹树
 * @param {Object} options - { flat }
 * @returns {Promise<Array>}
 */
const getFolderTree = async ({ flat = false } = {}) => {
  return folderModel.findAll({ flat });
};

/**
 * 获取文件夹详情
 * @param {number} id
 * @returns {Promise<Object>}
 */
const getFolderById = async (id) => {
  const folder = await folderModel.findById(id);
  if (!folder) {
    throw new Error('文件夹不存在');
  }
  return folder;
};

/**
 * 更新文件夹（重命名）
 * @param {number} id
 * @param {Object} data - { name }
 * @returns {Promise<Object>}
 */
const updateFolder = async (id, { name }) => {
  const folder = await folderModel.findById(id);
  if (!folder) {
    throw new Error('文件夹不存在');
  }
  
  if (!name || !name.trim()) {
    throw new Error('文件夹名称不能为空');
  }
  
  const trimmedName = name.trim();
  
  // 检查同级目录下是否有重名（排除自己）
  const exists = await folderModel.existsByName(trimmedName, folder.parentId, id);
  if (exists) {
    throw new Error('同级目录下已存在同名文件夹');
  }
  
  await folderModel.update(id, { name: trimmedName });
  logger.info(`文件夹重命名: ${folder.name} -> ${trimmedName} (id=${id})`);
  
  return folderModel.findById(id);
};

/**
 * 移动文件夹
 * @param {number} id
 * @param {number|null} newParentId
 * @returns {Promise<Object>}
 */
const moveFolder = async (id, newParentId) => {
  const folder = await folderModel.findById(id);
  if (!folder) {
    throw new Error('文件夹不存在');
  }
  
  // 不能移动到自己
  if (newParentId === id) {
    throw new Error('不能将文件夹移动到自己');
  }
  
  // 检查目标父文件夹是否存在
  if (newParentId) {
    const parent = await folderModel.findById(newParentId);
    if (!parent) {
      throw new Error('目标文件夹不存在');
    }
  }
  
  // 检查同级目录下是否有重名
  const exists = await folderModel.existsByName(folder.name, newParentId, id);
  if (exists) {
    throw new Error('目标目录下已存在同名文件夹');
  }
  
  const result = await folderModel.move(id, newParentId);
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  logger.info(`文件夹移动: ${folder.path} -> parentId=${newParentId} (id=${id})`);
  return folderModel.findById(id);
};

/**
 * 删除文件夹
 * @param {number} id
 * @returns {Promise<Object>}
 */
const deleteFolder = async (id) => {
  const folder = await folderModel.findById(id);
  if (!folder) {
    throw new Error('文件夹不存在');
  }
  
  const result = await folderModel.remove(id);
  logger.info(`文件夹删除: ${folder.path} (id=${id}), 受影响文件: ${result.affectedFiles}`);
  
  return {
    message: '文件夹删除成功',
    affectedFiles: result.affectedFiles
  };
};

/**
 * 获取文件夹内的文件
 * @param {number} folderId
 * @param {Object} options - { page, limit, tagIds }
 * @returns {Promise<Object>}
 */
const getFolderFiles = async (folderId, options = {}) => {
  // folderId 为 null 表示根目录
  if (folderId !== null) {
    const folder = await folderModel.findById(folderId);
    if (!folder) {
      throw new Error('文件夹不存在');
    }
  }
  
  return folderModel.getFiles(folderId, options);
};

module.exports = {
  createFolder,
  getFolderTree,
  getFolderById,
  updateFolder,
  moveFolder,
  deleteFolder,
  getFolderFiles
};
