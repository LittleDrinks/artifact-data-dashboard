/**
 * AssetLibrary - 资产库主页面
 * 左侧文件夹树 + 右侧资产网格/列表视图
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Layout, Card, Row, Col, Button, Space, message, Spin, Empty, Segmented, Tooltip, Progress, Popconfirm, Checkbox, Pagination } from 'antd';
import {
  AppstoreOutlined,
  UnorderedListOutlined,
  UploadOutlined,
  ReloadOutlined,
  FolderAddOutlined,
  DeleteOutlined,
  DownloadOutlined,
  CheckSquareOutlined,
  CloseSquareOutlined
} from '@ant-design/icons';
import FolderTree from '../components/AssetLibrary/FolderTree';
import axios from 'axios';
import { uploadAttachment, deleteAttachment, getAttachmentDownloadUrl, batchDeleteAttachments } from '../services/attachment.service';

const { Sider, Content } = Layout;

const AssetLibrary = () => {
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  
  // 上传相关状态
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // 多选相关状态
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  // 获取认证 token
  const getAuthToken = useCallback(() => {
    return localStorage.getItem('token') || '';
  }, []);

  // 生成带认证的缩略图 URL
  const getThumbnailUrl = useCallback((fileId, size = 'small') => {
    const token = getAuthToken();
    return `/api/attachments/${fileId}/thumbnail?size=${size}&token=${encodeURIComponent(token)}`;
  }, [getAuthToken]);

  // 加载文件夹列表
  const loadFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const response = await axios.get('/api/folders', { params: { flat: true } });
      setFolders(response.data.data || []);
    } catch (err) {
      message.error('加载文件夹失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  // 加载文件列表
  const loadFiles = useCallback(async (folderId, page = 1, pageSize = null) => {
    setLoadingFiles(true);
    const limit = pageSize || pagination.limit;
    try {
      const endpoint = folderId ? `/api/folders/${folderId}/files` : '/api/folders/root/files';
      const response = await axios.get(endpoint, {
        params: { page, limit }
      });
      setFiles(response.data.data || []);
      setPagination(prev => ({
        ...prev,
        page,
        limit,
        total: response.data.total || 0
      }));
    } catch (err) {
      message.error('加载文件失败: ' + (err.response?.data?.error || err.message));
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }, [pagination.limit]);

  // 初始加载
  useEffect(() => {
    loadFolders();
    loadFiles(null);
  }, [loadFolders, loadFiles]);

  // 选择文件夹
  const handleSelectFolder = (folderId) => {
    setSelectedFolderId(folderId);
    loadFiles(folderId);
  };

  // 创建文件夹
  const handleCreateFolder = async (name, parentId) => {
    try {
      await axios.post('/api/folders', { name, parentId });
      message.success('文件夹创建成功');
      loadFolders();
    } catch (err) {
      throw new Error(err.response?.data?.error || '创建失败');
    }
  };

  // 重命名文件夹
  const handleRenameFolder = async (id, name) => {
    try {
      await axios.put(`/api/folders/${id}`, { name });
      message.success('重命名成功');
      loadFolders();
    } catch (err) {
      throw new Error(err.response?.data?.error || '重命名失败');
    }
  };

  // 删除文件夹
  const handleDeleteFolder = async (id) => {
    try {
      const response = await axios.delete(`/api/folders/${id}`);
      message.success(`文件夹已删除，${response.data.affectedFiles} 个文件移至根目录`);
      loadFolders();
      if (selectedFolderId === id) {
        setSelectedFolderId(null);
        loadFiles(null);
      }
    } catch (err) {
      message.error(err.response?.data?.error || '删除失败');
    }
  };

  // 移动文件夹
  const handleMoveFolder = async (id, newParentId) => {
    try {
      await axios.put(`/api/folders/${id}/move`, { parentId: newParentId });
      message.success('文件夹移动成功');
      loadFolders();
    } catch (err) {
      message.error(err.response?.data?.error || '移动失败');
    }
  };

  // 刷新
  const handleRefresh = () => {
    loadFolders();
    loadFiles(selectedFolderId);
    setSelectedFileIds(new Set());
  };

  // 切换选择模式
  const toggleSelectionMode = () => {
    setIsSelectionMode(prev => !prev);
    if (isSelectionMode) {
      setSelectedFileIds(new Set());
    }
  };

  // 切换文件选择
  const toggleFileSelection = (fileId) => {
    setSelectedFileIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedFileIds.size === files.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(files.map(f => f.id)));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedFileIds.size === 0) {
      message.warning('请先选择要删除的文件');
      return;
    }

    setBatchDeleting(true);
    try {
      const ids = Array.from(selectedFileIds);
      await batchDeleteAttachments(ids);
      message.success(`成功删除 ${ids.length} 个文件`);
      setSelectedFileIds(new Set());
      
      // 计算新的总数和需要加载的页码
      const newTotal = Math.max(0, pagination.total - ids.length);
      const maxPage = Math.ceil(newTotal / pagination.limit) || 1;
      const targetPage = pagination.page > maxPage ? maxPage : pagination.page;
      
      // 重新加载数据以确保显示正确
      await loadFiles(selectedFolderId, targetPage, pagination.limit);
    } catch (err) {
      message.error(`批量删除失败: ${err.response?.data?.message || err.message}`);
      await loadFiles(selectedFolderId);
    } finally {
      setBatchDeleting(false);
    }
  };

  // 分页切换
  const handlePageChange = (page, pageSize) => {
    setPagination(prev => ({ ...prev, page, limit: pageSize }));
    loadFiles(selectedFolderId, page, pageSize);
    setSelectedFileIds(new Set());
  };

  // 是否全选
  const isAllSelected = useMemo(() => {
    return files.length > 0 && selectedFileIds.size === files.length;
  }, [files.length, selectedFileIds.size]);

  // 删除文件
  const handleDeleteFile = async (fileId) => {
    try {
      await deleteAttachment(fileId);
      message.success('文件删除成功');
      
      // 计算新的总数和需要加载的页码
      const newTotal = Math.max(0, pagination.total - 1);
      const maxPage = Math.ceil(newTotal / pagination.limit) || 1;
      const targetPage = pagination.page > maxPage ? maxPage : pagination.page;
      
      // 如果当前页只有一条数据且不是第一页，回到上一页
      if (files.length === 1 && pagination.page > 1) {
        await loadFiles(selectedFolderId, pagination.page - 1, pagination.limit);
      } else {
        // 重新加载当前页
        await loadFiles(selectedFolderId, targetPage, pagination.limit);
      }
    } catch (err) {
      message.error(`删除失败: ${err.response?.data?.message || err.message}`);
      await loadFiles(selectedFolderId);
    }
  };

  // 下载文件
  const handleDownloadFile = async (file) => {
    try {
      const url = getAttachmentDownloadUrl(file.id);
      const response = await axios.get(url, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = file.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      message.error(`下载失败: ${err.response?.data?.message || err.message}`);
    }
  };

  // 点击上传按钮
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 文件选择变化
  const handleFileChange = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) return;
    
    setUploading(true);
    setUploadProgress(0);
    
    let completed = 0;
    const total = selectedFiles.length;
    
    for (const file of selectedFiles) {
      try {
        await uploadAttachment({
          file,
          folderId: selectedFolderId || null,
          onUploadProgress: (evt) => {
            const fileProgress = evt.total > 0 ? (evt.loaded / evt.total) * 100 : 0;
            const overallProgress = ((completed + fileProgress / 100) / total) * 100;
            setUploadProgress(Math.round(overallProgress));
          }
        });
        completed++;
        setUploadProgress(Math.round((completed / total) * 100));
      } catch (err) {
        message.error(`上传失败: ${file.name} - ${err.response?.data?.message || err.message}`);
      }
    }
    
    setUploading(false);
    setUploadProgress(0);
    event.target.value = '';
    
    if (completed > 0) {
      message.success(`成功上传 ${completed} 个文件`);
      loadFiles(selectedFolderId);
    }
  };

  // 渲染网格视图
  const renderGridView = () => {
    if (files.length === 0) {
      return <Empty description="暂无文件" />;
    }

    return (
      <Row gutter={[16, 16]}>
        {files.map(file => (
          <Col key={file.id} xs={12} sm={8} md={6} lg={4} xl={3}>
            <Card
              hoverable
              size="small"
              style={selectedFileIds.has(file.id) ? { border: '2px solid #1890ff' } : {}}
              onClick={() => {
                if (isSelectionMode) {
                  toggleFileSelection(file.id);
                }
              }}
              cover={
                file.mimeType?.startsWith('image/') ? (
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
                        checked={selectedFileIds.has(file.id)}
                        style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleFileSelection(file.id)}
                      />
                    )}
                    <img
                      alt={file.originalName}
                      src={getThumbnailUrl(file.id, 'small')}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                    {!isSelectionMode && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadFile(file);
                          }}
                        />
                        <Popconfirm
                          title="删除文件"
                          description="确定要删除此文件吗？"
                          onConfirm={() => handleDeleteFile(file.id)}
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
                ) : (
                  <div style={{ 
                    height: 120, 
                    background: '#f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 48,
                    color: '#999',
                    position: 'relative'
                  }}>
                    {isSelectionMode && (
                      <Checkbox
                        checked={selectedFileIds.has(file.id)}
                        style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleFileSelection(file.id)}
                      />
                    )}
                    📄
                    {!isSelectionMode && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadFile(file);
                          }}
                        />
                        <Popconfirm
                          title="删除文件"
                          description="确定要删除此文件吗？"
                          onConfirm={() => handleDeleteFile(file.id)}
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
                )
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
          </Col>
        ))}
      </Row>
    );
  };

  // 渲染列表视图
  const renderListView = () => {
    if (files.length === 0) {
      return <Empty description="暂无文件" />;
    }

    return (
      <div className="file-list">
        {files.map(file => (
          <div
            key={file.id}
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              background: selectedFileIds.has(file.id) ? '#e6f7ff' : 'transparent',
              cursor: isSelectionMode ? 'pointer' : 'default'
            }}
            onClick={() => {
              if (isSelectionMode) {
                toggleFileSelection(file.id);
              }
            }}
          >
            {isSelectionMode && (
              <Checkbox
                checked={selectedFileIds.has(file.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleFileSelection(file.id)}
              />
            )}
            <span style={{ fontSize: 24 }}>
              {file.mimeType?.startsWith('image/') ? '🖼️' : '📄'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {file.originalName}
              </div>
              <div style={{ color: '#999', fontSize: 12 }}>
                {formatFileSize(file.sizeBytes)} · {file.mimeType}
              </div>
            </div>
            <div style={{ color: '#999', fontSize: 12, flex: '0 0 auto' }}>
              {new Date(file.createdAt).toLocaleDateString()}
            </div>
            {!isSelectionMode && (
              <Space style={{ flex: '0 0 auto' }}>
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => handleDownloadFile(file)}
                >
                  下载
                </Button>
                <Popconfirm
                  title="删除文件"
                  description="确定要删除此文件吗？"
                  onConfirm={() => handleDeleteFile(file.id)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                  >
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#fff' }}>
      <Sider
        width={260}
        style={{
          background: '#fff',
          borderRight: '1px solid #f0f0f0',
          padding: '16px'
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>资产库</h3>
        </div>
        <FolderTree
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelect={handleSelectFolder}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveFolder={handleMoveFolder}
          loading={loadingFolders}
        />
      </Sider>
      <Content style={{ padding: '16px 24px' }}>
        {/* 工具栏 */}
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Space wrap>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              multiple
              onChange={handleFileChange}
            />
            <Button 
              icon={<UploadOutlined />} 
              type="primary"
              onClick={handleUploadClick}
              loading={uploading}
              disabled={isSelectionMode}
            >
              上传文件
            </Button>
            <Button 
              icon={<FolderAddOutlined />} 
              onClick={() => handleCreateFolder('新建文件夹', selectedFolderId)}
              disabled={isSelectionMode}
            >
              新建文件夹
            </Button>
            <Button
              icon={isSelectionMode ? <CloseSquareOutlined /> : <CheckSquareOutlined />}
              onClick={toggleSelectionMode}
              type={isSelectionMode ? 'primary' : 'default'}
            >
              {isSelectionMode ? '取消选择' : '多选'}
            </Button>
            {isSelectionMode && (
              <>
                <Button onClick={handleSelectAll}>
                  {isAllSelected ? '取消全选' : '全选'}
                </Button>
                <Popconfirm
                  title="批量删除"
                  description={`确定要删除选中的 ${selectedFileIds.size} 个文件吗？`}
                  onConfirm={handleBatchDelete}
                  okText="确定"
                  cancelText="取消"
                  disabled={selectedFileIds.size === 0}
                >
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    disabled={selectedFileIds.size === 0}
                    loading={batchDeleting}
                  >
                    删除 ({selectedFileIds.size})
                  </Button>
                </Popconfirm>
              </>
            )}
            {uploading && (
              <Progress percent={uploadProgress} size="small" style={{ width: 120 }} />
            )}
          </Space>
          <Space>
            <Segmented
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'grid', icon: <AppstoreOutlined /> },
                { value: 'list', icon: <UnorderedListOutlined /> }
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
              刷新
            </Button>
          </Space>
        </div>

        {/* 文件列表 */}
        <Spin spinning={loadingFiles}>
          <div style={{ minHeight: 400 }}>
            {viewMode === 'grid' ? renderGridView() : renderListView()}
          </div>
        </Spin>

        {/* 分页 */}
        {pagination.total > 0 && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#999' }}>共 {pagination.total} 个文件</span>
            <Pagination
              current={pagination.page}
              pageSize={pagination.limit}
              total={pagination.total}
              onChange={handlePageChange}
              showSizeChanger
              showQuickJumper
              pageSizeOptions={['20', '50', '100', '200']}
              showTotal={(total, range) => `${range[0]}-${range[1]} / ${total}`}
            />
          </div>
        )}
      </Content>
    </Layout>
  );
};

// 格式化文件大小
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

export default AssetLibrary;
