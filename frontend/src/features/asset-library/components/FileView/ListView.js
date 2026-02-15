import React from 'react';
import { Empty, Checkbox, Button, Space, Popconfirm } from 'antd';
import { DownloadOutlined, DeleteOutlined } from '@ant-design/icons';

const ListView = ({
  files,
  isSelectionMode,
  selectedFileIds,
  onToggleFileSelection,
  onDownloadFile,
  onDeleteFile
}) => {
  if (files.length === 0) {
    return <Empty description="暂无文件" />;
  }

  return (
    <div className="file-list">
      {files.map(file => (
        <div
          key={file.id}
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: selectedFileIds.has(file.id) ? '#e6f7ff' : 'transparent',
            cursor: isSelectionMode ? 'pointer' : 'default'
          }}
          onClick={() => isSelectionMode && onToggleFileSelection(file.id)}
          role={isSelectionMode ? 'button' : undefined}
          tabIndex={isSelectionMode ? 0 : undefined}
          onKeyDown={(e) => isSelectionMode && e.key === 'Enter' && onToggleFileSelection(file.id)}
        >
          {isSelectionMode && (
            <Checkbox
              checked={selectedFileIds.has(file.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleFileSelection(file.id)}
            />
          )}
          <span style={{ fontSize: 24 }}>
            {file.mimeType?.startsWith('image/') ? '🖼️' : '📄'}
          </span>
          
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {file.originalName}
            </div>
            <div style={{ color: '#999', fontSize: 12 }}>
              {formatFileSize(file.sizeBytes)} · {file.mimeType}
            </div>
          </div>
          
          <div style={{ color: '#999', fontSize: 12, flex: '0 0 auto' }}>
            {new Date(file.createdAt).toLocaleDateString()}
          </div>
          
          {!isSelectionMode && (
            <Space style={{ flex: '0 0 auto' }}>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => onDownloadFile(file)}
              >
                下载
              </Button>
              <Popconfirm
                title="删除文件"
                description="确定要删除此文件吗？"
                onConfirm={() => onDeleteFile(file.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          )}
        </div>
      ))}
    </div>
  );
};

const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
};

export default ListView;
