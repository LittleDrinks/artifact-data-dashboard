import axios from 'axios';

const API_URL = '/api/chat/config';

/**
 * 获取当前 AI 配置
 * @param {string} [sessionId] - 会话ID，可选
 * @returns {Promise<{
 *   model: 'ONLINE'|'LOCAL'|'MOCK',
 *   enabledTools: string[]
 * }>}
 */
const getConfig = async (sessionId) => {
  const params = sessionId ? { sessionId } : {};
  const response = await axios.get(API_URL, { params });
  return response.data;
};

/**
 * 更新 AI 配置
 * @param {Object} config - 配置对象
 * @param {string} [config.sessionId] - 会话ID，可选
 * @param {'ONLINE'|'LOCAL'|'MOCK'} config.model - 模型选择
 * @param {string[]} config.enabledTools - 启用的 MCP 工具列表
 * @returns {Promise<{message: string, config: Object}>}
 */
const updateConfig = async (config) => {
  const response = await axios.post(API_URL, config);
  return response.data;
};

/**
 * 获取默认配置
 * @returns {Promise<Object>}
 */
const getDefaultConfig = async () => {
  const response = await axios.get(`${API_URL}/default`);
  return response.data;
};

/**
 * 获取可用 MCP 工具列表
 * @returns {Promise<{tools: Array<{
 *   name: string,
 *   description: string,
 *   enabledByDefault: boolean
 * }>}>}
 */
const getAvailableTools = async () => {
  const response = await axios.get(`${API_URL}/tools`);
  return response.data;
};

/**
 * 获取模型健康状态
 * @returns {Promise<{
 *   ONLINE: 'healthy'|'unhealthy'|'unknown',
 *   LOCAL: 'healthy'|'unhealthy'|'unknown',
 *   MOCK: 'healthy'
 * }>}
 */
const getModelHealth = async () => {
  try {
    const response = await axios.get(`${API_URL}/health`);
    return response.data?.health || {};
  } catch (err) {
    console.error('获取模型健康状态失败:', err);
    return { ONLINE: 'unknown', LOCAL: 'unknown', MOCK: 'healthy' };
  }
};

const chatConfigService = {
  getConfig,
  updateConfig,
  getDefaultConfig,
  getAvailableTools,
  getModelHealth
};

export default chatConfigService;
