const { AI_MODES, getModeConfig } = require('../../../config/mode-config');
const redisStateService = require('../redis-state.service');
const auditService = require('../audit.service');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('ModeManager');

/**
 * Service to manage AI operation modes (ONLINE, LOCAL, MOCK)
 * Handles mode switching, fallback logic, health checking, and notifications
 */
class ModeManager {
  constructor() {
    this.healthCheckService = null; // Will be injected
    this.modeNotifier = null; // Will be injected
    this.fallbackOrder = [AI_MODES.ONLINE, AI_MODES.LOCAL, AI_MODES.MOCK];
  }

  /**
   * Initialize with dependencies
   * @param {Object} deps - Dependencies
   * @param {Object} deps.healthCheckService - Health check service
   * @param {Object} deps.modeNotifier - Mode notifier service
   */
  init(deps = {}) {
    this.healthCheckService = deps.healthCheckService;
    this.modeNotifier = deps.modeNotifier;
  }

  /**
   * Get current active mode configuration
   * @returns {Promise<Object>} The configuration object with 'mode' and 'locked' properties
   */
  async getCurrentMode() {
    const modeName = await redisStateService.getCurrentMode();
    const locked = await this.isLocked();

    let config;
    try {
      config = getModeConfig(modeName);
    } catch (err) {
      logger.warn(`[ModeManager] Invalid mode ${modeName}, falling back to LOCAL`);
      const fallbackMode = AI_MODES.LOCAL;
      await redisStateService.setCurrentMode(fallbackMode, 'system-fallback');
      config = getModeConfig(fallbackMode);
      return {
        ...config,
        mode: fallbackMode,
        locked
      };
    }

    return {
      ...config,
      mode: modeName,
      locked
    };
  }

  /**
   * Set the current mode
   * @param {string} mode - The mode to switch to (ONLINE, LOCAL, MOCK)
   * @param {boolean} locked - Whether to lock this mode
   * @param {string} source - Source of the change (user, auto-fallback, system)
   * @returns {Promise<boolean>} Success
   */
  async setMode(mode, locked = false, source = 'system') {
    if (!Object.values(AI_MODES).includes(mode)) {
      return false;
    }

    const currentMode = await redisStateService.getCurrentMode();

    // Update mode
    await redisStateService.setCurrentMode(mode, source);

    // Update lock status
    if (locked) {
      await redisStateService.acquireModeLock();
    } else {
      await redisStateService.releaseModeLock();
    }

    // Log mode switch
    await auditService.logModeSwitch({
      fromMode: currentMode,
      toMode: mode,
      reason: source,
      triggeredBy: source,
      metadata: { locked }
    });

    // Notify clients
    if (this.modeNotifier) {
      await this.modeNotifier.notifyModeChange(mode, locked, source);
    }

    logger.info(`[ModeManager] Mode switched: ${currentMode} → ${mode} (${source})`);
    return true;
  }

  /**
   * Check if mode is currently locked
   * @returns {Promise<boolean>} True if locked
   */
  async isLocked() {
    // Check if lock exists in Redis
    const lockExists = await redisStateService.acquireModeLock();
    if (lockExists) {
      // Release the lock we just acquired for checking
      await redisStateService.releaseModeLock();
      return false;
    }
    return true; // Lock exists, so it's locked
  }

  /**
   * Lock current mode (prevent automatic fallback)
   * @param {string} user - User performing the lock
   * @returns {Promise<boolean>} Success
   */
  async lockMode(user = 'system') {
    const currentMode = await redisStateService.getCurrentMode();
    return await this.setMode(currentMode, true, `user-lock-${user}`);
  }

  /**
   * Unlock mode (allow automatic fallback)
   * @param {string} user - User performing the unlock
   * @returns {Promise<boolean>} Success
   */
  async unlockMode(user = 'system') {
    const currentMode = await redisStateService.getCurrentMode();
    return await this.setMode(currentMode, false, `user-unlock-${user}`);
  }

  /**
   * Perform automatic fallback based on health checks
   * @param {string} fromMode - Mode that failed
   * @returns {Promise<boolean>} True if fallback occurred
   */
  async performFallback(fromMode) {
    if (await this.isLocked()) {
      logger.info(`[ModeManager] Mode is locked, skipping fallback from ${fromMode}`);
      return false;
    }

    const currentIndex = this.fallbackOrder.indexOf(fromMode);
    if (currentIndex === -1 || currentIndex >= this.fallbackOrder.length - 1) {
      logger.info(`[ModeManager] No fallback available from ${fromMode}`);
      return false;
    }

    const nextMode = this.fallbackOrder[currentIndex + 1];

    // Check if next mode is healthy
    if (this.healthCheckService) {
      const isHealthy = await this.healthCheckService.checkModeHealth(nextMode);
      if (!isHealthy) {
        logger.info(`[ModeManager] Next mode ${nextMode} is not healthy, continuing fallback`);
        return await this.performFallback(nextMode);
      }
    }

    // Perform fallback
    await this.setMode(nextMode, false, 'auto-fallback');
    await redisStateService.incrementFailoverCount(fromMode, nextMode);

    logger.info(`[ModeManager] Automatic fallback: ${fromMode} → ${nextMode}`);
    return true;
  }

  /**
   * Attempt to recover to a higher priority mode
   * @param {string} targetMode - Target mode to recover to
   * @returns {Promise<boolean>} True if recovery occurred
   */
  async attemptRecovery(targetMode) {
    if (await this.isLocked()) {
      logger.info(`[ModeManager] Mode is locked, skipping recovery to ${targetMode}`);
      return false;
    }

    if (!this.healthCheckService) {
      return false;
    }

    const isHealthy = await this.healthCheckService.checkModeHealth(targetMode);
    if (!isHealthy) {
      logger.info(`[ModeManager] Target mode ${targetMode} is not healthy, skipping recovery`);
      return false;
    }

    const currentMode = await redisStateService.getCurrentMode();
    const currentIndex = this.fallbackOrder.indexOf(currentMode);
    const targetIndex = this.fallbackOrder.indexOf(targetMode);

    if (targetIndex < currentIndex) {
      await this.setMode(targetMode, false, 'auto-recovery');
      logger.info(`[ModeManager] Automatic recovery: ${currentMode} → ${targetMode}`);
      return true;
    }

    return false;
  }

  /**
   * Get mode history
   * @param {number} limit - Number of records to return
   * @returns {Promise<Array>} Mode switch history
   */
  async getModeHistory(limit = 50) {
    return await auditService.getModeSwitchHistory(limit);
  }
}

module.exports = new ModeManager();
