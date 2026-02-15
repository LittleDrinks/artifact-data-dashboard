const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validation.middleware');
const mcpController = require('../services/infra/mcp-controller');
const { authMiddleware, roleMiddleware } = require('../middleware/auth.middleware');

/**
 * @swagger
 * /api/mcp/status:
 *   get:
 *     summary: 获取MCP启用状态
 *     tags: [MCP]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current MCP status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isEnabled:
 *                   type: boolean
 */
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const status = await mcpController.getStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /api/mcp/toggle:
 *   post:
 *     summary: 切换MCP启用状态 (仅管理员)
 *     tags: [MCP]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isEnabled
 *             properties:
 *               isEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: New status
 */
router.post('/toggle', 
  authMiddleware, 
  roleMiddleware(['admin']),
  [
    body('isEnabled').isBoolean().withMessage('isEnabled must be a boolean')
  ],
  validateRequest,
  async (req, res) => {
    try {
        const { isEnabled } = req.body;
        
        // req.user.username might be undefined depending on JWT payload.
        // auth.middleware says: req.user = decoded;
        // Let's assume decoded token has username or id. 
        // Usually it's req.user.username or req.user.id.
        const user = req.user.username || req.user.id || 'admin';
        
        const result = await mcpController.setStatus(isEnabled, user);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
