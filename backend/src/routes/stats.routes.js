const express = require('express');
const { mysqlPool } = require('../config/database');
const { roleMiddleware } = require('../middleware/auth.middleware');

const router = express.Router();

const clampInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
};

/**
 * @swagger
 * /api/stats/overview:
 *   get:
 *     summary: 获取文物数据统计概览
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 返回统计数据
 */
router.get('/overview', async (req, res) => {
  try {
    // 获取文物总数
    const [totalResult] = await mysqlPool.execute('SELECT COUNT(*) as total FROM artifacts');
    const total = totalResult[0].total;
    
    // 获取已编目数量 (假设有is_cataloged字段)
    const [catalogedResult] = await mysqlPool.execute('SELECT COUNT(*) as total FROM artifacts WHERE is_cataloged = 1');
    const catalogedCount = catalogedResult[0].total;
    
    // 获取已数字化数量 (假设有is_digitized字段)
    const [digitizedResult] = await mysqlPool.execute('SELECT COUNT(*) as total FROM artifacts WHERE is_digitized = 1');
    const digitizedCount = digitizedResult[0].total;
    
    // 获取需修复数量 (假设有needs_repair字段)
    const [needsRepairResult] = await mysqlPool.execute('SELECT COUNT(*) as total FROM artifacts WHERE needs_repair = 1');
    const needsRepairCount = needsRepairResult[0].total;
    
    // 按类别统计
    const [rawCategoryStats] = await mysqlPool.execute(
      'SELECT category, COUNT(*) as count FROM artifacts GROUP BY category ORDER BY count DESC'
    );
    const categoryStats = rawCategoryStats.map(row => ({
      ...row,
      category: row.category && row.category.trim() ? row.category : '未分类'
    }));

    // 按地域统计
    const [rawLocationStats] = await mysqlPool.execute(
      'SELECT location, COUNT(*) as count FROM artifacts GROUP BY location ORDER BY count DESC'
    );
    const locationStats = rawLocationStats.map(row => ({
      ...row,
      location: row.location && row.location.trim() ? row.location : '未知地点'
    }));
    
    // 按年代统计
    const [rawEraStats] = await mysqlPool.execute(
      'SELECT era, COUNT(*) as count FROM artifacts GROUP BY era ORDER BY era'
    );
    const eraStats = rawEraStats.map(row => ({
      ...row,
      era: row.era && row.era.trim() ? row.era : '未知年代'
    }));
    
    res.status(200).json({
      total,
      catalogedCount,
      digitizedCount,
      needsRepairCount,
      categoryStats,
      locationStats,
      eraStats
    });
  } catch (error) {
    console.error('获取统计数据错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/stats/timeline:
 *   get:
 *     summary: 获取文物数据时间线统计
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 返回时间线统计数据
 */
router.get('/timeline', async (req, res) => {
  try {
    // 按年代统计文物数量，并按时间顺序排列
    const [timelineRaw] = await mysqlPool.execute(`
      SELECT era, COUNT(*) as count 
      FROM artifacts 
      GROUP BY era 
      ORDER BY CASE
        WHEN era = '新石器时代' THEN 1
        WHEN era = '夏商周' THEN 2
        WHEN era = '春秋战国' THEN 3
        WHEN era = '秦汉' THEN 4
        WHEN era = '三国两晋' THEN 5
        WHEN era = '南北朝' THEN 6
        WHEN era = '隋唐' THEN 7
        WHEN era = '宋元' THEN 8
        WHEN era = '明清' THEN 9
        ELSE 10
      END
    `);

    const timelineData = timelineRaw.map(row => ({
      ...row,
      era: row.era && row.era.trim() ? row.era : '未知年代'
    }));
    
    res.status(200).json({
      timeline: timelineData
    });
  } catch (error) {
    console.error('获取时间线数据错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/stats/recent-activities:
 *   get:
 *     summary: 获取最近活动日志
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: 返回记录数量
 *     responses:
 *       200:
 *         description: 返回最近活动数据
 */
router.get('/recent-activities', async (req, res) => {
  try {
    const limit = clampInt(req.query.limit, 10, 1, 100);

    // 获取最近的活动日志，使用 LEFT JOIN 关联用户信息（即使用户不存在也能返回日志）
    const [activities] = await mysqlPool.execute(
      `
        SELECT
          l.id, l.user_id, l.action, l.target_id, l.timestamp, l.details,
          IFNULL(u.username, '未知用户') as username
        FROM
          logs l
        LEFT JOIN
          users u ON l.user_id = u.id
        ORDER BY
          l.timestamp DESC
        LIMIT ${limit}
      `
    );
    
    res.status(200).json({
      activities
    });
  } catch (error) {
    console.error('获取最近活动错误:', error);
    const payload = { message: '服务器内部错误' };
    if (process.env.NODE_ENV !== 'production') {
      payload.error = error.message;
    }
    res.status(500).json(payload);
  }
});

/**
 * @swagger
 * /api/stats/test-recent-activities:
 *   get:
 *     summary: 测试最近活动API
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: 活动数据获取正常
 *       500:
 *         description: 活动数据获取失败
 */
router.get('/test-recent-activities', roleMiddleware(['admin']), async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ message: '接口不存在' });
    }

    // 记录环境信息，帮助诊断问题
    const dbInfo = {
      database: process.env.MYSQL_DATABASE || 'artifact_dashboard',
      host: process.env.MYSQL_HOST || 'mysql',
      user: process.env.MYSQL_USER || 'user',
      port: process.env.MYSQL_PORT || '3306',
      hasPassword: process.env.MYSQL_PASSWORD ? '已设置' : '未设置'
    };

    console.log('测试最近活动API - 数据库信息:', dbInfo);
    
    // 检查logs表中是否有数据
    let logsCount = 0;
    try {
      const [logsCountResult] = await mysqlPool.execute('SELECT COUNT(*) as count FROM logs');
      logsCount = logsCountResult[0].count;
    } catch (err) {
      console.error('检查logs表数据失败:', err);
      return res.status(500).json({
        status: 'error',
        message: '日志表不存在或无法访问',
        error: err.message,
        dbInfo
      });
    }
      // 检查users表中是否有数据
    let usersCount = 0;
    let usersError = null;
    try {
      const [usersCountResult] = await mysqlPool.execute('SELECT COUNT(*) as count FROM users');
      usersCount = usersCountResult[0].count;
    } catch (err) {
      console.error('检查users表数据失败:', err);
      usersError = {
        message: err.message,
        code: err.code
      };
      // 不返回错误，继续执行
    }

    // 定义结果变量
    let joinResult = null;
    let error = null;
    
    // 修改JOIN查询，使用LEFT JOIN，避免在没有匹配时出错
    try {
      const [activities] = await mysqlPool.execute(`
        SELECT 
          l.id, l.user_id, l.action, l.target_id, l.timestamp, l.details,
          IFNULL(u.username, '未知用户') as username
        FROM 
          logs l
        LEFT JOIN 
          users u ON l.user_id = u.id
        ORDER BY 
          l.timestamp DESC
        LIMIT 5
      `);
      
      joinResult = activities;
    } catch (err) {
      console.error('JOIN查询失败:', err);
      error = {
        message: err.message,
        stack: err.stack,
        type: 'DatabaseError'
      };
      
      // 尝试不使用JOIN的查询
      try {
        const [logsOnly] = await mysqlPool.execute(`
          SELECT * FROM logs ORDER BY timestamp DESC LIMIT 5
        `);
        joinResult = {
          logsOnly,
          warning: "由于数据库关联查询失败，仅显示原始日志数据。请检查users表和logs表的一致性。",
          originalError: err.message
        };
      } catch (fallbackErr) {
         joinResult = {
            error: "无法获取日志数据",
            details: fallbackErr.message
         };
      }
    }
    
    res.status(200).json({
      status: 'success',
      message: '最近活动API测试成功',
      logsCount: logsCount,
      usersCount: usersCount,
      usersError: usersError,
      testResult: joinResult,
      error,
      dbInfo
    });
  } catch (error) {
    console.error('测试最近活动API失败:', error);
    res.status(500).json({ 
      message: '测试失败',
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * @swagger
 * /api/stats/test-db-connection:
 *   get:
 *     summary: 测试数据库连接
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: 数据库连接正常
 *       500:
 *         description: 数据库连接失败
 */
router.get('/test-db-connection', roleMiddleware(['admin']), async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ message: '接口不存在' });
    }

    // 尝试执行一个简单的查询
    const [result] = await mysqlPool.execute('SELECT 1 as test');
    
    // 检查数据库中是否存在logs和users表
    const [tables] = await mysqlPool.execute(`      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ? 
      AND table_name IN ('logs', 'users', 'artifacts')
    `, [process.env.MYSQL_DATABASE || 'artifact_dashboard']);
    
    // 修复表名为null的问题
    const existingTables = tables && tables.length > 0 
      ? tables.filter(t => t && t.table_name).map(t => t.table_name) 
      : [];
    
    // 记录实际查询结果，用于调试
    console.log('数据库名称:', process.env.MYSQL_DATABASE || 'artifact_dashboard');
    console.log('表查询结果:', tables);

    // 获取logs表结构
    let logsColumns = [];
    if (existingTables.includes('logs')) {
      try {
        const [logsColumnsResult] = await mysqlPool.execute(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_schema = ? 
          AND table_name = 'logs'
        `, [process.env.MYSQL_DATABASE || 'artifact_dashboard']);
        logsColumns = logsColumnsResult || [];
        console.log('logs表列:', logsColumns);
      } catch (err) {
        console.error('获取logs表结构出错:', err);
      }
    }
    
    // 获取users表结构
    let usersColumns = [];
    if (existingTables.includes('users')) {
      try {
        const [usersColumnsResult] = await mysqlPool.execute(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_schema = ? 
          AND table_name = 'users'
        `, [process.env.MYSQL_DATABASE || 'artifact_dashboard']);
        usersColumns = usersColumnsResult || [];
        console.log('users表列:', usersColumns);
      } catch (err) {
        console.error('获取users表结构出错:', err);
      }
    }    // 检查logs和users表之间的关系
    let relationValid = false;
    let relationError = null;
    if (existingTables.includes('logs') && existingTables.includes('users')) {
      const logsUserIdCol = logsColumns.find(col => col.column_name === 'user_id');
      const usersIdCol = usersColumns.find(col => col.column_name === 'id');
      
      if (logsUserIdCol && usersIdCol) {
        // 简单检查是否有关联记录
        try {
          const [joinTest] = await mysqlPool.execute(`
            SELECT COUNT(*) as count
            FROM logs l
            LEFT JOIN users u ON l.user_id = u.id
            LIMIT 1
          `);
          relationValid = true;
        } catch (e) {
          console.error('检查logs和users关系出错:', e);
          relationValid = false;
          relationError = {
            message: e.message,
            code: e.code
          };
        }
      }
    }
    
    // 获取数据库信息以及环境变量，帮助诊断问题
    const dbInfo = {
      database: process.env.MYSQL_DATABASE || 'artifact_dashboard',
      host: process.env.MYSQL_HOST || 'mysql',
      user: process.env.MYSQL_USER || 'user',
      hasPassword: process.env.MYSQL_PASSWORD ? '已设置' : '未设置',
      port: process.env.MYSQL_PORT || '3306'
    };
      res.status(200).json({
      connection: 'success',
      message: '数据库连接正常',
      existingTables: existingTables.length > 0 ? existingTables : ['未找到表'],
      tablesFound: tables ? tables.length : 0,
      logsColumns,
      usersColumns,
      relationValid,
      relationError,
      dbInfo,
      dbTest: result[0]
    });
  } catch (error) {
    console.error('数据库连接测试失败:', error);
    res.status(500).json({ 
      connection: 'failed',
      message: '数据库连接失败',
      error: error.message 
    });
  }
});

module.exports = router;
