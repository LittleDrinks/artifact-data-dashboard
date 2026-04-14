import { Card, Row, Col, Statistic, Spin, Empty, Tooltip as AntTooltip } from 'antd';
import {
  AppstoreOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { useEffect, useState, useMemo } from 'react';
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

  return (
    <Row gutter={20} style={{ marginBottom: 24 }}>
      {cards.map((item) => (
        <Col span={6} key={item.title}>
          <Card
            loading={loading}
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

/* ── Era Order for historical sorting ── */

const ERA_ORDER: readonly string[] = [
  '新石器时代',
  '夏',
  '商',
  '西周',
  '东周',
  '春秋',
  '战国',
  '秦',
  '西汉',
  '东汉',
  '三国',
  '晋',
  '南北朝',
  '隋',
  '唐',
  '五代',
  '北宋',
  '南宋',
  '元',
  '明',
  '清',
  '民国',
];

/* ── Bar Chart: era distribution ── */

function EraBarChart({ data, loading }: { data: EraStat[]; loading: boolean }) {
  // Sort era data by historical order
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const aIdx = ERA_ORDER.indexOf(a.era);
      const bIdx = ERA_ORDER.indexOf(b.era);
      // Unknown eras go to the end
      if (aIdx === -1 && bIdx === -1) return 0;
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
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : sortedData.length === 0 ? (
        <Empty description="暂无年代数据" style={{ padding: '40px 0' }} />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={sortedData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <XAxis
              dataKey="era"
              tick={{ fontSize: 12, fill: '#64748d' }}
              axisLine={{ stroke: '#e5edf5' }}
              tickLine={false}
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
              maxBarSize={40}
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
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
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

/* ── Word Cloud: CSS implementation ── */

function WordCloud({ data }: { data: WordCloudItem[] }) {
  if (data.length === 0) return null;

  const maxWeight = Math.max(...data.map((d) => d.weight));
  const minWeight = Math.min(...data.map((d) => d.weight));
  const range = maxWeight - minWeight || 1;

  const GRADIENT_COLORS = [
    '#533afd', '#6366f1', '#2874ad', '#3d8b37',
    '#0ea5e9', '#10b981', '#9a6324', '#f59e0b',
    '#c45100', '#ec4899',
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '8px 16px',
        padding: '20px 0',
        minHeight: 180,
      }}
    >
      {data.map((item, idx) => {
        const ratio = (item.weight - minWeight) / range;
        const fontSize = 13 + ratio * 22;
        const fontWeight = Math.round(300 + ratio * 400); // 300–700
        const color = GRADIENT_COLORS[idx % GRADIENT_COLORS.length];
        return (
          <AntTooltip key={item.word} title={`词频: ${item.weight}`}>
            <span
              style={{
                fontSize,
                color,
                fontWeight,
                cursor: 'default',
                transition: 'transform 0.2s, opacity 0.2s',
                lineHeight: 1.5,
                padding: '2px 4px',
                opacity: 0.85,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = 'scale(1.18)';
                el.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = 'scale(1)';
                el.style.opacity = '0.85';
              }}
            >
              {item.word}
            </span>
          </AntTooltip>
        );
      })}
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
