const express = require('express');
const { getAiPluginsStatus } = require('../services/ai/plugin-config');

const router = express.Router();

/**
 * @swagger
 * /api/ai-plugins/status:
 *   get:
 *     summary: 获取 AI 插件状态（Admin only）
 *     tags: [AI Plugins]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 返回当前 AI 插件配置与启用状态
 *       401:
 *         description: 未登录
 *       403:
 *         description: 权限不足
 */
router.get('/status', (req, res) => {
  return res.json({
    data: getAiPluginsStatus()
  });
});

module.exports = router;
