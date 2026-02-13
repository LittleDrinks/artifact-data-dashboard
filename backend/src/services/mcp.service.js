/**
 * MCP大模型API服务
 * 支持预检索（pre_retrieve）与工具调用（tool_calling）双模式
 */
const axios = require('axios');
const { getAiMode } = require('../config/env');
const { toolManager } = require('./tool-manager');
const { safeJsonParse } = require('../utils/json-parser');
const { createLogger } = require('../utils/logger');


const logger = createLogger('MCPService');

let fetchPolyfillPromise;
async function ensureFetchAvailable() {
  if (typeof global.fetch === 'function') return;
  if (!fetchPolyfillPromise) {
    fetchPolyfillPromise = import('node-fetch').then((mod) => {
      global.fetch = mod.default;
    });
  }
  return fetchPolyfillPromise;
}

class ChatFlow {
  async beforeToolCall({ question, tools }) {
    logger.debug('ChatFlow beforeToolCall', { question: question?.slice(0, 60), tools: tools?.map((t) => t.name) });
  }

  async afterToolCall({ question, results }) {
    logger.debug('ChatFlow afterToolCall', { question: question?.slice(0, 60), results: results?.map((r) => ({ name: r.name, status: r.status })) });
  }
}

class MCPService {
  constructor(deps = {}) {
    this.apiEndpoint = process.env.AI_API_ENDPOINT;
    this.apiKey = process.env.AI_API_KEY;
    this.deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    this.deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    this.model = process.env.AI_MODEL || (this.deepseekApiKey ? 'deepseek-chat' : 'deepseek-r1'); // 默认使用 deepseek 模型
    this._useOllamaNativeChat = false;
    this.headers = { 'Content-Type': 'application/json' };

    this.toolManager = deps.toolManager || toolManager;
    this.chatFlow = deps.chatFlow || new ChatFlow();
    this.getAiModeFn = deps.getAiMode || getAiMode;
    this.createOpenAIClient = deps.createOpenAIClient || ((config) => {
      const { OpenAI } = require('openai');
      return new OpenAI(config);
    });
    this.deepSeekClient = deps.deepSeekClient || null;

    this.internalTimeoutMs = process.env.AI_INTERNAL_TIMEOUT_MS
      ? Number(process.env.AI_INTERNAL_TIMEOUT_MS)
      : 120000;

    const isProd = process.env.NODE_ENV === 'production';

    // 打印初始化日志（仅非生产环境）
    if (this.apiEndpoint) {
      if (!isProd) {
        logger.info('MCP服务已初始化', { model: this.model, endpoint: this.apiEndpoint });
      }
    } else {
      logger.warn('MCP 未配置 API 端点，将使用模拟模式');
    }
  }

  _shouldUseDeepSeek() {
    const endpoint = String(this.apiEndpoint || '').toLowerCase();
    const base = String(process.env.DEEPSEEK_BASE_URL || '').toLowerCase();
    const model = String(this.aiModel || '').toLowerCase();
    return Boolean(this.deepseekApiKey)
      || endpoint.includes('deepseek.com')
      || base.includes('deepseek.com')
      || model.startsWith('deepseek');
  }

  _assertDeepSeekConfigured() {
    if (!this.deepseekApiKey) {
      const msg = 'DEEPSEEK_API_KEY 未配置，请在根目录 .env 设置后重试。';
      throw new Error(msg);
    }
  }

  async _getDeepSeekClient() {
    if (this.deepSeekClient) return this.deepSeekClient;
    this._assertDeepSeekConfigured();
    await ensureFetchAvailable();
    this.deepSeekClient = this.createOpenAIClient({
      apiKey: this.deepseekApiKey,
      baseURL: this.deepseekBaseUrl
    });
    return this.deepSeekClient;
  }

  async _callDeepSeekCompletion({ messages, temperature = 0.2, max_tokens = 1200, signal }) {
    const client = await this._getDeepSeekClient();
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      temperature,
      max_tokens,
      stream: false,
      signal
    });

    const rawContent = response?.choices?.[0]?.message?.content || '';
    return { content: this.sanitizeModelText(rawContent || '') };
  }

  async _callDeepSeekStream({ messages, temperature, max_tokens, signal, onData, onEnd }) {
    const client = await this._getDeepSeekClient();
    const stream = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      temperature,
      max_tokens,
      stream: true,
      signal
    });

    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) onData(this.sanitizeModelText(delta));
    }
    onEnd();
  }

  _isSimpleGreeting(question) {
    const q = String(question || '').trim();
    if (!q) return false;
    // 非严格：覆盖常见寒暄/致谢/告别，避免触发工具选择阶段的大模型调用
    const patterns = [
      /^hi$/i,
      /^hello$/i,
      /^你好[呀啊吗嘛]?$|^您好$|^在吗$|^嗨$|^哈喽$/,
      /^早上好$|^中午好$|^下午好$|^晚上好$|^晚安$/,
      /^谢谢(你)?$|^感谢(你)?$|^多谢$|^辛苦了$/,
      /^再见$|^拜拜$|^下次见$/
    ];

    // 很短的输入更可能是寒暄
    if (q.length <= 10) {
      return patterns.some((re) => re.test(q));
    }
    return false;
  }

  _isOllamaEndpoint(url) {
    if (!url) return false;
    const u = String(url);
    // docker 内网服务名 / 常见端口
    return u.includes('ollama:11434') || u.includes(':11434');
  }

  _buildHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async _executePreRetrieve({ question, history = [], context = '', aiMode = 'pre_retrieve' }) {
    // 检查 DeepSeek 模型但缺少 API 密钥的情况
    // 根据用户选择的模型决定调用哪个端点
    const userModel = this._currentModel || null;
    const useOnline = userModel === 'ONLINE' || (!userModel && this._shouldUseDeepSeek());
    const useMock = userModel === 'MOCK';
    
    if (useMock) {
      return { ...this.simulateResponse(question, history), mode: aiMode };
    }

    if (this.model.startsWith('deepseek') && !this.deepseekApiKey && useOnline) {
      return {
        content: 'DEEPSEEK_API_KEY 未配置，请在根目录 .env 设置后重试。',
        intent: 'error',
        metadata: { provider: 'deepseek' },
        mode: aiMode,
        errorMessage: 'DEEPSEEK_API_KEY missing'
      };
    }

    if (useOnline) {
      if (!this.deepseekApiKey) {
        return {
          content: 'DEEPSEEK_API_KEY 未配置，请在根目录 .env 设置后重试。',
          intent: 'error',
          metadata: { provider: 'deepseek' },
          mode: aiMode,
          errorMessage: 'DEEPSEEK_API_KEY missing'
        };
      }

      try {
        const result = await this._callDeepSeekCompletion({
          messages: [
            { role: 'system', content: this.buildSystemPrompt(context) },
            ...history,
            { role: 'user', content: question }
          ],
          temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : 0.2,
          max_tokens: process.env.AI_MAX_TOKENS ? Number(process.env.AI_MAX_TOKENS) : 1200
        });
        return { ...result, intent: 'general_chat', metadata: { provider: 'deepseek' }, mode: aiMode };
      } catch (error) {
        logger.error('DeepSeek调用失败', { error: error.message });
        return {
          content: `DeepSeek 调用失败: ${error.message}`,
          intent: 'error',
          metadata: { provider: 'deepseek' },
          mode: aiMode,
          errorMessage: error.message
        };
      }
    }

    try {
      // 检查API配置
      if (!this._shouldUseDeepSeek() && (!this.apiEndpoint || (!this.apiKey && !this._isOllamaEndpoint(this.apiEndpoint)))) {
        logger.warn('MCP 未配置 API，使用模拟模式');
        return { ...this.simulateResponse(question, history), mode: aiMode };
      }

      const messages = [];

      messages.push({
        role: 'system',
        content: this.buildSystemPrompt(context)
      });

      messages.push(...history);
      messages.push({ role: 'user', content: question });

      const requestBody = {
        model: this.model,
        messages: messages,
        temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : 0.2,
        max_tokens: process.env.AI_MAX_TOKENS ? Number(process.env.AI_MAX_TOKENS) : 1200
      };

      const response = await axios.post(this.apiEndpoint, requestBody, {
        headers: this._buildHeaders(),
        timeout: 30000 // 30秒超时
      });

      return {
        content: this.sanitizeModelText(response.data.choices[0].message.content),
        intent: response.data.choices[0].intent || 'general_chat',
        metadata: response.data.metadata || {},
        mode: aiMode
      };
    } catch (error) {
      logger.error('MCP API 调用失败', { error: error.message });
      return { ...this.simulateResponse(question, history), mode: aiMode };
    }
  }

  _isLikelyOllamaOpenAIEndpoint(url) {
    if (!url) return false;
    const u = String(url);
    return u.includes('11434') && u.includes('/v1/chat/completions');
  }

  _toOllamaNativeChatEndpoint(url) {
    if (!url) return url;
    const u = String(url);
    if (u.includes('/v1/chat/completions')) {
      return u.replace(/\/v1\/chat\/completions.*$/i, '/api/chat');
    }
    // 兜底：如果用户直接给了 host:11434，则拼出 /api/chat
    if (u.includes('11434') && !u.endsWith('/api/chat')) {
      return u.replace(/\/+$/g, '') + '/api/chat';
    }
    return u;
  }

  async _callOllamaNativeChat({ messages, temperature = 0.2, max_tokens = 1000, signal }) {
    const endpoint = this._toOllamaNativeChatEndpoint(this.apiEndpoint);
    const requestBody = {
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature,
        num_predict: max_tokens
      }
    };

    const response = await axios.post(endpoint, requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 45000,
      signal
    });

    // Ollama 原生接口有时会把回答放在非标准字段（如 reasoning），做容错回退
    let rawContent = response.data?.message?.content;
    if (!rawContent || rawContent === '') {
      rawContent = response.data?.message?.reasoning || response.data?.message?.text || '';
    }
    const responseContent = this.sanitizeModelText(rawContent || '');

    // 如果仍为空，在选择工具阶段需要返回可解析 JSON，避免上游 safeJsonParse 失败
    const isSelectionPhase = String(messages?.[0]?.content || '').includes('strict JSON-outputting assistant');
    if (!responseContent && isSelectionPhase) {
      return { content: JSON.stringify({ action: 'chat', response: '抱歉，模型未返回可用内容，请稍后重试。' }) };
    }

    if (!responseContent) {
      logger.warn('[MCP调用] Ollama 原生响应内容为空，完整数据：', JSON.stringify(response.data));
    }

    return { content: responseContent };
  }

  async _executeToolCalling({ question, history = [], context = '', signal }) {
    return this.handleToolCalling({ question, history, context, signal });
  }

  _buildSelectionPrompt(question, tools, history = []) {
    // 紧凑描述：避免把完整 schema/参数塞进 prompt，减小 token 与推理耗时
    const toolsDesc = tools.map((t) => {
      const name = t.name;
      const description = t.schema?.description || '';
      const params = t.schema?.properties ? Object.keys(t.schema.properties) : [];
      return `- ${name}${description ? `：${description}` : ''}${params.length ? `（参数：${params.join(', ')}）` : ''}`;
    }).join('\n');

    return `
You are an intelligent assistant with access to the following tools:
${toolsDesc}

User Question: "${question}"

Goal: Analyze the user's question and decide whether to use a tool or respond directly.

Criteria for using tools:
- The user asks for specific information about an artifact (e.g., size, era, location, description, material, dimensions).
- The user asks about relationships between artifacts or entities.
- The user asks to search for artifacts by keyword.
- Even if the question seems simple (e.g. "How big is it?"), if it refers to a specific entity, USE A TOOL (e.g. search_artifacts).

Criteria for Direct Chat (NO tool):
- Greetings (e.g. "Hello", "Hi").
- Broad general knowledge questions completely unrelated to the artifact database.
- Thanks or closing remarks.

Examples:
- "Hello" -> {"action": "chat", "response": "你好！"}
- "How big is the Cloud Dragon Inkstone?" -> {"action": "tool", "tool": "search_artifacts", "params": {"keyword": "Cloud Dragon Inkstone"}}
- "Tell me about the Bronze Ding" -> {"action": "tool", "tool": "search_artifacts", "params": {"keyword": "Bronze Ding"}}

Output logic:
- If NO tool is needed, respond with JSON: {"action": "chat", "response": "Your natural language response here (in Chinese)"}
- If a tool IS needed, respond with JSON: {"action": "tool", "tool": "tool_name", "params": { ...parameters... }}

Ensure your response is valid JSON. Do not return any other text.
`;
  }

  async _selectTool({ question, tools, history, signal }) {
    const selectionPrompt = this._buildSelectionPrompt(question, tools, history);

    const selectionResponse = await this._callInternalModel({
      messages: [
        { role: 'system', content: 'You are a strict JSON-outputting assistant.' },
        { role: 'user', content: selectionPrompt }
      ],
      temperature: 0.1,
      signal
    });

    const parsed = safeJsonParse(selectionResponse.content, { fallback: null });
    if (!parsed.ok || !parsed.value) {
      logger.warn('[智能问答] JSON解析错误:', parsed.error?.message, selectionResponse.content);
      return { action: 'chat', response: selectionResponse.content || '抱歉，我无法理解您的意图。' };
    }
    return parsed.value;
  }

  async _executeTool({ targetTool, params, question, signal }) {
    if (signal?.aborted) throw new Error('AbortError');
    await this.chatFlow.beforeToolCall({ question, tools: [targetTool] });

    const executed = await this.toolManager.executeTool(targetTool.name, params || {});
    const toolsCalled = [executed];

    const resultStr = executed.status === 'success'
      ? (typeof executed.result === 'string' ? executed.result : JSON.stringify(executed.result))
      : executed.error;

    if (executed.status === 'success') {
      logger.info(`[智能问答] 工具执行成功 | 结果摘要: ${String(resultStr).slice(0, 150)}...`);
    } else {
      logger.error('[智能问答] 工具执行错误:', executed.error);
    }

    await this.chatFlow.afterToolCall({ question, results: toolsCalled });

    return { toolsCalled, toolResult: executed.status === 'success' ? executed.result : `Error: ${executed.error}` };
  }

  async _synthesizeResponse({ question, history, context, targetTool, toolResult, signal, chatMode = null }) {
    const synthesisPrompt = `
User Question: "${question}"
Tool "${targetTool.name}" Output: ${typeof toolResult === 'string' ? toolResult.substring(0, 2000) : JSON.stringify(toolResult).substring(0, 2000)}

Please use the tool output to answer the user's question in natural Chinese. 
If the tool output is empty or indicates not found, verify if you can answer with general knowledge, otherwise state that you couldn't find the information.
`;

    const finalResponse = await this._callInternalModel({
      messages: [
        { role: 'system', content: this.buildSystemPrompt(context, chatMode) },
        ...history,
        { role: 'user', content: synthesisPrompt }
      ],
      signal
    });

    return finalResponse.content;
  }

  // 测试/模拟开关：在测试环境跳过真实大模型与选择流程，直接调用已注册工具
  shouldMockToolCalling() {
    const flag = String(process.env.MOCK_TOOL_CALLING || '').trim().toLowerCase();
    const isJest = process.env.JEST_WORKER_ID !== undefined;
    const isTestEnv = process.env.NODE_ENV === 'test';
    const isMockEndpoint = this.apiEndpoint && this.apiEndpoint.includes('mock');
    return isTestEnv || isJest || flag === 'true' || isMockEndpoint;
  }

  sanitizeModelText(text) {
    if (!text) return text;

    // 过滤掉明显的"伪工具/伪函数调用"噪声（常见于某些模型的输出模式）
    // 注意：这是保底措施，主要依赖系统提示词约束。
    return text
      .replace(/\bloadData\([^\)]*\)/g, '')
      .replace(/\bfetch\([^\)]*\)/g, '')
      .replace(/\bcall\w*Tool\([^\)]*\)/gi, '')
      .replace(/<\/?script[^>]*>/gi, '')
      // 常见内部类型词汇转为更符合中文习惯的表达
      .replace(/\bartifact\b/gi, '文物')
      .replace(/\bcategory\b/gi, '类别')
      .replace(/\bera\b/gi, '年代')
      .replace(/\blocation\b/gi, '地点')
      .replace(/\bmaterial\b/gi, '材质')
      .replace(/\bknowledge\s*graph\b/gi, '知识图谱')
      .replace(/\n{4,}/g, '\n\n');
  }

  buildSystemPrompt(context, _chatMode = null) {
    // 使用统一的系统提示词，AI 自行判断是否需要调用工具
    const baseRules = [
      '你是一个文物领域的智能助手。',
      '只输出中文。',
      '避免使用英文单词；如不可避免，请用中文解释并尽量不直接输出英文。',
      '严禁输出任何代码、函数调用、JSON、HTML、Markdown 代码块。',
      "严禁输出类似 loadData('q') / fetch(...) 等伪函数调用。",
      '回答必须优先、尽可能引用【检索上下文】中的事实。',
      '如果【检索上下文】为空或确实无关，必须明确说"未在数据中找到"，不要编造具体实体、年代、地点、数值。',
      '允许补充少量通用常识，但需用"常识补充："开头，并避免具体细节。'
    ].join('\n');

    if (context) {
      return `${baseRules}\n\n【检索上下文】\n${context}`;
    }

    return baseRules;
  }

  /**
   * 根据启用的工具列表过滤工具
   * @param {Array} enabledTools - 启用的工具名称列表
   * @returns {Array} 过滤后的工具列表
   */
  _filterTools(enabledTools) {
    const allTools = this.toolManager.listTools();
    
    if (!enabledTools || enabledTools.length === 0) {
      return allTools;
    }

    const filtered = allTools.filter(tool => enabledTools.includes(tool.name));
    logger.debug(`[MCP] 工具过滤: ${allTools.length} -> ${filtered.length}`, {
      enabled: enabledTools,
      available: allTools.map(t => t.name)
    });
    
    return filtered;
  }

  async ask(question, history = [], context = '') {
    const aiMode = this.getAiModeFn({}).trim();
    if (aiMode === 'tool_calling') {
      return this._executeToolCalling({ question, history, context });
    }

    return this._executePreRetrieve({ question, history, context, aiMode });
  }

  /**
   * 流式发送问题到MCP大模型
   * @param {string} question 用户问题
   * @param {Array} history 对话历史
   * @param {string} context 知识库上下文
   * @param {Function} onData 接收数据回调
   * @param {Function} onEnd 结束回调
   * @param {Function} onError 错误回调
   */
  async askStream({ question, history = [], context = '', mode, config = {}, onData, onEnd, onError, onToolResult, signal }) {
    const aiMode = (mode || this.getAiModeFn({})).trim();
    const chatMode = config.mode || null; // graph | knowledge | general
    const enabledTools = config.enabledTools || null;
    const userModel = config.model || 'LOCAL'; // ONLINE | LOCAL | MOCK
    
    // 设置当前模型，供 _callInternalModel 使用
    this._currentModel = userModel;
    
    if (aiMode === 'tool_calling') {
      try {
        const result = await this._executeToolCalling({ question, history, context, signal, config });
        if (onToolResult) {
          onToolResult(result);
        }
        if (onData) {
          onData(result.content);
        }
        if (onEnd) {
          onEnd();
        }
        return;
      } catch (error) {
        if (onError) {
          onError(error);
        }
        return;
      }
    }

    try {
      const isProd = process.env.NODE_ENV === 'production';

      // 根据用户选择的模型决定调用哪个端点
      // ONLINE -> DeepSeek 云端, LOCAL -> Ollama 本地, MOCK -> 模拟响应
      const useOnline = userModel === 'ONLINE' || (userModel !== 'LOCAL' && userModel !== 'MOCK' && this._shouldUseDeepSeek());
      const useMock = userModel === 'MOCK';

      if (useMock) {
        logger.info('[MCP] 使用模拟模式响应');
        const response = this.simulateResponse(question, history);
        onData(response.content);
        onEnd();
        return;
      }

      if (useOnline) {
        if (!this.deepseekApiKey) {
          const err = new Error('DEEPSEEK_API_KEY 未配置，请在根目录 .env 设置后重试。');
          if (onError) onError(err);
          return;
        }

        const messages = [];
        messages.push({ role: 'system', content: this.buildSystemPrompt(context, chatMode) });
        messages.push(...history);
        messages.push({ role: 'user', content: question });

        try {
          await this._callDeepSeekStream({
            messages,
            temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : 0.2,
            max_tokens: process.env.AI_MAX_TOKENS ? Number(process.env.AI_MAX_TOKENS) : 1200,
            signal,
            onData,
            onEnd
          });
        } catch (error) {
          if (onError) onError(error);
        }
        return;
      }

      // 检查API配置
      if (!this.apiEndpoint) {
        logger.warn('[MCP] 未配置 API 端点，将使用模拟模式');
        const response = this.simulateResponse(question, history);
        onData(response.content);
        onEnd();
        return;
      }

      if (!this.apiKey && !this._isOllamaEndpoint(this.apiEndpoint)) {
        logger.warn('[MCP] 未配置 API Key，将使用模拟模式');
        const response = this.simulateResponse(question, history);
        onData(response.content);
        onEnd();
        return;
      }

      if (!isProd) {
        logger.debug(`[MCP] 正在调用大模型: ${this.model}`);
        logger.debug(`[MCP] 端点: ${this.apiEndpoint}`);
        logger.debug(`[MCP] 问题: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}"`);
      }

      const messages = [];

      // 添加系统提示词和上下文（根据问答模式）
      messages.push({
        role: 'system',
        content: this.buildSystemPrompt(context, chatMode)
      });

      // 添加历史记录
      messages.push(...history);
      
      // 添加当前问题
      messages.push({ role: 'user', content: question });

      // 构建请求体
      const requestBody = {
        model: this.model,
        messages: messages,
        stream: true,
        temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : 0.2,
        max_tokens: process.env.AI_MAX_TOKENS ? Number(process.env.AI_MAX_TOKENS) : 1200
      };

      // 发送请求到MCP API
      const response = await axios.post(this.apiEndpoint, requestBody, {
        headers: this._buildHeaders(),
        responseType: 'stream',
        timeout: 60000, // 60秒超时
        signal: signal // 支持中止
      });

      let buffer = '';

      response.data.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        // 保留最后一行，因为它可能是不完整的
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') continue;
            try {
              const json = JSON.parse(dataStr);
              const content = json.choices[0].delta.content;
              if (content) onData(this.sanitizeModelText(content));
            } catch (e) {
              // 忽略解析错误，可能是因为数据不完整（虽然我们已经处理了buffer，但仍需防范）
              logger.warn('JSON解析失败:', e.message, dataStr);
            }
          }
        }
      });

      response.data.on('end', () => {
        // 处理缓冲区中剩余的数据
        if (buffer.trim() !== '') {
           const line = buffer;
           if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr !== '[DONE]') {
              try {
                const json = JSON.parse(dataStr);
                const content = json.choices[0].delta.content;
                if (content) onData(this.sanitizeModelText(content));
              } catch (e) {
                logger.warn('JSON解析失败(end):', e.message, dataStr);
              }
            }
           }
        }
        onEnd();
      });
      
      response.data.on('error', (err) => onError(err));

    } catch (error) {
      logger.error(`[MCP] API 流式调用失败 (${this.apiEndpoint})`, { error: error.message });
      
      // 如果是连接错误，给出具体建议
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        logger.error('[MCP] 提示: 无法连接到 AI 服务。');
        logger.error('[MCP] 1. 如果在本地运行，请确保 .env 中 AI_API_ENDPOINT 为 http://localhost:11434/...');
        logger.error('[MCP] 2. 如果在 Docker 中运行，请确保使用 http://host.docker.internal:11434/... 且宿主机 Ollama 已启动');
      }
      
      onError(error);
    }
  }

  /**
   * 当API不可用时的模拟响应
   * @param {string} question 问题
   * @param {Array} history 历史
   * @returns {Object} 模拟响应
   */
  simulateResponse(question, history = []) {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('[MCP] 正在生成模拟响应 (Simulation Mode)');
    }

    // 简单的关键词匹配
    const patterns = {
      '文物': "文物是指从古至今具有历史、艺术和科学价值的遗物。中国的文物保护法规定，具有历史、艺术和科学价值的古文化遗址、古墓葬、古建筑、石窟寺等都属于文物。",
      '青铜器': "中国青铜器主要兴盛于商和周代，是中国古代文明的重要象征。著名的青铜器有四羊方尊、司母戊鼎等。这些器物多用于祭祀、礼仪等活动。",
      '陶器': "陶器是以黏土为原料经成型、干燥、焙烧而成的器物。中国新石器时代的彩陶，如仰韶文化、马家窑文化的彩陶都极具特色。唐代的三彩也是陶器中的精品。",
      '玉器': "中国玉器有着悠久的历史，新石器时代良渚文化的玉琮、玉璧等代表了早期中国人对宇宙的理解。玉在中国传统文化中象征高洁、美好的品质。",
      '书画': "中国书画是中国传统文化的重要组成部分。从晋代王羲之的《兰亭序》到宋代张择端的《清明上河图》，再到明清的《富春山居图》等，都是中国书画史上的瑰宝。",
      '知识图谱': "在文物领域，知识图谱可以将文物、出土地点、年代、相关人物等实体之间的关系可视化展示，帮助研究人员和公众更直观地理解文物背后的历史文化网络。"
    };

    // 检查关键词匹配
    for (const [keyword, response] of Object.entries(patterns)) {
      if (question.toLowerCase().includes(keyword)) {
        return {
          content: response,
          intent: 'knowledge_base',
          metadata: { source: 'simulation' }
        };
      }
    }

    // 根据历史上下文生成更有针对性的回复
    if (history.length > 0) {
      const lastQuestion = history[history.length - 1].content;
      if (question.includes('谢谢') || question.includes('感谢')) {
        return {
          content: '不客气！如果您有更多关于文物的问题，随时可以向我咨询。',
          intent: 'gratitude',
          metadata: { source: 'simulation' }
        };
      }
      
      if (question.includes('继续') || question.includes('详细') || question.includes('更多')) {
        return {
          content: '关于这个问题，我可以补充说明一下。中国文物保护工作始于20世纪初，1930年颁布了《古物保存法》，新中国成立后又相继制定了一系列文物保护法规。目前，中国有世界文化遗产55处，国家级文物保护单位4296处，藏品丰富多样，涵盖了从旧石器时代到近现代的各个历史时期。',
          intent: 'knowledge_base',
          metadata: { source: 'simulation' }
        };
      }
    }

    // 默认回复
    return {
      content: "抱歉，我无法回答这个问题。您可以尝试询问关于文物、青铜器、陶器、玉器、书画或知识图谱的问题。",
      intent: 'unknown',
      metadata: { source: 'simulation' }
    };
  }

  /**
   * 分析用户问题，判断意图类型
   * @param {string} question 用户问题
   * @returns {string} 意图类型 knowledge_graph|general_knowledge|unknown
   */
  analyzeIntent(question) {
    const graphRelatedKeywords = ['关系', '图谱', '之间', '连接', '网络', '节点'];
    
    // 检查是否为知识图谱查询
    for (const keyword of graphRelatedKeywords) {
      if (question.includes(keyword)) {
        return 'knowledge_graph';
      }
    }

    // 检查是否为特定文物查询
    const artifactKeywords = ['青铜器', '陶器', '玉器', '书画', '文物', '年代', '朝代'];
    for (const keyword of artifactKeywords) {
      if (question.includes(keyword)) {
        return 'general_knowledge';
      }
    }

    return 'unknown';
  }

  async handleToolCalling({ question, history = [], context = '', signal, config = {} }) {
    const chatMode = config.mode || null;
    const enabledTools = config.enabledTools || null;
    const userModel = config.model || 'LOCAL';
    
    // 设置当前模型，供 _callInternalModel 使用
    this._currentModel = userModel;
    
    // Check MCP Status
    let mcpEnabled = true;
    try {
      const { getMCPStatus } = require('./redis-state.service');
      mcpEnabled = await getMCPStatus();
    } catch (e) {
      logger.warn('Failed to check MCP status, assuming enabled');
    }

    if (!mcpEnabled) {
      logger.info('[智能问答] MCP已禁用，改为直接聊天');
      try {
        const response = await this._callInternalModel({
          messages: [
            { role: 'system', content: this.buildSystemPrompt(context, chatMode) },
            ...history, 
            { role: 'user', content: question }
          ],
          signal
        });
        return {
          content: response.content,
          intent: 'chat',
          toolsCalled: [],
          mode: 'tool_calling',
          source: 'mcp_model'
        };
      } catch (err) {
        logger.error('[智能问答] 直接聊天失败:', err);
        return {
          content: '抱歉，处理您的请求时遇到错误。',
          intent: 'error',
          toolsCalled: [],
          mode: 'tool_calling',
          errorMessage: err.message
        };
      }
    }

    // 根据配置过滤工具
    const tools = this._filterTools(enabledTools);
    if (!tools || tools.length === 0) {
      logger.info('[智能问答] 检索工具不可用');
      return {
        content: '检索工具暂时不可用，请稍后重试',
        intent: 'tool_calling',
        toolsCalled: [],
        mode: 'tool_calling',
        errorMessage: '检索工具暂时不可用，请稍后重试'
      };
    }

    // 测试/模拟路径：避免在测试中调用真实大模型或外部端点
    if (this.shouldMockToolCalling && this.shouldMockToolCalling()) {
      if (signal?.aborted) throw new Error('AbortError');
      const targetTool = tools[0];
      await this.chatFlow.beforeToolCall({ question, tools: [targetTool] });
      const executed = await this.toolManager.executeTool(targetTool.name, { question });
      const toolsCalled = [executed];
      await this.chatFlow.afterToolCall({ question, results: toolsCalled });

      return {
        content: executed.status === 'success'
          ? (typeof executed.result === 'string' ? executed.result : JSON.stringify(executed.result))
          : String(executed.error || '检索工具暂时不可用，请稍后重试'),
        intent: 'tool_calling',
        toolsCalled,
        mode: 'tool_calling'
      };
    }

    try {
      logger.info('[智能问答] 开始处理问题:', question);

      // 1. Tool Selection Phase
      logger.info('[智能问答] 阶段1: 意图分析与工具选择...');
      const decision = await this._selectTool({ question, tools, history, signal });

      // 检查中止
      if (signal?.aborted) throw new Error('AbortError');

      // 2. Execution Phase
      if (decision.action === 'chat') {
        logger.info('[智能问答] 决策: 直接聊天 (无需工具)');
        return {
          content: decision.response || '你好！',
          intent: 'chat',
          toolsCalled: [],
          mode: 'tool_calling'
        };
      }

      if (decision.action === 'tool' && decision.tool) {
        logger.info(`[智能问答] 决策: 调用工具 [${decision.tool}] | 参数: ${JSON.stringify(decision.params)}`);
        const targetTool = this.toolManager.getTool(decision.tool);
        if (!targetTool) {
          logger.warn('[智能问答] 工具未找到:', decision.tool);
          return {
            content: `无法找到工具: ${decision.tool}`,
            intent: 'tool_calling',
            toolsCalled: [],
            mode: 'tool_calling'
          };
        }

        logger.info('[智能问答] 阶段2: 工具执行');
        const { toolsCalled, toolResult } = await this._executeTool({ targetTool, params: decision.params, question, signal });

        // 检查中止
        if (signal?.aborted) throw new Error('AbortError');

        // 3. Synthesis Phase
        logger.info('[智能问答] 阶段3: 最终回答合成...');
        const finalContent = await this._synthesizeResponse({ question, history, context, targetTool, toolResult, signal, chatMode });

        logger.info('[智能问答] 流程结束');

        return {
          content: finalContent,
          intent: 'tool_calling',
          toolsCalled,
          mode: 'tool_calling'
        };
      }

      logger.info('[智能问答] 未做出有效决策');
      return {
        content: '未做出有效决策',
        intent: 'unknown',
        toolsCalled: [],
        mode: 'tool_calling'
      };

    } catch (error) {
      logger.error('[智能问答] 处理错误:', error);
      const isTimeout = error?.code === 'ECONNABORTED' || String(error?.message || '').includes('timeout');
      return {
        content: isTimeout
          ? '抱歉，模型响应超时。当前本机推理速度较慢或提示词过长，建议稍后重试，或降低模型/并发。'
          : '抱歉，处理您的请求时遇到错误。',
        intent: 'error',
        toolsCalled: [],
        mode: 'tool_calling',
        errorMessage: error.message
      };
    }
  }

  /**
   * Internal helper to call model non-streamingly, separate from main ask flow
   * @param {Object} options
   * @param {Array} options.messages - Messages array
   * @param {number} options.temperature - Temperature
   * @param {number} options.max_tokens - Max tokens
   * @param {AbortSignal} options.signal - Abort signal
   * @param {string} options.model - User selected model (ONLINE/LOCAL/MOCK), optional
   */
  async _callInternalModel({ messages, temperature = 0.2, max_tokens = 1000, signal, model = null }) {
    // 根据用户选择的模型或默认逻辑决定调用哪个端点
    const userModel = model || this._currentModel || null;
    const useOnline = userModel === 'ONLINE' || (!userModel && this._shouldUseDeepSeek());
    const useMock = userModel === 'MOCK';
    
    if (useMock) {
      return { content: '这是一个模拟响应。' };
    }
    
    if (useOnline) {
      try {
        return await this._callDeepSeekCompletion({ messages, temperature, max_tokens, signal });
      } catch (error) {
        logger.error('[MCP调用] DeepSeek 调用失败', { error: error.message });
        throw error;
      }
    }

    if (!this.apiEndpoint || (!this.apiKey && !this._isOllamaEndpoint(this.apiEndpoint))) {
      throw new Error('API not configured');
    }
    
    try {
      const requestBody = {
        model: this.model,
        messages,
        temperature,
        max_tokens
      };

      // 仅在非流式调用时打印简略日志（避免刷屏完整Prompt）
      const lastMsg = messages[messages.length - 1];
      logger.debug(`[MCP调用] 发送请求 (tokens_limit=${max_tokens}) | 最后一条消息: ${lastMsg?.content?.slice(0, 100).replace(/\n/g, ' ')}...`);

      const shouldTryOllamaNativeFirst = this._useOllamaNativeChat && this._isLikelyOllamaOpenAIEndpoint(this.apiEndpoint);
      const response = shouldTryOllamaNativeFirst
        ? await this._callOllamaNativeChat({ messages, temperature, max_tokens, signal })
        : await axios.post(this.apiEndpoint, requestBody, {
          headers: this._buildHeaders(),
          timeout: this.internalTimeoutMs,
          signal
        });

      // 当走 Ollama 原生 /api/chat 时，_callOllamaNativeChat 已返回 {content}
      if (shouldTryOllamaNativeFirst) {
        return response;
      }
      

      // 容错：有些模型/端点可能把实际文本放在 reasoning/text 等字段中
      let rawContent = response.data?.choices?.[0]?.message?.content;
      if (!rawContent || rawContent === '') {
        rawContent = response.data?.choices?.[0]?.message?.reasoning
          || response.data?.choices?.[0]?.message?.text
          || response.data?.choices?.[0]?.text
          || '';
      }

      let responseContent = this.sanitizeModelText(rawContent || '');

      // 如果仍为空，在选择工具阶段需要返回可解析 JSON，避免 safeJsonParse 报错
      const isSelectionPhase = String(messages?.[0]?.content || '').includes('strict JSON-outputting assistant');
      if (!responseContent && isSelectionPhase) {
        const fallback = JSON.stringify({ action: 'chat', response: '抱歉，模型未返回可用内容，请稍后重试。' });
        logger.warn('[MCP调用] 选择阶段模型未返回内容，使用 JSON 回退:', fallback);
        return { content: fallback };
      }

      if (!responseContent) {
        logger.warn(`[MCP调用] 响应内容为空! HTTP Status: ${response.status}`);
        logger.warn('[MCP调用] 完整响应数据:', JSON.stringify(response.data));
      } else {
        logger.debug(`[MCP调用] 收到响应 | 长度: ${responseContent.length} | 内容摘要: ${responseContent.slice(0, 100).replace(/\n/g, ' ')}...`);
      }

      return { content: responseContent };
    } catch (e) {
      const status = e?.response?.status;
      const errData = e?.response?.data;
      const errText = typeof errData === 'string' ? errData : (errData ? JSON.stringify(errData) : '');

      const canFallbackToOllamaNative = status === 404 && this._isLikelyOllamaOpenAIEndpoint(this.apiEndpoint);
      if (canFallbackToOllamaNative) {
        if (!this._useOllamaNativeChat) {
          logger.warn('[MCP调用] OpenAI兼容端点返回404，尝试降级为 Ollama 原生 /api/chat');
          this._useOllamaNativeChat = true;
        }
        try {
          return await this._callOllamaNativeChat({ messages, temperature, max_tokens, signal });
        } catch (fallbackError) {
          const fbStatus = fallbackError?.response?.status;
          const fbData = fallbackError?.response?.data;
          const fbText = typeof fbData === 'string' ? fbData : (fbData ? JSON.stringify(fbData) : '');
          const fbIsModelNotFound = fbStatus === 404 && /model\s+['"][^'"]+['"]\s+not\s+found/i.test(fbText);

          if (fbIsModelNotFound) {
            const modelName = this.model;
            const friendly = `本地 Ollama 未找到模型"${modelName}"。\n\n请在宿主机执行：ollama pull ${modelName}\n或修改根目录 .env 的 AI_MODEL 为你已安装的模型名称。\n\n当前已降级为模拟回答（不影响页面使用，但工具选择将受限）。`;
            const isSelectionPhase = String(messages?.[0]?.content || '').includes('strict JSON-outputting assistant');
            if (isSelectionPhase) {
              return { content: JSON.stringify({ action: 'chat', response: friendly }) };
            }
            return { content: friendly };
          }

          logger.error('[MCP调用] Ollama 原生 /api/chat 调用也失败:', fallbackError.message);
          throw fallbackError;
        }
      }

      // Ollama 原生接口常用 404 表示"模型未下载/不存在"
      const isOllamaModelNotFound = status === 404 && /model\s+['"][^'"]+['"]\s+not\s+found/i.test(errText);
      if (isOllamaModelNotFound) {
        const modelName = this.model;
        const friendly = `本地 Ollama 未找到模型"${modelName}"。\n\n请在宿主机执行：ollama pull ${modelName}\n或修改根目录 .env 的 AI_MODEL 为你已安装的模型名称。\n\n当前已降级为模拟回答（不影响页面使用，但工具选择将受限）。`;

        // 选择工具阶段需要严格 JSON，直接返回可解析 JSON 让流程走 chat 分支。
        const isSelectionPhase = String(messages?.[0]?.content || '').includes('strict JSON-outputting assistant');
        if (isSelectionPhase) {
          return { content: JSON.stringify({ action: 'chat', response: friendly }) };
        }

        return { content: friendly };
      }

      logger.error('[MCP调用] 调用失败:', e.message);
      throw e;
    }
  }
}

const mcpService = new MCPService();
mcpService.ChatFlow = ChatFlow;
mcpService.MCPService = MCPService;

module.exports = mcpService;
