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
}

module.exports = {
  ToolManager,
  toolManager: new ToolManager()
};
