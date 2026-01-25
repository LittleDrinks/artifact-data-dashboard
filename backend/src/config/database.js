const { createLogger } = require('../utils/logger');
const logger = createLogger('Database');
const mysql = require('mysql2/promise');
const neo4j = require('neo4j-driver');
const redis = require('redis');

// MySQL连接池配置
const mysqlPool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4' // 明确指定字符集为utf8mb4
});

// Neo4j驱动配置
const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
  {
    maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3小时
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 2 * 60 * 1000 // 2分钟
  }
);

// Redis客户端配置
const redisPassword = process.env.REDIS_PASSWORD ? String(process.env.REDIS_PASSWORD) : '';

const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
  password: redisPassword ? redisPassword : undefined,
  socket: {
    reconnectStrategy: retries => Math.min(retries * 100, 2000),
    connectTimeout: 10000, // 增加连接超时到10秒
    keepAlive: 5000
  }
});

const classifyConnectionError = (service, err) => {
  const code = err && (err.code || err.name);
  const message = err && (err.message || String(err));

  const lower = String(message || '').toLowerCase();

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return {
      service,
      kind: 'dns',
      message: 'Host 解析失败（DNS/服务名不存在）',
      suggestion: '检查对应 *_HOST 是否正确（compose 内通常是服务名：mysql/neo4j/redis）'
    };
  }

  if (code === 'ECONNREFUSED') {
    return {
      service,
      kind: 'port',
      message: '连接被拒绝（端口未监听/服务未就绪）',
      suggestion: '检查服务是否启动、端口映射是否正确，以及容器健康状态'
    };
  }

  if (code === 'ER_ACCESS_DENIED_ERROR' || lower.includes('access denied') || lower.includes('wrongpass')) {
    return {
      service,
      kind: 'auth',
      message: '认证失败（用户名/密码不匹配）',
      suggestion: '检查 .env 中密码是否与容器侧一致（MYSQL_PASSWORD/NEO4J_PASSWORD/REDIS_PASSWORD）'
    };
  }

  if (code === 'ERR_BAD_DB_ERROR' || lower.includes('unknown database')) {
    return {
      service,
      kind: 'database',
      message: '数据库不存在',
      suggestion: '确认 MYSQL_DATABASE 设置正确，或运行 reset_data.bat 初始化数据库'
    };
  }

  if (code === 'ServiceUnavailable' || lower.includes('service unavailable')) {
    return {
      service,
      kind: 'service',
      message: '服务不可用/未就绪',
      suggestion: '检查服务是否启动、网络是否连通，以及 NEO4J_URI 是否正确'
    };
  }

  return {
    service,
    kind: 'unknown',
    message: message || '未知错误',
    suggestion: '查看完整错误栈与容器日志；重点核对 host/port/credential 是否一致'
  };
};

redisClient.on('error', err => {
  const diag = classifyConnectionError('redis', err);
  logger.error('Redis客户端错误:', diag);
});

let redisConnectPromise = null;

const ensureRedisConnected = async () => {
  if (redisClient.isOpen) {
    return;
  }

  if (!redisConnectPromise) {
    redisConnectPromise = redisClient.connect().catch(err => {
      redisConnectPromise = null;
      throw err;
    });
  }

  await redisConnectPromise;
};

// 连接Redis
(async () => {
  try {
    await ensureRedisConnected();
    logger.info('Redis连接成功');
  } catch (err) {
    const diag = classifyConnectionError('redis', err);
    logger.error('Redis连接失败:', diag);
  }
})();

// 测试数据库连接
const testConnections = async () => {
  let ok = true;

  // 测试MySQL
  try {
    const mysqlConnection = await mysqlPool.getConnection();
    mysqlConnection.release();
    logger.info('MySQL连接成功');
  } catch (err) {
    ok = false;
    const diag = classifyConnectionError('mysql', err);
    logger.error('MySQL连接失败:', diag);
  }

  // 测试Neo4j
  try {
    const neo4jSession = neo4jDriver.session();
    await neo4jSession.run('RETURN 1 AS result');
    await neo4jSession.close();
    logger.info('Neo4j连接成功');
  } catch (err) {
    ok = false;
    const diag = classifyConnectionError('neo4j', err);
    logger.error('Neo4j连接失败:', diag);
  }

  // 测试Redis
  try {
    await ensureRedisConnected();
    await redisClient.ping();
    logger.info('Redis连接成功');
  } catch (err) {
    ok = false;
    const diag = classifyConnectionError('redis', err);
    logger.error('Redis连接失败:', diag);
  }

  return ok;
};

// 优雅关闭数据库连接
const closeConnections = async () => {
  try {
    await mysqlPool.end();
    await neo4jDriver.close();
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
    logger.info('所有数据库连接已关闭');
  } catch (err) {
    logger.error('关闭数据库连接时出错:', err);
  }
};

module.exports = {
  mysqlPool,
  neo4jDriver,
  redisClient,
  ensureRedisConnected,
  testConnections,
  closeConnections
};
