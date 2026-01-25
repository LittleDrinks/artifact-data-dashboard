const fs = require('fs');
const path = require('path');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('PluginConfig');

const defaultConfig = {
  version: 1,
  defaultProvider: 'mcp',
  providers: {
    mcp: { enabled: true }
  },
  capabilities: {
    sanitize: { enabled: true },
    logging: { enabled: true }
  }
};

const resolveConfigPath = () => {
  const configured = process.env.AI_PLUGINS_CONFIG;
  if (configured && String(configured).trim()) {
    return path.resolve(String(configured).trim());
  }
  // Expect: <backend>/config/ai-plugins.json
  return path.resolve(process.cwd(), 'config', 'ai-plugins.json');
};

const normalizeBoolean = (value, fallback) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(v)) return false;
  }
  return fallback;
};

const validateAndCoerce = (raw) => {
  const cfg = { ...defaultConfig };

  if (!raw || typeof raw !== 'object') {
    return cfg;
  }

  cfg.version = Number.isFinite(Number(raw.version)) ? Number(raw.version) : defaultConfig.version;

  if (typeof raw.defaultProvider === 'string' && raw.defaultProvider.trim()) {
    cfg.defaultProvider = raw.defaultProvider.trim();
  }

  if (raw.providers && typeof raw.providers === 'object') {
    cfg.providers = {};
    for (const [providerId, providerCfg] of Object.entries(raw.providers)) {
      if (!providerId || typeof providerId !== 'string') continue;
      const enabled = normalizeBoolean(providerCfg?.enabled, false);
      cfg.providers[providerId] = { enabled };
    }
  }

  if (!cfg.providers || typeof cfg.providers !== 'object' || Object.keys(cfg.providers).length === 0) {
    cfg.providers = { ...defaultConfig.providers };
  }

  if (!cfg.providers[cfg.defaultProvider]) {
    // pick first provider
    cfg.defaultProvider = Object.keys(cfg.providers)[0];
  }

  if (raw.capabilities && typeof raw.capabilities === 'object') {
    cfg.capabilities = { ...defaultConfig.capabilities };
    for (const [capId, capCfg] of Object.entries(raw.capabilities)) {
      if (!capId || typeof capId !== 'string') continue;
      cfg.capabilities[capId] = {
        enabled: normalizeBoolean(capCfg?.enabled, defaultConfig.capabilities?.[capId]?.enabled ?? false)
      };
    }
  }

  return cfg;
};

let cached = null;
let cachedPath = null;

const loadAiPluginsConfig = () => {
  const configPath = resolveConfigPath();
  cachedPath = configPath;

  try {
    const rawText = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(rawText);
    cached = validateAndCoerce(parsed);
  } catch (error) {
    // Safe fallback: do not crash startup
    cached = { ...defaultConfig };
    logger.warn('[AI-Plugins] 配置加载失败，使用默认配置', { error: error.message });
  }

  return cached;
};

const getAiPluginsConfig = () => {
  if (!cached) {
    return loadAiPluginsConfig();
  }
  return cached;
};

const getAiPluginsStatus = () => {
  const cfg = getAiPluginsConfig();
  const providerId = cfg.defaultProvider;
  const providerEnabled = Boolean(cfg.providers?.[providerId]?.enabled);

  return {
    configPath: cachedPath || resolveConfigPath(),
    version: cfg.version,
    defaultProvider: providerId,
    providers: cfg.providers,
    capabilities: cfg.capabilities,
    enabled: providerEnabled
  };
};

module.exports = {
  getAiPluginsConfig,
  getAiPluginsStatus
};
