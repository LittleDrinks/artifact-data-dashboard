import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Radio,
  Switch,
  Checkbox,
  Tooltip,
  Space,
  Typography,
  Divider,
  Badge,
  Alert,
  Button,
  Spin,
  message
} from 'antd';
import {
  SettingOutlined,
  UpOutlined,
  DownOutlined,
  InfoCircleOutlined,
  LockOutlined,
  UnlockOutlined
} from '@ant-design/icons';
import chatConfigService from '../../services/chatConfig.service';

const { Text, Title } = Typography;
const { Group: RadioGroup } = Radio;
const { Group: CheckboxGroup } = Checkbox;

// 模型选项
const MODEL_OPTIONS = [
  { label: '云端 (DeepSeek)', value: 'ONLINE', color: 'blue' },
  { label: '本地 (Ollama 8B)', value: 'LOCAL', color: 'green' },
  { label: '模拟', value: 'MOCK', color: 'orange' }
];

// 问答模式选项
const ANSWER_MODE_OPTIONS = [
  {
    value: 'graph',
    label: '图谱模式',
    description: '只查询知识图谱，回答客观事实'
  },
  {
    value: 'knowledge',
    label: '知识模式',
    description: '查询图谱并归纳总结知识'
  },
  {
    value: 'general',
    label: '通用模式',
    description: 'AI 自由回答，不限制知识来源'
  }
];

// 健康状态颜色映射
const HEALTH_STATUS_MAP = {
  healthy: { color: 'success', text: '正常' },
  unhealthy: { color: 'error', text: '异常' },
  unknown: { color: 'default', text: '未知' }
};

/**
 * AI 配置面板组件
 * @param {Object} props
 * @param {boolean} props.visible - 是否展开
 * @param {() => void} props.onToggle - 展开/收起回调
 * @param {(config: Object) => void} props.onConfigChange - 配置变更回调
 * @param {string} [props.className] - 额外样式类名
 */
const AIConfigPanel = ({ visible, onToggle, onConfigChange, className }) => {
  // 配置状态
  const [config, setConfig] = useState({
    model: 'LOCAL',
    modelLocked: false,
    healthStatus: 'unknown',
    answerMode: 'knowledge',
    mcpTools: []
  });

  // 可用工具列表
  const [availableTools, setAvailableTools] = useState([]);

  // UI 状态
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);

  // 初始化加载配置
  useEffect(() => {
    loadConfig();
    loadAvailableTools();
  }, []);

  // 加载配置
  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await chatConfigService.getConfig();
      setConfig({
        model: data.model || 'LOCAL',
        modelLocked: data.modelLocked || false,
        healthStatus: data.healthStatus || 'unknown',
        answerMode: data.mode || data.answerMode || 'knowledge',
        mcpTools: data.enabledTools || data.mcpTools || []
      });
    } catch (err) {
      console.error('加载配置失败:', err);
      setError('加载配置失败，使用默认配置');
      // 使用默认配置
      setConfig({
        model: 'LOCAL',
        modelLocked: false,
        healthStatus: 'unknown',
        answerMode: 'knowledge',
        mcpTools: ['query_graph', 'search_artifacts']
      });
    } finally {
      setLoading(false);
    }
  };

  // 加载可用工具
  const loadAvailableTools = async () => {
    try {
      const response = await chatConfigService.getAvailableTools();
      // API 返回格式: { tools: [...] }
      const tools = response?.tools || response || [];
      setAvailableTools(Array.isArray(tools) ? tools : []);
    } catch (err) {
      console.error('加载工具列表失败:', err);
      setAvailableTools([]);
    }
  };

  // 保存配置
  const saveConfig = useCallback(async (newConfig) => {
    try {
      setSaving(true);
      setError(null);
      await chatConfigService.updateConfig(newConfig);
      setConfig(newConfig);
      if (onConfigChange) {
        onConfigChange(newConfig);
      }
    } catch (err) {
      console.error('保存配置失败:', err);
      message.error('保存配置失败: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  }, [onConfigChange]);

  // 处理模型变更
  const handleModelChange = (e) => {
    const newModel = e.target.value;
    const newConfig = { ...config, model: newModel };
    saveConfig(newConfig);
  };

  // 处理模型锁定变更
  const handleLockChange = (checked) => {
    const newConfig = { ...config, modelLocked: checked };
    saveConfig(newConfig);
  };

  // 处理问答模式变更
  const handleAnswerModeChange = (e) => {
    const newMode = e.target.value;
    const newConfig = { ...config, answerMode: newMode };
    saveConfig(newConfig);
  };

  // 处理工具变更
  const handleToolsChange = (checkedValues) => {
    // 检查是否禁用了 query_graph
    const hasQueryGraph = checkedValues.includes('query_graph');
    const newConfig = { ...config, mcpTools: checkedValues };

    // 如果禁用了 query_graph 且当前模式需要图谱，降级为通用模式
    if (!hasQueryGraph && (config.answerMode === 'graph' || config.answerMode === 'knowledge')) {
      newConfig.answerMode = 'general';
      setWarning('已禁用图谱查询工具，问答模式自动降级为通用模式');
    } else {
      setWarning(null);
    }

    saveConfig(newConfig);
  };

  // 获取健康状态显示
  const getHealthStatusDisplay = () => {
    const status = HEALTH_STATUS_MAP[config.healthStatus] || HEALTH_STATUS_MAP.unknown;
    return <Badge status={status.color} text={status.text} />;
  };

  // 构建工具选项
  const toolOptions = availableTools.map(tool => ({
    label: (
      <Tooltip title={tool.description} placement="right">
        <Space>
          <span>{tool.name}</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {tool.description}
          </Text>
        </Space>
      </Tooltip>
    ),
    value: tool.name
  }));

  // 面板头部
  const panelHeader = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer',
        padding: '8px 0'
      }}
      onClick={onToggle}
    >
      <Space>
        <SettingOutlined />
        <Title level={5} style={{ margin: 0 }}>AI 配置面板</Title>
        {saving && <Spin size="small" />}
      </Space>
      <Button type="text" icon={visible ? <UpOutlined /> : <DownOutlined />} size="small" />
    </div>
  );

  if (!visible) {
    return (
      <Card
        size="small"
        className={className}
        bodyStyle={{ padding: '8px 16px' }}
      >
        {panelHeader}
      </Card>
    );
  }

  return (
    <Card
      size="small"
      className={className}
      bodyStyle={{ padding: '16px' }}
    >
      {panelHeader}

      <Divider style={{ margin: '12px 0' }} />

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      {warning && (
        <Alert
          message={warning}
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          closable
          onClose={() => setWarning(null)}
        />
      )}

      <Spin spinning={loading}>
        {/* 模型选择 */}
        <div style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Text strong>模型选择</Text>
            <RadioGroup
              value={config.model}
              onChange={handleModelChange}
              optionType="button"
              buttonStyle="solid"
              disabled={saving}
            >
              {MODEL_OPTIONS.map(option => (
                <Radio.Button key={option.value} value={option.value}>
                  {option.label}
                </Radio.Button>
              ))}
            </RadioGroup>
            <Space>
              <Tooltip title={config.modelLocked ? '解锁后可自动切换模型' : '锁定后禁止自动切换模型'}>
                <Switch
                  checked={config.modelLocked}
                  onChange={handleLockChange}
                  disabled={saving}
                  checkedChildren={<LockOutlined />}
                  unCheckedChildren={<UnlockOutlined />}
                />
              </Tooltip>
              <Text type="secondary" style={{ fontSize: 12 }}>
                锁定模型
              </Text>
              <Divider type="vertical" />
              <Text style={{ fontSize: 12 }}>健康状态:</Text>
              {getHealthStatusDisplay()}
            </Space>
          </Space>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 问答模式 */}
        <div style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Text strong>问答模式</Text>
            <RadioGroup
              value={config.answerMode}
              onChange={handleAnswerModeChange}
              disabled={saving}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
            >
              {ANSWER_MODE_OPTIONS.map(option => (
                <Tooltip key={option.value} title={option.description}>
                  <Radio.Button value={option.value}>
                    {option.label}
                  </Radio.Button>
                </Tooltip>
              ))}
            </RadioGroup>
          </Space>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* MCP 工具 */}
        <div>
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Text strong>MCP 工具</Text>
            <CheckboxGroup
              value={config.mcpTools}
              onChange={handleToolsChange}
              disabled={saving}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {availableTools.map(tool => (
                <Checkbox key={tool.name} value={tool.name}>
                  <Tooltip title={tool.description} placement="right">
                    <Space>
                      <Text>{tool.name}</Text>
                      <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
                    </Space>
                  </Tooltip>
                </Checkbox>
              ))}
            </CheckboxGroup>
          </Space>
        </div>
      </Spin>
    </Card>
  );
};

export default AIConfigPanel;
