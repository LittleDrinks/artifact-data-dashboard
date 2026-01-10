const mcpService = require('../../mcp.service');

class McpProvider {
  constructor() {
    this.id = 'mcp';
  }

  isEnabled(providerConfig) {
    return Boolean(providerConfig?.enabled);
  }

  async askStream({ question, history = [], context = '', mode, onData, onEnd, onError, onToolResult }) {
    return mcpService.askStream({ question, history, context, mode, onData, onEnd, onError, onToolResult });
  }
}

module.exports = {
  McpProvider
};
