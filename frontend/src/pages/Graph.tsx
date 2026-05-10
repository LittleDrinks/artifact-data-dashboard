/**
 * 知识图谱可视化页面
 * D3.js 力导向图 + Canvas 渲染（高性能）
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

/** Map API node type to internal group */
function resolveColor(type: string): string {
  return TYPE_COLORS[type] ?? '#8c8c8c';
}

function nodeRadius(type: string): number {
  return type === 'artifact' ? 14 : 8;
}

/* ── Component ── */

export default function Graph() {
  /* ── Refs ── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const drawCanvasRef = useRef<(() => void) | null>(null);
  const [searchParams] = useSearchParams();

  // Transform state (zoom/pan)
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  // Hovered node for tooltip
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const tooltipPosRef = useRef({ x: 0, y: 0 });
  // Drag state
  const dragNodeRef = useRef<SimNode | null>(null);
  const isDraggingRef = useRef(false);

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

  const allTypes = ['artifact', 'era', 'category', 'location', 'tag'] as const;
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(allTypes));

  const [exporting, setExporting] = useState(false);

  // Force parameters
  const [chargeStrength, setChargeStrength] = useState(-400);
  const [linkDistance, setLinkDistance] = useState(120);
  const [collisionPadding, setCollisionPadding] = useState(6);

  // Simulation data refs (for Canvas rendering)
  const simNodesRef = useRef<SimNode[]>([]);
  const simLinksRef = useRef<SimLink[]>([]);

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

  const prevTypesRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (prevTypesRef.current === null) {
      prevTypesRef.current = visibleTypes;
      return;
    }
    if (prevTypesRef.current !== visibleTypes) {
      prevTypesRef.current = visibleTypes;
      if (!searchKeyword.trim()) {
        fetchGraph(nodeLimit);
      }
    }
  }, [visibleTypes, nodeLimit, searchKeyword, fetchGraph]);

  /* ── Canvas render ── */
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const { x: tx, y: ty, k: tk } = transformRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(tk, tk);

    const nodes = simNodesRef.current;
    const links = simLinksRef.current;

    // Draw links
    ctx.strokeStyle = '#d4dee9';
    ctx.lineWidth = 1.2 / tk;
    for (const link of links) {
      const sx = (link.source as SimNode).x ?? 0;
      const sy = (link.source as SimNode).y ?? 0;
      const tx2 = (link.target as SimNode).x ?? 0;
      const ty2 = (link.target as SimNode).y ?? 0;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx2, ty2);
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodes) {
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const r = node.r;
      const color = resolveColor(node.type);

      // Highlight matched nodes
      const isMatched = activeSearchKeyword && matchedNodeIds.has(node.id);
      const isDimmed = activeSearchKeyword && !matchedNodeIds.has(node.id);

      ctx.globalAlpha = isDimmed ? 0.4 : 1;

      // Circle
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = isMatched ? '#ff6b6b' : '#fff';
      ctx.lineWidth = (isMatched ? 3 : 2) / tk;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#061b31';
      ctx.font = `${10 / tk}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(node.name, nx, ny + r + 4 / tk);

      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Draw hovered node tooltip
    if (hoveredNode && !isDraggingRef.current) {
      const nx = (hoveredNode.x ?? 0) * tk + tx;
      const ny = (hoveredNode.y ?? 0) * tk + ty;
      const text = `${hoveredNode.name} (${TYPE_NAMES[hoveredNode.type] ?? hoveredNode.type})`;
      ctx.font = '12px sans-serif';
      const metrics = ctx.measureText(text);
      const pw = metrics.width + 12;
      const ph = 24;
      const px = nx - pw / 2;
      const py = ny - (hoveredNode.r * tk) - ph - 6;

      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, nx, py + ph / 2);
    }
  }, [activeSearchKeyword, matchedNodeIds, hoveredNode]);

  // Keep ref in sync so D3 tick handler always calls latest version
  drawCanvasRef.current = drawCanvas;

  /* ── D3 simulation + Canvas setup ── */
  useEffect(() => {
    if (!graphData || !canvasRef.current || !containerRef.current) return;

    simulationRef.current?.stop();

    const container = containerRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    // Set canvas size (HiDPI)
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);

    // Reset transform
    transformRef.current = { x: W * 0.05, y: H * 0.05, k: 0.9 };

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

    simNodesRef.current = simNodes;
    simLinksRef.current = simLinks;

    // Simulation with Barnes-Hut optimization
    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .alphaDecay(0.05)
      .velocityDecay(0.4)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(linkDistance),
      )
      .force('charge', d3.forceManyBody().strength(chargeStrength).theta(0.9)) // Barnes-Hut O(n log n)
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force(
        'collision',
        d3.forceCollide<SimNode>().radius((d) => d.r + collisionPadding),
      )
      .on('tick', () => {
        drawCanvasRef.current?.();
      });

    simulationRef.current = simulation;

    // --- Mouse interactions ---
    // Find node under cursor
    const findNode = (mx: number, my: number): SimNode | null => {
      const { x: ttx, y: tty, k: ttk } = transformRef.current;
      // Convert screen coords to simulation coords
      const sx = (mx - ttx) / ttk;
      const sy = (my - tty) / ttk;
      for (let i = simNodes.length - 1; i >= 0; i--) {
        const n = simNodes[i];
        const dx = (n.x ?? 0) - sx;
        const dy = (n.y ?? 0) - sy;
        if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) {
          return n;
        }
      }
      return null;
    };

    // Pan and drag state
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

    // --- Named event handlers for proper cleanup ---
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x: ttx, y: tty, k: ttk } = transformRef.current;
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newK = Math.max(0.2, Math.min(5, ttk * factor));
      // Zoom towards cursor
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      transformRef.current = {
        x: mx - (mx - ttx) * (newK / ttk),
        y: my - (my - tty) * (newK / ttk),
        k: newK,
      };
      drawCanvas();
    };

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const node = findNode(mx, my);
      if (node) {
        // Start drag
        isDraggingRef.current = true;
        dragNodeRef.current = node;
        node.fx = node.x;
        node.fy = node.y;
        simulation.alphaTarget(0.3).restart();
      } else {
        // Start pan
        isPanning = true;
        panStart = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (isDraggingRef.current && dragNodeRef.current) {
        const { x: ttx, y: tty, k: ttk } = transformRef.current;
        dragNodeRef.current.fx = (mx - ttx) / ttk;
        dragNodeRef.current.fy = (my - tty) / ttk;
        drawCanvas();
      } else if (isPanning) {
        transformRef.current.x = e.clientX - panStart.x;
        transformRef.current.y = e.clientY - panStart.y;
        drawCanvas();
      } else {
        // Hover detection
        const node = findNode(mx, my);
        if (node !== hoveredNode) {
          setHoveredNode(node);
          tooltipPosRef.current = { x: mx, y: my };
        }
        canvas.style.cursor = node ? 'pointer' : 'grab';
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current && dragNodeRef.current) {
        isDraggingRef.current = false;
        dragNodeRef.current.fx = null;
        dragNodeRef.current.fy = null;
        dragNodeRef.current = null;
        simulation.alphaTarget(0);
      }
      isPanning = false;
    };

    const handleClick = (e: MouseEvent) => {
      if (isDraggingRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const node = findNode(mx, my);
      if (node) {
        handleNodeClick(node.id);
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('click', handleClick);

    // Initial draw
    drawCanvas();

    return () => {
      simulation.stop();
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('click', handleClick);
    };
  }, [graphData, activeSearchKeyword, matchedNodeIds]);

  /* ── Update force params ── */
  useEffect(() => {
    const sim = simulationRef.current;
    if (!sim) return;

    const linkForce = sim.force<d3.ForceLink<SimNode, SimLink>>('link');
    linkForce?.distance(linkDistance);

    const chargeForce = sim.force<d3.ForceManyBody<SimNode>>('charge');
    chargeForce?.strength(chargeStrength).theta(0.9);

    const collisionForce = sim.force<d3.ForceCollide<SimNode>>('collision');
    collisionForce?.radius((d: SimNode) => d.r + collisionPadding);

    sim.alpha(0.5).restart();
  }, [chargeStrength, linkDistance, collisionPadding]);

  /* ── Handlers ── */

  const handleResetZoom = useCallback(() => {
    if (!containerRef.current) return;
    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight;
    transformRef.current = { x: W * 0.05, y: H * 0.05, k: 0.9 };
    drawCanvas();
  }, [drawCanvas]);

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
        flex: 1,
        minHeight: 0,
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
            <Spin size="large" tip="加载图谱数据...">
              <div style={{ width: 100, height: 100 }} />
            </Spin>
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

        <canvas
          ref={canvasRef}
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
                    setVisibleTypes(new Set(['artifact']));
                  } else {
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
