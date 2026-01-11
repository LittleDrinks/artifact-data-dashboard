/**
 * Chat Session Management Utility
 * Handles persistence of chat messages and input drafts using localStorage
 */

const STORAGE_KEYS = {
  MESSAGES: 'chat_messages',
  INPUT_DRAFT: 'chat_input_draft'
};

class ChatSession {
  /**
   * Load messages from localStorage
   * @returns {Array} Array of message objects
   */
  static loadMessages() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load chat messages:', error);
      return [];
    }
  }

  /**
   * Save messages to localStorage
   * @param {Array} messages - Array of message objects
   */
  static saveMessages(messages) {
    try {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    } catch (error) {
      console.error('Failed to save chat messages:', error);
    }
  }

  /**
   * Load input draft from localStorage
   * @returns {string|null} Input draft text or null
   */
  static loadInputDraft() {
    try {
      return localStorage.getItem(STORAGE_KEYS.INPUT_DRAFT);
    } catch (error) {
      console.error('Failed to load input draft:', error);
      return null;
    }
  }

  /**
   * Save input draft to localStorage
   * @param {string} draft - Input draft text
   */
  static saveInputDraft(draft) {
    try {
      localStorage.setItem(STORAGE_KEYS.INPUT_DRAFT, draft);
    } catch (error) {
      console.error('Failed to save input draft:', error);
    }
  }

  /**
   * Clear input draft from localStorage
   */
  static clearDraft() {
    try {
      localStorage.removeItem(STORAGE_KEYS.INPUT_DRAFT);
    } catch (error) {
      console.error('Failed to clear input draft:', error);
    }
  }

  /**
   * Clear all chat session data from localStorage
   */
  static clear() {
    try {
      localStorage.removeItem(STORAGE_KEYS.MESSAGES);
      localStorage.removeItem(STORAGE_KEYS.INPUT_DRAFT);
    } catch (error) {
      console.error('Failed to clear chat session:', error);
    }
  }
}

export { ChatSession };