const mcpService = require('../../mcp.service');

class McpProvider {
  constructor() {
    this.id = 'mcp';
  }

  isEnabled(providerConfig) {
    return Boolean(providerConfig?.enabled);
  }

  async askStream({ question, history = [], context = '', onData, onEnd, onError }) {
    return mcpService.askStream(question, history, context, onData, onEnd, onError);
  }
}

module.exports = {
  McpProvider
};
