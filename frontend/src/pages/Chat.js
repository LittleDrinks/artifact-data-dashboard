import React, { useEffect, useRef } from 'react';
import { Card, Alert, Divider } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ChatSession } from '../utils/chat-session';
import { useChat } from '../features/chat';
import { useStreaming } from '../features/chat';
import { MessageList, MessageInput, ChatHeader, McpStatusAlert } from '../features/chat';

const Chat = () => {
  const navigate = useNavigate();
  const chatMessagesRef = useRef(null);
  
  const {
    loading,
    setLoading,
    initialLoading,
    error,
    setError,
    mcpStatus,
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
  } = useChat();

  const { sendQuestion } = useStreaming({
    setMessages,
    setConversationId,
    setStreamingMessageId,
    setLoading,
    setError,
    abortControllerRef
  });

  useEffect(() => {
    loadChatHistory();
  }, [loadChatHistory]);

  useEffect(() => {
    if (!streamingMessageId || !conversationId || loading) return;

    let stopped = false;
    const interval = setInterval(async () => {
      if (stopped) return;
      try {
        const { getChatHistory } = await import('../services/chat.service');
        const res = await getChatHistory(conversationId);
        const nextMessages = res.data.messages || [];
        if (nextMessages.length > 0) {
          setMessages(nextMessages);
          ChatSession.saveMessages(nextMessages);

          const pendingMsg = nextMessages
            .slice()
            .reverse()
            .find(m => m?.role !== 'user' && m?.pending === true && !m?.isError);
            
          if (!pendingMsg) {
            setStreamingMessageId(null);
            ChatSession.saveStreamingMessageId(null);
          }
        }
      } catch (err) {
        void err;
      }
    }, 1000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [streamingMessageId, conversationId, loading, setMessages, setStreamingMessageId]);

  useEffect(() => {
    const container = chatMessagesRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <= 60;
    if (isNearBottom) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendQuestion = async () => {
    if (!inputValue.trim()) return;

    const question = inputValue;
    setInputValue('');

    setMessages(prev => {
      const next = [
        ...prev,
        { role: 'user', content: question, timestamp: new Date().toISOString() }
      ];
      ChatSession.saveMessages(next);
      return next;
    });

    await sendQuestion(question, conversationId, aiConfig, messages);
  };

  const openGraphFromMessage = (message) => {
    try {
      if (message?.data) {
        sessionStorage.setItem('chatGraphData', JSON.stringify(message.data));

        const focusId =
          message.data.nodes?.find(n => n.type === 'artifact')?.id ||
          message.data.nodes?.[0]?.id ||
          null;
        if (focusId) {
          sessionStorage.setItem('chatGraphFocusNodeId', String(focusId));
        }

        const MAX_HIGHLIGHTS = 20;
        const artifactIds = (message.data.nodes || [])
          .filter(n => n && n.type === 'artifact' && n.id != null)
          .map(n => String(n.id));
        const highlightIds = (artifactIds.length > 0 ? artifactIds : (focusId ? [String(focusId)] : []))
          .filter(Boolean)
          .slice(0, MAX_HIGHLIGHTS);
        if (highlightIds.length > 0) {
          sessionStorage.setItem('chatGraphHighlightNodeIds', JSON.stringify(highlightIds));
        } else {
          sessionStorage.removeItem('chatGraphHighlightNodeIds');
        }
      }
    } catch (e) {
      void e;
    }
    navigate('/knowledge-graph?from=chat');
  };

  return (
    <div className="chat-page">
      <Card
        title="智能问答"
        style={{ height: '100%' }}
        extra={
          <ChatHeader
            onModeChange={handleModeChange}
            onClearHistory={handleClearHistory}
            disabled={loading || initialLoading}
          />
        }
      >
        {error && (
          <Alert
            message="错误"
            description={error}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            closable
          />
        )}

        <div className="chat-container">
          <McpStatusAlert isEnabled={mcpStatus.isEnabled} />
          
          <div className="chat-messages" ref={chatMessagesRef}>
            <MessageList
              messages={messages}
              streamingMessageId={streamingMessageId}
              initialLoading={initialLoading}
              onOpenGraph={openGraphFromMessage}
            />
          </div>
          
          <Divider style={{ margin: '0' }} />
          
          <MessageInput
            inputValue={inputValue}
            setInputValue={setInputValue}
            onSend={handleSendQuestion}
            loading={loading}
            streamingMessageId={streamingMessageId}
            aiConfig={aiConfig}
            onConfigChange={handleConfigChange}
            sessionId={sessionId}
          />
        </div>
        
        <div style={{ marginTop: 16 }}>
          <h4>您可以尝试以下示例问题：</h4>
          <ul>
            <li>四羊方尊是什么年代的文物？</li>
            <li>唐朝有哪些著名的文物？</li>
            <li>西周青铜器的特点是什么？</li>
            <li>汉白玉制作的文物有哪些特点？</li>
            <li>文物保护有哪些重要原则？</li>
            <li>清明上河图的作者是谁？</li>
            <li>敦煌莫高窟有哪些珍贵壁画？</li>
            <li>文物与图谱之间有什么关系？</li>
          </ul>
          <div style={{ color: '#888', fontSize: 12 }}>
            注：本系统结合Neo4j知识图谱和MCP大模型人工智能实现，可回答与文物相关的知识问题。
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Chat;
