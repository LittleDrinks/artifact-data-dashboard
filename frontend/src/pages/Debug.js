import React, { useState, useEffect } from 'react';
import { Card, Button, Alert, Spin, Input, Space, Divider, Typography, Collapse, Table } from 'antd';
import { DatabaseOutlined, UserOutlined, HistoryOutlined, ApiOutlined } from '@ant-design/icons';
import axios from 'axios';
import { testDbConnection, testRecentActivities } from '../services/stats.service';
import { getCurrentUser } from '../services/auth.service';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

const Debug = () => {
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [activitiesStatus, setActivitiesStatus] = useState(null);
  const [rawApiResponse, setRawApiResponse] = useState(null);
  const [apiUrl, setApiUrl] = useState('/api/stats/recent-activities?limit=5');
  const [apiErrorDetails, setApiErrorDetails] = useState(null);

  useEffect(() => {
    // 获取当前用户信息
    const user = getCurrentUser();
    setUserInfo(user);
  }, []);

  const handleTestDbConnection = async () => {
    try {
      setLoading(true);
      const response = await testDbConnection();
      setDbStatus({
        status: 'success',
        data: response.data
      });
    } catch (err) {
      setDbStatus({
        status: 'error',
        error: err.response?.data || err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestActivities = async () => {
    try {
      setLoading(true);
      const response = await testRecentActivities();
      setActivitiesStatus({
        status: 'success',
        data: response.data
      });
    } catch (err) {
      setActivitiesStatus({
        status: 'error',
        error: err.response?.data || err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRawApiCall = async () => {
    try {
      setLoading(true);
      setApiErrorDetails(null);
      const response = await axios.get(apiUrl);
      setRawApiResponse({
        status: 'success',
        statusCode: response.status,
        data: response.data
      });
    } catch (err) {
      setRawApiResponse({
        status: 'error',
        statusCode: err.response?.status,
        error: err.response?.data || err.message
      });

      // 如果是数据库相关错误，尝试获取更详细的信息
      if (err.response?.data?.sqlMessage) {
        setApiErrorDetails({
          message: err.response.data.sqlMessage,
          code: err.response.data.code,
          sqlState: err.response.data.sqlState,
          stack: err.response.data.stack
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>系统调试页面</Title>
      <Paragraph>此页面用于诊断和测试系统的各个组件</Paragraph>

      <Divider orientation="left">用户信息</Divider>
      <Card>
        {userInfo ? (
          <div>
            <Paragraph>
              <Text strong>用户名:</Text> {userInfo.username}
            </Paragraph>
            <Paragraph>
              <Text strong>角色:</Text> {userInfo.role}
            </Paragraph>
            <Paragraph>
              <Text strong>用户ID:</Text> {userInfo.id}
            </Paragraph>
            <Paragraph>
              <Text strong>Token有效性:</Text>{' '}
              <Text type={userInfo.tokenIsValid ? 'success' : 'danger'}>
                {userInfo.tokenIsValid ? '有效' : '无效或已过期'}
              </Text>
            </Paragraph>
          </div>
        ) : (
          <Alert message="未登录" description="请先登录系统" type="warning" showIcon />
        )}
      </Card>

      <Divider orientation="left">数据库连接</Divider>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Button
          type="primary"
          icon={<DatabaseOutlined />}
          onClick={handleTestDbConnection}
          loading={loading}
        >
          测试数据库连接
        </Button>

        {dbStatus && (
          <Card>
            <Title level={4}>
              测试结果:{' '}
              <Text type={dbStatus.status === 'success' ? 'success' : 'danger'}>
                {dbStatus.status === 'success' ? '成功' : '失败'}
              </Text>
            </Title>
            <Collapse defaultActiveKey={['1']}>
              <Panel header="详细信息" key="1">
                <pre style={{ maxHeight: 400, overflow: 'auto' }}>
                  {JSON.stringify(dbStatus.status === 'success' ? dbStatus.data : dbStatus.error, null, 2)}
                </pre>
              </Panel>
            </Collapse>
          </Card>
        )}
      </Space>

      <Divider orientation="left">最近活动API测试</Divider>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Button
          type="primary"
          icon={<HistoryOutlined />}
          onClick={handleTestActivities}
          loading={loading}
        >
          测试最近活动API
        </Button>

        {activitiesStatus && (
          <Card>
            <Title level={4}>
              测试结果:{' '}
              <Text type={activitiesStatus.status === 'success' ? 'success' : 'danger'}>
                {activitiesStatus.status === 'success' ? '成功' : '失败'}
              </Text>
            </Title>
            <Collapse defaultActiveKey={['1']}>
              <Panel header="详细信息" key="1">
                <pre style={{ maxHeight: 400, overflow: 'auto' }}>
                  {JSON.stringify(
                    activitiesStatus.status === 'success' ? activitiesStatus.data : activitiesStatus.error,
                    null,
                    2
                  )}
                </pre>
              </Panel>
            </Collapse>
          </Card>
        )}
      </Space>

      <Divider orientation="left">自定义API调用</Divider>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Input
          addonBefore={<ApiOutlined />}
          placeholder="输入API URL，例如: /api/stats/recent-activities?limit=5"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          style={{ width: '100%' }}
        />
        <Button type="primary" onClick={handleRawApiCall} loading={loading}>
          发送请求
        </Button>

        {rawApiResponse && (
          <Card>
            <Title level={4}>
              请求结果:{' '}
              <Text type={rawApiResponse.status === 'success' ? 'success' : 'danger'}>
                {rawApiResponse.statusCode} {rawApiResponse.status === 'success' ? '成功' : '失败'}
              </Text>
            </Title>
            {apiErrorDetails && (
              <Alert
                message="SQL错误详情"
                description={
                  <div>
                    <p><Text strong>错误消息:</Text> {apiErrorDetails.message}</p>
                    <p><Text strong>错误代码:</Text> {apiErrorDetails.code}</p>
                    <p><Text strong>SQL状态:</Text> {apiErrorDetails.sqlState}</p>
                  </div>
                }
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            <Collapse defaultActiveKey={['1']}>
              <Panel header="响应数据" key="1">
                <pre style={{ maxHeight: 400, overflow: 'auto' }}>
                  {JSON.stringify(
                    rawApiResponse.status === 'success' ? rawApiResponse.data : rawApiResponse.error,
                    null,
                    2
                  )}
                </pre>
              </Panel>
            </Collapse>
          </Card>
        )}
      </Space>
    </div>
  );
};

export default Debug;
