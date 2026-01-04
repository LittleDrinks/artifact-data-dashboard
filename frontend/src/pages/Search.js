import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input, Button, List, Card, Tag, Pagination, Spin, Empty, Alert, Modal, Table, Image, Space, Upload, message } from 'antd';
import { SearchOutlined, EnvironmentOutlined, ClockCircleOutlined, TagOutlined } from '@ant-design/icons';
import { searchArtifacts, getArtifactById, updateArtifact, deleteArtifact } from '../services/artifact.service';
import { getCurrentUser } from '../services/auth.service';
import ArtifactForm from '../components/ArtifactForm';
import axios from 'axios';
import { deleteAttachment, getAttachmentDownloadUrl, listAttachments, uploadAttachment } from '../services/attachment.service';

const { Search } = Input;

const DETAIL_FIELD_ORDER = [
  { key: 'id', label: '编号' },
  { key: 'name', label: '名称' },
  { key: 'era', label: '年代' },
  { key: 'category', label: '类别' },
  { key: 'location', label: '出土地' },
  { key: 'material', label: '材质' },
  { key: 'dimensions', label: '尺寸' },
  { key: 'weight', label: '重量' },
  { key: 'description', label: '描述' },
  { key: 'tags', label: '标签' },
  { key: 'created_at', label: '创建时间' },
  { key: 'updated_at', label: '更新时间' }
];

const DETAIL_COLUMNS = [
  {
    title: '字段',
    dataIndex: 'label',
    key: 'label',
    width: 160
  },
  {
    title: '信息',
    dataIndex: 'value',
    key: 'value',
    render: (text) => (
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>
    )
  }
];

const formatDetailValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (Array.isArray(value)) {
    return value.join('，');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch (err) {
      return String(value);
    }
  }
  return String(value);
};

const buildDetailRows = (artifact) => {
  if (!artifact) {
    return [];
  }

  const usedKeys = new Set();

  const rows = DETAIL_FIELD_ORDER.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(artifact, field.key)) {
      usedKeys.add(field.key);
      acc.push({
        key: field.key,
        label: field.label,
        value: formatDetailValue(artifact[field.key])
      });
    }
    return acc;
  }, []);

  Object.entries(artifact).forEach(([key, value]) => {
    if (usedKeys.has(key)) {
      return;
    }
    if (value === null || value === undefined || value === '') {
      return;
    }
    rows.push({
      key,
      label: key,
      value: formatDetailValue(value)
    });
  });

  return rows;
};

const ArtifactSearch = () => {
  const [user] = useState(() => getCurrentUser());
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [artifacts, setArtifacts] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  });
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailAlert, setDetailAlert] = useState(null);
  const [selectedArtifact, setSelectedArtifact] = useState(null);

  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState(null);
  const [attachments, setAttachments] = useState([]);

  const detailArtifactIdRef = useRef(null);
  const currentUploadAbortRef = useRef(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // 执行搜索
  const handleSearch = async (value = keyword, page = 1) => {
    if (!value.trim()) {
      return;
    }
    
    setLoading(true);
    setKeyword(value);
    
    try {
      const response = await searchArtifacts(value, page, pagination.pageSize);
      setArtifacts(response.data.data);
      setPagination({
        current: response.data.meta.page,
        pageSize: response.data.meta.limit,
        total: response.data.meta.total
      });
      setSearched(true);
      setError(null);
    } catch (err) {
      console.error('搜索失败:', err);
      setError('搜索失败，请稍后重试');
      setArtifacts([]);
    } finally {
      setLoading(false);
    }
  };
  
  // 页面变化处理
  const handlePageChange = (page) => {
    handleSearch(keyword, page);
  };

  const resolveArtifactId = (artifact) => {
    if (!artifact) {
      return null;
    }

    const candidateKeys = ['id', 'artifact_id', 'artifactId'];

    for (const key of candidateKeys) {
      if (!Object.prototype.hasOwnProperty.call(artifact, key)) {
        continue;
      }
      const numericValue = Number(artifact[key]);
      if (Number.isFinite(numericValue) && numericValue > 0) {
        return numericValue;
      }
    }

    return null;
  };

  const openDetailModal = async (artifact) => {
    const artifactIdFromList = resolveArtifactId(artifact);

    detailArtifactIdRef.current = artifactIdFromList;
    setAttachments([]);
    setAttachmentsError(null);

    setDetailVisible(true);
    setDetailLoading(true);
    setDetailAlert(null);
    setSelectedArtifact({
      ...artifact,
      id: artifact?.id ?? artifactIdFromList ?? undefined
    });

    if (!artifactIdFromList) {
      setDetailAlert({
        type: 'warning',
        title: '提示',
        description: '无法确定文物编号，已展示搜索结果中的基础信息。'
      });
      setDetailLoading(false);
      return;
    }

    try {
      const artifactId = artifactIdFromList;

      const response = await getArtifactById(artifactId);
      setSelectedArtifact((prev) => ({
        ...prev,
        ...response.data,
        id: response.data?.id ?? artifactId
      }));
    } catch (err) {
      console.error('获取文物详情失败:', err);
      if (err.response?.status === 404) {
        setDetailAlert({
          type: 'warning',
          title: '提示',
          description: '未找到该文物的更多详情，已展示搜索结果中的基础信息。'
        });
      } else {
        const message = err.response?.data?.message || '获取文物详情失败，请稍后重试';
        setDetailAlert({
          type: 'error',
          title: '加载失败',
          description: message
        });
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    currentUploadAbortRef.current?.();
    currentUploadAbortRef.current = null;
    setDetailVisible(false);
    setSelectedArtifact(null);
    setDetailAlert(null);
    detailArtifactIdRef.current = null;
    setAttachments([]);
    setAttachmentsError(null);
  };

  const openEditModal = () => {
    if (!isAdmin) {
      return;
    }
    if (!selectedArtifact?.id) {
      message.warning('无法确定文物编号，暂不支持编辑');
      return;
    }
    setEditOpen(true);
  };

  const handleUpdateArtifact = async (payload) => {
    if (!selectedArtifact?.id) {
      message.error('无法确定文物编号');
      return;
    }

    setEditSubmitting(true);
    try {
      const resp = await updateArtifact(selectedArtifact.id, payload);
      setSelectedArtifact((prev) => ({
        ...prev,
        ...resp.data
      }));
      message.success('保存成功');
      setEditOpen(false);
      if (keyword) {
        await handleSearch(keyword, pagination.current);
      }
    } catch (err) {
      console.error('更新文物失败:', err);
      if (err.response?.status === 403) {
        message.error('权限不足：仅管理员可编辑');
      } else {
        message.error(err.response?.data?.message || '更新失败，请稍后重试');
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteArtifact = async () => {
    if (!selectedArtifact?.id) {
      message.error('无法确定文物编号');
      return;
    }

    Modal.confirm({
      title: '确认删除',
      content: `确定要删除文物“${selectedArtifact.name || selectedArtifact.id}”吗？此操作不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteArtifact(selectedArtifact.id);
          message.success('删除成功');
          closeDetailModal();
          if (keyword) {
            await handleSearch(keyword, pagination.current);
          }
        } catch (err) {
          console.error('删除文物失败:', err);
          if (err.response?.status === 403) {
            message.error('权限不足：仅管理员可删除');
          } else {
            message.error(err.response?.data?.message || '删除失败，请稍后重试');
          }
        }
      }
    });
  };

  const detailRows = useMemo(() => buildDetailRows(selectedArtifact), [selectedArtifact]);

  const refreshAttachments = useCallback(async (artifactId) => {
    if (!artifactId) {
      setAttachments([]);
      setAttachmentsError(null);
      return;
    }
    setAttachmentsLoading(true);
    try {
      const resp = await listAttachments({ ownerType: 'artifact', ownerId: artifactId });
      if (detailArtifactIdRef.current === artifactId) {
        setAttachments(resp.data?.data || []);
        setAttachmentsError(null);
      }
    } catch (err) {
      console.error('加载附件失败:', err);
      if (detailArtifactIdRef.current === artifactId) {
        setAttachments([]);
        setAttachmentsError(err.response?.data?.message || '加载附件失败');
      }
    } finally {
      if (detailArtifactIdRef.current === artifactId) {
        setAttachmentsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const artifactId = detailArtifactIdRef.current;
    if (detailVisible && artifactId) {
      refreshAttachments(artifactId);
    } else if (!detailVisible) {
      currentUploadAbortRef.current?.();
      currentUploadAbortRef.current = null;
    }
  }, [detailVisible, selectedArtifact?.id, refreshAttachments]);

  const handleDownloadAttachment = async (row) => {
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

  const handleDeleteAttachment = async (row) => {
    if (!isAdmin) {
      message.error('权限不足：仅管理员可删除');
      return;
    }

    Modal.confirm({
      title: '确认删除附件',
      content: `确定要删除附件“${row.originalName || row.id}”吗？此操作不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteAttachment(row.id);
          message.success('删除成功');
          if (selectedArtifact?.id) {
            await refreshAttachments(selectedArtifact.id);
          }
        } catch (err) {
          console.error('删除附件失败:', err);
          if (err.response?.status === 403) {
            message.error('权限不足：仅管理员可删除');
          } else {
            message.error(err.response?.data?.message || '删除失败');
          }
        }
      }
    });
  };

  const uploadAttachmentProps = {
    multiple: true,
    maxCount: 200,
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      if (!isAdmin) {
        message.error('权限不足：仅管理员可上传');
        onError?.(new Error('forbidden'));
        return;
      }
      const artifactId = detailArtifactIdRef.current;
      if (!artifactId) {
        message.error('无法确定文物编号');
        onError?.(new Error('missing_artifact_id'));
        return;
      }
      try {
        setAttachmentsUploading(true);
        const controller = new AbortController();
        currentUploadAbortRef.current = () => controller.abort();
        const resp = await uploadAttachment({
          file,
          ownerType: 'artifact',
          ownerId: artifactId,
          signal: controller.signal
        });
        message.success('上传成功');
        onSuccess?.(resp.data);
        await refreshAttachments(artifactId);
      } catch (err) {
        console.error('上传附件失败:', err);
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
        setAttachmentsUploading(false);
        currentUploadAbortRef.current = null;
      }
    }
  };

  const attachmentColumns = useMemo(() => {
    const formatBytes = (bytes) => {
      const value = Number(bytes);
      if (!Number.isFinite(value) || value < 0) return '—';
      if (value < 1024) return `${value} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
      return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    };

    return [
      { title: 'ID', dataIndex: 'id', key: 'id', width: 90 },
      { title: '文件名', dataIndex: 'originalName', key: 'originalName' },
      { title: '类型', dataIndex: 'mimeType', key: 'mimeType', width: 180 },
      { title: '大小', dataIndex: 'sizeBytes', key: 'sizeBytes', width: 120, render: (val) => formatBytes(val) },
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
        width: isAdmin ? 200 : 120,
        render: (_, row) => (
          <Space>
            <Button size="small" onClick={() => handleDownloadAttachment(row)}>下载</Button>
            {isAdmin ? (
              <Button size="small" danger onClick={() => handleDeleteAttachment(row)}>删除</Button>
            ) : null}
          </Space>
        )
      }
    ];
  }, [handleDownloadAttachment, isAdmin]);
  
  return (
    <div className="search-container">
      <Card>
        <Search
          placeholder="请输入文物名称、描述或类别关键词"
          enterButton={<Button type="primary" icon={<SearchOutlined />}>搜索</Button>}
          size="large"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={handleSearch}
          loading={loading}
        />
        
        {error && (
          <Alert
            style={{ marginTop: 16 }}
            message="错误"
            description={error}
            type="error"
            showIcon
          />
        )}
        
        {loading ? (
          <div style={{ textAlign: 'center', margin: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: '#999' }}>搜索中...</div>
          </div>
        ) : (
          <>
            {searched && (
              <div style={{ margin: '16px 0' }}>
                {artifacts.length > 0 ? (
                  <span>找到 {pagination.total} 条结果</span>
                ) : (
                  <Empty description="未找到匹配的文物" />
                )}
              </div>
            )}
            
            {artifacts.length > 0 && (
              <>
                <List
                  itemLayout="vertical"
                  dataSource={artifacts}
                  renderItem={item => (
                    <List.Item
                      key={item.id}
                      onClick={() => openDetailModal(item)}
                      style={{ cursor: 'pointer' }}
                      extra={
                        item.image_url ? (
                          <img 
                            width={180} 
                            alt={item.name} 
                            src={item.image_url}
                            style={{ borderRadius: '4px' }}
                          />
                        ) : null
                      }
                    >
                      <List.Item.Meta
                        title={item.name}
                        description={
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', marginBottom: 8 }}>
                              <span style={{ marginRight: 24 }}>
                                <ClockCircleOutlined style={{ marginRight: 8 }} />
                                {item.era || '未知年代'}
                              </span>
                              <span>
                                <EnvironmentOutlined style={{ marginRight: 8 }} />
                                {item.location || '未知地点'}
                              </span>
                            </div>
                            <div>
                              <TagOutlined style={{ marginRight: 8 }} />
                              {item.category || '未分类'}
                            </div>
                          </div>
                        }
                      />
                      <div>{item.description}</div>
                      <div style={{ marginTop: 8 }}>
                        {item.tags && item.tags.split(',').map((tag, index) => (
                          <Tag key={index} color="blue">{tag.trim()}</Tag>
                        ))}
                      </div>
                    </List.Item>
                  )}
                />
                
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <Pagination
                    current={pagination.current}
                    pageSize={pagination.pageSize}
                    total={pagination.total}
                    onChange={handlePageChange}
                    showTotal={total => `共 ${total} 条记录`}
                  />
                </div>
              </>
            )}
          </>
        )}
      </Card>

      <Modal
        title={selectedArtifact?.name || '文物详情'}
        open={detailVisible}
        onCancel={closeDetailModal}
        footer={
          isAdmin ? (
            <Space>
              <Button onClick={openEditModal}>编辑</Button>
              <Button danger onClick={handleDeleteArtifact}>删除</Button>
            </Space>
          ) : null
        }
        width={720}
        bodyStyle={{ maxHeight: '60vh', overflowY: 'auto' }}
        destroyOnClose
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: '#999' }}>加载文物详情...</div>
          </div>
        ) : (
          <>
            {detailAlert && (
              <Alert
                type={detailAlert.type}
                showIcon
                message={detailAlert.title}
                description={detailAlert.description}
                style={{ marginBottom: 16 }}
                closable
                onClose={() => setDetailAlert(null)}
              />
            )}
            {selectedArtifact?.image_url ? (
              <div style={{ marginBottom: 16 }}>
                <Image
                  src={selectedArtifact.image_url}
                  alt={selectedArtifact?.name || '文物图片'}
                  style={{ maxWidth: '100%', borderRadius: 6 }}
                />
              </div>
            ) : null}

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>附件</div>
                {isAdmin ? (
                  <Upload {...uploadAttachmentProps}>
                    <Button size="small" type="primary" loading={attachmentsUploading}>
                      上传附件
                    </Button>
                  </Upload>
                ) : null}
              </div>

              {attachmentsError ? (
                <Alert
                  type="error"
                  showIcon
                  message="附件加载失败"
                  description={attachmentsError}
                  style={{ marginTop: 8 }}
                />
              ) : null}

              {attachmentsLoading ? (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <Spin />
                </div>
              ) : (
                <Table
                  style={{ marginTop: 8 }}
                  rowKey="id"
                  columns={attachmentColumns}
                  dataSource={attachments}
                  pagination={false}
                  size="small"
                  locale={{ emptyText: '暂无附件' }}
                />
              )}
            </div>

            {selectedArtifact ? (
              detailRows.length > 0 ? (
                <Table
                  columns={DETAIL_COLUMNS}
                  dataSource={detailRows}
                  pagination={false}
                  rowKey={(record) => record.key}
                  size="small"
                />
              ) : (
                <Empty description="暂无可展示的数据" />
              )
            ) : (
              <Empty description="暂无文物详情" />
            )}
          </>
        )}
      </Modal>

      <ArtifactForm
        open={editOpen}
        title="编辑文物"
        initialValues={selectedArtifact || {}}
        submitting={editSubmitting}
        onCancel={() => setEditOpen(false)}
        onSubmit={handleUpdateArtifact}
      />
    </div>
  );
};

export default ArtifactSearch;
