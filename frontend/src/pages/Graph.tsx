/**
 * 知识图谱可视化页面
 * D3.js 力导向图 + Ant Design 控制面板
 */
import {
  Card,
  Input,
  Slider,
  Button,
  Descriptions,
  Tag,
  Spin,
  Empty,
  Space,
  Checkbox,
  message,
  Tooltip,
  Radio,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  ZoomInOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as d3 from 'd3';
import {
  getFullGraph,
  searchGraph,
  getNodeDetail,
  exportGraph,
} from '../api/graph';
import type {
  GraphNode,
  GraphLink,
  GraphDataResponse,
  NodeDetailResponse,
} from '../api/graph';

/* ── D3 simulation node / link types ── */

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: string;
  properties?: Record<string, unknown>;
  /** computed radius */
  r: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  relation: string;
}

/* ── Constants ── */

const TYPE_COLORS: Record<string, string> = {
  artifact: '#533afd',
  entity: '#533afd',
  era: '#c45100',
  category: '#3d8b37',
  location: '#2874ad',
  tag: '#8c8c8c',
};

const TYPE_NAMES: Record<string, string> = {
  artifact: '文物',
  entity: '实体',
  era: '朝代',
  category: '类别',
  location: '地点',
  tag: '标签',
};

/** Map API node type to internal group — demo uses richer types */
function resolveColor(type: string): string {
  return TYPE_COLORS[type] ?? '#8c8c8c';
}

function nodeRadius(type: string): number {
  return type === 'artifact' ? 14 : 8;
}

/* ── Component ── */

export default function Graph() {
  /* ── Refs ── */
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const isDraggingRef = useRef(false); // Prevent hover effects during drag
  const [searchParams] = useSearchParams();

  /* ── State ── */
  const [loading, setLoading] = useState(true);
  const [graphData, setGraphData] = useState<GraphDataResponse | null>(null);
  const [nodeLimit, setNodeLimit] = useState(100);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeSearchKeyword, setActiveSearchKeyword] = useState('');
  const [searchDepth, setSearchDepth] = useState(1);
  const [matchedNodeIds, setMatchedNodeIds] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<NodeDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Node type filter — default show ALL types to display relationships (edges)
  // This is critical for a good demo experience — users see artifact→era/category/location
  const allTypes = ['artifact', 'era', 'category', 'location', 'tag'] as const;
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(allTypes));

  // 导出状态
  const [exporting, setExporting] = useState(false);

  // Force parameters
  const [chargeStrength, setChargeStrength] = useState(-400);
  const [linkDistance, setLinkDistance] = useState(120);
  const [collisionPadding, setCollisionPadding] = useState(6);

  /* ── Fetch data ── */

  const fetchGraph = useCallback(
    async (limit: number, types?: Set<string>) => {
      setLoading(true);
      try {
        const t = types ?? visibleTypes;
        const data = await getFullGraph(limit, Array.from(t));
        setGraphData(data);
      } catch {
        message.error('获取图谱数据失败');
      } finally {
        setLoading(false);
      }
    },
    [visibleTypes],
  );

  const handleSearch = useCallback(async () => {
    if (!searchKeyword.trim()) {
      setActiveSearchKeyword('');
      setMatchedNodeIds(new Set());
      fetchGraph(nodeLimit);
      return;
    }
    setLoading(true);
    setActiveSearchKeyword(searchKeyword.trim());
    try {
      const data = await searchGraph(searchKeyword.trim(), Array.from(visibleTypes), searchDepth);
      setGraphData(data);
      setSelectedNode(null);
      // Identify matched nodes (nodes whose name contains the keyword)
      const kw = searchKeyword.trim().toLowerCase();
      const matchedIds = new Set<string>();
      data.nodes.forEach((n) => {
        if (n.name.toLowerCase().includes(kw)) {
          matchedIds.add(n.id);
        }
      });
      setMatchedNodeIds(matchedIds);
    } catch {
      message.error('搜索失败');
    } finally {
      setLoading(false);
    }
  }, [searchKeyword, searchDepth, nodeLimit, fetchGraph, visibleTypes]);

  const handleNodeClick = useCallback(async (nodeId: string) => {
    setDetailLoading(true);
    try {
      const detail = await getNodeDetail(nodeId);
      setSelectedNode(detail);
    } catch {
      message.error('获取节点详情失败');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /* ── Initial load ── */
  useEffect(() => {
    const searchParam = searchParams.get('search');
    if (searchParam) {
      setSearchKeyword(searchParam);
      setActiveSearchKeyword(searchParam);
      setLoading(true);
      searchGraph(searchParam, Array.from(visibleTypes), searchDepth)
        .then((data) => {
          setGraphData(data);
          // Identify matched nodes
          const kw = searchParam.toLowerCase();
          const matchedIds = new Set<string>();
          data.nodes.forEach((n) => {
            if (n.name.toLowerCase().includes(kw)) {
              matchedIds.add(n.id);
            }
          });
          setMatchedNodeIds(matchedIds);
        })
        .catch(() => message.error('搜索失败'))
        .finally(() => setLoading(false));
    } else {
      fetchGraph(nodeLimit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Re-fetch when visibleTypes changes (but not on initial mount)
  const prevTypesRef = useRef(visibleTypes);
  useEffect(() => {
    if (prevTypesRef.current !== visibleTypes) {
      prevTypesRef.current = visibleTypes;
      if (!searchKeyword.trim()) {
        fetchGraph(nodeLimit);
      }
    }
  }, [visibleTypes, nodeLimit, searchKeyword, fetchGraph]);

  /* ── D3 render effect ── */
  useEffect(() => {
    if (!graphData || !svgRef.current || !containerRef.current) return;

    // Stop previous simulation
    simulationRef.current?.stop();

    const container = containerRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', W).attr('height', H);

    // Defs — arrow marker
    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 6)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#94a3b8');

    // Zoom behavior
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoomBehavior);
    zoomRef.current = zoomBehavior;

    const g = svg.append('g');
    gRef.current = g;

    // Build simulation data
    const simNodes: SimNode[] = graphData.nodes.map((n: GraphNode) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      properties: n.properties,
      r: nodeRadius(n.type),
    }));

    const simLinks: SimLink[] = graphData.links.map((l: GraphLink) => ({
      source: l.source,
      target: l.target,
      relation: l.relation,
    }));

    // Links
    const linkSel = g
      .append('g')
      .attr('stroke', '#d4dee9')
      .attr('stroke-width', 1.2)
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('marker-end', 'url(#arrowhead)');

    // Link labels (shown on hover via CSS, always rendered for perf)
    const linkLabelSel = g
      .append('g')
      .selectAll('text')
      .data(simLinks)
      .join('text')
      .text((d) => d.relation)
      .attr('font-size', 8)
      .attr('fill', '#94a3b8')
      .attr('text-anchor', 'middle')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 3)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .style('pointer-events', 'none')
      .style('opacity', 0); // hidden by default, shown on link hover

    // Node groups
    const nodeSel = g
      .append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes, (d) => d.id)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => {
        handleNodeClick(d.id);
      })
      .on('mouseenter', (_event, d) => {
        // Skip hover effects during drag to prevent flickering
        if (isDraggingRef.current) return;

        // Highlight connected links
        const connectedIds = new Set<string>();
        linkSel.each(function (l) {
          const s = typeof l.source === 'object' ? (l.source as SimNode).id : l.source;
          const t = typeof l.target === 'object' ? (l.target as SimNode).id : l.target;
          if (s === d.id || t === d.id) {
            connectedIds.add(`${s}-${t}`);
            d3.select(this).attr('stroke', '#533afd').attr('stroke-width', 2);
          }
        });
        // Show labels for connected links
        linkLabelSel.each(function (l) {
          const s = typeof l.source === 'object' ? (l.source as SimNode).id : l.source;
          const t = typeof l.target === 'object' ? (l.target as SimNode).id : l.target;
          if (s === d.id || t === d.id) {
            d3.select(this).style('opacity', 1);
          }
        });
        // Dim unconnected nodes
        nodeSel
          .filter((n) => n.id !== d.id && !connectedIds.has(`${n.id}-${d.id}`) && !connectedIds.has(`${d.id}-${n.id}`))
          .attr('opacity', 0.25);
      })
      .on('mouseleave', () => {
        // Skip hover effects during drag to prevent flickering
        if (isDraggingRef.current) return;

        linkSel.attr('stroke', '#d4dee9').attr('stroke-width', 1.2);
        linkLabelSel.style('opacity', 0);
        // Reset group opacity to 1 (clears hover dimming)
        // Circle/text inside have their own opacity for search highlighting
        nodeSel.attr('opacity', 1);
      })
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            isDraggingRef.current = true;
            if (!event.active) simulationRef.current?.alphaTarget(0.1).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            isDraggingRef.current = false;
            // Reset highlighting — mouse position likely changed during drag
            linkSel.attr('stroke', '#d4dee9').attr('stroke-width', 1.2);
            linkLabelSel.style('opacity', 0);
            nodeSel.attr('opacity', 1);
            if (!event.active) simulationRef.current?.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    // Node circles
    nodeSel
      .append('circle')
      .attr('r', (d) => d.r)
      .attr('fill', (d) => resolveColor(d.type))
      .attr('stroke', (d) => {
        if (!activeSearchKeyword) return '#fff';
        // Matched nodes get red border, neighbors get normal border
        if (matchedNodeIds.has(d.id)) {
          return '#ff6b6b'; // Red for matched nodes
        }
        return '#fff';
      })
      .attr('stroke-width', (d) => {
        if (!activeSearchKeyword) return 2;
        if (matchedNodeIds.has(d.id)) {
          return 4; // Thicker border for matched nodes
        }
        return 2;
      })
      .attr('opacity', (d) => {
        if (!activeSearchKeyword) return 1;
        // Matched nodes fully visible, neighbors slightly dimmed
        if (matchedNodeIds.has(d.id)) {
          return 1;
        }
        return 0.6;
      });

    // Node labels
    nodeSel
      .append('text')
      .text((d) => d.name)
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => d.r + 12)
      .attr('font-size', 10)
      .attr('fill', '#061b31')
      .attr('font-weight', 400)
      .attr('opacity', (d) => {
        if (!activeSearchKeyword) return 1;
        if (matchedNodeIds.has(d.id)) {
          return 1;
        }
        return 0.6;
      })
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    // Simulation
    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(linkDistance),
      )
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force(
        'collision',
        d3.forceCollide<SimNode>().radius((d) => d.r + collisionPadding),
      )
      .on('tick', () => {
        linkSel
          .attr('x1', (d) => (d.source as SimNode).x ?? 0)
          .attr('y1', (d) => (d.source as SimNode).y ?? 0)
          .attr('x2', (d) => (d.target as SimNode).x ?? 0)
          .attr('y2', (d) => (d.target as SimNode).y ?? 0);

        linkLabelSel
          .attr('x', (d) => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
          .attr('y', (d) => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2 - 4);

        nodeSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

    simulationRef.current = simulation;

    // Initial zoom to fit
    svg.call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(W * 0.05, H * 0.05).scale(0.9),
    );

    return () => {
      simulation.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData, activeSearchKeyword, matchedNodeIds]);

  /* ── Update force params without re-rendering the whole graph ── */
  useEffect(() => {
    const sim = simulationRef.current;
    if (!sim) return;

    const linkForce = sim.force<d3.ForceLink<SimNode, SimLink>>('link');
    linkForce?.distance(linkDistance);

    const chargeForce = sim.force<d3.ForceManyBody<SimNode>>('charge');
    chargeForce?.strength(chargeStrength);

    const collisionForce = sim.force<d3.ForceCollide<SimNode>>('collision');
    collisionForce?.radius((d: SimNode) => d.r + collisionPadding);

    sim.alpha(0.5).restart();
  }, [chargeStrength, linkDistance, collisionPadding]);

  /* ── Handlers ── */

  const handleResetZoom = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    svg
      .transition()
      .duration(500)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  }, []);

  const handleReheat = useCallback(() => {
    simulationRef.current?.alpha(1).restart();
  }, []);

  const handleResetParams = useCallback(() => {
    setChargeStrength(-400);
    setLinkDistance(120);
    setCollisionPadding(6);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportGraph(nodeLimit);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  }, [nodeLimit]);

  /* ── Render ── */

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 64px)',
        gap: 0,
        background: '#f8fafc',
      }}
    >
      {/* ── Left: Graph canvas ── */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          background: '#fff',
          borderRadius: 'var(--r-card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}
      >
        {loading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.7)',
              zIndex: 10,
            }}
          >
            <Spin size="large" tip="加载图谱数据..." />
          </div>
        )}

        {!loading && graphData && graphData.nodes.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Empty description="暂无图谱数据" />
          </div>
        )}

        <svg
          ref={svgRef}
          style={{
            width: '100%',
            height: '100%',
            cursor: 'grab',
          }}
        />

        {/* Stats bar */}
        {graphData && graphData.nodes.length > 0 && (() => {
          const artCount = graphData.nodes.filter(n => n.type === 'artifact').length;
          const attrCount = graphData.nodes.filter(n => n.type !== 'artifact').length;
          return (
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                left: 12,
                fontSize: 12,
                color: 'var(--text-muted)',
                background: 'rgba(255,255,255,0.9)',
                padding: '4px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
              }}
            >
              {artCount} 个文物{attrCount > 0 ? ` · ${attrCount} 个属性` : ''} · {graphData.total_links} 关系
            </div>
          );
        })()}

        {/* Legend */}
        {graphData && graphData.nodes.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              display: 'flex',
              gap: 12,
              background: 'rgba(255,255,255,0.9)',
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              fontSize: 12,
            }}
          >
            {Object.entries(TYPE_NAMES).map(([type, label]) => (
              <span
                key={type}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: TYPE_COLORS[type],
                    display: 'inline-block',
                  }}
                />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Right: Control panel ── */}
      <div
        style={{
          width: 320,
          marginLeft: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflowY: 'auto',
          paddingRight: 4,
        }}
      >
        {/* Search */}
        <Card
          size="small"
          title={
            <span style={{ fontWeight: 510, fontSize: 14 }}>
              <SearchOutlined style={{ marginRight: 6 }} />
              搜索文物
            </span>
          }
          style={{
            borderRadius: 'var(--r-card)',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--border)',
          }}
        >
          <Input.Search
            placeholder="输入关键词搜索文物..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onSearch={handleSearch}
            enterButton
            allowClear
          />
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              展开层级:
            </span>
            <Radio.Group
              value={searchDepth}
              onChange={(e) => setSearchDepth(e.target.value)}
              size="small"
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value={1}>1级</Radio.Button>
              <Radio.Button value={2}>2级</Radio.Button>
            </Radio.Group>
          </div>
          {activeSearchKeyword && graphData && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              找到 <strong style={{ color: '#ff6b6b' }}>{matchedNodeIds.size}</strong> 个匹配
              {graphData.nodes.length - matchedNodeIds.size > 0 && (
                <span>
                  ，<strong>{graphData.nodes.length - matchedNodeIds.size}</strong> 个关联节点
                </span>
              )}
              ，<strong>{graphData.total_links}</strong> 条关系
            </div>
          )}
          <Button
            type="link"
            size="small"
            style={{ marginTop: 8, padding: 0 }}
            onClick={() => {
              setSearchKeyword('');
              setActiveSearchKeyword('');
              setMatchedNodeIds(new Set());
              fetchGraph(nodeLimit);
            }}
          >
            显示全图
          </Button>
        </Card>

        {/* Node limit slider */}
        <Card
          size="small"
          title={
            <span style={{ fontWeight: 510, fontSize: 14 }}>
              <ZoomInOutlined style={{ marginRight: 6 }} />
              数据范围
            </span>
          }
          style={{
            borderRadius: 'var(--r-card)',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            文物数量上限: <strong style={{ color: 'var(--text-heading)' }}>{nodeLimit}</strong>
            <br />
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              显示关系时节点总数 = 文物 + 朝代 + 类别 + 地点 + 标签
            </span>
          </div>
          <Slider
            min={10}
            max={500}
            step={10}
            value={nodeLimit}
            onChange={(v) => setNodeLimit(v)}
            onAfterChange={() => fetchGraph(nodeLimit)}
          />
        </Card>

        {/* Node type filter */}
        <Card
          size="small"
          title={
            <span style={{ fontWeight: 510, fontSize: 14 }}>
              <InfoCircleOutlined style={{ marginRight: 6 }} />
              节点类型
            </span>
          }
          style={{
            borderRadius: 'var(--r-card)',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ marginBottom: 10 }}>
            <Tooltip
              title={
                visibleTypes.size === allTypes.length
                  ? '切换到仅显示文物节点，图谱更清晰'
                  : '显示文物与属性（朝代/类别/地点/标签）的关系，节点数量会大幅增加'
              }
            >
              <Button
                size="small"
                type={visibleTypes.size === allTypes.length ? 'default' : 'primary'}
                onClick={() => {
                  if (visibleTypes.size === allTypes.length) {
                    // Currently showing all -> show only artifacts
                    setVisibleTypes(new Set(['artifact']));
                  } else {
                    // Currently partial -> show all to see relationships
                    setVisibleTypes(new Set(allTypes));
                  }
                }}
                block
                icon={visibleTypes.size === allTypes.length ? undefined : <WarningOutlined />}
              >
                {visibleTypes.size === allTypes.length ? '精简视图（仅文物）' : '显示关系'}
              </Button>
            </Tooltip>
            {visibleTypes.size === allTypes.length && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                图谱包含属性节点，可能较为密集
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {allTypes.map((type) => (
              <label
                key={type}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}
              >
                <Checkbox
                  checked={visibleTypes.has(type)}
                  onChange={(e) => {
                    const next = new Set(visibleTypes);
                    if (e.target.checked) {
                      next.add(type);
                    } else {
                      next.delete(type);
                    }
                    if (next.size > 0) {
                      setVisibleTypes(next);
                    }
                  }}
                />
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: TYPE_COLORS[type],
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                {TYPE_NAMES[type]}
              </label>
            ))}
          </div>
        </Card>

        {/* Force parameters */}
        <Card
          size="small"
          title={
            <span style={{ fontWeight: 510, fontSize: 14 }}>
              <ReloadOutlined style={{ marginRight: 6 }} />
              力导向参数
            </span>
          }
          style={{
            borderRadius: 'var(--r-card)',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                marginBottom: 4,
              }}
            >
              <span style={{ color: 'var(--text-body)' }}>斥力强度</span>
              <span style={{ color: 'var(--text-heading)', fontFamily: 'var(--mono)' }}>
                {chargeStrength}
              </span>
            </div>
            <Slider
              min={-1200}
              max={-50}
              step={50}
              value={chargeStrength}
              onChange={(v) => setChargeStrength(v)}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                marginBottom: 4,
              }}
            >
              <span style={{ color: 'var(--text-body)' }}>连接距离</span>
              <span style={{ color: 'var(--text-heading)', fontFamily: 'var(--mono)' }}>
                {linkDistance}
              </span>
            </div>
            <Slider
              min={40}
              max={300}
              step={10}
              value={linkDistance}
              onChange={(v) => setLinkDistance(v)}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                marginBottom: 4,
              }}
            >
              <span style={{ color: 'var(--text-body)' }}>碰撞间距</span>
              <span style={{ color: 'var(--text-heading)', fontFamily: 'var(--mono)' }}>
                {collisionPadding}
              </span>
            </div>
            <Slider
              min={2}
              max={30}
              step={2}
              value={collisionPadding}
              onChange={(v) => setCollisionPadding(v)}
            />
          </div>

          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button size="small" onClick={handleResetParams}>
              重置参数
            </Button>
            <Button size="small" onClick={handleReheat}>
              重新模拟
            </Button>
            <Button size="small" onClick={handleResetZoom}>
              重置视图
            </Button>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              loading={exporting}
              onClick={handleExport}
            >
              导出
            </Button>
          </Space>
        </Card>

        {/* Node detail */}
        <Card
          size="small"
          title={
            <span style={{ fontWeight: 510, fontSize: 14 }}>
              <InfoCircleOutlined style={{ marginRight: 6 }} />
              文物详情
            </span>
          }
          style={{
            borderRadius: 'var(--r-card)',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--border)',
          }}
        >
          {detailLoading ? (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <Spin />
            </div>
          ) : selectedNode ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 510,
                    color: 'var(--text-heading)',
                    marginBottom: 6,
                  }}
                >
                  {selectedNode.node.name}
                </div>
                <Tag color={resolveColor(selectedNode.node.type) === '#533afd' ? 'purple' : undefined} style={{ marginRight: 0 }}>
                  {TYPE_NAMES[selectedNode.node.type] ?? selectedNode.node.type}
                </Tag>
              </div>

              {selectedNode.node.properties &&
                Object.keys(selectedNode.node.properties).length > 0 && (
                  <Descriptions
                    size="small"
                    column={1}
                    bordered
                    style={{ marginBottom: 12 }}
                    styles={{
                      label: { fontSize: 12, color: 'var(--text-muted)', width: 80 },
                      content: { fontSize: 12 },
                    }}
                  >
                    {Object.entries(selectedNode.node.properties)
                      .filter(([, v]) => v != null && v !== '')
                      .slice(0, 8)
                      .map(([key, value]) => (
                        <Descriptions.Item key={key} label={key}>
                          {String(value)}
                        </Descriptions.Item>
                      ))}
                  </Descriptions>
                )}

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 510,
                  color: 'var(--text-heading)',
                  marginBottom: 8,
                }}
              >
                关联文物 ({selectedNode.neighbors.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedNode.neighbors.map((neighbor) => (
                  <Tag
                    key={neighbor.id}
                    color={
                      resolveColor(neighbor.type) === '#533afd'
                        ? 'purple'
                        : undefined
                    }
                    style={{ cursor: 'pointer', marginBottom: 2 }}
                    onClick={() => handleNodeClick(neighbor.id)}
                  >
                    {neighbor.name}
                  </Tag>
                ))}
              </div>

              {selectedNode.links.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 510,
                      color: 'var(--text-heading)',
                      marginTop: 12,
                      marginBottom: 8,
                    }}
                  >
                    关系 ({selectedNode.links.length})
                  </div>
                  <div
                    style={{
                      maxHeight: 200,
                      overflowY: 'auto',
                      fontSize: 12,
                    }}
                  >
                    {selectedNode.links.map((link, idx) => {
                      const otherName =
                        link.source === selectedNode.node.id
                          ? link.target
                          : link.source;
                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '3px 0',
                            borderBottom: '1px solid #f0f0f0',
                          }}
                        >
                          <span style={{ color: 'var(--text-muted)' }}>
                            {link.relation}
                          </span>
                          <span
                            style={{
                              color: 'var(--text-heading)',
                              cursor: 'pointer',
                            }}
                            onClick={() => handleNodeClick(otherName)}
                          >
                            {otherName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="点击文物查看详情"
              style={{ padding: '12px 0' }}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
