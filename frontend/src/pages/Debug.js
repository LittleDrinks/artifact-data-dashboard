import React, { useState, useEffect } from 'react';
import { Card, Button, Alert, Input, Space, Divider, Typography, Collapse, Upload, Select, message } from 'antd';
import { DatabaseOutlined, HistoryOutlined, ApiOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { testDbConnection, testRecentActivities } from '../services/stats.service';
import { exportTableToExcel, importTableFromExcel } from '../services/debug.service';
import { getCurrentUser } from '../services/auth.service';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

const Debug = () => {
  // 为每个操作创建单独的loading状态
  const [dbLoading, setDbLoading] = useState(false);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  
  const [userInfo, setUserInfo] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [activitiesStatus, setActivitiesStatus] = useState(null);
  const [rawApiResponse, setRawApiResponse] = useState(null);
  const [apiUrl, setApiUrl] = useState('/api/stats/recent-activities?limit=5');
  const [apiErrorDetails, setApiErrorDetails] = useState(null);
  const [selectedTable, setSelectedTable] = useState('artifacts');
  const [importFileList, setImportFileList] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    // 获取当前用户信息
    const user = getCurrentUser();
    setUserInfo(user);
  }, []);  const handleTestDbConnection = async () => {
    try {
      setDbLoading(true);
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
      setDbLoading(false);
    }
  };
  
  // 清除数据库测试结果
  const clearDbStatus = () => {
    setDbStatus(null);
  };  const handleTestActivities = async () => {
    try {
      setActivitiesLoading(true);
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
      setActivitiesLoading(false);
    }
  };
  
  // 清除活动测试结果
  const clearActivitiesStatus = () => {
    setActivitiesStatus(null);
  };
  const handleRawApiCall = async () => {
    try {
      setApiLoading(true);
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
    } finally {      setApiLoading(false);
    }
  };
  
  // 清除API响应结果
  const clearRawApiResponse = () => {
    setRawApiResponse(null);
  };

  const handleExportExcel = async () => {
    try {
      setExportLoading(true);
      const response = await exportTableToExcel(selectedTable);
      const blob = new Blob([response.data], {
        type:
          response.headers['content-type'] ||
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      link.href = url;
      link.download = `${selectedTable}-${timestamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (err) {
      console.error('导出失败:', err);
      message.error(err.response?.data?.message || '导出失败，请稍后重试');
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportExcel = async () => {
    if (!importFileList.length) {
      message.warning('请先选择需要导入的Excel文件');
      return;
    }

    try {
      setImportLoading(true);
  const uploadFile = importFileList[0];
  const file = uploadFile.originFileObj || uploadFile;
  const response = await importTableFromExcel(selectedTable, file);
      setImportResult({ success: true, data: response.data });
      message.success('导入成功');
      setImportFileList([]);
    } catch (err) {
      console.error('导入失败:', err);
      setImportResult({
        success: false,
        error: err.response?.data || { message: err.message }
      });
      message.error(err.response?.data?.message || '导入失败，请检查文件内容');
    } finally {
      setImportLoading(false);
    }
  };

  const handleUploadBefore = (file) => {
    setImportFileList([file]);
    setImportResult(null);
    return false;
  };

  const handleUploadRemove = () => {
    setImportFileList([]);
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
      <Space direction="vertical" style={{ width: '100%' }}>        <Button
          type="primary"
          icon={<DatabaseOutlined />}
          onClick={handleTestDbConnection}
          loading={dbLoading}
        >
          测试数据库连接
        </Button>        {dbStatus && (
          <Card
            title="数据库连接测试结果"
            extra={<Button type="text" size="small" onClick={clearDbStatus}>×</Button>}
          >            <Title level={4} style={{ margin: 0 }}>测试结果: <Text type={dbStatus.status === 'success' ? 'success' : 'danger'}>{dbStatus.status === 'success' ? '成功' : '失败'}</Text></Title>
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
      <Space direction="vertical" style={{ width: '100%' }}>        <Button
          type="primary"
          icon={<HistoryOutlined />}
          onClick={handleTestActivities}
          loading={activitiesLoading}
        >
          测试最近活动API
        </Button>        {activitiesStatus && (
          <Card
            title="最近活动API测试结果"
            extra={<Button type="text" size="small" onClick={clearActivitiesStatus}>×</Button>}
          >            <Title level={4} style={{ margin: 0 }}>测试结果: <Text type={activitiesStatus.status === 'success' ? 'success' : 'danger'}>{activitiesStatus.status === 'success' ? '成功' : '失败'}</Text></Title>
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
        />        <Button type="primary" onClick={handleRawApiCall} loading={apiLoading}>
          发送请求
        </Button>{rawApiResponse && (
          <Card
            title="自定义API调用测试结果"
            extra={<Button type="text" size="small" onClick={clearRawApiResponse}>×</Button>}
          ><Title level={4} style={{ margin: 0 }}>请求结果: <Text type={rawApiResponse.status === 'success' ? 'success' : 'danger'}>{rawApiResponse.statusCode} {rawApiResponse.status === 'success' ? '成功' : '失败'}</Text></Title>
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

      <Divider orientation="left">Excel 数据导入 / 导出</Divider>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <Text strong>目标数据表：</Text>
            <Select
              value={selectedTable}
              onChange={setSelectedTable}
              options={[{ label: '文物信息（artifacts）', value: 'artifacts' }]}
              style={{ minWidth: 200 }}
            />
          </Space>

          <Space wrap>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportExcel}
              loading={exportLoading}
            >
              导出当前数据
            </Button>

            <Upload
              beforeUpload={handleUploadBefore}
              onRemove={handleUploadRemove}
              fileList={importFileList}
              accept=".xlsx,.xls"
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>选择Excel文件</Button>
            </Upload>

            <Button
              type="primary"
              onClick={handleImportExcel}
              loading={importLoading}
              disabled={!importFileList.length}
            >
              导入Excel
            </Button>
          </Space>

          {importResult && (
            <Card
              size="small"
              title={importResult.success ? '导入成功' : '导入失败'}
              headStyle={{ color: importResult.success ? '#52c41a' : '#ff4d4f' }}
            >
              <pre style={{ maxHeight: 300, overflow: 'auto', margin: 0 }}>
                {JSON.stringify(importResult.success ? importResult.data : importResult.error, null, 2)}
              </pre>
            </Card>
          )}
        </Space>
      </Card>
    </div>
  );
};

export default Debug;
