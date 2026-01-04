import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  Card,
  Input,
  Button,
  Spin,
  Alert,
  Modal,
  Descriptions,
  Empty,
  Divider,
  InputNumber,
  Radio,
  Row,
  Col,
  Space,
  Switch,
  Typography
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import * as d3 from 'd3';
import { useLocation } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { getGraphData, getEntityDetails } from '../services/graph.service';

const KnowledgeGraph = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [entityDetailsVisible, setEntityDetailsVisible] = useState(false);
  const [entityDetailsLoading, setEntityDetailsLoading] = useState(false);
  const [entityDetails, setEntityDetails] = useState(null);
  const [relationshipStatMode, setRelationshipStatMode] = useState('entityType');

  const defaultForceSettings = useMemo(
    () => ({
      linkDistance: 120,
      linkStrength: 0.3,
      chargeStrength: -800,
      chargeDistanceMax: 500,
      collisionRadius: 35,
      centerStrength: 0.1,
      xStrength: 0.05,
      yStrength: 0.05,
      alphaDecay: 0.02,
      velocityDecay: 0.3
    }),
    []
  );

  const defaultDisplaySettings = useMemo(
    () => ({
      showNodeLabels: true,
      showLinkLabels: true,
      labelsAfterStabilized: false,
      rafThrottle: true
    }),
    []
  );

  const [forceSettingsDraft, setForceSettingsDraft] = useState(defaultForceSettings);
  const [forceSettings, setForceSettings] = useState(defaultForceSettings);
  const [displaySettingsDraft, setDisplaySettingsDraft] = useState(defaultDisplaySettings);
  const [displaySettings, setDisplaySettings] = useState(defaultDisplaySettings);

  // 每种 type 的节点上限；null/undefined 表示不限
  const [typeLimitsDraft, setTypeLimitsDraft] = useState({});
  const [typeLimits, setTypeLimits] = useState({});

  const [graphHeight, setGraphHeight] = useState(600);

  const svgRef = useRef(null);
  const graphAreaRef = useRef(null);
  const simulationRef = useRef(null);
  const zoomRef = useRef(null);
  const svgSelectionRef = useRef(null);
  const gSelectionRef = useRef(null);
  const hasAutoFitRef = useRef(false);
  const focusNodeIdRef = useRef(null);
  const highlightNodeIdsRef = useRef(new Set());
  const [highlightCount, setHighlightCount] = useState(0);
  const highlightOverflowRef = useRef(false);
  const location = useLocation();

  // 方案B：默认拖拽释放；双击/Shift+拖拽可钉住节点
  const pinnedNodeIdsRef = useRef(new Set());
  const pinnedPositionsRef = useRef(new Map());
  const [pinnedCount, setPinnedCount] = useState(0);

  // 从 Chat 跳转时：把“高亮集合”自动钉住一次（在 D3 初始化后应用）
  const autoPinNodeIdsRef = useRef(null);

  const setPinnedForSelected = useCallback((nextPinned) => {
    const entity = selectedEntity;
    if (!entity?.id) return;
    const id = String(entity.id);
    const pinnedSet = pinnedNodeIdsRef.current;

    const simulation = simulationRef.current;
    const simNodes = simulation?.nodes ? simulation.nodes() : [];
    const simNode = Array.isArray(simNodes) ? simNodes.find(n => String(n.id) === id) : null;

    if (nextPinned) {
      pinnedSet.add(id);
      const px = Number.isFinite(entity.__clickedX) ? entity.__clickedX : (Number.isFinite(simNode?.x) ? simNode.x : 500);
      const py = Number.isFinite(entity.__clickedY) ? entity.__clickedY : (Number.isFinite(simNode?.y) ? simNode.y : 300);
      pinnedPositionsRef.current.set(id, { x: px, y: py });
      if (simNode) {
        simNode.fx = px;
        simNode.fy = py;
        simulation.alphaTarget(0.05).restart();
        simulation.alphaTarget(0);
      }
    } else {
      pinnedSet.delete(id);
      pinnedPositionsRef.current.delete(id);
      // 若该节点来自 Chat 跳转的 focus，取消钉住时一并清掉 focus，避免黑框“看起来取消不了”
      if (focusNodeIdRef.current && String(focusNodeIdRef.current) === id) {
        focusNodeIdRef.current = null;
      }
      if (simNode) {
        simNode.fx = null;
        simNode.fy = null;
        simulation.alphaTarget(0.05).restart();
        simulation.alphaTarget(0);
      }
    }

    // 更新节点描边（不触发重布局）
    const focusId = focusNodeIdRef.current;
    d3.select(svgRef.current)
      .selectAll('circle')
      .attr('stroke', d => {
        const nid = String(d.id);
        if (pinnedSet.has(nid)) return '#000';
        return (focusId && String(d.id) === String(focusId) ? '#000' : '#fff');
      })
      .attr('stroke-width', d => {
        const nid = String(d.id);
        if (pinnedSet.has(nid)) return 4;
        return (focusId && String(d.id) === String(focusId) ? 4 : 2);
      });

    setPinnedCount(pinnedSet.size);
  }, [selectedEntity]);

  // 左侧图谱区域高度自适应：尽量占满视口剩余空间
  useEffect(() => {
    const MIN_HEIGHT = 420;
    const BOTTOM_GAP = 24;

    const updateHeight = () => {
      const el = graphAreaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - rect.top - BOTTOM_GAP));
      setGraphHeight(next);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [error, loading]);

  const normalizeType = useCallback((type) => {
    const key = (type == null ? '' : String(type)).trim();
    return key ? key.toLowerCase() : 'node';
  }, []);

  const availableTypes = useMemo(() => {
    const types = new Set((graphData.nodes || []).map(n => normalizeType(n.type)));
    return Array.from(types).sort();
  }, [graphData.nodes, normalizeType]);

  const applyTypeLimits = useCallback((raw, limits) => {
    const rawNodes = raw?.nodes || [];
    const rawEdges = raw?.edges || [];
    if (!rawNodes.length) return { nodes: [], edges: [] };

    const adjacency = new Map();
    const addNeighbor = (a, b) => {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      adjacency.get(a).add(b);
    };
    for (const e of rawEdges) {
      addNeighbor(String(e.source), String(e.target));
      addNeighbor(String(e.target), String(e.source));
    }

    const priorityIds = new Set();
    const focusId = focusNodeIdRef.current ? String(focusNodeIdRef.current) : null;
    if (focusId) priorityIds.add(focusId);

    // 保留焦点节点的一阶邻居，便于理解上下文
    for (const id of Array.from(priorityIds)) {
      const neighbors = adjacency.get(id);
      if (!neighbors) continue;
      for (const nb of neighbors) priorityIds.add(String(nb));
    }

    const counts = new Map();
    const kept = [];
    const keptIds = new Set();

    const getLimit = (type) => {
      const key = normalizeType(type);
      const v = limits?.[key];
      if (v === null || v === undefined) return null;
      const num = Number(v);
      if (!Number.isFinite(num)) return null;
      return Math.max(0, Math.floor(num));
    };

    for (const n of rawNodes) {
      const id = String(n.id);
      const type = normalizeType(n.type);
      const limit = getLimit(type);

      if (priorityIds.has(id)) {
        kept.push(n);
        keptIds.add(id);
        counts.set(type, (counts.get(type) || 0) + 1);
        continue;
      }

      if (limit === null) {
        kept.push(n);
        keptIds.add(id);
        counts.set(type, (counts.get(type) || 0) + 1);
        continue;
      }

      if (limit === 0) {
        continue;
      }

      const current = counts.get(type) || 0;
      if (current >= limit) continue;
      kept.push(n);
      keptIds.add(id);
      counts.set(type, current + 1);
    }

    const filteredEdges = rawEdges.filter(e => keptIds.has(String(e.source)) && keptIds.has(String(e.target)));

    // 若裁剪导致孤立点过多，默认去除无边节点（但保留优先节点）
    const degree = new Map();
    for (const e of filteredEdges) {
      const s = String(e.source);
      const t = String(e.target);
      degree.set(s, (degree.get(s) || 0) + 1);
      degree.set(t, (degree.get(t) || 0) + 1);
    }
    const finalNodes = kept.filter(n => {
      const id = String(n.id);
      if (priorityIds.has(id)) return true;
      return (degree.get(id) || 0) > 0;
    });

    return { nodes: finalNodes, edges: filteredEdges };
  }, [normalizeType]);

  const displayedGraphData = useMemo(() => {
    return applyTypeLimits(graphData, typeLimits);
  }, [applyTypeLimits, graphData, typeLimits]);

  const MAX_HIGHLIGHTS = 20;
  const normalizeIdList = useCallback((ids) => {
    if (!Array.isArray(ids)) return [];
    const uniq = [];
    const seen = new Set();
    for (const raw of ids) {
      const id = raw == null ? '' : String(raw);
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      uniq.push(id);
    }
    return uniq;
  }, []);

  const replaceHighlights = useCallback((ids) => {
    const list = normalizeIdList(ids);
    highlightOverflowRef.current = list.length > MAX_HIGHLIGHTS;
    const finalList = list.slice(0, MAX_HIGHLIGHTS);
    highlightNodeIdsRef.current = new Set(finalList);
    setHighlightCount(finalList.length);
  }, [normalizeIdList]);

  const clearAllHighlights = useCallback(() => {
    highlightOverflowRef.current = false;
    highlightNodeIdsRef.current = new Set();
    setHighlightCount(0);
  }, []);

  const toggleHighlight = useCallback((id) => {
    const sid = id == null ? '' : String(id);
    if (!sid) return;

    const next = new Set(highlightNodeIdsRef.current);
    if (next.has(sid)) {
      next.delete(sid);
      highlightOverflowRef.current = false;
      highlightNodeIdsRef.current = next;
      setHighlightCount(next.size);
      return;
    }

    if (next.size >= MAX_HIGHLIGHTS) {
      highlightOverflowRef.current = true;
      return;
    }

    next.add(sid);
    highlightNodeIdsRef.current = next;
    setHighlightCount(next.size);
  }, []);

  const displayedTypeCounts = useMemo(() => {
    const map = new Map();
    for (const n of displayedGraphData.nodes || []) {
      const type = normalizeType(n.type);
      map.set(type, (map.get(type) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));
  }, [displayedGraphData.nodes, normalizeType]);

  // 获取图谱数据
  const fetchGraphData = useCallback(async (searchKeyword = '') => {
    setLoading(true);
    
    try {
      const response = await getGraphData(searchKeyword);
      const nextGraph = {
        nodes: response.data.nodes,
        edges: response.data.edges
      };
      setGraphData(nextGraph);
      hasAutoFitRef.current = false;
      setError(null);
      return nextGraph;
    } catch (err) {
      console.error('获取知识图谱数据失败:', err);
      setError('获取知识图谱数据失败，请稍后重试');
      setGraphData({ nodes: [], edges: [] });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始化加载图谱数据
  useEffect(() => {
    // 1) 允许从 Chat 跳转携带图谱数据
    const stateGraph = location.state && location.state.graphData;
    if (stateGraph && stateGraph.nodes && stateGraph.edges) {
      setGraphData(stateGraph);
      setLoading(false);
      setError(null);
      return;
    }

    // 2) 允许通过 sessionStorage 传递（避免刷新丢失）
    try {
      const stored = sessionStorage.getItem('chatGraphData');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.nodes && parsed.edges) {
          let nextAutoPinIds = null;

          try {
            const focusId = sessionStorage.getItem('chatGraphFocusNodeId');
            focusNodeIdRef.current = focusId ? String(focusId) : null;
            sessionStorage.removeItem('chatGraphFocusNodeId');
          } catch (e) {
            focusNodeIdRef.current = null;
          }

          try {
            const raw = sessionStorage.getItem('chatGraphHighlightNodeIds');
            if (raw) {
              const parsedIds = JSON.parse(raw);
              replaceHighlights(parsedIds);
              if (Array.isArray(parsedIds) && parsedIds.length > 0) {
                nextAutoPinIds = parsedIds.map(String);
              }
              sessionStorage.removeItem('chatGraphHighlightNodeIds');
            } else if (focusNodeIdRef.current) {
              replaceHighlights([String(focusNodeIdRef.current)]);
              nextAutoPinIds = [String(focusNodeIdRef.current)];
            }
          } catch (e) {
            // ignore
          }

          if (Array.isArray(nextAutoPinIds) && nextAutoPinIds.length > 0) {
            autoPinNodeIdsRef.current = new Set(nextAutoPinIds.filter(Boolean));
          }

          setGraphData(parsed);
          setLoading(false);
          setError(null);
          // 只消费一次
          sessionStorage.removeItem('chatGraphData');
          return;
        }
      }
    } catch (e) {
      // ignore
    }

    fetchGraphData();
  }, [fetchGraphData, location.state, replaceHighlights, toggleHighlight]);

  // 清理D3模拟
  useEffect(() => {
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, []);
  
  // 处理搜索
  const deriveSearchHighlights = useCallback((kw, nodes) => {
    const text = (kw || '').trim();
    if (!text) return [];
    const lowered = text.toLowerCase();
    const ids = [];
    for (const n of (nodes || [])) {
      const label = (n?.label || '').toString();
      const isMatch = label.toLowerCase().includes(lowered);
      if (isMatch) ids.push(String(n.id));
    }
    // 优先匹配到的节点；若无匹配，则退化为 artifact 节点
    if (ids.length > 0) return ids;
    return (nodes || []).filter(n => n?.type === 'artifact').map(n => String(n.id));
  }, []);

  const handleSearch = async () => {
    const kw = (keyword || '').trim();
    const next = await fetchGraphData(kw);
    if (!kw) {
      clearAllHighlights();
      return;
    }
    const ids = deriveSearchHighlights(kw, next?.nodes || []);
    replaceHighlights(ids);
  };
  
  // 处理节点点击
  const handleNodeClick = async (node) => {
    // 只用于详情展示；避免把它作为图谱裁剪/布局依赖，防止点开详情触发重布局
    setSelectedEntity({
      ...node,
      __clickedX: node?.x,
      __clickedY: node?.y
    });
    setEntityDetailsVisible(true);
    setEntityDetailsLoading(true);
    
    try {
      const response = await getEntityDetails(node.type, node.id);
      setEntityDetails(response.data);
    } catch (err) {
      console.error('获取实体详情失败:', err);
      setEntityDetails(null);
    } finally {
      setEntityDetailsLoading(false);
    }
  };

  // 节点颜色映射
  const getNodeColor = (type) => {
    const colorMap = {
      artifact: '#1890ff',
      category: '#52c41a',
      era: '#fa8c16',
      author: '#722ed1',
      location: '#eb2f96',
      material: '#f5222d'
    };
    return colorMap[type] || '#666';
  };

  // D3力导向图初始化和更新
  useEffect(() => {
    if (!svgRef.current || displayedGraphData.nodes.length === 0) {
      return;
    }

    const width = 1000;
    const height = graphHeight || 600;
    
    // 清空之前的内容
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // 添加缩放功能
    const g = svg.append('g');
    
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      // 降低滚轮缩放灵敏度（默认值对部分鼠标/触控板会显得过于“跳”）
      .wheelDelta((event) => {
        // d3 默认实现会考虑 deltaMode，这里保持同样思路但把整体幅度调小
        const modeScale = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? 800 : 1);
        return (-event.deltaY * modeScale) / 1500;
      })
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);

    zoomRef.current = zoom;
    svgSelectionRef.current = svg;
    gSelectionRef.current = g;

    // 准备数据
    const nodes = displayedGraphData.nodes.map(d => {
      const node = { ...d, x: width / 2, y: height / 2 };
      const id = String(node.id);
      const pinned = pinnedPositionsRef.current.get(id);
      if (pinned && Number.isFinite(pinned.x) && Number.isFinite(pinned.y)) {
        node.fx = pinned.x;
        node.fy = pinned.y;
      }
      return node;
    });
    const links = displayedGraphData.edges.map(d => ({ ...d }));

    // 创建力模拟
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(forceSettings.linkDistance)
        .strength(forceSettings.linkStrength))
      .force('charge', d3.forceManyBody()
        .strength(forceSettings.chargeStrength)
        .distanceMax(forceSettings.chargeDistanceMax))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(forceSettings.centerStrength))
      .force('collision', d3.forceCollide().radius(forceSettings.collisionRadius))
      .force('x', d3.forceX(width / 2).strength(forceSettings.xStrength))
      .force('y', d3.forceY(height / 2).strength(forceSettings.yStrength))
      .alphaDecay(forceSettings.alphaDecay)
      .velocityDecay(forceSettings.velocityDecay);

    simulationRef.current = simulation;

    // 从 Chat 跳转时：把高亮节点集合自动钉住一次（真钉住：写入 pinnedSet + 设置 fx/fy）
    const applyAutoPinOnce = () => {
      const autoPinIds = autoPinNodeIdsRef.current;
      if (!autoPinIds || autoPinIds.size === 0) return;

      const pinnedSet = pinnedNodeIdsRef.current;
      for (const rawId of autoPinIds) {
        const id = String(rawId);
        if (!id) continue;
        const n = nodes.find(x => String(x.id) === id);
        if (!n) continue;

        pinnedSet.add(id);
        const px = Number.isFinite(n.x) ? n.x : width / 2;
        const py = Number.isFinite(n.y) ? n.y : height / 2;
        pinnedPositionsRef.current.set(id, { x: px, y: py });
        n.fx = px;
        n.fy = py;
      }

      setPinnedCount(pinnedSet.size);
      // 轻微推动一下，让布局稳定到“钉住态”
      simulation.alphaTarget(0.08).restart();
      simulation.alphaTarget(0);

      // 只应用一次，避免后续搜索/刷新重复钉住
      autoPinNodeIdsRef.current = null;
    };

    applyAutoPinOnce();

    // 创建箭头标记
    svg.append('defs').selectAll('marker')
      .data(['arrow'])
      .join('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#ccc');

    // 绘制连线
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#ccc')
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrow)');

    // 绘制连线标签（可选）
    const linkLabel = displaySettings.showLinkLabels
      ? g.append('g')
        .selectAll('text')
        .data(links)
        .join('text')
        .attr('class', 'link-label')
        .attr('font-size', 10)
        .attr('fill', '#666')
        .attr('text-anchor', 'middle')
        .style('display', displaySettings.labelsAfterStabilized ? 'none' : null)
        .text(d => d.label)
      : null;

    // 绘制节点
    const getFocusId = () => focusNodeIdRef.current;
    const updatePinnedStyles = () => {
      g.selectAll('circle')
        .attr('stroke', n => {
          const id = String(n.id);
          if (pinnedNodeIdsRef.current.has(id)) return '#000';
          const focusId = getFocusId();
          return (focusId && String(n.id) === String(focusId) ? '#000' : '#fff');
        })
        .attr('stroke-width', n => {
          const id = String(n.id);
          if (pinnedNodeIdsRef.current.has(id)) return 4;
          const focusId = getFocusId();
          return (focusId && String(n.id) === String(focusId) ? 4 : 2);
        });
    };

    const togglePin = (d) => {
      const id = String(d.id);
      const pinnedSet = pinnedNodeIdsRef.current;

      if (pinnedSet.has(id)) {
        pinnedSet.delete(id);
        pinnedPositionsRef.current.delete(id);
        d.fx = null;
        d.fy = null;
        // 若该节点是从 Chat 跳转时的 focus，高亮黑框应当随“解钉”一并消失
        if (focusNodeIdRef.current && String(focusNodeIdRef.current) === id) {
          focusNodeIdRef.current = null;
        }
      } else {
        pinnedSet.add(id);
        const px = Number.isFinite(d.x) ? d.x : width / 2;
        const py = Number.isFinite(d.y) ? d.y : height / 2;
        pinnedPositionsRef.current.set(id, { x: px, y: py });
        d.fx = px;
        d.fy = py;
      }

      setPinnedCount(pinnedSet.size);
      updatePinnedStyles();
    };

    const node = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 20)
      .attr('fill', d => getNodeColor(d.type))
      .attr('stroke', d => {
        const id = String(d.id);
        if (pinnedNodeIdsRef.current.has(id)) return '#000';
        const focusId = getFocusId();
        return (focusId && String(d.id) === String(focusId) ? '#000' : '#fff');
      })
      .attr('stroke-width', d => {
        const id = String(d.id);
        if (pinnedNodeIdsRef.current.has(id)) return 4;
        const focusId = getFocusId();
        return (focusId && String(d.id) === String(focusId) ? 4 : 2);
      })
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        // 若刚发生过拖拽，d3 会将 click 标记为 defaultPrevented
        // 这里直接忽略，避免 Shift+拖拽/微拖导致“先钉住后又被 click 立即取消”
        if (event.defaultPrevented) return;

        event.stopPropagation();

        // Ctrl/⌘ + 单击：切换高亮（支持多选，不打开详情）
        const ctrlPressed = Boolean(event?.ctrlKey || event?.metaKey || (event?.sourceEvent && (event.sourceEvent.ctrlKey || event.sourceEvent.metaKey)));
        if (ctrlPressed) {
          toggleHighlight(d.id);
          return;
        }

        // 方案B：Shift+单击切换钉住/解钉（不打开详情）
        const shiftPressed = Boolean(event?.shiftKey || (event?.sourceEvent && event.sourceEvent.shiftKey));
        if (shiftPressed) {
          togglePin(d);
          return;
        }

        handleNodeClick(d);
      })
      .on('mouseover', function() {
        d3.select(this)
          .attr('stroke', '#000')
          .attr('stroke-width', 3);
      })
      .on('mouseout', function(event, d) {
        const focusId = getFocusId();
        const isFocus = focusId && String(d.id) === String(focusId);
        const isPinned = pinnedNodeIdsRef.current.has(String(d.id));
        d3.select(this)
          .attr('stroke', (isPinned || isFocus) ? '#000' : '#fff')
          .attr('stroke-width', (isPinned || isFocus) ? 4 : 2);
      })
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.1).restart();
          d.__dragMoved = false;
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.__dragMoved = true;
          d.fx = event.x;
          d.fy = event.y;

          // 若已钉住，则实时更新固定位置
          const id = String(d.id);
          if (pinnedNodeIdsRef.current.has(id)) {
            pinnedPositionsRef.current.set(id, { x: d.fx, y: d.fy });
          }
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          const id = String(d.id);
          const pinnedSet = pinnedNodeIdsRef.current;

          // Shift+拖拽：松手时钉住（或更新钉住位置）；取消钉住请用 Shift+单击
          const shiftPressed = Boolean((event?.sourceEvent && event.sourceEvent.shiftKey) || event?.shiftKey);
          if (shiftPressed && d.__dragMoved) {
            pinnedSet.add(id);
            pinnedPositionsRef.current.set(id, { x: d.fx, y: d.fy });
            setPinnedCount(pinnedSet.size);
            updatePinnedStyles();
            return;
          }

          // 默认：拖拽松手释放（除非已钉住）
          if (!pinnedSet.has(id)) {
            d.fx = null;
            d.fy = null;
          } else {
            pinnedPositionsRef.current.set(id, { x: d.fx, y: d.fy });
          }
        }));

    // 高亮：添加发光滤镜
    const defs = svg.select('defs');
    const glowId = 'node-glow';
    if (!defs.select(`#${glowId}`).node()) {
      const filter = defs.append('filter')
        .attr('id', glowId)
        .attr('x', '-50%')
        .attr('y', '-50%')
        .attr('width', '200%')
        .attr('height', '200%');

      filter.append('feGaussianBlur')
        .attr('in', 'SourceGraphic')
        .attr('stdDeviation', 3)
        .attr('result', 'blur');

      const merge = filter.append('feMerge');
      merge.append('feMergeNode').attr('in', 'blur');
      merge.append('feMergeNode').attr('in', 'SourceGraphic');
    }

    // 绘制节点标签（可选）
    const label = displaySettings.showNodeLabels
      ? g.append('g')
        .selectAll('text')
        .data(nodes)
        .join('text')
        .attr('class', 'node-label')
        .attr('font-size', 12)
        .attr('fill', '#333')
        .attr('text-anchor', 'middle')
        .attr('dy', 35)
        .style('display', displaySettings.labelsAfterStabilized ? 'none' : null)
        .text(d => d.label)
        .style('pointer-events', 'none')
      : null;

    let labelsVisible = !displaySettings.labelsAfterStabilized;
    let rafId = null;
    let rafPending = false;

    const updatePositions = () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      if (labelsVisible) {
        if (linkLabel) {
          linkLabel
            .attr('x', d => (d.source.x + d.target.x) / 2)
            .attr('y', d => (d.source.y + d.target.y) / 2);
        }

        if (label) {
          label
            .attr('x', d => d.x)
            .attr('y', d => d.y);
        }
      }
    };

    // 更新位置（可选 RAF 节流）
    simulation.on('tick', () => {
      if (!displaySettings.rafThrottle) {
        updatePositions();
        return;
      }

      if (rafPending) return;
      rafPending = true;
      rafId = requestAnimationFrame(() => {
        rafPending = false;
        updatePositions();
      });
    });

    const fitToView = () => {
      const gNode = g.node();
      if (!gNode) return;
      const bounds = gNode.getBBox();
      const fullWidth = svgRef.current.clientWidth || width;
      const fullHeight = height;
      if (!bounds.width || !bounds.height) return;

      const midX = bounds.x + bounds.width / 2;
      const midY = bounds.y + bounds.height / 2;
      const scale = 0.8 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight);
      const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

      svg
        .transition()
        .duration(500)
        .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
    };

    // 等待布局稳定后：显示文字（可选）+ 自动适应视图（仅首次）
    simulation.on('end', () => {
      if (displaySettings.labelsAfterStabilized && !labelsVisible) {
        labelsVisible = true;
        if (linkLabel) linkLabel.style('display', null);
        if (label) label.style('display', null);
        updatePositions();
      }

      if (hasAutoFitRef.current) return;
      hasAutoFitRef.current = true;
      fitToView();
    });

    // 暴露给快捷键使用
    gSelectionRef.current.__fitToView = fitToView;

    return () => {
      simulation.stop();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [displayedGraphData, forceSettings, displaySettings, graphHeight]);

  // 高亮样式更新：不重建布局，只更新节点/边的视觉表现
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const highlightSet = highlightNodeIdsRef.current;
    const hasHighlight = highlightSet && highlightSet.size > 0;

    const baseR = 20;
    const hiR = Math.round(baseR * 1.4);
    const dimR = Math.max(2, Math.round(baseR * 0.6));

    const hiFill = '#FFEA00';
    const dimFill = '#d9d9d9';
    const glow = 'url(#node-glow)';

    svg.selectAll('circle')
      .attr('r', d => {
        if (!hasHighlight) return baseR;
        return highlightSet.has(String(d.id)) ? hiR : dimR;
      })
      .attr('fill', d => {
        if (!hasHighlight) return getNodeColor(d.type);
        return highlightSet.has(String(d.id)) ? hiFill : dimFill;
      })
      .attr('opacity', d => {
        if (!hasHighlight) return 1;
        return highlightSet.has(String(d.id)) ? 1 : 0.55;
      })
      .attr('filter', d => {
        if (!hasHighlight) return null;
        return highlightSet.has(String(d.id)) ? glow : null;
      });

    svg.selectAll('line')
      .attr('stroke', hasHighlight ? '#e0e0e0' : '#ccc')
      .attr('opacity', hasHighlight ? 0.65 : 1);

    svg.selectAll('text.node-label')
      .attr('fill', d => {
        if (!hasHighlight) return '#333';
        return highlightSet.has(String(d.id)) ? '#333' : '#999';
      })
      .attr('dy', d => {
        if (!hasHighlight) return 35;
        return highlightSet.has(String(d.id)) ? 45 : 25;
      })
      .attr('opacity', d => {
        if (!hasHighlight) return 1;
        return highlightSet.has(String(d.id)) ? 1 : 0.7;
      });

    svg.selectAll('text.link-label')
      .attr('fill', hasHighlight ? '#999' : '#666')
      .attr('opacity', hasHighlight ? 0.7 : 1);
  }, [displayedGraphData.nodes, displayedGraphData.edges, highlightCount]);

  // 图谱快捷键（避免在输入框聚焦时触发）
  useEffect(() => {
    const onKeyDown = (e) => {
      const active = document.activeElement;
      const tag = active && active.tagName ? active.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea') return;

      const svg = svgSelectionRef.current;
      const zoom = zoomRef.current;
      const g = gSelectionRef.current;
      if (!svg || !zoom || !g) return;

      const key = (e.key || '').toLowerCase();

      if (key === 'f') {
        e.preventDefault();
        const fit = g.__fitToView;
        if (typeof fit === 'function') fit();
        return;
      }

      if (key === '0') {
        e.preventDefault();
        svg.transition().duration(200).call(zoom.transform, d3.zoomIdentity);
        return;
      }

      if (key === '+' || key === '=') {
        e.preventDefault();
        svg.transition().duration(120).call(zoom.scaleBy, 1.15);
        return;
      }

      if (key === '-' || key === '_') {
        e.preventDefault();
        svg.transition().duration(120).call(zoom.scaleBy, 1 / 1.15);
        return;
      }

      const panStep = 40;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        svg.transition().duration(0).call(zoom.translateBy, panStep, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        svg.transition().duration(0).call(zoom.translateBy, -panStep, 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        svg.transition().duration(0).call(zoom.translateBy, 0, panStep);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        svg.transition().duration(0).call(zoom.translateBy, 0, -panStep);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const relationshipStat = useMemo(() => {
    const rels = entityDetails?.relationships || [];
    const counts = new Map();
    for (const rel of rels) {
      const key = relationshipStatMode === 'relationType'
        ? (rel?.type || '未知')
        : (rel?.entity?.type || '未知');
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const data = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    return {
      total: rels.length,
      data
    };
  }, [entityDetails, relationshipStatMode]);

  const overviewText = useMemo(() => {
    const nodeCount = displayedGraphData.nodes?.length || 0;
    const edgeCount = displayedGraphData.edges?.length || 0;
    return { nodeCount, edgeCount };
  }, [displayedGraphData]);

  const applyDraftSettings = () => {
    setForceSettings(forceSettingsDraft);
    setDisplaySettings(displaySettingsDraft);
    setTypeLimits(typeLimitsDraft);
    hasAutoFitRef.current = false;
  };

  const resetToDefaults = () => {
    setForceSettingsDraft(defaultForceSettings);
    setForceSettings(defaultForceSettings);
    setDisplaySettingsDraft(defaultDisplaySettings);
    setDisplaySettings(defaultDisplaySettings);
    setTypeLimitsDraft({});
    setTypeLimits({});
    hasAutoFitRef.current = false;
  };

  const updateTypeLimitDraft = (type, value) => {
    const key = normalizeType(type);
    setTypeLimitsDraft(prev => ({
      ...prev,
      [key]: value === undefined ? null : value
    }));
  };

  return (
    <Card title="文物知识图谱">
      <Row gutter={[16, 16]}>
        {/* 左侧：图谱主区域 */}
        <Col xs={24} lg={18}>
          <div style={{ marginBottom: 16, display: 'flex' }}>
            <Input
              placeholder="输入文物关键字探索知识图谱"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
              style={{ marginRight: 8 }}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              loading={loading}
            >
              探索
            </Button>

            <Button
              style={{ marginLeft: 8 }}
              onClick={clearAllHighlights}
              disabled={highlightCount === 0}
            >
              清除高亮
            </Button>
          </div>

          {error && (
            <Alert
              message="错误"
              description={error}
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <div ref={graphAreaRef}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '100px 0', height: graphHeight }}>
                <Spin size="large" tip="加载知识图谱中..." />
              </div>
            ) : (
              <>
                {displayedGraphData.nodes.length > 0 ? (
                  <div
                    className="knowledge-graph"
                    style={{
                      border: '1px solid #d9d9d9',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      height: graphHeight
                    }}
                  >
                    <svg ref={svgRef} style={{ display: 'block', background: '#fafafa', height: graphHeight }} />
                  </div>
                ) : (
                  <div style={{ height: graphHeight }}>
                    <Empty description="暂无图谱数据" />
                  </div>
                )}
              </>
            )}
          </div>
        </Col>

        {/* 右侧：图谱控制侧栏 */}
        <Col xs={24} lg={6}>
          <Card size="small" title="图谱控制" style={{ marginBottom: 16 }}>
            <Typography.Text strong>力导向参数</Typography.Text>
            <Divider style={{ margin: '8px 0' }} />

            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span>斥力</span>
                <InputNumber
                  value={forceSettingsDraft.chargeStrength}
                  min={-5000}
                  max={0}
                  step={50}
                  onChange={(v) => setForceSettingsDraft(s => ({ ...s, chargeStrength: Number(v) }))}
                />
              </Space>

              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span>连线长度</span>
                <InputNumber
                  value={forceSettingsDraft.linkDistance}
                  min={20}
                  max={400}
                  step={10}
                  onChange={(v) => setForceSettingsDraft(s => ({ ...s, linkDistance: Number(v) }))}
                />
              </Space>

              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span>碰撞半径</span>
                <InputNumber
                  value={forceSettingsDraft.collisionRadius}
                  min={0}
                  max={120}
                  step={5}
                  onChange={(v) => setForceSettingsDraft(s => ({ ...s, collisionRadius: Number(v) }))}
                />
              </Space>

              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span>收敛速度</span>
                <InputNumber
                  value={forceSettingsDraft.alphaDecay}
                  min={0.005}
                  max={0.2}
                  step={0.005}
                  onChange={(v) => setForceSettingsDraft(s => ({ ...s, alphaDecay: Number(v) }))}
                />
              </Space>
            </Space>

            <Divider style={{ margin: '12px 0' }} />
            <Typography.Text strong>显示与性能</Typography.Text>
            <Divider style={{ margin: '8px 0' }} />
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span>节点标签</span>
                <Switch
                  checked={displaySettingsDraft.showNodeLabels}
                  onChange={(checked) => setDisplaySettingsDraft(s => ({ ...s, showNodeLabels: checked }))}
                />
              </Space>

              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span>边标签</span>
                <Switch
                  checked={displaySettingsDraft.showLinkLabels}
                  onChange={(checked) => setDisplaySettingsDraft(s => ({ ...s, showLinkLabels: checked }))}
                />
              </Space>

              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span>稳定后显示文字</span>
                <Switch
                  checked={displaySettingsDraft.labelsAfterStabilized}
                  onChange={(checked) => setDisplaySettingsDraft(s => ({ ...s, labelsAfterStabilized: checked }))}
                />
              </Space>

              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span>RAF 节流</span>
                <Switch
                  checked={displaySettingsDraft.rafThrottle}
                  onChange={(checked) => setDisplaySettingsDraft(s => ({ ...s, rafThrottle: checked }))}
                />
              </Space>
            </Space>

            <Divider style={{ margin: '12px 0' }} />
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button type="primary" onClick={applyDraftSettings} style={{ flex: 1 }}>
                应用设置
              </Button>
              <Button onClick={resetToDefaults} style={{ flex: 1 }}>
                恢复默认
              </Button>
            </Space>

            <Divider style={{ margin: '12px 0' }} />
            <Typography.Text strong>视图</Typography.Text>
            <Divider style={{ margin: '8px 0' }} />
            <Space wrap style={{ width: '100%' }}>
              <Button
                size="small"
                onClick={() => {
                  const svg = svgSelectionRef.current;
                  const zoom = zoomRef.current;
                  if (!svg || !zoom) return;
                  svg.transition().duration(120).call(zoom.scaleBy, 1.15);
                }}
              >
                放大
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const svg = svgSelectionRef.current;
                  const zoom = zoomRef.current;
                  if (!svg || !zoom) return;
                  svg.transition().duration(120).call(zoom.scaleBy, 1 / 1.15);
                }}
              >
                缩小
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const svg = svgSelectionRef.current;
                  const zoom = zoomRef.current;
                  if (!svg || !zoom) return;
                  svg.transition().duration(160).call(zoom.transform, d3.zoomIdentity);
                }}
              >
                重置
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const g = gSelectionRef.current;
                  const fit = g && g.__fitToView;
                  if (typeof fit === 'function') fit();
                }}
              >
                适配
              </Button>
            </Space>
          </Card>

          <Card size="small" title="类型限量与概览">
            <Typography.Text type="secondary">
              当前展示：节点 {overviewText.nodeCount}，边 {overviewText.edgeCount}
            </Typography.Text>

            <br />
            <Typography.Text type="secondary">
              已钉住节点：{pinnedCount}（Shift+单击可钉住/取消；Shift+拖拽松手可钉住）
            </Typography.Text>

            <Divider style={{ margin: '12px 0' }} />
            <Typography.Text strong>按类型节点上限</Typography.Text>
            <Divider style={{ margin: '8px 0' }} />

            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {availableTypes.length === 0 ? (
                <Typography.Text type="secondary">暂无数据</Typography.Text>
              ) : (
                availableTypes.map((t) => (
                  <Space key={t} style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Typography.Text>{t}</Typography.Text>
                    <Space>
                      <InputNumber
                        value={typeLimitsDraft[t] === undefined ? null : typeLimitsDraft[t]}
                        min={0}
                        step={1}
                        placeholder="不限"
                        onChange={(v) => updateTypeLimitDraft(t, v)}
                        style={{ width: 110 }}
                      />
                      <Button size="small" onClick={() => updateTypeLimitDraft(t, null)}>不限</Button>
                    </Space>
                  </Space>
                ))
              )}
            </Space>

            {displayedTypeCounts.length > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Typography.Text strong>类型分布（Top）</Typography.Text>
                <Divider style={{ margin: '8px 0' }} />
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  {displayedTypeCounts.slice(0, 10).map(item => (
                    <Typography.Text key={item.type} type="secondary">
                      {item.type}: {item.count}
                    </Typography.Text>
                  ))}
                </Space>
              </>
            )}
          </Card>
        </Col>
      </Row>
      
      {/* 实体详情模态框 */}
      <Modal
        title={selectedEntity ? `实体详情: ${selectedEntity.label}` : '实体详情'}
        open={entityDetailsVisible}
        onCancel={() => setEntityDetailsVisible(false)}
        footer={null}
        width={700}
      >
        {entityDetailsLoading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Spin size="large" tip="加载详情中..." />
          </div>
        ) : (
          <>
            {entityDetails ? (
              <div>
                {selectedEntity?.id && (
                  <div style={{ marginBottom: 12 }}>
                    <Space wrap>
                      <Typography.Text type="secondary">交互：</Typography.Text>
                      <Typography.Text type="secondary">Shift+单击可钉住/取消；Shift+拖拽松手可钉住</Typography.Text>
                      <Divider type="vertical" />
                      <Typography.Text>钉住该节点</Typography.Text>
                      <Switch
                        checked={pinnedNodeIdsRef.current.has(String(selectedEntity.id))}
                        onChange={(checked) => setPinnedForSelected(checked)}
                      />
                    </Space>
                  </div>
                )}
                <Descriptions bordered column={2}>
                  <Descriptions.Item label="ID">{entityDetails.entity.id}</Descriptions.Item>
                  <Descriptions.Item label="类型">{entityDetails.entity.type}</Descriptions.Item>
                  <Descriptions.Item label="名称">{entityDetails.entity.name}</Descriptions.Item>
                  
                  {entityDetails.entity.description && (
                    <Descriptions.Item label="描述" span={2}>
                      {entityDetails.entity.description}
                    </Descriptions.Item>
                  )}
                  
                  {entityDetails.entity.era && (
                    <Descriptions.Item label="年代">
                      {entityDetails.entity.era}
                    </Descriptions.Item>
                  )}
                  
                  {entityDetails.entity.location && (
                    <Descriptions.Item label="地点">
                      {entityDetails.entity.location}
                    </Descriptions.Item>
                  )}
                </Descriptions>
                
                <h3 style={{ marginTop: 24, marginBottom: 16 }}>关联关系</h3>

                <div style={{ marginBottom: 12 }}>
                  <Space wrap>
                    <Typography.Text type="secondary">共 {relationshipStat.total} 条关系</Typography.Text>
                    <Radio.Group
                      value={relationshipStatMode}
                      onChange={(e) => setRelationshipStatMode(e.target.value)}
                      optionType="button"
                      buttonStyle="solid"
                      size="small"
                      options={[
                        { label: '按对端类型', value: 'entityType' },
                        { label: '按关系类型', value: 'relationType' }
                      ]}
                    />
                  </Space>
                </div>

                {relationshipStat.data.length > 0 && (
                  <ReactECharts
                    style={{ height: 260 }}
                    option={{
                      tooltip: { trigger: 'item' },
                      series: [
                        {
                          type: 'pie',
                          radius: ['35%', '70%'],
                          avoidLabelOverlap: true,
                          label: { show: true, formatter: '{b}: {c}' },
                          labelLine: { show: true },
                          data: relationshipStat.data
                        }
                      ]
                    }}
                  />
                )}
                
                {entityDetails.relationships.length > 0 ? (
                  <ul>
                    {entityDetails.relationships.map((rel, index) => (
                      <li key={index}>
                        {rel.direction === 'outgoing' ? (
                          <span>→ {rel.type} → <strong>{rel.entity.name}</strong> ({rel.entity.type})</span>
                        ) : (
                          <span>← {rel.type} ← <strong>{rel.entity.name}</strong> ({rel.entity.type})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>没有相关联的关系</p>
                )}
              </div>
            ) : (
              <Empty description="暂无详细信息" />
            )}
          </>
        )}
      </Modal>
    </Card>
  );
};

export default KnowledgeGraph;
