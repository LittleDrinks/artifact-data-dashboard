import axios from 'axios';

const API_URL = '/api/mcp/';

/**
 * Get MCP current status
 * @returns {Promise<{isEnabled: boolean}>}
 */
const getStatus = async () => {
    const response = await axios.get(API_URL + 'status');
    return response.data;
};

/**
 * Toggle MCP status
 * @param {boolean} isEnabled 
 * @returns {Promise<{isEnabled: boolean}>}
 */
const toggleStatus = async (isEnabled) => {
    const response = await axios.post(API_URL + 'toggle', { isEnabled });
    return response.data;
};

const mcpService = {
    getStatus,
    toggleStatus
};

export default mcpService;
