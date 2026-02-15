import React from 'react';
import { Card, Checkbox, Tooltip, Button, Popconfirm } from 'antd';
import { DeleteOutlined, DownloadOutlined } from '@ant-design/icons';

const FileCard = ({
  file,
  isSelectionMode,
  isSelected,
  getThumbnailUrl,
  onToggleSelection,
  onDownload,
  onDelete
}) => {
  const isImage = file.mimeType?.startsWith('image/');

  return (
    <Card
      hoverable
      size="small"
      style={isSelected ? { border: '2px solid #1890ff' } : {}}
      onClick={() => isSelectionMode && onToggleSelection(file.id)}
      cover={
        <div style={{
          height: 120,
          background: '#f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {isSelectionMode && (
            <Checkbox
              checked={isSelected}
              style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleSelection(file.id)}
            />
          )}
          {isImage ? (
            <img
              alt={file.originalName}
              src={getThumbnailUrl(file.id, 'small')}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <span style={{ fontSize: 48 }}>📄</span>
          )}
          {!isSelectionMode && (
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.3)',
              display: 'none',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8
            }} className="hover-actions">
              <Button
                size="small"
                type="primary"
                icon={<DownloadOutlined />}
                onClick={(e) => { e.stopPropagation(); onDownload(file); }}
              />
              <Popconfirm
                title="删除文件"
                description="确定要删除此文件吗？"
                onConfirm={() => onDelete(file.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => e.stopPropagation()}
                />
              </Popconfirm>
            </div>
          )}
        </div>
      }
      onMouseEnter={(e) => {
        if (!isSelectionMode) {
          const actions = e.currentTarget.querySelector('.hover-actions');
          if (actions) actions.style.display = 'flex';
        }
      }}
      onMouseLeave={(e) => {
        const actions = e.currentTarget.querySelector('.hover-actions');
        if (actions) actions.style.display = 'none';
      }}
    >
      <Card.Meta
        title={
          <Tooltip title={file.originalName}>
            <span style={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {file.originalName}
            </span>
          </Tooltip>
        }
        description={formatFileSize(file.sizeBytes)}
      />
    </Card>
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

export default FileCard;
