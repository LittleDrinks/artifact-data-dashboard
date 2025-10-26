const express = require('express');
const { neo4jDriver, redisClient } = require('../config/database');
const mcpService = require('../services/mcp.service');

const router = express.Router();

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
    
    // 检查是否为知识图谱查询
    const graphResponse = await handleGraphQueries(question);
    if (graphResponse) {
      await saveConversation(sessionId, question, graphResponse.text, req.user.id);
      return res.status(200).json({
        answer: graphResponse.text,
        conversationId: sessionId,
        source: 'knowledge_graph',
        data: graphResponse.data
      });
    }
    
    // 调用MCP大模型服务
    const mcpResponse = await mcpService.ask(question, history);
    
    // 保存对话
    await saveConversation(sessionId, question, mcpResponse.content, req.user.id);
    
    // 返回响应
    res.status(200).json({
      answer: mcpResponse.content,
      conversationId: sessionId,
      source: mcpResponse.metadata?.source || 'mcp_model',
      intent: mcpResponse.intent
    });
  } catch (error) {
    console.error('问答系统错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
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
      
      history = [];
      for (const key of keys) {
        const owner = await redisClient.hGet(key, 'userId');
        
        // 仅包含属于该用户的会话
        if (parseInt(owner) === userId) {
          const convId = key.split(':')[1];
          const createdAt = await redisClient.hGet(key, 'createdAt');
          const messagesCount = await redisClient.lLen(`${key}:messages`);
          
          history.push({
            conversationId: convId,
            createdAt,
            messagesCount
          });
        }
      }
      
      // 按创建时间降序排序
      history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    res.status(200).json(history);
  } catch (error) {
    console.error('获取对话历史错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
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
    // 分析问题意图
    const intent = mcpService.analyzeIntent(question);
    if (intent !== 'knowledge_graph') {
      return null;
    }
    
    // 根据问题中的关键词构建Cypher查询
    let cypherQuery = null;
    let params = {};
    let responseText = '';
    
    if (question.includes('四羊方尊') || question.includes('方尊')) {
      cypherQuery = `
        MATCH (a:Artifact)-[r]-(n)
        WHERE a.name CONTAINS '方尊'
        RETURN a, r, n LIMIT 10
      `;
      responseText = '四羊方尊是商代晚期的青铜礼器，因器身四面各有一只羊而得名，出土于湖南宁乡。它是中国商代青铜文化的代表作之一，具有很高的历史、艺术和科学价值。';
    } else if (question.includes('唐三彩') || question.includes('三彩')) {
      cypherQuery = `
        MATCH (a:Artifact)-[r]-(n)
        WHERE a.name CONTAINS '三彩'
        RETURN a, r, n LIMIT 10
      `;
      responseText = '唐三彩是盛唐时期的彩陶艺术品，以黄、绿、白三色为主，也有褐、蓝、黑等色彩。主要产地在河南洛阳和陕西西安附近，多用于陪葬品，展现了唐代的社会生活和艺术风貌。';
    } else if (question.includes('商代') && question.includes('文物')) {
      cypherQuery = `
        MATCH (a:Artifact)-[:BELONGS_TO_ERA]->(e:Era {name: '商代'})
        OPTIONAL MATCH (a)-[r]-(n)
        WHERE n:Category OR n:Location
        RETURN a, r, n LIMIT 15
      `;
      responseText = '商代(约前16世纪-前11世纪)的代表性文物主要有青铜礼器，如四羊方尊、司母戊鼎等；甲骨文；玉器和陶器等。这些文物体现了商代高度发达的青铜冶铸技术和礼制文化。';
    } else if (question.includes('西周') && question.includes('青铜器')) {
      cypherQuery = `
        MATCH (a:Artifact)-[:BELONGS_TO_ERA]->(e:Era {name: '西周'})
        MATCH (a)-[:HAS_CATEGORY]->(c:Category {name: '青铜器'})
        OPTIONAL MATCH (a)-[r]-(n)
        RETURN a, r, n LIMIT 15
      `;
      responseText = '西周(约前11世纪-前771年)青铜器继承了商代的传统，但造型更加庄重，纹饰更加写实。代表性器物有毛公鼎、散氏盘等，铭文内容增多，对研究西周历史、礼制具有重要价值。';
    } else {
      // 尝试一个更通用的查询
      cypherQuery = `
        MATCH (a:Artifact)
        WHERE a.name CONTAINS $keyword OR a.description CONTAINS $keyword
        OPTIONAL MATCH (a)-[r]-(n)
        RETURN a, r, n LIMIT 15
      `;
      
      // 从问题中提取关键词
      const keywords = question.split(/\s+/).filter(word => word.length > 1);
      params.keyword = keywords.length > 0 ? keywords[0] : '';
      
      responseText = `以下是与"${params.keyword}"相关的文物信息，您可以在图谱中探索它们的关系。`;
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
          nodes.add(JSON.stringify({
            id: value.identity.toString(),
            label: value.properties.name,
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
