import React, { useState } from 'react';
import { Card, Button, Upload, Space, message } from 'antd';
import {
  uploadAttachment,
  importKnowledgeGraphExcelFromAttachment
} from '../../../../services/attachment.service';

const ExcelImport = ({ isAdmin, onSuccess }) => {
  const [importing, setImporting] = useState(false);

  const uploadProps = {
    accept: '.xlsx',
    maxCount: 1,
    showUploadList: false,
    customRequest: async ({ file, onSuccess: onReqSuccess, onError }) => {
      try {
        if (!isAdmin) {
          message.error('权限不足：仅管理员可导入');
          onError?.(new Error('forbidden'));
          return;
        }

        const overwrite = window.confirm(
          '是否使用 overwrite 全量覆盖导入？\n\n确定 = overwrite（会清空并重建 artifacts）\n取消 = append（仅新增）'
        );
        const strategy = overwrite ? 'overwrite' : 'append';

        setImporting(true);

        const uploadResp = await uploadAttachment({
          file,
          ownerType: 'system_import',
          ownerId: 0
        });
        const attachmentId = uploadResp.data?.id;
        if (!attachmentId) {
          throw new Error('上传成功但未返回附件ID');
        }

        const importResp = await importKnowledgeGraphExcelFromAttachment({ id: attachmentId, strategy });
        const result = importResp.data || {};

        message.success(
          `导入成功：inserted=${result.inserted ?? 0} updated=${result.updated ?? 0} skipped=${result.skipped ?? 0}`
        );

        onSuccess?.();
        onReqSuccess?.(result);
      } catch (err) {
        if (err.response?.status === 403) {
          message.error('权限不足：仅管理员可导入');
        } else {
          message.error(err.response?.data?.message || err.message || '导入失败');
        }
        onError?.(err);
      } finally {
        setImporting(false);
      }
    }
  };

  return (
    <Card size="small" title="知识图谱 Excel 导入" bodyStyle={{ padding: 12 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Upload {...uploadProps}>
          <Button loading={importing} block>
            上传并导入知识图谱Excel
          </Button>
        </Upload>
      </Space>
    </Card>
  );
};

export default ExcelImport;
