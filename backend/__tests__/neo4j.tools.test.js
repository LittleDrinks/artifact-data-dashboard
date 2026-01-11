jest.mock('axios');
const axios = require('axios');

jest.mock('../src/config/database', () => ({
  neo4jDriver: {
    session: () => ({
      run: jest.fn().mockResolvedValue({ records: [{ toObject: () => ({ a: 1 }) }] }),
      close: jest.fn()
    })
  }
}));

const tools = require('../src/services/tools/neo4j.tools');

describe('neo4j.tools handlers', () => {
  test('read_neo4j_cypher uses MCP sidecar when available', async () => {
    axios.post.mockResolvedValueOnce({ data: { result: 'sidecar-ok' } });
    const readTool = tools.find(t => t.name === 'read_neo4j_cypher');
    const res = await readTool.handler({ query: 'RETURN 1' });
    const parsed = JSON.parse(res);
    expect(parsed).toEqual({ result: 'sidecar-ok' });
  });

  test('read_neo4j_cypher falls back to local driver when sidecar fails', async () => {
    axios.post.mockRejectedValueOnce(new Error('network')); // force fallback
    const readTool = tools.find(t => t.name === 'read_neo4j_cypher');
    const res = await readTool.handler({ query: 'MATCH (n) RETURN n' });
    const parsed = JSON.parse(res);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toEqual({ a: 1 });
  });
});
