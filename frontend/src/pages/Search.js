import React, { useState } from 'react';
import { Input, Button, List, Card, Tag, Pagination, Spin, Empty, Alert, Modal, Table } from 'antd';
import { SearchOutlined, EnvironmentOutlined, ClockCircleOutlined, TagOutlined } from '@ant-design/icons';
import { searchArtifacts, getArtifactById } from '../services/artifact.service';

const { Search } = Input;

const ArtifactSearch = () => {
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [artifacts, setArtifacts] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  });
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailErrorLevel, setDetailErrorLevel] = useState('error');
  const [selectedArtifact, setSelectedArtifact] = useState(null);
  
  // 执行搜索
  const handleSearch = async (value = keyword, page = 1) => {
    if (!value.trim()) {
      return;
    }
    
    setLoading(true);
    setKeyword(value);
    
    try {
      const response = await searchArtifacts(value, page, pagination.pageSize);
      setArtifacts(response.data.data);
      setPagination({
        current: response.data.meta.page,
        pageSize: response.data.meta.limit,
        total: response.data.meta.total
      });
      setSearched(true);
      setError(null);
    } catch (err) {
      console.error('搜索失败:', err);
      setError('搜索失败，请稍后重试');
      setArtifacts([]);
    } finally {
      setLoading(false);
    }
  };
  
  // 页面变化处理
  const handlePageChange = (page) => {
    handleSearch(keyword, page);
  };

  const resolveArtifactId = (artifact) => {
    if (!artifact) {
      return null;
    }
    return (
      artifact.id ??
      artifact.artifact_id ??
      artifact.artifactId ??
      artifact.uuid ??
      artifact.slug ??
      null
    );
  };

  const openDetailModal = async (artifact) => {
    const artifactIdFromList = resolveArtifactId(artifact);

    setDetailVisible(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetailErrorLevel('error');
    setSelectedArtifact({
      ...artifact,
      id: artifact?.id ?? artifactIdFromList ?? undefined
    });

    try {
      const artifactId = artifactIdFromList;

      if (!artifactId) {
        setDetailError('无法确定文物编号，已展示搜索结果中的基础信息。');
        setDetailErrorLevel('warning');
        return;
      }

      const response = await getArtifactById(artifactId);
      setSelectedArtifact((prev) => ({
        ...prev,
        ...response.data,
        id: response.data?.id ?? artifactId
      }));
    } catch (err) {
      console.error('获取文物详情失败:', err);
      if (err.response?.status === 404) {
        setDetailError('未找到该文物的更多详情，已展示搜索结果中的基础信息。');
        setDetailErrorLevel('warning');
      } else {
        const message = err.response?.data?.message || '获取文物详情失败，请稍后重试';
        setDetailError(message);
        setDetailErrorLevel('error');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    setDetailVisible(false);
    setSelectedArtifact(null);
    setDetailError(null);
    setDetailErrorLevel('error');
  };

  const formatDetailRows = () => {
    if (!selectedArtifact) {
      return [];
    }

    const fieldOrder = [
      { key: 'id', label: '编号' },
      { key: 'name', label: '名称' },
      { key: 'era', label: '年代' },
      { key: 'category', label: '类别' },
      { key: 'location', label: '出土地' },
      { key: 'material', label: '材质' },
      { key: 'dimensions', label: '尺寸' },
      { key: 'weight', label: '重量' },
      { key: 'description', label: '描述' },
      { key: 'tags', label: '标签' },
      { key: 'created_at', label: '创建时间' },
      { key: 'updated_at', label: '更新时间' }
    ];

    const formatValue = (value) => {
      if (value === null || value === undefined || value === '') {
        return '—';
      }
      if (Array.isArray(value)) {
        return value.join('，');
      }
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value, null, 2);
        } catch (err) {
          return String(value);
        }
      }
      return String(value);
    };

    const usedKeys = new Set();
    const rows = fieldOrder.reduce((acc, field) => {
      if (Object.prototype.hasOwnProperty.call(selectedArtifact, field.key)) {
        usedKeys.add(field.key);
        acc.push({
          key: field.key,
          label: field.label,
          value: formatValue(selectedArtifact[field.key])
        });
      }
      return acc;
    }, []);

    Object.entries(selectedArtifact).forEach(([key, value]) => {
      if (usedKeys.has(key)) {
        return;
      }
      if (value === null || value === undefined || value === '') {
        return;
      }
      rows.push({
        key,
        label: key,
        value: formatValue(value)
      });
    });

    return rows;
  };

  const detailColumns = [
    {
      title: '字段',
      dataIndex: 'label',
      key: 'label',
      width: 160
    },
    {
      title: '信息',
      dataIndex: 'value',
      key: 'value',
      render: (text) => (
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>
      )
    }
  ];

  const detailRows = formatDetailRows();
  
  return (
    <div className="search-container">
      <Card>
        <Search
          placeholder="请输入文物名称、描述或类别关键词"
          enterButton={<Button type="primary" icon={<SearchOutlined />}>搜索</Button>}
          size="large"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={handleSearch}
          loading={loading}
        />
        
        {error && (
          <Alert
            style={{ marginTop: 16 }}
            message="错误"
            description={error}
            type="error"
            showIcon
          />
        )}
        
        {loading ? (
          <div style={{ textAlign: 'center', margin: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: '#999' }}>搜索中...</div>
          </div>
        ) : (
          <>
            {searched && (
              <div style={{ margin: '16px 0' }}>
                {artifacts.length > 0 ? (
                  <span>找到 {pagination.total} 条结果</span>
                ) : (
                  <Empty description="未找到匹配的文物" />
                )}
              </div>
            )}
            
            {artifacts.length > 0 && (
              <>
                <List
                  itemLayout="vertical"
                  dataSource={artifacts}
                  renderItem={item => (
                    <List.Item
                      key={item.id}
                      onClick={() => openDetailModal(item)}
                      style={{ cursor: 'pointer' }}
                      extra={
                        item.image_url ? (
                          <img 
                            width={180} 
                            alt={item.name} 
                            src={item.image_url}
                            style={{ borderRadius: '4px' }}
                          />
                        ) : null
                      }
                    >
                      <List.Item.Meta
                        title={item.name}
                        description={
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', marginBottom: 8 }}>
                              <span style={{ marginRight: 24 }}>
                                <ClockCircleOutlined style={{ marginRight: 8 }} />
                                {item.era || '未知年代'}
                              </span>
                              <span>
                                <EnvironmentOutlined style={{ marginRight: 8 }} />
                                {item.location || '未知地点'}
                              </span>
                            </div>
                            <div>
                              <TagOutlined style={{ marginRight: 8 }} />
                              {item.category || '未分类'}
                            </div>
                          </div>
                        }
                      />
                      <div>{item.description}</div>
                      <div style={{ marginTop: 8 }}>
                        {item.tags && item.tags.split(',').map((tag, index) => (
                          <Tag key={index} color="blue">{tag.trim()}</Tag>
                        ))}
                      </div>
                    </List.Item>
                  )}
                />
                
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <Pagination
                    current={pagination.current}
                    pageSize={pagination.pageSize}
                    total={pagination.total}
                    onChange={handlePageChange}
                    showTotal={total => `共 ${total} 条记录`}
                  />
                </div>
              </>
            )}
          </>
        )}
      </Card>

      <Modal
        title={selectedArtifact?.name || '文物详情'}
        open={detailVisible}
        onCancel={closeDetailModal}
        footer={null}
        width={720}
        bodyStyle={{ maxHeight: '60vh', overflowY: 'auto' }}
        destroyOnClose
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: '#999' }}>加载文物详情...</div>
          </div>
        ) : (
          <>
            {detailError && (
              <Alert
                type={detailErrorLevel === 'error' ? 'error' : 'warning'}
                showIcon
                message={detailErrorLevel === 'error' ? '加载失败' : '提示'}
                description={detailError}
                style={{ marginBottom: 16 }}
                closable
                onClose={() => {
                  setDetailError(null);
                  setDetailErrorLevel('error');
                }}
              />
            )}
            {selectedArtifact ? (
              detailRows.length > 0 ? (
                <Table
                  columns={detailColumns}
                  dataSource={detailRows}
                  pagination={false}
                  rowKey={(record) => record.key}
                  size="small"
                />
              ) : (
                <Empty description="暂无可展示的数据" />
              )
            ) : (
              <Empty description="暂无文物详情" />
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default ArtifactSearch;
