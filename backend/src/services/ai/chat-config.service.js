/**
 * Chat Configuration Service
 * 用户会话级 AI 配置管理，存储在 Redis 中
 */

const { redisClient } = require('../../config/database');
const { createLogger } = require('../../utils/logger');
const modeManager = require('./mode-manager');

const logger = createLogger('ChatConfigService');

// Redis key prefix for chat configuration
const CONFIG_KEY_PREFIX = 'chat:config';

// Default configuration values
const DEFAULT_CONFIG = {
  model: 'LOCAL',              // AI模型: ONLINE | LOCAL | MOCK
  enabledTools: ['query_graph', 'search_artifacts'] // 启用的工具列表
};

// Valid models
const VALID_MODELS = ['ONLINE', 'LOCAL', 'MOCK'];

// Available tools with descriptions
const AVAILABLE_TOOLS = [
  {
    name: 'query_graph',
    description: '查询知识图谱，获取文物之间的关系和属性信息',
    enabledByDefault: true
  },
  {
    name: 'search_artifacts',
    description: '在文物数据库中搜索文物信息',
    enabledByDefault: true
  },
  {
    name: 'get_artifact_detail',
    description: '获取特定文物的详细信息',
    enabledByDefault: false
  },
  {
    name: 'search_documents',
    description: '搜索相关文献资料',
    enabledByDefault: false
  }
];

class ChatConfigService {
  constructor() {
    this.defaultConfig = { ...DEFAULT_CONFIG };
    this.modelHealthCache = {
      ONLINE: 'unknown',
      LOCAL: 'unknown',
      MOCK: 'healthy'
    };
    this.lastHealthCheck = 0;
  }

  /**
   * Generate Redis key for session configuration
   * @param {string} sessionId - Session ID
   * @returns {string} Redis key
   */
  _getConfigKey(sessionId) {
    return `${CONFIG_KEY_PREFIX}:${sessionId}`;
  }

  /**
   * Get default configuration
   * @returns {Object} Default configuration object
   */
  getDefaultConfig() {
    return { ...this.defaultConfig };
  }

  /**
   * Get configuration for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Configuration object (returns default if not exists)
   */
  async getConfig(sessionId) {
    if (!sessionId) {
      logger.warn('[ChatConfig] 获取配置时 sessionId 为空，返回默认配置');
      return this.getDefaultConfig();
    }

    try {
      const configKey = this._getConfigKey(sessionId);
      const configData = await redisClient.hGetAll(configKey);

      // If no config exists in Redis, return default
      if (!configData || Object.keys(configData).length === 0) {
        logger.debug(`[ChatConfig] 会话 ${sessionId} 无配置，返回默认配置`);
        return this.getDefaultConfig();
      }

      // Parse the configuration
      const config = {
        model: configData.model || DEFAULT_CONFIG.model,
        enabledTools: this._parseTools(configData.enabledTools)
      };

      logger.debug(`[ChatConfig] 获取会话 ${sessionId} 配置成功`, { config });
      return config;
    } catch (error) {
      logger.error(`[ChatConfig] 获取会话 ${sessionId} 配置失败:`, error);
      return this.getDefaultConfig();
    }
  }

  /**
   * Parse tools string/array from Redis
   * @param {string|Array} toolsData - Tools data from Redis
   * @returns {Array} Parsed tools array
   */
  _parseTools(toolsData) {
    if (!toolsData) {
      return [...DEFAULT_CONFIG.enabledTools];
    }

    if (Array.isArray(toolsData)) {
      return toolsData;
    }

    try {
      const parsed = JSON.parse(toolsData);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (e) {
      // Not JSON, try comma-separated
      if (typeof toolsData === 'string') {
        return toolsData.split(',').map(t => t.trim()).filter(Boolean);
      }
    }

    return [...DEFAULT_CONFIG.enabledTools];
  }

  /**
   * Set/update configuration for a session
   * @param {string} sessionId - Session ID
   * @param {Object} config - Configuration to update
   * @returns {Promise<Object>} Updated configuration
   */
  async setConfig(sessionId, config) {
    if (!sessionId) {
      logger.error('[ChatConfig] 更新配置时 sessionId 为空');
      throw new Error('Session ID is required');
    }

    try {
      // Get existing config first
      const existingConfig = await this.getConfig(sessionId);

      // Merge with new config
      const updatedConfig = {
        ...existingConfig,
        ...this._validateAndSanitizeConfig(config)
      };

      const configKey = this._getConfigKey(sessionId);

      // Store in Redis
      await redisClient.hSet(configKey, {
        model: updatedConfig.model,
        enabledTools: JSON.stringify(updatedConfig.enabledTools)
      });

      // Set TTL (7 days)
      await redisClient.expire(configKey, 60 * 60 * 24 * 7);

      logger.info(`[ChatConfig] 会话 ${sessionId} 配置已更新`, { config: updatedConfig });
      return updatedConfig;
    } catch (error) {
      logger.error(`[ChatConfig] 更新会话 ${sessionId} 配置失败:`, error);
      throw error;
    }
  }

  /**
   * Validate and sanitize configuration values
   * @param {Object} config - Configuration to validate
   * @returns {Object} Validated configuration
   */
  _validateAndSanitizeConfig(config) {
    const validated = {};

    // Validate model
    if (config.model !== undefined) {
      if (VALID_MODELS.includes(config.model)) {
        validated.model = config.model;
      } else {
        logger.warn(`[ChatConfig] 无效的模型: ${config.model}，使用默认值`);
        validated.model = DEFAULT_CONFIG.model;
      }
    }

    // Validate enabledTools
    if (config.enabledTools !== undefined) {
      if (Array.isArray(config.enabledTools)) {
        // Filter out invalid tools
        const validToolNames = AVAILABLE_TOOLS.map(t => t.name);
        validated.enabledTools = config.enabledTools.filter(tool => {
          const isValid = validToolNames.includes(tool);
          if (!isValid) {
            logger.warn(`[ChatConfig] 忽略无效工具: ${tool}`);
          }
          return isValid;
        });
      } else {
        logger.warn(`[ChatConfig] enabledTools 必须是数组，使用默认值`);
        validated.enabledTools = [...DEFAULT_CONFIG.enabledTools];
      }
    }

    return validated;
  }

  /**
   * Get list of available tools
   * @returns {Array} Available tools with metadata
   */
  getAvailableTools() {
    return AVAILABLE_TOOLS.map(tool => ({ ...tool }));
  }

  /**
   * Get model health status
   * Checks health of ONLINE and LOCAL models
   * @returns {Promise<Object>} Health status for each model
   */
  async getModelHealthStatus() {
    const now = Date.now();
    
    // Cache health check for 30 seconds
    if (now - this.lastHealthCheck < 30000) {
      return { ...this.modelHealthCache };
    }

    try {
      // Check ONLINE model (DeepSeek)
      try {
        // Try to get mode status from modeManager
        const modeStatus = await modeManager.checkModelHealth('ONLINE');
        this.modelHealthCache.ONLINE = modeStatus ? 'healthy' : 'unhealthy';
      } catch (err) {
        logger.debug('[ChatConfig] ONLINE 模型健康检查失败:', err.message);
        this.modelHealthCache.ONLINE = 'unhealthy';
      }

      // Check LOCAL model (Ollama)
      try {
        const modeStatus = await modeManager.checkModelHealth('LOCAL');
        this.modelHealthCache.LOCAL = modeStatus ? 'healthy' : 'unhealthy';
      } catch (err) {
        logger.debug('[ChatConfig] LOCAL 模型健康检查失败:', err.message);
        this.modelHealthCache.LOCAL = 'unhealthy';
      }

      // MOCK is always healthy
      this.modelHealthCache.MOCK = 'healthy';

      this.lastHealthCheck = now;
      
      return { ...this.modelHealthCache };
    } catch (error) {
      logger.error('[ChatConfig] 获取模型健康状态失败:', error);
      return { ...this.modelHealthCache };
    }
  }

  /**
   * Delete configuration for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteConfig(sessionId) {
    if (!sessionId) {
      return false;
    }

    try {
      const configKey = this._getConfigKey(sessionId);
      const result = await redisClient.del(configKey);
      logger.info(`[ChatConfig] 会话 ${sessionId} 配置已删除`);
      return result > 0;
    } catch (error) {
      logger.error(`[ChatConfig] 删除会话 ${sessionId} 配置失败:`, error);
      return false;
    }
  }

  /**
   * Reset configuration to default for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Reset configuration
   */
  async resetConfig(sessionId) {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    try {
      const configKey = this._getConfigKey(sessionId);
      const defaultConfig = this.getDefaultConfig();

      await redisClient.hSet(configKey, {
        model: defaultConfig.model,
        enabledTools: JSON.stringify(defaultConfig.enabledTools)
      });

      await redisClient.expire(configKey, 60 * 60 * 24 * 7);

      logger.info(`[ChatConfig] 会话 ${sessionId} 配置已重置为默认`);
      return defaultConfig;
    } catch (error) {
      logger.error(`[ChatConfig] 重置会话 ${sessionId} 配置失败:`, error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new ChatConfigService();
