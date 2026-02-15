import React from 'react';
import { Layout, Spin, Pagination } from 'antd';
import FolderTree from '../components/AssetLibrary/FolderTree';
import { useAssets, FileToolbar, GridView, ListView } from '../features/asset-library';

const { Sider, Content } = Layout;

const AssetLibrary = () => {
  const {
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
  } = useAssets();

  const FileViewComponent = viewMode === 'grid' ? GridView : ListView;

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
          fileInputRef={fileInputRef}
          uploading={uploading}
          uploadProgress={uploadProgress}
          isSelectionMode={isSelectionMode}
          selectedFileIds={selectedFileIds}
          batchDeleting={batchDeleting}
          isAllSelected={isAllSelected}
          viewMode={viewMode}
          selectedFolderId={selectedFolderId}
          onUploadClick={handleUploadClick}
          onFileChange={handleFileChange}
          onCreateFolder={handleCreateFolder}
          onToggleSelectionMode={toggleSelectionMode}
          onSelectAll={handleSelectAll}
          onBatchDelete={handleBatchDelete}
          onRefresh={handleRefresh}
          onViewModeChange={setViewMode}
        />

        <Spin spinning={loadingFiles}>
          <div style={{ minHeight: 400 }}>
            <FileViewComponent
              files={files}
              isSelectionMode={isSelectionMode}
              selectedFileIds={selectedFileIds}
              getThumbnailUrl={getThumbnailUrl}
              onToggleFileSelection={toggleFileSelection}
              onDownloadFile={handleDownloadFile}
              onDeleteFile={handleDeleteFile}
            />
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
