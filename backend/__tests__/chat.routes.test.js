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

describe('chat.routes tool results (SSE)', () => {
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

  beforeEach(() => {
    jest.resetModules();
    process.env.AI_MODE = 'tool_calling';
    process.env.NODE_ENV = 'test';
    mockProviderBehavior.toolsCalled = [{ name: 'mock-tool', status: 'success', result: { ok: true } }];
    mockProviderBehavior.content = '工具回答';
    mockProviderBehavior.errorMessage = null;
  });

  test('streams tools event with tools_called + mode', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/chat/ask')
      .set('Accept', 'text/event-stream')
      .send({ question: '测试工具调用', mode: 'tool_calling' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: metadata');
    expect(res.text).toContain('event: tools');
    expect(res.text).toContain('tools_called');
    expect(res.text).toContain('mock-tool');
    expect(res.text).toContain('event: message');
    expect(res.text).toContain('工具回答');
    expect(res.text).toContain('event: done');
  });

  test('streams error event when provider returns errorMessage', async () => {
    mockProviderBehavior.toolsCalled = [];
    mockProviderBehavior.errorMessage = '检索工具暂时不可用，请稍后重试';
    mockProviderBehavior.content = '检索工具暂时不可用，请稍后重试';

    const app = buildApp();
    const res = await request(app)
      .post('/api/chat/ask')
      .set('Accept', 'text/event-stream')
      .send({ question: '无工具场景', mode: 'tool_calling' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: tools');
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('检索工具暂时不可用');
    expect(res.text).toContain('event: done');
  });
});
