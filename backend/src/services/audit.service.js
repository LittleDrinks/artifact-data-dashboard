const { mysqlPool } = require('../config/database');

const writeAuditLog = async ({ userId, action, targetId = null, details = null }) => {
  try {
    await mysqlPool.execute(
      'INSERT INTO logs (user_id, action, target_id, timestamp, details) VALUES (?, ?, ?, ?, ?)',
      [userId, action, targetId, new Date(), details]
    );
  } catch (error) {
    console.warn('写入日志失败:', error.message);
  }
};

module.exports = {
  writeAuditLog
};
