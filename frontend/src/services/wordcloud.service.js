import axios from 'axios';

const API_URL = '/api/wordcloud/';

/**
 * 获取词云分析数据
 * @param {string} category 类别筛选
 * @param {string} era 年代筛选
 * @param {number} limit 词数量限制
 * @returns {Promise} 词云数据
 */
export const getWordcloudData = async (category = '', era = '', limit = 100) => {
  return axios.get(API_URL + 'analyze', {
    params: { category, era, limit }
  });
};

/**
 * 获取各类别文物的词云数据
 * @returns {Promise} 各类别词云数据
 */
export const getCategoriesWordcloud = async () => {
  return axios.get(API_URL + 'categories');
};
