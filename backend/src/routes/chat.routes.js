const express = require('express');
const { neo4jDriver, redisClient, mysqlPool, ensureRedisConnected } = require('../config/database');
const mcpService = require('../services/mcp.service');
const { getAiPluginsConfig } = require('../services/ai/plugin-config');
const { McpProvider } = require('../services/ai/providers/mcp.provider');
const { applyInputCapabilities } = require('../services/ai/capabilities');
const { extractKeywords: extractKeywordsService } = require('../services/keyword.service');

const router = express.Router();

const providers = {
  mcp: new McpProvider()
};

const writeAuditLog = async ({ userId, action, details }) => {
  try {
    await mysqlPool.execute(
      'INSERT INTO logs (user_id, action, target_id, timestamp, details) VALUES (?, ?, ?, ?, ?)',
      [userId, action, null, new Date(), details ? JSON.stringify(details) : null]
    );
  } catch (error) {
    console.warn('[AI-Audit] 写入日志失败:', error.message);
  }
};

const shouldAudit = (aiConfig) => Boolean(aiConfig?.capabilities?.logging?.enabled);

router.use(async (req, res, next) => {
  try {
    await ensureRedisConnected();
    return next();
  } catch (error) {
    console.error('Redis不可用:', error);
    return res.status(503).json({ message: 'Redis不可用，请稍后再试' });
  }
});

/**
 * @swagger
 * /api/chat/ask:
 *   post:
 *     summary: 发送问题到智能问答系统
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - question
 *             properties:
 *               question:
 *                 type: string
 *                 description: 用户提问
 *               conversationId:
 *                 type: string
 *                 description: 会话ID，用于维护上下文
 *     responses:
 *       200:
 *         description: 返回回答
 */
router.post('/ask', async (req, res) => {
  try {
    const { question, conversationId = null, mode: requestMode } = req.body;
    const aiMode = (requestMode || process.env.AI_MODE || 'pre_retrieve').trim();
    
    if (!question) {
      return res.status(400).json({ message: '问题不能为空' });
    }
    
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 生成会话ID或使用现有ID
    const sessionId = conversationId || `chat_${req.user.id}_${Date.now()}`;
    const assistantMessageId = `assistant_${req.user.id}_${Date.now()}`;

    // 注意：刷新/导航会导致 SSE 连接断开，但不应该中止后端生成。
    // 否则会出现“后端继续跑但不落库，刷新后前端既看不到思考气泡也拿不到最终答案”。
    const abortController = new AbortController();
    let clientDisconnected = false;

    res.on('close', () => {
      clientDisconnected = true;
      console.log(`[Chat] 客户端断开连接(将继续生成并落库), sessionId: ${sessionId}`);
    });

    const safeWrite = (chunk) => {
      if (clientDisconnected) return;
      try {
        res.write(chunk);
      } catch (err) {
        clientDisconnected = true;
        console.log(`[Chat] 写入 SSE 失败，视为客户端断开 (sessionId: ${sessionId})`);
      }
    };

    const safeEnd = () => {
      if (clientDisconnected) return;
      try {
        res.end();
      } catch (err) {
        clientDisconnected = true;
      }
    };

    // 立即把“用户问题 + 机器人占位（思考中）”写入 Redis，确保刷新后能看到气泡并禁用输入
    const conversationKey = `chat:${sessionId}`;
    const messagesKey = `${conversationKey}:messages`;
    const nowIso = new Date().toISOString();
    const exists = await redisClient.exists(conversationKey);
    if (!exists) {
      await redisClient.hSet(conversationKey, {
        userId: req.user.id.toString(),
        createdAt: nowIso,
        updatedAt: nowIso
      });
    } else {
      await redisClient.hSet(conversationKey, 'updatedAt', nowIso);
    }

    const userMessage = {
      id: `user_${req.user.id}_${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: nowIso
    };

    // 用 <think> 作为“思考中”标记（前端 parseMessageContent 识别未闭合 <think>）
    const botMessage = {
      id: assistantMessageId,
      role: 'bot',
      content: '',
      pending: true,
      source: 'mcp_model',
      mode: aiMode,
      data: null,
      toolsCalled: [],
      toolsError: null,
      timestamp: nowIso
    };

    await redisClient.rPush(messagesKey, JSON.stringify(userMessage));
    await redisClient.rPush(messagesKey, JSON.stringify(botMessage));

    // botMessage 在 list 中的索引（用于 LSET 更新内容）
    const botIndex = (await redisClient.lLen(messagesKey)) - 1;
    const updateBotMessage = async (content, extra = {}) => {
      try {
        const next = {
          ...botMessage,
          ...extra,
          content,
          timestamp: new Date().toISOString()
        };
        await redisClient.lSet(messagesKey, botIndex, JSON.stringify(next));
        await redisClient.hSet(conversationKey, 'updatedAt', new Date().toISOString());
      } catch (err) {
        console.error('[Chat] 更新 bot 消息失败:', err);
      }
    };

    // 设置过期时间(7天)
    await redisClient.expire(conversationKey, 60 * 60 * 24 * 7);
    await redisClient.expire(messagesKey, 60 * 60 * 24 * 7);

    // 获取会话历史（如果有）
    let history = [];
    if (conversationId) {
      const messagesKey = `chat:${conversationId}:messages`;
      const exists = await redisClient.exists(messagesKey);
      
      if (exists) {
        const messages = await redisClient.lRange(messagesKey, 0, -1);
        history = messages.map(msg => {
          const parsedMsg = JSON.parse(msg);
          return {
            role: parsedMsg.role === 'user' ? 'user' : 'assistant',
            content: parsedMsg.content
          };
        });
      }
    }
    
    let context = '';
    let graphData = null;
    let sources = [];
    let relationalData = null;

    // 仅在非工具调用模式下使用旧版检索
    // 在 tool_calling 模式下，交给 MCP Agent 自行决定检索
    if (aiMode !== 'tool_calling') {
      // 尝试获取知识图谱数据
      const graphResponse = await handleGraphQueries(question);
      // 尝试获取关系型数据库数据
      relationalData = await handleRelationalQueries(question);

      if (graphResponse) {
        graphData = graphResponse.data;
        sources.push('knowledge_graph');
        
        // 构建上下文供大模型使用
        const nodes = graphResponse.data.nodes;
        const edges = graphResponse.data.edges;
        
        if (nodes.length > 0) {
          const nodeMap = {};
          nodes.forEach(n => nodeMap[n.id] = n.label);
          
          const entities = nodes.map(n => `${n.label}(${n.type})`).join('、');
          const relations = edges.map(e => {
            const source = nodeMap[e.source] || '未知';
            const target = nodeMap[e.target] || '未知';
            return `${source} ${e.label} ${target}`;
          }).join('；');
          
          context += `【知识图谱信息】：\n实体：${entities}\n关系：${relations}\n参考说明：${graphResponse.text}\n\n`;
        }
      }

      if (relationalData) {
        sources.push('relational_db');
        context += `【文物档案信息】：\n${relationalData}\n\n`;
      }

      if (sources.length > 0) {
        context += `【检索提示】：本次已从 ${sources.join('、')} 检索到相关信息。请务必基于以上检索内容作答，不要回答“未在数据中找到相关信息”。如信息不足，请明确说明不足之处。\n\n`;
      }
    } else {
      console.log('[Chat] Model is in tool_calling mode, skipping legacy pre-retrieval.');
    }
    
    // 打印检索到的上下文信息，方便调试
    
    // 打印检索到的上下文信息，方便调试
    console.log('--- MCP Context Debug ---');
    console.log('Question:', question);
    console.log('Sources:', sources);
    if (graphData) {
      console.log('Graph Data Nodes:', graphData.nodes.length);
      console.log('Graph Data Edges:', graphData.edges.length);
    }
    if (relationalData) {
      console.log('Relational Data Preview:', relationalData.substring(0, 200) + (relationalData.length > 200 ? '...' : ''));
    }
    console.log('Full Context Length:', context.length);
    console.log('-------------------------');

    // 发送元数据
    safeWrite(`event: metadata\n`);
    const sourceLabel = aiMode === 'tool_calling'
      ? 'tool_calling'
      : (sources.length > 0 ? sources.join('_enhanced_') : 'mcp_model');

    // 将 metadata 同步到落库的 bot message，保证刷新后气泡信息一致
    await updateBotMessage(botMessage.content, {
      source: sourceLabel,
      data: graphData,
      mode: aiMode
    });

    safeWrite(`data: ${JSON.stringify({
      conversationId: sessionId,
      assistantMessageId,
      source: sourceLabel,
      data: graphData,
      mode: aiMode
    })}\n\n`);
    
    let fullAnswer = '';
    
    const aiConfig = getAiPluginsConfig();
    const providerId = aiConfig.defaultProvider;
    const providerConfig = aiConfig.providers?.[providerId];
    const provider = providers[providerId];

    const startTs = Date.now();

    if (shouldAudit(aiConfig)) {
      await writeAuditLog({
        userId: req.user.id,
        action: 'ai_plugin_call',
        details: {
          providerId,
          providerEnabled: Boolean(providerConfig?.enabled),
          capabilities: aiConfig.capabilities || {},
          conversationId: sessionId,
          sources
        }
      });
    }

    if (!provider || !provider.isEnabled(providerConfig)) {
      const disabledMessage = 'AI 服务未启用或当前 provider 不可用，请联系管理员启用后重试。';
      safeWrite(`event: message\n`);
      safeWrite(`data: ${JSON.stringify({ content: disabledMessage })}\n\n`);
      fullAnswer += disabledMessage;

      await updateBotMessage(disabledMessage, { isError: true, pending: false });

      if (shouldAudit(aiConfig)) {
        await writeAuditLog({
          userId: req.user.id,
          action: 'ai_plugin_error',
          details: {
            providerId,
            reason: provider ? 'provider_disabled' : 'provider_not_found',
            durationMs: Date.now() - startTs,
            conversationId: sessionId
          }
        });
      }

      safeWrite(`event: done\n`);
      safeWrite(`data: [DONE]\n\n`);
      safeEnd();
      return;
    }

    const applied = applyInputCapabilities({
      question,
      context,
      capabilities: aiConfig.capabilities
    });

    if (shouldAudit(aiConfig)) {
      await writeAuditLog({
        userId: req.user.id,
        action: 'ai_provider_call',
        details: {
          providerId,
          model: process.env.AI_MODEL,
          endpointConfigured: Boolean(process.env.AI_API_ENDPOINT),
          conversationId: sessionId,
          status: 'start'
        }
      });
    }

    // 调用 provider（目前实现为 MCP），保持原 SSE 流式输出格式
    await provider.askStream({
      question: applied.question,
      history,
      context: applied.context,
      mode: aiMode,
      signal: abortController.signal,
      onData: (content) => {
        // 即使客户端断开也要继续累积并落库
        safeWrite(`event: message\n`);
        safeWrite(`data: ${JSON.stringify({ content })}\n\n`);
        fullAnswer += content;

        // 刷新后使用 pending 字段恢复“进行中”状态（不改变内容形态，保持气泡一致）
        updateBotMessage(fullAnswer, { pending: true });
      },
      onToolResult: (result) => {
        const payload = {
          mode: result?.mode || aiMode,
          tools_called: result?.toolsCalled || []
        };

        if (result?.errorMessage) {
          payload.error = result.errorMessage;
        }

        safeWrite(`event: tools\n`);
        safeWrite(`data: ${JSON.stringify(payload)}\n\n`);

        // 工具调用结果也要落库，刷新后保持一致
        updateBotMessage(fullAnswer, {
          pending: true,
          mode: payload.mode,
          toolsCalled: payload.tools_called,
          toolsError: payload.error || null
        });

        if (result?.errorMessage) {
          safeWrite(`event: error\n`);
          safeWrite(`data: ${JSON.stringify({ message: result.errorMessage })}\n\n`);

          updateBotMessage(fullAnswer || result.errorMessage, {
            pending: true,
            toolsError: result.errorMessage
          });
        }
      },
      onEnd: async () => {
        // 无论客户端是否断开，都要写入最终答案
        if (shouldAudit(aiConfig)) {
          await writeAuditLog({
            userId: req.user.id,
            action: 'ai_provider_call',
            details: {
              providerId,
              status: 'success',
              durationMs: Date.now() - startTs,
              conversationId: sessionId
            }
          });
        }

        await updateBotMessage(fullAnswer, { pending: false });
        safeWrite(`event: done\n`);
        safeWrite(`data: [DONE]\n\n`);
        safeEnd();
      },
      onError: async (error) => {
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
          console.log(`[Chat] provider 中止 (sessionId: ${sessionId})`);
          await updateBotMessage(fullAnswer || '回答已中止', { canceled: true, pending: false });
          return;
        }
        
        console.error('流式响应错误:', error.message);

        if (shouldAudit(aiConfig)) {
          await writeAuditLog({
            userId: req.user.id,
            action: 'ai_plugin_error',
            details: {
              providerId,
              status: 'error',
              code: error.code,
              message: error.message,
              durationMs: Date.now() - startTs,
              conversationId: sessionId
            }
          });
        }

        safeWrite(`event: error\n`);
        const errorMsg = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND'
          ? '无法连接到AI模型服务，请检查后端配置'
          : '生成回答时出错';
        safeWrite(`data: ${JSON.stringify({ message: errorMsg })}\n\n`);
        await updateBotMessage(errorMsg, { isError: true, pending: false });
        safeEnd();
      }
    });
    
  } catch (error) {
    console.error('问答系统错误:', error);
    // 如果还没发送过响应头，发送JSON错误
    if (!res.headersSent) {
      res.status(500).json({ message: '服务器内部错误' });
    } else {
      res.end();
    }
  }
});

/**
 * @swagger
 * /api/chat/history:
 *   get:
 *     summary: 获取用户的对话历史
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: conversationId
 *         schema:
 *           type: string
 *         description: 会话ID，不提供则返回所有会话
 *     responses:
 *       200:
 *         description: 返回对话历史
 */
router.get('/history', async (req, res) => {
  try {
    const { conversationId } = req.query;
    const userId = req.user.id;
    
    let history;
    if (conversationId) {
      // 获取指定会话的历史记录
      const conversationKey = `chat:${conversationId}`;
      const exists = await redisClient.exists(conversationKey);
      
      if (!exists) {
        return res.status(404).json({ message: '会话不存在' });
      }
      
      // 确认会话所有者
      const owner = await redisClient.hGet(conversationKey, 'userId');
      if (parseInt(owner) !== userId) {
        return res.status(403).json({ message: '无权访问此会话' });
      }
      
      // 获取会话消息
      const messages = await redisClient.lRange(`${conversationKey}:messages`, 0, -1);
      history = {
        conversationId,
        messages: messages.map(msg => JSON.parse(msg))
      };
    } else {
      // 获取用户所有会话
      const userConversationPattern = `chat:*`;
      const keys = await redisClient.keys(userConversationPattern);
      
      const sessions = [];
      for (const key of keys) {
        // 跳过消息列表键，只处理会话元数据键
        if (key.endsWith(':messages')) {
          continue;
        }

        try {
          // 检查键类型，确保是Hash
          const type = await redisClient.type(key);
          if (type !== 'hash') {
            continue;
          }

          const owner = await redisClient.hGet(key, 'userId');
          
          // 仅包含属于该用户的会话
          if (owner && parseInt(owner) === userId) {
            const convId = key.split(':')[1];
            const createdAt = await redisClient.hGet(key, 'createdAt');
            
            sessions.push({
              conversationId: convId,
              createdAt
            });
          }
        } catch (err) {
          console.warn(`Skipping key ${key} due to error: ${err.message}`);
          continue;
        }
      }
      
      // 按创建时间降序排序
      sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // 如果没有会话，返回空消息列表
      if (sessions.length === 0) {
        history = { messages: [] };
      } else {
        // 获取最近一次会话的详情
        const latestSession = sessions[0];
        const conversationKey = `chat:${latestSession.conversationId}`;
        const messages = await redisClient.lRange(`${conversationKey}:messages`, 0, -1);
        
        history = {
          conversationId: latestSession.conversationId,
          messages: messages.map(msg => JSON.parse(msg))
        };
      }
    }
    
    res.status(200).json(history);
  } catch (error) {
    console.error('获取对话历史错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/chat/history:
 *   delete:
 *     summary: 清空用户对话历史（可选仅清空指定会话）
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: conversationId
 *         schema:
 *           type: string
 *         description: 会话ID，不提供则清空该用户所有会话
 *     responses:
 *       200:
 *         description: 清空成功
 */
router.delete('/history', async (req, res) => {
  try {
    const { conversationId } = req.query;
    const userId = req.user.id;

    // 清空单个会话
    if (conversationId) {
      const conversationKey = `chat:${conversationId}`;
      const exists = await redisClient.exists(conversationKey);
      if (!exists) {
        return res.status(200).json({ message: '会话已清空', deleted: 0 });
      }

      const owner = await redisClient.hGet(conversationKey, 'userId');
      if (owner && parseInt(owner) !== userId) {
        return res.status(403).json({ message: '无权操作此会话' });
      }

      const deleted = await redisClient.del(conversationKey, `${conversationKey}:messages`);
      return res.status(200).json({ message: '会话已清空', deleted });
    }

    // 清空当前用户的所有会话
    const keys = await redisClient.keys('chat:*');
    const toDelete = [];

    for (const key of keys) {
      // 只处理会话元数据 hash 键
      if (key.endsWith(':messages')) continue;

      try {
        const type = await redisClient.type(key);
        if (type !== 'hash') continue;

        const owner = await redisClient.hGet(key, 'userId');
        if (owner && parseInt(owner) === userId) {
          toDelete.push(key);
          toDelete.push(`${key}:messages`);
        }
      } catch (err) {
        console.warn(`Skipping key ${key} due to error: ${err.message}`);
        continue;
      }
    }

    if (toDelete.length === 0) {
      return res.status(200).json({ message: '无可清空的会话', deleted: 0 });
    }

    const deleted = await redisClient.del(toDelete);
    return res.status(200).json({ message: '聊天记录已清空', deleted });
  } catch (error) {
    console.error('清空对话历史错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * 处理知识图谱查询
 * @param {string} question 用户问题
 * @returns {Object|null} 包含文本和数据的响应或null
 */
async function handleGraphQueries(question) {
  const session = neo4jDriver.session();
  
  try {
    // 移除严格的意图检查，让更多查询尝试检索图谱
    // const intent = mcpService.analyzeIntent(question);
    // if (intent !== 'knowledge_graph') {
    //   return null;
    // }
    
    // 根据问题中的关键词构建Cypher查询
    let cypherQuery = null;
    let params = {};
    let responseText = '';
    
    if (question.includes('四羊方尊') || question.includes('方尊')) {
      cypherQuery = `
        MATCH (a:Artifact)-[r]-(n)
        WHERE a.name CONTAINS $name
        RETURN a, r, n LIMIT 10
      `;
      params.name = '方尊';
      responseText = '四羊方尊是商代晚期的青铜礼器，因器身四面各有一只羊而得名，是中国商代青铜文化的代表作之一，具有很高的历史、艺术和科学价值。';
    } else if (question.includes('唐三彩') || question.includes('三彩')) {
      cypherQuery = `
        MATCH (a:Artifact)-[r]-(n)
        WHERE a.name CONTAINS $name
        RETURN a, r, n LIMIT 10
      `;
      params.name = '三彩';
      responseText = '唐三彩是盛唐时期的彩陶艺术品，以黄、绿、白三色为主，也有褐、蓝、黑等色彩。主要产地在河南洛阳和陕西西安附近，多用于陪葬品，展现了唐代的社会生活和艺术风貌。';
    } else if (question.includes('商代') && question.includes('文物')) {
      cypherQuery = `
        MATCH (a:Artifact)-[:BELONGS_TO_ERA]->(e:Era {name: $era})
        OPTIONAL MATCH (a)-[r]-(n)
        WHERE n:Category OR n:Location
        RETURN a, r, n LIMIT 15
      `;
      params.era = '商代';
      responseText = '商代(约前16世纪-前11世纪)的代表性文物主要有青铜礼器，如四羊方尊、司母戊鼎等；甲骨文；玉器和陶器等。这些文物体现了商代高度发达的青铜冶铸技术和礼制文化。';
    } else if (question.includes('西周') && question.includes('青铜器')) {
      cypherQuery = `
        MATCH (a:Artifact)-[:BELONGS_TO_ERA]->(e:Era {name: $era})
        MATCH (a)-[:HAS_CATEGORY]->(c:Category {name: $category})
        OPTIONAL MATCH (a)-[r]-(n)
        RETURN a, r, n LIMIT 15
      `;
      params.era = '西周';
      params.category = '青铜器';
      responseText = '西周(约前11世纪-前771年)青铜器继承了商代的传统，但造型更加庄重，纹饰更加写实。代表性器物有毛公鼎、散氏盘等，铭文内容增多，对研究西周历史、礼制具有重要价值。';
    } else {
      // 通用检索：将问题拆成多个关键词，分别检索并汇总结果
      const extraction = extractKeywordsService(question, {
        maxKeywords: 4,
        keepIntent: true,
        debug: process.env.DEBUG_KEYWORDS === 'true',
        logSource: 'graph'
      });
      const keywords = extraction.keywords || [];
      if (keywords.length === 0) return null;

      cypherQuery = `
        MATCH (a:Artifact)
        WHERE a.name CONTAINS $keyword OR a.description CONTAINS $keyword
        OPTIONAL MATCH (a)-[r]-(n)
        RETURN a, r, n LIMIT 10
      `;

      responseText = `以下是与"${keywords.join('、')}"相关的文物信息，您可以在图谱中探索它们的关系。`;

      // 逐关键词查询并合并结果（去重）
      const nodes = new Set();
      const edges = new Set();

      for (const keyword of keywords) {
        params = { keyword };
        const result = await session.run(cypherQuery, params);
        result.records.forEach(record => {
          const keys = record.keys;
          keys.forEach(key => {
            const value = record.get(key);
            if (value && value.labels) {
              const props = value.properties || {};
              nodes.add(JSON.stringify({
                id: value.identity.toString(),
                label: props.name || props.label || props.title || value.identity.toString(),
                type: value.labels[0].toLowerCase()
              }));
            } else if (value && value.type) {
              edges.add(JSON.stringify({
                id: value.identity.toString(),
                source: value.start.toString(),
                target: value.end.toString(),
                label: value.type
              }));
            }
          });
        });
      }

      if (nodes.size === 0 && edges.size === 0) {
        return null;
      }

      return {
        text: responseText,
        data: {
          nodes: Array.from(nodes).map(node => JSON.parse(node)).slice(0, 60),
          edges: Array.from(edges).map(edge => JSON.parse(edge)).slice(0, 120)
        }
      };
    }
    
    if (!cypherQuery) {
      return null;
    }
    
    // 执行Cypher查询
    const result = await session.run(cypherQuery, params);
    
    // 没有结果
    if (result.records.length === 0) {
      return null;
    }
    
    // 处理查询结果
    const nodes = new Set();
    const edges = new Set();
    
    result.records.forEach(record => {
      const keys = record.keys;
      
      keys.forEach(key => {
        const value = record.get(key);
        
        // 处理节点
        if (value && value.labels) {
          const props = value.properties || {};
          nodes.add(JSON.stringify({
            id: value.identity.toString(),
            label: props.name || props.label || props.title || value.identity.toString(),
            type: value.labels[0].toLowerCase()
          }));
        }
        // 处理关系
        else if (value && value.type) {
          edges.add(JSON.stringify({
            id: value.identity.toString(),
            source: value.start.toString(),
            target: value.end.toString(),
            label: value.type
          }));
        }
      });
    });
    
    return {
      text: responseText,
      data: {
        nodes: Array.from(nodes).map(node => JSON.parse(node)),
        edges: Array.from(edges).map(edge => JSON.parse(edge))
      }
    };
  } catch (error) {
    console.error('知识图谱查询错误:', error);
    return null;
  } finally {
    await session.close();
  }
}

/**
 * 从用户问题中抽取适合用于图谱检索的关键词。
 * 目标：避免把整句中文当成一个 keyword（原先按空格 split 会失败）。
 */
// NOTE: extractKeywords 已迁移到 backend/src/services/keyword.service.js

/**
 * 处理关系型数据库查询 (MySQL)
 * @param {string} question 用户问题
 * @returns {string|null} 格式化的文物信息或null
 */
async function handleRelationalQueries(question) {
  try {
    const extraction = extractKeywordsService(question, {
      maxKeywords: 6,
      keepIntent: true,
      debug: process.env.DEBUG_KEYWORDS === 'true',
      logSource: 'mysql'
    });
    const keywords = extraction.keywords || [];
    
    if (keywords.length === 0) return null;

    // 构建动态查询
    // 我们希望找到匹配任意关键词的文物
    const conditions = [];
    const params = [];
    
    keywords.forEach(keyword => {
      conditions.push(`(name LIKE ? OR description LIKE ? OR category LIKE ? OR era LIKE ? OR location LIKE ?)`);
      const term = `%${keyword}%`;
      params.push(term, term, term, term, term);
    });

    const sql = `
      SELECT name, description, category, era, location 
      FROM artifacts 
      WHERE ${conditions.join(' OR ')}
      LIMIT 5
    `;

    const [rows] = await mysqlPool.execute(sql, params);
    
    if (rows.length === 0) return null;

    return rows.map(r => 
      `- 名称: ${r.name}\n  类别: ${r.category}\n  年代: ${r.era}\n  出土地点: ${r.location}\n  描述: ${r.description}`
    ).join('\n\n');

  } catch (error) {
    console.error('MySQL查询错误:', error);
    return null;
  }
}

/**
 * 保存对话到Redis
 * @param {string} conversationId 会话ID
 * @param {string} question 问题
 * @param {string} answer 回答
 * @param {number} userId 用户ID
 */
async function saveConversation(conversationId, question, answer, userId) {
  try {
    const conversationKey = `chat:${conversationId}`;
    
    // 检查会话是否存在
    const exists = await redisClient.exists(conversationKey);
    
    if (!exists) {
      // 创建新会话
      await redisClient.hSet(conversationKey, {
        userId: userId.toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } else {
      // 更新会话时间戳
      await redisClient.hSet(conversationKey, 'updatedAt', new Date().toISOString());
    }
    
    // 添加消息
    const message = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString()
    };
    
    const botMessage = {
      role: 'bot',
      content: answer,
      timestamp: new Date().toISOString()
    };
    
    await redisClient.rPush(`${conversationKey}:messages`, JSON.stringify(message));
    await redisClient.rPush(`${conversationKey}:messages`, JSON.stringify(botMessage));
    
    // 设置过期时间(7天)
    await redisClient.expire(conversationKey, 60 * 60 * 24 * 7);
    await redisClient.expire(`${conversationKey}:messages`, 60 * 60 * 24 * 7);
  } catch (error) {
    console.error('保存对话错误:', error);
  }
}

module.exports = router;
