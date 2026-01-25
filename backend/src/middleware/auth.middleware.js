const jwt = require('jsonwebtoken');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AuthMiddleware');

// 认证中间件
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: '未授权：无效的Token格式' });
    }
    
    const token = authHeader.split(' ')[1];
    
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
