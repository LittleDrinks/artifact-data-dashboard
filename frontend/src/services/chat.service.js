import axios from 'axios';

const API_URL = '/api/chat/';

/**
 * 发送问题到智能问答系统
 * @param {string} question 用户问题
 * @param {string} conversationId 会话ID (可选)
 * @returns {Promise} 系统回答
 */
export const askQuestion = async (question, conversationId = null) => {
  return axios.post(API_URL + 'ask', {
    question,
    conversationId
  });
};

/**
 * 获取对话历史
 * @param {string} conversationId 会话ID (可选，不提供则返回所有会话)
 * @returns {Promise} 对话历史
 */
export const getChatHistory = async (conversationId = null) => {
  const params = {};
  if (conversationId) {
    params.conversationId = conversationId;
  }
  
  return axios.get(API_URL + 'history', { params });
};
