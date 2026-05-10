/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import {
  Card,
  Input,
  Button,
  Tag,
  Space,
  Divider,
  Alert,
  Steps,
  Result,
  Tooltip,
  message,
} from 'antd';
import {
  ExperimentOutlined,
  SearchOutlined,
  QuestionCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  PlusCircleOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import * as d3 from 'd3';

const { TextArea } = Input;

// Entity type colors
const ENTITY_COLORS: Record<string, string> = {
  文物: '#533afd',
  朝代: '#f59e0b',
  类别: '#10b981',
  地点: '#ef4444',
  标签: '#6366f1',
  其他: '#64748b',
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

// ── Mock Knowledge Base (硬编码知识库) ──

const MOCK_KNOWLEDGE: Record<string, string> = {
  '越王勾践剑': `越王勾践剑是春秋晚期越国的青铜剑，1965年出土于湖北江陵望山楚墓，现藏于湖北省博物馆。剑长55.7厘米，剑身刻有"越王鸠浅自作用剑"铭文，被誉为"天下第一剑"。剑身经过硫化处理，千年不锈，展现了越国高超的铸剑工艺。`,
  '曾侯乙编钟': `曾侯乙编钟是战国早期曾国的一套青铜编钟，1978年出土于湖北随州曾侯乙墓，现藏于湖北省博物馆。全套编钟共65件，总重2567公斤，音域跨五个半八度，能演奏古今中外各种乐曲，是中国古代音乐文化的瑰宝。`,
  '三星堆青铜大立人像': `三星堆青铜大立人像是商代晚期的大型青铜器，1986年出土于四川广汉三星堆遗址二号祭祀坑，现藏于三星堆博物馆。人像高2.62米，连座通高2.62米，是世界上现存最高的青铜人像，展现了古蜀国神秘的宗教文化。`,
  '四羊方尊': `四羊方尊是商代晚期的青铜礼器，1938年出土于湖南宁乡黄材镇，现藏于中国国家博物馆。尊高58.3厘米，四角各有一只卷角羊，造型精美，是商代青铜器的巅峰之作。`,
  '清明上河图': `清明上河图是北宋画家张择端的传世名作，描绘了北宋都城汴京（今开封）的繁华景象。画卷长528.7厘米，宽24.8厘米，画有814人、83匹牲畜、29艘船只，是中国十大传世名画之一，现藏于北京故宫博物院。`,
  '兵马俑': `兵马俑是秦始皇陵的陪葬坑，1974年发现于陕西西安临潼区。兵马俑坑已出土陶俑、陶马约8000件，被誉为"世界第八大奇迹"。兵马俑展现了秦代高超的雕塑艺术和军事制度，现建有秦始皇兵马俑博物馆。`,
  '金缕玉衣': `金缕玉衣是汉代皇室的殓服，用金丝将玉片编缀而成。目前已出土多件，其中最著名的是河北满城汉墓出土的中山靖王刘胜及其妻窦绾的金缕玉衣，现藏于河北博物院。玉衣体现了汉代"玉能保尸不朽"的丧葬观念。`,
  '司母戊鼎': `司母戊鼎（后母戊鼎）是商代晚期的青铜礼器，1939年出土于河南安阳殷墟，现藏于中国国家博物馆。鼎高133厘米，重832.84公斤，是迄今世界上出土最大、最重的青铜礼器，被誉为"镇国之宝"。`,
  '马踏飞燕': `马踏飞燕（铜奔马）是东汉时期的青铜器，1969年出土于甘肃武威雷台汉墓，现藏于甘肃省博物馆。铜马高34.5厘米，长45厘米，造型为奔马踏在一只飞燕背上，寓意天马行空，是中国旅游的标志性形象。`,
  '何尊': `何尊是西周早期的青铜礼器，1963年出土于陕西宝鸡贾村塬，现藏于宝鸡青铜器博物院。尊内底铸有铭文122字，其中"中国"二字是迄今最早出现的"中国"一词，具有极高的历史价值。`,
};

// ── Mock Extraction Logic (模拟实体抽取) ──

const ENTITY_PATTERNS: { pattern: RegExp; type: string }[] = [
  { pattern: /越王勾践剑|曾侯乙编钟|三星堆青铜大立人像|四羊方尊|清明上河图|兵马俑|金缕玉衣|司母戊鼎|马踏飞燕|何尊/g, type: '文物' },
  { pattern: /春秋晚期|战国早期|商代晚期|北宋|秦代|汉代|东汉|西周早期|春秋|战国|商代|秦|汉|周/g, type: '朝代' },
  { pattern: /青铜器|青铜剑|编钟|陶俑|玉衣|青铜鼎|画卷|礼器/g, type: '类别' },
  { pattern: /湖北|四川|湖南|陕西|河南|甘肃|北京|上海|江陵|随州|广汉|宁乡|西安|安阳|武威|宝鸡|开封/g, type: '地点' },
];

function mockExtract(text: string): ExtractionResult {
  const entities: Entity[] = [];
  const relations: Relation[] = [];

  // Extract entities
  for (const { pattern, type } of ENTITY_PATTERNS) {
    const matches = text.match(pattern) || [];
    for (const name of matches) {
      if (!entities.find(e => e.name === name)) {
        entities.push({ name, type });
      }
    }
  }

  // Extract simple relations (出土于, 现藏于)
  const chutuMatch = text.match(/(.{2,10})出土于(.{2,10})/);
  if (chutuMatch) {
    relations.push({ source: chutuMatch[1], relation: '出土于', target: chutuMatch[2].split(/[，。、]/)[0] });
  }

  const xiancangMatch = text.match(/(.{2,10})现藏于(.{2,10})/);
  if (xiancangMatch) {
    relations.push({ source: xiancangMatch[1], relation: '现藏于', target: xiancangMatch[2].split(/[，。、]/)[0] });
  }

  return { entities, relations };
}

function mockQuery(question: string): string {
  // 直接匹配知识库
  for (const [key, value] of Object.entries(MOCK_KNOWLEDGE)) {
    if (question.includes(key)) {
      return value;
    }
  }

  // 模糊匹配
  const keywords = ['剑', '钟', '鼎', '俑', '图', '衣', '马', '尊'];
  for (const kw of keywords) {
    if (question.includes(kw)) {
      for (const [key, value] of Object.entries(MOCK_KNOWLEDGE)) {
        if (key.includes(kw)) {
          return value;
        }
      }
    }
  }

  return '';
}

// ── Mini D3 Force Graph ──

function MiniGraph({ result }: { result: ExtractionResult }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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

    return () => {
      simulation.stop();
    };
  }, [result]);

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
      <div
        ref={containerRef}
        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', height: 320 }}
      />
    </div>
  );
}

// ── Main Component ──

export default function KnowledgeDemo() {
  // Extraction state
  const [extractText, setExtractText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [extractionStep, setExtractionStep] = useState(0);

  // Knowledge query state
  const [queryQuestion, setQueryQuestion] = useState('');
  const [queryAnswer, setQueryAnswer] = useState('');
  const [querying, setQuerying] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);

  // Handle knowledge query
  const handleKnowledgeQuery = async () => {
    if (!queryQuestion.trim()) {
      message.warning('请输入问题');
      return;
    }
    setQuerying(true);
    setQueryAnswer('');

    // Simulate delay
    await new Promise(r => setTimeout(r, 800));

    const answer = mockQuery(queryQuestion);
    setQueryAnswer(answer);
    setHasQueried(true);
    setQuerying(false);
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

    // Simulate step progression
    await new Promise(r => setTimeout(r, 600));
    setExtractionStep(2);
    await new Promise(r => setTimeout(r, 800));

    const result = mockExtract(extractText);
    setExtractionStep(3);
    setExtractionResult(result);
    setExtracting(false);
    message.success(`抽取完成：发现 ${result.entities.length} 个实体、${result.relations.length} 个关系`);
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

  // Sample texts for quick demo
  const sampleTexts = [
    '越王勾践剑是春秋晚期越国的青铜剑，1965年出土于湖北江陵望山楚墓，现藏于湖北省博物馆。',
    '曾侯乙编钟是战国早期曾国的一套青铜编钟，1978年出土于湖北随州曾侯乙墓，现藏于湖北省博物馆。',
    '四羊方尊是商代晚期的青铜礼器，1938年出土于湖南宁乡黄材镇，现藏于中国国家博物馆。',
  ];

  return (
    <div>
      {/* Header */}
      <Alert
        type="info"
        showIcon
        icon={<BulbOutlined />}
        style={{ marginBottom: 24, borderRadius: 8 }}
        message="这是 LightRAG 知识图谱演示页面（硬编码版本，无需后端服务）"
        description="演示流程：输入文物相关文本 → 自动抽取实体和关系 → 查询知识库验证检索效果"
      />

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
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 6 }}
          message="输入文物相关文本，系统将自动识别实体（文物、朝代、地点、类别等）并抽取关系三元组"
        />

        <TextArea
          rows={6}
          placeholder="示例：越王勾践剑是春秋晚期越国的青铜剑，1965年出土于湖北江陵望山楚墓，现藏于湖北省博物馆。"
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

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button
            type="primary"
            onClick={handleExtract}
            loading={extracting}
            disabled={!extractText.trim()}
            style={{ background: 'var(--purple)', borderRadius: 6 }}
          >
            {extracting ? '正在抽取...' : '开始抽取'}
          </Button>

          {/* Quick sample buttons */}
          {sampleTexts.map((text, idx) => (
            <Button
              key={idx}
              size="small"
              onClick={() => setExtractText(text)}
              style={{ borderRadius: 6 }}
            >
              示例 {idx + 1}
            </Button>
          ))}

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

      {/* Card 2: Knowledge Query */}
      <Card
        title={
          <Space>
            <SearchOutlined style={{ color: '#10b981' }} />
            <span style={{ fontWeight: 510, color: 'var(--text-heading)' }}>
              知识检索验证
            </span>
            <Tooltip title="查询知识库，验证添加的数据可以被检索到">
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
          message="内置 10 条文物知识数据，可直接查询验证"
        />

        <Input.Search
          placeholder="输入问题，如：越王勾践剑是什么？曾侯乙编钟在哪里出土？"
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

        {/* Quick query buttons */}
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['越王勾践剑', '曾侯乙编钟', '三星堆青铜大立人像', '兵马俑', '清明上河图'].map((q) => (
            <Button
              key={q}
              size="small"
              onClick={() => setQueryQuestion(`${q}是什么？`)}
              style={{ borderRadius: 6 }}
            >
              {q}
            </Button>
          ))}
        </div>

        {querying && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Tag icon={<LoadingOutlined spin />} color="processing">
              正在查询知识库...
            </Tag>
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
              {queryAnswer}
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
              内置知识库包含：越王勾践剑、曾侯乙编钟、三星堆青铜大立人像、四羊方尊、清明上河图、兵马俑、金缕玉衣、司母戊鼎、马踏飞燕、何尊
            </p>
          </div>
        )}
      </Card>

      {/* Card 3: Knowledge Base Preview */}
      <Card
        title={
          <Space>
            <BulbOutlined style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 510, color: 'var(--text-heading)' }}>
              内置知识库预览
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {Object.keys(MOCK_KNOWLEDGE).map((key) => (
            <Tag
              key={key}
              color="purple"
              style={{ cursor: 'pointer', margin: 0 }}
              onClick={() => {
                setQueryQuestion(`${key}是什么？`);
                message.info(`已填入查询：${key}`);
              }}
            >
              {key}
            </Tag>
          ))}
        </div>
        <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 12 }}>
          点击标签可快速查询对应文物信息
        </p>
      </Card>
    </div>
  );
}
