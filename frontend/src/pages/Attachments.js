import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Input, message, Space, Spin, Table, Upload, Progress } from 'antd';
import { DeleteOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';

import { getCurrentUser } from '../services/auth.service';
import {
  deleteAttachment,
  exportKnowledgeGraphExcel,
  getAttachmentDownloadUrl,
  importKnowledgeGraphExcelFromAttachment,
  listAttachments,
  uploadAttachment
} from '../services/attachment.service';
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
  const [exportingExcel, setExportingExcel] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [ownerType, setOwnerType] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const limitRef = useRef(limit);

  const [uploadQueue, setUploadQueue] = useState([]);
  const uploadAbortMapRef = useRef(new Map());
  const uploadActiveCountRef = useRef(0);
  const uploadShouldRefreshRef = useRef(false);
  const uploadQueueRef = useRef(uploadQueue);

  useEffect(() => {
    uploadQueueRef.current = uploadQueue;
  }, [uploadQueue]);

  useEffect(() => {
    limitRef.current = limit;
  }, [limit]);

  useEffect(() => {
    return () => {
      for (const abort of uploadAbortMapRef.current.values()) {
        try {
          abort?.();
        } catch (e) {
          // ignore
        }
      }
      uploadAbortMapRef.current.clear();
    };
  }, []);

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
      console.error('加载附件失败:', err);
      setError(err.response?.data?.message || '加载附件失败，请稍后重试');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    const hasActive = uploadQueue.some((item) => item.status === 'queued' || item.status === 'uploading');
    if (!hasActive && uploadShouldRefreshRef.current) {
      uploadShouldRefreshRef.current = false;
      refresh({ nextPage: 1 });
    }
  }, [refresh, uploadQueue]);

  useEffect(() => {
    refresh({ nextPage: 1 });
  }, [ownerType, ownerId, refresh]);

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

  const UPLOAD_CONCURRENCY = 2;

  const pumpUploadQueue = useCallback(async () => {
    while (uploadActiveCountRef.current < UPLOAD_CONCURRENCY) {
      const next = uploadQueueRef.current.find((item) => item.status === 'queued');
      if (!next) {
        break;
      }

      uploadActiveCountRef.current += 1;

      (async () => {
        const controller = new AbortController();
        uploadAbortMapRef.current.set(next.uid, () => controller.abort());

        setUploadQueue((prev) =>
          prev.map((item) =>
            item.uid === next.uid
              ? {
                  ...item,
                  status: 'uploading',
                  percent: 0
                }
              : item
          )
        );

        try {
          const resp = await uploadAttachment({
            file: next.file,
            ownerType: ownerType.trim() || undefined,
            ownerId: ownerId.trim() || undefined,
            signal: controller.signal,
            onUploadProgress: (evt) => {
              const totalBytes = Number(evt.total || 0);
              const loadedBytes = Number(evt.loaded || 0);
              const percent = totalBytes > 0 ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100)) : 0;
              setUploadQueue((prev) =>
                prev.map((item) => (item.uid === next.uid ? { ...item, percent } : item))
              );
            }
          });

          uploadShouldRefreshRef.current = true;
          setUploadQueue((prev) =>
            prev.map((item) =>
              item.uid === next.uid
                ? {
                    ...item,
                    status: 'done',
                    percent: 100,
                    attachmentId: resp.data?.id
                  }
                : item
            )
          );
        } catch (err) {
          if (err.code === 'ERR_CANCELED') {
            setUploadQueue((prev) =>
              prev.map((item) =>
                item.uid === next.uid ? { ...item, status: 'canceled', error: '已取消' } : item
              )
            );
          } else if (err.response?.status === 403) {
            setUploadQueue((prev) =>
              prev.map((item) =>
                item.uid === next.uid ? { ...item, status: 'error', error: '权限不足' } : item
              )
            );
          } else {
            setUploadQueue((prev) =>
              prev.map((item) =>
                item.uid === next.uid
                  ? { ...item, status: 'error', error: err.response?.data?.message || err.message || '上传失败' }
                  : item
              )
            );
          }
        } finally {
          uploadAbortMapRef.current.delete(next.uid);
          uploadActiveCountRef.current = Math.max(0, uploadActiveCountRef.current - 1);

          pumpUploadQueue();
        }
      })();
    }
  }, [ownerId, ownerType]);

  useEffect(() => {
    pumpUploadQueue();
  }, [pumpUploadQueue, uploadQueue]);

  const enqueueUploads = useCallback(
    (files = []) => {
      if (!isAdmin) {
        message.error('权限不足：仅管理员可上传');
        return;
      }

      const now = Date.now();
      const nextItems = files
        .filter(Boolean)
        .map((file, index) => ({
          uid: `${now}-${index}-${file.uid || file.name || 'file'}`,
          name: file.name,
          file,
          status: 'queued',
          percent: 0
        }));

      if (!nextItems.length) {
        return;
      }

      setUploadQueue((prev) => [...nextItems, ...prev]);
    },
    [isAdmin]
  );

  const uploadPickerProps = {
    multiple: true,
    showUploadList: false,
    customRequest: ({ file, onSuccess }) => {
      // 选中即入队上传（真正的上传由队列调度执行）
      enqueueUploads([file]);
      onSuccess?.('queued');
    }
  };

  const queueStats = useMemo(() => {
    const totalCount = uploadQueue.length;
    const finishedCount = uploadQueue.filter((item) => ['done', 'error', 'canceled'].includes(item.status)).length;
    const percent = totalCount > 0 ? Math.round((finishedCount / totalCount) * 100) : 0;
    const uploadingCount = uploadQueue.filter((item) => item.status === 'uploading').length;
    const queuedCount = uploadQueue.filter((item) => item.status === 'queued').length;
    return { totalCount, finishedCount, percent, uploadingCount, queuedCount };
  }, [uploadQueue]);

  const handleExportExcel = async () => {
    try {
      if (!isAdmin) {
        message.error('权限不足：仅管理员可导出');
        return;
      }

      setExportingExcel(true);
      const resp = await exportKnowledgeGraphExcel();
      const attachmentId = resp.data?.id;
      message.success(attachmentId ? `导出成功，已生成附件 #${attachmentId}` : '导出成功');
      refresh({ nextPage: 1 });
    } catch (err) {
      console.error('导出Excel失败:', err);
      if (err.response?.status === 403) {
        message.error('权限不足：仅管理员可导出');
      } else {
        message.error(err.response?.data?.message || '导出失败');
      }
    } finally {
      setExportingExcel(false);
    }
  };

  const importExcelUploadProps = {
    accept: '.xlsx',
    maxCount: 1,
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        if (!isAdmin) {
          message.error('权限不足：仅管理员可导入');
          onError?.(new Error('forbidden'));
          return;
        }

        const overwrite = window.confirm(
          '是否使用 overwrite 全量覆盖导入？\n\n确定 = overwrite（会清空并重建 artifacts）\n取消 = append（仅新增）'
        );
        const strategy = overwrite ? 'overwrite' : 'append';

        setImportingExcel(true);

        // Step 1: Upload as attachment (ownerType=system_import)
        const uploadResp = await uploadAttachment({
          file,
          ownerType: 'system_import',
          ownerId: 0
        });
        const attachmentId = uploadResp.data?.id;
        if (!attachmentId) {
          throw new Error('上传成功但未返回附件ID');
        }

        // Step 2: Trigger import by attachment id
        const importResp = await importKnowledgeGraphExcelFromAttachment({ id: attachmentId, strategy });
        const result = importResp.data || {};

        message.success(
          `导入成功：inserted=${result.inserted ?? 0} updated=${result.updated ?? 0} skipped=${result.skipped ?? 0}`
        );

        onSuccess?.(result);
        refresh({ nextPage: 1 });
      } catch (err) {
        console.error('导入Excel失败:', err);
        if (err.response?.status === 403) {
          message.error('权限不足：仅管理员可导入');
        } else {
          message.error(err.response?.data?.message || err.message || '导入失败');
        }
        onError?.(err);
      } finally {
        setImportingExcel(false);
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

        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isAdmin ? (
              <div style={{ marginBottom: 16 }}>
                <Space>
                  <Button onClick={handleExportExcel} loading={exportingExcel}>
                    导出知识图谱Excel（生成附件）
                  </Button>
                  <Upload {...importExcelUploadProps}>
                    <Button loading={importingExcel}>上传并导入知识图谱Excel</Button>
                  </Upload>
                </Space>
              </div>
            ) : null}

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
                pagination={{
                  current: page,
                  pageSize: limit,
                  total,
                  showSizeChanger: true
                }}
                onChange={(nextPagination) => {
                  refresh({
                    nextPage: nextPagination.current,
                    nextLimit: nextPagination.pageSize
                  });
                }}
              />
            )}
          </div>

          <div style={{ width: 320, flex: '0 0 320px' }}>
            <Card size="small" title="上传" bodyStyle={{ padding: 12 }}>
              <div style={{ marginBottom: 12 }}>
                <Upload {...uploadPickerProps}>
                  <Button
                    type="primary"
                    icon={<UploadOutlined />}
                    disabled={!isAdmin}
                    loading={queueStats.uploadingCount > 0 || queueStats.queuedCount > 0}
                    block
                  >
                    选择文件上传
                  </Button>
                </Upload>
              </div>

              <div style={{ marginBottom: 8 }}>
                <Progress percent={queueStats.percent} size="small" />
                <div style={{ marginTop: 6, color: 'rgba(0,0,0,0.45)' }}>
                  {queueStats.totalCount > 0
                    ? `已完成 ${queueStats.finishedCount}/${queueStats.totalCount}（队列中：${queueStats.queuedCount}，上传中：${queueStats.uploadingCount}）`
                    : '未选择文件'}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Attachments;
