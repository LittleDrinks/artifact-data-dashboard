import React from 'react';
import { Table, Space, Button, Spin } from 'antd';
import { DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { getAttachmentDownloadUrl, deleteAttachment } from '../../../services/attachment.service';
import { message } from 'antd';

const formatBytes = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) {
    return '—';
  }
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const AttachmentTable = ({ rows, loading, user, pagination, onChange, onRefresh }) => {
  const isAdmin = user?.role === 'admin';

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 90 },
    { title: '文件名', dataIndex: 'originalName', key: 'originalName' },
    { title: '类型', dataIndex: 'mimeType', key: 'mimeType', width: 180 },
    {
      title: '大小',
      dataIndex: 'sizeBytes',
      key: 'sizeBytes',
      width: 120,
      render: (val) => formatBytes(val)
    },
    { title: '关联类型', dataIndex: 'ownerType', key: 'ownerType', width: 120 },
    { title: '关联ID', dataIndex: 'ownerId', key: 'ownerId', width: 110 },
    { title: '上传者', dataIndex: 'uploadedBy', key: 'uploadedBy', width: 110 },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 190,
      render: (val) => (val ? new Date(val).toLocaleString() : '—')
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const url = getAttachmentDownloadUrl(row.id);
                const resp = await axios.get(url, { responseType: 'blob' });
                const blobUrl = window.URL.createObjectURL(resp.data);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = row.originalName || `attachment_${row.id}`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(blobUrl);
              } catch (err) {
                message.error(err.response?.data?.message || '下载失败');
              }
            }}
          >
            下载
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={!isAdmin}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await deleteAttachment(row.id);
                message.success('删除成功');
                onRefresh?.();
              } catch (err) {
                if (err.response?.status === 403) {
                  message.error('权限不足：仅管理员可删除');
                } else {
                  message.error(err.response?.data?.message || err.message || '删除失败');
                }
              }
            }}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', margin: '40px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 12, color: '#999' }}>加载中...</div>
      </div>
    );
  }

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={rows}
      pagination={pagination}
      onChange={onChange}
    />
  );
};

export default AttachmentTable;
