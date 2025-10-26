import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Input, Button, Spin, Alert, Modal, Descriptions, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
// CytoscapeComponent 内部使用 Cytoscape 库，所以我们不需要直接导入 Cytoscape
import CytoscapeComponent from 'react-cytoscapejs';
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
  
  const cyRef = useRef(null);
  const layoutRef = useRef(null);
  const runLayoutRef = useRef(null);
  const scheduleLayoutRef = useRef(null);
  const draggingNodesRef = useRef(new Set());
  const draggedPositionsRef = useRef(new Map());
  const layoutFrameRef = useRef(null);
  const layoutScheduledRef = useRef(false);
  const pendingLayoutOptionsRef = useRef(null);
  const neighborMapRef = useRef(new Map());
  const velocitiesRef = useRef(new Map());
  const physicsFrameRef = useRef(null);
  const physicsActiveRef = useRef(false);
  const lastDragTimeRef = useRef(0);
  const physicsConfigRef = useRef({
    springLength: 140,
    springCoeff: 0.0006,
    repulsionStrength: 60000,
    damping: 0.85,
    timeStep: 0.03,
    maxDisplacement: 12,
    maxRepulsionDistance: 450,
    centerStrength: 0.002,
    settleDuration: 260
  });
  
  // 初始化加载图谱数据
  useEffect(() => {
    fetchGraphData();
  }, []);

  // 清理Cytoscape实例
  useEffect(() => {
    return () => {
      if (layoutFrameRef.current) {
        cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = null;
      }
      if (physicsFrameRef.current) {
        cancelAnimationFrame(physicsFrameRef.current);
        physicsFrameRef.current = null;
      }
      physicsActiveRef.current = false;
      layoutScheduledRef.current = false;
      pendingLayoutOptionsRef.current = null;
      draggingNodesRef.current.clear();
      draggedPositionsRef.current.clear();
      velocitiesRef.current.clear();
      neighborMapRef.current = new Map();
      if (layoutRef.current) {
        try {
          layoutRef.current.stop();
        } catch (e) {
          // ignore layout stop errors
        }
        layoutRef.current = null;
      }
      if (cyRef.current) {
        try {
          cyRef.current.stop?.();
        } catch (e) {
          // ignore stop errors
        }
        cyRef.current.destroy();
        cyRef.current = null;
      }
      runLayoutRef.current = null;
      scheduleLayoutRef.current = null;
    };
  }, []);
  
  // 获取图谱数据
  const fetchGraphData = async (searchKeyword = '') => {
    setLoading(true);
    
    try {
      const response = await getGraphData(searchKeyword);
      setGraphData({
        nodes: response.data.nodes,
        edges: response.data.edges
      });
      setError(null);
    } catch (err) {
      console.error('获取知识图谱数据失败:', err);
      setError('获取知识图谱数据失败，请稍后重试');
      setGraphData({ nodes: [], edges: [] });
    } finally {
      setLoading(false);
    }
  };
  
  // 处理搜索
  const handleSearch = () => {
    fetchGraphData(keyword);
  };
  
  // 处理节点点击
  const handleNodeClick = async (node) => {
    setSelectedEntity(node);
    setEntityDetailsVisible(true);
    setEntityDetailsLoading(true);
    
    try {
      const response = await getEntityDetails(node.data('type'), node.id());
      setEntityDetails(response.data);
    } catch (err) {
      console.error('获取实体详情失败:', err);
      setEntityDetails(null);
    } finally {
      setEntityDetailsLoading(false);
    }
  };
  
  // 配置cytoscape组件
  const cytoscapeElements = useMemo(() => ([
    ...graphData.nodes.map(node => ({
      data: {
        id: node.id,
        label: node.label,
        type: node.type
      }
    })),
    ...graphData.edges.map(edge => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label
      }
    }))
  ]), [graphData]);

  const neighborMap = useMemo(() => {
    const map = new Map();
    graphData.edges.forEach(edge => {
      const { source, target } = edge;
      if (!map.has(source)) {
        map.set(source, new Set());
      }
      if (!map.has(target)) {
        map.set(target, new Set());
      }
      map.get(source).add(target);
      map.get(target).add(source);
    });
    return map;
  }, [graphData]);

  useEffect(() => {
    neighborMapRef.current = neighborMap;
    velocitiesRef.current.clear();
  }, [neighborMap]);
  
  // Cytoscape样式
  const cytoscapeStylesheet = [
    {
      selector: 'node',
      style: {
        'background-color': '#666',
        'label': 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'color': 'white',
        'text-outline-width': 2,
        'text-outline-color': '#666',
        'font-size': 12,
        'width': 40,
        'height': 40
      }
    },
    {
      selector: 'node[type="artifact"]',
      style: {
        'background-color': '#1890ff',
        'text-outline-color': '#1890ff'
      }
    },
    {
      selector: 'node[type="category"]',
      style: {
        'background-color': '#52c41a',
        'text-outline-color': '#52c41a'
      }
    },
    {
      selector: 'node[type="era"]',
      style: {
        'background-color': '#fa8c16',
        'text-outline-color': '#fa8c16'
      }
    },
    {
      selector: 'node[type="author"]',
      style: {
        'background-color': '#722ed1',
        'text-outline-color': '#722ed1'
      }
    },
    {
      selector: 'node[type="location"]',
      style: {
        'background-color': '#eb2f96',
        'text-outline-color': '#eb2f96'
      }
    },
    {
      selector: 'node[type="material"]',
      style: {
        'background-color': '#f5222d',
        'text-outline-color': '#f5222d'
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#ccc',
        'target-arrow-color': '#ccc',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': 10,
        'text-rotation': 'autorotate',
        'text-margin-y': -10,
        'text-background-color': 'white',
        'text-background-opacity': 1,
        'text-background-padding': 2
      }
    }
  ];
  
  // Cytoscape布局配置
  const layoutConfig = {
    name: 'cose',
    animate: false,
    refresh: 0,
    nodeDimensionsIncludeLabels: true,
    randomize: false,
    nodeRepulsion: 8000,
    idealEdgeLength: 100,
    edgeElasticity: 100,
    nestingFactor: 5,
    gravity: 80,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0
  };
  
  // 当图形组件初始化完成
  const onCytoscapeInit = (cy) => {
    cyRef.current = cy;

    const cleanupLayout = () => {
      if (layoutRef.current) {
        try {
          layoutRef.current.stop();
        } catch (e) {
          // ignore layout stop errors
        }
        layoutRef.current = null;
      }
    };

    const stopPhysicsLoop = () => {
      if (physicsFrameRef.current) {
        cancelAnimationFrame(physicsFrameRef.current);
        physicsFrameRef.current = null;
      }
      physicsActiveRef.current = false;
    };

    const runPhysicsStep = () => {
      const cyInstance = cyRef.current;
      if (!cyInstance || cyInstance.destroyed()) {
        return false;
      }

      const physicsConfig = physicsConfigRef.current;
      const neighborSnapshot = neighborMapRef.current;
      const velocities = velocitiesRef.current;
      const dragging = draggingNodesRef.current;
      const nodes = cyInstance.nodes();

      if (!nodes || nodes.length === 0) {
        return false;
      }

      const positions = new Map();
      let sumX = 0;
      let sumY = 0;
      nodes.forEach(node => {
        const pos = { ...node.position() };
        positions.set(node.id(), pos);
        sumX += pos.x;
        sumY += pos.y;
      });
      const count = typeof nodes.length === 'number' ? nodes.length : nodes.size();
      const centerX = count > 0 ? sumX / count : 0;
      const centerY = count > 0 ? sumY / count : 0;

      const updates = [];

      nodes.forEach(node => {
        const id = node.id();
        const pos = positions.get(id);
        if (!pos) {
          return;
        }

        if (dragging.has(id) || node.grabbed()) {
          velocities.set(id, { x: 0, y: 0 });
          return;
        }

        let forceX = 0;
        let forceY = 0;

        nodes.forEach(other => {
          if (other === node) {
            return;
          }
          const otherPos = positions.get(other.id());
          if (!otherPos) {
            return;
          }
          const dx = pos.x - otherPos.x;
          const dy = pos.y - otherPos.y;
          let distSq = dx * dx + dy * dy;
          if (distSq < 0.0001) {
            distSq = 0.0001;
          }
          const dist = Math.sqrt(distSq);
          if (dist > physicsConfig.maxRepulsionDistance) {
            return;
          }
          const repulse = physicsConfig.repulsionStrength / distSq;
          const normX = dx / dist;
          const normY = dy / dist;
          forceX += normX * repulse;
          forceY += normY * repulse;
        });

        const neighbors = neighborSnapshot.get(id);
        if (neighbors) {
          neighbors.forEach(neighborId => {
            const neighborPos = positions.get(neighborId);
            if (!neighborPos) {
              return;
            }
            const dx = neighborPos.x - pos.x;
            const dy = neighborPos.y - pos.y;
            let distSq = dx * dx + dy * dy;
            if (distSq < 0.0001) {
              distSq = 0.0001;
            }
            const dist = Math.sqrt(distSq);
            const springForce = physicsConfig.springCoeff * (dist - physicsConfig.springLength);
            const normX = dx / dist;
            const normY = dy / dist;
            forceX += normX * springForce;
            forceY += normY * springForce;
          });
        }

          if (physicsConfig.centerStrength) {
            const centerForce = physicsConfig.centerStrength;
            forceX += (centerX - pos.x) * centerForce;
            forceY += (centerY - pos.y) * centerForce;
          }

        const velocity = velocities.get(id) || { x: 0, y: 0 };
        velocity.x = (velocity.x + forceX * physicsConfig.timeStep) * physicsConfig.damping;
        velocity.y = (velocity.y + forceY * physicsConfig.timeStep) * physicsConfig.damping;

        if (!Number.isFinite(velocity.x)) {
          velocity.x = 0;
        }
        if (!Number.isFinite(velocity.y)) {
          velocity.y = 0;
        }

        const clampedX = Math.max(-physicsConfig.maxDisplacement, Math.min(physicsConfig.maxDisplacement, velocity.x));
        const clampedY = Math.max(-physicsConfig.maxDisplacement, Math.min(physicsConfig.maxDisplacement, velocity.y));

        velocity.x = clampedX;
        velocity.y = clampedY;
        velocities.set(id, velocity);

        if (Math.abs(clampedX) > 0.01 || Math.abs(clampedY) > 0.01) {
          updates.push({ node, x: pos.x + clampedX, y: pos.y + clampedY });
        }
      });

      if (updates.length > 0) {
        cyInstance.batch(() => {
          updates.forEach(({ node, x, y }) => {
            node.position({ x, y });
          });
        });
        return true;
      }

      return false;
    };

    const physicsLoop = () => {
      const cyInstance = cyRef.current;
      if (!cyInstance || cyInstance.destroyed()) {
        stopPhysicsLoop();
        return;
      }

      const moved = runPhysicsStep();
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const draggingCount = draggingNodesRef.current.size;

      if (draggingCount === 0 && !moved && now - lastDragTimeRef.current > physicsConfigRef.current.settleDuration) {
        stopPhysicsLoop();
        return;
      }

      physicsFrameRef.current = requestAnimationFrame(physicsLoop);
    };

    const ensurePhysicsLoop = () => {
      if (physicsActiveRef.current) {
        return;
      }
      physicsActiveRef.current = true;
      physicsFrameRef.current = requestAnimationFrame(physicsLoop);
    };

    const runLayout = (options = {}) => {
      if (cy.destroyed()) {
        return;
      }

      const {
        animate = true,
        excludeIds = new Set(),
        fitView = false
      } = options;

      const excluded = new Set(excludeIds);

      cleanupLayout();

      const nodes = cy.nodes();
      const previousPositions = {};

      nodes.forEach(node => {
        previousPositions[node.id()] = { ...node.position() };
      });

      const layout = cy.layout(layoutConfig);
      layoutRef.current = layout;

      layout.once('layoutstop', () => {
        if (layoutRef.current === layout) {
          layoutRef.current = null;
        }
        if (cy.destroyed()) {
          return;
        }

        velocitiesRef.current.clear();

        if (animate) {
          const targetPositions = {};
          nodes.forEach(node => {
            targetPositions[node.id()] = { ...node.position() };
          });

          cy.batch(() => {
            nodes.forEach(node => {
              if (excluded.has(node.id()) && node.grabbed()) {
                return;
              }
              const stored = draggedPositionsRef.current.get(node.id()) || previousPositions[node.id()];
              if (stored) {
                node.position(stored);
              }
            });
          });

          nodes.forEach(node => {
            if (excluded.has(node.id())) {
              const stored = draggedPositionsRef.current.get(node.id()) || previousPositions[node.id()];
              if (stored && !node.grabbed()) {
                node.stop();
                node.position(stored);
              }
              return;
            }
            const target = targetPositions[node.id()];
            if (!target) {
              return;
            }
            node.stop();
            node.animate({ position: target }, {
              duration: 450,
              easing: 'ease-out'
            });
          });
        } else if (excluded.size > 0) {
          cy.batch(() => {
            excluded.forEach(id => {
              const node = cy.getElementById(id);
              const stored = draggedPositionsRef.current.get(id) || previousPositions[id];
              if (node && stored && !node.grabbed()) {
                node.position(stored);
              }
            });
          });
        }

        if (fitView) {
          cy.fit(undefined, 50);
        }
      });

      layout.run();
    };

    const scheduleLayout = (options = {}) => {
      const merged = {
        animate: options.animate !== undefined ? options.animate : (pendingLayoutOptionsRef.current?.animate ?? true),
        fitView: options.fitView !== undefined ? options.fitView : (pendingLayoutOptionsRef.current?.fitView ?? false),
        excludeIds: options.excludeIds !== undefined
          ? new Set(options.excludeIds)
          : (pendingLayoutOptionsRef.current?.excludeIds
            ? new Set(pendingLayoutOptionsRef.current.excludeIds)
            : new Set())
      };

      pendingLayoutOptionsRef.current = merged;

      if (layoutScheduledRef.current) {
        return;
      }

      layoutScheduledRef.current = true;

      if (layoutFrameRef.current) {
        cancelAnimationFrame(layoutFrameRef.current);
      }

      layoutFrameRef.current = requestAnimationFrame(() => {
        layoutScheduledRef.current = false;
        const opts = pendingLayoutOptionsRef.current || {};
        if (!opts.excludeIds) {
          opts.excludeIds = new Set();
        }
        pendingLayoutOptionsRef.current = null;
        layoutFrameRef.current = null;
        runLayout(opts);
      });
    };

    const updateDragTime = () => {
      lastDragTimeRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
    };

    runLayoutRef.current = runLayout;
    scheduleLayoutRef.current = scheduleLayout;

    const handleGrab = (evt) => {
      const node = evt.target;
      const id = node.id();
      draggingNodesRef.current.add(id);
      draggedPositionsRef.current.set(id, { ...node.position() });
      velocitiesRef.current.set(id, { x: 0, y: 0 });
      updateDragTime();
      ensurePhysicsLoop();
    };

    const handleDrag = (evt) => {
      const node = evt.target;
      const id = node.id();
      draggedPositionsRef.current.set(id, { ...node.position() });
      velocitiesRef.current.set(id, { x: 0, y: 0 });
      updateDragTime();
      ensurePhysicsLoop();
    };

    const handleFree = (evt) => {
      const node = evt.target;
      const id = node.id();
      draggingNodesRef.current.delete(id);
      draggedPositionsRef.current.set(id, { ...node.position() });
      velocitiesRef.current.set(id, { x: 0, y: 0 });
      updateDragTime();
      ensurePhysicsLoop();
    };

    const handleDestroy = () => {
      cy.off('grab', 'node', handleGrab);
      cy.off('drag', 'node', handleDrag);
      cy.off('free', 'node', handleFree);
      cy.off('tap', 'node');
      cy.off('mouseover', 'node');
      cy.off('mouseout', 'node');
      if (layoutFrameRef.current) {
        cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = null;
      }
      stopPhysicsLoop();
      layoutScheduledRef.current = false;
      pendingLayoutOptionsRef.current = null;
      cleanupLayout();
      runLayoutRef.current = null;
      scheduleLayoutRef.current = null;
      draggingNodesRef.current.clear();
      draggedPositionsRef.current.clear();
      velocitiesRef.current.clear();
      if (cyRef.current === cy) {
        cyRef.current = null;
      }
    };

    cy.on('destroy', handleDestroy);
    cy.on('grab', 'node', handleGrab);
    cy.on('drag', 'node', handleDrag);
    cy.on('free', 'node', handleFree);

    cy.on('tap', 'node', evt => {
      handleNodeClick(evt.target);
    });

    cy.on('mouseover', 'node', e => {
      e.target.style({
        'border-width': 2,
        'border-color': '#000'
      });
    });

    cy.on('mouseout', 'node', e => {
      e.target.style({
        'border-width': 0
      });
    });

    scheduleLayout({
      animate: true,
      excludeIds: new Set(),
      fitView: true
    });

    updateDragTime();
    ensurePhysicsLoop();
  };

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) {
      return;
    }
    if (graphData.nodes.length === 0) {
      draggingNodesRef.current.clear();
      draggedPositionsRef.current.clear();
      velocitiesRef.current.clear();
      return;
    }
    draggingNodesRef.current.clear();
    draggedPositionsRef.current.clear();
    velocitiesRef.current.clear();
    if (scheduleLayoutRef.current) {
      scheduleLayoutRef.current({
        animate: true,
        excludeIds: new Set(),
        fitView: true
      });
    } else if (runLayoutRef.current) {
      runLayoutRef.current({
        animate: true,
        excludeIds: new Set(),
        fitView: true
      });
    }
  }, [graphData]);

  return (
    <Card title="文物知识图谱">
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
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <Spin size="large" tip="加载知识图谱中..." />
        </div>
      ) : (
        <>
          {graphData.nodes.length > 0 ? (
            <div className="knowledge-graph">
              <CytoscapeComponent
                elements={cytoscapeElements}
                stylesheet={cytoscapeStylesheet}
                layout={layoutConfig}
                style={{ width: '100%', height: '600px' }}
                cy={onCytoscapeInit}
              />
            </div>
          ) : (
            <Empty description="暂无图谱数据" />
          )}
        </>
      )}
      
      {/* 实体详情模态框 */}
      <Modal
        title={selectedEntity ? `实体详情: ${selectedEntity.data('label')}` : '实体详情'}
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
