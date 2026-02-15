import React, { useState } from 'react';
import { Card, Button, Upload, Space, Alert, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { importArtifactAttachmentLinksExcel } from '../../../../services/attachment.service';

const LinkImport = ({ isAdmin }) => {
  const [fileList, setFileList] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const uploadProps = {
    accept: '.xlsx',
    maxCount: 1,
    fileList,
    beforeUpload: (file) => {
      setFileList([file]);
      setResult(null);
      return false;
    },
    onRemove: () => {
      setFileList([]);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!isAdmin) {
      message.error('权限不足：仅管理员可导入关联');
      return;
    }

    if (!fileList.length) {
      message.warning('请先选择 Excel 文件（data.xlsx）');
      return;
    }

    try {
      setLoading(true);
      const file = fileList[0]?.originFileObj || fileList[0];
      const resp = await importArtifactAttachmentLinksExcel({ file });
      setResult(resp.data || null);
      message.success(`关联导入完成：linked=${resp.data?.linked ?? 0}`);
    } catch (err) {
      if (err.response?.status === 403) {
        message.error('权限不足：仅管理员可导入关联');
      } else {
        message.error(err.response?.data?.message || err.message || '关联导入失败');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card size="small" title="关联导入（把图片挂到文物）" bodyStyle={{ padding: 12 }}>
      <div style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 12, lineHeight: 1.6 }}>
        <div>上传 data.xlsx（含 ArtifactAttachments sheet），把附件关联到 artifact。</div>
      </div>

      <Space direction="vertical" style={{ width: '100%' }}>
        <Upload {...uploadProps}>
          <Button icon={<UploadOutlined />} disabled={loading} block>
            选择 data.xlsx
          </Button>
        </Upload>
        <Button type="primary" onClick={handleImport} loading={loading} block>
          执行关联导入
        </Button>

        {result && (
          <Alert
            type={(result.errors || []).length > 0 ? 'warning' : 'success'}
            showIcon
            message={`关联结果：linked=${result.linked ?? 0} errors=${(result.errors || []).length}`}
            description={
              (result.errors || []).length > 0 ? (
                <pre style={{ margin: 0, maxHeight: 160, overflow: 'auto' }}>
                  {JSON.stringify((result.errors || []).slice(0, 20), null, 2)}
                </pre>
              ) : null
            }
          />
        )}
      </Space>
    </Card>
  );
};

export default LinkImport;
