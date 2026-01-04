import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Input, message, Modal, Space, Spin, Table, Upload } from 'antd';
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
  const [uploading, setUploading] = useState(false);
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

  const [batchOpen, setBatchOpen] = useState(false);
  const [batchFiles, setBatchFiles] = useState([]);
  const [batchResults, setBatchResults] = useState([]);
  const [batchUploading, setBatchUploading] = useState(false);
  const batchAbortRef = useRef(false);
  const currentUploadAbortRef = useRef(null);

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
      console.error('加载附件失败:', err);
      setError(err.response?.data?.message || '加载附件失败，请稍后重试');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId]);

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
        const controller = new AbortController();
        currentUploadAbortRef.current = () => controller.abort();
        const resp = await uploadAttachment({
          file,
          ownerType: ownerType.trim() || undefined,
          ownerId: ownerId.trim() || undefined,
          signal: controller.signal
        });
        message.success('上传成功');
        onSuccess?.(resp.data);
        refresh();
      } catch (err) {
        console.error('上传失败:', err);
        if (err.code === 'ERR_CANCELED') {
          message.info('已取消上传');
          onError?.(err);
          return;
        }
        if (err.response?.status === 403) {
          message.error('权限不足：仅管理员可上传');
        } else {
          message.error(err.response?.data?.message || '上传失败');
        }
        onError?.(err);
      } finally {
        setUploading(false);
        currentUploadAbortRef.current = null;
      }
    }
  };

  const batchUploadProps = {
    multiple: true,
    accept: 'image/*',
    fileList: batchFiles,
    beforeUpload: () => false,
    onChange: (info) => {
      setBatchFiles(info.fileList || []);
    },
    onRemove: (file) => {
      setBatchFiles((prev) => prev.filter((f) => f.uid !== file.uid));
    }
  };

  const handleBatchUpload = async () => {
    if (!isAdmin) {
      message.error('权限不足：仅管理员可上传');
      return;
    }

    if (!batchFiles.length) {
      message.warning('请先选择图片');
      return;
    }

    batchAbortRef.current = false;
    setBatchUploading(true);
    setBatchResults([]);

    const results = [];
    for (const fileItem of batchFiles) {
      if (batchAbortRef.current) {
        break;
      }
      const file = fileItem.originFileObj;
      if (!file) {
        results.push({ name: fileItem.name, ok: false, error: '文件无效' });
        continue;
      }

      try {
        const controller = new AbortController();
        currentUploadAbortRef.current = () => controller.abort();
        const resp = await uploadAttachment({
          file,
          ownerType: ownerType.trim() || undefined,
          ownerId: ownerId.trim() || undefined,
          signal: controller.signal
        });
        results.push({ name: file.name, ok: true, id: resp.data?.id });
      } catch (err) {
        if (err.code === 'ERR_CANCELED') {
          results.push({ name: file.name, ok: false, error: '已取消' });
          batchAbortRef.current = true;
        } else {
        results.push({ name: file.name, ok: false, error: err.response?.data?.message || err.message || '上传失败' });
        }
      }

      setBatchResults([...results]);
    }

    setBatchUploading(false);
    currentUploadAbortRef.current = null;
    message.success(batchAbortRef.current ? '已取消批量上传' : '批量上传完成');
    refresh({ nextPage: 1 });
  };

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

        <div style={{ marginBottom: 16 }}>
          <Upload {...uploadProps}>
            <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
              上传附件
            </Button>
          </Upload>

          {isAdmin ? (
            <Button
              style={{ marginLeft: 12 }}
              icon={<UploadOutlined />}
              onClick={() => {
                setBatchOpen(true);
                setBatchResults([]);
              }}
            >
              批量上传
            </Button>
          ) : null}

          {isAdmin ? (
            <Space style={{ marginLeft: 12 }}>
              <Button onClick={handleExportExcel} loading={exportingExcel}>
                导出知识图谱Excel（生成附件）
              </Button>
              <Upload {...importExcelUploadProps}>
                <Button loading={importingExcel}>上传并导入知识图谱Excel</Button>
              </Upload>
            </Space>
          ) : null}
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
      </Card>

      <Modal
        title="批量上传图片"
        open={batchOpen}
        maskClosable={false}
        onCancel={() => {
          // 允许随时关闭：中途关闭则取消当前上传
          batchAbortRef.current = true;
          currentUploadAbortRef.current?.();
          setBatchUploading(false);
          setBatchOpen(false);
          setBatchFiles([]);
          setBatchResults([]);
        }}
        onOk={handleBatchUpload}
        okButtonProps={{ loading: batchUploading, disabled: !batchFiles.length }}
        cancelButtonProps={{ disabled: false }}
      >
        <div style={{ marginBottom: 12 }}>
          <Upload {...batchUploadProps}>
            <Button icon={<UploadOutlined />}>选择多张图片</Button>
          </Upload>
          <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.45)' }}>
            选择后点击“确定”开始上传（逐个上传）。
          </div>
        </div>

        {batchResults.length > 0 && (
          <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #f0f0f0', padding: 8 }}>
            {batchResults.map((r, idx) => (
              <div key={`${r.name}-${idx}`} style={{ marginBottom: 6 }}>
                {r.ok ? `✅ ${r.name} -> #${r.id}` : `❌ ${r.name} - ${r.error}`}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Attachments;
