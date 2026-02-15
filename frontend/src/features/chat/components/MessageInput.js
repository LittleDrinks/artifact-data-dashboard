import React, { useState } from 'react';
import { Input, Button, Popover, Alert, Space } from 'antd';
import { SendOutlined, SettingOutlined } from '@ant-design/icons';
import AIConfigPanel from '../../../components/Chat/AIConfigPanel';

const { TextArea } = Input;

const MessageInput = ({ 
  inputValue,
  setInputValue,
  onSend,
  loading,
  streamingMessageId,
  aiConfig,
  onConfigChange,
  sessionId
}) => {
  const [configPopoverVisible, setConfigPopoverVisible] = useState(false);
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };
  
  return (
    <div className="chat-input">
      {streamingMessageId && (
        <Alert
          message="正在生成回答中，请稍候..."
          type="info"
          showIcon
          style={{ margin: '8px 16px' }}
        />
      )}
      
      <div style={{ display: 'flex', padding: '8px 16px' }}>
        <Popover
          content={
            <AIConfigPanel
              onConfigChange={onConfigChange}
              sessionId={sessionId}
              onClose={() => setConfigPopoverVisible(false)}
            />
          }
          title={<Space><SettingOutlined /> AI 配置</Space>}
          trigger="click"
          open={configPopoverVisible}
          onOpenChange={setConfigPopoverVisible}
          placement="topLeft"
          arrow={false}
        >
          <Button
            icon={<SettingOutlined />}
            style={{ marginRight: 8 }}
            title="AI 配置"
          />
        </Popover>
        
        <TextArea
          placeholder="请输入您的问题，例如：西周时期有哪些著名的青铜器？"
          autoSize={{ minRows: 1, maxRows: 4 }}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || !!streamingMessageId}
          className="chat-input-field"
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={onSend}
          loading={loading}
          disabled={!!streamingMessageId}
          style={{ marginLeft: 8 }}
        >
          发送
        </Button>
      </div>
    </div>
  );
};

export default MessageInput;
