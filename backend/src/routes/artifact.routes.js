const express = require('express');
const { mysqlPool } = require('../config/database');
const { roleMiddleware } = require('../middleware/auth.middleware');

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

const parseBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', '是'].includes(normalized);
  }
  return false;
};

const normalizeText = (value, maxLen) => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  if (maxLen && trimmed.length > maxLen) {
    return trimmed.slice(0, maxLen);
  }
  return trimmed;
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
 * /api/artifacts:
 *   post:
 *     summary: 创建文物（仅管理员）
 *     tags: [Artifacts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: 创建成功
 *       400:
 *         description: 参数错误
 *       403:
 *         description: 权限不足
 */
router.post('/', roleMiddleware(['admin']), async (req, res) => {
  try {
    const payload = req.body || {};
    const name = normalizeText(payload.name, 255);
    if (!name) {
      return res.status(400).json({ message: '文物名称为必填项' });
    }

    const description = normalizeText(payload.description);
    const category = normalizeText(payload.category, 50);
    const era = normalizeText(payload.era, 50);
    const location = normalizeText(payload.location, 100);
    const imageUrl = normalizeText(payload.image_url ?? payload.imageUrl, 255);
    const tags = normalizeText(payload.tags);
    const isCataloged = parseBoolean(payload.is_cataloged ?? payload.isCataloged);
    const isDigitized = parseBoolean(payload.is_digitized ?? payload.isDigitized);
    const needsRepair = parseBoolean(payload.needs_repair ?? payload.needsRepair);

    const [result] = await mysqlPool.execute(
      `INSERT INTO artifacts
        (name, description, category, era, location, image_url, tags, is_cataloged, is_digitized, needs_repair, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        name,
        description,
        category,
        era,
        location,
        imageUrl,
        tags,
        isCataloged,
        isDigitized,
        needsRepair,
        new Date(),
        new Date()
      ]
    );

    const artifactId = result.insertId;

    if (req.user && req.user.id) {
      try {
        await mysqlPool.execute(
          'INSERT INTO logs (user_id, action, target_id, timestamp, details) VALUES (?, ?, ?, ?, ?)',
          [req.user.id, 'create_artifact', artifactId, new Date(), JSON.stringify({ name })]
        );
      } catch (logError) {
        console.error('记录创建文物日志错误:', logError);
      }
    }

    const [rows] = await mysqlPool.execute('SELECT * FROM artifacts WHERE id = ?', [artifactId]);
    return res.status(201).json(rows?.[0] || { id: artifactId });
  } catch (error) {
    console.error('创建文物错误:', error);
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

/**
 * @swagger
 * /api/artifacts/{id}:
 *   put:
 *     summary: 更新文物（仅管理员）
 *     tags: [Artifacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 更新成功
 *       400:
 *         description: 参数错误
 *       403:
 *         description: 权限不足
 *       404:
 *         description: 文物不存在
 */
router.put('/:id', roleMiddleware(['admin']), async (req, res) => {
  try {
    const artifactId = Number(req.params.id);
    if (!Number.isFinite(artifactId)) {
      return res.status(400).json({ message: '文物ID无效' });
    }

    const [existsRows] = await mysqlPool.execute('SELECT id FROM artifacts WHERE id = ?', [artifactId]);
    if (!existsRows || existsRows.length === 0) {
      return res.status(404).json({ message: '文物不存在' });
    }

    const payload = req.body || {};
    const updates = {
      name: payload.name !== undefined ? normalizeText(payload.name, 255) : undefined,
      description: payload.description !== undefined ? normalizeText(payload.description) : undefined,
      category: payload.category !== undefined ? normalizeText(payload.category, 50) : undefined,
      era: payload.era !== undefined ? normalizeText(payload.era, 50) : undefined,
      location: payload.location !== undefined ? normalizeText(payload.location, 100) : undefined,
      image_url:
        payload.image_url !== undefined || payload.imageUrl !== undefined
          ? normalizeText(payload.image_url ?? payload.imageUrl, 255)
          : undefined,
      tags: payload.tags !== undefined ? normalizeText(payload.tags) : undefined,
      is_cataloged:
        payload.is_cataloged !== undefined || payload.isCataloged !== undefined
          ? parseBoolean(payload.is_cataloged ?? payload.isCataloged)
          : undefined,
      is_digitized:
        payload.is_digitized !== undefined || payload.isDigitized !== undefined
          ? parseBoolean(payload.is_digitized ?? payload.isDigitized)
          : undefined,
      needs_repair:
        payload.needs_repair !== undefined || payload.needsRepair !== undefined
          ? parseBoolean(payload.needs_repair ?? payload.needsRepair)
          : undefined
    };

    const fields = [];
    const params = [];
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }
      if (key === 'name' && value === null) {
        return;
      }
      fields.push(`${key} = ?`);
      params.push(value);
    });

    if (!fields.length) {
      return res.status(400).json({ message: '没有可更新的字段' });
    }

    fields.push('updated_at = ?');
    params.push(new Date());
    params.push(artifactId);

    await mysqlPool.execute(`UPDATE artifacts SET ${fields.join(', ')} WHERE id = ?`, params);

    if (req.user && req.user.id) {
      try {
        await mysqlPool.execute(
          'INSERT INTO logs (user_id, action, target_id, timestamp, details) VALUES (?, ?, ?, ?, ?)',
          [req.user.id, 'update_artifact', artifactId, new Date(), JSON.stringify(Object.keys(updates).filter(k => updates[k] !== undefined))]
        );
      } catch (logError) {
        console.error('记录更新文物日志错误:', logError);
      }
    }

    const [rows] = await mysqlPool.execute('SELECT * FROM artifacts WHERE id = ?', [artifactId]);
    return res.status(200).json(rows?.[0] || { id: artifactId });
  } catch (error) {
    console.error('更新文物错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/artifacts/{id}:
 *   delete:
 *     summary: 删除文物（仅管理员）
 *     tags: [Artifacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 删除成功
 *       403:
 *         description: 权限不足
 *       404:
 *         description: 文物不存在
 */
router.delete('/:id', roleMiddleware(['admin']), async (req, res) => {
  try {
    const artifactId = Number(req.params.id);
    if (!Number.isFinite(artifactId)) {
      return res.status(400).json({ message: '文物ID无效' });
    }

    const [rows] = await mysqlPool.execute('SELECT id, name FROM artifacts WHERE id = ?', [artifactId]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: '文物不存在' });
    }

    await mysqlPool.execute('DELETE FROM artifacts WHERE id = ?', [artifactId]);

    if (req.user && req.user.id) {
      try {
        await mysqlPool.execute(
          'INSERT INTO logs (user_id, action, target_id, timestamp, details) VALUES (?, ?, ?, ?, ?)',
          [req.user.id, 'delete_artifact', artifactId, new Date(), JSON.stringify({ name: rows[0].name })]
        );
      } catch (logError) {
        console.error('记录删除文物日志错误:', logError);
      }
    }

    return res.status(200).json({ message: '删除成功' });
  } catch (error) {
    console.error('删除文物错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;
