describe('MCPService DeepSeek provider', () => {
  const buildService = async (overrides = {}) => {
    jest.resetModules();
    const { MCPService } = require('../src/services/mcp.service');
    return new MCPService({
      getAiMode: overrides.getAiMode || (() => 'pre_retrieve'),
      createOpenAIClient: overrides.createOpenAIClient
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    process.env.AI_API_ENDPOINT = '';
    process.env.AI_MODEL = 'deepseek-r1:8b';
  });

  test('returns clear error when DeepSeek is intended but api key missing', async () => {
    process.env.AI_MODEL = 'deepseek-chat';
    const svc = await buildService();
    const res = await svc.ask('测试缺少密钥');
    expect(res.intent).toBe('error');
    expect(res.content).toMatch(/DEEPSEEK_API_KEY/);
  });

  test('non-stream DeepSeek call returns sanitized content', async () => {
    const create = jest.fn(({ stream }) => {
      expect(stream).toBe(false);
      return { choices: [{ message: { content: '来自DeepSeek的回答' } }] };
    });
    const createOpenAIClient = jest.fn(() => ({ chat: { completions: { create } } }));
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
    const svc = await buildService({ createOpenAIClient });

    const res = await svc.ask('你好');

    expect(createOpenAIClient).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'test-key',
      baseURL: 'https://api.deepseek.com'
    }));
    expect(res.intent).not.toBe('error');
    expect(res.content).toContain('DeepSeek');
  });

  test('streaming DeepSeek call respects AbortSignal and forwards errors', async () => {
    const create = jest.fn(async ({ stream, signal }) => {
      expect(stream).toBe(true);
      async function* gen() {
        yield { choices: [{ delta: { content: '你好' } }] };
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (signal?.aborted) {
          const err = new Error('AbortError');
          err.name = 'AbortError';
          throw err;
        }
        yield { choices: [{ delta: { content: '，世界' } }] };
      }
      return gen();
    });

    const createOpenAIClient = jest.fn(() => ({ chat: { completions: { create } } }));
    process.env.DEEPSEEK_API_KEY = 'test-key';

    const svc = await buildService({ createOpenAIClient });

    const controller = new AbortController();
    const seen = [];
    let ended = false;
    let error;

    const streamPromise = svc.askStream({
      question: '流式测试',
      history: [],
      context: '',
      mode: 'pre_retrieve',
      signal: controller.signal,
      onData: (t) => seen.push(t),
      onEnd: () => {
        ended = true;
      },
      onError: (e) => {
        error = e;
      },
      onToolResult: () => {}
    });

    controller.abort();
    await streamPromise;

    expect(createOpenAIClient).toHaveBeenCalled();
    expect(seen.join('')).toContain('你好');
    expect(ended).toBe(false);
    expect(error).toBeTruthy();
  });
});
