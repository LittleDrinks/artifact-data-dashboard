class ToolManager {
  constructor() {
    this.tools = new Map();
  }

  registerTool(name, schema, handler) {
    if (!name || typeof name !== 'string') {
      throw new Error('Tool name must be a non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new Error('Tool handler must be a function');
    }
    this.tools.set(name, { name, schema, handler });
  }

  clear() {
    this.tools.clear();
  }

  getTool(name) {
    return this.tools.get(name);
  }

  listTools() {
    return Array.from(this.tools.values());
  }

  async executeTool(name, params = {}) {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    try {
      const result = await tool.handler(params || {});
      return {
        name: tool.name,
        status: 'success',
        result,
        error: null
      };
    } catch (err) {
      return {
        name: tool.name,
        status: 'error',
        result: null,
        error: err?.message ? String(err.message) : String(err)
      };
    }
  }
}

module.exports = {
  ToolManager,
  toolManager: new ToolManager()
};
