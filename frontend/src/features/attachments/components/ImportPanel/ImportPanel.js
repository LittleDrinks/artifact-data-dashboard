import React from 'react';
import { Card, Space } from 'antd';
import { ImportOutlined } from '@ant-design/icons';
import ExcelImport from './ExcelImport';
import LinkImport from './LinkImport';
import DirImport from './DirImport';
import ExportButton from './ExportButton';

const ImportPanel = ({ isAdmin, ownerType, ownerId, onImportSuccess, onExportSuccess }) => {
  return (
    <Card title={<><ImportOutlined /> 导入/导出</>}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <ExcelImport isAdmin={isAdmin} onSuccess={onImportSuccess} />
        <LinkImport isAdmin={isAdmin} onSuccess={onImportSuccess} />
        <DirImport isAdmin={isAdmin} ownerType={ownerType} ownerId={ownerId} onSuccess={onImportSuccess} />
        <ExportButton isAdmin={isAdmin} ownerType={ownerType} ownerId={ownerId} onSuccess={onExportSuccess} />
      </Space>
    </Card>
  );
};

export default ImportPanel;
