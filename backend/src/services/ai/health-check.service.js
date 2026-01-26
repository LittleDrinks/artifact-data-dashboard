const axios = require('axios');
const { AI_MODES } = require('../../../config/mode-config');
const redisStateService = require('../redis-state.service');

/**
 * Health Check Service
 * Feature: US3 - 问答模式切换机制
 * Purpose: Monitor API health and trigger mode fallbacks
 */
class HealthCheckService {
  constructor() {
    this.checkInterval = process.env.HEALTH_CHECK_INTERVAL_MS || 30000; // 30 seconds
    this.timeout = process.env.HEALTH_CHECK_TIMEOUT_MS || 10000; // 10 seconds
    this.failureThreshold = process.env.HEALTH_CHECK_FAILURE_THRESHOLD || 3;
    this.intervalId = null;
    this.modeManager = null; // Will be injected
  }

  /**
   * Initialize with dependencies
   * @param {Object} deps - Dependencies
   * @param {Object} deps.modeManager - Mode manager instance
   */
  init(deps = {}) {
    this.modeManager = deps.modeManager;
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    if (this.intervalId) {
      console.log('[HealthCheck] Health checks already running');
      return;
    }

    console.log(`[HealthCheck] Starting health checks every ${this.checkInterval}ms`);
    this.intervalId = setInterval(() => {
      this.performHealthChecks();
    }, this.checkInterval);

    // Perform initial check
    setTimeout(() => this.performHealthChecks(), 1000);
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[HealthCheck] Health checks stopped');
    }
  }

  /**
   * Perform health checks for all modes
   */
  async performHealthChecks() {
    try {
      const checks = await Promise.allSettled([
        this.checkOnlineHealth(),
        this.checkLocalHealth(),
        this.checkMockHealth()
      ]);

      const results = {
        [AI_MODES.ONLINE]: checks[0].status === 'fulfilled' ? checks[0].value : false,
        [AI_MODES.LOCAL]: checks[1].status === 'fulfilled' ? checks[1].value : false,
        [AI_MODES.MOCK]: checks[2].status === 'fulfilled' ? checks[2].value : true // Mock is always healthy
      };

      // Update Redis with health status
      await Promise.all([
        redisStateService.setModeHealth(AI_MODES.ONLINE, results[AI_MODES.ONLINE]),
        redisStateService.setModeHealth(AI_MODES.LOCAL, results[AI_MODES.LOCAL]),
        redisStateService.setModeHealth(AI_MODES.MOCK, results[AI_MODES.MOCK])
      ]);

      // Check if current mode needs fallback
      await this.checkAndTriggerFallback(results);

      // Attempt recovery if possible
      await this.attemptRecovery(results);

    } catch (error) {
      console.error('[HealthCheck] Error during health checks:', error);
    }
  }

  /**
   * Check online API health
   * @returns {Promise<boolean>} True if healthy
   */
  async checkOnlineHealth() {
    try {
      const apiEndpoint = process.env.AI_API_ENDPOINT;
      if (!apiEndpoint) {
        return false;
      }

      const response = await axios.get(apiEndpoint.replace('/v1/chat/completions', '/health') || `${apiEndpoint}/health`, {
        timeout: this.timeout,
        headers: {
          'Authorization': process.env.AI_API_KEY ? `Bearer ${process.env.AI_API_KEY}` : undefined
        }
      });

      return response.status === 200;
    } catch (error) {
      console.log('[HealthCheck] Online API health check failed:', error.message);
      return false;
    }
  }

  /**
   * Check local deepseek-r1 health
   * @returns {Promise<boolean>} True if healthy
   */
  async checkLocalHealth() {
    try {
      const ollamaEndpoint = process.env.DEEPSEEK_BASE_URL || 'http://localhost:11434';
      const response = await axios.get(`${ollamaEndpoint}/api/tags`, {
        timeout: this.timeout
      });

      // Check if deepseek-r1 model is available
      const models = response.data?.models || [];
      const hasDeepSeek = models.some(model => model.name.includes('deepseek-r1'));

      return response.status === 200 && hasDeepSeek;
    } catch (error) {
      console.log('[HealthCheck] Local health check failed:', error.message);
      return false;
    }
  }

  /**
   * Check mock mode health (always healthy)
   * @returns {Promise<boolean>} Always true
   */
  async checkMockHealth() {
    return true;
  }

  /**
   * Check health of a specific mode
   * @param {string} mode - Mode name
   * @returns {Promise<boolean>} True if healthy
   */
  async checkModeHealth(mode) {
    switch (mode) {
      case AI_MODES.ONLINE:
        return await this.checkOnlineHealth();
      case AI_MODES.LOCAL:
        return await this.checkLocalHealth();
      case AI_MODES.MOCK:
        return await this.checkMockHealth();
      default:
        return false;
    }
  }

  /**
   * Check if current mode needs fallback and trigger it
   * @param {Object} healthResults - Health check results
   */
  async checkAndTriggerFallback(healthResults) {
    if (!this.modeManager) return;

    const currentMode = await redisStateService.getCurrentMode();
    const isCurrentHealthy = healthResults[currentMode];

    if (!isCurrentHealthy) {
      console.log(`[HealthCheck] Current mode ${currentMode} is unhealthy, checking fallback...`);

      // Get failure count
      const stats = await redisStateService.getFailoverStats();
      const failureCount = stats.count;

      if (failureCount >= this.failureThreshold) {
        const fallbackTriggered = await this.modeManager.performFallback(currentMode);
        if (fallbackTriggered) {
          console.log(`[HealthCheck] Fallback triggered after ${failureCount} failures`);
        }
      } else {
        console.log(`[HealthCheck] Waiting for more failures (${failureCount}/${this.failureThreshold})`);
      }
    }
  }

  /**
   * Attempt to recover to higher priority modes
   * @param {Object} healthResults - Health check results
   */
  async attemptRecovery(healthResults) {
    if (!this.modeManager) return;

    const currentMode = await redisStateService.getCurrentMode();
    const fallbackOrder = [AI_MODES.ONLINE, AI_MODES.LOCAL, AI_MODES.MOCK];
    const currentIndex = fallbackOrder.indexOf(currentMode);

    // Try to recover to higher priority modes
    for (let i = 0; i < currentIndex; i++) {
      const higherMode = fallbackOrder[i];
      if (healthResults[higherMode]) {
        const recovered = await this.modeManager.attemptRecovery(higherMode);
        if (recovered) {
          console.log(`[HealthCheck] Recovered to ${higherMode}`);
          break;
        }
      }
    }
  }

  /**
   * Get health status for all modes
   * @returns {Promise<Object>} Health status
   */
  async getAllHealthStatus() {
    const [online, local, mock] = await Promise.all([
      redisStateService.getModeHealth(AI_MODES.ONLINE),
      redisStateService.getModeHealth(AI_MODES.LOCAL),
      redisStateService.getModeHealth(AI_MODES.MOCK)
    ]);

    return {
      [AI_MODES.ONLINE]: online,
      [AI_MODES.LOCAL]: local,
      [AI_MODES.MOCK]: mock
    };
  }
}

module.exports = new HealthCheckService();