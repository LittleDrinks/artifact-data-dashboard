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
  queueLimit: 0
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
const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
  password: process.env.REDIS_PASSWORD || undefined
});

// 连接Redis
(async () => {
  try {
    await redisClient.connect();
    console.log('Redis连接成功');
  } catch (err) {
    console.error('Redis连接失败:', err);
  }
})();

// 测试数据库连接
const testConnections = async () => {
  try {
    // 测试MySQL
    const mysqlConnection = await mysqlPool.getConnection();
    mysqlConnection.release();
    console.log('MySQL连接成功');

    // 测试Neo4j
    const neo4jSession = neo4jDriver.session();
    await neo4jSession.run('RETURN 1 AS result');
    await neo4jSession.close();
    console.log('Neo4j连接成功');

    return true;
  } catch (err) {
    console.error('数据库连接测试失败:', err);
    return false;
  }
};

// 优雅关闭数据库连接
const closeConnections = async () => {
  try {
    await mysqlPool.end();
    await neo4jDriver.close();
    await redisClient.disconnect();
    console.log('所有数据库连接已关闭');
  } catch (err) {
    console.error('关闭数据库连接时出错:', err);
  }
};

module.exports = {
  mysqlPool,
  neo4jDriver,
  redisClient,
  testConnections,
  closeConnections
};
