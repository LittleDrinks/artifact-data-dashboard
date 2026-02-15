import React from 'react';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';

const MessageItem = ({ 
  message, 
  isStreaming, 
  onOpenGraph 
}) => {
  const isUser = message.role === 'user';
  
  if (isUser) {
    return <UserMessage message={message} />;
  }
  
  return (
    <AssistantMessage 
      message={message} 
      isStreaming={isStreaming}
      onOpenGraph={onOpenGraph}
    />
  );
};

export default MessageItem;
