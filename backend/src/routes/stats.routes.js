const express = require('express');
const { mysqlPool } = require('../config/database');

const router = express.Router();

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
    const [categoryStats] = await mysqlPool.execute(
      'SELECT category, COUNT(*) as count FROM artifacts GROUP BY category ORDER BY count DESC'
    );
    
    // 按地域统计
    const [locationStats] = await mysqlPool.execute(
      'SELECT location, COUNT(*) as count FROM artifacts GROUP BY location ORDER BY count DESC'
    );
    
    // 按年代统计
    const [eraStats] = await mysqlPool.execute(
      'SELECT era, COUNT(*) as count FROM artifacts GROUP BY era ORDER BY era'
    );
    
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
    const [timelineData] = await mysqlPool.execute(`
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
    const limit = parseInt(req.query.limit) || 10;
    
    // 获取最近的活动日志，并关联用户信息
    const [activities] = await mysqlPool.execute(`
      SELECT 
        l.id, l.user_id, l.action, l.target_id, l.timestamp, l.details,
        u.username as username
      FROM 
        logs l
      JOIN 
        users u ON l.user_id = u.id
      ORDER BY 
        l.timestamp DESC
      LIMIT ?
    `, [limit]);
    
    res.status(200).json({
      activities
    });
  } catch (error) {
    console.error('获取最近活动错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;
