/**
 * ChatSession Utility Tests
 * 验证 ChatSession 的持久化、TTL 和恢复逻辑
 */

import { ChatSession } from '../../utils/chat-session';

describe('ChatSession Utility', () => {
  beforeEach(() => {
    // 清空 localStorage
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('loadMessages', () => {
    test('should return empty array when no messages stored', () => {
      const messages = ChatSession.loadMessages();
      expect(messages).toEqual([]);
    });

    test('should load stored messages from localStorage', () => {
      const testMessages = [
        { role: 'user', content: '测试消息1', timestamp: '2026-01-11T10:00:00Z' },
        { role: 'assistant', content: '回答1', timestamp: '2026-01-11T10:00:01Z' }
      ];
      localStorage.setItem('chat_messages', JSON.stringify(testMessages));

      const messages = ChatSession.loadMessages();
      expect(messages).toEqual(testMessages);
    });

    test('should return empty array on JSON parse error', () => {
      localStorage.setItem('chat_messages', 'invalid json');
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const messages = ChatSession.loadMessages();
      
      expect(messages).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load chat messages:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('saveMessages', () => {
    test('should save messages to localStorage', () => {
      const testMessages = [
        { role: 'user', content: '新消息', timestamp: '2026-01-11T11:00:00Z' }
      ];

      ChatSession.saveMessages(testMessages);

      const stored = localStorage.getItem('chat_messages');
      expect(JSON.parse(stored)).toEqual(testMessages);
    });

    test('should handle save errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // 模拟 localStorage 错误
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      ChatSession.saveMessages([{ role: 'user', content: 'test' }]);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save chat messages:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('loadInputDraft', () => {
    test('should return null when no draft stored', () => {
      const draft = ChatSession.loadInputDraft();
      expect(draft).toBeNull();
    });

    test('should load stored draft from localStorage', () => {
      localStorage.setItem('chat_input_draft', '未发送的问题');

      const draft = ChatSession.loadInputDraft();
      expect(draft).toBe('未发送的问题');
    });

    test('should handle load errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      const draft = ChatSession.loadInputDraft();
      expect(draft).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load input draft:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('saveInputDraft', () => {
    test('should save draft to localStorage', () => {
      ChatSession.saveInputDraft('草稿内容');

      const stored = localStorage.getItem('chat_input_draft');
      expect(stored).toBe('草稿内容');
    });

    test('should handle save errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      ChatSession.saveInputDraft('test draft');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save input draft:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('clearDraft', () => {
    test('should remove draft from localStorage', () => {
      localStorage.setItem('chat_input_draft', '要清除的草稿');
      
      ChatSession.clearDraft();

      const stored = localStorage.getItem('chat_input_draft');
      expect(stored).toBeNull();
    });

    test('should handle removal errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      ChatSession.clearDraft();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to clear input draft:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('clear', () => {
    test('should clear all session data', () => {
      localStorage.setItem('chat_messages', '[]');
      localStorage.setItem('chat_input_draft', 'draft');

      ChatSession.clear();

      expect(localStorage.getItem('chat_messages')).toBeNull();
      expect(localStorage.getItem('chat_input_draft')).toBeNull();
    });

    test('should handle clear errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      ChatSession.clear();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to clear chat session:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('persistence across operations', () => {
    test('should maintain messages after save and load cycle', () => {
      const original = [
        { role: 'user', content: '问题1', timestamp: '2026-01-11T10:00:00Z' },
        { role: 'assistant', content: '回答1', timestamp: '2026-01-11T10:00:01Z' },
        { role: 'user', content: '问题2', timestamp: '2026-01-11T10:00:02Z' }
      ];

      ChatSession.saveMessages(original);
      const loaded = ChatSession.loadMessages();

      expect(loaded).toEqual(original);
      expect(loaded.length).toBe(3);
    });

    test('should maintain draft after save and load cycle', () => {
      const draftText = '这是一个包含特殊字符的草稿：\n\t"测试"';

      ChatSession.saveInputDraft(draftText);
      const loaded = ChatSession.loadInputDraft();

      expect(loaded).toBe(draftText);
    });

    test('should allow independent message and draft operations', () => {
      const messages = [{ role: 'user', content: '消息', timestamp: '2026-01-11T10:00:00Z' }];
      const draft = '草稿文本';

      ChatSession.saveMessages(messages);
      ChatSession.saveInputDraft(draft);

      expect(ChatSession.loadMessages()).toEqual(messages);
      expect(ChatSession.loadInputDraft()).toBe(draft);

      ChatSession.clearDraft();

      expect(ChatSession.loadMessages()).toEqual(messages);
      expect(ChatSession.loadInputDraft()).toBeNull();
    });
  });
});
