import React, { useReducer, useEffect } from 'react';
import { Card, Button, Alert, Input, Space, Divider, Typography, Collapse, Upload, Select, message } from 'antd';
import { DatabaseOutlined, HistoryOutlined, ApiOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { testDbConnection, testRecentActivities } from '../services/stats.service';
import { exportTableToExcel, importTableFromExcel } from '../services/debug.service';
import { getCurrentUser } from '../services/auth.service';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

const initialState = {
  dbLoading: false,
  activitiesLoading: false,
  apiLoading: false,
  importLoading: false,
  exportLoading: false,
  userInfo: null,
  dbStatus: null,
  activitiesStatus: null,
  rawApiResponse: null,
  apiUrl: '/api/stats/recent-activities?limit=5',
  apiErrorDetails: null,
  selectedTable: 'artifacts',
  importFileList: [],
  importResult: null
};

function debugReducer(state, action) {
  switch (action.type) {
    case 'SET_USER_INFO':
      return { ...state, userInfo: action.payload };
    case 'SET_LOADING':
      return { ...state, [action.key]: action.value };
    case 'SET_STATUS':
      return { ...state, [action.key]: action.value };
    case 'SET_API_URL':
      return { ...state, apiUrl: action.payload };
    case 'SET_SELECTED_TABLE':
      return { ...state, selectedTable: action.payload };
    case 'SET_IMPORT_FILE_LIST':
      return { ...state, importFileList: action.payload };
    case 'RESET_STATUS':
      return { ...state, [action.key]: null };
    default:
      return state;
  }
}

const Debug = () => {
  const [state, dispatch] = useReducer(debugReducer, initialState);

  useEffect(() => {
    const user = getCurrentUser();
    dispatch({ type: 'SET_USER_INFO', payload: user });
  }, []);

  const handleTestDbConnection = async () => {
    try {
      dispatch({ type: 'SET_LOADING', key: 'dbLoading', value: true });
      const response = await testDbConnection();
      dispatch({ type: 'SET_STATUS', key: 'dbStatus', value: { status: 'success', data: response.data } });
    } catch (err) {
      dispatch({ type: 'SET_STATUS', key: 'dbStatus', value: { status: 'error', error: err.response?.data || err.message } });
    } finally {
      dispatch({ type: 'SET_LOADING', key: 'dbLoading', value: false });
    }
  };

  const clearDbStatus = () => {
    dispatch({ type: 'RESET_STATUS', key: 'dbStatus' });
  };

  const handleTestActivities = async () => {
    try {
      dispatch({ type: 'SET_LOADING', key: 'activitiesLoading', value: true });
      const response = await testRecentActivities();
      dispatch({ type: 'SET_STATUS', key: 'activitiesStatus', value: { status: 'success', data: response.data } });
    } catch (err) {
      dispatch({ type: 'SET_STATUS', key: 'activitiesStatus', value: { status: 'error', error: err.response?.data || err.message } });
    } finally {
      dispatch({ type: 'SET_LOADING', key: 'activitiesLoading', value: false });
    }
  };

  const clearActivitiesStatus = () => {
    dispatch({ type: 'RESET_STATUS', key: 'activitiesStatus' });
  };

  const handleRawApiCall = async () => {
    try {
      dispatch({ type: 'SET_LOADING', key: 'apiLoading', value: true });
      dispatch({ type: 'SET_STATUS', key: 'apiErrorDetails', value: null });
      const response = await axios.get(state.apiUrl);
      dispatch({ type: 'SET_STATUS', key: 'rawApiResponse', value: { status: 'success', statusCode: response.status, data: response.data } });
    } catch (err) {
      dispatch({ type: 'SET_STATUS', key: 'rawApiResponse', value: { status: 'error', statusCode: err.response?.status, error: err.response?.data || err.message } });

      if (err.response?.data?.sqlMessage) {
        dispatch({ type: 'SET_STATUS', key: 'apiErrorDetails', value: {
          message: err.response.data.sqlMessage,
          code: err.response.data.code,
          sqlState: err.response.data.sqlState,
          stack: err.response.data.stack
        }});
      }
    } finally {
      dispatch({ type: 'SET_LOADING', key: 'apiLoading', value: false });
    }
  };

  const clearRawApiResponse = () => {
    dispatch({ type: 'RESET_STATUS', key: 'rawApiResponse' });
  };

  const handleExportExcel = async () => {
    try {
      dispatch({ type: 'SET_LOADING', key: 'exportLoading', value: true });
      const response = await exportTableToExcel(state.selectedTable);
      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      link.href = url;
      link.download = `${state.selectedTable}-${timestamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (err) {
      console.error('导出失败:', err);
      message.error(err.response?.data?.message || '导出失败，请稍后重试');
    } finally {
      dispatch({ type: 'SET_LOADING', key: 'exportLoading', value: false });
    }
  };

  const handleImportExcel = async () => {
    if (!state.importFileList.length) {
      message.warning('请先选择需要导入的Excel文件');
      return;
    }

    try {
      dispatch({ type: 'SET_LOADING', key: 'importLoading', value: true });
      const uploadFile = state.importFileList[0];
      const file = uploadFile.originFileObj || uploadFile;
      const response = await importTableFromExcel(state.selectedTable, file);
      dispatch({ type: 'SET_STATUS', key: 'importResult', value: { success: true, data: response.data } });
      message.success('导入成功');
      dispatch({ type: 'SET_IMPORT_FILE_LIST', payload: [] });
    } catch (err) {
      console.error('导入失败:', err);
      dispatch({ type: 'SET_STATUS', key: 'importResult', value: { success: false, error: err.response?.data || { message: err.message } } });
      message.error(err.response?.data?.message || '导入失败，请检查文件内容');
    } finally {
      dispatch({ type: 'SET_LOADING', key: 'importLoading', value: false });
    }
  };

  const handleUploadBefore = (file) => {
    dispatch({ type: 'SET_IMPORT_FILE_LIST', payload: [file] });
    dispatch({ type: 'SET_STATUS', key: 'importResult', value: null });
    return false;
  };

  const handleUploadRemove = () => {
    dispatch({ type: 'SET_IMPORT_FILE_LIST', payload: [] });
  };

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>系统调试页面</Title>
      <Paragraph>此页面用于诊断和测试系统的各个组件</Paragraph>

      <Divider orientation="left">用户信息</Divider>
      <Card>
        {state.userInfo ? (
          <div>
            <Paragraph>
              <Text strong>用户名:</Text> {state.userInfo.username}
            </Paragraph>
            <Paragraph>
              <Text strong>角色:</Text> {state.userInfo.role}
            </Paragraph>
            <Paragraph>
              <Text strong>用户ID:</Text> {state.userInfo.id}
            </Paragraph>
            <Paragraph>
              <Text strong>Token有效性:</Text>{' '}
              <Text type={state.userInfo.tokenIsValid ? 'success' : 'danger'}>
                {state.userInfo.tokenIsValid ? '有效' : '无效或已过期'}
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
          loading={state.dbLoading}
        >
          测试数据库连接
        </Button>
        {state.dbStatus && (
          <Card
            title="数据库连接测试结果"
            extra={<Button type="text" size="small" onClick={clearDbStatus}>×</Button>}
          >
            <Title level={4} style={{ margin: 0 }}>测试结果: <Text type={state.dbStatus.status === 'success' ? 'success' : 'danger'}>{state.dbStatus.status === 'success' ? '成功' : '失败'}</Text></Title>
            <Collapse defaultActiveKey={['1']}>
              <Panel header="详细信息" key="1">
                <pre style={{ maxHeight: 400, overflow: 'auto' }}>
                  {JSON.stringify(state.dbStatus.status === 'success' ? state.dbStatus.data : state.dbStatus.error, null, 2)}
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
          loading={state.activitiesLoading}
        >
          测试最近活动API
        </Button>
        {state.activitiesStatus && (
          <Card
            title="最近活动API测试结果"
            extra={<Button type="text" size="small" onClick={clearActivitiesStatus}>×</Button>}
          >
            <Title level={4} style={{ margin: 0 }}>测试结果: <Text type={state.activitiesStatus.status === 'success' ? 'success' : 'danger'}>{state.activitiesStatus.status === 'success' ? '成功' : '失败'}</Text></Title>
            <Collapse defaultActiveKey={['1']}>
              <Panel header="详细信息" key="1">
                <pre style={{ maxHeight: 400, overflow: 'auto' }}>
                  {JSON.stringify(
                    state.activitiesStatus.status === 'success' ? state.activitiesStatus.data : state.activitiesStatus.error,
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
          value={state.apiUrl}
          onChange={(e) => dispatch({ type: 'SET_API_URL', payload: e.target.value })}
          style={{ width: '100%' }}
        />
        <Button type="primary" onClick={handleRawApiCall} loading={state.apiLoading}>
          发送请求
        </Button>
        {state.rawApiResponse && (
          <Card
            title="自定义API调用测试结果"
            extra={<Button type="text" size="small" onClick={clearRawApiResponse}>×</Button>}
          >
            <Title level={4} style={{ margin: 0 }}>请求结果: <Text type={state.rawApiResponse.status === 'success' ? 'success' : 'danger'}>{state.rawApiResponse.statusCode} {state.rawApiResponse.status === 'success' ? '成功' : '失败'}</Text></Title>
            {state.apiErrorDetails && (
              <Alert
                message="SQL错误详情"
                description={
                  <div>
                    <p><Text strong>错误消息:</Text> {state.apiErrorDetails.message}</p>
                    <p><Text strong>错误代码:</Text> {state.apiErrorDetails.code}</p>
                    <p><Text strong>SQL状态:</Text> {state.apiErrorDetails.sqlState}</p>
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
                    state.rawApiResponse.status === 'success' ? state.rawApiResponse.data : state.rawApiResponse.error,
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
              value={state.selectedTable}
              onChange={(value) => dispatch({ type: 'SET_SELECTED_TABLE', payload: value })}
              options={[{ label: '文物信息（artifacts）', value: 'artifacts' }]}
              style={{ minWidth: 200 }}
            />
          </Space>

          <Space wrap>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportExcel}
              loading={state.exportLoading}
            >
              导出当前数据
            </Button>

            <Upload
              beforeUpload={handleUploadBefore}
              onRemove={handleUploadRemove}
              fileList={state.importFileList}
              accept=".xlsx,.xls"
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>选择Excel文件</Button>
            </Upload>

            <Button
              type="primary"
              onClick={handleImportExcel}
              loading={state.importLoading}
              disabled={!state.importFileList.length}
            >
              导入Excel
            </Button>
          </Space>

          {state.importResult && (
            <Card
              size="small"
              title={state.importResult.success ? '导入成功' : '导入失败'}
              headStyle={{ color: state.importResult.success ? '#52c41a' : '#ff4d4f' }}
            >
              <pre style={{ maxHeight: 300, overflow: 'auto', margin: 0 }}>
                {JSON.stringify(state.importResult.success ? state.importResult.data : state.importResult.error, null, 2)}
              </pre>
            </Card>
          )}
        </Space>
      </Card>
    </div>
  );
};

export default Debug;
