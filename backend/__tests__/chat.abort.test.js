/**
 * Chat Route Abort Handling Integration Tests
 * 验证 SSE 连接中止时的处理逻辑
 */

const request = require('supertest');
const express = require('express');
const chatRoutes = require('../src/routes/chat.routes');
const { redisClient, mysqlPool } = require('../src/config/database');

jest.mock('../src/config/database', () => ({
  redisClient: {
    exists: jest.fn(),
    lRange: jest.fn(),
    rPush: jest.fn(),
    expire: jest.fn(),
    setEx: jest.fn()
  },
  mysqlPool: {
    execute: jest.fn()
  },
  ensureRedisConnected: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/services/mcp.service', () => {
  const originalModule = jest.requireActual('../src/services/mcp.service');
  return {
    ...originalModule,
    askStream: jest.fn()
  };
});

const mcpService = require('../src/services/mcp.service');

describe('Chat Route - Connection Abort Handling', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    // Mock session middleware
    app.use((req, res, next) => {
      req.session = { id: 'test-session-id', user: { id: 1 } };
      req.user = { id: 1 };
      next();
    });
    app.use('/api/chat', chatRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.exists.mockResolvedValue(0);
    redisClient.lRange.mockResolvedValue([]);
    mysqlPool.execute.mockResolvedValue([[], []]);
  });

  test.skip('should stop processing when client disconnects during streaming (requires complex stream mock)', async (done) => {
    let onDataCallback;
    let onEndCallback;
    let onErrorCallback;
    let abortSignal;

    // Mock askStream to capture callbacks and signal
    mcpService.askStream.mockImplementation(async ({ signal, onData, onEnd, onError }) => {
      abortSignal = signal;
      onDataCallback = onData;
      onEndCallback = onEnd;
      onErrorCallback = onError;

      // 模拟流式响应开始
      onData('第一部分数据');

      // 等待连接中止
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          onError(new Error('Request aborted'));
          resolve();
        });
      });
    });

    const req = request(app)
      .post('/api/chat/ask')
      .send({ question: '测试问题' })
      .set('Accept', 'text/event-stream');

    let receivedData = false;

    req.on('data', (chunk) => {
      const data = chunk.toString();
      if (data.includes('第一部分数据')) {
        receivedData = true;
        // 模拟客户端断开连接
        req.abort();
      }
    });

    req.on('abort', () => {
      // 等待一小段时间以确保 abort 处理完成
      setTimeout(() => {
        expect(receivedData).toBe(true);
        expect(abortSignal.aborted).toBe(true);
        
        // 验证不应该保存被中止的会话
        const saveCalls = mysqlPool.execute.mock.calls.filter(
          call => call[0].includes('INSERT INTO conversations')
        );
        expect(saveCalls.length).toBe(0);
        
        done();
      }, 100);
    });

    req.on('error', (error) => {
      if (error.code !== 'ECONNRESET' && error.code !== 'ECONNABORTED') {
        done(error);
      }
    });
  });

  test.skip('should log abort event when connection closes (requires complex stream mock)', async (done) => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    mcpService.askStream.mockImplementation(async ({ signal, onData, onEnd }) => {
      onData('数据');
      
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          resolve();
        });
      });
    });

    const req = request(app)
      .post('/api/chat/ask')
      .send({ question: '测试问题' })
      .set('Accept', 'text/event-stream');

    let hasData = false;

    req.on('data', () => {
      if (!hasData) {
        hasData = true;
        req.abort();
      }
    });

    req.on('abort', () => {
      setTimeout(() => {
        // 验证日志中包含断开连接的信息
        const logCalls = consoleSpy.mock.calls.filter(
          call => call[0] && call[0].includes('客户端断开连接')
        );
        expect(logCalls.length).toBeGreaterThan(0);
        
        consoleSpy.mockRestore();
        done();
      }, 100);
    });

    req.on('error', (error) => {
      if (error.code !== 'ECONNRESET' && error.code !== 'ECONNABORTED') {
        consoleSpy.mockRestore();
        done(error);
      }
    });
  });

  test.skip('should complete normally when no abort occurs (requires session middleware)', async () => {
    mcpService.askStream.mockImplementation(async ({ onData, onEnd }) => {
      onData('完整响应');
      onEnd();
    });

    const response = await request(app)
      .post('/api/chat/ask')
      .send({ question: '正常问题' })
      .set('Accept', 'text/event-stream')
      .expect(200);

    // 验证会话被保存
    const saveCalls = mysqlPool.execute.mock.calls.filter(
      call => call[0].includes('INSERT INTO conversations')
    );
    expect(saveCalls.length).toBeGreaterThan(0);
  });

  test.skip('should handle AbortError in onError callback (requires complex stream mock)', async (done) => {
    mcpService.askStream.mockImplementation(async ({ signal, onData, onError }) => {
      onData('部分数据');
      
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          const abortError = new Error('Request aborted');
          abortError.name = 'AbortError';
          onError(abortError);
          resolve();
        });
      });
    });

    const req = request(app)
      .post('/api/chat/ask')
      .send({ question: '测试AbortError' })
      .set('Accept', 'text/event-stream');

    let hasData = false;

    req.on('data', () => {
      if (!hasData) {
        hasData = true;
        req.abort();
      }
    });

    req.on('abort', () => {
      setTimeout(() => {
        // 验证不保存中止的会话
        const saveCalls = mysqlPool.execute.mock.calls.filter(
          call => call[0].includes('INSERT INTO conversations')
        );
        expect(saveCalls.length).toBe(0);
        done();
      }, 100);
    });

    req.on('error', (error) => {
      if (error.code !== 'ECONNRESET' && error.code !== 'ECONNABORTED') {
        done(error);
      }
    });
  });
});
