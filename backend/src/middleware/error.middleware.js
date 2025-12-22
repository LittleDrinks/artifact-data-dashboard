const express = require('express');

/**
 * 自定义API错误类
 */
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404路由错误处理中间件
 */
const notFoundHandler = (req, res, next) => {
  const url = req.originalUrl || '';

  // 仅把 API 路径的 404 当作“接口不存在”错误；
  // 其余路径（如前端热更新资源、静态文件探测）直接返回 404，避免刷屏堆栈日志。
  const isApiRequest = url.startsWith('/api') || url.startsWith('/health') || url.startsWith('/api-docs');
  if (!isApiRequest) {
    return res.status(404).end();
  }

  const error = new ApiError(404, `接口不存在: ${url}`);
  next(error);
};

/**
 * 全局错误处理中间件
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  if (statusCode === 404) {
    console.warn('404 Not Found:', err.message);
  } else {
    console.error('全局错误处理:', err.stack);
  }
  
  // 默认状态码和错误响应
  const response = {
    success: false,
    error: {
      message: err.message || '服务器内部错误'
    },
    timestamp: new Date().toISOString()
  };
  
  // 添加详细错误信息（如果有）
  if (err.details) {
    response.error.details = err.details;
  }
  
  // 根据错误类型定制响应
  if (err.name === 'ValidationError') {
    response.error.message = '数据验证错误';
    response.error.details = err.details || err.message;
    return res.status(400).json(response);
  }
  
  if (err.name === 'UnauthorizedError') {
    response.error.message = '认证错误';
    return res.status(401).json(response);
  }

  if (err.name === 'ForbiddenError') {
    response.error.message = '权限不足';
    return res.status(403).json(response);
  }
  
  // 非生产环境下添加错误堆栈信息
  if (process.env.NODE_ENV !== 'production') {
    response.error.stack = err.stack;
  }
  
  // 发送错误响应
  res.status(statusCode).json(response);
};

module.exports = {
  ApiError,
  notFoundHandler,
  errorHandler
};
