const path = require('path');

describe('MCPService tool calling', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.AI_MODE;
    process.env.AI_API_ENDPOINT = '';
    process.env.AI_API_KEY = '';
  });

  test('handles tool_calling mode and returns tool results', async () => {
    process.env.AI_MODE = 'tool_calling';
    const { ToolManager } = require('../src/services/tool-manager');
    const { MCPService } = require('../src/services/mcp.service');

    const tm = new ToolManager();
    const handler = jest.fn(async ({ question }) => ({ echo: question }));
    tm.registerTool('mock-tool', {}, handler);

    const chatFlow = {
      beforeToolCall: jest.fn(async () => {}),
      afterToolCall: jest.fn(async () => {})
    };

    const svc = new MCPService({ toolManager: tm, chatFlow, getAiMode: () => 'tool_calling' });
    const res = await svc.ask('测试工具调用');

    expect(res.intent).toBe('tool_calling');
    expect(res.toolsCalled).toHaveLength(1);
    expect(res.toolsCalled[0].status).toBe('success');
    expect(handler).toHaveBeenCalled();
    expect(chatFlow.beforeToolCall).toHaveBeenCalled();
    expect(chatFlow.afterToolCall).toHaveBeenCalled();
  });

  test('returns fallback message when no tools registered', async () => {
    const { MCPService } = require('../src/services/mcp.service');
    const svc = new MCPService({
      toolManager: { listTools: () => [] },
      chatFlow: { beforeToolCall: jest.fn(), afterToolCall: jest.fn() },
      getAiMode: () => 'tool_calling'
    });

    const res = await svc.ask('无工具场景');
    expect(res.intent).toBe('tool_calling');
    expect(res.content).toMatch(/检索工具暂时不可用/);
  });

  test('uses pre_retrieve path when AI_MODE=pre_retrieve', async () => {
    const { MCPService } = require('../src/services/mcp.service');
    const svc = new MCPService({
      toolManager: { listTools: () => [{ name: 'should-not-use', handler: jest.fn() }] },
      getAiMode: () => 'pre_retrieve'
    });

    const res = await svc.ask('文物是什么');
    expect(res.intent).not.toBe('tool_calling');
    // 模拟模式返回字符串内容
    expect(typeof res.content).toBe('string');
  });
});
