const axios = require('axios');
const { getModeConfig, AI_MODES } = require('../../../config/mode-config');

/**
 * Local AI Provider using Ollama
 * Handles LOCAL mode for Docker-hosted models
 */
class LocalProvider {
  constructor() {
    this.config = getModeConfig(AI_MODES.LOCAL);
  }

  /**
   * Check if the local provider is enabled
   * @param {Object} providerConfig - Provider configuration
   * @returns {boolean} True if enabled
   */
  isEnabled(providerConfig = {}) {
    return providerConfig.enabled !== false;
  }

  /**
   * Get provider configuration
   * @returns {Object} Provider config
   */
  getConfig() {
    return this.config;
  }

  /**
   * Ask the local model with streaming response
   * @param {Object} params - Request parameters
   * @param {string} params.question - User question
   * @param {Array} params.history - Conversation history
   * @param {string} params.context - Additional context
   * @param {string} params.mode - AI mode
   * @param {AbortSignal} params.signal - Abort signal
   * @param {Function} params.onData - Data callback
   * @param {Function} params.onToolResult - Tool result callback
   * @param {Function} params.onEnd - End callback
   * @param {Function} params.onError - Error callback
   */
  async askStream({ question, history = [], context = '', mode, signal, onData, onToolResult, onEnd, onError }) {
    try {
      const messages = this.buildMessages(question, history, context);

      const requestBody = {
        model: this.config.model,
        messages: messages,
        stream: true,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 1024
        }
      };

      console.log(`[LocalProvider] Calling Ollama API: ${this.config.endpoint}/api/chat`);
      console.log(`[LocalProvider] Model: ${this.config.model}`);

      const response = await axios.post(`${this.config.endpoint}/api/chat`, requestBody, {
        timeout: this.config.timeout,
        signal: signal,
        responseType: 'stream',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      let buffer = '';
      let fullResponse = '';

      response.data.on('data', (chunk) => {
        if (signal?.aborted) {
          response.data.destroy();
          return;
        }

        buffer += chunk.toString();

        // Process complete JSON lines
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line.trim());

              if (data.done) {
                // Stream completed
                if (onEnd) {
                  onEnd();
                }
                return;
              }

              if (data.message && data.message.content) {
                const content = data.message.content;
                fullResponse += content;

                if (onData) {
                  onData(content);
                }
              }
            } catch (parseError) {
              console.warn('[LocalProvider] Failed to parse streaming response:', parseError.message);
            }
          }
        }
      });

      response.data.on('end', () => {
        if (!signal?.aborted && onEnd) {
          onEnd();
        }
      });

      response.data.on('error', (error) => {
        console.error('[LocalProvider] Stream error:', error.message);
        if (onError) {
          onError(error);
        }
      });

    } catch (error) {
      console.error('[LocalProvider] Request error:', error.message);

      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        const localError = new Error('无法连接到本地Ollama服务，请确保Ollama容器正在运行');
        localError.code = 'LOCAL_SERVICE_UNAVAILABLE';
        if (onError) {
          onError(localError);
        }
        return;
      }

      if (onError) {
        onError(error);
      }
    }
  }

  /**
   * Build messages array for Ollama API
   * @param {string} question - Current question
   * @param {Array} history - Conversation history
   * @param {string} context - Additional context
   * @returns {Array} Messages array
   */
  buildMessages(question, history = [], context = '') {
    const messages = [];

    // Add system message with context if provided
    if (context) {
      messages.push({
        role: 'system',
        content: `你是一个智能问答助手。请基于以下上下文信息回答用户的问题：\n\n${context}\n\n如果上下文信息不足，请说明无法找到相关信息。`
      });
    } else {
      messages.push({
        role: 'system',
        content: '你是一个智能问答助手。请准确、详细地回答用户的问题。'
      });
    }

    // Add conversation history
    for (const msg of history) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }

    // Add current question
    messages.push({
      role: 'user',
      content: question
    });

    return messages;
  }

  /**
   * Check if the local service is healthy
   * @returns {Promise<boolean>} True if healthy
   */
  async checkHealth() {
    try {
      const response = await axios.get(`${this.config.endpoint}${this.config.healthCheck}`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      console.warn('[LocalProvider] Health check failed:', error.message);
      return false;
    }
  }
}

module.exports = { LocalProvider };