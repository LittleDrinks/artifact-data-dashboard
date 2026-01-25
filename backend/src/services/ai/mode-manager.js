const { AI_MODES, getModeConfig } = require('../../../config/mode-config');

/**
 * Service to manage AI operation modes (ONLINE, LOCAL, MOCK)
 * Handles mode switching, fallback logic, and health checking
 */
class ModeManager {
  constructor() {
    this.currentMode = process.env.AI_MODE_PROVIDER || AI_MODES.LOCAL; 
    // Using AI_MODE_PROVIDER to distinguish from AI_MODE used in request params which seems to be about retrieval strategy
    // However, if env only defines AI_MODE, we might need to check if it matches ONLINE/LOCAL/MOCK
    
    if (!Object.values(AI_MODES).includes(this.currentMode)) {
        // If configured mode is not one of the system modes, default to LOCAL
        // This handles the case where AI_MODE might be 'pre_retrieve' etc.
        this.currentMode = AI_MODES.LOCAL;
    }
    
    this.locked = false;
  }

  /**
   * Get current active mode configuration
   * @returns {Promise<Object>} The configuration object with 'mode' and 'locked' properties
   */
  async getCurrentMode() {
    let modeName = this.currentMode;
    let config;

    try {
      config = getModeConfig(modeName);
    } catch (err) {
      console.warn(`[ModeManager] Invalid mode ${modeName}, falling back to LOCAL`);
      modeName = AI_MODES.LOCAL;
      config = getModeConfig(modeName);
    }

    return {
      ...config,
      mode: modeName, // chat.routes.js expects .mode property
      locked: this.locked
    };
  }

  /**
   * Set the current mode
   * @param {string} mode - The mode to switch to (ONLINE, LOCAL, MOCK)
   * @param {boolean} locked - Whether to lock this mode
   */
  setMode(mode, locked = false) {
    if (Object.values(AI_MODES).includes(mode)) {
      this.currentMode = mode;
      this.locked = locked;
      return true;
    }
    return false;
  }
}

module.exports = new ModeManager();
