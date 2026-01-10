const { safeJsonParse, stripCodeFences } = require('../src/utils/json-parser');

describe('json-parser util', () => {
  test('stripCodeFences removes ``` and ```json fences', () => {
    const raw = "```json\n{\"a\":1}\n```";
    const stripped = stripCodeFences(raw);
    expect(stripped).toBe('{"a":1}');
  });

  test('safeJsonParse parses JSON with fences and returns ok', () => {
    const raw = "```json\n{\"b\":2}\n```";
    const parsed = safeJsonParse(raw);
    expect(parsed.ok).toBe(true);
    expect(parsed.value).toEqual({ b: 2 });
  });

  test('safeJsonParse returns error on invalid JSON and fallback if provided', () => {
    const raw = 'not-json';
    const parsed = safeJsonParse(raw, { fallback: { default: true } });
    expect(parsed.ok).toBe(false);
    expect(parsed.value).toEqual({ default: true });
    expect(parsed.error).toBeInstanceOf(Error);
  });
});
