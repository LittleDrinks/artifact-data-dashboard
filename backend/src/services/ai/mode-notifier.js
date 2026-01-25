/**
 * Mode Notifier Service
 * Feature: US3 - 问答模式切换机制
 * Purpose: Notify clients about mode changes via WebSocket/SSE
 */

const { createLogger } = require('../../utils/logger');

const logger = createLogger('ModeNotifier');

class ModeNotifier {
  constructor() {
    this.clients = new Set(); // Store connected clients
    this.redisClient = null; // Will be injected for pub/sub if needed
  }

  /**
   * Initialize with dependencies
   * @param {Object} deps - Dependencies
   * @param {Object} deps.redisClient - Redis client for pub/sub
   */
  init(deps = {}) {
    this.redisClient = deps.redisClient;
  }

  /**
   * Add a client to receive notifications
   * @param {Object} client - Client object with send method
   */
  addClient(client) {
    this.clients.add(client);
  }

  /**
   * Remove a client
   * @param {Object} client - Client to remove
   */
  removeClient(client) {
    this.clients.delete(client);
  }

  /**
   * Notify all clients about mode change
   * @param {string} mode - New mode
   * @param {boolean} locked - Whether mode is locked
   * @param {string} source - Source of change
   */
  async notifyModeChange(mode, locked, source) {
    const notification = {
      type: 'mode_change',
      data: {
        mode,
        locked,
        source,
        timestamp: new Date().toISOString()
      }
    };

    // Notify all connected clients
    const message = JSON.stringify(notification);
    for (const client of this.clients) {
      try {
        if (client.send) {
          client.send(message);
        } else if (client.write) {
          client.write(`data: ${message}\n\n`);
        }
      } catch (error) {
        logger.error('[ModeNotifier] Failed to notify client:', error);
        this.clients.delete(client); // Remove broken client
      }
    }

    // Publish to Redis if available (for multi-instance deployments)
    if (this.redisClient) {
      try {
        await this.redisClient.publish('mode_changes', message);
      } catch (error) {
        logger.error('[ModeNotifier] Failed to publish to Redis:', error);
      }
    }

    logger.info(`[ModeNotifier] Notified ${this.clients.size} clients about mode change: ${mode}`);
  }

  /**
   * Subscribe to Redis pub/sub for multi-instance notifications
   */
  async subscribeToRedis() {
    if (!this.redisClient) return;

    try {
      const subscriber = this.redisClient.duplicate();
      await subscriber.subscribe('mode_changes');

      subscriber.on('message', (channel, message) => {
        if (channel === 'mode_changes') {
          // Re-broadcast to local clients
          const notification = JSON.parse(message);
          for (const client of this.clients) {
            try {
              if (client.send) {
                client.send(message);
              } else if (client.write) {
                client.write(`data: ${message}\n\n`);
              }
            } catch (error) {
              this.clients.delete(client);
            }
          }
        }
      });

      logger.info('[ModeNotifier] Subscribed to Redis mode changes');
    } catch (error) {
      logger.error('[ModeNotifier] Failed to subscribe to Redis:', error);
    }
  }

  /**
   * Get current client count
   * @returns {number} Number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }
}

module.exports = new ModeNotifier();