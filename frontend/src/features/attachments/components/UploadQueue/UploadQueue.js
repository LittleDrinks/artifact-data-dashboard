import React from 'react';
import { Card, Button, Progress, Empty } from 'antd';
import { UploadOutlined, ClearOutlined } from '@ant-design/icons';
import UploadItem from './UploadItem';

const UploadQueue = ({
  isAdmin,
  stats,
  queue,
  onPickFiles,
  onCancel,
  onClearCompleted,
  fileInputRef
}) => {
  const hasItems = queue.length > 0;
  const isUploading = stats.uploadingCount > 0 || stats.queuedCount > 0;

  return (
    <Card
      size="small"
      title="上传"
      bodyStyle={{ padding: 12 }}
    >
      <div style={{ marginBottom: 12 }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e?.target?.files || []).filter(Boolean);
            if (files.length > 0) {
              const event = new CustomEvent('file-selected', { detail: files });
              window.dispatchEvent(event);
            }
            if (e?.target) {
              e.target.value = '';
            }
          }}
        />
        <Button
          type="primary"
          icon={<UploadOutlined />}
          disabled={!isAdmin}
          loading={isUploading}
          block
          onClick={onPickFiles}
        >
          选择文件上传
        </Button>
      </div>

      <Progress percent={stats.percent} size="small" />
      <div style={{ marginTop: 6, color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
        {hasItems
          ? `已完成 ${stats.finishedCount}/${stats.totalCount}（队列中：${stats.queuedCount}，上传中：${stats.uploadingCount}）`
          : '未选择文件'}
      </div>

      {hasItems && (
        <div style={{ marginTop: 12, maxHeight: 300, overflow: 'auto' }}>
          {queue.map((item) => (
            <UploadItem key={item.uid} item={item} onCancel={onCancel} />
          ))}
        </div>
      )}

      {hasItems && stats.finishedCount > 0 && (
        <Button
          type="text"
          size="small"
          icon={<ClearOutlined />}
          onClick={onClearCompleted}
          style={{ marginTop: 8, width: '100%' }}
        >
          清除已完成
        </Button>
      )}

      {!hasItems && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无上传任务"
          style={{ marginTop: 16, padding: '20px 0' }}
        />
      )}
    </Card>
  );
};

export default UploadQueue;
