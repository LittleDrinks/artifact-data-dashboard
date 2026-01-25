const express = require('express');
const { createLogger } = require('../utils/logger');

const logger = createLogger('ErrorMiddleware');

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
 * Feature: 003-code-quality-fixes / Phase 6 - 错误响应标准化
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // 记录错误（包含完整堆栈）
  if (statusCode === 404) {
    logger.warn('404 Not Found', { path: req.path, message: err.message });
  } else {
    logger.error('Request error', { 
      statusCode, 
      path: req.path, 
      method: req.method,
      error: err.message,
      stack: err.stack 
    });
  }
  
  // 生产环境：对500错误使用通用消息，避免泄露敏感信息
  let errorMessage = err.message || '服务器内部错误';
  if (isProduction && statusCode >= 500) {
    errorMessage = '服务器内部错误，请稍后重试';
  }
  
  // 构建标准错误响应
  const response = {
    success: false,
    error: {
      message: errorMessage,
      code: err.code || `ERROR_${statusCode}`
    },
    timestamp: new Date().toISOString()
  };
  
  // 添加详细错误信息（客户端错误4xx可以包含details）
  if (err.details && statusCode < 500) {
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
  
  // 非生产环境：添加调试信息
  if (!isProduction) {
    response.error.stack = err.stack;
    response.error.rawMessage = err.message; // 原始错误消息
  }
  
  // 发送错误响应
  res.status(statusCode).json(response);
};

module.exports = {
  ApiError,
  notFoundHandler,
  errorHandler
};
