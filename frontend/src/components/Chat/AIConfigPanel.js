import React, { useState, useEffect, useCallback } from 'react';
import {
  Radio,
  Checkbox,
  Tooltip,
  Space,
  Typography,
  Divider,
  Badge,
  Spin,
  message,
  Modal
} from 'antd';
import {
  InfoCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import chatConfigService from '../../services/chatConfig.service';

const { Text } = Typography;
const { Group: RadioGroup } = Radio;

// 模型选项
const MODEL_OPTIONS = [
  { label: '云端 (DeepSeek)', value: 'ONLINE', color: 'blue' },
  { label: '本地 (Ollama 8B)', value: 'LOCAL', color: 'green' },
  { label: '模拟', value: 'MOCK', color: 'orange' }
];

/**
 * AI 配置面板组件（弹窗内容）
 * @param {Object} props
 * @param {(config: Object) => void} props.onConfigChange - 配置变更回调
 * @param {string} [props.sessionId] - 会话ID
 * @param {() => void} [props.onClose] - 关闭回调
 */
const AIConfigPanel = ({ onConfigChange, sessionId, onClose }) => {
  // 配置状态
  const [config, setConfig] = useState({
    model: 'LOCAL',
    enabledTools: ['query_graph', 'search_artifacts']
  });

  // 可用工具列表
  const [availableTools, setAvailableTools] = useState([]);
  
  // 模型健康状态
  const [modelHealth, setModelHealth] = useState({
    ONLINE: 'unknown',
    LOCAL: 'unknown',
    MOCK: 'healthy'
  });

  // UI 状态
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 初始化加载配置
  useEffect(() => {
    loadConfig();
    loadAvailableTools();
    loadModelHealth();
  }, [sessionId]);

  // 加载配置
  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await chatConfigService.getConfig(sessionId);
      setConfig({
        model: data.model || 'LOCAL',
        enabledTools: data.enabledTools || []
      });
    } catch (err) {
      console.error('加载配置失败:', err);
      // 使用默认配置
      setConfig({
        model: 'LOCAL',
        enabledTools: ['query_graph', 'search_artifacts']
      });
    } finally {
      setLoading(false);
    }
  };

  // 加载可用工具
  const loadAvailableTools = async () => {
    try {
      const response = await chatConfigService.getAvailableTools();
      const tools = response?.tools || response || [];
      setAvailableTools(Array.isArray(tools) ? tools : []);
    } catch (err) {
      console.error('加载工具列表失败:', err);
      setAvailableTools([]);
    }
  };

  // 加载模型健康状态
  const loadModelHealth = async () => {
    try {
      const health = await chatConfigService.getModelHealth();
      if (health) {
        setModelHealth(prev => ({ ...prev, ...health }));
      }
    } catch (err) {
      console.error('加载模型健康状态失败:', err);
    }
  };

  // 保存配置
  const saveConfig = useCallback(async (newConfig) => {
    try {
      setSaving(true);
      await chatConfigService.updateConfig({ ...newConfig, sessionId });
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
  }, [sessionId, onConfigChange]);

  // 处理模型变更
  const handleModelChange = (e) => {
    const newModel = e.target.value;
    const currentHealth = modelHealth[newModel];
    
    // 如果模型不健康，询问是否切换
    if (currentHealth === 'unhealthy' || currentHealth === 'unknown') {
      // 找到健康的模型
      const healthyModel = MODEL_OPTIONS.find(opt => 
        opt.value !== newModel && modelHealth[opt.value] === 'healthy'
      );
      
      Modal.confirm({
        title: '模型可能不可用',
        icon: <ExclamationCircleOutlined />,
        content: (
          <div>
            <p>您选择的模型 <strong>{MODEL_OPTIONS.find(o => o.value === newModel)?.label}</strong> 当前状态异常或未响应。</p>
            {healthyModel && (
              <p>是否临时切换到 <strong>{healthyModel.label}</strong>？</p>
            )}
            <p style={{ color: '#999', fontSize: 12 }}>您也可以坚持使用当前选择，但可能会遇到响应失败。</p>
          </div>
        ),
        okText: healthyModel ? `切换到${healthyModel.label}` : '坚持使用',
        cancelText: '取消',
        onOk: () => {
          if (healthyModel) {
            // 切换到健康模型
            const finalConfig = { ...config, model: healthyModel.value };
            saveConfig(finalConfig);
            message.info(`已自动切换到 ${healthyModel.label}`);
          } else {
            // 用户坚持选择
            const finalConfig = { ...config, model: newModel };
            saveConfig(finalConfig);
          }
        }
      });
    } else {
      // 模型健康，直接切换
      const newConfig = { ...config, model: newModel };
      saveConfig(newConfig);
    }
  };

  // 处理工具变更
  const handleToolsChange = (checkedValues) => {
    const newConfig = { ...config, enabledTools: checkedValues };
    saveConfig(newConfig);
  };

  // 获取模型状态显示
  const getModelStatusDisplay = (modelValue) => {
    const health = modelHealth[modelValue];
    if (health === 'healthy') {
      return <Badge status="success" />;
    } else if (health === 'unhealthy') {
      return <Badge status="error" />;
    }
    return <Badge status="default" />;
  };

  return (
    <div style={{ width: 280 }}>
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
                  <Space>
                    {option.label}
                    {getModelStatusDisplay(option.value)}
                  </Space>
                </Radio.Button>
              ))}
            </RadioGroup>
            <Text type="secondary" style={{ fontSize: 12 }}>
              绿点表示模型可用，红点表示异常，灰点表示未检测
            </Text>
          </Space>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* MCP 工具 */}
        <div>
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Text strong>MCP 工具</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              勾选的工具会被提供给 AI 使用，取消勾选后 AI 将无法看到该工具
            </Text>
            <Checkbox.Group
              value={config.enabledTools}
              onChange={handleToolsChange}
              disabled={saving}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
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
            </Checkbox.Group>
          </Space>
        </div>
      </Spin>
    </div>
  );
};

export default AIConfigPanel;
