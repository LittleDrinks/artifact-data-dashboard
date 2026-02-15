import React from 'react';
import { Button, Space, Alert } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import ModeIndicator from '../../../components/Chat/ModeIndicator';

const ChatHeader = ({ 
  onModeChange, 
  onClearHistory, 
  disabled,
  mcpStatus
}) => {
  return (
    <Space>
      <ModeIndicator onModeChange={onModeChange} />
      <Button
        danger
        icon={<DeleteOutlined />}
        onClick={onClearHistory}
        disabled={disabled}
      >
        清空记录
      </Button>
    </Space>
  );
};

export const McpStatusAlert = ({ isEnabled }) => {
  if (isEnabled) return null;
  
  return (
    <Alert
      message="MCP工具已禁用"
      description="AI助手将无法通过MCP调用外部工具查询最新知识图谱数据，仅能依靠内置知识回答。"
      type="warning"
      showIcon
      style={{ margin: '8px 16px 0 16px' }}
      closable
    />
  );
};

export default ChatHeader;
