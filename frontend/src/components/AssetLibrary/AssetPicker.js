/**
 * 资产选择器组件
 * 用于在表单中选择或上传资产文件
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Tabs, Upload, Space, Input, Empty, Spin, message, Card, Checkbox, Image } from 'antd';
import { 
  FolderOutlined, 
  PictureOutlined, 
  UploadOutlined, 
  SearchOutlined,
  CheckCircleFilled
} from '@ant-design/icons';
import axios from 'axios';
import FolderTree from './FolderTree';
import TagFilter from './TagFilter';
import './AssetPicker.css';

const { TabPane } = Tabs;
const { Search } = Input;

const AssetPicker = ({
  visible,
  onClose,
  onSelect,
  multiple = false,
  accept = 'image/*',
  maxCount = 10,
  defaultFolder = null,
  title = '选择资产'
}) => {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(defaultFolder);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeTab, setActiveTab] = useState('browse');
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // 加载文件夹
  const loadFolders = useCallback(async () => {
    try {
      const response = await axios.get('/api/folders');
      setFolders(response.data);
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  }, []);

  // 加载文件
  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedFolder) {
        params.append('folderId', selectedFolder);
      }
      if (selectedTags.length > 0) {
        params.append('tagIds', selectedTags.join(','));
      }
      if (searchKeyword) {
        params.append('search', searchKeyword);
      }
      params.append('limit', '100');

      const response = await axios.get(`/api/attachments?${params.toString()}`);
      setFiles(response.data.data || []);
    } catch (error) {
      console.error('Failed to load files:', error);
      message.error('加载文件失败');
    } finally {
      setLoading(false);
    }
  }, [selectedFolder, selectedTags, searchKeyword]);

  useEffect(() => {
    if (visible) {
      loadFolders();
      loadFiles();
    }
  }, [visible, loadFolders, loadFiles]);

  useEffect(() => {
    if (visible) {
      loadFiles();
    }
  }, [selectedFolder, selectedTags, visible, loadFiles]);

  // 切换文件选中状态
  const toggleFileSelection = (file) => {
    if (multiple) {
      const isSelected = selectedFiles.some(f => f.id === file.id);
      if (isSelected) {
        setSelectedFiles(selectedFiles.filter(f => f.id !== file.id));
      } else {
        if (selectedFiles.length >= maxCount) {
          message.warning(`最多只能选择 ${maxCount} 个文件`);
          return;
        }
        setSelectedFiles([...selectedFiles, file]);
      }
    } else {
      setSelectedFiles([file]);
    }
  };

  // 确认选择
  const handleConfirm = () => {
    if (selectedFiles.length === 0) {
      message.warning('请选择至少一个文件');
      return;
    }
    onSelect(multiple ? selectedFiles : selectedFiles[0]);
    handleClose();
  };

  // 关闭弹窗
  const handleClose = () => {
    setSelectedFiles([]);
    setSearchKeyword('');
    setActiveTab('browse');
    setUploadedFiles([]);
    onClose();
  };

  // 搜索
  const handleSearch = (value) => {
    setSearchKeyword(value);
  };

  // 上传配置
  const uploadProps = {
    name: 'file',
    action: '/api/attachments/upload',
    accept,
    multiple,
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    },
    onChange: (info) => {
      if (info.file.status === 'done') {
        const newFile = info.file.response;
        setUploadedFiles(prev => [...prev, newFile]);
        message.success(`${info.file.name} 上传成功`);
      } else if (info.file.status === 'error') {
        message.error(`${info.file.name} 上传失败`);
      }
    }
  };

  // 选择上传的文件并确认
  const handleSelectUploaded = () => {
    if (uploadedFiles.length === 0) {
      message.warning('请先上传文件');
      return;
    }
    onSelect(multiple ? uploadedFiles : uploadedFiles[0]);
    handleClose();
  };

  // 渲染文件卡片
  const renderFileCard = (file) => {
    const isSelected = selectedFiles.some(f => f.id === file.id);
    const isImage = file.mimeType?.startsWith('image/');

    return (
      <Card
        key={file.id}
        className={`asset-card ${isSelected ? 'selected' : ''}`}
        hoverable
        onClick={() => toggleFileSelection(file)}
        cover={
          isImage ? (
            <div className="asset-image-container">
              <Image
                src={file.downloadUrl}
                alt={file.originalName}
                preview={false}
                fallback="/placeholder.png"
              />
              {isSelected && (
                <div className="selected-overlay">
                  <CheckCircleFilled className="selected-icon" />
                </div>
              )}
            </div>
          ) : (
            <div className="asset-file-icon">
              <PictureOutlined style={{ fontSize: 48, color: '#999' }} />
              {isSelected && (
                <div className="selected-overlay">
                  <CheckCircleFilled className="selected-icon" />
                </div>
              )}
            </div>
          )
        }
      >
        <Card.Meta
          title={
            <span className="asset-name" title={file.originalName}>
              {file.originalName}
            </span>
          }
          description={
            <span className="asset-size">
              {formatFileSize(file.sizeBytes)}
            </span>
          }
        />
        {multiple && (
          <Checkbox
            checked={isSelected}
            className="asset-checkbox"
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleFileSelection(file)}
          />
        )}
      </Card>
    );
  };

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={handleClose}
      width={900}
      footer={
        <Space>
          <Button onClick={handleClose}>取消</Button>
          {activeTab === 'browse' ? (
            <Button 
              type="primary" 
              onClick={handleConfirm}
              disabled={selectedFiles.length === 0}
            >
              确认选择 {selectedFiles.length > 0 && `(${selectedFiles.length})`}
            </Button>
          ) : (
            <Button 
              type="primary" 
              onClick={handleSelectUploaded}
              disabled={uploadedFiles.length === 0}
            >
              使用上传的文件 {uploadedFiles.length > 0 && `(${uploadedFiles.length})`}
            </Button>
          )}
        </Space>
      }
      className="asset-picker-modal"
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane 
          tab={<span><FolderOutlined /> 浏览资产库</span>} 
          key="browse"
        >
          <div className="asset-picker-content">
            <div className="asset-picker-sidebar">
              <div className="sidebar-section">
                <h4>文件夹</h4>
                <FolderTree
                  folders={folders}
                  selectedFolder={selectedFolder}
                  onSelect={setSelectedFolder}
                  onUpdate={loadFolders}
                  compact
                />
              </div>
              <div className="sidebar-section">
                <TagFilter
                  selectedTags={selectedTags}
                  onTagsChange={setSelectedTags}
                />
              </div>
            </div>
            <div className="asset-picker-main">
              <div className="asset-picker-toolbar">
                <Search
                  placeholder="搜索文件名..."
                  allowClear
                  onSearch={handleSearch}
                  style={{ width: 250 }}
                  prefix={<SearchOutlined />}
                />
                <span className="file-count">
                  共 {files.length} 个文件
                </span>
              </div>
              <div className="asset-grid">
                {loading ? (
                  <div className="loading-container">
                    <Spin tip="加载中..." />
                  </div>
                ) : files.length === 0 ? (
                  <Empty description="暂无文件" />
                ) : (
                  files.map(file => renderFileCard(file))
                )}
              </div>
            </div>
          </div>
        </TabPane>
        <TabPane 
          tab={<span><UploadOutlined /> 上传新文件</span>} 
          key="upload"
        >
          <div className="upload-container">
            <Upload.Dragger {...uploadProps}>
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
              <p className="ant-upload-hint">
                {multiple 
                  ? `支持批量上传，最多 ${maxCount} 个文件` 
                  : '一次上传一个文件'}
              </p>
            </Upload.Dragger>
            {uploadedFiles.length > 0 && (
              <div className="uploaded-files">
                <h4>已上传的文件：</h4>
                <div className="uploaded-grid">
                  {uploadedFiles.map(file => (
                    <Card key={file.id} size="small" className="uploaded-card">
                      <PictureOutlined style={{ marginRight: 8 }} />
                      {file.originalName}
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabPane>
      </Tabs>
    </Modal>
  );
};

// 格式化文件大小
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default AssetPicker;
