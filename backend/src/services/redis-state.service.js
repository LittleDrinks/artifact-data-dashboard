/**
 * Redis State Management Service
 * Feature: 002-enhance-smart-qa
 * Purpose: Manage AI mode state and MCP settings in Redis for global access
 */

const { redisClient } = require('../../config/database');
const { AI_MODES, isValidMode } = require('../../config/mode-config');

// Redis keys
const REDIS_KEYS = {
  CURRENT_MODE: 'ai:mode:current',
  MODE_LOCK: 'ai:mode:lock',
  MODE_HEALTH: 'ai:mode:health',
  MCP_STATUS: 'ai:mcp:enabled',
  FAILOVER_COUNT: 'ai:mode:failover:count',
  LAST_FAILOVER: 'ai:mode:failover:timestamp'
};

// Lock timeout (milliseconds)
const LOCK_TIMEOUT = 5000;

// TTL for health check cache (seconds)
const HEALTH_CHECK_TTL = 60;

/**
 * Get current AI mode
 * @returns {Promise<string>} Current mode name (ONLINE, LOCAL, or MOCK)
 */
async function getCurrentMode() {
  try {
    const mode = await redisClient.get(REDIS_KEYS.CURRENT_MODE);
    return mode || AI_MODES.ONLINE; // Default to ONLINE
  } catch (error) {
    console.error('Failed to get current mode from Redis:', error);
    return AI_MODES.ONLINE; // Fallback to ONLINE on error
  }
}

/**
 * Set current AI mode
 * @param {string} mode - Mode name to set
 * @param {string} source - Source of the change (e.g., 'user', 'auto-fallback', 'system')
 * @returns {Promise<boolean>} True if successful
 */
async function setCurrentMode(mode, source = 'system') {
  if (!isValidMode(mode)) {
    throw new Error(`Invalid mode: ${mode}`);
  }
  
  try {
    await redisClient.set(REDIS_KEYS.CURRENT_MODE, mode);
    
    // Log mode change metadata
    await redisClient.hSet(`ai:mode:${mode}:meta`, {
      lastActivated: Date.now(),
      activatedBy: source
    });
    
    console.log(`[Redis State] Mode changed to ${mode} by ${source}`);
    return true;
  } catch (error) {
    console.error('Failed to set current mode in Redis:', error);
    throw error;
  }
}

/**
 * Acquire lock for mode switching
 * Prevents concurrent mode changes
 * @param {number} timeout - Lock timeout in milliseconds
 * @returns {Promise<boolean>} True if lock acquired
 */
async function acquireModeLock(timeout = LOCK_TIMEOUT) {
  try {
    const lockAcquired = await redisClient.set(
      REDIS_KEYS.MODE_LOCK,
      Date.now().toString(),
      {
        NX: true, // Only set if not exists
        PX: timeout // Expire after timeout
      }
    );
    
    return lockAcquired === 'OK';
  } catch (error) {
    console.error('Failed to acquire mode lock:', error);
    return false;
  }
}

/**
 * Release mode switching lock
 * @returns {Promise<boolean>} True if released
 */
async function releaseModeLock() {
  try {
    await redisClient.del(REDIS_KEYS.MODE_LOCK);
    return true;
  } catch (error) {
    console.error('Failed to release mode lock:', error);
    return false;
  }
}

/**
 * Get mode health status
 * @param {string} mode - Mode name
 * @returns {Promise<Object>} Health status { healthy: boolean, lastCheck: number, error: string }
 */
async function getModeHealth(mode) {
  try {
    const healthData = await redisClient.hGetAll(`${REDIS_KEYS.MODE_HEALTH}:${mode}`);
    
    if (!healthData || Object.keys(healthData).length === 0) {
      return { healthy: true, lastCheck: null, error: null };
    }
    
    return {
      healthy: healthData.healthy === 'true',
      lastCheck: healthData.lastCheck ? parseInt(healthData.lastCheck, 10) : null,
      error: healthData.error || null
    };
  } catch (error) {
    console.error(`Failed to get health status for ${mode}:`, error);
    return { healthy: false, lastCheck: null, error: error.message };
  }
}

/**
 * Set mode health status
 * @param {string} mode - Mode name
 * @param {boolean} healthy - Health status
 * @param {string} error - Error message if unhealthy
 * @returns {Promise<boolean>} True if successful
 */
async function setModeHealth(mode, healthy, error = null) {
  try {
    await redisClient.hSet(`${REDIS_KEYS.MODE_HEALTH}:${mode}`, {
      healthy: healthy.toString(),
      lastCheck: Date.now().toString(),
      error: error || ''
    });
    
    // Set TTL for health check cache
    await redisClient.expire(
      `${REDIS_KEYS.MODE_HEALTH}:${mode}`,
      HEALTH_CHECK_TTL
    );
    
    return true;
  } catch (error) {
    console.error(`Failed to set health status for ${mode}:`, error);
    return false;
  }
}

/**
 * Get MCP enabled status
 * @returns {Promise<boolean>} True if MCP is enabled
 */
async function getMCPStatus() {
  try {
    const status = await redisClient.get(REDIS_KEYS.MCP_STATUS);
    return status === 'true' || status === '1' || status === null; // Default to true
  } catch (error) {
    console.error('Failed to get MCP status from Redis:', error);
    return true; // Default to enabled on error
  }
}

/**
 * Set MCP enabled status
 * @param {boolean} enabled - Enable/disable MCP
 * @param {string} updatedBy - User who made the change
 * @returns {Promise<boolean>} True if successful
 */
async function setMCPStatus(enabled, updatedBy = 'system') {
  try {
    await redisClient.set(REDIS_KEYS.MCP_STATUS, enabled.toString());
    
    // Log MCP status change metadata
    await redisClient.hSet('ai:mcp:meta', {
      lastUpdated: Date.now(),
      updatedBy,
      status: enabled.toString()
    });
    
    console.log(`[Redis State] MCP ${enabled ? 'enabled' : 'disabled'} by ${updatedBy}`);
    return true;
  } catch (error) {
    console.error('Failed to set MCP status in Redis:', error);
    throw error;
  }
}

/**
 * Increment failover counter
 * Tracks automatic mode switching events
 * @param {string} fromMode - Mode switched from
 * @param {string} toMode - Mode switched to
 * @returns {Promise<number>} New failover count
 */
async function incrementFailoverCount(fromMode, toMode) {
  try {
    const count = await redisClient.incr(REDIS_KEYS.FAILOVER_COUNT);
    
    // Record failover details
    await redisClient.hSet('ai:mode:failover:latest', {
      from: fromMode,
      to: toMode,
      timestamp: Date.now(),
      count: count.toString()
    });
    
    await redisClient.set(REDIS_KEYS.LAST_FAILOVER, Date.now().toString());
    
    console.log(`[Redis State] Failover #${count}: ${fromMode} → ${toMode}`);
    return count;
  } catch (error) {
    console.error('Failed to increment failover count:', error);
    return 0;
  }
}

/**
 * Get failover statistics
 * @returns {Promise<Object>} Failover stats { count: number, lastFailover: number, latest: Object }
 */
async function getFailoverStats() {
  try {
    const [count, lastFailover, latest] = await Promise.all([
      redisClient.get(REDIS_KEYS.FAILOVER_COUNT),
      redisClient.get(REDIS_KEYS.LAST_FAILOVER),
      redisClient.hGetAll('ai:mode:failover:latest')
    ]);
    
    return {
      count: count ? parseInt(count, 10) : 0,
      lastFailover: lastFailover ? parseInt(lastFailover, 10) : null,
      latest: latest && Object.keys(latest).length > 0 ? {
        from: latest.from,
        to: latest.to,
        timestamp: parseInt(latest.timestamp, 10)
      } : null
    };
  } catch (error) {
    console.error('Failed to get failover stats:', error);
    return { count: 0, lastFailover: null, latest: null };
  }
}

/**
 * Reset failover counter
 * @returns {Promise<boolean>} True if successful
 */
async function resetFailoverCount() {
  try {
    await redisClient.del(REDIS_KEYS.FAILOVER_COUNT);
    await redisClient.del(REDIS_KEYS.LAST_FAILOVER);
    await redisClient.del('ai:mode:failover:latest');
    console.log('[Redis State] Failover counter reset');
    return true;
  } catch (error) {
    console.error('Failed to reset failover count:', error);
    return false;
  }
}

/**
 * Get all mode states
 * @returns {Promise<Object>} Complete state snapshot
 */
async function getAllStates() {
  try {
    const [currentMode, mcpEnabled, failoverStats, onlineHealth, localHealth, mockHealth] = await Promise.all([
      getCurrentMode(),
      getMCPStatus(),
      getFailoverStats(),
      getModeHealth(AI_MODES.ONLINE),
      getModeHealth(AI_MODES.LOCAL),
      getModeHealth(AI_MODES.MOCK)
    ]);
    
    return {
      currentMode,
      mcpEnabled,
      failoverStats,
      modeHealth: {
        [AI_MODES.ONLINE]: onlineHealth,
        [AI_MODES.LOCAL]: localHealth,
        [AI_MODES.MOCK]: mockHealth
      }
    };
  } catch (error) {
    console.error('Failed to get all states:', error);
    throw error;
  }
}

module.exports = {
  REDIS_KEYS,
  getCurrentMode,
  setCurrentMode,
  acquireModeLock,
  releaseModeLock,
  getModeHealth,
  setModeHealth,
  getMCPStatus,
  setMCPStatus,
  incrementFailoverCount,
  getFailoverStats,
  resetFailoverCount,
  getAllStates
};
