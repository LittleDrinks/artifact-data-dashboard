/**
 * 文件夹服务
 * 提供文件夹相关的 API 调用
 */
import axios from 'axios';

const API_BASE = '/api/folders';

/**
 * 获取文件夹树
 * @param {boolean} flat - 是否返回扁平列表
 * @returns {Promise<Array>} 文件夹列表或树
 */
export const getFolders = async (flat = false) => {
  const response = await axios.get(API_BASE, { params: { flat } });
  return response.data;
};

/**
 * 获取单个文件夹
 * @param {number} id - 文件夹ID
 * @returns {Promise<Object>} 文件夹详情
 */
export const getFolder = async (id) => {
  const response = await axios.get(`${API_BASE}/${id}`);
  return response.data;
};

/**
 * 创建文件夹
 * @param {Object} data - 文件夹数据
 * @param {string} data.name - 文件夹名称
 * @param {number|null} data.parentId - 父文件夹ID
 * @returns {Promise<Object>} 创建的文件夹
 */
export const createFolder = async ({ name, parentId = null }) => {
  const response = await axios.post(API_BASE, { name, parent_id: parentId });
  return response.data;
};

/**
 * 更新文件夹
 * @param {number} id - 文件夹ID
 * @param {Object} data - 更新数据
 * @returns {Promise<Object>} 更新后的文件夹
 */
export const updateFolder = async (id, data) => {
  const response = await axios.put(`${API_BASE}/${id}`, data);
  return response.data;
};

/**
 * 移动文件夹
 * @param {number} id - 文件夹ID
 * @param {number|null} newParentId - 新父文件夹ID
 * @returns {Promise<Object>} 移动后的文件夹
 */
export const moveFolder = async (id, newParentId) => {
  const response = await axios.put(`${API_BASE}/${id}/move`, { 
    new_parent_id: newParentId 
  });
  return response.data;
};

/**
 * 删除文件夹
 * @param {number} id - 文件夹ID
 * @returns {Promise<void>}
 */
export const deleteFolder = async (id) => {
  await axios.delete(`${API_BASE}/${id}`);
};

/**
 * 获取文件夹中的文件
 * @param {number} id - 文件夹ID
 * @param {Object} options - 查询选项
 * @returns {Promise<Object>} 文件列表
 */
export const getFolderFiles = async (id, { page = 1, limit = 50, tagIds = [], sort = 'created_at', order = 'desc' } = {}) => {
  const params = new URLSearchParams();
  params.append('page', page);
  params.append('limit', limit);
  params.append('sort', sort);
  params.append('order', order);
  if (tagIds.length > 0) {
    params.append('tag_ids', tagIds.join(','));
  }
  
  const response = await axios.get(`${API_BASE}/${id}/files?${params.toString()}`);
  return response.data;
};

export default {
  getFolders,
  getFolder,
  createFolder,
  updateFolder,
  moveFolder,
  deleteFolder,
  getFolderFiles
};
