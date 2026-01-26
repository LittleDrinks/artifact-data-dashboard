/**
 * 资产服务
 * 提供资产/附件相关的 API 调用
 */
import axios from 'axios';

const API_BASE = '/api/attachments';
const TAGS_API = '/api/tags';
const PUBLIC_LINKS_API = '/api/public-links';

// ===================
// 附件操作
// ===================

/**
 * 获取附件列表
 * @param {Object} options - 查询选项
 * @returns {Promise<Object>} 附件列表和分页信息
 */
export const getAssets = async ({ 
  page = 1, 
  limit = 50, 
  folderId, 
  tagIds = [], 
  search,
  ownerType,
  ownerId
} = {}) => {
  const params = new URLSearchParams();
  params.append('page', page);
  params.append('limit', limit);
  
  if (folderId) params.append('folderId', folderId);
  if (tagIds.length > 0) params.append('tagIds', tagIds.join(','));
  if (search) params.append('search', search);
  if (ownerType) params.append('ownerType', ownerType);
  if (ownerId) params.append('ownerId', ownerId);
  
  const response = await axios.get(`${API_BASE}?${params.toString()}`);
  return response.data;
};

/**
 * 获取单个附件
 * @param {number} id - 附件ID
 * @returns {Promise<Object>} 附件详情
 */
export const getAsset = async (id) => {
  const response = await axios.get(`${API_BASE}/${id}`);
  return response.data;
};

/**
 * 上传附件
 * @param {File} file - 文件对象
 * @param {Object} options - 上传选项
 * @returns {Promise<Object>} 上传的附件
 */
export const uploadAsset = async (file, { ownerType, ownerId, folderId } = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  if (ownerType) formData.append('ownerType', ownerType);
  if (ownerId) formData.append('ownerId', ownerId);
  if (folderId) formData.append('folderId', folderId);
  
  const response = await axios.post(`${API_BASE}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

/**
 * 删除附件
 * @param {number} id - 附件ID
 * @returns {Promise<void>}
 */
export const deleteAsset = async (id) => {
  await axios.delete(`${API_BASE}/${id}`);
};

/**
 * 移动附件到文件夹
 * @param {number} assetId - 附件ID
 * @param {number|null} folderId - 目标文件夹ID
 * @returns {Promise<Object>} 更新后的附件
 */
export const moveAssetToFolder = async (assetId, folderId) => {
  const response = await axios.put(`${API_BASE}/${assetId}/folder`, { 
    folder_id: folderId 
  });
  return response.data;
};

// ===================
// 标签操作
// ===================

/**
 * 获取所有标签
 * @param {boolean} includeStats - 是否包含使用统计
 * @returns {Promise<Array>} 标签列表
 */
export const getTags = async (includeStats = false) => {
  const response = await axios.get(TAGS_API, { 
    params: { includeStats } 
  });
  return response.data;
};

/**
 * 创建标签
 * @param {Object} data - 标签数据
 * @returns {Promise<Object>} 创建的标签
 */
export const createTag = async ({ name, color }) => {
  const response = await axios.post(TAGS_API, { name, color });
  return response.data;
};

/**
 * 更新标签
 * @param {number} id - 标签ID
 * @param {Object} data - 更新数据
 * @returns {Promise<Object>} 更新后的标签
 */
export const updateTag = async (id, { name, color }) => {
  const response = await axios.put(`${TAGS_API}/${id}`, { name, color });
  return response.data;
};

/**
 * 删除标签
 * @param {number} id - 标签ID
 * @returns {Promise<void>}
 */
export const deleteTag = async (id) => {
  await axios.delete(`${TAGS_API}/${id}`);
};

/**
 * 给附件添加标签
 * @param {number} assetId - 附件ID
 * @param {number} tagId - 标签ID
 * @returns {Promise<void>}
 */
export const addTagToAsset = async (assetId, tagId) => {
  await axios.post(`${TAGS_API}/file/${assetId}`, { tagId });
};

/**
 * 从附件移除标签
 * @param {number} assetId - 附件ID
 * @param {number} tagId - 标签ID
 * @returns {Promise<void>}
 */
export const removeTagFromAsset = async (assetId, tagId) => {
  await axios.delete(`${TAGS_API}/file/${assetId}/${tagId}`);
};

/**
 * 获取附件的标签
 * @param {number} assetId - 附件ID
 * @returns {Promise<Array>} 标签列表
 */
export const getAssetTags = async (assetId) => {
  const response = await axios.get(`${TAGS_API}/file/${assetId}`);
  return response.data;
};

/**
 * 批量标签操作
 * @param {number[]} assetIds - 附件ID列表
 * @param {number[]} tagIds - 标签ID列表
 * @param {string} action - 操作类型: 'add' 或 'remove'
 * @returns {Promise<Object>} 操作结果
 */
export const bulkTagOperation = async (assetIds, tagIds, action) => {
  const response = await axios.post(`${API_BASE}/bulk/tags`, {
    attachmentIds: assetIds,
    tagIds,
    action
  });
  return response.data;
};

// ===================
// 公开链接操作
// ===================

/**
 * 获取附件的公开链接
 * @param {number} assetId - 附件ID
 * @returns {Promise<Array>} 公开链接列表
 */
export const getAssetPublicLinks = async (assetId) => {
  const response = await axios.get(`${PUBLIC_LINKS_API}/attachment/${assetId}`);
  return response.data;
};

/**
 * 创建公开链接
 * @param {Object} data - 链接数据
 * @returns {Promise<Object>} 创建的链接
 */
export const createPublicLink = async ({ attachmentId, expiresAt, maxDownloads, password }) => {
  const response = await axios.post(PUBLIC_LINKS_API, {
    attachmentId,
    expiresAt,
    maxDownloads,
    password
  });
  return response.data;
};

/**
 * 撤销公开链接
 * @param {number} linkId - 链接ID
 * @returns {Promise<void>}
 */
export const revokePublicLink = async (linkId) => {
  await axios.post(`${PUBLIC_LINKS_API}/${linkId}/revoke`);
};

/**
 * 删除公开链接
 * @param {number} linkId - 链接ID
 * @returns {Promise<void>}
 */
export const deletePublicLink = async (linkId) => {
  await axios.delete(`${PUBLIC_LINKS_API}/${linkId}`);
};

export default {
  // 附件
  getAssets,
  getAsset,
  uploadAsset,
  deleteAsset,
  moveAssetToFolder,
  // 标签
  getTags,
  createTag,
  updateTag,
  deleteTag,
  addTagToAsset,
  removeTagFromAsset,
  getAssetTags,
  bulkTagOperation,
  // 公开链接
  getAssetPublicLinks,
  createPublicLink,
  revokePublicLink,
  deletePublicLink
};
