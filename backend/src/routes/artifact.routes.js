const express = require('express');
const { mysqlPool } = require('../config/database');

const router = express.Router();

/**
 * @swagger
 * /api/artifacts:
 *   get:
 *     summary: 获取文物列表
 *     tags: [Artifacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: 每页数量
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: 按类别筛选
 *       - in: query
 *         name: era
 *         schema:
 *           type: string
 *         description: 按年代筛选
 *     responses:
 *       200:
 *         description: 返回文物列表
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    const { category, era, location } = req.query;
    
    let query = 'SELECT * FROM artifacts WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM artifacts WHERE 1=1';
    let params = [];
    
    if (category) {
      query += ' AND category = ?';
      countQuery += ' AND category = ?';
      params.push(category);
    }
    
    if (era) {
      query += ' AND era = ?';
      countQuery += ' AND era = ?';
      params.push(era);
    }
    
    if (location) {
      query += ' AND location = ?';
      countQuery += ' AND location = ?';
      params.push(location);
    }
    
    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const [artifacts] = await mysqlPool.execute(query, params);
    const [countResult] = await mysqlPool.execute(countQuery, params.slice(0, -2));
    
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);
    
    res.status(200).json({
      data: artifacts,
      meta: {
        total,
        page,
        limit,
        totalPages
      }
    });
  } catch (error) {
    console.error('获取文物列表错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/artifacts/{id}:
 *   get:
 *     summary: 获取单个文物详情
 *     tags: [Artifacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 文物ID
 *     responses:
 *       200:
 *         description: 返回文物详情
 *       404:
 *         description: 文物不存在
 */
router.get('/:id', async (req, res) => {
  try {
    const artifactId = req.params.id;
    
    const [artifacts] = await mysqlPool.execute(
      'SELECT * FROM artifacts WHERE id = ?',
      [artifactId]
    );
    
    if (artifacts.length === 0) {
      return res.status(404).json({ message: '文物不存在' });
    }
    
    // 记录查看日志
    await mysqlPool.execute(
      'INSERT INTO logs (user_id, action, target_id, timestamp) VALUES (?, ?, ?, ?)',
      [req.user.id, 'view_artifact', artifactId, new Date()]
    );
    
    res.status(200).json(artifacts[0]);
  } catch (error) {
    console.error('获取文物详情错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/artifacts/search:
 *   get:
 *     summary: 搜索文物
 *     tags: [Artifacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         required: true
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: 每页数量
 *     responses:
 *       200:
 *         description: 返回搜索结果
 */
router.get('/search', async (req, res) => {
  try {
    const { keyword } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    if (!keyword) {
      return res.status(400).json({ message: '搜索关键词为必填项' });
    }
    
    // 全文搜索
    const query = `
      SELECT * FROM artifacts 
      WHERE 
        MATCH(name, description, tags) AGAINST(? IN NATURAL LANGUAGE MODE) 
      OR name LIKE ? 
      OR description LIKE ? 
      OR category LIKE ? 
      OR era LIKE ? 
      OR location LIKE ? 
      OR tags LIKE ?
      ORDER BY 
        CASE 
          WHEN name LIKE ? THEN 1
          WHEN description LIKE ? THEN 2
          ELSE 3
        END
      LIMIT ? OFFSET ?
    `;
    
    const searchParam = `%${keyword}%`;
    
    const [artifacts] = await mysqlPool.execute(query, [
      keyword, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam,
      searchParam, searchParam, limit, offset
    ]);
    
    const [countResult] = await mysqlPool.execute(
      `SELECT COUNT(*) as total FROM artifacts 
       WHERE 
         MATCH(name, description, tags) AGAINST(? IN NATURAL LANGUAGE MODE) 
       OR name LIKE ? 
       OR description LIKE ? 
       OR category LIKE ? 
       OR era LIKE ? 
       OR location LIKE ? 
       OR tags LIKE ?`,
      [keyword, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam]
    );
    
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);
    
    // 记录搜索日志
    await mysqlPool.execute(
      'INSERT INTO logs (user_id, action, target_id, timestamp, details) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'search', null, new Date(), JSON.stringify({ keyword })]
    );
    
    res.status(200).json({
      data: artifacts,
      meta: {
        total,
        page,
        limit,
        totalPages,
        keyword
      }
    });
  } catch (error) {
    console.error('搜索文物错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;
