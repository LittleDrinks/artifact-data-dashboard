/**
 * Cypher Query API Routes
 * Feature: 002-enhance-smart-qa / US4 - Cypher集成
 * Purpose: HTTP endpoints for executing and auditing Cypher queries
 */

const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const { createLogger } = require('../utils/logger');
const { validateRequest } = require('../middleware/validation.middleware');
const { validateQuery } = require('../services/kg/cypher-validator');
const { executeQuery, executeQueryAsTable, getDatabaseInfo, testConnection } = require('../services/kg/cypher-executor');
const auditService = require('../services/utils/audit.service');
const { authMiddleware, roleMiddleware } = require('../middleware/auth.middleware');

const logger = createLogger('CypherRoutes');

/**
 * @swagger
 * /api/cypher/execute:
 *   post:
 *     summary: 执行Cypher只读查询
 *     tags: [Cypher]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: Cypher query to execute (read-only)
 *               params:
 *                 type: object
 *                 description: Query parameters
 *               format:
 *                 type: string
 *                 enum: [json, table]
 *                 default: json
 *                 description: Response format
 *     responses:
 *       200:
 *         description: Query executed successfully
 *       400:
 *         description: Validation failed
 *       403:
 *         description: Unauthorized
 *       500:
 *         description: Execution error
 */
router.post('/execute', 
  authMiddleware,
  [
    body('query').isString().notEmpty().withMessage('Query is required')
      .isLength({ max: 10000 }).withMessage('Query exceeds maximum length (10000 characters)'),
    body('params').optional().isObject().withMessage('Params must be an object'),
    body('format').optional().isIn(['json', 'table']).withMessage('Format must be json or table')
  ],
  validateRequest,
  async (req, res) => {
  try {
    const { query, params = {}, format = 'json' } = req.body;
    const executor = req.user?.username || req.user?.id || 'anonymous';

    // Validate query
    const validation = await validateQuery(query, {
      executor,
      permissionLevel: 'user'
    });

    if (!validation.isValid) {
      // Log failed validation attempt
      await auditService.logCypherQuery({
        queryText: query,
        executor,
        executionTime: null,
        isValid: false,
        validationErrors: validation.errors
      });

      return res.status(400).json({
        success: false,
        error: 'Query validation failed',
        validationErrors: validation.errors,
        warnings: validation.warnings
      });
    }

    // Execute query
    const executionOptions = {
      executor,
      timeout: 30000, // 30 seconds max
      maxResults: 1000 // Max 1000 results
    };

    const result = format === 'table' 
      ? await executeQueryAsTable(query, params, executionOptions)
      : await executeQuery(query, params, executionOptions);

    // Log execution
    await auditService.logCypherQuery({
      queryText: query,
      executor,
      executionTime: result.executionTime,
      isValid: result.success,
      resultSummary: result.success ? `${result.summary.recordCount} records` : result.error
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
        executionTime: result.executionTime
      });
    }

    res.json({
      success: true,
      data: format === 'table' ? result.table : result.records,
      summary: result.summary,
      warnings: validation.warnings
    });
  } catch (error) {
    logger.error('[Cypher API] Execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/cypher/validate:
 *   post:
 *     summary: 验证Cypher查询（不执行）
 *     tags: [Cypher]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *     responses:
 *       200:
 *         description: Validation result
 */
router.post('/validate', authMiddleware, async (req, res) => {
  try {
    const { query } = req.body;
    const executor = req.user?.username || req.user?.id || 'anonymous';

    const validation = await validateQuery(query, {
      executor,
      permissionLevel: 'user'
    });

    res.json({
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings,
      metadata: validation.metadata
    });
  } catch (error) {
    logger.error('[Cypher API] Validation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/cypher/audit-logs:
 *   get:
 *     summary: 获取Cypher查询审计日志
 *     tags: [Cypher]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of records to return
 *       - in: query
 *         name: executor
 *         schema:
 *           type: string
 *         description: Filter by executor
 *       - in: query
 *         name: isValid
 *         schema:
 *           type: boolean
 *         description: Filter by validation status
 *     responses:
 *       200:
 *         description: Audit logs
 *       403:
 *         description: Unauthorized (admin only)
 */
router.get('/audit-logs', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { limit = 50, executor, isValid } = req.query;

    const filters = {};
    if (executor) filters.executor = executor;
    if (isValid !== undefined) filters.isValid = isValid === 'true';

    const logs = await auditService.getCypherAuditLogs(parseInt(limit, 10), filters);

    res.json({
      success: true,
      logs,
      count: logs.length
    });
  } catch (error) {
    logger.error('[Cypher API] Failed to get audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/cypher/db-info:
 *   get:
 *     summary: 获取Neo4j数据库信息
 *     tags: [Cypher]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Database information
 */
router.get('/db-info', authMiddleware, async (req, res) => {
  try {
    const info = await getDatabaseInfo();
    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    logger.error('[Cypher API] Failed to get database info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/cypher/health:
 *   get:
 *     summary: 测试Neo4j连接
 *     tags: [Cypher]
 *     responses:
 *       200:
 *         description: Connection status
 */
router.get('/health', async (req, res) => {
  try {
    const healthy = await testConnection();
    res.json({
      healthy,
      message: healthy ? 'Neo4j connection is healthy' : 'Neo4j connection failed'
    });
  } catch (error) {
    res.status(500).json({
      healthy: false,
      error: error.message
    });
  }
});

module.exports = router;
