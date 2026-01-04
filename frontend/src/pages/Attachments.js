import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Input, message, Space, Spin, Table, Upload, Progress } from 'antd';
import { DeleteOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';

import { getCurrentUser } from '../services/auth.service';
import {
  deleteAttachment,
  exportKnowledgeGraphExcel,
  getAttachmentDownloadUrl,
  importKnowledgeGraphExcelFromAttachment,
  bulkUploadZip,
  importArtifactAttachmentLinksExcel,
  importAttachmentsFromDir,
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
  const [bulkZipUploading, setBulkZipUploading] = useState(false);
  const [bulkZipFileList, setBulkZipFileList] = useState([]);
  const [bulkZipResult, setBulkZipResult] = useState(null);
  const [linkExcelImporting, setLinkExcelImporting] = useState(false);
  const [linkExcelFileList, setLinkExcelFileList] = useState([]);
  const [linkExcelResult, setLinkExcelResult] = useState(null);
  const [dirImporting, setDirImporting] = useState(false);
  const [dirImportDir, setDirImportDir] = useState('/data/import/crawler');
  const [dirImportMaxFiles, setDirImportMaxFiles] = useState('');
  const [dirImportResult, setDirImportResult] = useState(null);
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
  const fileInputRef = useRef(null);

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
      const data = err.response?.data;
      const resolvedMessage =
        (typeof data === 'string' && data.trim()) ||
        data?.message ||
        data?.error?.message ||
        err.message ||
        '删除失败';
      if (err.response?.status === 403) {
        message.error('权限不足：仅管理员可删除');
      } else {
        message.error(resolvedMessage);
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

  const buildDedupeKey = useCallback((file) => {
    if (!file) {
      return '';
    }
    const name = String(file.name || '').trim();
    const size = Number(file.size || 0);
    const lastModified = Number(file.lastModified || 0);
    return `${name}@@${size}@@${lastModified}`;
  }, []);

  const setUploadQueueWithRef = useCallback((updater) => {
    setUploadQueue((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      uploadQueueRef.current = next;
      return next;
    });
  }, []);

  const pumpUploadQueue = useCallback(async () => {
    while (uploadActiveCountRef.current < UPLOAD_CONCURRENCY) {
      const next = uploadQueueRef.current.find((item) => item.status === 'queued');
      if (!next) {
        break;
      }

      // 关键点：在开始异步上传前，先把该条目原子地标记为 uploading。
      // 否则 while 循环可能在 React state 更新前重复选中同一个 queued 项，导致同一文件上传两次。
      setUploadQueueWithRef((prev) =>
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

      uploadActiveCountRef.current += 1;

      (async () => {
        const controller = new AbortController();
        uploadAbortMapRef.current.set(next.uid, () => controller.abort());

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
              setUploadQueueWithRef((prev) =>
                prev.map((item) => (item.uid === next.uid ? { ...item, percent } : item))
              );
            }
          });

          uploadShouldRefreshRef.current = true;
          setUploadQueueWithRef((prev) =>
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
            setUploadQueueWithRef((prev) =>
              prev.map((item) =>
                item.uid === next.uid ? { ...item, status: 'canceled', error: '已取消' } : item
              )
            );
          } else if (err.response?.status === 403) {
            setUploadQueueWithRef((prev) =>
              prev.map((item) =>
                item.uid === next.uid ? { ...item, status: 'error', error: '权限不足' } : item
              )
            );
          } else {
            setUploadQueueWithRef((prev) =>
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
  }, [ownerId, ownerType, setUploadQueueWithRef]);

  useEffect(() => {
    pumpUploadQueue();
  }, [pumpUploadQueue, uploadQueue]);

  const enqueueUploads = useCallback(
    (files = []) => {
      if (!isAdmin) {
        message.error('权限不足：仅管理员可上传');
        return;
      }

      setUploadQueueWithRef((prev) => {
        const nextItems = [];
        let dedupedCount = 0;

        for (const file of files.filter(Boolean)) {
          const dedupeKey = buildDedupeKey(file);
          const isDuplicate =
            prev.some((item) => item.dedupeKey === dedupeKey && !['error', 'canceled'].includes(item.status)) ||
            nextItems.some((item) => item.dedupeKey === dedupeKey);

          if (dedupeKey && isDuplicate) {
            dedupedCount += 1;
            continue;
          }

          nextItems.push({
            uid: dedupeKey || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            dedupeKey,
            name: file.name,
            file,
            status: 'queued',
            percent: 0
          });
        }

        if (dedupedCount > 0) {
          message.info(`已忽略 ${dedupedCount} 个重复文件`);
        }

        if (!nextItems.length) {
          return prev;
        }

        return [...nextItems, ...prev];
      });
    },
    [buildDedupeKey, isAdmin, setUploadQueueWithRef]
  );

  const handlePickFiles = () => {
    if (!isAdmin) {
      message.error('权限不足：仅管理员可上传');
      return;
    }
    fileInputRef.current?.click?.();
  };

  const handleFileInputChange = (event) => {
    const files = Array.from(event?.target?.files || []).filter(Boolean);
    if (files.length) {
      enqueueUploads(files);
    }
    // 允许重复选择同名文件/同一文件
    if (event?.target) {
      event.target.value = '';
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

  const bulkZipUploadProps = {
    accept: '.zip',
    maxCount: 1,
    fileList: bulkZipFileList,
    beforeUpload: (file) => {
      setBulkZipFileList([file]);
      setBulkZipResult(null);
      return false;
    },
    onRemove: () => {
      setBulkZipFileList([]);
      setBulkZipResult(null);
    }
  };

  const linkExcelUploadProps = {
    accept: '.xlsx',
    maxCount: 1,
    fileList: linkExcelFileList,
    beforeUpload: (file) => {
      setLinkExcelFileList([file]);
      setLinkExcelResult(null);
      return false;
    },
    onRemove: () => {
      setLinkExcelFileList([]);
      setLinkExcelResult(null);
    }
  };

  const handleBulkZipUpload = async () => {
    if (!isAdmin) {
      message.error('权限不足：仅管理员可批量上传');
      return;
    }

    if (!bulkZipFileList.length) {
      message.warning('请先选择 ZIP 文件');
      return;
    }

    try {
      setBulkZipUploading(true);
      const file = bulkZipFileList[0]?.originFileObj || bulkZipFileList[0];
      const resp = await bulkUploadZip({ file });
      const items = Array.isArray(resp.data?.data) ? resp.data.data : [];
      const okCount = items.filter((it) => it && it.attachmentId).length;
      const errCount = items.filter((it) => it && it.error).length;
      setBulkZipResult({ okCount, errCount, items });
      message.success(`ZIP 上传完成：成功 ${okCount}，失败 ${errCount}`);
      refresh({ nextPage: 1 });
    } catch (err) {
      console.error('ZIP 批量上传失败:', err);
      if (err.response?.status === 403) {
        message.error('权限不足：仅管理员可批量上传');
      } else {
        message.error(err.response?.data?.message || err.message || 'ZIP 上传失败');
      }
    } finally {
      setBulkZipUploading(false);
    }
  };

  const handleLinkExcelImport = async () => {
    if (!isAdmin) {
      message.error('权限不足：仅管理员可导入关联');
      return;
    }

    if (!linkExcelFileList.length) {
      message.warning('请先选择 Excel 文件（data.xlsx）');
      return;
    }

    try {
      setLinkExcelImporting(true);
      const file = linkExcelFileList[0]?.originFileObj || linkExcelFileList[0];
      const resp = await importArtifactAttachmentLinksExcel({ file });
      setLinkExcelResult(resp.data || null);
      message.success(`关联导入完成：linked=${resp.data?.linked ?? 0}`);
    } catch (err) {
      console.error('关联导入失败:', err);
      if (err.response?.status === 403) {
        message.error('权限不足：仅管理员可导入关联');
      } else {
        message.error(err.response?.data?.message || err.message || '关联导入失败');
      }
    } finally {
      setLinkExcelImporting(false);
    }
  };

  const handleDirImport = async () => {
    if (!isAdmin) {
      message.error('权限不足：仅管理员可导入目录');
      return;
    }

    const dir = String(dirImportDir || '').trim();
    if (!dir) {
      message.warning('请填写容器内目录路径');
      return;
    }

    try {
      setDirImporting(true);
      setDirImportResult(null);
      const resp = await importAttachmentsFromDir({
        dir,
        ownerType: ownerType.trim() || undefined,
        ownerId: ownerId.trim() || undefined,
        maxFiles: dirImportMaxFiles.trim() || undefined
      });
      setDirImportResult(resp.data || null);
      message.success(`目录导入完成：processed=${resp.data?.processed ?? 0}`);
      refresh({ nextPage: 1 });
    } catch (err) {
      console.error('目录导入失败:', err);
      if (err.response?.status === 403) {
        message.error('权限不足：仅管理员可导入目录');
      } else {
        message.error(err.response?.data?.message || err.message || '目录导入失败');
      }
    } finally {
      setDirImporting(false);
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

            {isAdmin ? (
              <Card size="small" title="附件挂载（无需导入文件夹）" style={{ marginBottom: 16 }}>
                <div style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 12, lineHeight: 1.6 }}>
                  <div>1) 上传 ZIP：ZIP 内建议以 artifact_id 作为第一层目录（例如 123/xxx.jpg）。</div>
                  <div>2) 上传 data.xlsx：会读取 ArtifactAttachments sheet，把图片关联到文物。</div>
                </div>

                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space wrap>
                    <Upload {...bulkZipUploadProps}>
                      <Button icon={<UploadOutlined />} disabled={bulkZipUploading}>
                        选择 ZIP
                      </Button>
                    </Upload>
                    <Button type="primary" onClick={handleBulkZipUpload} loading={bulkZipUploading}>
                      上传 ZIP
                    </Button>
                  </Space>

                  {bulkZipResult ? (
                    <Alert
                      type={bulkZipResult.errCount > 0 ? 'warning' : 'success'}
                      showIcon
                      message={`ZIP 结果：成功 ${bulkZipResult.okCount}，失败 ${bulkZipResult.errCount}`}
                      description={
                        bulkZipResult.errCount > 0 ? (
                          <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto' }}>
                            {JSON.stringify(
                              bulkZipResult.items.filter((it) => it && it.error).slice(0, 20),
                              null,
                              2
                            )}
                          </pre>
                        ) : null
                      }
                    />
                  ) : null}

                  <Space wrap>
                    <Upload {...linkExcelUploadProps}>
                      <Button icon={<UploadOutlined />} disabled={linkExcelImporting}>
                        选择 data.xlsx
                      </Button>
                    </Upload>
                    <Button type="primary" onClick={handleLinkExcelImport} loading={linkExcelImporting}>
                      执行关联导入
                    </Button>
                  </Space>

                  {linkExcelResult ? (
                    <Alert
                      type={(linkExcelResult.errors || []).length > 0 ? 'warning' : 'success'}
                      showIcon
                      message={`关联结果：linked=${linkExcelResult.linked ?? 0} errors=${(linkExcelResult.errors || []).length}`}
                      description={
                        (linkExcelResult.errors || []).length > 0 ? (
                          <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto' }}>
                            {JSON.stringify((linkExcelResult.errors || []).slice(0, 20), null, 2)}
                          </pre>
                        ) : null
                      }
                    />
                  ) : null}
                </Space>
              </Card>
            ) : null}

            {isAdmin ? (
              <Card size="small" title="目录导入（适合超大数据，需 Docker 挂载）" style={{ marginBottom: 16 }}>
                <div style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 12, lineHeight: 1.6 }}>
                  <div>把本地目录通过 Docker 挂载到后端容器，再填“容器内路径”导入。</div>
                  <div>白名单前缀：/data/import/crawler</div>
                </div>

                <Space direction="vertical" style={{ width: '100%' }}>
                  <Input
                    value={dirImportDir}
                    onChange={(e) => setDirImportDir(e.target.value)}
                    placeholder="容器内目录路径，例如 /data/import/crawler/shenzhen/images_shenzhen"
                  />
                  <Input
                    value={dirImportMaxFiles}
                    onChange={(e) => setDirImportMaxFiles(e.target.value)}
                    placeholder="maxFiles（可选，留空使用默认）"
                  />
                  <Button type="primary" onClick={handleDirImport} loading={dirImporting}>
                    开始导入目录
                  </Button>

                  {dirImportResult ? (
                    <Alert
                      type={(dirImportResult.data || []).some((it) => it && it.error) ? 'warning' : 'success'}
                      showIcon
                      message={`目录导入：totalFiles=${dirImportResult.totalFiles ?? 0} processed=${dirImportResult.processed ?? 0}`}
                      description={
                        (dirImportResult.data || []).some((it) => it && it.error) ? (
                          <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto' }}>
                            {JSON.stringify(
                              (dirImportResult.data || []).filter((it) => it && it.error).slice(0, 20),
                              null,
                              2
                            )}
                          </pre>
                        ) : null
                      }
                    />
                  ) : null}
                </Space>
              </Card>
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
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileInputChange}
                />
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  disabled={!isAdmin}
                  loading={queueStats.uploadingCount > 0 || queueStats.queuedCount > 0}
                  block
                  onClick={handlePickFiles}
                >
                  选择文件上传
                </Button>
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
