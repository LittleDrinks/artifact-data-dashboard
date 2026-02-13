/**
 * Chat Configuration Routes
 * AI 问答配置管理 API
 */

const express = require('express');
const { createLogger } = require('../utils/logger');
const chatConfigService = require('../services/ai/chat-config.service');
const modeManager = require('../services/ai/mode-manager');
const { ensureRedisConnected } = require('../config/database');

const logger = createLogger('ChatConfigRoutes');
const router = express.Router();

// Ensure Redis is connected
router.use(async (req, res, next) => {
  try {
    await ensureRedisConnected();
    return next();
  } catch (error) {
    logger.error('Redis不可用:', error);
    return res.status(503).json({ message: 'Redis不可用，请稍后再试' });
  }
});

/**
 * @swagger
 * /api/chat/config:
 *   get:
 *     summary: 获取当前会话的 AI 配置
 *     tags: [Chat Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         schema:
 *           type: string
 *         description: 会话ID，不提供则使用默认配置
 *     responses:
 *       200:
 *         description: 返回当前会话的 AI 配置
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model:
 *                   type: string
 *                   enum: [ONLINE, LOCAL, MOCK]
 *                 enabledTools:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get('/config', async (req, res) => {
  try {
    const { sessionId } = req.query;
    
    // If no sessionId provided, return default config
    if (!sessionId) {
      const defaultConfig = chatConfigService.getDefaultConfig();
      return res.status(200).json(defaultConfig);
    }

    const config = await chatConfigService.getConfig(sessionId);
    
    logger.debug(`[ChatConfig] 获取配置成功`, { sessionId, config });
    res.status(200).json(config);
  } catch (error) {
    logger.error('[ChatConfig] 获取配置失败:', error);
    res.status(500).json({ message: '获取配置失败', error: error.message });
  }
});

/**
 * @swagger
 * /api/chat/config:
 *   post:
 *     summary: 更新 AI 配置
 *     tags: [Chat Config]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: 会话ID（可选，不提供则使用临时配置）
 *               model:
 *                 type: string
 *                 enum: [ONLINE, LOCAL, MOCK]
 *               enabledTools:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: 配置已更新
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 config:
 *                   type: object
 */
router.post('/config', async (req, res) => {
  try {
    const { sessionId, model, enabledTools } = req.body;

    // Generate temporary sessionId if not provided
    const effectiveSessionId = sessionId || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build update object with only provided fields
    const updateData = {};
    if (model !== undefined) updateData.model = model;
    if (enabledTools !== undefined) updateData.enabledTools = enabledTools;

    // If model is being updated, also update the mode manager
    if (model !== undefined) {
      try {
        const currentMode = await modeManager.getCurrentMode();
        if (currentMode.mode !== model) {
          await modeManager.setMode(model, false, 'user');
          logger.info(`[ChatConfig] 模型模式已切换: ${currentMode.mode} -> ${model}`);
        }
      } catch (modeError) {
        logger.warn('[ChatConfig] 更新模型模式失败:', modeError);
        // Continue with config update even if mode manager update fails
      }
    }

    const updatedConfig = await chatConfigService.setConfig(effectiveSessionId, updateData);

    logger.info(`[ChatConfig] 会话 ${effectiveSessionId} 配置已更新`);
    res.status(200).json({
      message: '配置已更新',
      config: updatedConfig,
      sessionId: effectiveSessionId
    });
  } catch (error) {
    logger.error('[ChatConfig] 更新配置失败:', error);
    res.status(500).json({ message: '更新配置失败', error: error.message });
  }
});

/**
 * @swagger
 * /api/chat/config/default:
 *   get:
 *     summary: 获取默认配置
 *     tags: [Chat Config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 返回默认配置
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model:
 *                   type: string
 *                 enabledTools:
 *                   type: array
 */
router.get('/config/default', async (req, res) => {
  try {
    const defaultConfig = chatConfigService.getDefaultConfig();
    res.status(200).json(defaultConfig);
  } catch (error) {
    logger.error('[ChatConfig] 获取默认配置失败:', error);
    res.status(500).json({ message: '获取默认配置失败', error: error.message });
  }
});

/**
 * @swagger
 * /api/chat/config/tools:
 *   get:
 *     summary: 获取可用工具列表
 *     tags: [Chat Config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 返回可用工具列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tools:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       enabledByDefault:
 *                         type: boolean
 */
router.get('/config/tools', async (req, res) => {
  try {
    const tools = chatConfigService.getAvailableTools();
    res.status(200).json({ tools });
  } catch (error) {
    logger.error('[ChatConfig] 获取工具列表失败:', error);
    res.status(500).json({ message: '获取工具列表失败', error: error.message });
  }
});

/**
 * @swagger
 * /api/chat/config/health:
 *   get:
 *     summary: 获取模型健康状态
 *     tags: [Chat Config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 返回各模型健康状态
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 health:
 *                   type: object
 *                   properties:
 *                     ONLINE:
 *                       type: string
 *                       enum: [healthy, unhealthy, unknown]
 *                     LOCAL:
 *                       type: string
 *                       enum: [healthy, unhealthy, unknown]
 *                     MOCK:
 *                       type: string
 *                       enum: [healthy]
 */
router.get('/config/health', async (req, res) => {
  try {
    const health = await chatConfigService.getModelHealthStatus();
    res.status(200).json({ health });
  } catch (error) {
    logger.error('[ChatConfig] 获取模型健康状态失败:', error);
    res.status(500).json({ message: '获取模型健康状态失败', error: error.message });
  }
});

/**
 * @swagger
 * /api/chat/config/reset:
 *   post:
 *     summary: 重置会话配置为默认值
 *     tags: [Chat Config]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: 会话ID（可选）
 *     responses:
 *       200:
 *         description: 配置已重置
 */
router.post('/config/reset', async (req, res) => {
  try {
    const { sessionId } = req.body;

    // Generate temporary sessionId if not provided
    const effectiveSessionId = sessionId || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const resetConfig = await chatConfigService.resetConfig(effectiveSessionId);
    
    logger.info(`[ChatConfig] 会话 ${effectiveSessionId} 配置已重置`);
    res.status(200).json({
      message: '配置已重置为默认值',
      config: resetConfig,
      sessionId: effectiveSessionId
    });
  } catch (error) {
    logger.error('[ChatConfig] 重置配置失败:', error);
    res.status(500).json({ message: '重置配置失败', error: error.message });
  }
});

module.exports = router;
