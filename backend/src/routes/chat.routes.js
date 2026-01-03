const express = require('express');
const { neo4jDriver, redisClient, mysqlPool, ensureRedisConnected } = require('../config/database');
const mcpService = require('../services/mcp.service');

const router = express.Router();

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
    const { question, conversationId = null } = req.body;
    
    if (!question) {
      return res.status(400).json({ message: '问题不能为空' });
    }
    
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 生成会话ID或使用现有ID
    const sessionId = conversationId || `chat_${req.user.id}_${Date.now()}`;
    
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
    
    // 尝试获取知识图谱数据
    const graphResponse = await handleGraphQueries(question);
    // 尝试获取关系型数据库数据
    const relationalData = await handleRelationalQueries(question);

    let context = '';
    let graphData = null;
    let sources = [];

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
    res.write(`event: metadata\n`);
    res.write(`data: ${JSON.stringify({
      conversationId: sessionId,
      source: sources.length > 0 ? sources.join('_enhanced_') : 'mcp_model',
      data: graphData
    })}\n\n`);
    
    let fullAnswer = '';
    
    // 调用MCP大模型服务，流式返回
    await mcpService.askStream(question, history, context,
      (content) => {
        res.write(`event: message\n`);
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
        fullAnswer += content;
      },
      async () => {
        // 保存对话
        await saveConversation(sessionId, question, fullAnswer, req.user.id);
        res.write(`event: done\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
      },
      (error) => {
        console.error('流式响应错误:', error.message);
        res.write(`event: error\n`);
        // 返回更具体的错误信息，帮助前端判断
        const errorMsg = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' 
          ? '无法连接到AI模型服务，请检查后端配置' 
          : '生成回答时出错';
        res.write(`data: ${JSON.stringify({ message: errorMsg })}\n\n`);
        res.end();
      }
    );
    
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
      const keywords = extractKeywords(question, { maxKeywords: 4 });
      console.log('[Graph] Extracted keywords:', keywords);
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
function extractKeywords(question, { maxKeywords = 4 } = {}) {
  const raw = (question || '').trim();
  if (!raw) return [];

  // 优先提取引号/书名号里的实体（允许单字，例如“甗”】【鼎】《甗》）
  const quoted = [];
  const quotedRegex = /[“"《【「](.+?)[”"》】」]/g;
  for (const match of raw.matchAll(quotedRegex)) {
    const phrase = (match[1] || '').trim();
    if (phrase) quoted.push(phrase);
  }

  // 先把常见标点统一成空格
  let text = raw.replace(/[\s,.?!，。？！:：;；()（）"“”'’、《》【】\[\]{}<>]+/g, ' ');

  // 去掉常见停用词/提问词/泛化词（尽量覆盖中文口语提问）
  const stopPhrases = [
    '请问', '麻烦', '帮我', '帮忙', '能否', '可以', '能不能', '给我',
    '介绍', '讲讲', '说说', '解释', '说明', '概述', '总结', '详细', '更多',
    '什么', '是什么', '有哪些', '有没有', '怎么', '如何', '为什么',
    '的', '吗', '呢', '呀', '吧', '啊', '我', '你', '他', '她', '它',
    '相关', '关系', '联系', '图谱', '知识图谱', '信息'
  ];
  for (const phrase of stopPhrases) {
    if (!phrase) continue;
    text = text.split(phrase).join(' ');
  }

  // 把常见并列/连接词也当作分隔符
  text = text.replace(/[、/]/g, ' ');
  for (const conj of ['和', '与', '及', '以及', '还有', '或者', '或', '跟']) {
    text = text.split(conj).join(' ');
  }

  const tokens = text
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean)

    // 默认只取 2+ 字，避免 1 字过泛；但如果是引号/书名号提取到的实体则允许 1 字
    .filter(t => t.length >= 2 && t.length <= 20);

  const isCjkSingleChar = (s) => /^[\u4e00-\u9fff]$/.test(s);

  // 合并：quoted 优先、保序、去重
  const candidates = [...quoted, ...tokens];

  // 去重（保序）
  const seen = new Set();
  const unique = [];
  for (const t of candidates) {
    // 过滤掉过于泛化的一字（只允许 quoted 中的一字；普通 tokens 已经 >=2）
    if (t.length === 1 && !isCjkSingleChar(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    unique.push(t);
    if (unique.length >= maxKeywords) break;
  }

  return unique;
}

/**
 * 处理关系型数据库查询 (MySQL)
 * @param {string} question 用户问题
 * @returns {string|null} 格式化的文物信息或null
 */
async function handleRelationalQueries(question) {
  try {
    // 简单的关键词提取，排除常见停用词
    const stopWords = ['什么', '是', '的', '吗', '有', '在', '哪里', '介绍', '一下', '知道', '了解', '告诉', '我'];
    const quoted = [];
    const quotedRegex = /[“"《【「](.+?)[”"》】」]/g;
    for (const match of (question || '').matchAll(quotedRegex)) {
      const phrase = (match[1] || '').trim();
      if (phrase) quoted.push(phrase);
    }

    const tokens = (question || '').split(/[\s,.?!，。？！]+/)
      .map(k => k.trim())
      .filter(Boolean)
      .filter(k => k.length > 1 && !stopWords.includes(k));

    const keywords = Array.from(new Set([...quoted, ...tokens]))
      .filter(k => !stopWords.includes(k));

    console.log('[MySQL] Extracted keywords:', keywords);
    
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
