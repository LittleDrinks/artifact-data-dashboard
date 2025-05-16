import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Spin, Table, Alert, Button, Space } from 'antd';
import { FileTextOutlined, TagsOutlined, EnvironmentOutlined, ClockCircleOutlined, DatabaseOutlined, HistoryOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { getStatsOverview, getRecentActivities, testDbConnection, testRecentActivities } from '../services/stats.service';

const Dashboard = () => {  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);  
  const [dbStatus, setDbStatus] = useState(null);
  const [dbTesting, setDbTesting] = useState(false);
  const [activitiesStatus, setActivitiesStatus] = useState(null);
  const [activitiesTesting, setActivitiesTesting] = useState(false);
  const [activeTestResult, setActiveTestResult] = useState(null); // 记录当前显示的测试结果类型
  const [dbConnected, setDbConnected] = useState(false); // 记录数据库是否连接成功
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
        
        // 首先测试数据库连接
        try {
          const dbResponse = await testDbConnection();
          if (dbResponse && dbResponse.data && dbResponse.data.connection === 'success') {
            setDbConnected(true); // 设置数据库连接成功
            console.log('数据库连接成功');
          }
        } catch (dbErr) {
          console.error('自动测试数据库连接失败:', dbErr);
          // 不设置错误，让用户通过按钮手动测试
        }
        
        // 获取统计数据
        try {
          const statsResponse = await getStatsOverview();
          setStats(statsResponse.data);
        } catch (statsErr) {
          console.error('获取统计数据失败:', statsErr);
          throw new Error(`获取统计数据失败: ${statsErr.response?.data?.message || statsErr.message}`);
        }
        
        // 获取最近活动
        try {
          const activitiesResponse = await getRecentActivities(5);
          setActivities(activitiesResponse.data.activities);
        } catch (activitiesErr) {
          console.error('获取最近活动失败:', activitiesErr);
          throw new Error(`获取最近活动失败: ${activitiesErr.response?.data?.message || activitiesErr.message}`);
        }
        
        setError(null);
      } catch (err) {
        console.error('获取数据失败:', err);
        setError(err.message || '获取数据失败，请稍后重试');
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
  
  // 测试数据库连接
  const handleTestDbConnection = async () => {
    try {
      setDbTesting(true);
      // 隐藏活动API测试结果
      setActivitiesStatus(null);
      // 设置当前活动测试类型
      setActiveTestResult('db');
      
      const response = await testDbConnection();
      // 判断连接是否成功
      const isSuccess = response && response.data && response.data.connection === 'success';
      
      setDbStatus({
        status: isSuccess ? 'success' : 'error',
        message: isSuccess ? '数据库连接正常' : '数据库连接异常',
        details: response.data
      });
      
      // 更新数据库连接状态
      setDbConnected(isSuccess);
    } catch (err) {
      console.error('测试数据库连接失败:', err);
      setDbStatus({
        status: 'error',
        message: '数据库连接失败',
        details: err.response?.data || { error: err.message }
      });
      setDbConnected(false); // 设置数据库连接失败状态
    } finally {
      setDbTesting(false);
    }
  };
  
  // 测试最近活动API
  const handleTestRecentActivities = async () => {
    try {
      setActivitiesTesting(true);
      // 隐藏数据库测试结果
      setDbStatus(null);
      // 设置当前活动测试类型
      setActiveTestResult('activities');
      
      const response = await testRecentActivities();
      setActivitiesStatus({
        status: 'success',
        message: '最近活动API测试成功',
        details: response.data
      });
    } catch (err) {
      console.error('测试最近活动API失败:', err);
      setActivitiesStatus({
        status: 'error',
        message: '最近活动API测试失败',
        details: err.response?.data || { error: err.message }
      });
    } finally {
      setActivitiesTesting(false);
    }
  };
  
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" tip="加载数据中..." />
      </div>
    );
  }
    if (error) {
    return (
      <>
        <Alert
          message="错误"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Space>
          <Button 
            type="primary" 
            icon={<DatabaseOutlined />} 
            loading={dbTesting}
            onClick={handleTestDbConnection}
          >
            测试数据库连接
          </Button>
          <Button 
            type="primary" 
            icon={<HistoryOutlined />} 
            loading={activitiesTesting}
            onClick={handleTestRecentActivities}
          >
            测试最近活动API
          </Button>
        </Space>
        {dbStatus && (
          <Alert
            message={dbStatus.status === 'success' ? '连接成功' : '连接失败'}
            description={
              <div>
                <p>{dbStatus.message}</p>
                {dbStatus.details && (
                  <pre style={{ maxHeight: '300px', overflow: 'auto' }}>{JSON.stringify(dbStatus.details, null, 2)}</pre>
                )}
              </div>
            }
            type={dbStatus.status === 'success' ? 'success' : 'error'}
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
        {activitiesStatus && (
          <Alert
            message={activitiesStatus.status === 'success' ? 'API测试成功' : 'API测试失败'}
            description={
              <div>
                <p>{activitiesStatus.message}</p>
                {activitiesStatus.details && (
                  <pre style={{ maxHeight: '300px', overflow: 'auto' }}>{JSON.stringify(activitiesStatus.details, null, 2)}</pre>
                )}
              </div>
            }
            type={activitiesStatus.status === 'success' ? 'success' : 'error'}
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </>
    );
  }    return (
    <div className="dashboard-container">
      {/* 仅在数据库未连接时显示测试按钮 */}
      {!dbConnected && (
        <div style={{ marginBottom: 16, textAlign: 'right' }}>
          <Space>
            <Button 
              type="primary" 
              icon={<DatabaseOutlined />} 
              loading={dbTesting}
              onClick={handleTestDbConnection}
            >
              测试数据库连接
            </Button>
            <Button 
              type="primary" 
              icon={<HistoryOutlined />} 
              loading={activitiesTesting}
              onClick={handleTestRecentActivities}
            >
              测试最近活动API
            </Button>
          </Space>
          {dbStatus && (
            <Alert
              message={dbStatus.status === 'success' ? '连接成功' : '连接失败'}
              description={
                <div>
                  <p>{dbStatus.message}</p>
                  {dbStatus.details && (
                    <pre style={{ maxHeight: '300px', overflow: 'auto' }}>{JSON.stringify(dbStatus.details, null, 2)}</pre>
                  )}
                </div>
              }
              type={dbStatus.status === 'success' ? 'success' : 'error'}
              showIcon
              style={{ marginTop: 16, marginBottom: 16 }}
            />
          )}
          {activitiesStatus && (
            <Alert
              message={activitiesStatus.status === 'success' ? 'API测试成功' : 'API测试失败'}
              description={
                <div>
                  <p>{activitiesStatus.message}</p>
                  {activitiesStatus.details && (
                    <pre style={{ maxHeight: '300px', overflow: 'auto' }}>{JSON.stringify(activitiesStatus.details, null, 2)}</pre>
                  )}
                </div>
              }
              type={activitiesStatus.status === 'success' ? 'success' : 'error'}
              showIcon
              style={{ marginTop: 16, marginBottom: 16 }}
            />
          )}
        </div>
      )}
      
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
