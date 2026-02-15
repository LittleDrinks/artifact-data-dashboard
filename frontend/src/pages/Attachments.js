import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Button, Card, Input, Space } from 'antd';
import { getCurrentUser } from '../services/auth.service';
import { listAttachments } from '../services/attachment.service';
import {
  useUploadQueue,
  UploadQueue,
  ImportPanel,
  AttachmentTable
} from '../features/attachments';

const Attachments = () => {
  const [user] = useState(() => getCurrentUser());
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [ownerType, setOwnerType] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const limitRef = useRef(limit);

  useEffect(() => {
    limitRef.current = limit;
  }, [limit]);

  const refresh = useCallback(async ({ nextPage, nextLimit } = {}) => {
    setLoading(true);
    try {
      const resolvedPage = nextPage ?? 1;
      const resolvedLimit = nextLimit ?? limitRef.current;
      const resp = await listAttachments({
        ownerType: ownerType.trim() || undefined,
        ownerId: ownerId.trim() || undefined,
        page: resolvedPage,
        limit: resolvedLimit
      });
      setRows(resp.data?.data || []);
      const meta = resp.data?.meta;
      setTotal(Number(meta?.total || 0));
      setPage(Number(meta?.page || resolvedPage));
      setLimit(Number(meta?.limit || resolvedLimit));
      setError(null);
    } catch (err) {
      const data = err.response?.data;
      const resolvedMessage =
        (typeof data === 'string' && data.trim()) ||
        data?.message ||
        data?.error?.message ||
        err.message ||
        '加载附件失败，请稍后重试';
      setError(resolvedMessage);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    refresh({ nextPage: 1 });
  }, [ownerType, ownerId, refresh]);

  const fileInputRef = useRef(null);

  const {
    queue: uploadQueue,
    stats: queueStats,
    addToQueue,
    cancelUpload,
    clearCompleted
  } = useUploadQueue({
    isAdmin,
    ownerType,
    ownerId,
    onUploadSuccess: () => refresh({ nextPage: 1 })
  });

  const handlePickFiles = () => {
    fileInputRef.current?.click?.();
  };

  const handleFileInputChange = (event) => {
    const files = Array.from(event?.target?.files || []).filter(Boolean);
    if (files.length) {
      addToQueue(files);
    }
    if (event?.target) {
      event.target.value = '';
    }
  };

  const handleTableChange = (pagination) => {
    refresh({
      nextPage: pagination.current,
      nextLimit: pagination.pageSize
    });
  };

  return (
    <div className="attachments-container">
      <Card
        title="附件管理"
        extra={
          <Space>
            <Input
              placeholder="ownerType（可选）"
              value={ownerType}
              onChange={(e) => setOwnerType(e.target.value)}
              style={{ width: 180 }}
              allowClear
            />
            <Input
              placeholder="ownerId（可选）"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              style={{ width: 140 }}
              allowClear
            />
            <Button onClick={() => refresh()}>刷新</Button>
          </Space>
        }
      >
        {error && (
          <Alert
            type="error"
            showIcon
            message="错误"
            description={error}
            style={{ marginBottom: 16 }}
          />
        )}

        {!isAdmin && (
          <Alert
            type="info"
            showIcon
            message="权限提示"
            description="所有登录用户可查看与下载附件；仅管理员可上传与删除。"
            style={{ marginBottom: 16 }}
          />
        )}

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <AttachmentTable
              rows={rows}
              loading={loading}
              user={user}
              pagination={{
                current: page,
                pageSize: limit,
                total,
                showSizeChanger: true
              }}
              onChange={handleTableChange}
              onRefresh={refresh}
            />
          </div>

          <div style={{ width: 360, flex: '0 0 360px' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />
              <UploadQueue
                isAdmin={isAdmin}
                stats={queueStats}
                queue={uploadQueue}
                onPickFiles={handlePickFiles}
                onCancel={cancelUpload}
                onClearCompleted={clearCompleted}
                fileInputRef={fileInputRef}
              />
              <ImportPanel
                isAdmin={isAdmin}
                ownerType={ownerType}
                ownerId={ownerId}
                onImportSuccess={() => refresh({ nextPage: 1 })}
                onExportSuccess={() => refresh({ nextPage: 1 })}
              />
            </Space>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Attachments;
