const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodejieba = require('nodejieba');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('KeywordService');

const DEFAULT_MAX_KEYWORDS = 4;

const resolveFromRepoRoot = (...segments) => {
  // backend/src/services -> backend
  const backendDir = path.resolve(__dirname, '..', '..');
  return path.join(backendDir, ...segments);
};

const STOPWORDS_PATH = resolveFromRepoRoot('config', 'stopwords.json');
const PHRASE_DICT_PATH = resolveFromRepoRoot('config', 'phrase-dict.txt');

let jiebaLoaded = false;
let stopwordsCache = new Set();
let stopwordsMtimeMs = 0;

let phraseSetCache = new Set();
let phraseMtimeMs = 0;

function safeReadFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function loadStopwords({ force = false } = {}) {
  try {
    if (!fs.existsSync(STOPWORDS_PATH)) {
      stopwordsCache = new Set();
      stopwordsMtimeMs = 0;
      return stopwordsCache;
    }

    const stat = fs.statSync(STOPWORDS_PATH);
    if (!force && stopwordsMtimeMs === stat.mtimeMs) return stopwordsCache;

    const raw = fs.readFileSync(STOPWORDS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('stopwords.json must be an array');

    stopwordsCache = new Set(parsed.map(s => String(s).trim()).filter(Boolean));
    stopwordsMtimeMs = stat.mtimeMs;
    return stopwordsCache;
  } catch (error) {
    // 保底：不要因为停用词加载失败而影响主流程
    stopwordsCache = stopwordsCache || new Set();
    return stopwordsCache;
  }
}

function loadPhraseDictionary({ force = false } = {}) {
  try {
    if (!fs.existsSync(PHRASE_DICT_PATH)) {
      phraseSetCache = new Set();
      phraseMtimeMs = 0;
      return phraseSetCache;
    }

    const stat = fs.statSync(PHRASE_DICT_PATH);
    if (!force && phraseMtimeMs === stat.mtimeMs) return phraseSetCache;

    const raw = fs.readFileSync(PHRASE_DICT_PATH, 'utf8');
    const phrases = raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !line.startsWith('#'))
      .map(line => line.split(/\s+/)[0])
      .filter(Boolean);

    phraseSetCache = new Set(phrases);
    phraseMtimeMs = stat.mtimeMs;
    return phraseSetCache;
  } catch {
    phraseSetCache = phraseSetCache || new Set();
    return phraseSetCache;
  }
}

function loadJiebaOnce() {
  if (jiebaLoaded) return;
  // nodejieba.load 只应调用一次；自定义词典可通过 userDict 加载
  try {
    if (fs.existsSync(PHRASE_DICT_PATH)) {
      nodejieba.load({ userDict: PHRASE_DICT_PATH });
    } else {
      nodejieba.load();
    }
  } catch {
    // 如果 load 失败，后续会走回退逻辑
  } finally {
    jiebaLoaded = true;
  }
}

function isCjkSingleChar(s) {
  return /^[\u4e00-\u9fff]$/.test(s);
}

function extractQuotedPhrases(text) {
  const raw = String(text || '');
  const phrases = [];
  const quotedRegex = /[“"《【「](.+?)[”"》】」]/g;
  for (const match of raw.matchAll(quotedRegex)) {
    const phrase = (match[1] || '').trim();
    if (phrase) phrases.push(phrase);
  }
  return phrases;
}

function normalizeText(text) {
  return String(text || '')
    .replace(/[\s,.?!，。？！:：;；()（）"“”'’、《》【】\[\]{}<>]+/g, ' ')
    .replace(/[、/]/g, ' ')
    .trim();
}

function detectIntent(question) {
  const q = String(question || '');
  if (!q) return undefined;

  // 粗粒度意图分类：只在明确出现疑问词时返回
  const intentMap = [
    { intent: 'who', patterns: ['谁', '哪位'] },
    { intent: 'when', patterns: ['何时', '什么时候', '哪年', '哪一年', '年代', '朝代'] },
    { intent: 'where', patterns: ['哪里', '何处', '在哪', '地点', '出土', '发现于'] },
    { intent: 'how', patterns: ['如何', '怎么', '怎样'] },
    { intent: 'why', patterns: ['为什么', '为何'] },
    { intent: 'what', patterns: ['什么', '是啥', '是什么'] }
  ];

  for (const item of intentMap) {
    if (item.patterns.some(p => q.includes(p))) return item.intent;
  }

  return undefined;
}

function fallbackTokenize(text) {
  return normalizeText(text)
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);
}

function maxMatchMerge(tokens, phraseSet) {
  if (!tokens || tokens.length === 0) return [];
  if (!phraseSet || phraseSet.size === 0) return tokens;

  // 贪心：在当前位置尝试合并最多 4 个 token，选择最长能匹配 phraseSet 的组合
  const merged = [];
  let i = 0;
  while (i < tokens.length) {
    let best = null;
    let bestLen = 0;
    for (let len = 4; len >= 2; len--) {
      if (i + len > tokens.length) continue;
      const candidate = tokens.slice(i, i + len).join('');
      if (phraseSet.has(candidate)) {
        best = candidate;
        bestLen = len;
        break;
      }
    }
    if (best) {
      merged.push(best);
      i += bestLen;
      continue;
    }
    merged.push(tokens[i]);
    i += 1;
  }

  return merged;
}

function extractKeywords(text, options = {}) {
  const {
    keepIntent = true,
    debug = false,
    maxKeywords = DEFAULT_MAX_KEYWORDS,
    phraseMergeMode = process.env.PHRASE_MERGE_MODE || 'conservative',
    logSource,
    requestId
  } = options;

  const startedAt = Date.now();
  const raw = String(text || '').trim();
  if (!raw) {
    return { keywords: [], intent: keepIntent ? detectIntent(raw) : undefined, rawTokens: [], debug: debug ? { reason: 'empty' } : undefined };
  }

  loadJiebaOnce();
  const stopwords = loadStopwords();
  const phraseSet = loadPhraseDictionary();
  const quoted = extractQuotedPhrases(raw);

  let tokens = [];
  let tokenizer = 'nodejieba';

  try {
    const normalized = normalizeText(raw);
    if (!normalized) {
      tokens = [];
    } else {
      tokens = nodejieba.cut(normalized, true);
    }
  } catch {
    tokenizer = 'fallback';
    tokens = fallbackTokenize(raw);
  }

  // 额外合并：仅在 max-match 时做 token 级合并
  const mergeMode = phraseMergeMode === 'max-match' ? 'max-match' : 'conservative';
  if (mergeMode === 'max-match') {
    tokens = maxMatchMerge(tokens, phraseSet);
  }

  // 过滤：停用词、长度、标点
  const filtered = tokens
    .map(t => String(t).trim())
    .filter(Boolean)
    .filter(t => !stopwords.has(t))
    .filter(t => t.length <= 30);

  // candidates = quoted 优先 + filtered
  const candidates = [...quoted, ...filtered];

  // 去重保序，并默认过滤 1 字（除 quoted 中 CJK 单字）
  const seen = new Set();
  const keywords = [];
  for (const t of candidates) {
    if (!t) continue;
    const isQuoted = quoted.includes(t);
    if (t.length === 1 && !(isQuoted && isCjkSingleChar(t))) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    keywords.push(t);
    if (keywords.length >= Number(maxKeywords) || keywords.length >= DEFAULT_MAX_KEYWORDS) break;
  }

  const intent = keepIntent ? detectIntent(raw) : undefined;

  // 疑问词不计入 keywords：保持简单实现（intent 为 who/what/...）
  const debugObj = debug
    ? {
        tokenizer,
        phraseMergeMode: mergeMode,
        stopwordsCount: stopwords.size,
        phraseCount: phraseSet.size,
        quoted,
        rawTokens: tokens
      }
    : undefined;

  maybeLogExtraction({
    level: resolveKeywordLogLevel(),
    source: logSource,
    requestId,
    question: raw,
    tokenizer,
    phraseMergeMode: mergeMode,
    stopwordsCount: stopwords.size,
    phraseCount: phraseSet.size,
    quotedCount: quoted.length,
    rawTokensCount: tokens.length,
    keywords,
    intent,
    durationMs: Date.now() - startedAt
  });

  return {
    keywords,
    intent,
    rawTokens: debug ? tokens : undefined,
    debug: debugObj
  };
}

function resolveKeywordLogLevel() {
  // Logging is controlled by env only (so tests using debug payload won't spam logs):
  // - DEBUG_KEYWORDS=true => debug
  // - KEYWORD_LOG_LEVEL=off|info|debug
  if (process.env.DEBUG_KEYWORDS === 'true') return 'debug';
  const raw = String(process.env.KEYWORD_LOG_LEVEL || '').trim().toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'off') return raw;
  return 'off';
}

function shouldSample() {
  const raw = String(process.env.KEYWORD_LOG_SAMPLE_RATE || '').trim();
  if (!raw) return true;
  const rate = Number(raw);
  if (Number.isNaN(rate) || rate <= 0) return false;
  if (rate >= 1) return true;
  return Math.random() < rate;
}

function hashQuestion(text) {
  try {
    return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 12);
  } catch {
    return undefined;
  }
}

function maybeLogExtraction(payload) {
  const { level } = payload;
  if (!level || level === 'off') return;
  if (!shouldSample()) return;

  const question = String(payload.question || '');
  const logBase = {
    event: 'keyword_extraction',
    source: payload.source || 'unknown',
    requestId: payload.requestId || undefined,
    questionLen: question.length,
    questionPreview: question.slice(0, 80),
    questionHash: hashQuestion(question),
    tokenizer: payload.tokenizer,
    usedFallback: payload.tokenizer !== 'nodejieba',
    phraseMergeMode: payload.phraseMergeMode,
    stopwordsCount: payload.stopwordsCount,
    phraseCount: payload.phraseCount,
    quotedCount: payload.quotedCount,
    rawTokensCount: payload.rawTokensCount,
    keywordsCount: Array.isArray(payload.keywords) ? payload.keywords.length : 0,
    intent: payload.intent,
    durationMs: payload.durationMs
  };

  if (level === 'info') {
    logger.debug('Keywords extracted', logBase);
    return;
  }

  // debug: include extracted keywords (and optionally raw tokens if requested)
  const debugLog = {
    ...logBase,
    keywords: payload.keywords
  };
  logger.debug('Keyword extraction debug', debugLog);
}

module.exports = {
  extractKeywords,
  loadStopwords,
  loadPhraseDictionary,
  paths: {
    STOPWORDS_PATH,
    PHRASE_DICT_PATH
  }
};
