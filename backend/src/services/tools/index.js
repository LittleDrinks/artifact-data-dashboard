const { toolManager } = require('../utils/tool-manager');
const neo4jTools = require('../kg/neo4j-tools');
const artifactTools = require('./artifact-tools');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('ToolsIndex');

const registerAllTools = () => {
  try {
    logger.info('[Tools] 开始注册工具...');
    
    // 注册 Neo4j 工具
    neo4jTools.forEach(tool => {
      toolManager.registerTool(tool.name, tool.schema, tool.handler);
      logger.info(`[Tools] 已注册工具: ${tool.name}`);
    });

    // 注册 Artifact 工具
    artifactTools.forEach(tool => {
      toolManager.registerTool(tool.name, tool.schema, tool.handler);
      logger.info(`[Tools] 已注册工具: ${tool.name}`);
    });

    const total = neo4jTools.length + artifactTools.length;
    logger.info(`[Tools] 工具注册完成，共 ${total} 个工具`);
  } catch (error) {
    logger.error('[Tools] 工具注册失败:', error);
  }
};

module.exports = { registerAllTools };
