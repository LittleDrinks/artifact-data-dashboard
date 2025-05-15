import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, Card, List, Avatar, Spin, Divider, Empty, Alert } from 'antd';
import { UserOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import { askQuestion, getChatHistory } from '../services/chat.service';

const { TextArea } = Input;

const Chat = () => {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);
  
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // 发送问题
  const handleSendQuestion = async () => {
    if (!inputValue.trim()) {
      return;
    }
    
    const question = inputValue;
    setInputValue('');
    
    // 添加用户消息到列表
    setMessages(prev => [
      ...prev,
      { role: 'user', content: question, timestamp: new Date().toISOString() }
    ]);
    
    setLoading(true);
    
    try {
      const response = await askQuestion(question, conversationId);
        // 添加系统回复到列表
      setMessages(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: response.data.answer, 
          timestamp: new Date().toISOString(),
          source: response.data.source,
          intent: response.data.intent,
          // 如果有知识图谱数据，添加到消息中
          data: response.data.data || null
        }
      ]);
      
      // 保存会话ID
      if (response.data.conversationId) {
        setConversationId(response.data.conversationId);
      }
      
      setError(null);
    } catch (err) {
      console.error('发送问题失败:', err);
      setError('发送问题失败，请稍后重试');
      
      // 添加错误消息
      setMessages(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: '抱歉，我暂时无法回答您的问题，请稍后再试。', 
          timestamp: new Date().toISOString(),
          isError: true
        }
      ]);
    } finally {
      setLoading(false);
    }
  };
  
  // 处理按键事件
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
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
      <List
        itemLayout="horizontal"
        dataSource={messages}
        renderItem={(message, index) => (
          <List.Item key={index} className={message.role === 'user' ? 'user-message' : 'assistant-message'}>
            <List.Item.Meta
              avatar={
                message.role === 'user' ? (
                  <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
                ) : (
                  <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#52c41a' }} />
                )
              }
              title={message.role === 'user' ? '我' : '智能助手'}              description={
                <div>
                  <div 
                    className={`message-content ${message.isError ? 'message-error' : ''}`}
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {message.content}
                  </div>
                  {message.source && (
                    <div className="message-source" style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                      {message.source === 'knowledge_graph' && '来源: 知识图谱'}
                      {message.source === 'mcp_model' && '来源: 大模型'}
                      {message.source === 'simulation' && '来源: 本地知识库'}
                    </div>
                  )}
                  {message.data && message.data.nodes && (
                    <div className="message-graph-data" style={{ fontSize: '12px', color: '#1890ff', marginTop: '4px', cursor: 'pointer' }}>
                      <a onClick={() => window.location.href = '/knowledge-graph'}>
                        查看相关知识图谱 ({message.data.nodes.length}个实体, {message.data.edges.length}个关系)
                      </a>
                    </div>
                  )}
                </div>
              }
            />
            <div className="message-time">
              {new Date(message.timestamp).toLocaleString()}
            </div>
          </List.Item>
        )}
      />
    );
  };
  
  return (
    <Card title="智能问答" style={{ height: '100%' }}>
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
        <div className="chat-messages">
          {initialLoading ? (
            <div style={{ textAlign: 'center', padding: '50px 0' }}>
              <Spin size="large" tip="加载对话历史中..." />
            </div>
          ) : (
            renderMessages()
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <Divider style={{ margin: '0' }} />
        
        <div className="chat-input">
          <TextArea
            placeholder="请输入您的问题，例如：西周时期有哪些著名的青铜器？"
            autoSize={{ minRows: 1, maxRows: 4 }}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
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
  );
};

export default Chat;
