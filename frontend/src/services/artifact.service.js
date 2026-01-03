import axios from 'axios';

const API_URL = '/api/artifacts/';

/**
 * 获取文物列表
 * @param {number} page 页码
 * @param {number} limit 每页数量
 * @param {Object} filters 筛选条件
 * @returns {Promise} 文物列表
 */
export const getArtifacts = async (page = 1, limit = 10, filters = {}) => {
  const params = { page, limit, ...filters };
  return axios.get(API_URL, { params });
};

/**
 * 获取文物详情
 * @param {number} id 文物ID
 * @returns {Promise} 文物详情
 */
export const getArtifactById = async (id) => {
  return axios.get(`${API_URL}${id}`);
};

/**
 * 搜索文物
 * @param {string} keyword 搜索关键词
 * @param {number} page 页码
 * @param {number} limit 每页数量
 * @returns {Promise} 搜索结果
 */
export const searchArtifacts = async (keyword, page = 1, limit = 10) => {
  return axios.get(`${API_URL}search`, {
    params: { keyword, page, limit }
  });
};

/**
 * 创建文物（管理员）
 * @param {Object} payload 文物数据
 */
export const createArtifact = async (payload) => {
  return axios.post(API_URL, payload);
};

/**
 * 更新文物（管理员）
 * @param {number} id 文物ID
 * @param {Object} payload 文物数据（可部分更新）
 */
export const updateArtifact = async (id, payload) => {
  return axios.put(`${API_URL}${id}`, payload);
};

/**
 * 删除文物（管理员）
 * @param {number} id 文物ID
 */
export const deleteArtifact = async (id) => {
  return axios.delete(`${API_URL}${id}`);
};
