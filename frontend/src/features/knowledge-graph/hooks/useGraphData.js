import { useState, useEffect, useCallback, useMemo } from 'react';
import { getGraphData } from '../../../services/graph.service';
import { normalizeType, applyTypeLimits } from '../utils/graph.utils';

/**
 * 知识图谱数据管理 Hook
 * 
 * 负责：
 * - 图谱数据的获取和缓存
 * - sessionStorage 会话数据恢复
 * - 节点类型计算和过滤
 * - 加载状态和错误处理
 */
export const useGraphData = ({
  focusNodeIdRef,
  autoPinNodeIdsRef,
  replaceHighlights,
  setFocusNode,
  clearAllHighlights
} = {}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [typeLimits, setTypeLimits] = useState({});

  const fetchGraphData = useCallback(async (searchKeyword = '') => {
    setLoading(true);
    try {
      const response = await getGraphData(searchKeyword);
      const nextGraph = {
        nodes: response.data.nodes,
        edges: response.data.edges
      };
      setGraphData(nextGraph);
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

  const loadFromSession = useCallback(() => {
    try {
      const stored = sessionStorage.getItem('chatGraphData');
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      if (!parsed?.nodes || !parsed?.edges) return null;

      // 恢复焦点节点
      try {
        const focusId = sessionStorage.getItem('chatGraphFocusNodeId');
        if (focusId) {
          focusNodeIdRef.current = String(focusId);
          if (setFocusNode) setFocusNode(focusId);
          sessionStorage.removeItem('chatGraphFocusNodeId');
        }
      } catch (e) {
        focusNodeIdRef.current = null;
      }

      // 恢复高亮节点
      let nextAutoPinIds = null;
      try {
        const raw = sessionStorage.getItem('chatGraphHighlightNodeIds');
        if (raw) {
          const parsedIds = JSON.parse(raw);
          if (replaceHighlights) replaceHighlights(parsedIds);
          if (Array.isArray(parsedIds) && parsedIds.length > 0) {
            nextAutoPinIds = parsedIds.map(String);
          }
          sessionStorage.removeItem('chatGraphHighlightNodeIds');
        } else if (focusNodeIdRef.current) {
          if (replaceHighlights) replaceHighlights([String(focusNodeIdRef.current)]);
          nextAutoPinIds = [String(focusNodeIdRef.current)];
        }
      } catch (e) {}

      // 设置自动钉住节点
      if (Array.isArray(nextAutoPinIds) && nextAutoPinIds.length > 0 && autoPinNodeIdsRef) {
        autoPinNodeIdsRef.current = new Set(nextAutoPinIds.filter(Boolean));
      }

      setGraphData(parsed);
      setLoading(false);
      setError(null);
      sessionStorage.removeItem('chatGraphData');
      return parsed;
    } catch (e) {
      return null;
    }
  }, [focusNodeIdRef, autoPinNodeIdsRef, replaceHighlights, setFocusNode]);

  const availableTypes = useMemo(() => {
    const types = new Set((graphData.nodes || []).map(n => normalizeType(n.type)));
    return Array.from(types).sort();
  }, [graphData.nodes]);

  const displayedGraphData = useMemo(() => {
    return applyTypeLimits(graphData, typeLimits, normalizeType, focusNodeIdRef?.current);
  }, [graphData, typeLimits, focusNodeIdRef]);

  const displayedTypeCounts = useMemo(() => {
    const map = new Map();
    for (const n of displayedGraphData.nodes || []) {
      const type = normalizeType(n.type);
      map.set(type, (map.get(type) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));
  }, [displayedGraphData.nodes]);

  const clearData = useCallback(() => {
    setGraphData({ nodes: [], edges: [] });
    setError(null);
    if (clearAllHighlights) clearAllHighlights();
  }, [clearAllHighlights]);

  const overviewText = useMemo(() => ({
    nodeCount: displayedGraphData.nodes?.length || 0,
    edgeCount: displayedGraphData.edges?.length || 0
  }), [displayedGraphData]);

  return {
    loading,
    error,
    graphData,
    setGraphData,
    typeLimits,
    setTypeLimits,
    availableTypes,
    displayedGraphData,
    displayedTypeCounts,
    overviewText,
    fetchGraphData,
    loadFromSession,
    clearData
  };
};

export default useGraphData;
