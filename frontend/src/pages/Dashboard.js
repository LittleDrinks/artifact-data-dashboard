import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Spin, Table, Alert } from 'antd';
import { FileTextOutlined, TagsOutlined, EnvironmentOutlined, ClockCircleOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { getStatsOverview, getRecentActivities } from '../services/stats.service';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    catalogedCount: 0,
    digitizedCount: 0,
    needsRepairCount: 0,
    categoryStats: [],
    locationStats: [],
    eraStats: []
  });
  const [activities, setActivities] = useState([]);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // 获取统计数据
        const statsResponse = await getStatsOverview();
        setStats(statsResponse.data);
        
        // 获取最近活动
        const activitiesResponse = await getRecentActivities(5);
        setActivities(activitiesResponse.data.activities);
        
        setError(null);
      } catch (err) {
        console.error('获取数据失败:', err);
        setError('获取数据失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // 准备图表选项
  const getCategoryChartOption = () => {
    return {
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        data: stats.categoryStats.map(item => item.category)
      },
      series: [
        {
          name: '文物分类',
          type: 'pie',
          radius: '70%',
          center: ['60%', '50%'],
          data: stats.categoryStats.map(item => ({
            name: item.category,
            value: item.count
          })),
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ]
    };
  };
  
  const getLocationChartOption = () => {
    return {
      tooltip: {
        trigger: 'item'
      },
      legend: {
        orient: 'vertical',
        left: 'left'
      },
      series: [
        {
          name: '文物地域分布',
          type: 'pie',
          radius: ['30%', '70%'],
          center: ['60%', '50%'],
          roseType: 'area',
          data: stats.locationStats.map(item => ({
            name: item.location,
            value: item.count
          }))
        }
      ]
    };
  };
  
  const getEraChartOption = () => {
    const eraOrder = [
      '新石器时代', '夏商周', '春秋战国', '秦汉', 
      '三国两晋', '南北朝', '隋唐', '宋元', '明清'
    ];
    
    // 按照历史顺序排序
    const sortedEraStats = [...stats.eraStats].sort((a, b) => {
      const indexA = eraOrder.indexOf(a.era);
      const indexB = eraOrder.indexOf(b.era);
      return indexA - indexB;
    });
    
    return {
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        data: ['文物数量']
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: sortedEraStats.map(item => item.era)
      },
      yAxis: {
        type: 'value'
      },
      series: [
        {
          name: '文物数量',
          type: 'line',
          data: sortedEraStats.map(item => item.count),
          markPoint: {
            data: [
              { type: 'max', name: '最大值' },
              { type: 'min', name: '最小值' }
            ]
          },
          markLine: {
            data: [
              { type: 'average', name: '平均值' }
            ]
          },
          smooth: true
        }
      ]
    };
  };
  
  // 活动日志列配置
  const activityColumns = [
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      render: (text) => {
        switch (text) {
          case 'login':
            return '登录';
          case 'view_artifact':
            return '查看文物';
          case 'search':
            return '搜索';
          default:
            return text;
        }
      }
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (text) => new Date(text).toLocaleString()
    }
  ];
  
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" tip="加载数据中..." />
      </div>
    );
  }
  
  if (error) {
    return (
      <Alert
        message="错误"
        description={error}
        type="error"
        showIcon
      />
    );
  }
  
  return (
    <div className="dashboard-container">
      <Row gutter={[16, 16]}>
        {/* 统计卡片 */}
        <Col xs={24} sm={12} md={6}>
          <Card className="dashboard-card">
            <Statistic 
              title="文物总数" 
              value={stats.total} 
              prefix={<FileTextOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="dashboard-card">
            <Statistic 
              title="已编目" 
              value={stats.catalogedCount} 
              prefix={<TagsOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="dashboard-card">
            <Statistic 
              title="已数字化" 
              value={stats.digitizedCount} 
              prefix={<ClockCircleOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="dashboard-card">
            <Statistic 
              title="需修复" 
              value={stats.needsRepairCount} 
              prefix={<EnvironmentOutlined />} 
            />
          </Card>
        </Col>
        
        {/* 分类饼图 */}
        <Col xs={24} md={12}>
          <Card title="文物分类分布" className="dashboard-card">
            <ReactECharts 
              option={getCategoryChartOption()} 
              style={{ height: '300px' }} 
            />
          </Card>
        </Col>
        
        {/* 地域分布图 */}
        <Col xs={24} md={12}>
          <Card title="文物地域分布" className="dashboard-card">
            <ReactECharts 
              option={getLocationChartOption()} 
              style={{ height: '300px' }} 
            />
          </Card>
        </Col>
        
        {/* 年代分布图 */}
        <Col xs={24}>
          <Card title="文物年代分布" className="dashboard-card">
            <ReactECharts 
              option={getEraChartOption()} 
              style={{ height: '300px' }} 
            />
          </Card>
        </Col>
        
        {/* 最近活动 */}
        <Col xs={24}>
          <Card title="最近活动" className="dashboard-card">
            <Table 
              dataSource={activities} 
              columns={activityColumns} 
              rowKey="id"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
