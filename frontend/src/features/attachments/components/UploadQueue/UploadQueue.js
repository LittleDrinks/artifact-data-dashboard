import React from 'react';
import { Card, Button, Space, Typography, Badge, Divider } from 'antd';
import {
  UploadOutlined,
  ClearOutlined,
  CloudUploadOutlined
} from '@ant-design/icons';
import UploadItem from './UploadItem';

const { Text } = Typography;

const UploadQueue = ({
  isAdmin,
  stats,
  queue,
  onPickFiles,
  onCancel,
  onClearCompleted,
  fileInputRef
}) => {
  const handleDrop = (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length && fileInputRef?.current) {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <Card
      title={
        <Space>
          <CloudUploadOutlined />
          文件上传
          <Badge
            count={stats.uploading}
            style={{ backgroundColor: '#1890ff' }}
            showZero={false}
          />
          <Badge
            count={stats.pending}
            style={{ backgroundColor: '#faad14' }}
            showZero={false}
          />
        </Space>
      }
      extra={
        <Space>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={onPickFiles}
            disabled={!isAdmin}
          >
            选择文件
          </Button>
          {(stats.success > 0 || queue.some((i) => i.status === 'cancelled')) && (
            <Button icon={<ClearOutlined />} onClick={onClearCompleted}>
              清除已完成
            </Button>
          )}
        </Space>
      }
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {!isAdmin && (
        <Text type="secondary">仅管理员可上传文件</Text>
      )}

      {queue.length === 0 ? (
        <Text type="secondary">暂无上传任务，点击"选择文件"或拖拽文件到此处</Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          {queue.map((item) => (
            <UploadItem
              key={item.id}
              item={item}
              onCancel={() => onCancel(item.id)}
            />
          ))}
        </Space>
      )}

      <Divider />

      <Space>
        <Text type="secondary">
          待处理: {stats.pending} | 上传中: {stats.uploading} | 成功: {stats.success} | 失败: {stats.error}
        </Text>
      </Space>
    </Card>
  );
};

export default UploadQueue;
