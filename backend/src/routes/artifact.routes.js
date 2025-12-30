const express = require('express');
const { mysqlPool } = require('../config/database');

const router = express.Router();

const clampInt = (value, { min, max, fallback }) => {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  if (num < min) {
    return min;
  }
  if (num > max) {
    return max;
  }
  return num;
};

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
 *         description: 每页数量（最大100）
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
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: 按出土地筛选
 *     responses:
 *       200:
 *         description: 返回文物列表
 */
router.get('/', async (req, res) => {
  try {
    const page = clampInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 10 });
    const offset = (page - 1) * limit;

    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const era = typeof req.query.era === 'string' ? req.query.era.trim() : '';
    const location = typeof req.query.location === 'string' ? req.query.location.trim() : '';

    let whereSql = 'WHERE 1=1';
    const whereParams = [];

    if (category) {
      whereSql += ' AND category = ?';
      whereParams.push(category);
    }

    if (era) {
      whereSql += ' AND era = ?';
      whereParams.push(era);
    }

    if (location) {
      whereSql += ' AND location = ?';
      whereParams.push(location);
    }

    const listSql = `SELECT * FROM artifacts ${whereSql} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`;
    const countSql = `SELECT COUNT(*) as total FROM artifacts ${whereSql}`;

    const [artifacts] = await mysqlPool.execute(listSql, whereParams);
    const [countRows] = await mysqlPool.execute(countSql, whereParams);

    const total = countRows?.[0]?.total ?? 0;
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
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
    return res.status(500).json({ message: '服务器内部错误' });
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
 *         description: 搜索关键词（名称/描述/出土地/类别/年代）
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
 *         description: 每页数量（最大100）
 *     responses:
 *       200:
 *         description: 返回搜索结果
 */
router.get('/search', async (req, res) => {
  try {
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    if (!keyword) {
      return res.status(400).json({ message: '搜索关键词为必填项' });
    }

    const page = clampInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 10 });
    const offset = (page - 1) * limit;

    const searchPattern = `%${keyword}%`;

    const listSql = `
      SELECT *
      FROM artifacts
      WHERE name LIKE ?
         OR description LIKE ?
         OR location LIKE ?
         OR category LIKE ?
         OR era LIKE ?
      ORDER BY id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const listParams = [
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern
    ];

    const [artifacts] = await mysqlPool.execute(listSql, listParams);

    const countSql = `
      SELECT COUNT(*) as total
      FROM artifacts
      WHERE name LIKE ?
         OR description LIKE ?
         OR location LIKE ?
         OR category LIKE ?
         OR era LIKE ?
    `;

    const [countRows] = await mysqlPool.execute(countSql, [
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern
    ]);

    const total = countRows?.[0]?.total ?? 0;
    const totalPages = Math.ceil(total / limit);

    if (req.user && req.user.id) {
      try {
        await mysqlPool.execute(
          'INSERT INTO logs (user_id, action, target_id, timestamp, details) VALUES (?, ?, ?, ?, ?)',
          [req.user.id, 'search', null, new Date(), JSON.stringify({ keyword })]
        );
      } catch (logError) {
        console.error('记录搜索日志错误:', logError);
      }
    }

    return res.status(200).json({
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
    return res.status(500).json({ message: '服务器内部错误' });
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
    const artifactId = Number(req.params.id);
    if (!Number.isFinite(artifactId)) {
      return res.status(400).json({ message: '文物ID无效' });
    }

    const [artifacts] = await mysqlPool.execute('SELECT * FROM artifacts WHERE id = ?', [artifactId]);
    if (!artifacts || artifacts.length === 0) {
      return res.status(404).json({ message: '文物不存在' });
    }

    if (req.user && req.user.id) {
      try {
        await mysqlPool.execute(
          'INSERT INTO logs (user_id, action, target_id, timestamp) VALUES (?, ?, ?, ?)',
          [req.user.id, 'view_artifact', artifactId, new Date()]
        );
      } catch (logError) {
        console.error('记录查看日志错误:', logError);
      }
    }

    return res.status(200).json(artifacts[0]);
  } catch (error) {
    console.error('获取文物详情错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;
