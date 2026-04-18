import { useState } from 'react';
import {
  Card,
  Input,
  Button,
  Spin,
  Tag,
  Table,
  Upload,
  message,
  Space,
  Divider,
} from 'antd';
import { ExperimentOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { extractTriples, importGraphCSV, exportGraphCSV } from '../api/graph';

const { TextArea } = Input;

// Entity type colors
const ENTITY_COLORS: Record<string, string> = {
  文物: '#533afd',
  朝代: '#f59e0b',
  类别: '#10b981',
  地点: '#ef4444',
  标签: '#6366f1',
  其他: '#64748d',
};

interface Entity {
  name: string;
  type: string;
}

interface Relation {
  source: string;
  relation: string;
  target: string;
}

interface ExtractionResult {
  entities: Entity[];
  relations: Relation[];
}

export default function Knowledge() {
  // Extraction state
  const [extractText, setExtractText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);

  // CSV import state
  const [csvFile, setCsvFile] = useState<UploadFile | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);

  // CSV export state
  const [exporting, setExporting] = useState(false);

  // Handle text extraction
  const handleExtract = async () => {
    if (!extractText.trim()) {
      message.warning('请输入文本内容');
      return;
    }

    setExtracting(true);
    setExtractionResult(null);

    try {
      const res = await extractTriples(extractText);
      const data = res.data as {
        success: boolean;
        entities: { entity_name: string; entity_type: string; description?: string }[];
        relations: { src_name: string; tgt_name: string; relation: string }[];
        count: number;
        message: string;
      };

      if (data.success) {
        // Map backend field names to frontend format
        const mappedEntities: Entity[] = (data.entities || []).map((e) => ({
          name: e.entity_name || '',
          type: e.entity_type || '其他',
        }));
        const mappedRelations: Relation[] = (data.relations || []).map((r) => ({
          source: r.src_name || '',
          relation: r.relation || '',
          target: r.tgt_name || '',
        }));
        setExtractionResult({ entities: mappedEntities, relations: mappedRelations });
        message.success(data.message || `抽取完成，${data.count} 个结果`);
      } else {
        message.error(data.message || '抽取失败');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      const detail = err?.response?.data?.detail || err?.message || '未知错误';
      message.error(`抽取失败：${detail}`);
    } finally {
      setExtracting(false);
    }
  };

  // Handle CSV file upload
  const handleCsvUpload = (file: File) => {
    setCsvFile(file as unknown as UploadFile);

    // Preview first 5 rows
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').slice(0, 6); // header + 5 rows
      const rows = lines.map((line) => line.split(',').map((cell) => cell.trim()));
      setCsvPreview(rows);
    };
    reader.readAsText(file);

    return false; // Prevent auto upload
  };

  // Handle CSV import
  const handleImport = async () => {
    if (!csvFile) {
      message.warning('请先上传 CSV 文件');
      return;
    }

    setImporting(true);

    try {
      const res = await importGraphCSV(csvFile as unknown as File);
      const count = res.data?.count ?? 0;
      message.success(`导入成功，共 ${count} 条三元组`);
      setCsvFile(null);
      setCsvPreview([]);
    } catch (error) {
      message.error('导入失败，请检查文件格式');
    } finally {
      setImporting(false);
    }
  };

  // Handle CSV export
  const handleExport = async () => {
    setExporting(true);

    try {
      await exportGraphCSV();
      message.success('导出成功');
    } catch (error) {
      message.error('导出失败，请检查后端服务');
    } finally {
      setExporting(false);
    }
  };

  // Render extraction results
  const renderExtractionResult = () => {
    if (!extractionResult) return null;

    const { entities, relations } = extractionResult;

    // Group entities by type
    const groupedEntities: Record<string, Entity[]> = {};
    for (const entity of entities) {
      const type = entity.type || '其他';
      if (!groupedEntities[type]) groupedEntities[type] = [];
      groupedEntities[type].push(entity);
    }

    return (
      <div style={{ marginTop: 16 }}>
        <Divider style={{ margin: '12px 0' }} />

        {/* Entities */}
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ color: 'var(--text-heading)', marginBottom: 8 }}>抽取实体</h4>
          {Object.entries(groupedEntities).map(([type, items]) => (
            <div key={type} style={{ marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)', marginRight: 8, fontSize: 12 }}>
                {type}:
              </span>
              {items.map((entity, idx) => (
                <Tag
                  key={`${entity.name}-${idx}`}
                  color={ENTITY_COLORS[type] || ENTITY_COLORS['其他']}
                  style={{ marginBottom: 4 }}
                >
                  {entity.name}
                </Tag>
              ))}
            </div>
          ))}
        </div>

        {/* Relations */}
        {relations.length > 0 && (
          <div>
            <h4 style={{ color: 'var(--text-heading)', marginBottom: 8 }}>抽取关系</h4>
            <ul style={{ paddingLeft: 16, color: 'var(--text-body)', margin: 0 }}>
              {relations.map((rel, idx) => (
                <li key={`rel-${idx}`} style={{ marginBottom: 4 }}>
                  <span style={{ color: ENTITY_COLORS['文物'] }}>{rel.source}</span>
                  <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>
                    → {rel.relation} →
                  </span>
                  <span style={{ color: ENTITY_COLORS['文物'] }}>{rel.target}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // CSV preview columns
  const previewColumns = csvPreview[0]?.map((header, idx) => ({
    title: header || `列 ${idx + 1}`,
    dataIndex: idx,
    key: idx,
  })) || [];

  const previewData = csvPreview.slice(1).map((row, idx) => ({
    key: idx,
    ...row.reduce((acc, cell, cellIdx) => {
      acc[cellIdx] = cell;
      return acc;
    }, {} as Record<number, string>),
  }));

  return (
    <div>
      {/* Card 1: Text Extraction */}
      <Card
        title={
          <Space>
            <ExperimentOutlined style={{ color: 'var(--purple)' }} />
            <span style={{ fontWeight: 510, color: 'var(--text-heading)' }}>
              文本知识抽取
            </span>
          </Space>
        }
        style={{
          borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border)',
          marginBottom: 24,
        }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        <TextArea
          rows={8}
          placeholder="请输入文物相关文本，如考古报告、文物描述、历史文献..."
          value={extractText}
          onChange={(e) => setExtractText(e.target.value)}
          style={{
            borderRadius: 8,
            border: '1px solid var(--border)',
            resize: 'none',
          }}
        />
        <Button
          type="primary"
          onClick={handleExtract}
          loading={extracting}
          disabled={!extractText.trim()}
          style={{
            marginTop: 12,
            background: 'var(--purple)',
            borderRadius: 6,
          }}
        >
          {extracting ? '正在抽取实体和关系...' : '开始抽取'}
        </Button>

        {extracting && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Spin><span style={{ color: 'var(--text-muted)' }}>正在抽取实体和关系...</span></Spin>
          </div>
        )}

        {renderExtractionResult()}
      </Card>

      {/* Card 2: CSV Import */}
      <Card
        title={
          <Space>
            <UploadOutlined style={{ color: 'var(--purple)' }} />
            <span style={{ fontWeight: 510, color: 'var(--text-heading)' }}>
              CSV 导入
            </span>
          </Space>
        }
        style={{
          borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border)',
          marginBottom: 24,
        }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        <Upload
          accept=".csv"
          beforeUpload={handleCsvUpload}
          maxCount={1}
          fileList={csvFile ? [csvFile] : []}
          onRemove={() => {
            setCsvFile(null);
            setCsvPreview([]);
          }}
        >
          <Button
            icon={<UploadOutlined />}
            style={{ borderRadius: 6 }}
          >
            选择 CSV 文件
          </Button>
        </Upload>

        {csvPreview.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ color: 'var(--text-heading)', marginBottom: 8 }}>
              文件预览（前 5 行）
            </h4>
            <Table
              columns={previewColumns}
              dataSource={previewData}
              pagination={false}
              size="small"
              style={{ borderRadius: 8 }}
              scroll={{ x: 'max-content' }}
            />
          </div>
        )}

        <Button
          type="primary"
          onClick={handleImport}
          loading={importing}
          disabled={!csvFile}
          style={{
            marginTop: 12,
            background: 'var(--purple)',
            borderRadius: 6,
          }}
        >
          导入
        </Button>
      </Card>

      {/* Card 3: CSV Export */}
      <Card
        title={
          <Space>
            <DownloadOutlined style={{ color: 'var(--purple)' }} />
            <span style={{ fontWeight: 510, color: 'var(--text-heading)' }}>
              CSV 导出
            </span>
          </Space>
        }
        style={{
          borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border)',
        }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
          导出当前知识图谱中的所有三元组数据（CSV 格式）
        </p>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleExport}
          loading={exporting}
          style={{
            background: 'var(--purple)',
            borderRadius: 6,
          }}
        >
          导出图谱数据
        </Button>
      </Card>
    </div>
  );
}