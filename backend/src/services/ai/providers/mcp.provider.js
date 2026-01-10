const mcpService = require('../../mcp.service');
const { toolManager } = require('../../tool-manager');

class McpProvider {
  constructor(deps = {}) {
    this.id = 'mcp';
    this.toolManager = deps.toolManager || toolManager;
  }

  isEnabled(providerConfig) {
    return Boolean(providerConfig?.enabled);
  }

  registerTool(name, schema, handler) {
    return this.toolManager.registerTool(name, schema, handler);
  }

  listTools() {
    return this.toolManager.listTools();
  }

  async askStream({ question, history = [], context = '', mode, onData, onEnd, onError, onToolResult }) {
    return mcpService.askStream({ question, history, context, mode, onData, onEnd, onError, onToolResult });
  }
}

module.exports = {
  McpProvider
};
