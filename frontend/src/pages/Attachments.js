import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Input, message, Space, Spin, Table, Upload } from 'antd';
import { DeleteOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';

import { getCurrentUser } from '../services/auth.service';
import { deleteAttachment, listAttachments, uploadAttachment, getAttachmentDownloadUrl } from '../services/attachment.service';
import axios from 'axios';

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

const Attachments = () => {
  const [user] = useState(() => getCurrentUser());
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [ownerType, setOwnerType] = useState('');
  const [ownerId, setOwnerId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await listAttachments({
        ownerType: ownerType.trim() || undefined,
        ownerId: ownerId.trim() || undefined
      });
      setRows(resp.data?.data || []);
      setError(null);
    } catch (err) {
      console.error('加载附件失败:', err);
      setError(err.response?.data?.message || '加载附件失败，请稍后重试');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const canDeleteRow = (row) => {
    if (!user || !row) return false;
    return user.role === 'admin';
  };

  const handleDownload = async (row) => {
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
      console.error('下载失败:', err);
      message.error(err.response?.data?.message || '下载失败');
    }
  };

  const handleDelete = async (row) => {
    try {
      await deleteAttachment(row.id);
      message.success('删除成功');
      refresh();
    } catch (err) {
      console.error('删除失败:', err);
      if (err.response?.status === 403) {
        message.error('权限不足：仅管理员可删除');
      } else {
        message.error(err.response?.data?.message || '删除失败');
      }
    }
  };

  const columns = useMemo(() => {
    return [
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
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(row);
              }}
            >
              下载
            </Button>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={!canDeleteRow(row)}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(row);
              }}
            >
              删除
            </Button>
          </Space>
        )
      }
    ];
  }, [user, refresh]);

  const uploadProps = {
    maxCount: 1,
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        if (!isAdmin) {
          message.error('权限不足：仅管理员可上传');
          onError?.(new Error('forbidden'));
          return;
        }
        setUploading(true);
        const resp = await uploadAttachment({
          file,
          ownerType: ownerType.trim() || undefined,
          ownerId: ownerId.trim() || undefined
        });
        message.success('上传成功');
        onSuccess?.(resp.data);
        refresh();
      } catch (err) {
        console.error('上传失败:', err);
        if (err.response?.status === 403) {
          message.error('权限不足：仅管理员可上传');
        } else {
          message.error(err.response?.data?.message || '上传失败');
        }
        onError?.(err);
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div className="attachments-container">
      <Card
        title="附件管理"
        extra={
          <Space>
            <Input
              placeholder="ownerType（可选，例如 artifact）"
              value={ownerType}
              onChange={(e) => setOwnerType(e.target.value)}
              style={{ width: 220 }}
              allowClear
            />
            <Input
              placeholder="ownerId（可选）"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              style={{ width: 160 }}
              allowClear
            />
            <Button onClick={refresh}>刷新</Button>
          </Space>
        }
      >
        {error ? (
          <Alert type="error" showIcon message="错误" description={error} style={{ marginBottom: 16 }} />
        ) : null}

        {!isAdmin ? (
          <Alert
            type="info"
            showIcon
            message="权限提示"
            description="所有登录用户可查看与下载附件；仅管理员可上传与删除。"
            style={{ marginBottom: 16 }}
          />
        ) : null}

        <div style={{ marginBottom: 16 }}>
          <Upload {...uploadProps}>
            <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
              上传附件
            </Button>
          </Upload>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', margin: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: '#999' }}>加载中...</div>
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 10 }}
          />
        )}
      </Card>
    </div>
  );
};

export default Attachments;
