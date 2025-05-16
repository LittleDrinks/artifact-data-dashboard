import axios from 'axios';

const API_URL = '/api/stats/';

/**
 * 获取统计概览数据
 * @returns {Promise} 统计概览数据
 */
export const getStatsOverview = async () => {
  return axios.get(API_URL + 'overview');
};

/**
 * 获取时间线数据
 * @returns {Promise} 时间线数据
 */
export const getTimelineStats = async () => {
  return axios.get(API_URL + 'timeline');
};

/**
 * 获取最近活动记录
 * @param {number} limit 返回记录数
 * @returns {Promise} 活动记录
 */
export const getRecentActivities = async (limit = 10) => {
  return axios.get(API_URL + 'recent-activities', {
    params: { limit }
  });
};

/**
 * 测试数据库连接状态
 * @returns {Promise} 数据库连接状态
 */
export const testDbConnection = async () => {
  return axios.get(API_URL + 'test-db-connection');
};

/**
 * 测试最近活动API
 * @returns {Promise} 最近活动API测试结果
 */
export const testRecentActivities = async () => {
  return axios.get(API_URL + 'test-recent-activities');
};
