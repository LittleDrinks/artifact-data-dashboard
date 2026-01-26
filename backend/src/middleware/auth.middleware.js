const jwt = require('jsonwebtoken');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AuthMiddleware');

/**
 * 从请求中提取 token
 * 支持: Authorization header, query 参数 (?token=xxx)
 */
const extractToken = (req) => {
  // 优先从 Authorization header 获取
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  
  // 备选：从 query 参数获取（用于 img src 等场景）
  if (req.query && req.query.token) {
    return req.query.token;
  }
  
  return null;
};

// 认证中间件
const authMiddleware = (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({ message: '未授权：Token不存在' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: '未授权：Token已过期' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: '未授权：无效的Token' });
    }
    
    logger.error('认证中间件错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
};

// 角色验证中间件
const roleMiddleware = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: '未授权：用户信息不存在' });
    }
    
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ message: '禁止访问：权限不足' });
    }
    
    next();
  };
};

module.exports = {
  authMiddleware,
  roleMiddleware
};
