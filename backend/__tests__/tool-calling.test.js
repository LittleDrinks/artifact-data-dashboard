const path = require('path');
const request = require('supertest');
const express = require('express');

const mockProviderBehavior = {
  toolsCalled: [{ name: 'mock-tool', status: 'success', result: { ok: true } }],
  content: '工具回答',
  errorMessage: null
};

jest.mock('../src/config/database', () => ({
  neo4jDriver: { session: () => ({ run: jest.fn().mockResolvedValue({ records: [] }), close: jest.fn() }) },
  redisClient: {
    exists: jest.fn().mockResolvedValue(false),
    lRange: jest.fn().mockResolvedValue([]),
    rPush: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(true),
    hSet: jest.fn().mockResolvedValue(true),
    hGet: jest.fn().mockResolvedValue(null),
    keys: jest.fn().mockResolvedValue([]),
    type: jest.fn().mockResolvedValue('hash'),
    del: jest.fn().mockResolvedValue(1)
  },
  mysqlPool: { execute: jest.fn().mockResolvedValue([[]]) },
  ensureRedisConnected: jest.fn().mockResolvedValue()
}));

jest.mock('../src/services/ai/plugin-config', () => ({
  getAiPluginsConfig: () => ({
    defaultProvider: 'mcp',
    providers: { mcp: { enabled: true } },
    capabilities: {}
  })
}));

jest.mock('../src/services/ai/providers/mcp.provider', () => {
  return {
    McpProvider: jest.fn().mockImplementation(() => ({
      isEnabled: () => true,
      askStream: async ({ onData, onEnd, onToolResult }) => {
        if (onToolResult) {
          onToolResult({
            toolsCalled: mockProviderBehavior.toolsCalled,
            mode: 'tool_calling',
            errorMessage: mockProviderBehavior.errorMessage
          });
        }
        if (onData) {
          onData(mockProviderBehavior.content);
        }
        if (onEnd) {
          onEnd();
        }
      }
    }))
  };
});

jest.mock('../src/services/ai/capabilities', () => ({
  applyInputCapabilities: ({ question, context }) => ({ question, context })
}));

describe('MCPService tool calling', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.AI_MODE;
    process.env.AI_API_ENDPOINT = 'http://localhost/mock';
    process.env.AI_API_KEY = 'test-key';
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

describe('chat.routes tool_calling integration', () => {
  beforeEach(() => {
    mockProviderBehavior.toolsCalled = [{ name: 'mock-tool', status: 'success', result: { ok: true } }];
    mockProviderBehavior.content = '工具回答';
    mockProviderBehavior.errorMessage = null;
  });

  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: 1 };
      next();
    });
    const router = require('../src/routes/chat.routes');
    app.use('/api/chat', router);
    return app;
  };

  test('streams tool_calling results via tools event', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/chat/ask')
      .set('Accept', 'text/event-stream')
      .send({ question: '测试工具调用', mode: 'tool_calling' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: tools');
    expect(res.text).toContain('mock-tool');
    expect(res.text).toContain('工具回答');
  });

  test('sends fallback error message when tools unavailable', async () => {
    mockProviderBehavior.toolsCalled = [];
    mockProviderBehavior.errorMessage = '检索工具暂时不可用，请稍后重试';
    mockProviderBehavior.content = '检索工具暂时不可用，请稍后重试';

    const app = buildApp();
    const res = await request(app)
      .post('/api/chat/ask')
      .set('Accept', 'text/event-stream')
      .send({ question: '测试无工具', mode: 'tool_calling' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('检索工具暂时不可用，请稍后重试');
    expect(res.text).toContain('event: error');
  });
});
