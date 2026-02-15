/**
 * Cypher Query Rules
 * Security validation rules for Cypher queries
 */

const VALIDATION_CONFIG = {
  maxQueryLength: 10000,
  maxResults: 1000,
  defaultTimeout: 5000,
  forbiddenKeywords: [
    'DELETE',
    'DROP',
    'CREATE',
    'SET',
    'REMOVE',
    'MERGE'
  ],
  allowedFunctions: [
    'count',
    'id',
    'labels',
    'type',
    'properties',
    'length',
    'size',
    'collect',
    'distinct'
  ]
};

const ERROR_MESSAGES = {
  QUERY_TOO_LONG: '查询语句过长',
  FORBIDDEN_KEYWORD: '包含禁止的关键字',
  INVALID_SYNTAX: '无效的查询语法',
  TIMEOUT: '查询执行超时',
  UNAUTHORIZED: '未授权的操作'
};

function validateCypherQuery(query) {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: '查询不能为空' };
  }
  
  if (query.length > VALIDATION_CONFIG.maxQueryLength) {
    return { valid: false, error: ERROR_MESSAGES.QUERY_TOO_LONG };
  }
  
  const upperQuery = query.toUpperCase();
  for (const keyword of VALIDATION_CONFIG.forbiddenKeywords) {
    if (upperQuery.includes(keyword)) {
      return { valid: false, error: `${ERROR_MESSAGES.FORBIDDEN_KEYWORD}: ${keyword}` };
    }
  }
  
  return { valid: true };
}

function extractFunctions(query) {
  const functionRegex = /(\w+)\s*\(/g;
  const functions = [];
  let match;
  while ((match = functionRegex.exec(query)) !== null) {
    functions.push(match[1].toLowerCase());
  }
  return functions;
}

function isFunctionWhitelisted(funcName) {
  return VALIDATION_CONFIG.allowedFunctions.includes(funcName.toLowerCase());
}

module.exports = {
  VALIDATION_CONFIG,
  ERROR_MESSAGES,
  validateCypherQuery,
  extractFunctions,
  isFunctionWhitelisted
};
