import React, { useState, useEffect, useRef } from 'react';
import { Card, Input, Button, Spin, Alert, Modal, Descriptions, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import Cytoscape from 'cytoscape';
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
  
  // 初始化加载图谱数据
  useEffect(() => {
    fetchGraphData();
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
  const getCytoscapeElements = () => {
    return [
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
    ];
  };
  
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
    animate: true,
    nodeDimensionsIncludeLabels: true,
    randomize: true,
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
    
    // 注册节点点击事件
    cy.on('tap', 'node', function(evt) {
      handleNodeClick(evt.target);
    });
    
    // 实现悬停效果
    cy.on('mouseover', 'node', function(e) {
      e.target.style({
        'border-width': 2,
        'border-color': '#000'
      });
    });
    
    cy.on('mouseout', 'node', function(e) {
      e.target.style({
        'border-width': 0
      });
    });
  };
  
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
                elements={getCytoscapeElements()}
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
