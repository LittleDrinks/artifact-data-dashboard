import React from 'react';
import { Button, Space, Progress, Popconfirm, Segmented, Tooltip } from 'antd';
import {
  UploadOutlined,
  ReloadOutlined,
  FolderAddOutlined,
  DeleteOutlined,
  CheckSquareOutlined,
  CloseSquareOutlined,
  AppstoreOutlined,
  UnorderedListOutlined
} from '@ant-design/icons';

const FileToolbar = ({
  fileInputRef,
  uploading,
  uploadProgress,
  isSelectionMode,
  selectedFileIds,
  batchDeleting,
  isAllSelected,
  viewMode,
  selectedFolderId,
  onUploadClick,
  onFileChange,
  onCreateFolder,
  onToggleSelectionMode,
  onSelectAll,
  onBatchDelete,
  onRefresh,
  onViewModeChange
}) => {
  return (
    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <Space wrap>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          multiple
          onChange={onFileChange}
        />
        <Button
          icon={<UploadOutlined />}
          type="primary"
          onClick={onUploadClick}
          loading={uploading}
          disabled={isSelectionMode}
        >
          上传文件
        </Button>
        <Button
          icon={<FolderAddOutlined />}
          onClick={() => onCreateFolder('新建文件夹', selectedFolderId)}
          disabled={isSelectionMode}
        >
          新建文件夹
        </Button>
        <Button
          icon={isSelectionMode ? <CloseSquareOutlined /> : <CheckSquareOutlined />}
          onClick={onToggleSelectionMode}
          type={isSelectionMode ? 'primary' : 'default'}
        >
          {isSelectionMode ? '取消选择' : '多选'}
        </Button>
        {isSelectionMode && (
          <>
            <Button onClick={onSelectAll}>
              {isAllSelected ? '取消全选' : '全选'}
            </Button>
            <Popconfirm
              title="批量删除"
              description={`确定要删除选中的 ${selectedFileIds.size} 个文件吗？`}
              onConfirm={onBatchDelete}
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
          onChange={onViewModeChange}
          options={[
            { value: 'grid', icon: <AppstoreOutlined /> },
            { value: 'list', icon: <UnorderedListOutlined /> }
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={onRefresh}>
          刷新
        </Button>
      </Space>
    </div>
  );
};

export default FileToolbar;
