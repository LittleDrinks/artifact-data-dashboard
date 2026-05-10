/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react';
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
  Alert,
  Steps,
  Result,
  Tooltip,
} from 'antd';
import { ExperimentOutlined, UploadOutlined, DownloadOutlined, QuestionCircleOutlined, CheckCircleOutlined, LoadingOutlined, SearchOutlined, PlusCircleOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { extractTriples, importGraphCSV, exportGraphCSV, knowledgeQuery } from '../api/graph';
import * as d3 from 'd3';

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

// Mini D3 force graph for extraction results
function MiniGraph({ result }: { result: ExtractionResult }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const renderGraph = useCallback(() => {
    if (!containerRef.current || result.entities.length === 0) return;

    const container = containerRef.current;
    const W = container.clientWidth || 600;
    const H = 320;

    // Clear previous
    d3.select(container).selectAll('svg').remove();

    const svg = d3.select(container).append('svg')
      .attr('width', W)
      .attr('height', H)
      .style('border-radius', 8)
      .style('background', '#fafbfc');

    const g = svg.append('g');

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    // Build nodes from entities
    const nodes = result.entities.map((e, i) => ({
      id: e.name || `entity-${i}`,
      name: e.name,
      type: e.type,
      r: e.type === '文物' ? 16 : 10,
    }));

    // Deduplicate by id
    const uniqueNodes = Array.from(
      new Map(nodes.map((n) => [n.id, n])).values()
    );

    // Build links from relations
    const links = result.relations
      .filter((r) => r.source && r.target)
      .map((r) => ({ source: r.source, target: r.target, relation: r.relation }));

    // Arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'mini-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#bbb');

    // Simulation
    const simulation = d3.forceSimulation(uniqueNodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(links)
        .id((d: any) => d.id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide<any>().radius((d) => d.r + 4));

    // Links
    const linkSel = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#ccc')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#mini-arrow)');

    // Link labels
    const linkLabelSel = g.append('g')
      .selectAll('text')
      .data(links)
      .join('text')
      .text((d: any) => d.relation)
      .attr('font-size', 10)
      .attr('fill', '#999')
      .attr('text-anchor', 'middle');

    // Node groups
    const nodeSel = g.append('g')
      .selectAll<SVGGElement, any>('g')
      .data(uniqueNodes)
      .join('g')
      .call(d3.drag<SVGGElement, any>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
      );

    // Circles
    nodeSel.append('circle')
      .attr('r', (d) => d.r)
      .attr('fill', (d) => ENTITY_COLORS[d.type] || ENTITY_COLORS['其他'])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Labels
    nodeSel.append('text')
      .text((d) => d.name.length > 6 ? d.name.slice(0, 6) + '…' : d.name)
      .attr('dy', (d) => d.r + 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('fill', '#333');

    // Tick
    simulation.on('tick', () => {
      linkSel
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);
      linkLabelSel
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2 - 6);
      nodeSel.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [result]);

  useEffect(() => {
    const cleanup = renderGraph();
    return () => { cleanup?.(); };
  }, [renderGraph]);

  if (result.entities.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <Divider style={{ margin: '12px 0' }} />
      <h4 style={{ color: 'var(--text-heading)', marginBottom: 8 }}>
        知识图谱可视化
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8, fontWeight: 400 }}>
          {result.entities.length} 个实体 · {result.relations.length} 个关系（可拖拽、缩放）
        </span>
      </h4>
      <div ref={containerRef} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }} />
    </div>
  );
}

export default function Knowledge() {
  // Extraction state
  const [extractText, setExtractText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [extractionStep, setExtractionStep] = useState(0); // 0=idle, 1=analyzing, 2=extracting, 3=done

  // Knowledge query state
  const [queryQuestion, setQueryQuestion] = useState('');
  const [queryAnswer, setQueryAnswer] = useState('');
  const [querying, setQuerying] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);

  // CSV import state
  const [csvFile, setCsvFile] = useState<UploadFile | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);

  // CSV export state
  const [exporting, setExporting] = useState(false);

  // Handle knowledge query
  const handleKnowledgeQuery = async () => {
    if (!queryQuestion.trim()) {
      message.warning('请输入问题');
      return;
    }
    setQuerying(true);
    setQueryAnswer('');
    try {
      const res = await knowledgeQuery(queryQuestion);
      const data = res.data;
      if (data.success) {
        setQueryAnswer(data.answer || '（知识库中暂无相关信息，请先通过"文本知识抽取"添加数据）');
        setHasQueried(true);
      } else {
        message.error(data.message || '查询失败');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      const detail = err?.response?.data?.detail || err?.message || '未知错误';
      message.error(`查询失败：${detail}`);
    } finally {
      setQuerying(false);
    }
  };

  // Handle text extraction
  const handleExtract = async () => {
    if (!extractText.trim()) {
      message.warning('请输入文本内容');
      return;
    }

    setExtracting(true);
    setExtractionResult(null);
    setExtractionStep(1);

    try {
      // Simulate step progression for UX feedback
      setTimeout(() => setExtractionStep(2), 800);

      const res = await extractTriples(extractText);
      const data = res.data as {
        success: boolean;
        entities: { entity_name: string; entity_type: string; description?: string }[];
        relations: { src_name: string; tgt_name: string; relation: string }[];
        count: number;
        message: string;
      };

      setExtractionStep(3);

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

        // Show appropriate message based on result
        if (mappedEntities.length === 0 && mappedRelations.length === 0) {
          message.warning(data.message || '未提取到实体和关系，请检查文本内容或 LightRAG 配置');
        } else {
          message.success(`抽取完成：发现 ${mappedEntities.length} 个实体、${mappedRelations.length} 个关系`);
        }
      } else {
        message.error(data.message || '抽取失败');
        setExtractionStep(0);
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      const detail = err?.response?.data?.detail || err?.message || '未知错误';
      message.error(`抽取失败：${detail}`);
      setExtractionStep(0);
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
    } catch {
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
    } catch {
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
            <Tooltip title="从文本中自动识别文物、朝代、地点等实体，并抽取它们之间的关系">
              <QuestionCircleOutlined style={{ color: 'var(--text-muted)', cursor: 'help' }} />
            </Tooltip>
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
        {/* Help text */}
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 6 }}
          message="输入文物相关文本，系统将自动识别实体（文物、朝代、地点、类别等）并抽取关系三元组"
        />

        <TextArea
          rows={8}
          placeholder="示例：越王勾践剑是春秋晚期越国的青铜剑，1965年出土于湖北江陵望山楚墓，现藏于湖北省博物馆。剑身刻有'越王鸠浅自作用剑'铭文，被誉为'天下第一剑'。"
          value={extractText}
          onChange={(e) => {
            setExtractText(e.target.value);
            if (extractionStep > 0) setExtractionStep(0);
            if (extractionResult) setExtractionResult(null);
          }}
          style={{
            borderRadius: 8,
            border: '1px solid var(--border)',
            resize: 'none',
          }}
        />

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="primary"
            onClick={handleExtract}
            loading={extracting}
            disabled={!extractText.trim()}
            style={{
              background: 'var(--purple)',
              borderRadius: 6,
            }}
          >
            {extracting ? '正在抽取...' : '开始抽取'}
          </Button>

          {extractText.trim() && (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              输入 {extractText.length} 字
            </span>
          )}
        </div>

        {/* Progress indicator */}
        {extracting && (
          <div style={{ marginTop: 16 }}>
            <Steps
              size="small"
              current={extractionStep}
              items={[
                { title: '分析文本', icon: extractionStep >= 1 ? <LoadingOutlined /> : undefined },
                { title: '识别实体', icon: extractionStep >= 2 ? <LoadingOutlined /> : undefined },
                { title: '抽取关系', icon: extractionStep >= 3 ? <CheckCircleOutlined /> : undefined },
              ]}
            />
          </div>
        )}

        {/* Success indicator */}
        {extractionStep === 3 && extractionResult && !extracting && (
          <Result
            status="success"
            title="抽取完成"
            subTitle={`发现 ${extractionResult.entities.length} 个实体、${extractionResult.relations.length} 个关系`}
            style={{ padding: '12px 0' }}
          />
        )}

        {renderExtractionResult()}
        {extractionResult && <MiniGraph result={extractionResult} />}
      </Card>

      {/* Card 2: Knowledge Query — the core demo */}
      <Card
        title={
          <Space>
            <SearchOutlined style={{ color: '#10b981' }} />
            <span style={{ fontWeight: 510, color: 'var(--text-heading)' }}>
              知识检索验证
            </span>
            <Tooltip title="查询 LightRAG 知识库，验证添加的数据可以被检索到">
              <QuestionCircleOutlined style={{ color: 'var(--text-muted)', cursor: 'help' }} />
            </Tooltip>
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
        <Alert
          type="success"
          showIcon
          icon={<PlusCircleOutlined />}
          style={{ marginBottom: 16, borderRadius: 6 }}
          message="数据不足？没关系 — 输入文本抽取知识后，在这里验证检索效果"
        />

        <Input.Search
          placeholder="输入问题验证知识库，如：曾侯乙编钟是什么？"
          value={queryQuestion}
          onChange={(e) => {
            setQueryQuestion(e.target.value);
            if (queryAnswer) setQueryAnswer('');
          }}
          onSearch={handleKnowledgeQuery}
          enterButton={
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <SearchOutlined />
              查询知识库
            </span>
          }
          loading={querying}
          size="large"
          style={{ borderRadius: 8 }}
        />

        {querying && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Spin tip="正在查询知识库...">
              <div style={{ width: 100, height: 100 }} />
            </Spin>
          </div>
        )}

        {hasQueried && !querying && queryAnswer && (
          <div style={{
            marginTop: 16,
            padding: 16,
            background: 'var(--bg-canvas, #f9fafb)',
            borderRadius: 8,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 500 }}>
              知识库回答
            </div>
            <div style={{ color: 'var(--text-body)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {queryAnswer || '（暂无相关信息 — 请先通过上方"文本知识抽取"添加数据）'}
            </div>
          </div>
        )}

        {hasQueried && !querying && !queryAnswer && (
          <div style={{
            marginTop: 16,
            padding: 16,
            background: '#fffbeb',
            borderRadius: 8,
            border: '1px solid #fde68a',
            color: '#92400e',
          }}>
            <strong>知识库暂无相关信息</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#a16207' }}>
              请在上方"文本知识抽取"中输入相关文本，提取后再次查询即可验证扩展效果。
            </p>
          </div>
        )}
      </Card>

      {/* Card 3: CSV Import */}
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
          data-testid="csv-import-btn"
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