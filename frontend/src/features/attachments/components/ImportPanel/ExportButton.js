import React, { useState } from 'react';
import { Card, Button, message } from 'antd';
import { exportKnowledgeGraphExcel } from '../../../../services/attachment.service';

const ExportButton = ({ isAdmin, onSuccess }) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    try {
      if (!isAdmin) {
        message.error('权限不足：仅管理员可导出');
        return;
      }

      setLoading(true);
      const resp = await exportKnowledgeGraphExcel();
      const attachmentId = resp.data?.id;
      message.success(attachmentId ? `导出成功，已生成附件 #${attachmentId}` : '导出成功');
      onSuccess?.();
    } catch (err) {
      if (err.response?.status === 403) {
        message.error('权限不足：仅管理员可导出');
      } else {
        message.error(err.response?.data?.message || '导出失败');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card size="small" title="知识图谱 Excel 导出" bodyStyle={{ padding: 12 }}>
      <Button onClick={handleExport} loading={loading} block>
        导出知识图谱Excel（生成附件）
      </Button>
    </Card>
  );
};

export default ExportButton;
