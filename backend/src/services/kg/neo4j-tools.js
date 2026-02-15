const axios = require('axios');
const { neo4jDriver } = require('../../config/database');
const { validateQuery } = require('./cypher-validator');
const { executeQuery } = require('./cypher-executor');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('Neo4jTools');

const NEO4J_MCP_ENDPOINT = (process.env.NEO4J_MCP_ENDPOINT || 'http://neo4j-cypher:8080').replace(/\/$/, '');

async function callNeo4jCypherViaMcp(path, payload) {
  const url = `${NEO4J_MCP_ENDPOINT}${path}`;
  try {
    const response = await axios.post(url, payload, { timeout: 15000 });
    return response.data;
  } catch (error) {
    // Fallback to local driver if MCP sidecar is unreachable
    logger.warn('[Neo4j MCP] 调用失败，回退到本地驱动', { error: error.message });
    return null;
  }
}

const tools = [
  {
    name: 'get_neo4j_schema',
    schema: {
      type: 'object',
      properties: {
        sample_size: {
          type: 'integer',
          description: 'The sample size used to infer the graph schema. Larger samples are slower, but more accurate. Smaller samples are faster, but might miss information.'
        }
      }
    },
    handler: async ({ sample_size = 1000 }) => {
      const session = neo4jDriver.session();
      try {
        // 尝试使用 db.schema.visualization() 获取概要
        // 如果需要属性信息，可能需要更复杂的查询，这里先做基础版本
        const result = await session.run('CALL db.schema.visualization()');
        
        // 提取节点标签
        const labels = result.records[0].get('nodes').map(node => node.labels[0]);
        // 提取关系类型
        const relationships = result.records[0].get('relationships').map(rel => rel.type);

        // 为了符合 MCP 工具描述 "Returns nodes, their properties..."，我们尝试采样获取属性
        const propertyResult = await session.run(`
          CALL db.schema.nodeTypeProperties() 
          YIELD nodeType, propertyName, propertyTypes 
          RETURN *
        `);
        
        const properties = propertyResult.records.map(record => ({
          nodeType: record.get('nodeType'),
          name: record.get('propertyName'),
          types: record.get('propertyTypes')
        }));

        return JSON.stringify({
          nodeLabels: labels,
          relationshipTypes: relationships,
          properties: properties.slice(0, 50) // 限制返回大小
        });
      } catch (error) {
        // 回退方案：如果在旧版 Neo4j 上
        const labelRes = await session.run('CALL db.labels()');
        const labels = labelRes.records.map(r => r.get(0));
        const relRes = await session.run('CALL db.relationshipTypes()');
        const rels = relRes.records.map(r => r.get(0));
        return JSON.stringify({ nodeLabels: labels, relationshipTypes: rels });
      } finally {
        await session.close();
      }
    }
  },
  {
    name: 'read_neo4j_cypher',
    schema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'The Cypher query to execute.'
        },
        params: {
          type: 'object',
          description: 'The parameters to pass to the Cypher query.'
        }
      }
    },
    handler: async ({ query, params = {} }) => {
      if (!query || typeof query !== 'string') {
        return JSON.stringify({ error: 'Query parameter is required and must be a string' });
      }

      // US4: Validate query for safety before execution
      const validation = await validateQuery(query, { executor: 'ai-assistant', permissionLevel: 'user' });
      if (!validation.isValid) {
        logger.warn('[Neo4j Tools] Query validation failed:', validation.errors);
        return JSON.stringify({
          error: 'Query validation failed',
          validationErrors: validation.errors,
          warnings: validation.warnings
        });
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        logger.warn('[Neo4j Tools] Query validation warnings:', validation.warnings);
      }

      // Use new cypher-executor service with timeout and result limits
      const executionResult = await executeQuery(query, params, {
        executor: 'ai-assistant',
        timeout: 10000, // 10 seconds
        maxResults: 100 // Limit to 100 results for AI context
      });

      if (!executionResult.success) {
        return JSON.stringify({
          error: executionResult.error,
          executionTime: executionResult.executionTime
        });
      }

      // Return formatted results
      return JSON.stringify({
        records: executionResult.records,
        summary: {
          recordCount: executionResult.summary.recordCount,
          totalAvailable: executionResult.summary.totalAvailable,
          wasTruncated: executionResult.summary.wasTruncated,
          executionTime: executionResult.executionTime
        }
      });
    }
  },
  {
    name: 'write_neo4j_cypher',
    schema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'The Cypher query to execute.'
        },
        params: {
          type: 'object',
          description: 'The parameters to pass to the Cypher query.'
        }
      }
    },
    handler: async ({ query, params = {} }) => {
      if (!query || typeof query !== 'string') {
        return JSON.stringify({ error: 'Query parameter is required and must be a string' });
      }

      // 优先使用 MCP sidecar（docker 镜像 mcp/neo4j-cypher）执行，失败则回退本地驱动
      const mcpResult = await callNeo4jCypherViaMcp('/cypher/write', { query, params });
      if (mcpResult !== null && mcpResult !== undefined) {
        return typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult);
      }

      const session = neo4jDriver.session();
      try {
        const result = await session.run(query, params);
        // 如果有 stats，通常 result.summary 会包含
        return JSON.stringify({
          records: result.records.map(r => r.toObject()),
          summary: {
            nodesCreated: result.summary.counters.updates().nodesCreated,
            relationshipsCreated: result.summary.counters.updates().relationshipsCreated,
            propertiesSet: result.summary.counters.updates().propertiesSet
          }
        });
      } finally {
        await session.close();
      }
    }
  }
];

module.exports = tools;
