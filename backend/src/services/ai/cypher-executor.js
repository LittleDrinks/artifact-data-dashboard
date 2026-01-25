/**
 * Cypher Query Executor Service
 * Feature: 002-enhance-smart-qa / US4 - Cypher集成
 * Purpose: Execute validated Cypher queries against Neo4j with timeout and result limits
 */

const { createLogger } = require('../../utils/logger');
const logger = createLogger('CypherExecutor');
const { neo4jDriver } = require('../../config/database');
const { VALIDATION_CONFIG } = require('../../../config/cypher-rules');

/**
 * Execute a Cypher query against Neo4j
 * @param {string} query - Validated Cypher query
 * @param {Object} params - Query parameters (optional)
 * @param {Object} options - Execution options
 * @param {number} options.timeout - Timeout in milliseconds
 * @param {number} options.maxResults - Maximum number of results to return
 * @param {string} options.executor - Who is executing the query
 * @returns {Promise<Object>} Execution result { records: Array, summary: Object, executionTime: number }
 */
async function executeQuery(query, params = {}, options = {}) {
  const {
    timeout = VALIDATION_CONFIG.maxExecutionTime * 1000, // Convert seconds to ms
    maxResults = VALIDATION_CONFIG.maxResultRows,
    executor = 'system'
  } = options;

  const startTime = Date.now();
  const session = neo4jDriver.session();
  let sessionClosed = false;

  // 确保session被关闭（幂等）
  const closeSession = async () => {
    if (!sessionClosed) {
      sessionClosed = true;
      try {
        await session.close();
      } catch (err) {
        logger.warn('Failed to close Neo4j session', { error: err.message });
      }
    }
  };

  try {
    logger.debug(`Executing query for ${executor}...`);
    logger.debug(`Query: ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`);

    // 修复：使用Neo4j事务级别超时，让服务端提前终止查询
    const txConfig = { timeout: timeout };
    
    // 客户端超时保护
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Query execution timeout after ${timeout}ms`)), timeout);
    });

    const executionPromise = session.run(query, params, txConfig);

    let result;
    let timedOut = false;
    
    try {
      result = await Promise.race([executionPromise, timeoutPromise]);
    } catch (error) {
      if (error.message.includes('timeout')) {
        timedOut = true;
        // 超时后等待查询完成以避免资源泄漏
        logger.warn('Query timeout, waiting for cleanup...', { timeout });
        try {
          await executionPromise;
        } catch (cleanupError) {
          // 忽略清理时的错误
        }
      }
      throw error;
    }

    // Extract records
    const records = result.records.slice(0, maxResults).map(record => {
      const obj = {};
      record.keys.forEach(key => {
        const value = record.get(key);
        obj[key] = formatNeo4jValue(value);
      });
      return obj;
    });

    // Check if results were truncated
    const wasTruncated = result.records.length > maxResults;

    // Build summary
    const executionTime = Date.now() - startTime;
    const summary = {
      recordCount: records.length,
      totalAvailable: result.records.length,
      wasTruncated,
      executionTime,
      queryType: result.summary.queryType,
      counters: result.summary.counters ? {
        nodesCreated: result.summary.counters.updates().nodesCreated,
        nodesDeleted: result.summary.counters.updates().nodesDeleted,
        relationshipsCreated: result.summary.counters.updates().relationshipsCreated,
        relationshipsDeleted: result.summary.counters.updates().relationshipsDeleted,
        propertiesSet: result.summary.counters.updates().propertiesSet,
        labelsAdded: result.summary.counters.updates().labelsAdded,
        labelsRemoved: result.summary.counters.updates().labelsRemoved
      } : null,
      plan: result.summary.plan ? {
        operatorType: result.summary.plan.operatorType,
        arguments: result.summary.plan.arguments
      } : null
    };

    logger.info(
      `Query executed successfully: ${records.length} records ` +
      `(${executionTime}ms)${wasTruncated ? ' [TRUNCATED]' : ''}`
    );

    return {
      success: true,
      records,
      summary,
      executionTime
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error(`Query execution failed (${executionTime}ms):`, error);

    return {
      success: false,
      error: error.message,
      errorType: error.name,
      executionTime,
      records: [],
      summary: null
    };
  } finally {
    await closeSession();
  }
}

/**
 * Format Neo4j value to plain JavaScript object
 * @param {*} value - Neo4j value (Node, Relationship, Path, etc.)
 * @returns {*} Plain JavaScript value
 */
function formatNeo4jValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  // Neo4j Node
  if (value.labels) {
    return {
      _type: 'node',
      id: value.identity.toNumber ? value.identity.toNumber() : value.identity,
      labels: value.labels,
      properties: value.properties
    };
  }

  // Neo4j Relationship
  if (value.type && value.start && value.end) {
    return {
      _type: 'relationship',
      id: value.identity.toNumber ? value.identity.toNumber() : value.identity,
      type: value.type,
      start: value.start.toNumber ? value.start.toNumber() : value.start,
      end: value.end.toNumber ? value.end.toNumber() : value.end,
      properties: value.properties
    };
  }

  // Neo4j Path
  if (value.segments) {
    return {
      _type: 'path',
      length: value.length,
      nodes: value.segments.map(seg => formatNeo4jValue(seg.start)).concat(
        formatNeo4jValue(value.segments[value.segments.length - 1].end)
      ),
      relationships: value.segments.map(seg => formatNeo4jValue(seg.relationship))
    };
  }

  // Neo4j Integer
  if (value.toNumber) {
    return value.toNumber();
  }

  // Neo4j Date/Time
  if (value.toString && typeof value.year !== 'undefined') {
    return value.toString();
  }

  // Array
  if (Array.isArray(value)) {
    return value.map(formatNeo4jValue);
  }

  // Object
  if (typeof value === 'object' && value !== null) {
    const formatted = {};
    for (const key in value) {
      formatted[key] = formatNeo4jValue(value[key]);
    }
    return formatted;
  }

  // Primitive types
  return value;
}

/**
 * Execute a query and return results in table format
 * @param {string} query - Cypher query
 * @param {Object} params - Query parameters
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Table-formatted results
 */
async function executeQueryAsTable(query, params = {}, options = {}) {
  const result = await executeQuery(query, params, options);

  if (!result.success) {
    return result;
  }

  // Extract column names
  const columns = result.records.length > 0 ? Object.keys(result.records[0]) : [];

  // Build rows
  const rows = result.records.map(record => {
    return columns.map(col => {
      const value = record[col];
      // Simplify complex objects for table display
      if (value && typeof value === 'object' && value._type) {
        return `[${value._type}:${value.id}]`;
      }
      return value;
    });
  });

  return {
    ...result,
    table: {
      columns,
      rows
    }
  };
}

/**
 * Execute query and return count only
 * @param {string} query - Cypher query (should include COUNT)
 * @param {Object} params - Query parameters
 * @param {Object} options - Execution options
 * @returns {Promise<number>} Count result
 */
async function executeCountQuery(query, params = {}, options = {}) {
  const result = await executeQuery(query, params, options);

  if (!result.success) {
    throw new Error(result.error);
  }

  if (result.records.length === 0) {
    return 0;
  }

  // Try to find count value in first record
  const firstRecord = result.records[0];
  const countKey = Object.keys(firstRecord).find(k => 
    k.toLowerCase().includes('count') || typeof firstRecord[k] === 'number'
  );

  return countKey ? firstRecord[countKey] : result.records.length;
}

/**
 * Test Neo4j connection
 * @returns {Promise<boolean>} True if connection is healthy
 */
async function testConnection() {
  try {
    const result = await executeQuery('RETURN 1 AS test', {}, { timeout: 3000 });
    return result.success && result.records.length === 1 && result.records[0].test === 1;
  } catch (error) {
    logger.error('Connection test failed:', error);
    return false;
  }
}

/**
 * Get Neo4j database info
 * @returns {Promise<Object>} Database information
 */
async function getDatabaseInfo() {
  try {
    const [nodeCountResult, relCountResult, labelsResult] = await Promise.all([
      executeQuery('MATCH (n) RETURN count(n) AS nodeCount', {}, { timeout: 5000 }),
      executeQuery('MATCH ()-[r]->() RETURN count(r) AS relCount', {}, { timeout: 5000 }),
      executeQuery('CALL db.labels() YIELD label RETURN collect(label) AS labels', {}, { timeout: 3000 })
    ]);

    return {
      nodeCount: nodeCountResult.success ? nodeCountResult.records[0]?.nodeCount : 'unknown',
      relationshipCount: relCountResult.success ? relCountResult.records[0]?.relCount : 'unknown',
      labels: labelsResult.success ? labelsResult.records[0]?.labels : [],
      healthy: nodeCountResult.success && relCountResult.success
    };
  } catch (error) {
    logger.error('Failed to get database info:', error);
    return {
      nodeCount: 'error',
      relationshipCount: 'error',
      labels: [],
      healthy: false,
      error: error.message
    };
  }
}

/**
 * Format execution result as human-readable summary
 * @param {Object} result - Execution result
 * @returns {string} Human-readable summary
 */
function formatExecutionSummary(result) {
  if (!result.success) {
    return `Execution failed: ${result.error} (${result.executionTime}ms)`;
  }

  const lines = [];
  lines.push(`✓ Query executed successfully (${result.executionTime}ms)`);
  lines.push(`Records: ${result.summary.recordCount} returned`);
  
  if (result.summary.wasTruncated) {
    lines.push(`(⚠ Truncated from ${result.summary.totalAvailable} total records)`);
  }

  if (result.summary.queryType) {
    lines.push(`Type: ${result.summary.queryType}`);
  }

  return lines.join('\n');
}

module.exports = {
  executeQuery,
  executeQueryAsTable,
  executeCountQuery,
  testConnection,
  getDatabaseInfo,
  formatExecutionSummary,
  formatNeo4jValue
};
