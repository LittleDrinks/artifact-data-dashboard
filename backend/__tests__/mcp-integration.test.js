const { ToolManager } = require('../src/services/tool-manager');

describe('MCP integration (service + env)', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    delete process.env.MOCK_TOOL_CALLING;
    delete process.env.AI_API_ENDPOINT;
    delete process.env.AI_API_KEY;
  });

  test('AI_MODE=pre_retrieve triggers pre-retrieve flow (no tools called)', async () => {
    process.env.AI_MODE = 'pre_retrieve';

    const { MCPService } = require('../src/services/mcp.service');
    const tm = new ToolManager();
    const handler = jest.fn(async () => ({ ok: true }));
    tm.registerTool('mock-tool', { type: 'object' }, handler);

    const svc = new MCPService({ toolManager: tm });
    const res = await svc.ask('文物是什么');

    expect(res.mode).toBe('pre_retrieve');
    expect(res.intent).not.toBe('tool_calling');
    expect(handler).not.toHaveBeenCalled();
    expect(typeof res.content).toBe('string');
  });

  test('AI_MODE=tool_calling triggers tool calling flow (tool called)', async () => {
    process.env.AI_MODE = 'tool_calling';
    process.env.MOCK_TOOL_CALLING = 'true';

    const { MCPService } = require('../src/services/mcp.service');
    const tm = new ToolManager();
    const handler = jest.fn(async ({ question }) => ({ echo: question }));
    tm.registerTool('mock-tool', { type: 'object' }, handler);

    const svc = new MCPService({ toolManager: tm });
    const res = await svc.ask('测试工具调用');

    expect(res.mode).toBe('tool_calling');
    expect(res.intent).toBe('tool_calling');
    expect(res.toolsCalled).toHaveLength(1);
    expect(handler).toHaveBeenCalled();
  });
});
