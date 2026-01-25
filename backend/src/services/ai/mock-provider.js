const { getMockResponse } = require('../../../config/mode-config');

/**
 * Generate a synchronous mock response
 * @param {string} prompt - User question
 * @returns {Object} Mock response object with content, role, model, usage
 */
const generateMockResponse = (prompt) => {
  // Could implement logic to choose different responses based on prompt
  // For example, if prompt contains 'error', return cleanup error response
  if (prompt && prompt.toLowerCase().includes('error')) {
    return getMockResponse('error');
  }
  return getMockResponse('default');
};

/**
 * Generate a streamed mock response
 * Simulates typing effect by sending chunks with delay
 * @param {string} prompt - User question
 * @param {Function} onChunk - Callback function receiving string chunks
 * @returns {Promise<void>}
 */
const generateMockStreamResponse = async (prompt, onChunk) => {
  const response = generateMockResponse(prompt);
  const content = response.content;
  
  // Simulation parameters
  const chunkSize = 4; // chars per chunk
  const delay = 30; // ms between chunks

  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    onChunk(chunk);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
};

module.exports = {
  generateMockResponse,
  generateMockStreamResponse
};
