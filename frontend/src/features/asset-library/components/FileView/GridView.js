import React from 'react';
import { Row, Col, Empty } from 'antd';
import FileCard from './FileCard';

const GridView = ({
  files,
  isSelectionMode,
  selectedFileIds,
  getThumbnailUrl,
  onToggleFileSelection,
  onDownloadFile,
  onDeleteFile
}) => {
  if (files.length === 0) {
    return <Empty description="暂无文件" />;
  }

  return (
    <Row gutter={[16, 16]}>
      {files.map(file => (
        <Col key={file.id} xs={12} sm={8} md={6} lg={4} xl={3}>
          <FileCard
            file={file}
            isSelectionMode={isSelectionMode}
            isSelected={selectedFileIds.has(file.id)}
            getThumbnailUrl={getThumbnailUrl}
            onToggleSelection={onToggleFileSelection}
            onDownload={onDownloadFile}
            onDelete={onDeleteFile}
          />
        </Col>
      ))}
    </Row>
  );
};

export default GridView;
