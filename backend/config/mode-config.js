/**
 * AI Mode Configuration
 * Feature: 002-enhance-smart-qa
 * Purpose: Define ONLINE/LOCAL/MOCK modes and fallback rules
 */

/**
 * AI Mode Types
 * - ONLINE: External API (e.g., DeepSeek Cloud)
 * - LOCAL: Docker-hosted model (e.g., Ollama with deepseek-r1:8b)
 * - MOCK: Simulated responses for testing/demo
 */
const AI_MODES = {
  ONLINE: 'ONLINE',
  LOCAL: 'LOCAL',
  MOCK: 'MOCK'
};

/**
 * Mode Configuration Details
 * Each mode includes:
 * - endpoint: API endpoint URL
 * - timeout: Request timeout in milliseconds
 * - healthCheck: Health check endpoint (null for MOCK)
 * - fallback: Next mode to try if this one fails
 * - priority: Lower number = higher priority
 */
const MODE_CONFIG = {
  [AI_MODES.ONLINE]: {
    name: AI_MODES.ONLINE,
    endpoint: process.env.AI_API_ENDPOINT || 'https://api.deepseek.com/v1',
    model: process.env.AI_MODEL || 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY,
    timeout: 10000, // 10 seconds
    healthCheck: null, // External API health check not implemented
    fallback: AI_MODES.LOCAL,
    priority: 1,
    description: 'External cloud API service'
  },
  
  [AI_MODES.LOCAL]: {
    name: AI_MODES.LOCAL,
    endpoint: process.env.OLLAMA_ENDPOINT || 'http://ollama:11434',
    model: process.env.OLLAMA_MODEL || 'deepseek-r1:8b',
    apiKey: null, // Local model doesn't need API key
    timeout: 5000, // 5 seconds
    healthCheck: '/api/tags', // Ollama health check endpoint
    fallback: AI_MODES.MOCK,
    priority: 2,
    description: 'Local Docker-hosted model via Ollama'
  },
  
  [AI_MODES.MOCK]: {
    name: AI_MODES.MOCK,
    endpoint: null, // No external endpoint
    model: 'mock',
    apiKey: null,
    timeout: 1000, // 1 second (instant response)
    healthCheck: null,
    fallback: null, // No further fallback
    priority: 3,
    description: 'Simulated AI responses for testing'
  }
};

/**
 * Fallback Chain
 * Defines the order of mode switching when failures occur
 * ONLINE → LOCAL → MOCK
 */
const FALLBACK_CHAIN = [
  AI_MODES.ONLINE,
  AI_MODES.LOCAL,
  AI_MODES.MOCK
];

/**
 * Mode Switching Rules
 */
const SWITCHING_RULES = {
  // Maximum retries before switching to fallback mode
  maxRetries: 2,
  
  // Cooldown period (ms) before retrying a failed mode
  retryCooldown: 30000, // 30 seconds
  
  // Health check interval (ms) for active mode
  healthCheckInterval: 60000, // 1 minute
  
  // Timeout for health checks (ms)
  healthCheckTimeout: 3000, // 3 seconds
  
  // Auto-fallback on consecutive failures
  autoFallbackThreshold: 3
};

/**
 * Mock Response Templates
 * Used when MOCK mode is active
 */
const MOCK_RESPONSES = {
  default: {
    content: 'This is a simulated AI response for testing purposes. The system is currently in MOCK mode.',
    role: 'assistant',
    model: 'mock',
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30
    }
  },
  
  cypher: {
    content: 'MATCH (a:Artifact) RETURN a LIMIT 10',
    role: 'assistant',
    model: 'mock',
    usage: {
      prompt_tokens: 15,
      completion_tokens: 15,
      total_tokens: 30
    }
  },
  
  error: {
    content: 'I apologize, but I encountered an error processing your request. Please try again.',
    role: 'assistant',
    model: 'mock',
    usage: {
      prompt_tokens: 10,
      completion_tokens: 15,
      total_tokens: 25
    }
  }
};

/**
 * Get configuration for a specific mode
 * @param {string} mode - AI mode name
 * @returns {Object} Mode configuration
 */
function getModeConfig(mode) {
  const config = MODE_CONFIG[mode];
  if (!config) {
    throw new Error(`Unknown AI mode: ${mode}`);
  }
  return { ...config };
}

/**
 * Get the fallback mode for a given mode
 * @param {string} mode - Current AI mode
 * @returns {string|null} Fallback mode name or null
 */
function getFallbackMode(mode) {
  const config = getModeConfig(mode);
  return config.fallback;
}

/**
 * Get the complete fallback chain
 * @returns {Array<string>} Array of mode names in priority order
 */
function getFallbackChain() {
  return [...FALLBACK_CHAIN];
}

/**
 * Validate if a mode name is valid
 * @param {string} mode - Mode name to validate
 * @returns {boolean} True if valid
 */
function isValidMode(mode) {
  return Object.values(AI_MODES).includes(mode);
}

/**
 * Get mock response by type
 * @param {string} type - Response type (default, cypher, error)
 * @returns {Object} Mock response object
 */
function getMockResponse(type = 'default') {
  return { ...MOCK_RESPONSES[type] || MOCK_RESPONSES.default };
}

module.exports = {
  AI_MODES,
  MODE_CONFIG,
  FALLBACK_CHAIN,
  SWITCHING_RULES,
  MOCK_RESPONSES,
  getModeConfig,
  getFallbackMode,
  getFallbackChain,
  isValidMode,
  getMockResponse
};
