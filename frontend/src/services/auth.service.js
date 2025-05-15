import axios from 'axios';
import jwtDecode from 'jwt-decode';

const API_URL = '/api/auth/';

// 设置axios默认配置
axios.defaults.baseURL = process.env.REACT_APP_API_URL || '';

// 请求拦截器添加token
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = 'Bearer ' + token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器处理token过期
axios.interceptors.response.use(
  (response) => {
    return response;
  },  (error) => {
    // 只有当401错误不是由于登录失败引起的才重定向登录页面
    // 检查是否为登录路径失败的情况
    const isLoginEndpoint = error.config?.url?.includes(API_URL + 'login');
    
    if (error.response && error.response.status === 401 && !isLoginEndpoint) {
      logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * 用户登录
 * @param {string} username 用户名或邮箱
 * @param {string} password 密码
 * @returns {Promise} 登录结果
 */
export const login = async (username, password) => {
  const response = await axios.post(API_URL + 'login', { username, password });
  if (response.data.token) {
    localStorage.setItem('token', response.data.token);
    localStorage.setItem('user', JSON.stringify(response.data.user));
  }
  return response.data;
};

/**
 * 用户注册
 * @param {string} username 用户名
 * @param {string} email 邮箱
 * @param {string} password 密码
 * @returns {Promise} 注册结果
 */
export const register = async (username, email, password) => {
  return axios.post(API_URL + 'register', {
    username,
    email,
    password
  });
};

/**
 * 获取当前用户信息
 * @returns {Object|null} 用户信息
 */
export const getCurrentUser = () => {
  const token = localStorage.getItem('token');
  
  if (!token) {
    return null;
  }
  
  try {
    // 检查token是否过期
    const decoded = jwtDecode(token);
    const currentTime = Date.now() / 1000;
    
    if (decoded.exp < currentTime) {
      logout();
      return null;
    }
    
    return JSON.parse(localStorage.getItem('user'));
  } catch (error) {
    console.error('Token解析失败:', error);
    logout();
    return null;
  }
};

/**
 * 获取用户资料
 * @returns {Promise} 用户资料
 */
export const getUserProfile = async () => {
  return axios.get(API_URL + 'profile');
};

/**
 * 登出
 */
export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};
