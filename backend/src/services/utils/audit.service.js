const { mysqlPool } = require('../../config/database');

/**
 * Audit Service
 * Extended for Feature: 002-enhance-smart-qa
 * Purpose: Log user actions, Cypher queries, and mode switching events
 */

/**
 * Write generic audit log entry
 * @param {Object} params - Log parameters
 * @param {number} params.userId - User ID
 * @param {string} params.action - Action performed
 * @param {number} params.targetId - Target entity ID
 * @param {string} params.details - Additional details
 */
const writeAuditLog = async ({ userId, action, targetId = null, details = null }) => {
  try {
    await mysqlPool.execute(
      'INSERT INTO logs (user_id, action, target_id, timestamp, details) VALUES (?, ?, ?, ?, ?)',
      [userId, action, targetId, new Date(), details]
    );
  } catch (error) {
    logger.warn('写入日志失败', { error: error.message });
  }
};

/**
 * Log Cypher query execution
 * Feature: US4 - Cypher查询集成
 * @param {Object} params - Cypher audit parameters
 * @param {string} params.queryText - Cypher query text
 * @param {string} params.executor - User or system executing the query
 * @param {number} params.executionTime - Execution time in seconds
 * @param {string} params.resultSummary - Summary of query results
 * @param {boolean} params.isValid - Whether query passed validation
 * @param {Array<string>} params.validationErrors - Validation error messages
 * @returns {Promise<number>} Audit log ID
 */
const logCypherQuery = async ({
  queryText,
  executor,
  executionTime = null,
  resultSummary = null,
  isValid = true,
  validationErrors = []
}) => {
  try {
    const errorsJson = validationErrors.length > 0 
      ? JSON.stringify(validationErrors) 
      : null;
    
    const [result] = await mysqlPool.execute(
      `INSERT INTO cypher_audit_log 
       (query_text, executor, execution_time, result_summary, is_valid, validation_errors, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [queryText, executor, executionTime, resultSummary, isValid, errorsJson]
    );
    
    logger.info(`[Audit] Cypher query logged: executor=${executor}, valid=${isValid}`);
    return result.insertId;
  } catch (error) {
    logger.error('Failed to log Cypher query', { error: error.message });
    throw error;
  }
};

/**
 * Log AI mode switching event
 * Feature: US3 - 模式切换机制
 * @param {Object} params - Mode switch parameters
 * @param {string} params.fromMode - Previous mode (ONLINE/LOCAL/MOCK)
 * @param {string} params.toMode - New mode
 * @param {string} params.reason - Reason for switch (auto-fallback, user-request, health-check)
 * @param {string} params.triggeredBy - User or system triggering the switch
 * @param {Object} params.metadata - Additional metadata
 */
const logModeSwitch = async ({
  fromMode,
  toMode,
  reason,
  triggeredBy = 'system',
  metadata = {}
}) => {
  try {
    const details = JSON.stringify({
      fromMode,
      toMode,
      reason,
      timestamp: new Date().toISOString(),
      ...metadata
    });
    
    // Log to generic logs table with special action type
    await mysqlPool.execute(
      `INSERT INTO logs (user_id, action, target_id, timestamp, details) 
       VALUES (NULL, ?, NULL, NOW(), ?)`,
      [`mode_switch`, details]
    );
    
    logger.info(`[Audit] Mode switch logged: ${fromMode} → ${toMode} (${reason}) by ${triggeredBy}`);
  } catch (error) {
    logger.error('Failed to log mode switch', { error: error.message });
  }
};

/**
 * Log MCP status change event
 * Feature: US2 - MCP关闭和启用管理
 * @param {Object} params - MCP status change parameters
 * @param {boolean} params.enabled - New MCP enabled status
 * @param {string} params.updatedBy - User making the change
 * @param {string} params.reason - Optional reason for change
 */
const logMCPStatusChange = async ({
  enabled,
  updatedBy,
  reason = null
}) => {
  try {
    const details = JSON.stringify({
      status: enabled ? 'enabled' : 'disabled',
      reason,
      timestamp: new Date().toISOString()
    });
    
    await mysqlPool.execute(
      `INSERT INTO logs (user_id, action, target_id, timestamp, details) 
       VALUES (NULL, ?, NULL, NOW(), ?)`,
      [`mcp_status_change`, details]
    );
    
    // Also update mcp_settings table
    await mysqlPool.execute(
      `UPDATE mcp_settings SET is_enabled = ?, updated_by = ?, updated_at = NOW() WHERE id = 1`,
      [enabled, updatedBy]
    );
    
    logger.info(`[Audit] MCP status changed: ${enabled ? 'enabled' : 'disabled'} by ${updatedBy}`);
  } catch (error) {
    logger.error('Failed to log MCP status change', { error: error.message });
  }
};

/**
 * Get recent Cypher query audit logs
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of logs to return
 * @param {string} options.executor - Filter by executor
 * @param {boolean} options.validOnly - Only return valid queries
 * @returns {Promise<Array>} Array of audit log entries
 */
const getCypherAuditLogs = async ({
  limit = 100,
  executor = null,
  validOnly = false
} = {}) => {
  try {
    let query = 'SELECT * FROM cypher_audit_log WHERE 1=1';
    const params = [];
    
    if (executor) {
      query += ' AND executor = ?';
      params.push(executor);
    }
    
    if (validOnly) {
      query += ' AND is_valid = TRUE';
    }
    
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    
    const [rows] = await mysqlPool.execute(query, params);
    return rows;
  } catch (error) {
    logger.error('Failed to get Cypher audit logs', { error: error.message });
    return [];
  }
};

/**
 * Get mode switch history
 * @param {number} limit - Maximum number of logs to return
 * @returns {Promise<Array>} Array of mode switch events
 */
const getModeSwitchHistory = async (limit = 50) => {
  try {
    const [rows] = await mysqlPool.execute(
      `SELECT * FROM logs WHERE action = 'mode_switch' ORDER BY timestamp DESC LIMIT ?`,
      [limit]
    );
    
    return rows.map(row => ({
      ...row,
      details: JSON.parse(row.details)
    }));
  } catch (error) {
    logger.error('Failed to get mode switch history', { error: error.message });
    return [];
  }
};

/**
 * Get audit statistics
 * @returns {Promise<Object>} Audit statistics summary
 */
const getAuditStats = async () => {
  try {
    const [[cypherStats]] = await mysqlPool.execute(
      `SELECT 
        COUNT(*) as total_queries,
        SUM(CASE WHEN is_valid = TRUE THEN 1 ELSE 0 END) as valid_queries,
        SUM(CASE WHEN is_valid = FALSE THEN 1 ELSE 0 END) as invalid_queries,
        AVG(execution_time) as avg_execution_time
       FROM cypher_audit_log
       WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );
    
    const [[modeSwitchCount]] = await mysqlPool.execute(
      `SELECT COUNT(*) as count FROM logs 
       WHERE action = 'mode_switch' AND timestamp > DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );
    
    return {
      cypher: cypherStats,
      modeSwitches: modeSwitchCount.count,
      period: '24h'
    };
  } catch (error) {
    logger.error('Failed to get audit stats', { error: error.message });
    return null;
  }
};

module.exports = {
  writeAuditLog,
  logCypherQuery,
  logModeSwitch,
  logMCPStatusChange,
  getCypherAuditLogs,
  getModeSwitchHistory,
  getAuditStats
};
