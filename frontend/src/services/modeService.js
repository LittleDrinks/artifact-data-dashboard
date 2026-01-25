import axios from 'axios';

const API_URL = '/api/mode/';

/**
 * Get current AI mode
 * @returns {Promise<{mode: string, locked: boolean, provider: string, timeout: number}>}
 */
const getCurrentMode = async () => {
    const response = await axios.get(API_URL + 'current');
    return response.data;
};

/**
 * Lock current mode
 * @returns {Promise<{message: string}>}
 */
const lockMode = async () => {
    const response = await axios.post(API_URL + 'lock');
    return response.data;
};

/**
 * Unlock mode
 * @returns {Promise<{message: string}>}
 */
const unlockMode = async () => {
    const response = await axios.post(API_URL + 'unlock');
    return response.data;
};

/**
 * Get mode switch history
 * @param {number} limit - Number of records to return
 * @returns {Promise<Array>} History records
 */
const getModeHistory = async (limit = 50) => {
    const response = await axios.get(API_URL + 'history', { params: { limit } });
    return response.data;
};

/**
 * Get health status for all modes
 * @returns {Promise<Object>} Health status
 */
const getHealthStatus = async () => {
    const response = await axios.get(API_URL + 'health');
    return response.data;
};

const modeService = {
    getCurrentMode,
    lockMode,
    unlockMode,
    getModeHistory,
    getHealthStatus
};

export default modeService;