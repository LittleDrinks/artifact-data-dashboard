import React, { useState, useEffect, useRef } from 'react';
import { Card, Input, Button, Spin, Alert, Modal, Descriptions, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import * as d3 from 'd3';
import { useLocation } from 'react-router-dom';
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

  const svgRef = useRef(null);
  const simulationRef = useRef(null);
  const zoomRef = useRef(null);
  const svgSelectionRef = useRef(null);
  const gSelectionRef = useRef(null);
  const hasAutoFitRef = useRef(false);
  const focusNodeIdRef = useRef(null);
  const location = useLocation();

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
          try {
            const focusId = sessionStorage.getItem('chatGraphFocusNodeId');
            focusNodeIdRef.current = focusId ? String(focusId) : null;
            sessionStorage.removeItem('chatGraphFocusNodeId');
          } catch (e) {
            focusNodeIdRef.current = null;
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
  }, []);

  // 清理D3模拟
  useEffect(() => {
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
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
    if (!svgRef.current || graphData.nodes.length === 0) {
      return;
    }

    const width = 1000;
    const height = 600;
    
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
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);

    zoomRef.current = zoom;
    svgSelectionRef.current = svg;
    gSelectionRef.current = g;

    // 准备数据
    const nodes = graphData.nodes.map(d => ({ ...d, x: width / 2, y: height / 2 }));
    const links = graphData.edges.map(d => ({ ...d }));

    // 创建力模拟
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(120)
        .strength(0.3))
      .force('charge', d3.forceManyBody()
        .strength(-800)
        .distanceMax(500))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.1))
      .force('collision', d3.forceCollide().radius(35))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05))
      .alphaDecay(0.02)
      .velocityDecay(0.3);

    simulationRef.current = simulation;

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

    // 绘制连线标签
    const linkLabel = g.append('g')
      .selectAll('text')
      .data(links)
      .join('text')
      .attr('class', 'link-label')
      .attr('font-size', 10)
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .text(d => d.label);

    // 绘制节点
    const focusId = focusNodeIdRef.current;
    const node = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 20)
      .attr('fill', d => getNodeColor(d.type))
      .attr('stroke', d => (focusId && String(d.id) === String(focusId) ? '#000' : '#fff'))
      .attr('stroke-width', d => (focusId && String(d.id) === String(focusId) ? 4 : 2))
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        handleNodeClick(d);
      })
      .on('mouseover', function() {
        d3.select(this)
          .attr('stroke', '#000')
          .attr('stroke-width', 3);
      })
      .on('mouseout', function(event, d) {
        const isFocus = focusId && String(d.id) === String(focusId);
        d3.select(this)
          .attr('stroke', isFocus ? '#000' : '#fff')
          .attr('stroke-width', isFocus ? 4 : 2);
      })
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.1).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          // 保持固定位置，不释放节点
          // d.fx = null;
          // d.fy = null;
        }));

    // 绘制节点标签
    const label = g.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .attr('class', 'node-label')
      .attr('font-size', 12)
      .attr('fill', '#333')
      .attr('text-anchor', 'middle')
      .attr('dy', 35)
      .text(d => d.label)
      .style('pointer-events', 'none');

    // 更新位置
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      label
        .attr('x', d => d.x)
        .attr('y', d => d.y);
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

    // 等待布局稳定后自动适应视图：仅首次初始化执行一次，避免交互时频繁跳动
    simulation.on('end', () => {
      if (hasAutoFitRef.current) return;
      hasAutoFitRef.current = true;
      fitToView();
    });

    // 暴露给快捷键使用
    gSelectionRef.current.__fitToView = fitToView;

    return () => {
      simulation.stop();
    };
  }, [graphData]);

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
            <div className="knowledge-graph" style={{ border: '1px solid #d9d9d9', borderRadius: '4px', overflow: 'hidden' }}>
              <svg ref={svgRef} style={{ display: 'block', background: '#fafafa' }} />
            </div>
          ) : (
            <Empty description="暂无图谱数据" />
          )}
        </>
      )}
      
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
