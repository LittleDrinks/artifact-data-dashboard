import { useRef, useState, useCallback } from 'react';

const MAX_HIGHLIGHTS = 20;

export const useGraphInteraction = ({ simulationRef, svgRef }) => {
  const pinnedNodeIdsRef = useRef(new Set());
  const pinnedPositionsRef = useRef(new Map());
  const focusNodeIdRef = useRef(null);
  const highlightNodeIdsRef = useRef(new Set());
  const autoPinNodeIdsRef = useRef(null);

  const [pinnedCount, setPinnedCount] = useState(0);
  const [highlightCount, setHighlightCount] = useState(0);

  const applyPinnedStyles = useCallback(() => {
    if (!svgRef.current) return;
    const focusId = focusNodeIdRef.current;
    const pinnedSet = pinnedNodeIdsRef.current;
    const svg = window.d3.select(svgRef.current);
    svg.selectAll('circle')
      .attr('stroke', d => {
        const id = String(d.id);
        if (pinnedSet.has(id)) return '#000';
        return (focusId && String(d.id) === String(focusId) ? '#000' : '#fff');
      })
      .attr('stroke-width', d => {
        const id = String(d.id);
        if (pinnedSet.has(id)) return 4;
        return (focusId && String(d.id) === String(focusId) ? 4 : 2);
      });
  }, [svgRef]);

  const togglePin = useCallback((d, width = 1000, height = 600) => {
    const id = String(d.id);
    const pinnedSet = pinnedNodeIdsRef.current;
    const simulation = simulationRef.current;

    if (pinnedSet.has(id)) {
      pinnedSet.delete(id);
      pinnedPositionsRef.current.delete(id);
      d.fx = null;
      d.fy = null;
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
    applyPinnedStyles();

    if (simulation) {
      simulation.alphaTarget(0.05).restart();
      setTimeout(() => simulation.alphaTarget(0), 100);
    }
  }, [simulationRef, applyPinnedStyles]);

  const setPinnedForNode = useCallback((nodeId, pinned, nodeData = null) => {
    const simulation = simulationRef.current;
    const pinnedSet = pinnedNodeIdsRef.current;
    const simNodes = simulation?.nodes ? simulation.nodes() : [];
    const simNode = Array.isArray(simNodes) ? simNodes.find(n => String(n.id) === String(nodeId)) : null;

    if (pinned) {
      pinnedSet.add(String(nodeId));
      const px = nodeData?.__clickedX ?? simNode?.x ?? 500;
      const py = nodeData?.__clickedY ?? simNode?.y ?? 300;
      pinnedPositionsRef.current.set(String(nodeId), { x: px, y: py });
      if (simNode) {
        simNode.fx = px;
        simNode.fy = py;
        simulation.alphaTarget(0.05).restart();
        setTimeout(() => simulation.alphaTarget(0), 100);
      }
    } else {
      pinnedSet.delete(String(nodeId));
      pinnedPositionsRef.current.delete(String(nodeId));
      if (focusNodeIdRef.current && String(focusNodeIdRef.current) === String(nodeId)) {
        focusNodeIdRef.current = null;
      }
      if (simNode) {
        simNode.fx = null;
        simNode.fy = null;
        simulation.alphaTarget(0.05).restart();
        setTimeout(() => simulation.alphaTarget(0), 100);
      }
    }

    setPinnedCount(pinnedSet.size);
    applyPinnedStyles();
  }, [simulationRef, applyPinnedStyles]);

  const isNodePinned = useCallback((nodeId) => pinnedNodeIdsRef.current.has(String(nodeId)), []);

  const toggleHighlight = useCallback((id) => {
    const sid = id == null ? '' : String(id);
    if (!sid) return;

    const next = new Set(highlightNodeIdsRef.current);
    if (next.has(sid)) {
      next.delete(sid);
    } else if (next.size < MAX_HIGHLIGHTS) {
      next.add(sid);
    }

    highlightNodeIdsRef.current = next;
    setHighlightCount(next.size);
  }, []);

  const replaceHighlights = useCallback((ids) => {
    const list = (ids || []).map(id => String(id)).filter(Boolean);
    const finalList = list.slice(0, MAX_HIGHLIGHTS);
    highlightNodeIdsRef.current = new Set(finalList);
    setHighlightCount(finalList.length);
  }, []);

  const clearAllHighlights = useCallback(() => {
    highlightNodeIdsRef.current = new Set();
    setHighlightCount(0);
  }, []);

  const setFocusNode = useCallback((nodeId) => {
    focusNodeIdRef.current = nodeId ? String(nodeId) : null;
    applyPinnedStyles();
  }, [applyPinnedStyles]);

  const handleNodeClickInternal = useCallback((event, d, onNodeClick) => {
    if (event.defaultPrevented) return;
    event.stopPropagation();

    const ctrlPressed = Boolean(event?.ctrlKey || event?.metaKey);
    if (ctrlPressed) {
      toggleHighlight(d.id);
      return;
    }

    const shiftPressed = Boolean(event?.shiftKey);
    if (shiftPressed) {
      togglePin(d);
      return;
    }

    onNodeClick?.(d);
  }, [toggleHighlight, togglePin]);

  return {
    pinnedCount,
    highlightCount,
    pinnedNodeIdsRef,
    pinnedPositionsRef,
    focusNodeIdRef,
    highlightNodeIdsRef,
    autoPinNodeIdsRef,
    togglePin,
    setPinnedForNode,
    isNodePinned,
    toggleHighlight,
    replaceHighlights,
    clearAllHighlights,
    setFocusNode,
    handleNodeClickInternal,
    applyPinnedStyles
  };
};
