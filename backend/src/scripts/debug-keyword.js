/*
  Usage:
    node src/scripts/debug-keyword.js "介绍一下彩绘釉陶人物俑"

  Env:
    PHRASE_MERGE_MODE=conservative|max-match
*/

const { extractKeywords } = require('../services/keyword.service');

const input = process.argv.slice(2).join(' ').trim();
if (!input) {
  // eslint-disable-next-line no-console
  console.error('请提供一句中文问题作为参数');
  process.exit(1);
}

const result = extractKeywords(input, {
  keepIntent: true,
  debug: true,
  maxKeywords: 8
});

// eslint-disable-next-line no-console
console.log(JSON.stringify({ question: input, ...result }, null, 2));
