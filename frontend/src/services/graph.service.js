import axios from 'axios';

const API_URL = '/api/graph/';

/**
 * 获取文物知识图谱数据
 * @param {string} keyword 关键词筛选
 * @param {number} limit 节点数量限制
 * @returns {Promise} 知识图谱数据
 */
export const getGraphData = async (keyword = '', limit = 50) => {
  return axios.get(API_URL + 'artifacts', {
    params: { keyword, limit }
  });
};

/**
 * 获取实体详情及关系
 * @param {string} type 实体类型
 * @param {string} id 实体ID
 * @returns {Promise} 实体详情
 */
export const getEntityDetails = async (type, id) => {
  return axios.get(`${API_URL}entity/${type}/${id}`);
};

/**
 * 执行自定义Cypher查询 (仅限管理员)
 * @param {string} query Cypher查询语句
 * @param {Object} params 查询参数
 * @returns {Promise} 查询结果
 */
export const executeCypherQuery = async (query, params = {}) => {
  return axios.post(`${API_URL}cypher`, { query, params });
};
