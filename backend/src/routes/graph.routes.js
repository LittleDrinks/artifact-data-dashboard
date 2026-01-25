const express = require('express');
const neo4j = require('neo4j-driver');
const { neo4jDriver } = require('../config/database');
const { createLogger } = require('../utils/logger');

const logger = createLogger('GraphRoutes');
const router = express.Router();

/**
 * @swagger
 * /api/graph/artifacts:
 *   get:
 *     summary: 获取文物知识图谱数据
 *     tags: [Graph]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: 按关键词筛选节点
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: 返回节点数量限制
 *     responses:
 *       200:
 *         description: 返回知识图谱数据
 */
router.get('/artifacts', async (req, res) => {
  const session = neo4jDriver.session();
  
  try {
    const keyword = req.query.keyword;
    const DEFAULT_LIMIT = Number(process.env.GRAPH_DEFAULT_LIMIT) || 200;
    const MAX_LIMIT = Number(process.env.GRAPH_MAX_LIMIT) || 500;
    const requestedLimit = Number(req.query.limit);
    let limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.floor(requestedLimit)
      : DEFAULT_LIMIT;

    if (limit > MAX_LIMIT) {
      limit = MAX_LIMIT;
    }
    
    let query;
    let params = { limit: neo4j.int(limit) };
    
    if (keyword) {
      // 带关键词的查询，查找与关键词匹配的节点及其关系
      query = `
        MATCH (a:Artifact)
        WHERE coalesce(a.displayName, a.name) CONTAINS $keyword OR coalesce(a.description, '') CONTAINS $keyword
        OPTIONAL MATCH (a)-[r1]-(n1)
        OPTIONAL MATCH (n1)-[r2]-(n2)
        WHERE n2 <> a
        RETURN a, r1, n1, r2, n2
        LIMIT $limit
      `;
      params.keyword = keyword;
    } else {
      // 无关键词查询，获取一个有限的图谱子集
      query = `
        MATCH (a:Artifact)
        OPTIONAL MATCH (a)-[r1]-(n1)
        RETURN a, r1, n1
        LIMIT $limit
      `;
    }
    
    const result = await session.run(query, params);

    // 处理Neo4j结果为前端可用的图谱数据
    const nodes = new Map();
    const edges = new Map();

    const safeGet = (record, key) => (record.has(key) ? record.get(key) : null);
    const resolveLabel = (node, fallback) => {
      if (!node) return fallback;
      const props = node.properties || {};
      return (
        props.displayName ||
        props.name ||
        props.label ||
        props.title ||
        props.id ||
        fallback
      );
    };

    result.records.forEach(record => {
      const artifact = safeGet(record, 'a');
      const n1 = safeGet(record, 'n1');
      const n2 = safeGet(record, 'n2');
      const r1 = safeGet(record, 'r1');
      const r2 = safeGet(record, 'r2');

      // 处理文物节点
      if (artifact) {
        const artifactId = artifact.identity.toString();
        
        if (!nodes.has(artifactId)) {
          nodes.set(artifactId, {
            id: artifactId,
            label: resolveLabel(artifact, `artifact-${artifactId}`),
            type: 'artifact',
            properties: artifact.properties
          });
        }
      }
      
      // 处理一级关系节点
      if (n1) {
        const n1Id = n1.identity.toString();
        
        if (!nodes.has(n1Id)) {
          nodes.set(n1Id, {
            id: n1Id,
            label: resolveLabel(n1, `node-${n1Id}`),
            type: (n1.labels && n1.labels[0]) ? n1.labels[0].toLowerCase() : 'node',
            properties: n1.properties
          });
        }
      }
      
      // 处理二级关系节点
      if (n2) {
        const n2Id = n2.identity.toString();
        
        if (!nodes.has(n2Id)) {
          nodes.set(n2Id, {
            id: n2Id,
            label: resolveLabel(n2, `node-${n2Id}`),
            type: (n2.labels && n2.labels[0]) ? n2.labels[0].toLowerCase() : 'node',
            properties: n2.properties
          });
        }
      }
      
      // 处理一级关系
      if (r1) {
        const r1Id = r1.identity.toString();
        
        if (!edges.has(r1Id)) {
          edges.set(r1Id, {
            id: r1Id,
            source: r1.start.toString(),
            target: r1.end.toString(),
            label: r1.type || '',
            properties: r1.properties
          });
        }
      }
      
      // 处理二级关系
      if (r2) {
        const r2Id = r2.identity.toString();
        
        if (!edges.has(r2Id)) {
          edges.set(r2Id, {
            id: r2Id,
            source: r2.start.toString(),
            target: r2.end.toString(),
            label: r2.type || '',
            properties: r2.properties
          });
        }
      }
    });
    
    const allNodes = Array.from(nodes.values());
    const allEdges = Array.from(edges.values());

    // 搜索场景下，避免同类型节点过量导致前端难以阅读：按类型限量采样
    const hasKeyword = Boolean(keyword && String(keyword).trim());
    if (!hasKeyword) {
      return res.status(200).json({ nodes: allNodes, edges: allEdges });
    }

    const limitsByType = {
      artifact: Number(process.env.GRAPH_LIMIT_ARTIFACT) || 60,
      category: Number(process.env.GRAPH_LIMIT_CATEGORY) || 20,
      era: Number(process.env.GRAPH_LIMIT_ERA) || 12,
      location: Number(process.env.GRAPH_LIMIT_LOCATION) || 15,
      material: Number(process.env.GRAPH_LIMIT_MATERIAL) || 15,
      dimension: Number(process.env.GRAPH_LIMIT_DIMENSION) || 10,
      damagetype: Number(process.env.GRAPH_LIMIT_DAMAGETYPE) || 10,
      restorationmethod: Number(process.env.GRAPH_LIMIT_RESTORATIONMETHOD) || 10,
      reinforcementmethod: Number(process.env.GRAPH_LIMIT_REINFORCEMENTMETHOD) || 10,
      inspectiontechnique: Number(process.env.GRAPH_LIMIT_INSPECTIONTECHNIQUE) || 10,
      protectivematerial: Number(process.env.GRAPH_LIMIT_PROTECTIVEMATERIAL) || 10,
      inspectionmetric: Number(process.env.GRAPH_LIMIT_INSPECTIONMETRIC) || 10,
      node: Number(process.env.GRAPH_LIMIT_NODE) || 20
    };

    const keptIds = new Set();
    const counts = new Map();
    const keep = (node) => {
      const type = node.type || 'node';
      const limit = limitsByType[type] ?? limitsByType.node;
      const current = counts.get(type) || 0;
      if (current >= limit) return false;
      counts.set(type, current + 1);
      keptIds.add(node.id);
      return true;
    };

    // 优先保留 artifact，再保留其他类型（保序）
    const artifacts = allNodes.filter(n => n.type === 'artifact');
    const nonArtifacts = allNodes.filter(n => n.type !== 'artifact');
    const keptNodes = [];
    for (const n of artifacts) {
      if (keep(n)) keptNodes.push(n);
    }
    for (const n of nonArtifacts) {
      if (keep(n)) keptNodes.push(n);
    }

    // 过滤掉指向被裁剪节点的边
    const keptEdges = allEdges.filter(e => keptIds.has(e.source) && keptIds.has(e.target));

    return res.status(200).json({
      nodes: keptNodes,
      edges: keptEdges
    });
  } catch (error) {
    logger.error('获取知识图谱数据错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  } finally {
    await session.close();
  }
});

/**
 * @swagger
 * /api/graph/entity/{type}/{id}:
 *   get:
 *     summary: 获取实体详情及关系
 *     tags: [Graph]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *         description: 实体类型 (Artifact, Era, Category, etc)
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 实体ID
 *     responses:
 *       200:
 *         description: 返回实体详情及关系
 *       404:
 *         description: 实体不存在
 */
router.get('/entity/:type/:id', async (req, res) => {
  const session = neo4jDriver.session();
  
  try {
    const { type, id } = req.params;
    
    // 验证类型
    const validTypes = [
      'Artifact',
      'Era',
      'Category',
      'Dimension',
      'Material',
      'Location',
      'DamageType',
      'RestorationMethod',
      'ReinforcementMethod',
      'InspectionTechnique',
      'ProtectiveMaterial',
      'InspectionMetric'
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: '无效的实体类型' });
    }
    
    // 获取实体详情及其关系
    const result = await session.run(
      `MATCH (n:${type}) WHERE id(n) = $id
       OPTIONAL MATCH (n)-[r]-(related)
       RETURN n, r, related`,
      { id: parseInt(id) }
    );
    
    if (result.records.length === 0) {
      return res.status(404).json({ message: '实体不存在' });
    }
    
    // 构建实体详情
    const entityNode = result.records[0].get('n');
    const entityProps = entityNode.properties || {};
    const entityId = entityNode.identity.toString();
    const displayName = entityProps.displayName || entityProps.name || entityProps.title || `entity-${entityId}`;
    const canonicalName = entityProps.name || displayName;

    const entity = {
      ...entityProps,
      id: entityId,
      type,
      name: displayName,
      displayName,
      canonicalName
    };
    
    // 构建关系列表
    const relationships = [];
    
    result.records.forEach(record => {
      if (record.get('r') && record.get('related')) {
        const rel = record.get('r');
        const related = record.get('related');
        const relatedProps = related.properties || {};
        const relatedId = related.identity.toString();
        const relatedDisplayName = relatedProps.displayName || relatedProps.name || relatedProps.title || `entity-${relatedId}`;
        
        relationships.push({
          id: rel.identity.toString(),
          type: rel.type,
          direction: rel.start.toString() === entity.id ? 'outgoing' : 'incoming',
          entity: {
            id: relatedId,
            type: related.labels[0],
            name: relatedDisplayName,
            displayName: relatedDisplayName,
            canonicalName: relatedProps.name || relatedDisplayName,
            properties: relatedProps
          }
        });
      }
    });
    
    res.status(200).json({
      entity,
      relationships
    });
  } catch (error) {
    logger.error('获取实体详情错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  } finally {
    await session.close();
  }
});

/**
 * @swagger
 * /api/graph/cypher:
 *   post:
 *     summary: 执行自定义Cypher查询
 *     tags: [Graph]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: Cypher查询语句
 *               params:
 *                 type: object
 *                 description: 查询参数
 *     responses:
 *       200:
 *         description: 返回查询结果
 *       400:
 *         description: 无效的查询
 */
router.post('/cypher', async (req, res) => {
  // 注意：此接口应仅限管理员使用，存在安全风险
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足' });
  }
  
  const session = neo4jDriver.session();
  
  try {
    const { query, params = {} } = req.body;
    
    if (!query) {
      return res.status(400).json({ message: '查询语句为必填项' });
    }
    
    // 限制只能执行只读查询
    if (!query.trim().toUpperCase().startsWith('MATCH') && 
        !query.trim().toUpperCase().startsWith('CALL') && 
        !query.trim().toUpperCase().startsWith('RETURN')) {
      return res.status(400).json({ message: '只允许执行只读查询' });
    }
    
    const result = await session.run(query, params);
    
    // 转换结果为JSON格式
    const records = result.records.map(record => {
      const obj = {};
      record.keys.forEach(key => {
        const value = record.get(key);
        
        // 处理节点
        if (value && value.identity && value.labels) {
          obj[key] = {
            id: value.identity.toString(),
            labels: value.labels,
            properties: value.properties
          };
        }
        // 处理关系
        else if (value && value.identity && value.type) {
          obj[key] = {
            id: value.identity.toString(),
            type: value.type,
            start: value.start.toString(),
            end: value.end.toString(),
            properties: value.properties
          };
        }
        // 处理基本类型
        else {
          obj[key] = value;
        }
      });
      return obj;
    });
    
    res.status(200).json({
      records,
      summary: {
        resultAvailableAfter: result.summary.resultAvailableAfter.toInt(),
        resultConsumedAfter: result.summary.resultConsumedAfter.toInt()
      }
    });
  } catch (error) {
    logger.error('执行Cypher查询错误:', error);
    res.status(500).json({ message: '服务器内部错误', error: error.message });
  } finally {
    await session.close();
  }
});

module.exports = router;
