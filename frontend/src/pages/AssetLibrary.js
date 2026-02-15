import React, { useState } from 'react';
import { Layout, Spin, Pagination } from 'antd';
import FolderTree from '../components/AssetLibrary/FolderTree';
import { useAssets } from '../features/asset-library/hooks/useAssets';
import FileToolbar from '../features/asset-library/components/FileToolbar';
import GridView from '../features/asset-library/components/FileView/GridView';
import ListView from '../features/asset-library/components/FileView/ListView';

const { Sider, Content } = Layout;

const AssetLibrary = () => {
  const [viewMode, setViewMode] = useState('grid');
  
  const {
    folders,
    files,
    selectedFolderId,
    loadingFolders,
    loadingFiles,
    pagination,
    fileInputRef,
    uploading,
    uploadProgress,
    selectedFileIds,
    isSelectionMode,
    batchDeleting,
    isAllSelected,
    handleSelectFolder,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveFolder,
    handleDeleteFile,
    handleDownloadFile,
    handleUploadClick,
    handleFileChange,
    getThumbnailUrl,
    toggleSelectionMode,
    toggleFileSelection,
    handleSelectAll,
    handleBatchDelete,
    handleRefresh,
    handlePageChange,
  } = useAssets();

  const renderFileView = () => {
    if (viewMode === 'grid') {
      return (
        <GridView
          files={files}
          isSelectionMode={isSelectionMode}
          selectedFileIds={selectedFileIds}
          onToggleSelection={toggleFileSelection}
          getThumbnailUrl={getThumbnailUrl}
          onDownload={handleDownloadFile}
          onDelete={handleDeleteFile}
        />
      );
    }
    return (
      <ListView
        files={files}
        isSelectionMode={isSelectionMode}
        selectedFileIds={selectedFileIds}
        onToggleSelection={toggleFileSelection}
        onDownload={handleDownloadFile}
        onDelete={handleDeleteFile}
      />
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
        <FileToolbar
          selectedFolderId={selectedFolderId}
          uploading={uploading}
          uploadProgress={uploadProgress}
          fileInputRef={fileInputRef}
          onUploadClick={handleUploadClick}
          onFileChange={handleFileChange}
          onCreateFolder={handleCreateFolder}
          isSelectionMode={isSelectionMode}
          onToggleSelectionMode={toggleSelectionMode}
          selectedFileIds={selectedFileIds}
          isAllSelected={isAllSelected}
          onSelectAll={handleSelectAll}
          onBatchDelete={handleBatchDelete}
          batchDeleting={batchDeleting}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onRefresh={handleRefresh}
        />

        <Spin spinning={loadingFiles}>
          <div style={{ minHeight: 400 }}>
            {renderFileView()}
          </div>
        </Spin>

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

export default AssetLibrary;
