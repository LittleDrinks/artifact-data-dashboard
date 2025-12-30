/**
 * MCP大模型API服务
 * 负责与MCP API进行交互，实现智能问答功能
 */
const axios = require('axios');

class MCPService {
  constructor() {
    this.apiEndpoint = process.env.AI_API_ENDPOINT;
    this.apiKey = process.env.AI_API_KEY;
    this.model = process.env.AI_MODEL || 'deepseek-r1'; // 默认使用 deepseek-r1
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };

    const isProd = process.env.NODE_ENV === 'production';

    // 打印初始化日志（仅非生产环境）
    if (this.apiEndpoint) {
      if (!isProd) {
        console.log(`[MCP] 服务已初始化`);
        console.log(`[MCP] 模型: ${this.model}`);
        console.log(`[MCP] 端点: ${this.apiEndpoint}`);
      }
    } else {
      console.warn('[MCP] 未配置 API 端点，将使用模拟模式');
    }
  }

  sanitizeModelText(text) {
    if (!text) return text;

    // 过滤掉明显的“伪工具/伪函数调用”噪声（常见于某些模型的输出模式）
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

  buildSystemPrompt(context) {
    const baseRules = [
      '你是一个文物领域的智能助手。',
      '只输出中文。',
      '避免使用英文单词；如不可避免，请用中文解释并尽量不直接输出英文。',
      '严禁输出任何代码、函数调用、JSON、HTML、Markdown 代码块。',
      "严禁输出类似 loadData('q') / fetch(...) 等伪函数调用。",
      '回答必须优先、尽可能引用【检索上下文】中的事实。',
      '如果【检索上下文】为空或确实无关，必须明确说“未在数据中找到”，不要编造具体实体、年代、地点、数值。',
      '允许补充少量通用常识，但需用“常识补充：”开头，并避免具体细节。'
    ].join('\n');

    if (context) {
      return `${baseRules}\n\n【检索上下文】\n${context}`;
    }

    return baseRules;
  }

  /**
   * 发送问题到MCP大模型并获取回答
   * @param {string} question 用户问题
   * @param {Array} history 对话历史 [{role: 'user|assistant', content: '内容'}]
   * @param {string} context 知识库上下文
   * @returns {Promise<Object>} 大模型回答
   */
  async ask(question, history = [], context = '') {
    try {
      // 检查API配置
      if (!this.apiEndpoint || !this.apiKey) {
        console.warn('MCP API 配置缺失，使用模拟回答');
        return this.simulateResponse(question, history);
      }

      const messages = [];

      // 添加系统提示词和上下文
      messages.push({
        role: 'system',
        content: this.buildSystemPrompt(context)
      });

      // 添加历史记录
      messages.push(...history);

      // 添加当前问题
      messages.push({ role: 'user', content: question });

      // 构建请求体
      const requestBody = {
        model: this.model,
        messages: messages,
        temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : 0.2,
        max_tokens: process.env.AI_MAX_TOKENS ? Number(process.env.AI_MAX_TOKENS) : 1200
      };

      // 发送请求到MCP API
      const response = await axios.post(this.apiEndpoint, requestBody, {
        headers: this.headers,
        timeout: 30000 // 30秒超时
      });

      return {
        content: this.sanitizeModelText(response.data.choices[0].message.content),
        intent: response.data.choices[0].intent || 'general_chat',
        metadata: response.data.metadata || {}
      };
    } catch (error) {
      console.error('MCP API 调用失败:', error.message);
      // 如果API调用失败，使用模拟响应
      return this.simulateResponse(question, history);
    }
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
  async askStream(question, history = [], context = '', onData, onEnd, onError) {
    try {
      const isProd = process.env.NODE_ENV === 'production';

      // 检查API配置
      if (!this.apiEndpoint || !this.apiKey) {
        console.warn('[MCP] ⚠️ API 配置缺失，转为模拟模式');
        const response = this.simulateResponse(question, history);
        onData(response.content);
        onEnd();
        return;
      }

      if (!isProd) {
        console.log(`[MCP] 🚀 正在调用大模型: ${this.model}`);
        console.log(`[MCP] 📡 端点: ${this.apiEndpoint}`);
        console.log(`[MCP] ❓ 问题: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}"`);
      }

      const messages = [];

      // 添加系统提示词和上下文
      messages.push({
        role: 'system',
        content: this.buildSystemPrompt(context)
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
        headers: this.headers,
        responseType: 'stream',
        timeout: 60000 // 60秒超时
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
              console.warn('JSON解析失败:', e.message, dataStr);
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
                console.warn('JSON解析失败(end):', e.message, dataStr);
              }
            }
           }
        }
        onEnd();
      });
      
      response.data.on('error', (err) => onError(err));

    } catch (error) {
      console.error(`[MCP] API 流式调用失败 (${this.apiEndpoint}):`, error.message);
      
      // 如果是连接错误，给出具体建议
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        console.error('[MCP] 提示: 无法连接到 AI 服务。');
        console.error('[MCP] 1. 如果在本地运行，请确保 .env 中 AI_API_ENDPOINT 为 http://localhost:11434/...');
        console.error('[MCP] 2. 如果在 Docker 中运行，请确保使用 http://host.docker.internal:11434/... 且宿主机 Ollama 已启动');
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
      console.log('[MCP] ⚠️ 正在生成模拟响应 (Simulation Mode)');
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
}

module.exports = new MCPService();
