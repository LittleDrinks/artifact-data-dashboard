import { Card, Row, Col, Statistic, Spin, Empty, Tooltip as AntTooltip, Skeleton } from 'antd';
import {
  AppstoreOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { useEffect, useState, useMemo, useRef } from 'react';
// @ts-expect-error d3-cloud has no type declarations
import cloud from 'd3-cloud';

// TypeScript declaration for d3-cloud (no official types)
interface CloudWord {
  text: string;
  size: number;
  x: number;
  y: number;
  rotate: number;
  font: string;
  style: string;
  weight: string | number;
  hasText: boolean;
  width: number;
  height: number;
}

interface CloudInstance {
  size(size: [number, number]): CloudInstance;
  words(words: CloudWord[]): CloudInstance;
  padding(pad: number): CloudInstance;
  rotate(fn: () => number): CloudInstance;
  font(font: string): CloudInstance;
  fontSize(fn: (d: CloudWord) => number): CloudInstance;
  on(event: string, callback: (words: CloudWord[]) => void): CloudInstance;
  start(): CloudInstance;
  stop(): CloudInstance;
}

// d3-cloud factory function
declare function cloud(): CloudInstance;
import {
  getOverview,
  getStatsByEra,
  getStatsByCategory,
  getWordCloud,
} from '../api/stats';
import type {
  OverviewStats,
  EraStat,
  CategoryStat,
  WordCloudItem,
} from '../api/stats';
import { PIE_COLORS } from '../constants/colors';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  type PieLabelRenderProps,
} from 'recharts';

/* ── sub-components ── */

function StatCards({
  stats,
  loading,
}: {
  stats: OverviewStats | null;
  loading: boolean;
}) {
  const cards = [
    {
      title: '文物总数',
      value: stats?.total_artifacts ?? 0,
      icon: <AppstoreOutlined />,
      color: '#533afd',
      bg: 'rgba(83,58,253,0.08)',
    },
    {
      title: '类别数量',
      value: stats?.total_categories ?? 0,
      icon: <TagOutlined />,
      color: '#2874ad',
      bg: 'rgba(40,116,173,0.08)',
    },
    {
      title: '年代数量',
      value: stats?.total_eras ?? 0,
      icon: <CalendarOutlined />,
      color: '#3d8b37',
      bg: 'rgba(61,139,55,0.08)',
    },
    {
      title: '出土地点',
      value: stats?.total_locations ?? 0,
      icon: <EnvironmentOutlined />,
      color: '#c45100',
      bg: 'rgba(196,81,0,0.08)',
    },
  ];

  if (loading) {
    return (
      <Row gutter={20} style={{ marginBottom: 24 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Col span={6} key={i}>
            <Card
              style={{
                borderRadius: 'var(--r-card)',
                boxShadow: 'var(--shadow-sm)',
                border: '1px solid var(--border)',
              }}
              styles={{ body: { padding: '20px 24px' } }}
            >
              <Skeleton active title={{ width: '40%' }} paragraph={{ rows: 1, width: ['60%'] }} />
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  return (
    <Row gutter={20} style={{ marginBottom: 24 }}>
      {cards.map((item) => (
        <Col span={6} key={item.title}>
          <Card
            style={{
              borderRadius: 'var(--r-card)',
              boxShadow: 'var(--shadow-sm)',
              border: '1px solid var(--border)',
            }}
            styles={{ body: { padding: '20px 24px' } }}
          >
            <Statistic
              title={
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {item.title}
                </span>
              }
              value={item.value}
              prefix={
                <span
                  style={{
                    color: item.color,
                    fontSize: 20,
                    marginRight: 8,
                    background: item.bg,
                    borderRadius: 8,
                    width: 40,
                    height: 40,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {item.icon}
                </span>
              }
              valueStyle={{
                fontSize: 28,
                fontWeight: 400,
                color: 'var(--text-heading)',
                fontFamily: 'var(--mono)',
              }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

/* ── Era Normalization & Order ── */

// Canonical era names in historical chronological order
// Based on Chinese dynasty timeline: https://zh.wikipedia.org/wiki/中国朝代
const ERA_ORDER: readonly string[] = [
  '新石器时代',
  '夏',
  '商',
  '西周',
  '春秋',
  '战国',
  '秦',
  '西汉',
  '东汉',
  '三国',
  '西晋',
  '东晋',
  '南北朝',
  '北魏',
  '东魏',
  '北齐',
  '北周',
  '南朝',
  '隋',
  '唐',
  '五代十国',
  '北宋',
  '辽',
  '西夏',
  '金',
  '南宋',
  '元',
  '明',
  '清',
  '民国',
];

// Era variant mapping: complex/varied era names -> canonical name
const ERA_NORMALIZE_MAP: Record<string, string> = {
  // Dynasty variants with "朝" suffix
  '夏朝': '夏',
  '商朝': '商',
  '商代': '商',
  '秦朝': '秦',
  '秦代': '秦',
  '汉朝': '西汉', // 汉通常指西汉
  '汉': '西汉',
  '周': '西周',
  '晋朝': '西晋', // 晋通常指西晋
  '晋': '西晋',
  '唐朝': '唐',
  '隋朝': '隋',
  '宋朝': '北宋', // 宋默认指北宋
  '宋': '北宋',
  '商周': '商', // 商周归入商
  '元朝': '元',
  '明朝': '明',
  '明代': '明',
  '清代': '清',
  '清朝': '清',
  // Complex era descriptions - map to appropriate canonical era
  '古蜀（相当于中原地区的商朝）': '商',
  '古蜀': '商',
  '公元前11世纪': '西周',
  // Sub-periods that should be grouped into parent dynasty
  '西周早期': '西周',
  '西周晚期': '西周',
  '东周': '春秋', // 东周分为春秋战国，默认归入春秋
  '东周早期': '春秋',
  '春秋早期': '春秋',
  '春秋晚期': '春秋',
  '战国早期': '战国',
  '战国晚期': '战国',
  '战国中晚期': '战国',
  '西汉早期': '西汉',
  '西汉晚期': '西汉',
  '东汉早期': '东汉',
  '东汉晚期': '东汉',
  '唐早期': '唐',
  '唐晚期': '唐',
  '北宋早期': '北宋',
  '北宋晚期': '北宋',
  '南宋早期': '南宋',
  '南宋晚期': '南宋',
  '明早期': '明',
  '明晚期': '明',
  '清早期': '清',
  '清晚期': '清',
  // Dynasty variants and subdivisions
  '曹魏': '三国', // 曹魏是三国的一部分
  '十六国': '南北朝', // 十六国归入南北朝时期
  '北朝': '北魏', // 北朝默认指北魏
  '北燕': '北魏', // 北燕归入北朝
  '五代': '五代十国', // 五代归入五代十国
  '辽代': '辽',
  '金代': '金',
  '西夏': '西夏', // 西夏保留（已在ERA_ORDER）
};

/**
 * Normalize era value to canonical name.
 * - Empty string returns null (filtered out)
 * - Known variants mapped to canonical names
 * - Unknown values returned as-is (sorted to end)
 */
function normalizeEra(era: string): string | null {
  if (!era || era.trim() === '' || era === '未知') return null;

  const trimmed = era.trim();

  // Direct match in ERA_ORDER
  if (ERA_ORDER.includes(trimmed)) return trimmed;

  // Check normalization map
  if (ERA_NORMALIZE_MAP[trimmed]) return ERA_NORMALIZE_MAP[trimmed];

  // Try partial matching for complex descriptions
  for (const [variant, canonical] of Object.entries(ERA_NORMALIZE_MAP)) {
    if (trimmed.includes(variant)) return canonical;
  }

  // Try extracting dynasty from complex text
  for (const canonical of ERA_ORDER) {
    if (trimmed.includes(canonical)) return canonical;
  }

  return trimmed; // Keep unknown values (sorted to end)
}

/* ── Bar Chart: era distribution ── */

function EraBarChart({ data, loading }: { data: EraStat[]; loading: boolean }) {
  // Normalize and aggregate era data, then sort by historical order
  const sortedData = useMemo(() => {
    // First normalize and aggregate
    const normalizedCounts: Record<string, number> = {};

    for (const item of data) {
      const normalized = normalizeEra(item.era);
      if (normalized) {
        normalizedCounts[normalized] = (normalizedCounts[normalized] || 0) + item.count;
      }
    }

    // Convert to array and sort
    const aggregated = Object.entries(normalizedCounts)
      .map(([era, count]) => ({ era, count }));

    return aggregated.sort((a, b) => {
      const aIdx = ERA_ORDER.indexOf(a.era);
      const bIdx = ERA_ORDER.indexOf(b.era);
      // Unknown eras go to the end
      if (aIdx === -1 && bIdx === -1) return a.era.localeCompare(b.era);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }, [data]);

  return (
    <Card
      title={
        <span style={{ fontWeight: 510, color: 'var(--text-heading)' }}>
          各朝代文物数量分布
        </span>
      }
      style={{
        borderRadius: 'var(--r-card)',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border)',
      }}
      styles={{ body: { padding: '16px 12px 12px' } }}
    >
      {loading ? (
        <div style={{ padding: '16px 24px' }}>
          <Skeleton active title={{ width: '30%' }} paragraph={{ rows: 6 }} />
        </div>
      ) : sortedData.length === 0 ? (
        <Empty description="暂无年代数据" style={{ padding: '40px 0' }} />
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={sortedData} margin={{ top: 5, right: 10, left: -10, bottom: 60 }}>
            <XAxis
              dataKey="era"
              tick={{ fontSize: 11, fill: '#64748d' }}
              axisLine={{ stroke: '#e5edf5' }}
              tickLine={false}
              angle={-35}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#64748d' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value) => [`${value} 件`, '数量']}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            />
            <Bar
              dataKey="count"
              fill="#533afd"
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

/* ── Pie Chart: category distribution ── */

interface PieDataItem {
  name: string;
  value: number;
}

function CategoryPieChart({
  data,
  loading,
}: {
  data: CategoryStat[];
  loading: boolean;
}) {
  const pieData: PieDataItem[] = useMemo(
    () => data.map((d) => ({ name: d.category, value: d.count })),
    [data],
  );

  const renderLegend = () => (
    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {pieData.map((entry, idx) => (
        <span
          key={entry.name}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 13,
            color: 'var(--text-body)',
            gap: 4,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: PIE_COLORS[idx % PIE_COLORS.length],
              display: 'inline-block',
            }}
          />
          {entry.name}
          <span style={{ color: 'var(--text-heading)', fontWeight: 400 }}>
            {entry.value}
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <Card
      title={
        <span style={{ fontWeight: 510, color: 'var(--text-heading)' }}>
          文物类别占比
        </span>
      }
      style={{
        borderRadius: 'var(--r-card)',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border)',
      }}
      styles={{ body: { padding: '16px 12px 12px' } }}
    >
      {loading ? (
        <div style={{ padding: '16px 24px' }}>
          <Skeleton active title={{ width: '30%' }} paragraph={{ rows: 4 }} />
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={(props: PieLabelRenderProps) => {
                  const percent = ((props.percent as number) ?? 0) * 100;
                  // Only show label if percentage >= 5%
                  if (percent >= 5) {
                    const name = (props.name as string) ?? '';
                    return `${name} ${percent.toFixed(0)}%`;
                  }
                  return '';
                }}
                labelLine={{ stroke: '#94a3b8' }}
              >
                {pieData.map((_, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={PIE_COLORS[idx % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [
                  `${value} 件`,
                  name as string,
                ]}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {renderLegend()}
        </>
      )}
    </Card>
  );
}

/* ── Word Cloud: d3-cloud SVG implementation ── */

function WordCloud({ data }: { data: WordCloudItem[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cloudWords, setCloudWords] = useState<CloudWord[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 180 });

  // Resize observer for responsive layout
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: Math.max(entry.contentRect.width, 300),
          height: Math.max(entry.contentRect.height, 150),
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // d3-cloud layout computation
  useEffect(() => {
    if (data.length === 0) return;

    const maxWeight = Math.max(...data.map((d) => d.weight));
    const minWeight = Math.min(...data.map((d) => d.weight));
    const range = maxWeight - minWeight || 1;

    const fontSize = (d: CloudWord) => {
      const word = data.find((w) => w.word === d.text);
      if (!word) return 14;
      const ratio = (word.weight - minWeight) / range;
      return 14 + ratio * 46; // 14px to 60px
    };

    const layout = cloud()
      .size([dimensions.width, dimensions.height])
      .words(
        data.map((d) => ({
          text: d.word,
          size: fontSize({ text: d.word } as CloudWord),
          weight: d.weight,
        })) as CloudWord[]
      )
      .padding(4)
      .rotate(() => (Math.random() > 0.7 ? 90 : 0)) // occasional vertical words
      .font('system-ui, -apple-system, sans-serif')
      .fontSize(fontSize)
      .on('end', (words: CloudWord[]) => {
        setCloudWords(words);
      });

    layout.start();
  }, [data, dimensions]);

  if (data.length === 0) return null;

  const maxWeight = Math.max(...data.map((d) => d.weight));
  const minWeight = Math.min(...data.map((d) => d.weight));
  const range = maxWeight - minWeight || 1;

  // Color gradient based on #533afd
  const colors = [
    '#533afd', '#6b5cf6', '#7c3aed', '#8b5cf6',
    '#a78bfa', '#c4b5fd', '#0ea5e9', '#10b981',
  ];

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        minHeight: 180,
        position: 'relative',
      }}
    >
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ display: 'block', margin: '0 auto' }}
      >
        <g transform={`translate(${dimensions.width / 2},${dimensions.height / 2})`}>
          {cloudWords.map((word, idx) => {
            const w = data.find((d) => d.word === word.text);
            const ratio = w ? (w.weight - minWeight) / range : 0;
            const colorIdx = Math.floor(ratio * (colors.length - 1));
            const color = colors[colorIdx];

            return (
              <AntTooltip key={`${word.text}-${idx}`} title={`词频: ${w?.weight ?? 0}`}>
                <text
                  textAnchor="middle"
                  transform={`translate(${word.x},${word.y}) rotate(${word.rotate})`}
                  style={{
                    fontSize: word.size,
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontWeight: 400 + Math.round(ratio * 300),
                    fill: color,
                    cursor: 'default',
                    opacity: 0.85,
                    transition: 'opacity 0.2s',
                  }}
                  className="wordcloud-word"
                  data-x={word.x}
                  data-y={word.y}
                  data-rotate={word.rotate}
                >
                  {word.text}
                </text>
              </AntTooltip>
            );
          })}
        </g>
      </svg>
      <style>{`
        .wordcloud-word:hover {
          opacity: 1 !important;
          filter: brightness(1.1);
        }
      `}</style>
    </div>
  );
}

/* ── Main Dashboard ── */

export default function Dashboard() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [eraData, setEraData] = useState<EraStat[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryStat[]>([]);
  const [wordCloudData, setWordCloudData] = useState<WordCloudItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    getOverview()
      .then(setOverview)
      .catch(() => {
        // overview stays null, cards show 0 via nullish coalescing
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    Promise.all([getStatsByEra(), getStatsByCategory(), getWordCloud()])
      .then(([eras, categories, words]) => {
        setEraData(eras);
        setCategoryData(categories);
        setWordCloudData(words);
      })
      .catch(() => {
        // charts stay empty
      })
      .finally(() => setChartLoading(false));
  }, []);

  return (
    <div>
      {/* ── Stat Cards ── */}
      <StatCards stats={overview} loading={loading} />

      {/* ── Charts Row ── */}
      <Row gutter={20} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <EraBarChart data={eraData} loading={chartLoading} />
        </Col>
        <Col span={12}>
          <CategoryPieChart data={categoryData} loading={chartLoading} />
        </Col>
      </Row>

      {/* ── Word Cloud ── */}
      <Card
        title={
          <span style={{ fontWeight: 510, color: 'var(--text-heading)' }}>
            文物关键词云
          </span>
        }
        extra={
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            基于文物描述生成
          </span>
        }
        style={{
          borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border)',
          marginBottom: 24,
        }}
        styles={{ body: { padding: '8px 24px 20px' } }}
      >
        {chartLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : (
          <WordCloud data={wordCloudData} />
        )}
      </Card>
    </div>
  );
}
