/**
 * Cypher Query Validator Service
 * Feature: 002-enhance-smart-qa / US4 - Cypher集成
 * Purpose: Validate Cypher queries for safety and correctness before execution
 */

const { createLogger } = require('../../utils/logger');
const logger = createLogger('CypherValidator');
const {
  validateCypherQuery,
  extractFunctions,
  isFunctionWhitelisted,
  VALIDATION_CONFIG,
  ERROR_MESSAGES
} = require('../../../config/cypher-rules');

/**
 * Validate a Cypher query for safety and syntax
 * @param {string} query - Cypher query string to validate
 * @param {Object} options - Validation options
 * @param {string} options.executor - Who is executing the query (for audit)
 * @param {string} options.permissionLevel - Permission level (user, auditor, admin)
 * @returns {Promise<Object>} Validation result { isValid: boolean, errors: string[], warnings: string[], metadata: Object }
 */
async function validateQuery(query, options = {}) {
  const {
    executor = 'system',
    permissionLevel = 'user'
  } = options;

  const startTime = Date.now();
  const result = {
    isValid: false,
    errors: [],
    warnings: [],
    metadata: {
      executor,
      permissionLevel,
      queryLength: query.length,
      validationTime: 0,
      functionCount: 0,
      authorizedFunctions: [],
      unauthorizedFunctions: []
    }
  };

  try {
    // Basic null/empty check
    if (!query || typeof query !== 'string') {
      result.errors.push('Query must be a non-empty string');
      return result;
    }

    // Trim whitespace
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      result.errors.push('Query cannot be empty');
      return result;
    }

    // Use cypher-rules validation
    const basicValidation = validateCypherQuery(trimmedQuery);
    if (!basicValidation.isValid) {
      result.errors.push(...basicValidation.errors);
    }

    // Extract and validate functions
    const functions = extractFunctions(trimmedQuery);
    result.metadata.functionCount = functions.length;

    for (const func of functions) {
      if (isFunctionWhitelisted(func)) {
        result.metadata.authorizedFunctions.push(func);
      } else {
        result.metadata.unauthorizedFunctions.push(func);
        result.errors.push(
          ERROR_MESSAGES.UNAUTHORIZED_FUNCTION.replace('{function}', func)
        );
      }
    }

    // Additional checks for specific permission levels
    if (permissionLevel === 'user') {
      // Users have stricter limits
      if (trimmedQuery.length > VALIDATION_CONFIG.maxQueryLength / 2) {
        result.warnings.push(
          `Query is long (${trimmedQuery.length} chars). Consider simplifying.`
        );
      }
    }

    // Check for potentially expensive patterns
    if (trimmedQuery.match(/MATCH\s+\(\s*\)\s*-\[.*\*.*\]->/i)) {
      result.warnings.push(
        'Query contains variable-length path patterns which may be slow'
      );
    }

    // Determine overall validity
    result.isValid = result.errors.length === 0;

    // Record validation time
    result.metadata.validationTime = Date.now() - startTime;

    logger.debug(
      `Query validation ${result.isValid ? 'passed' : 'failed'} ` +
      `(${result.metadata.validationTime}ms, ${result.errors.length} errors, ${result.warnings.length} warnings)`
    );

    return result;
  } catch (error) {
    logger.error('Validation error:', error);
    result.errors.push(
      ERROR_MESSAGES.VALIDATION_ERROR.replace('{details}', error.message)
    );
    result.metadata.validationTime = Date.now() - startTime;
    return result;
  }
}

/**
 * Validate multiple queries in batch
 * @param {Array<string>} queries - Array of Cypher queries
 * @param {Object} options - Validation options
 * @returns {Promise<Array<Object>>} Array of validation results
 */
async function validateBatch(queries, options = {}) {
  if (!Array.isArray(queries)) {
    throw new Error('Queries must be an array');
  }

  const results = [];
  for (const query of queries) {
    const result = await validateQuery(query, options);
    results.push(result);
  }

  return results;
}

/**
 * Quick validation check (returns boolean only)
 * @param {string} query - Cypher query
 * @returns {Promise<boolean>} True if valid
 */
async function isQuerySafe(query) {
  const result = await validateQuery(query);
  return result.isValid;
}

/**
 * Get validation statistics
 * @param {Object} validationResult - Result from validateQuery
 * @returns {Object} Statistics summary
 */
function getValidationStats(validationResult) {
  return {
    isValid: validationResult.isValid,
    errorCount: validationResult.errors.length,
    warningCount: validationResult.warnings.length,
    executionTime: validationResult.metadata.validationTime,
    functionCount: validationResult.metadata.functionCount,
    authorizedFunctionCount: validationResult.metadata.authorizedFunctions.length,
    unauthorizedFunctionCount: validationResult.metadata.unauthorizedFunctions.length
  };
}

/**
 * Sanitize query for logging (remove sensitive data)
 * @param {string} query - Cypher query
 * @returns {string} Sanitized query
 */
function sanitizeQueryForLog(query) {
  // Remove potential password or sensitive property values
  return query
    .replace(/password\s*:\s*['"][^'"]*['"]/gi, "password: '***'")
    .replace(/token\s*:\s*['"][^'"]*['"]/gi, "token: '***'")
    .replace(/secret\s*:\s*['"][^'"]*['"]/gi, "secret: '***'");
}

/**
 * Generate validation report
 * @param {Object} validationResult - Result from validateQuery
 * @returns {string} Human-readable validation report
 */
function generateValidationReport(validationResult) {
  const lines = [];
  
  lines.push('=== Cypher Query Validation Report ===');
  lines.push(`Status: ${validationResult.isValid ? 'VALID ✓' : 'INVALID ✗'}`);
  lines.push(`Validation Time: ${validationResult.metadata.validationTime}ms`);
  lines.push(`Query Length: ${validationResult.metadata.queryLength} characters`);
  lines.push('');

  if (validationResult.errors.length > 0) {
    lines.push('Errors:');
    validationResult.errors.forEach((error, i) => {
      lines.push(`  ${i + 1}. ${error}`);
    });
    lines.push('');
  }

  if (validationResult.warnings.length > 0) {
    lines.push('Warnings:');
    validationResult.warnings.forEach((warning, i) => {
      lines.push(`  ${i + 1}. ${warning}`);
    });
    lines.push('');
  }

  if (validationResult.metadata.functionCount > 0) {
    lines.push('Functions Used:');
    lines.push(`  Authorized: ${validationResult.metadata.authorizedFunctions.join(', ')}`);
    if (validationResult.metadata.unauthorizedFunctions.length > 0) {
      lines.push(`  Unauthorized: ${validationResult.metadata.unauthorizedFunctions.join(', ')}`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  validateQuery,
  validateBatch,
  isQuerySafe,
  getValidationStats,
  sanitizeQueryForLog,
  generateValidationReport
};
