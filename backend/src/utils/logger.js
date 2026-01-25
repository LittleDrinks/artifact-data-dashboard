/**
 * Logger Factory
 * Feature: 003-code-quality-fixes / Phase 2 - 结构化日志系统
 * Purpose: 创建带模块标签的logger实例
 */

const baseLogger = require('../config/logger');

/**
 * 创建带模块标签的logger
 * @param {string} module - 模块名称（如 'CypherExecutor', 'ModeManager'）
 * @returns {Object} Logger实例，包含debug/info/warn/error方法
 */
function createLogger(module) {
  return {
    debug: (message, meta = {}) => {
      baseLogger.debug(message, { ...meta, module });
    },
    
    info: (message, meta = {}) => {
      baseLogger.info(message, { ...meta, module });
    },
    
    warn: (message, meta = {}) => {
      baseLogger.warn(message, { ...meta, module });
    },
    
    error: (message, meta = {}) => {
      baseLogger.error(message, { ...meta, module });
    },
    
    // 带性能计时的日志
    time: (label) => {
      const start = Date.now();
      return {
        end: (message, meta = {}) => {
          const duration = Date.now() - start;
          baseLogger.info(message || label, {
            ...meta,
            module,
            duration: `${duration}ms`
          });
        }
      };
    }
  };
}

/**
 * 创建HTTP请求日志中间件
 * @param {string} module - 模块名称
 * @returns {Function} Express中间件
 */
function createRequestLogger(module = 'HTTP') {
  const logger = createLogger(module);
  
  return (req, res, next) => {
    const start = Date.now();
    
    // 记录请求
    logger.info('Incoming request', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    
    // 监听响应完成
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 400 ? 'warn' : 'info';
      
      logger[level]('Request completed', {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration: `${duration}ms`
      });
    });
    
    next();
  };
}

module.exports = {
  createLogger,
  createRequestLogger
};
