import React, { useState, useEffect, useCallback } from 'react';
import { Card, Radio, Spin, Alert, Select, Empty } from 'antd';
import ReactECharts from 'echarts-for-react';
import 'echarts-wordcloud';
import { getWordcloudData, getCategoriesWordcloud } from '../services/wordcloud.service';

const { Option } = Select;

const Wordcloud = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wordcloudData, setWordcloudData] = useState([]);
  const [categoriesData, setCategoriesData] = useState({});
  const [filter, setFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [eraFilter, setEraFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [eras, setEras] = useState([]);
  
  // 加载所有类别和年代数据
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const response = await getCategoriesWordcloud();
        setCategoriesData(response.data);
        
        // 提取所有类别
        setCategories(Object.keys(response.data));
        
        // 假设通过另一个API获取年代，这里模拟一些年代数据
        setEras([
          '新石器时代', '商代', '西周', '春秋', '战国',
          '秦汉', '隋唐', '宋元', '明清'
        ]);
      } catch (err) {
        console.error('获取过滤选项失败:', err);
        setError('获取过滤选项失败，请稍后重试');
      }
    };
    
    fetchFilters();
  }, []);
  
  // 根据筛选获取词云数据
  const fetchWordcloudData = useCallback(async () => {
    setLoading(true);
    
    try {
      if (filter === 'all') {
        const response = await getWordcloudData(categoryFilter, eraFilter);
        setWordcloudData(response.data.wordcloudData);
      } else if (filter === 'category' && categoriesData[categoryFilter]) {
        // 使用预加载的类别词云数据
        setWordcloudData(categoriesData[categoryFilter]);
      } else {
        // 如果选择特定类别但数据未加载，重新请求
        const response = await getWordcloudData(categoryFilter, eraFilter);
        setWordcloudData(response.data.wordcloudData);
      }
      
      setError(null);
    } catch (err) {
      console.error('获取词云数据失败:', err);
      setError('获取词云数据失败，请稍后重试');
      setWordcloudData([]);
    } finally {
      setLoading(false);
    }
  }, [filter, categoryFilter, eraFilter, categoriesData]);
  
  // 当筛选条件变化时重新获取数据
  useEffect(() => {
    fetchWordcloudData();
  }, [fetchWordcloudData]);
  
  // 筛选类型变化处理
  const handleFilterChange = (e) => {
    setFilter(e.target.value);
    
    // 重置类别和年代筛选
    if (e.target.value === 'all') {
      setCategoryFilter('');
      setEraFilter('');
    } else if (e.target.value === 'category') {
      setCategoryFilter(categories[0] || '');
      setEraFilter('');
    } else if (e.target.value === 'era') {
      setCategoryFilter('');
      setEraFilter(eras[0] || '');
    }
  };
  
  // 获取词云图表配置
  const getWordcloudOption = () => {
    return {
      tooltip: {
        show: true
      },
      series: [{
        type: 'wordCloud',
        shape: 'circle',
        left: 'center',
        top: 'center',
        width: '90%',
        height: '90%',
        right: null,
        bottom: null,
        sizeRange: [12, 55],
        rotationRange: [-90, 90],
        rotationStep: 45,
        gridSize: 8,
        drawOutOfBound: false,
        textStyle: {
          fontFamily: 'sans-serif',
          fontWeight: 'bold',
          color: function () {
            return 'rgb(' + [
              Math.round(Math.random() * 160),
              Math.round(Math.random() * 160),
              Math.round(Math.random() * 160)
            ].join(',') + ')';
          }
        },
        emphasis: {
          focus: 'self',
          textStyle: {
            shadowBlur: 10,
            shadowColor: '#333'
          }
        },
        data: wordcloudData
      }]
    };
  };
  
  return (
    <Card title="文物描述词云分析">
      <div className="wordcloud-controls">
        <Radio.Group value={filter} onChange={handleFilterChange} style={{ marginRight: 16 }}>
          <Radio.Button value="all">全部文物</Radio.Button>
          <Radio.Button value="category">按类别</Radio.Button>
          <Radio.Button value="era">按年代</Radio.Button>
        </Radio.Group>
        
        {filter === 'category' && (
          <Select
            style={{ width: 200 }}
            value={categoryFilter}
            onChange={(value) => setCategoryFilter(value)}
            placeholder="选择类别"
          >
            {categories.map(category => (
              <Option key={category} value={category}>{category}</Option>
            ))}
          </Select>
        )}
        
        {filter === 'era' && (
          <Select
            style={{ width: 200 }}
            value={eraFilter}
            onChange={(value) => setEraFilter(value)}
            placeholder="选择年代"
          >
            {eras.map(era => (
              <Option key={era} value={era}>{era}</Option>
            ))}
          </Select>
        )}
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
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" tip="加载词云中..." />
        </div>
      ) : (
        <>
          {wordcloudData && wordcloudData.length > 0 ? (
            <div className="chart-container full-height-chart">
              <ReactECharts
                option={getWordcloudOption()}
                style={{ height: '500px' }}
              />
            </div>
          ) : (
            <Empty description="没有足够的数据生成词云" />
          )}
        </>
      )}
    </Card>
  );
};

export default Wordcloud;
