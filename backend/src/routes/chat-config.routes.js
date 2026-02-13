/**
 * Chat Configuration Routes
 * AI 问答配置管理 API
 */

const express = require('express');
const { createLogger } = require('../utils/logger');
const chatConfigService = require('../services/ai/chat-config.service');
const modeManager = require('../services/ai/mode-manager');
const { getAllModes } = require('../services/ai/mode-prompts');
const { ensureRedisConnected, redisClient } = require('../config/database');

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
 *                 mode:
 *                   type: string
 *                   enum: [graph, knowledge, general]
 *                 model:
 *                   type: string
 *                   enum: [ONLINE, LOCAL, MOCK]
 *                 modelLocked:
 *                   type: boolean
 *                 enabledTools:
 *                   type: array
 *                   items:
 *                     type: string
 *                 graphView:
 *                   type: string
 *                   enum: [core, conservation]
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
 *                 description: 会话ID（必填）
 *               mode:
 *                 type: string
 *                 enum: [graph, knowledge, general]
 *               model:
 *                 type: string
 *                 enum: [ONLINE, LOCAL, MOCK]
 *               modelLocked:
 *                 type: boolean
 *               enabledTools:
 *                 type: array
 *                 items:
 *                   type: string
 *               graphView:
 *                 type: string
 *                 enum: [core, conservation]
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
    const { sessionId, mode, model, modelLocked, enabledTools, graphView } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId 是必填参数' });
    }

    // Build update object with only provided fields
    const updateData = {};
    if (mode !== undefined) updateData.mode = mode;
    if (model !== undefined) updateData.model = model;
    if (modelLocked !== undefined) updateData.modelLocked = modelLocked;
    if (enabledTools !== undefined) updateData.enabledTools = enabledTools;
    if (graphView !== undefined) updateData.graphView = graphView;

    // If model is being updated, also update the mode manager
    if (model !== undefined) {
      try {
        const currentMode = await modeManager.getCurrentMode();
        if (currentMode.mode !== model) {
          await modeManager.setMode(model, modelLocked || false, 'user');
          logger.info(`[ChatConfig] 模型模式已切换: ${currentMode.mode} -> ${model}`);
        }
      } catch (modeError) {
        logger.warn('[ChatConfig] 更新模型模式失败:', modeError);
        // Continue with config update even if mode manager update fails
      }
    }

    const updatedConfig = await chatConfigService.setConfig(sessionId, updateData);

    logger.info(`[ChatConfig] 会话 ${sessionId} 配置已更新`);
    res.status(200).json({
      message: '配置已更新',
      config: updatedConfig
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
 *                 mode:
 *                   type: string
 *                 model:
 *                   type: string
 *                 enabledTools:
 *                   type: array
 *                 graphView:
 *                   type: string
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
 * /api/chat/config/modes:
 *   get:
 *     summary: 获取可用问答模式列表
 *     tags: [Chat Config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 返回可用问答模式列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 modes:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/config/modes', async (req, res) => {
  try {
    const modes = getAllModes();
    res.status(200).json({ modes });
  } catch (error) {
    logger.error('[ChatConfig] 获取模式列表失败:', error);
    res.status(500).json({ message: '获取模式列表失败', error: error.message });
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
 *             required:
 *               - sessionId
 *             properties:
 *               sessionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: 配置已重置
 */
router.post('/config/reset', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId 是必填参数' });
    }

    const resetConfig = await chatConfigService.resetConfig(sessionId);
    
    logger.info(`[ChatConfig] 会话 ${sessionId} 配置已重置`);
    res.status(200).json({
      message: '配置已重置为默认值',
      config: resetConfig
    });
  } catch (error) {
    logger.error('[ChatConfig] 重置配置失败:', error);
    res.status(500).json({ message: '重置配置失败', error: error.message });
  }
});

module.exports = router;
