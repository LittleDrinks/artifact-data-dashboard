import React, { useState } from 'react';
import { Card, Button, Input, Space, Alert, message } from 'antd';
import { importAttachmentsFromDir } from '../../../../services/attachment.service';

const DirImport = ({ isAdmin, ownerType, ownerId, onSuccess }) => {
  const [dir, setDir] = useState('/data/import/crawler');
  const [maxFiles, setMaxFiles] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!isAdmin) {
      message.error('权限不足：仅管理员可导入目录');
      return;
    }

    const dirPath = String(dir || '').trim();
    if (!dirPath) {
      message.warning('请填写容器内目录路径');
      return;
    }

    try {
      setLoading(true);
      setResult(null);
      const resp = await importAttachmentsFromDir({
        dir: dirPath,
        ownerType: ownerType?.trim() || undefined,
        ownerId: ownerId?.trim() || undefined,
        maxFiles: maxFiles.trim() || undefined
      });
      setResult(resp.data || null);
      message.success(`目录导入完成：processed=${resp.data?.processed ?? 0}`);
      onSuccess?.();
    } catch (err) {
      if (err.response?.status === 403) {
        message.error('权限不足：仅管理员可导入目录');
      } else {
        message.error(err.response?.data?.message || err.message || '目录导入失败');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card size="small" title="目录导入（推荐，适合超大图片）" bodyStyle={{ padding: 12 }}>
      <div style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 12, lineHeight: 1.6 }}>
        <div>需要先用 Docker 把本机目录挂载到容器。</div>
        <div>白名单前缀：/data/import/crawler</div>
      </div>

      <Space direction="vertical" style={{ width: '100%' }}>
        <Input
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          placeholder="容器内路径，例如 /data/import/crawler/shenzhen/images_shenzhen"
        />
        <Input
          value={maxFiles}
          onChange={(e) => setMaxFiles(e.target.value)}
          placeholder="maxFiles（可选）"
        />
        <Button type="primary" onClick={handleImport} loading={loading} block>
          开始导入目录
        </Button>

        {result && (
          <Alert
            type={(result.data || []).some((it) => it && it.error) ? 'warning' : 'success'}
            showIcon
            message={`导入结果：totalFiles=${result.totalFiles ?? 0} processed=${result.processed ?? 0}`}
            description={
              (result.data || []).some((it) => it && it.error) ? (
                <pre style={{ margin: 0, maxHeight: 160, overflow: 'auto' }}>
                  {JSON.stringify(
                    (result.data || []).filter((it) => it && it.error).slice(0, 20),
                    null,
                    2
                  )}
                </pre>
              ) : null
            }
          />
        )}
      </Space>
    </Card>
  );
};

export default DirImport;
