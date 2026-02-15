const { ToolManager } = require('../src/services/utils/tool-manager');

describe('MCPService mode switching (unit)', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.AI_MODE;
    process.env.AI_API_ENDPOINT = 'http://localhost/mock';
    process.env.AI_API_KEY = 'test-key';
  });

  test('ask() uses tool_calling path when AI_MODE=tool_calling', async () => {
    const { MCPService } = require('../src/services/mcp.service');

    const tm = new ToolManager();
    const handler = jest.fn(async ({ question }) => ({ echo: question }));
    tm.registerTool('mock-tool', { type: 'object' }, handler);

    const svc = new MCPService({
      toolManager: tm,
      getAiMode: () => 'tool_calling',
      chatFlow: { beforeToolCall: jest.fn(async () => {}), afterToolCall: jest.fn(async () => {}) }
    });

    const res = await svc.ask('测试工具调用');
    expect(res.mode).toBe('tool_calling');
    expect(res.intent).toBe('tool_calling');
    expect(res.toolsCalled).toHaveLength(1);
    expect(handler).toHaveBeenCalled();
  });

  test('ask() uses pre_retrieve path when AI_MODE=pre_retrieve', async () => {
    const { MCPService } = require('../src/services/mcp.service');

    const svc = new MCPService({
      // 确保不会走 tool_calling
      toolManager: { listTools: () => [{ name: 'should-not-use', handler: jest.fn() }] },
      getAiMode: () => 'pre_retrieve'
    });

    // 这里不依赖外部大模型：MCPService 会在连接失败时回退 simulateResponse
    const res = await svc.ask('文物是什么');
    expect(res.intent).not.toBe('tool_calling');
    expect(typeof res.content).toBe('string');
  });

  test('askStream() calls onToolResult/onData/onEnd in tool_calling mode', async () => {
    const { MCPService } = require('../src/services/mcp.service');

    const tm = new ToolManager();
    tm.registerTool('mock-tool', { type: 'object' }, async ({ question }) => ({ echo: question }));

    const svc = new MCPService({
      toolManager: tm,
      getAiMode: () => 'tool_calling'
    });

    const seen = { tool: null, data: '', ended: false };
    await svc.askStream({
      question: 'stream test',
      mode: 'tool_calling',
      onToolResult: (r) => (seen.tool = r),
      onData: (t) => (seen.data += t),
      onEnd: () => (seen.ended = true),
      onError: () => {}
    });

    expect(seen.tool).toBeTruthy();
    expect(seen.tool.mode).toBe('tool_calling');
    expect(seen.data.length).toBeGreaterThan(0);
    expect(seen.ended).toBe(true);
  });
});
