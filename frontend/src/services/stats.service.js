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
