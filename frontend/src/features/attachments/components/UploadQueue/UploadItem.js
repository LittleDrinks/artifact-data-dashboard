import React from 'react';
import { Progress, Button, Space, Tooltip } from 'antd';
import { CloseCircleOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

const statusConfig = {
  queued: { color: '#d9d9d9', text: '等待中', icon: null },
  uploading: { color: '#1890ff', text: '上传中', icon: null },
  done: { color: '#52c41a', text: '完成', icon: <CheckCircleOutlined /> },
  error: { color: '#ff4d4f', text: '失败', icon: <ExclamationCircleOutlined /> },
  canceled: { color: '#bfbfbf', text: '已取消', icon: <CloseCircleOutlined /> }
};

const UploadItem = ({ item, onCancel }) => {
  const config = statusConfig[item.status] || statusConfig.queued;
  const isActive = item.status === 'queued' || item.status === 'uploading';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        backgroundColor: '#fafafa',
        borderRadius: 6,
        marginBottom: 8,
        border: `1px solid ${config.color}`
      }}
    >
      <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
        <div
          style={{
            fontSize: 13,
            color: '#262626',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 4
          }}
          title={item.name}
        >
          {item.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Progress
            percent={item.status === 'done' ? 100 : item.percent}
            size="small"
            status={item.status === 'error' ? 'exception' : item.status === 'done' ? 'success' : 'active'}
            style={{ flex: 1, margin: 0 }}
            showInfo={false}
          />
          <span style={{ fontSize: 12, color: config.color, minWidth: 50, textAlign: 'right' }}>
            {config.icon} {config.text}
          </span>
        </div>
        {item.error && (
          <div style={{ fontSize: 11, color: '#ff4d4f', marginTop: 4 }}>{item.error}</div>
        )}
      </div>
      {isActive && (
        <Tooltip title="取消上传">
          <Button
            type="text"
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => onCancel?.(item.uid)}
          />
        </Tooltip>
      )}
    </div>
  );
};

export default UploadItem;