/**
 * MCP Controller Service
 * Feature: US2 - MCP enable/disable management
 */
const redisStateService = require('../utils/redis-state.service');
const auditService = require('../utils/audit.service');

class MCPController {
    /**
     * Get current MCP enable status
     * @returns {Promise<{isEnabled: boolean}>}
     */
    async getStatus() {
        const isEnabled = await redisStateService.getMCPStatus();
        return { isEnabled };
    }

    /**
     * Toggle MCP status
     * @param {boolean} isEnabled - Target status
     * @param {string} user - User performing the action
     * @returns {Promise<{isEnabled: boolean, updatedBy: string, message?: string}>}
     */
    async setStatus(isEnabled, user = 'system') {
        const currentStatus = await redisStateService.getMCPStatus();
        
        if (currentStatus === isEnabled) {
            return { isEnabled, updatedBy: user, message: 'Status unchanged' };
        }

        // 1. Update Redis (and Trigger Audit Log via common service methods if they did it)
        // Wait, redisStateService.setMCPStatus updates Redis
        // And auditService.logMCPStatusChange updates MySQL logs AND mcp_settings table
        
        await redisStateService.setMCPStatus(isEnabled, user);
        
        await auditService.logMCPStatusChange({ 
            enabled: isEnabled, 
            updatedBy: user,
            reason: 'User manual toggle' 
        });
        
        return { isEnabled, updatedBy: user };
    }
}

module.exports = new MCPController();
