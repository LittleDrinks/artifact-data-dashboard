/**
 * Chat Session Management Utility
 * Handles persistence of chat messages and input drafts using sessionStorage with TTL
 */

const STORAGE_KEYS = {
  MESSAGES: 'chat_messages',
  INPUT_DRAFT: 'chat_input_draft',
  STREAMING_MESSAGE_ID: 'chat_streaming_message_id',
  LAST_ACTIVE: 'chat_last_active'
};

const TTL_MINUTES = 30; // Session TTL: 30 minutes

class ChatSession {
  /**
   * Check if session is expired based on TTL
   * @returns {boolean} True if session is expired
   */
  static isExpired() {
    try {
      const lastActive = sessionStorage.getItem(STORAGE_KEYS.LAST_ACTIVE);
      if (!lastActive) return true;
      
      const lastActiveTime = new Date(lastActive).getTime();
      const now = new Date().getTime();
      const diffMinutes = (now - lastActiveTime) / (1000 * 60);
      
      return diffMinutes > TTL_MINUTES;
    } catch (error) {
      console.error('Failed to check session expiry:', error);
      return true;
    }
  }

  /**
   * Update last active timestamp
   */
  static updateLastActive() {
    try {
      sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVE, new Date().toISOString());
    } catch (error) {
      console.error('Failed to update last active:', error);
    }
  }

  /**
   * Load messages from sessionStorage
   * @returns {Array} Array of message objects
   */
  static loadMessages() {
    try {
      if (this.isExpired()) {
        this.clear();
        return [];
      }
      
      const stored = sessionStorage.getItem(STORAGE_KEYS.MESSAGES);
      this.updateLastActive();
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load chat messages:', error);
      return [];
    }
  }

  /**
   * Save messages to sessionStorage
   * @param {Array} messages - Array of message objects
   */
  static saveMessages(messages) {
    try {
      sessionStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
      this.updateLastActive();
    } catch (error) {
      console.error('Failed to save chat messages:', error);
    }
  }

  /**
   * Load input draft from sessionStorage
   * @returns {string|null} Input draft text or null
   */
  static loadInputDraft() {
    try {
      if (this.isExpired()) {
        this.clear();
        return null;
      }
      
      return sessionStorage.getItem(STORAGE_KEYS.INPUT_DRAFT);
    } catch (error) {
      console.error('Failed to load input draft:', error);
      return null;
    }
  }

  /**
   * Save input draft to sessionStorage
   * @param {string} draft - Input draft text
   */
  static saveInputDraft(draft) {
    try {
      sessionStorage.setItem(STORAGE_KEYS.INPUT_DRAFT, draft);
      this.updateLastActive();
    } catch (error) {
      console.error('Failed to save input draft:', error);
    }
  }

  /**
   * Clear input draft from sessionStorage
   */
  static clearDraft() {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.INPUT_DRAFT);
    } catch (error) {
      console.error('Failed to clear input draft:', error);
    }
  }

  /**
   * Load streaming message ID from sessionStorage
   * @returns {string|null} Streaming message ID or null
   */
  static loadStreamingMessageId() {
    try {
      if (this.isExpired()) {
        this.clear();
        return null;
      }
      
      return sessionStorage.getItem(STORAGE_KEYS.STREAMING_MESSAGE_ID);
    } catch (error) {
      console.error('Failed to load streaming message ID:', error);
      return null;
    }
  }

  /**
   * Save streaming message ID to sessionStorage
   * @param {string|null} messageId - Streaming message ID or null to clear
   */
  static saveStreamingMessageId(messageId) {
    try {
      if (messageId) {
        sessionStorage.setItem(STORAGE_KEYS.STREAMING_MESSAGE_ID, messageId);
        this.updateLastActive();
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.STREAMING_MESSAGE_ID);
      }
    } catch (error) {
      console.error('Failed to save streaming message ID:', error);
    }
  }

  /**
   * Clear all chat session data from sessionStorage
   */
  static clear() {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.MESSAGES);
      sessionStorage.removeItem(STORAGE_KEYS.INPUT_DRAFT);
      sessionStorage.removeItem(STORAGE_KEYS.STREAMING_MESSAGE_ID);
      sessionStorage.removeItem(STORAGE_KEYS.LAST_ACTIVE);
    } catch (error) {
      console.error('Failed to clear chat session:', error);
    }
  }
}

export { ChatSession };