/**
 * Winston Logger Configuration
 * Feature: 003-code-quality-fixes / Phase 2 - 结构化日志系统
 * Purpose: 企业级日志管理，支持轮转、脱敏、多Transport
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// 日志配置
const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const maxSize = process.env.LOG_MAX_SIZE || '20m';
const maxFiles = process.env.LOG_MAX_FILES || '14d';

// 确保日志目录存在
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 敏感信息脱敏
const redactFormat = winston.format((info) => {
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization', 'cookie', 'api_key'];
  
  const redactValue = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    const result = Array.isArray(obj) ? [] : {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(k => lowerKey.includes(k))) {
        result[key] = '***REDACTED***';
      } else if (typeof value === 'object') {
        result[key] = redactValue(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  };
  
  return redactValue(info);
});

// 日志格式
const logFormat = winston.format.combine(
  redactFormat(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] })
);

// JSON格式（生产环境）
const jsonFormat = winston.format.combine(
  logFormat,
  winston.format.json()
);

// 可读格式（开发环境）
const prettyFormat = winston.format.combine(
  logFormat,
  winston.format.printf(({ timestamp, level, message, metadata }) => {
    const meta = metadata && Object.keys(metadata).length 
      ? `\n${JSON.stringify(metadata, null, 2)}` 
      : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message}${meta}`;
  })
);

// Transport配置
const transports = [
  // 错误日志（仅error级别）
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxSize,
    maxFiles,
    format: jsonFormat,
    zippedArchive: true
  }),
  
  // 综合日志（所有级别）
  new DailyRotateFile({
    filename: path.join(logDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize,
    maxFiles,
    format: jsonFormat,
    zippedArchive: true
  })
];

// 开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        prettyFormat
      )
    })
  );
}

// 创建logger实例
const logger = winston.createLogger({
  level: logLevel,
  transports,
  exitOnError: false,
  // 处理未捕获的异常和拒绝
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize,
      maxFiles: '30d',
      format: jsonFormat
    })
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize,
      maxFiles: '30d',
      format: jsonFormat
    })
  ]
});

// 启动日志
logger.info('Logger initialized', {
  level: logLevel,
  logDir,
  environment: process.env.NODE_ENV || 'development'
});

module.exports = logger;
