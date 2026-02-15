import React from 'react';
import { Empty, Spin } from 'antd';
import MessageItem from './MessageItem';

const MessageList = ({ 
  messages, 
  streamingMessageId,
  initialLoading,
  onOpenGraph 
}) => {
  if (initialLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin size="large" tip="加载对话历史中..." />
      </div>
    );
  }

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
        const isPending = message.role !== 'user' && message.pending === true && !message.isError;
        const isStreaming = message.role !== 'user' && (streamingMessageId === message.id || isPending) 
          && !message.isError;
        
        return (
          <MessageItem 
            key={message.id || index}
            message={message}
            isStreaming={isStreaming}
            onOpenGraph={onOpenGraph}
          />
        );
      })}
    </div>
  );
};

export default MessageList;
