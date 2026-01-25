const express = require('express');
const router = express.Router();
const modeManager = require('../services/ai/mode-manager');
const healthCheckService = require('../services/ai/health-check.service');
const { authMiddleware, roleMiddleware } = require('../middleware/auth.middleware');

/**
 * @swagger
 * /api/mode/current:
 *   get:
 *     summary: 获取当前AI模式
 *     tags: [Mode]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current mode information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mode:
 *                   type: string
 *                   enum: [ONLINE, LOCAL, MOCK]
 *                 locked:
 *                   type: boolean
 *                 provider:
 *                   type: string
 *                 timeout:
 *                   type: number
 */
router.get('/current', authMiddleware, async (req, res) => {
    try {
        const modeInfo = await modeManager.getCurrentMode();
        res.json(modeInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /api/mode/lock:
 *   post:
 *     summary: 锁定当前模式 (仅管理员)
 *     tags: [Mode]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mode locked successfully
 */
router.post('/lock', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    try {
        const user = req.user.username || req.user.id || 'admin';
        const success = await modeManager.lockMode(user);
        if (success) {
            res.json({ message: 'Mode locked successfully' });
        } else {
            res.status(400).json({ error: 'Failed to lock mode' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /api/mode/unlock:
 *   post:
 *     summary: 解锁模式 (仅管理员)
 *     tags: [Mode]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mode unlocked successfully
 */
router.post('/unlock', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    try {
        const user = req.user.username || req.user.id || 'admin';
        const success = await modeManager.unlockMode(user);
        if (success) {
            res.json({ message: 'Mode unlocked successfully' });
        } else {
            res.status(400).json({ error: 'Failed to unlock mode' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /api/mode/history:
 *   get:
 *     summary: 获取模式切换历史
 *     tags: [Mode]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of records to return
 *     responses:
 *       200:
 *         description: Mode switch history
 */
router.get('/history', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const history = await modeManager.getModeHistory(limit);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /api/mode/health:
 *   get:
 *     summary: 获取所有模式的健康状态
 *     tags: [Mode]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health status for all modes
 */
router.get('/health', authMiddleware, async (req, res) => {
    try {
        const healthStatus = await healthCheckService.getAllHealthStatus();
        res.json(healthStatus);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;