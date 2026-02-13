import axios from 'axios';

const API_URL = '/api/chat/config';

/**
 * 获取当前 AI 配置
 * @returns {Promise<{
 *   model: 'ONLINE'|'LOCAL'|'MOCK',
 *   modelLocked: boolean,
 *   healthStatus: 'healthy'|'unhealthy'|'unknown',
 *   answerMode: 'graph'|'knowledge'|'general',
 *   mcpTools: string[]
 * }>}
 */
const getConfig = async () => {
  const response = await axios.get(API_URL);
  return response.data;
};

/**
 * 更新 AI 配置
 * @param {Object} config - 配置对象
 * @param {'ONLINE'|'LOCAL'|'MOCK'} config.model - 模型选择
 * @param {boolean} config.modelLocked - 是否锁定模型
 * @param {'graph'|'knowledge'|'general'} config.answerMode - 问答模式
 * @param {string[]} config.mcpTools - 启用的 MCP 工具列表
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
 * @returns {Promise<Array<{
 *   name: string,
 *   description: string,
 *   enabled: boolean
 * }>>}
 */
const getAvailableTools = async () => {
  const response = await axios.get(`${API_URL}/tools`);
  return response.data;
};

const chatConfigService = {
  getConfig,
  updateConfig,
  getDefaultConfig,
  getAvailableTools
};

export default chatConfigService;
