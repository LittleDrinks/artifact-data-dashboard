/**
 * Cypher Query Validation Rules
 * Feature: 002-enhance-smart-qa / US4 - Cypher查询集成
 * Purpose: Whitelist functions and blacklist destructive keywords for read-only safety
 */

/**
 * Blacklisted Keywords (Destructive Operations)
 * These keywords are NEVER allowed in user-submitted Cypher queries
 */
const BLACKLIST_KEYWORDS = [
  // Data modification
  'CREATE',
  'DELETE',
  'REMOVE',
  'SET',
  'MERGE',
  'DETACH',
  
  // Schema operations
  'DROP',
  'ALTER',
  
  // Index/Constraint operations
  'INDEX',
  'CONSTRAINT',
  
  // Administration
  'LOAD CSV',
  'USING PERIODIC COMMIT',
  'CALL dbms',
  'CALL apoc',
  
  // Security-sensitive
  'REVOKE',
  'GRANT',
  'DENY'
];

/**
 * Whitelisted Functions (Safe Read Operations)
 * Only these Cypher functions are permitted
 */
const WHITELIST_FUNCTIONS = [
  // Aggregation functions
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'collect',
  'distinct',
  
  // String functions
  'substring',
  'toLower',
  'toUpper',
  'trim',
  'split',
  'replace',
  'toString',
  
  // List functions
  'size',
  'head',
  'tail',
  'last',
  'range',
  
  // Mathematical functions
  'abs',
  'ceil',
  'floor',
  'round',
  'sqrt',
  
  // Temporal functions
  'date',
  'datetime',
  'time',
  'duration',
  
  // Predicate functions
  'exists',
  'isEmpty',
  'all',
  'any',
  'none',
  'single',
  
  // Type functions
  'type',
  'labels',
  'properties',
  'keys',
  'nodes',
  'relationships',
  
  // Path functions
  'length',
  'shortestPath',
  
  // Text search functions
  'contains',
  'startsWith',
  'endsWith'
];

/**
 * Required Clauses for Valid Queries
 * All queries must start with one of these
 */
const REQUIRED_START_CLAUSES = [
  'MATCH',
  'OPTIONAL MATCH',
  'WITH',
  'UNWIND',
  'RETURN'
];

/**
 * Validation Configuration
 */
const VALIDATION_CONFIG = {
  // Maximum query length (characters)
  maxQueryLength: 5000,
  
  // Maximum execution time (seconds)
  maxExecutionTime: 5,
  
  // Maximum result rows
  maxResultRows: 1000,
  
  // Validation timeout (milliseconds)
  validationTimeout: 30,
  
  // Enable strict mode (reject any unknown patterns)
  strictMode: false,
  
  // Case sensitivity for keyword matching
  caseSensitive: false
};

/**
 * Known Safe Query Patterns (Regex)
 * Pre-approved query templates
 */
const SAFE_PATTERNS = [
  // Basic MATCH-RETURN
  /^MATCH\s+\([a-zA-Z_]\w*:[a-zA-Z_]\w*\)\s+RETURN/i,
  
  // MATCH with WHERE-RETURN
  /^MATCH\s+\([a-zA-Z_]\w*:[a-zA-Z_]\w*\)\s+WHERE\s+.+\s+RETURN/i,
  
  // Relationship patterns
  /^MATCH\s+\([a-zA-Z_]\w*\)-\[:[a-zA-Z_]\w*\]->\([a-zA-Z_]\w*\)\s+RETURN/i,
  
  // Count queries
  /^MATCH\s+\([a-zA-Z_]\w*:[a-zA-Z_]\w*\)\s+RETURN\s+count\(/i
];

/**
 * Validation Error Messages
 */
const ERROR_MESSAGES = {
  BLACKLISTED_KEYWORD: 'Query contains blacklisted keyword: {keyword}',
  UNAUTHORIZED_FUNCTION: 'Unauthorized function call: {function}',
  MISSING_START_CLAUSE: 'Query must start with one of: {clauses}',
  QUERY_TOO_LONG: 'Query exceeds maximum length of {max} characters',
  INVALID_SYNTAX: 'Invalid Cypher syntax detected',
  EXECUTION_TIMEOUT: 'Query execution exceeded {timeout} seconds',
  TOO_MANY_RESULTS: 'Query returned more than {max} rows',
  VALIDATION_ERROR: 'Query validation failed: {details}'
};

/**
 * Validate Cypher query for read-only safety
 * @param {string} query - Cypher query to validate
 * @returns {Object} Validation result { isValid: boolean, errors: string[] }
 */
function validateCypherQuery(query) {
  const errors = [];
  
  // Check query length
  if (query.length > VALIDATION_CONFIG.maxQueryLength) {
    errors.push(
      ERROR_MESSAGES.QUERY_TOO_LONG.replace(
        '{max}',
        VALIDATION_CONFIG.maxQueryLength
      )
    );
  }
  
  // Normalize query for checking
  const normalizedQuery = VALIDATION_CONFIG.caseSensitive 
    ? query 
    : query.toUpperCase();
  
  // Check for blacklisted keywords
  for (const keyword of BLACKLIST_KEYWORDS) {
    const checkKeyword = VALIDATION_CONFIG.caseSensitive 
      ? keyword 
      : keyword.toUpperCase();
    
    // Use word boundary regex to avoid false positives (e.g., "CREATED" vs "CREATE")
    const regex = new RegExp(`\\b${checkKeyword}\\b`);
    if (regex.test(normalizedQuery)) {
      errors.push(
        ERROR_MESSAGES.BLACKLISTED_KEYWORD.replace('{keyword}', keyword)
      );
    }
  }
  
  // Check for required start clause
  const hasValidStart = REQUIRED_START_CLAUSES.some(clause => {
    const checkClause = VALIDATION_CONFIG.caseSensitive 
      ? clause 
      : clause.toUpperCase();
    return normalizedQuery.trim().startsWith(checkClause);
  });
  
  if (!hasValidStart) {
    errors.push(
      ERROR_MESSAGES.MISSING_START_CLAUSE.replace(
        '{clauses}',
        REQUIRED_START_CLAUSES.join(', ')
      )
    );
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Check if a function is whitelisted
 * @param {string} functionName - Function name to check
 * @returns {boolean} True if whitelisted
 */
function isFunctionWhitelisted(functionName) {
  const normalized = functionName.toLowerCase();
  return WHITELIST_FUNCTIONS.some(fn => fn.toLowerCase() === normalized);
}

/**
 * Extract function calls from query
 * @param {string} query - Cypher query
 * @returns {Array<string>} List of function names used
 */
function extractFunctions(query) {
  const functionRegex = /\b([a-zA-Z_]\w*)\s*\(/g;
  const matches = [];
  let match;
  
  while ((match = functionRegex.exec(query)) !== null) {
    matches.push(match[1]);
  }
  
  return matches;
}

/**
 * Get recommended query patterns
 * @returns {Array<Object>} Example safe queries
 */
function getRecommendedPatterns() {
  return [
    {
      description: 'Find artifacts by category',
      query: 'MATCH (a:Artifact {category: "青铜器"}) RETURN a LIMIT 10'
    },
    {
      description: 'Count artifacts by era',
      query: 'MATCH (a:Artifact) RETURN a.era, count(a) AS count ORDER BY count DESC'
    },
    {
      description: 'Find artifact relationships',
      query: 'MATCH (a:Artifact)-[r]->(n) WHERE a.name CONTAINS "鼎" RETURN a, type(r), n LIMIT 20'
    },
    {
      description: 'Search with text filter',
      query: 'MATCH (a:Artifact) WHERE a.description CONTAINS "青铜" RETURN a.name, a.era LIMIT 10'
    }
  ];
}

module.exports = {
  BLACKLIST_KEYWORDS,
  WHITELIST_FUNCTIONS,
  REQUIRED_START_CLAUSES,
  VALIDATION_CONFIG,
  SAFE_PATTERNS,
  ERROR_MESSAGES,
  validateCypherQuery,
  isFunctionWhitelisted,
  extractFunctions,
  getRecommendedPatterns
};
