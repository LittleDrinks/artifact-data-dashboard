import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Input, Button, Spin, Alert, Modal, Descriptions, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import * as d3 from 'd3';
import { getGraphData, getEntityDetails } from '../services/graph.service';

// 动画配置常量
const ANIMATION_CONFIG = {
  nodeEnterDuration: 600,
  nodeEnterDelay: 30,
  linkEnterDuration: 800,
  linkEnterDelay: 20,
  hoverTransitionDuration: 200,
  pulseAnimationDuration: 1500,
  initialNodeRadius: 0,
  finalNodeRadius: 20,
  initialNodeOpacity: 0,
  finalNodeOpacity: 1
};

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

  // 初始化加载图谱数据
  useEffect(() => {
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
  const handleNodeClick = useCallback(async (node) => {
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
  }, []);

  // 节点颜色映射
  const getNodeColor = useCallback((type) => {
    const colorMap = {
      artifact: '#1890ff',
      category: '#52c41a',
      era: '#fa8c16',
      author: '#722ed1',
      location: '#eb2f96',
      material: '#f5222d'
    };
    return colorMap[type] || '#666';
  }, []);

  // 获取节点发光颜色(较亮版本用于动画效果)
  const getNodeGlowColor = useCallback((type) => {
    const glowMap = {
      artifact: '#69c0ff',
      category: '#95de64',
      era: '#ffc069',
      author: '#b37feb',
      location: '#ff85c0',
      material: '#ff7875'
    };
    return glowMap[type] || '#999';
  }, []);

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

    // 添加渐变和滤镜定义
    const defs = svg.append('defs');
    
    // 添加发光滤镜
    const glowFilter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    
    glowFilter.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur');
    
    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // 创建节点渐变
    const nodeTypes = ['artifact', 'category', 'era', 'author', 'location', 'material'];
    nodeTypes.forEach(type => {
      const gradient = defs.append('radialGradient')
        .attr('id', `gradient-${type}`)
        .attr('cx', '30%')
        .attr('cy', '30%')
        .attr('r', '70%');
      
      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', getNodeGlowColor(type))
        .attr('stop-opacity', 1);
      
      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', getNodeColor(type))
        .attr('stop-opacity', 1);
    });

    // 添加缩放功能
    const g = svg.append('g');
    
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);

    // 准备数据 - 随机分布初始位置以获得更好的动画效果
    const nodes = graphData.nodes.map((d, i) => {
      const angle = (i / graphData.nodes.length) * 2 * Math.PI;
      const radius = 50 + Math.random() * 100;
      return {
        ...d,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius
      };
    });
    const links = graphData.edges.map(d => ({ ...d }));

    // 创建力模拟 - 优化参数以获得更平滑的动画
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(120)
        .strength(0.4))
      .force('charge', d3.forceManyBody()
        .strength(-600)
        .distanceMax(400))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.08))
      .force('collision', d3.forceCollide().radius(40).strength(0.8))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03))
      .alphaDecay(0.015)
      .velocityDecay(0.4);

    simulationRef.current = simulation;

    // 创建箭头标记
    defs.append('marker')
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

    // 绘制连线 - 带入场动画
    const linkGroup = g.append('g').attr('class', 'links');
    const link = linkGroup.selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#e0e0e0')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0)
      .attr('marker-end', 'url(#arrow)')
      .style('transition', `stroke ${ANIMATION_CONFIG.hoverTransitionDuration}ms ease, stroke-width ${ANIMATION_CONFIG.hoverTransitionDuration}ms ease`);

    // 连线入场动画 - 淡入效果
    link.transition()
      .delay((d, i) => i * ANIMATION_CONFIG.linkEnterDelay)
      .duration(ANIMATION_CONFIG.linkEnterDuration)
      .ease(d3.easeCubicOut)
      .attr('stroke-opacity', 1)
      .attr('stroke', '#ccc');

    // 绘制连线标签 - 带入场动画
    const linkLabelGroup = g.append('g').attr('class', 'link-labels');
    const linkLabel = linkLabelGroup.selectAll('text')
      .data(links)
      .join('text')
      .attr('class', 'link-label')
      .attr('font-size', 10)
      .attr('fill', '#888')
      .attr('text-anchor', 'middle')
      .attr('opacity', 0)
      .text(d => d.label);

    // 连线标签入场动画
    linkLabel.transition()
      .delay((d, i) => i * ANIMATION_CONFIG.linkEnterDelay + 200)
      .duration(ANIMATION_CONFIG.linkEnterDuration)
      .ease(d3.easeCubicOut)
      .attr('opacity', 0.8);

    // 绘制节点 - 带入场动画
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const node = nodeGroup.selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer');

    // 添加节点外圈 (用于动画效果)
    const nodeOuter = node.append('circle')
      .attr('class', 'node-outer')
      .attr('r', 0)
      .attr('fill', 'none')
      .attr('stroke', d => getNodeGlowColor(d.type))
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0);

    // 添加节点主体
    const nodeCircle = node.append('circle')
      .attr('class', 'node-circle')
      .attr('r', 0)
      .attr('fill', d => `url(#gradient-${d.type})`)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('opacity', 0)
      .style('filter', 'none');

    // 节点入场动画 - 缩放 + 淡入
    nodeCircle.transition()
      .delay((d, i) => i * ANIMATION_CONFIG.nodeEnterDelay)
      .duration(ANIMATION_CONFIG.nodeEnterDuration)
      .ease(d3.easeElasticOut.amplitude(1).period(0.5))
      .attr('r', ANIMATION_CONFIG.finalNodeRadius)
      .attr('opacity', ANIMATION_CONFIG.finalNodeOpacity);

    // 外圈入场动画
    nodeOuter.transition()
      .delay((d, i) => i * ANIMATION_CONFIG.nodeEnterDelay + 100)
      .duration(ANIMATION_CONFIG.nodeEnterDuration)
      .ease(d3.easeElasticOut.amplitude(1).period(0.5))
      .attr('r', ANIMATION_CONFIG.finalNodeRadius + 5);

    // 节点交互事件
    node
      .on('click', (event, d) => {
        event.stopPropagation();
        
        // 点击动画 - 脉冲效果
        const clickedNode = d3.select(event.currentTarget);
        clickedNode.select('.node-outer')
          .attr('stroke-opacity', 0.8)
          .attr('r', ANIMATION_CONFIG.finalNodeRadius + 5)
          .transition()
          .duration(ANIMATION_CONFIG.pulseAnimationDuration)
          .ease(d3.easeQuadOut)
          .attr('r', ANIMATION_CONFIG.finalNodeRadius + 25)
          .attr('stroke-opacity', 0)
          .on('end', function() {
            d3.select(this).attr('r', ANIMATION_CONFIG.finalNodeRadius + 5);
          });
        
        handleNodeClick(d);
      })
      .on('mouseover', function(event, d) {
        const hoveredNode = d3.select(this);
        
        // 节点放大 + 发光效果
        hoveredNode.select('.node-circle')
          .transition()
          .duration(ANIMATION_CONFIG.hoverTransitionDuration)
          .ease(d3.easeCubicOut)
          .attr('r', ANIMATION_CONFIG.finalNodeRadius + 4)
          .style('filter', 'url(#glow)');
        
        // 显示外圈
        hoveredNode.select('.node-outer')
          .transition()
          .duration(ANIMATION_CONFIG.hoverTransitionDuration)
          .ease(d3.easeCubicOut)
          .attr('stroke-opacity', 0.6)
          .attr('r', ANIMATION_CONFIG.finalNodeRadius + 10);
        
        // 高亮相关连线
        link.transition()
          .duration(ANIMATION_CONFIG.hoverTransitionDuration)
          .attr('stroke', l => (l.source.id === d.id || l.target.id === d.id) ? '#1890ff' : '#e0e0e0')
          .attr('stroke-width', l => (l.source.id === d.id || l.target.id === d.id) ? 2.5 : 1.5)
          .attr('stroke-opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.3);
        
        // 高亮相关标签
        linkLabel.transition()
          .duration(ANIMATION_CONFIG.hoverTransitionDuration)
          .attr('opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.2)
          .attr('fill', l => (l.source.id === d.id || l.target.id === d.id) ? '#1890ff' : '#888');
      })
      .on('mouseout', function(event, d) {
        const hoveredNode = d3.select(this);
        
        // 恢复节点大小
        hoveredNode.select('.node-circle')
          .transition()
          .duration(ANIMATION_CONFIG.hoverTransitionDuration)
          .ease(d3.easeCubicOut)
          .attr('r', ANIMATION_CONFIG.finalNodeRadius)
          .style('filter', 'none');
        
        // 隐藏外圈
        hoveredNode.select('.node-outer')
          .transition()
          .duration(ANIMATION_CONFIG.hoverTransitionDuration)
          .ease(d3.easeCubicOut)
          .attr('stroke-opacity', 0)
          .attr('r', ANIMATION_CONFIG.finalNodeRadius + 5);
        
        // 恢复连线样式
        link.transition()
          .duration(ANIMATION_CONFIG.hoverTransitionDuration)
          .attr('stroke', '#ccc')
          .attr('stroke-width', 1.5)
          .attr('stroke-opacity', 1);
        
        // 恢复标签样式
        linkLabel.transition()
          .duration(ANIMATION_CONFIG.hoverTransitionDuration)
          .attr('opacity', 0.8)
          .attr('fill', '#888');
      })
      .call(d3.drag()
        .on('start', function(event, d) {
          if (!event.active) simulation.alphaTarget(0.1).restart();
          d.fx = d.x;
          d.fy = d.y;
          
          // 拖拽开始动画
          d3.select(this)
            .select('.node-circle')
            .transition()
            .duration(100)
            .attr('r', ANIMATION_CONFIG.finalNodeRadius + 2);
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', function(event, d) {
          if (!event.active) simulation.alphaTarget(0);
          
          // 拖拽结束动画
          d3.select(this)
            .select('.node-circle')
            .transition()
            .duration(300)
            .ease(d3.easeElasticOut.amplitude(1).period(0.4))
            .attr('r', ANIMATION_CONFIG.finalNodeRadius);
        }));

    // 绘制节点标签 - 带入场动画
    const labelGroup = g.append('g').attr('class', 'labels');
    const label = labelGroup.selectAll('text')
      .data(nodes)
      .join('text')
      .attr('class', 'node-label')
      .attr('font-size', 12)
      .attr('fill', '#333')
      .attr('text-anchor', 'middle')
      .attr('dy', 35)
      .attr('opacity', 0)
      .text(d => d.label)
      .style('pointer-events', 'none');

    // 标签入场动画
    label.transition()
      .delay((d, i) => i * ANIMATION_CONFIG.nodeEnterDelay + 200)
      .duration(ANIMATION_CONFIG.nodeEnterDuration)
      .ease(d3.easeCubicOut)
      .attr('opacity', 1);

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
        .attr('transform', d => `translate(${d.x}, ${d.y})`);

      label
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });

    // 等待布局稳定后自动适应视图
    simulation.on('end', () => {
      const bounds = g.node().getBBox();
      const fullWidth = svgRef.current.clientWidth || width;
      const fullHeight = height;
      const midX = bounds.x + bounds.width / 2;
      const midY = bounds.y + bounds.height / 2;
      const scale = 0.8 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight);
      const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];
      
      svg.transition()
        .duration(1000)
        .ease(d3.easeCubicInOut)
        .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, getNodeColor, getNodeGlowColor, handleNodeClick]);

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
