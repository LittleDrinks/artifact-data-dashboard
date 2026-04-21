import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：自动附加 JWT token
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// 响应拦截器：401 时跳转登录页（但不在登录页本身触发）
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Don't redirect if already on login page — the login form handles its own errors
      if (window.location.pathname !== '/login') {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default client;
