import React from 'react';
import { Avatar, Divider } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import MessageRenderer from '../../../../components/Chat/MessageRenderer';

const DEFAULT_MODE = process.env.REACT_APP_AI_MODE || 'tool_calling';

const AssistantMessage = ({ 
  message, 
  isStreaming, 
  onOpenGraph 
}) => {
  const answer = message.content ? String(message.content) : '';
  
  const handleOpenGraph = () => {
    if (message?.data) {
      onOpenGraph(message);
    }
  };
  
  return (
    <div className="message-wrapper message-wrapper-assistant">
      <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#52c41a', marginRight: 8, flexShrink: 0 }} />
      
      <div className={`message-bubble assistant-bubble ${message.isError ? 'message-error' : ''}`}>
        <div className="message-header">
          <span className="message-sender">智能助手</span>
          <span className="message-time">{new Date(message.timestamp).toLocaleTimeString()}</span>
        </div>
        
        <div className="message-content">
          {answer && (
            <MessageRenderer
              content={answer}
              className="assistant-message-content"
              onError={(error) => console.error('Markdown render error:', error)}
            />
          )}
          {message.canceled && (
            <div className="message-canceled">
              <Divider plain style={{ margin: '8px 0', borderColor: '#d9d9d9', borderStyle: 'dashed' }}>
                <span style={{ fontSize: '12px', color: '#8c8c8c' }}>回答已中止</span>
              </Divider>
            </div>
          )}
          {isStreaming && (
            <div className="typing-indicator">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          )}
        </div>
        
        {message.source && (
          <div className="message-footer">
            <span className="message-source">
              {message.source === 'knowledge_graph' && '来源: 知识图谱'}
              {message.source === 'mcp_model' && '来源: 大模型'}
              {message.source === 'simulation' && '来源: 本地知识库'}
              {message.source === 'tool_calling' && '来源: 工具调用'}
            </span>
            {message.data && message.data.nodes && (
              <button 
                type="button"
                className="message-link" 
                onClick={handleOpenGraph}
                style={{ background: 'none', border: 'none', color: '#1890ff', cursor: 'pointer', padding: 0 }}
              >
                查看图谱 ({message.data.nodes.length}节点)
              </button>
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
    </div>
  );
};

export default AssistantMessage;
