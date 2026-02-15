const { extractKeywords } = require('../src/services/utils/keyword.service');

describe('keyword.service.extractKeywords', () => {
  test('removes polite stopwords for artifact query', () => {
    const result = extractKeywords('介绍一下彩绘釉陶人物俑', { keepIntent: true, debug: true });
    expect(result.keywords.join(' ')).not.toMatch(/介绍|一下/);
    expect(result.keywords.join(' ')).toMatch(/彩绘釉陶|人物俑|彩绘釉陶人物俑/);
  });

  test('merges phrase tokens when dictionary has phrase', () => {
    const result = extractKeywords('彩绘釉陶 人物俑 的年代', { keepIntent: true, debug: true, maxKeywords: 8 });
    // 年代可能被分词为“年代”或“朝代”，但应保留核心实体短语
    expect(result.keywords.join(' ')).toMatch(/彩绘釉陶|人物俑|彩绘釉陶人物俑/);
  });

  test('extracts intent=who but does not include interrogatives in keywords', () => {
    const result = extractKeywords('这件文物是谁做的？', { keepIntent: true, debug: true, maxKeywords: 8 });
    expect(result.intent).toBe('who');
    expect(result.keywords.join(' ')).toMatch(/文物/);
    expect(result.keywords.join(' ')).not.toMatch(/谁/);
  });

  test('extracts quoted phrase with highest priority', () => {
    const result = extractKeywords('请介绍一下《四羊方尊》的年代', { keepIntent: true, debug: true, maxKeywords: 8 });
    expect(result.keywords[0]).toMatch(/四羊方尊/);
    expect(result.keywords.join(' ')).not.toMatch(/请问|介绍|一下/);
  });

  test('returns empty for empty input', () => {
    const result = extractKeywords('', { keepIntent: true, debug: true });
    expect(result.keywords).toEqual([]);
  });

  test('debug payload includes tokenizer and counts', () => {
    const result = extractKeywords('请问《四羊方尊》是什么？', { keepIntent: true, debug: true, maxKeywords: 8 });
    expect(result.debug).toBeTruthy();
    expect(result.debug.tokenizer).toBeTruthy();
    expect(typeof result.debug.stopwordsCount).toBe('number');
    expect(typeof result.debug.phraseCount).toBe('number');
  });
});
