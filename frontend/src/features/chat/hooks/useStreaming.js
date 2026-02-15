import { useCallback } from 'react';
import { ChatSession } from '../../../utils/chat-session';

const DEFAULT_MODE = process.env.REACT_APP_AI_MODE || 'tool_calling';

export const useStreaming = ({ 
  setMessages, 
  setConversationId, 
  setStreamingMessageId,
  setLoading,
  setError,
  abortControllerRef 
}) => {
  const sendQuestion = useCallback(async (question, currentConversationId, aiConfig, existingMessages) => {
    setLoading(true);

    const tempAssistantMessageId = `assistant_tmp_${Date.now()}`;
    let activeAssistantMessageId = tempAssistantMessageId;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setMessages(prev => {
      const next = [
        ...prev,
        {
          id: tempAssistantMessageId,
          role: 'assistant',
          content: '',
          pending: true,
          timestamp: new Date().toISOString(),
          source: 'mcp_model',
          mode: DEFAULT_MODE
        }
      ];
      ChatSession.saveMessages(next);
      return next;
    });
    setStreamingMessageId(tempAssistantMessageId);
    ChatSession.saveStreamingMessageId(tempAssistantMessageId);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/chat/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          question,
          conversationId: currentConversationId,
          mode: DEFAULT_MODE,
          config: aiConfig
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok || !response.body) {
        throw new Error('无法建立流式连接');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';
      let fullContent = '';
      let currentSource = 'mcp_model';
      let currentData = null;
      let receivedDone = false;

      const processEvent = (eventBlock) => {
        const lines = eventBlock.split('\n');
        lines.forEach(line => {
          if (line.startsWith('event:')) {
            currentEvent = line.replace('event:', '').trim();
          } else if (line.startsWith('data:')) {
            const dataStr = line.replace('data:', '').trim();
            if (dataStr === '[DONE]') {
              receivedDone = true;
              return;
            }
            try {
              const data = JSON.parse(dataStr);
              if (currentEvent === 'metadata') {
                if (data.conversationId) {
                  setConversationId(data.conversationId);
                }
                if (data.assistantMessageId && data.assistantMessageId !== activeAssistantMessageId) {
                  const nextId = String(data.assistantMessageId);
                  setMessages(prev => prev.map(msg =>
                    msg.id === activeAssistantMessageId
                      ? { ...msg, id: nextId }
                      : msg
                  ));
                  activeAssistantMessageId = nextId;
                  setStreamingMessageId(nextId);
                  ChatSession.saveStreamingMessageId(nextId);
                }
                if (data.source) currentSource = data.source;
                if (data.data) currentData = data.data;
                const nextMode = data.mode || DEFAULT_MODE;
                setMessages(prev => prev.map(msg =>
                  msg.id === activeAssistantMessageId
                    ? { ...msg, source: currentSource, data: currentData, mode: nextMode, pending: true }
                    : msg
                ));
              } else if (currentEvent === 'message') {
                if (data.content) {
                  fullContent += data.content;
                  setMessages(prev => prev.map(msg =>
                    msg.id === activeAssistantMessageId
                      ? { ...msg, content: fullContent, pending: true }
                      : msg
                  ));
                }
              } else if (currentEvent === 'tools') {
                setMessages(prev => prev.map(msg =>
                  msg.id === activeAssistantMessageId
                    ? { ...msg, toolsCalled: data.tools_called || [], mode: data.mode || msg.mode, toolsError: data.error, pending: true }
                    : msg
                ));
              } else if (currentEvent === 'error') {
                setMessages(prev => prev.map(msg =>
                  msg.id === activeAssistantMessageId
                    ? { ...msg, content: data.message || '生成回答时出错', isError: true, pending: false }
                    : msg
                ));
              }
            } catch (e) {
              console.error('解析流数据失败', e);
            }
          }
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let separatorIndex = buffer.indexOf('\n\n');
        while (separatorIndex !== -1) {
          const eventChunk = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          if (eventChunk.trim()) {
            processEvent(eventChunk.trim());
          }
          separatorIndex = buffer.indexOf('\n\n');
        }
      }

      if (buffer.trim()) {
        processEvent(buffer.trim());
      }

      if (receivedDone) {
        setMessages(prev => prev.map(msg =>
          msg.id === activeAssistantMessageId
            ? { ...msg, pending: false }
            : msg
        ));
        setStreamingMessageId(null);
        ChatSession.saveStreamingMessageId(null);
      }
      setError(null);
      return { success: true, conversationId: currentConversationId };
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('请求被中止');
        setMessages(prev => prev.map(msg =>
          msg.id === activeAssistantMessageId
            ? { ...msg, canceled: true, content: msg.content + '\n\n[回答已中止]', pending: true }
            : msg
        ));
        return { success: false, aborted: true };
      } else {
        console.error('发送问题失败:', err);
        setError('发送问题失败，请稍后重试');
        setMessages(prev => prev.map(msg =>
          msg.id === activeAssistantMessageId
            ? { ...msg, content: '抱歉，我暂时无法回答您的问题，请稍后再试。', isError: true, pending: false }
            : msg
        ));
        setStreamingMessageId(null);
        ChatSession.saveStreamingMessageId(null);
        return { success: false, error: err };
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [setMessages, setConversationId, setStreamingMessageId, setLoading, setError, abortControllerRef]);

  return { sendQuestion };
};

export default useStreaming;
