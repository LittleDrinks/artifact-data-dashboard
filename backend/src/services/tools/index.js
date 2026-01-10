const { toolManager } = require('../tool-manager');
const neo4jTools = require('./neo4j.tools');
const artifactTools = require('./artifact.tools');

const registerAllTools = () => {
  try {
    console.log('[Tools] 开始注册工具...');
    
    // 注册 Neo4j 工具
    neo4jTools.forEach(tool => {
      toolManager.registerTool(tool.name, tool.schema, tool.handler);
      console.log(`[Tools] 已注册工具: ${tool.name}`);
    });

    // 注册 Artifact 工具
    artifactTools.forEach(tool => {
      toolManager.registerTool(tool.name, tool.schema, tool.handler);
      console.log(`[Tools] 已注册工具: ${tool.name}`);
    });

    const total = neo4jTools.length + artifactTools.length;
    console.log(`[Tools] 工具注册完成，共 ${total} 个工具`);
  } catch (error) {
    console.error('[Tools] 工具注册失败:', error);
  }
};

module.exports = { registerAllTools };
