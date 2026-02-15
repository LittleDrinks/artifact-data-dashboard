import React from 'react';
import { Avatar } from 'antd';
import { UserOutlined } from '@ant-design/icons';

const UserMessage = ({ message }) => {
  const answer = message.content ? String(message.content) : '';
  
  return (
    <div className="message-wrapper message-wrapper-user">
      <div className="message-bubble user-bubble">
        <div className="message-header">
          <span className="message-sender">我</span>
          <span className="message-time">{new Date(message.timestamp).toLocaleTimeString()}</span>
        </div>
        
        <div className="message-content">
          <div style={{ whiteSpace: 'pre-wrap' }}>{answer}</div>
        </div>
      </div>
      
      <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff', marginLeft: 8, flexShrink: 0 }} />
    </div>
  );
};

export default UserMessage;
