import React, { useState, useEffect, useRef } from 'react';
import { Card, Input, Button, Spin, Alert, Empty, Row, Col } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import * as d3 from 'd3';
import { useLocation } from 'react-router-dom';
import { getEntityDetails } from '../services/graph.service';
import {
  useGraphSimulation,
  useGraphInteraction,
  useGraphData,
  GraphRenderer,
  ForceSettingsPanel,
  EntityDetailModal,
  TypeFilterPanel,
  deriveSearchHighlights,
  DEFAULT_FORCE_SETTINGS,
  DEFAULT_DISPLAY_SETTINGS
} from '../features/knowledge-graph';

const KnowledgeGraph = () => {
  const [keyword, setKeyword] = useState('');
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [entityDetailsVisible, setEntityDetailsVisible] = useState(false);
  const [entityDetailsLoading, setEntityDetailsLoading] = useState(false);
  const [entityDetails, setEntityDetails] = useState(null);

  const [forceSettingsDraft, setForceSettingsDraft] = useState(DEFAULT_FORCE_SETTINGS);
  const [forceSettings, setForceSettings] = useState(DEFAULT_FORCE_SETTINGS);
  const [displaySettingsDraft, setDisplaySettingsDraft] = useState(DEFAULT_DISPLAY_SETTINGS);
  const [displaySettings, setDisplaySettings] = useState(DEFAULT_DISPLAY_SETTINGS);

  const [typeLimitsDraft, setTypeLimitsDraft] = useState({});

  const [graphHeight, setGraphHeight] = useState(600);

  const svgRef = useRef(null);
  const graphAreaRef = useRef(null);
  const hasAutoFitRef = useRef(false);
  const focusNodeIdRef = useRef(null);

  const location = useLocation();

  const simulationApi = useGraphSimulation({
    width: 1000,
    height: graphHeight,
    forceSettings
  });

  const interactionApi = useGraphInteraction({
    simulationRef: simulationApi.simulationRef,
    svgRef,
    width: 1000,
    height: graphHeight
  });

  const {
    pinnedCount,
    highlightCount,
    highlightNodeIdsRef,
    autoPinNodeIdsRef,
    replaceHighlights,
    clearAllHighlights,
    setFocusNode,
    setPinnedForNode,
    isNodePinned
  } = interactionApi;

  const dataApi = useGraphData({
    focusNodeIdRef,
    autoPinNodeIdsRef,
    replaceHighlights,
    setFocusNode,
    clearAllHighlights
  });

  const {
    loading,
    error,
    graphData,
    setGraphData,
    setTypeLimits,
    availableTypes,
    displayedGraphData,
    displayedTypeCounts,
    overviewText,
    fetchGraphData,
    loadFromSession
  } = dataApi;

  const { fitToView, handleZoomIn, handleZoomOut, handleResetZoom } = simulationApi;

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

  useEffect(() => {
    const stateGraph = location.state?.graphData;
    if (stateGraph?.nodes && stateGraph?.edges) {
      setGraphData(stateGraph);
      return;
    }

    const sessionData = loadFromSession();
    if (!sessionData) {
      fetchGraphData();
    }
  }, [fetchGraphData, loadFromSession, location.state, setGraphData]);

  useEffect(() => {
    return () => {
      if (simulationApi.simulationRef.current) {
        simulationApi.simulationRef.current.stop();
      }
    };
  }, [simulationApi.simulationRef]);

  const handleSearch = async () => {
    const kw = (keyword || '').trim();
    hasAutoFitRef.current = false;
    const next = await fetchGraphData(kw);
    if (!kw) {
      clearAllHighlights();
      return;
    }
    const ids = deriveSearchHighlights(kw, next?.nodes || []);
    replaceHighlights(ids);
  };

  const handleNodeClick = async (node) => {
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

    const colorMap = {
      artifact: '#1890ff', category: '#52c41a', era: '#fa8c16',
      author: '#722ed1', location: '#eb2f96', material: '#f5222d'
    };

    svg.selectAll('circle')
      .attr('r', d => hasHighlight && highlightSet.has(String(d.id)) ? hiR : (hasHighlight ? dimR : baseR))
      .attr('fill', d => hasHighlight
        ? (highlightSet.has(String(d.id)) ? hiFill : dimFill)
        : (colorMap[d.type] || '#666'))
      .attr('opacity', d => hasHighlight ? (highlightSet.has(String(d.id)) ? 1 : 0.55) : 1)
      .attr('filter', d => hasHighlight && highlightSet.has(String(d.id)) ? glow : null);

    svg.selectAll('line')
      .attr('stroke', hasHighlight ? '#e0e0e0' : '#ccc')
      .attr('opacity', hasHighlight ? 0.65 : 1);

    svg.selectAll('text.node-label')
      .attr('fill', d => hasHighlight ? (highlightSet.has(String(d.id)) ? '#333' : '#999') : '#333')
      .attr('dy', d => hasHighlight ? (highlightSet.has(String(d.id)) ? 45 : 25) : 35)
      .attr('opacity', d => hasHighlight ? (highlightSet.has(String(d.id)) ? 1 : 0.7) : 1);

    svg.selectAll('text.link-label')
      .attr('fill', hasHighlight ? '#999' : '#666')
      .attr('opacity', hasHighlight ? 0.7 : 1);
  }, [displayedGraphData.nodes, displayedGraphData.edges, highlightCount]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const active = document.activeElement;
      const tag = active?.tagName?.toLowerCase() || '';
      if (tag === 'input' || tag === 'textarea') return;

      const svg = simulationApi.svgSelectionRef.current;
      const zoom = simulationApi.zoomRef.current;
      const g = simulationApi.gSelectionRef.current;
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
  }, [simulationApi.svgSelectionRef, simulationApi.zoomRef, simulationApi.gSelectionRef]);

  const applyDraftSettings = () => {
    setForceSettings(forceSettingsDraft);
    setDisplaySettings(displaySettingsDraft);
    setTypeLimits(typeLimitsDraft);
    hasAutoFitRef.current = false;
  };

  const resetToDefaults = () => {
    setForceSettingsDraft(DEFAULT_FORCE_SETTINGS);
    setForceSettings(DEFAULT_FORCE_SETTINGS);
    setDisplaySettingsDraft(DEFAULT_DISPLAY_SETTINGS);
    setDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
    setTypeLimitsDraft({});
    setTypeLimits({});
    hasAutoFitRef.current = false;
  };

  const updateTypeLimitDraft = (type, value) => {
    const key = type?.toLowerCase().trim();
    setTypeLimitsDraft(prev => ({
      ...prev,
      [key]: value === undefined ? null : value
    }));
  };

  return (
    <Card title="文物知识图谱">
      <Row gutter={[16, 16]}>
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
                    <GraphRenderer
                      nodes={displayedGraphData.nodes}
                      links={displayedGraphData.edges}
                      width={1000}
                      height={graphHeight}
                      forceSettings={forceSettings}
                      displaySettings={displaySettings}
                      svgRef={svgRef}
                      simulationApi={simulationApi}
                      interactionApi={interactionApi}
                      onNodeClick={handleNodeClick}
                      hasAutoFitRef={hasAutoFitRef}
                      focusNodeIdRef={focusNodeIdRef}
                    />
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

        <Col xs={24} lg={6}>
          <ForceSettingsPanel
            forceSettingsDraft={forceSettingsDraft}
            setForceSettingsDraft={setForceSettingsDraft}
            displaySettingsDraft={displaySettingsDraft}
            setDisplaySettingsDraft={setDisplaySettingsDraft}
            onApply={applyDraftSettings}
            onReset={resetToDefaults}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetZoom={handleResetZoom}
            onFitView={fitToView}
          />

          <TypeFilterPanel
            availableTypes={availableTypes}
            typeLimitsDraft={typeLimitsDraft}
            onUpdateTypeLimit={updateTypeLimitDraft}
            overviewText={overviewText}
            pinnedCount={pinnedCount}
            displayedTypeCounts={displayedTypeCounts}
          />
        </Col>
      </Row>

      <EntityDetailModal
        visible={entityDetailsVisible}
        onClose={() => setEntityDetailsVisible(false)}
        selectedEntity={selectedEntity}
        entityDetails={entityDetails}
        loading={entityDetailsLoading}
        isNodePinned={isNodePinned}
        onTogglePin={(nodeId, pinned) => {
          setPinnedForNode(nodeId, pinned, selectedEntity);
          if (!pinned && focusNodeIdRef.current && String(focusNodeIdRef.current) === String(nodeId)) {
            focusNodeIdRef.current = null;
          }
        }}
      />
    </Card>
  );
};

export default KnowledgeGraph;
