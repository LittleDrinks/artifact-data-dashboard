const fs = require('fs');
const path = require('path');

const dotenv = require('dotenv');

const SENSITIVE_KEYS = new Set([
  'MYSQL_ROOT_PASSWORD',
  'MYSQL_PASSWORD',
  'NEO4J_PASSWORD',
  'REDIS_PASSWORD',
  'JWT_SECRET',
  'AI_API_KEY',
  'DEEPSEEK_API_KEY'
]);

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function findEnvFile() {
  const candidates = [
    // preferred: repo root
    path.resolve(__dirname, '../../../../.env'),
    // fallback: process cwd
    path.resolve(process.cwd(), '.env')
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch (_) {
      // ignore
    }
  }
  return null;
}

function validateEnum(key, value, allowedValues) {
  if (isBlank(value)) return null;
  if (!allowedValues.includes(String(value))) {
    return `${key} must be one of: ${allowedValues.join('|')}`;
  }
  return null;
}

function validateInt(key, value) {
  if (isBlank(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return `${key} must be a positive integer`;
  }
  return null;
}

function loadAndValidateEnv(options = {}) {
  const envFile = options.envFilePath || findEnvFile();
  if (envFile) {
    dotenv.config({ path: envFile });
  }

  const profile = (process.env.APP_ENV || 'development').trim();
  const entrypoint = 'docker-compose.yml';
  const aiMode = (process.env.AI_MODE || 'pre_retrieve').trim();
  const deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL).trim();

  const requiredKeys = [
    'MYSQL_ROOT_PASSWORD',
    'MYSQL_HOST',
    'MYSQL_PORT',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
    'MYSQL_DATABASE',
    'NEO4J_URI',
    'NEO4J_USER',
    'NEO4J_PASSWORD',
    'REDIS_HOST',
    'REDIS_PORT',
    'REDIS_PASSWORD',
    'JWT_SECRET'
  ];

  const missingRequired = requiredKeys.filter((key) => isBlank(process.env[key]));

  const invalid = [];
  const profileError = validateEnum('APP_ENV', profile, ['development', 'production']);
  if (profileError) invalid.push({ key: 'APP_ENV', reason: profileError });
  const aiModeError = validateEnum('AI_MODE', aiMode, ['pre_retrieve', 'tool_calling']);
  if (aiModeError) invalid.push({ key: 'AI_MODE', reason: aiModeError });

  if (profile === 'production') {
    const weakDefaults = [
      { key: 'MYSQL_ROOT_PASSWORD', disallow: ['password'], suggestion: 'Set MYSQL_ROOT_PASSWORD to a strong non-default value in root .env' },
      { key: 'MYSQL_PASSWORD', disallow: ['password'], suggestion: 'Set MYSQL_PASSWORD to a strong non-default value in root .env' },
      { key: 'NEO4J_PASSWORD', disallow: ['password'], suggestion: 'Set NEO4J_PASSWORD to a strong non-default value in root .env' },
      { key: 'REDIS_PASSWORD', disallow: ['password'], suggestion: 'Set REDIS_PASSWORD to a strong non-default value in root .env' },
      { key: 'JWT_SECRET', disallow: ['change-me-in-local-env', 'your-secret-key-should-be-long-and-secure'], suggestion: 'Set JWT_SECRET to a long random string in root .env' }
    ];

    for (const rule of weakDefaults) {
      const v = (process.env[rule.key] || '').trim();
      if (rule.disallow.includes(v)) {
        invalid.push({ key: rule.key, reason: `Weak default detected. ${rule.suggestion}` });
      }
    }

    if (!isBlank(process.env.AI_API_ENDPOINT) && isBlank(process.env.AI_API_KEY)) {
      invalid.push({
        key: 'AI_API_KEY',
        reason: 'AI_API_ENDPOINT is set but AI_API_KEY is missing. Provide AI_API_KEY in root .env.'
      });
    }
  }

  const intendsDeepseek = (() => {
    const model = (process.env.AI_MODEL || '').toLowerCase();
    const endpoint = (process.env.AI_API_ENDPOINT || '').toLowerCase();
    const baseFromEnv = (process.env.DEEPSEEK_BASE_URL || '').toLowerCase();
    return Boolean(process.env.DEEPSEEK_API_KEY)
      || model.includes('deepseek')
      || endpoint.includes('deepseek.com')
      || baseFromEnv.includes('deepseek.com');
  })();

  if (intendsDeepseek && isBlank(process.env.DEEPSEEK_API_KEY)) {
    invalid.push({ key: 'DEEPSEEK_API_KEY', reason: 'DeepSeek 需配置 DEEPSEEK_API_KEY，请在根目录 .env 设置。' });
  }

  const portError = validateInt('PORT', process.env.PORT);
  if (portError) invalid.push({ key: 'PORT', reason: portError });
  const mysqlPortError = validateInt('MYSQL_PORT', process.env.MYSQL_PORT);
  if (mysqlPortError) invalid.push({ key: 'MYSQL_PORT', reason: mysqlPortError });
  const redisPortError = validateInt('REDIS_PORT', process.env.REDIS_PORT);
  if (redisPortError) invalid.push({ key: 'REDIS_PORT', reason: redisPortError });

  const missingSuggestions = {
    MYSQL_ROOT_PASSWORD: 'Set MYSQL_ROOT_PASSWORD in root .env (copy from .env.example).',
    MYSQL_HOST: 'Set MYSQL_HOST (compose usually: mysql).',
    MYSQL_PORT: 'Set MYSQL_PORT (compose usually: 3306).',
    MYSQL_USER: 'Set MYSQL_USER to the non-root database user created by MySQL container.',
    MYSQL_PASSWORD: 'Set MYSQL_PASSWORD to match the MySQL container user password.',
    MYSQL_DATABASE: 'Set MYSQL_DATABASE (default: artifact_dashboard).',
    NEO4J_URI: 'Set NEO4J_URI (compose usually: bolt://neo4j:7687).',
    NEO4J_USER: 'Set NEO4J_USER (default: neo4j).',
    NEO4J_PASSWORD: 'Set NEO4J_PASSWORD to match the Neo4j container credential.',
    REDIS_HOST: 'Set REDIS_HOST (compose usually: redis).',
    REDIS_PORT: 'Set REDIS_PORT (compose usually: 6379).',
    REDIS_PASSWORD: 'Set REDIS_PASSWORD to match redis-server --requirepass.',
    JWT_SECRET: 'Set JWT_SECRET to a non-empty long random string.'
  };

  if (!missingSuggestions.DEEPSEEK_API_KEY) {
    missingSuggestions.DEEPSEEK_API_KEY = '设置 DEEPSEEK_API_KEY 以调用 DeepSeek API（baseURL 默认为 https://api.deepseek.com）。';
  }

  // Provide actionable hints for missing required keys without leaking values
  for (const key of missingRequired) {
    const suggestion = missingSuggestions[key] || 'Set this key in root .env (copy from .env.example).';
    invalid.push({ key, reason: `Missing required. ${suggestion}` });
  }

  const detectedSources = [];
  if (envFile) {
    detectedSources.push({ kind: 'environment', details: `dotenv(${path.basename(envFile)})` });
  } else {
    detectedSources.push({ kind: 'environment', details: 'process.env' });
  }

  const overrides = [];
  if (envFile) {
    overrides.push({
      key: '.env',
      from: { kind: 'default', details: 'none' },
      to: { kind: 'environment', details: 'env_file/.env' }
    });
  }

  const redactedKeys = Array.from(SENSITIVE_KEYS);

  const diagnostics = {
    timestamp: new Date().toISOString(),
    profile,
    aiMode,
    entrypoint,
    detectedSources,
    overrides,
    missingRequired,
    invalid,
    redactedKeys
  };

  const ok = missingRequired.length === 0 && invalid.length === 0;
  return { ok, profile, aiMode, diagnostics, envFile };
}

function getAiMode(options = {}) {
  const { aiMode } = loadAndValidateEnv(options);
  return aiMode;
}

module.exports = {
  loadAndValidateEnv,
  getAiMode
};
