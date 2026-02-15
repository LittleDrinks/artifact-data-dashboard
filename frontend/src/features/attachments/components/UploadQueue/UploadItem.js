import React from 'react';
import { Progress, Button, Space, Typography, Tooltip } from 'antd';
import {
  CloseCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  CloseOutlined,
  FileOutlined
} from '@ant-design/icons';

const { Text } = Typography;

const formatSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const UploadItem = ({ item, onCancel }) => {
  const getStatusIcon = () => {
    switch (item.status) {
      case 'success':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'error':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'uploading':
        return <LoadingOutlined style={{ color: '#1890ff' }} />;
      case 'cancelled':
        return <CloseOutlined style={{ color: '#999' }} />;
      default:
        return <FileOutlined style={{ color: '#999' }} />;
    }
  };

  const getStatusText = () => {
    switch (item.status) {
      case 'pending':
        return '等待中';
      case 'uploading':
        return `上传中 ${item.progress}%`;
      case 'success':
        return '上传成功';
      case 'error':
        return item.error || '上传失败';
      case 'cancelled':
        return '已取消';
      default:
        return '';
    }
  };

  return (
    <div
      style={{
        padding: '8px 12px',
        background: '#f5f5f5',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}
    >
      {getStatusIcon()}

      <div style={{ flex: 1, minWidth: 0 }}>
        <Tooltip title={item.name}>
          <Text
            ellipsis
            style={{ maxWidth: 180, display: 'block' }}
          >
            {item.name}
          </Text>
        </Tooltip>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatSize(item.size)}
        </Text>
      </div>

      {item.status === 'uploading' && (
        <div style={{ width: 60 }}>
          <Progress
            percent={item.progress}
            size="small"
            showInfo={false}
            strokeColor="#1890ff"
          />
        </div>
      )}

      <Text
        type={
          item.status === 'error'
            ? 'danger'
            : item.status === 'success'
            ? 'success'
            : 'secondary'
        }
        style={{ fontSize: 12, whiteSpace: 'nowrap' }}
      >
        {getStatusText()}
      </Text>

      {(item.status === 'pending' || item.status === 'uploading') && (
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={onCancel}
          danger
        />
      )}
    </div>
  );
};

export default UploadItem;
