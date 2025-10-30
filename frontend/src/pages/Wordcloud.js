import React, { useState, useEffect, useRef } from 'react';
import { Card, Radio, Spin, Alert, Select, Empty } from 'antd';
import ReactECharts from 'echarts-for-react';
import 'echarts-wordcloud';
import { getWordcloudData, getCategoriesWordcloud } from '../services/wordcloud.service';

const DEFAULT_ERAS = [
  '新石器时代',
  '商代',
  '西周',
  '春秋',
  '战国',
  '秦汉',
  '隋唐',
  '宋元',
  '明清'
];

const { Option } = Select;

const Wordcloud = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wordcloudData, setWordcloudData] = useState([]);
  const [filter, setFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [eraFilter, setEraFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const eras = DEFAULT_ERAS;
  const categoryWordcloudCache = useRef({});
  const defaultWordcloudRef = useRef([]);
  const hasSkippedInitialFilterEffect = useRef(false);
  // 加载所有类别和年代数据
  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        setLoading(true);
        setError(null);

        const [filtersResult, wordcloudResult] = await Promise.allSettled([
          getCategoriesWordcloud(),
          getWordcloudData('', '')
        ]);

        if (!isMounted) {
          return;
        }

        if (filtersResult.status === 'fulfilled') {
          const categoryMap = filtersResult.value?.data || {};
          categoryWordcloudCache.current = categoryMap;
          setCategories(Object.keys(categoryMap));
        } else {
          console.error('获取过滤选项失败:', filtersResult.reason);
        }

        if (wordcloudResult.status === 'fulfilled') {
          const initialWordcloud = wordcloudResult.value?.data?.wordcloudData || [];
          setWordcloudData(initialWordcloud);
          defaultWordcloudRef.current = initialWordcloud;
          setError(null);
        } else {
          console.error('初始化词云数据失败:', wordcloudResult.reason);
          const errorMessage = wordcloudResult.reason?.response?.data?.message || '加载词云数据失败，请稍后重试';
          setError(errorMessage);
          setWordcloudData([]);
        }
      } catch (err) {
        if (!isMounted) {
          return;
        }
        console.error('初始化词云数据失败:', err);
        const errorMessage = err.response?.data?.message || '加载词云数据失败，请稍后重试';
        setError(errorMessage);
        setWordcloudData([]);
      } finally {
        if (isMounted) {
          setLoading(false);
          setInitialDataLoaded(true);
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!initialDataLoaded) {
      return;
    }

    if (!hasSkippedInitialFilterEffect.current) {
      hasSkippedInitialFilterEffect.current = true;
      if (filter === 'all' && !categoryFilter && !eraFilter) {
        return;
      }
    }

    if (filter === 'category' && !categoryFilter) {
      if (categories.length > 0) {
        setCategoryFilter(categories[0]);
      }
      return;
    }

    if (filter === 'era' && !eraFilter) {
      if (eras.length > 0) {
        setEraFilter(eras[0]);
      }
      return;
    }

    const fetchData = async () => {
      if (filter === 'category' && categoryFilter && categoryWordcloudCache.current[categoryFilter]) {
        setWordcloudData(categoryWordcloudCache.current[categoryFilter]);
        setError(null);
        return;
      }

      setLoading(true);

      try {
        const response = await getWordcloudData(
          filter === 'category' ? categoryFilter : '',
          filter === 'era' ? eraFilter : ''
        );
        const data = response?.data?.wordcloudData || [];
        setWordcloudData(data);
        setError(null);

        if (filter === 'category' && categoryFilter) {
          categoryWordcloudCache.current = {
            ...categoryWordcloudCache.current,
            [categoryFilter]: data
          };
        }

        if (filter === 'all' && !categoryFilter && !eraFilter) {
          defaultWordcloudRef.current = data;
        }
      } catch (err) {
        console.error('获取词云数据失败:', err);
        setError('获取词云数据失败，请稍后重试');
        setWordcloudData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filter, categoryFilter, eraFilter, initialDataLoaded, categories, eras]);
  // 筛选类型变化处理
  const handleFilterChange = (e) => {
    setFilter(e.target.value);
    
    // 重置类别和年代筛选
    if (e.target.value === 'all') {
      setCategoryFilter('');
      setEraFilter('');
      if (defaultWordcloudRef.current && defaultWordcloudRef.current.length) {
        setWordcloudData(defaultWordcloudRef.current);
        setError(null);
      }
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
