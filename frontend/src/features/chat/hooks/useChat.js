import { useState, useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';
import { toast } from 'react-toastify';
import { getChatHistory, clearChatHistory } from '../../../services/chat.service';
import mcpService from '../../../services/mcpService';
import { ChatSession } from '../../../utils/chat-session';

const DEFAULT_AI_CONFIG = {
  model: 'LOCAL',
  enabledTools: ['query_graph', 'search_artifacts']
};

const findPendingAssistantMessage = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  return [...messages].reverse().find(m => m?.role !== 'user' && m?.pending === true && !m?.isError) || null;
};

export const useChat = () => {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mcpStatus, setMcpStatus] = useState({ isEnabled: true });
  const [currentMode, setCurrentMode] = useState(null);
  const [messages, setMessages] = useState(() => ChatSession.loadMessages());
  const [inputValue, setInputValue] = useState(() => ChatSession.loadInputDraft() || '');
  const [conversationId, setConversationId] = useState(null);
  const [streamingMessageId, setStreamingMessageId] = useState(() => ChatSession.loadStreamingMessageId());
  const [aiConfig, setAiConfig] = useState(DEFAULT_AI_CONFIG);
  const [sessionId] = useState(() => ChatSession.getSessionId());
  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (messages.length > 0) {
      ChatSession.saveMessages(messages);
    }
  }, [messages]);

  useEffect(() => {
    if (inputValue) {
      ChatSession.saveInputDraft(inputValue);
    } else {
      ChatSession.clearDraft();
    }
  }, [inputValue]);

  useEffect(() => {
    if (streamingMessageId !== null) {
      ChatSession.saveStreamingMessageId(streamingMessageId);
    }
  }, [streamingMessageId]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    const loadMcpStatus = async () => {
      try {
        const status = await mcpService.getStatus();
        setMcpStatus(status);
      } catch (e) {
        console.error('Failed to load MCP status:', e);
      }
    };
    loadMcpStatus();
  }, []);

  const handleConfigChange = useCallback((newConfig) => {
    setAiConfig(newConfig);
    message.success('配置已保存');
  }, []);

  const handleModeChange = useCallback((modeData) => {
    const previousMode = currentMode?.mode;
    setCurrentMode(modeData);

    if (previousMode && previousMode !== modeData.mode) {
      const modeLabels = {
        'ONLINE': '在线模式',
        'LOCAL': '本地模式',
        'MOCK': '模拟模式'
      };

      toast.info(`AI模式已切换到${modeLabels[modeData.mode] || modeData.mode}`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }
  }, [currentMode]);

  const loadChatHistory = useCallback(async () => {
    try {
      const savedMessages = ChatSession.loadMessages();
      if (savedMessages.length > 0) {
        setMessages(savedMessages);
        const pendingMsg = findPendingAssistantMessage(savedMessages);
        if (pendingMsg?.id) setStreamingMessageId(pendingMsg.id);
      }

      const response = await getChatHistory();
      
      if (response.data.messages && response.data.messages.length > 0) {
        const serverMessages = response.data.messages;
        const serverConversationId = response.data.conversationId;
        setMessages(serverMessages);
        ChatSession.saveMessages(serverMessages);
        setConversationId(serverConversationId);

        const pendingMsg = findPendingAssistantMessage(serverMessages);
        if (pendingMsg?.id) setStreamingMessageId(pendingMsg.id);
      }
      
      setError(null);
    } catch (err) {
      console.error('获取聊天历史失败:', err);
      setError('获取聊天历史失败，请稍后重试');
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const handleClearHistory = useCallback(async () => {
    try {
      setLoading(true);
      await clearChatHistory();
      setMessages([]);
      setConversationId(null);
      ChatSession.clear();
      setError(null);
    } catch (err) {
      console.error('清空聊天记录失败:', err);
      setError('清空聊天记录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    setLoading,
    initialLoading,
    setInitialLoading,
    error,
    setError,
    mcpStatus,
    currentMode,
    messages,
    setMessages,
    inputValue,
    setInputValue,
    conversationId,
    setConversationId,
    streamingMessageId,
    setStreamingMessageId,
    aiConfig,
    sessionId,
    abortControllerRef,
    handleConfigChange,
    handleModeChange,
    loadChatHistory,
    handleClearHistory,
  };
};

export default useChat;
