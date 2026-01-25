/**
 * Validation Middleware
 * Feature: 003-code-quality-fixes / Phase 5 - API输入验证
 * Purpose: 统一的请求验证中间件
 */

const { validationResult } = require('express-validator');
const { createLogger } = require('../utils/logger');

const logger = createLogger('ValidationMiddleware');

/**
 * 验证请求中间件
 * 在express-validator验证规则后使用
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation failed', {
      path: req.path,
      method: req.method,
      errors: errors.array()
    });
    
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  
  next();
};

module.exports = {
  validateRequest
};
