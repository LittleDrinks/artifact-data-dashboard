import React, { useState, useEffect } from 'react';
import { Input, Button, List, Card, Tag, Pagination, Spin, Empty, Alert } from 'antd';
import { SearchOutlined, EnvironmentOutlined, ClockCircleOutlined, TagOutlined } from '@ant-design/icons';
import { searchArtifacts } from '../services/artifact.service';

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
            <Spin size="large" tip="搜索中..." />
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
                        title={<a href={`#/artifact/${item.id}`}>{item.name}</a>}
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
    </div>
  );
};

export default ArtifactSearch;
