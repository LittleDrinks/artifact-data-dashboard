describe('ToolManager (unit)', () => {
  test('register/get/list/clear work', () => {
    const { ToolManager } = require('../src/services/tool-manager');
    const tm = new ToolManager();

    const handler = jest.fn(async () => ({ ok: true }));
    tm.registerTool('demo', { type: 'object' }, handler);

    expect(tm.getTool('demo').handler).toBe(handler);
    expect(tm.listTools().map((t) => t.name)).toContain('demo');

    tm.clear();
    expect(tm.listTools()).toHaveLength(0);
  });

  test('registerTool validates name and handler', () => {
    const { ToolManager } = require('../src/services/tool-manager');
    const tm = new ToolManager();

    expect(() => tm.registerTool('', {}, async () => {})).toThrow();
    expect(() => tm.registerTool('ok', {}, 'not-fn')).toThrow();
  });

  test('executeTool runs tool handler and returns success ToolResult', async () => {
    const { ToolManager } = require('../src/services/tool-manager');
    const tm = new ToolManager();
    const handler = jest.fn(async ({ a }) => ({ a }));
    tm.registerTool('sum', { type: 'object' }, handler);

    const res = await tm.executeTool('sum', { a: 1 });
    expect(res).toEqual({
      name: 'sum',
      status: 'success',
      result: { a: 1 },
      error: null
    });
    expect(handler).toHaveBeenCalledWith({ a: 1 });
  });

  test('executeTool returns error ToolResult when handler throws', async () => {
    const { ToolManager } = require('../src/services/tool-manager');
    const tm = new ToolManager();
    tm.registerTool('boom', { type: 'object' }, async () => {
      throw new Error('kaboom');
    });

    const res = await tm.executeTool('boom', { any: 'x' });
    expect(res.name).toBe('boom');
    expect(res.status).toBe('error');
    expect(res.result).toBeNull();
    expect(res.error).toMatch(/kaboom/);
  });

  test('executeTool throws when tool not found', async () => {
    const { ToolManager } = require('../src/services/tool-manager');
    const tm = new ToolManager();
    await expect(tm.executeTool('missing', {})).rejects.toThrow(/not found/i);
  });
});
