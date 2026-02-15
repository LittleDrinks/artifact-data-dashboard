import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { message } from 'antd';
import { uploadAttachment, deleteAttachment, getAttachmentDownloadUrl, batchDeleteAttachments } from '../../../services/attachment.service';

export const useAssets = () => {
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const fileInputRef = useRef(null);

  const getAuthToken = useCallback(() => {
    return localStorage.getItem('token') || '';
  }, []);

  const getThumbnailUrl = useCallback((fileId, size = 'small') => {
    const token = getAuthToken();
    return `/api/attachments/${fileId}/thumbnail?size=${size}&token=${encodeURIComponent(token)}`;
  }, [getAuthToken]);

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

  const loadFiles = useCallback(async (folderId, page = 1, pageSize = null) => {
    setLoadingFiles(true);
    const limit = pageSize || pagination.limit;
    try {
      const endpoint = folderId ? `/api/folders/${folderId}/files` : '/api/folders/root/files';
      const response = await axios.get(endpoint, { params: { page, limit } });
      setFiles(response.data.data || []);
      setPagination(prev => ({ ...prev, page, limit, total: response.data.total || 0 }));
    } catch (err) {
      message.error('加载文件失败: ' + (err.response?.data?.error || err.message));
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }, [pagination.limit]);

  useEffect(() => {
    loadFolders();
    loadFiles(null);
  }, [loadFolders, loadFiles]);

  const handleSelectFolder = useCallback((folderId) => {
    setSelectedFolderId(folderId);
    loadFiles(folderId);
  }, [loadFiles]);

  const handleCreateFolder = useCallback(async (name, parentId) => {
    try {
      await axios.post('/api/folders', { name, parentId });
      message.success('文件夹创建成功');
      loadFolders();
    } catch (err) {
      throw new Error(err.response?.data?.error || '创建失败');
    }
  }, [loadFolders]);

  const handleRenameFolder = useCallback(async (id, name) => {
    try {
      await axios.put(`/api/folders/${id}`, { name });
      message.success('重命名成功');
      loadFolders();
    } catch (err) {
      throw new Error(err.response?.data?.error || '重命名失败');
    }
  }, [loadFolders]);

  const handleDeleteFolder = useCallback(async (id) => {
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
  }, [loadFolders, loadFiles, selectedFolderId]);

  const handleMoveFolder = useCallback(async (id, newParentId) => {
    try {
      await axios.put(`/api/folders/${id}/move`, { parentId: newParentId });
      message.success('文件夹移动成功');
      loadFolders();
    } catch (err) {
      message.error(err.response?.data?.error || '移动失败');
    }
  }, [loadFolders]);

  const handleRefresh = useCallback(() => {
    loadFolders();
    loadFiles(selectedFolderId);
    setSelectedFileIds(new Set());
  }, [loadFolders, loadFiles, selectedFolderId]);

  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode(prev => {
      if (prev) setSelectedFileIds(new Set());
      return !prev;
    });
  }, []);

  const toggleFileSelection = useCallback((fileId) => {
    setSelectedFileIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedFileIds(prev => 
      prev.size === files.length ? new Set() : new Set(files.map(f => f.id))
    );
  }, [files]);

  const isAllSelected = useMemo(() => 
    files.length > 0 && selectedFileIds.size === files.length,
    [files.length, selectedFileIds.size]
  );

  const handleDeleteFile = useCallback(async (fileId) => {
    try {
      await deleteAttachment(fileId);
      message.success('文件删除成功');
      const newTotal = Math.max(0, pagination.total - 1);
      const maxPage = Math.ceil(newTotal / pagination.limit) || 1;
      const targetPage = pagination.page > maxPage ? maxPage : pagination.page;
      
      if (files.length === 1 && pagination.page > 1) {
        await loadFiles(selectedFolderId, pagination.page - 1, pagination.limit);
      } else {
        await loadFiles(selectedFolderId, targetPage, pagination.limit);
      }
    } catch (err) {
      message.error(`删除失败: ${err.response?.data?.message || err.message}`);
      await loadFiles(selectedFolderId);
    }
  }, [loadFiles, pagination, files.length, selectedFolderId]);

  const handleDownloadFile = useCallback(async (file) => {
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
  }, []);

  const handleBatchDelete = useCallback(async () => {
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
      const newTotal = Math.max(0, pagination.total - ids.length);
      const maxPage = Math.ceil(newTotal / pagination.limit) || 1;
      const targetPage = pagination.page > maxPage ? maxPage : pagination.page;
      await loadFiles(selectedFolderId, targetPage, pagination.limit);
    } catch (err) {
      message.error(`批量删除失败: ${err.response?.data?.message || err.message}`);
      await loadFiles(selectedFolderId);
    } finally {
      setBatchDeleting(false);
    }
  }, [selectedFileIds, pagination, loadFiles, selectedFolderId]);

  const handlePageChange = useCallback((page, pageSize) => {
    setPagination(prev => ({ ...prev, page, limit: pageSize }));
    loadFiles(selectedFolderId, page, pageSize);
    setSelectedFileIds(new Set());
  }, [loadFiles, selectedFolderId]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (event) => {
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
  }, [loadFiles, selectedFolderId]);

  return {
    folders,
    files,
    selectedFolderId,
    viewMode,
    setViewMode,
    loadingFolders,
    loadingFiles,
    pagination,
    uploading,
    uploadProgress,
    selectedFileIds,
    isSelectionMode,
    batchDeleting,
    fileInputRef,
    isAllSelected,
    getThumbnailUrl,
    handleSelectFolder,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveFolder,
    handleRefresh,
    toggleSelectionMode,
    toggleFileSelection,
    handleSelectAll,
    handleDeleteFile,
    handleDownloadFile,
    handleBatchDelete,
    handlePageChange,
    handleUploadClick,
    handleFileChange,
  };
};

export default useAssets;
