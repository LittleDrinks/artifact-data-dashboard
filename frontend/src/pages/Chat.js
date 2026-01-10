import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, Card, Avatar, Spin, Divider, Empty, Alert } from 'antd';
import { UserOutlined, RobotOutlined, SendOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getChatHistory, clearChatHistory } from '../services/chat.service';

const { TextArea } = Input;
const DEFAULT_MODE = process.env.REACT_APP_AI_MODE || 'tool_calling';

const Chat = () => {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const chatMessagesRef = useRef(null);
  const navigate = useNavigate();
  
  // 加载聊天历史
  useEffect(() => {
    const fetchChatHistory = async () => {
      try {
        const response = await getChatHistory();
        
        if (response.data.messages && response.data.messages.length > 0) {
          setMessages(response.data.messages);
          setConversationId(response.data.conversationId);
        }
        
        setError(null);
      } catch (err) {
        console.error('获取聊天历史失败:', err);
        setError('获取聊天历史失败，请稍后重试');
      } finally {
        setInitialLoading(false);
      }
    };
    
    fetchChatHistory();
  }, []);
  
  // 自动滚动到最新消息
  useEffect(() => {
    const container = chatMessagesRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <= 60;
    if (isNearBottom) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);
  
  // 发送问题（流式）
  const handleSendQuestion = async () => {
    if (!inputValue.trim()) {
      return;
    }

    const question = inputValue;
    setInputValue('');

    // 添加用户消息
    setMessages(prev => ([
      ...prev,
      { role: 'user', content: question, timestamp: new Date().toISOString() }
    ]));

    setLoading(true);

    const assistantMessageId = `assistant_${Date.now()}`;
    setMessages(prev => ([
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        source: 'mcp_model',
        mode: DEFAULT_MODE
      }
    ]));
    setStreamingMessageId(assistantMessageId);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/chat/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ question, conversationId, mode: DEFAULT_MODE })
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

      const processEvent = (eventBlock) => {
        const lines = eventBlock.split('\n');
        lines.forEach(line => {
          if (line.startsWith('event:')) {
            currentEvent = line.replace('event:', '').trim();
          } else if (line.startsWith('data:')) {
            const dataStr = line.replace('data:', '').trim();
            if (dataStr === '[DONE]') {
              return;
            }
            try {
              const data = JSON.parse(dataStr);
              if (currentEvent === 'metadata') {
                if (data.conversationId) {
                  setConversationId(data.conversationId);
                }
                if (data.source) currentSource = data.source;
                if (data.data) currentData = data.data;
                const nextMode = data.mode || DEFAULT_MODE;
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, source: currentSource, data: currentData, mode: nextMode }
                    : msg
                ));
              } else if (currentEvent === 'message') {
                if (data.content) {
                  fullContent += data.content;
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: fullContent }
                      : msg
                  ));
                }
              } else if (currentEvent === 'tools') {
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, toolsCalled: data.tools_called || [], mode: data.mode || msg.mode, toolsError: data.error }
                    : msg
                ));
              } else if (currentEvent === 'error') {
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: data.message || '生成回答时出错', isError: true }
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
        let separatorIndex;
        while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
          const eventChunk = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          if (eventChunk.trim()) {
            processEvent(eventChunk.trim());
          }
        }
      }

      if (buffer.trim()) {
        processEvent(buffer.trim());
      }

      setError(null);
    } catch (err) {
      console.error('发送问题失败:', err);
      setError('发送问题失败，请稍后重试');
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? { ...msg, content: '抱歉，我暂时无法回答您的问题，请稍后再试。', isError: true }
          : msg
      ));
    } finally {
      setStreamingMessageId(null);
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      setLoading(true);
      await clearChatHistory();
      setMessages([]);
      setConversationId(null);
      setError(null);
    } catch (err) {
      console.error('清空聊天记录失败:', err);
      setError('清空聊天记录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
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

        // 将问答返回的“核心实体”以高亮节点集合传递给图谱页面
        // 默认策略：优先高亮 artifact 节点；若无 artifact，则高亮首个节点
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
      // ignore
    }
    navigate('/knowledge-graph?from=chat');
  };
  
  // 处理按键事件
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  };

  // 解析消息内容，分离思考过程（支持流式未闭合的思考段）
  const parseMessageContent = (content) => {
      if (!content) return { answer: '', isThinking: false };
    const start = content.indexOf('<think>');
    if (start === -1) {
        return { answer: content.trim(), isThinking: false };
    }
    const end = content.indexOf('</think>');
    if (end !== -1) {
        const before = content.slice(0, start);
        const after = content.slice(end + 8);
        return {
          answer: `${before}${after}`.trim(),
          isThinking: false
        };
    }
    return {
        answer: content.slice(0, start).trim(),
        isThinking: true
    };
  };
  
  // 聊天消息列表
  const renderMessages = () => {
    if (messages.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无对话记录，开始提问吧！"
        />
      );
    }
    
    return (
      <div className="message-list">
        {messages.map((message, index) => {
          const isUser = message.role === 'user';
          const { answer, isThinking } = parseMessageContent(message.content);
          const isStreaming = !isUser && streamingMessageId === message.id && !message.isError;
          
          return (
            <div key={message.id || index} className={`message-wrapper ${isUser ? 'message-wrapper-user' : 'message-wrapper-assistant'}`}>
              {!isUser && (
                <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#52c41a', marginRight: 8, flexShrink: 0 }} />
              )}
              
              <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
                <div className="message-header">
                  <span className="message-sender">{isUser ? '我' : '智能助手'}</span>
                  <span className="message-time">{new Date(message.timestamp).toLocaleTimeString()}</span>
                </div>
                
                <div className={`message-content ${message.isError ? 'message-error' : ''}`}>
                  {!isUser && isThinking && (
                    <div className="think-spinner">
                      <Spin size="small" />
                    </div>
                  )}
                  {answer && (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{answer}</div>
                  )}
                  {isStreaming && (
                    <div className="typing-indicator">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  )}
                </div>
                
                {!isUser && message.source && (
                  <div className="message-footer">
                    <span className="message-source">
                      {message.source === 'knowledge_graph' && '来源: 知识图谱'}
                      {message.source === 'mcp_model' && '来源: 大模型'}
                      {message.source === 'simulation' && '来源: 本地知识库'}
                      {message.source === 'tool_calling' && '来源: 工具调用'}
                    </span>
                    {message.data && message.data.nodes && (
                      <a className="message-link" onClick={() => openGraphFromMessage(message)}>
                        查看图谱 ({message.data.nodes.length}节点)
                      </a>
                    )}
                    {message.toolsCalled && message.toolsCalled.length > 0 && (
                      <div className="message-tools">
                        <div style={{ fontWeight: 500 }}>工具调用结果（模式: {message.mode || DEFAULT_MODE}）</div>
                        <ul style={{ paddingLeft: 16, margin: '4px 0 0' }}>
                          {message.toolsCalled.map((tool) => (
                            <li key={tool.name}>
                              {tool.name} - {tool.status === 'success' ? '成功' : '失败'}
                              {tool.status === 'error' && tool.error ? ` (${tool.error})` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {message.toolsError && (
                      <div className="message-tools" style={{ color: '#d4380d' }}>
                        {message.toolsError}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {isUser && (
                <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff', marginLeft: 8, flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className="chat-page">
    <Card
      title="智能问答"
      style={{ height: '100%' }}
      extra={
        <Button
          danger
          icon={<DeleteOutlined />}
          onClick={handleClearHistory}
          disabled={loading || initialLoading}
        >
          清空记录
        </Button>
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
        <div className="chat-messages" ref={chatMessagesRef}>
          {initialLoading ? (
            <div style={{ textAlign: 'center', padding: '50px 0' }}>
              <Spin size="large" tip="加载对话历史中..." />
            </div>
          ) : (
            renderMessages()
          )}
        </div>
        
        <Divider style={{ margin: '0' }} />
        
        <div className="chat-input">
          <TextArea
            placeholder="请输入您的问题，例如：西周时期有哪些著名的青铜器？"
            autoSize={{ minRows: 1, maxRows: 4 }}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            className="chat-input-field"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendQuestion}
            loading={loading}
            style={{ marginLeft: 8 }}
          >
            发送
          </Button>
        </div>
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
