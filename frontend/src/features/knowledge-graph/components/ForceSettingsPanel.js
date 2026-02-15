import React from 'react';
import { Card, Space, InputNumber, Switch, Button, Divider, Typography } from 'antd';
const { Text } = Typography;

const ForceSettingsPanel = ({
  forceSettingsDraft, setForceSettingsDraft, displaySettingsDraft, setDisplaySettingsDraft,
  onApply, onReset, onZoomIn, onZoomOut, onResetZoom, onFitView
}) => (
  <Card size="small" title="图谱控制" style={{ marginBottom: 16 }}>
    <Text strong>力导向参数</Text><Divider style={{ margin: '8px 0' }} />
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}><span>斥力</span>
        <InputNumber value={forceSettingsDraft.chargeStrength} min={-5000} max={0} step={50}
          onChange={(v) => setForceSettingsDraft(s => ({ ...s, chargeStrength: Number(v) }))} /></Space>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}><span>连线长度</span>
        <InputNumber value={forceSettingsDraft.linkDistance} min={20} max={400} step={10}
          onChange={(v) => setForceSettingsDraft(s => ({ ...s, linkDistance: Number(v) }))} /></Space>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}><span>碰撞半径</span>
        <InputNumber value={forceSettingsDraft.collisionRadius} min={0} max={120} step={5}
          onChange={(v) => setForceSettingsDraft(s => ({ ...s, collisionRadius: Number(v) }))} /></Space>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}><span>收敛速度</span>
        <InputNumber value={forceSettingsDraft.alphaDecay} min={0.005} max={0.2} step={0.005}
          onChange={(v) => setForceSettingsDraft(s => ({ ...s, alphaDecay: Number(v) }))} /></Space>
    </Space>
    <Divider style={{ margin: '12px 0' }} /><Text strong>显示与性能</Text><Divider style={{ margin: '8px 0' }} />
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}><span>节点标签</span>
        <Switch checked={displaySettingsDraft.showNodeLabels}
          onChange={(checked) => setDisplaySettingsDraft(s => ({ ...s, showNodeLabels: checked }))} /></Space>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}><span>边标签</span>
        <Switch checked={displaySettingsDraft.showLinkLabels}
          onChange={(checked) => setDisplaySettingsDraft(s => ({ ...s, showLinkLabels: checked }))} /></Space>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}><span>RAF 节流</span>
        <Switch checked={displaySettingsDraft.rafThrottle}
          onChange={(checked) => setDisplaySettingsDraft(s => ({ ...s, rafThrottle: checked }))} /></Space>
    </Space>
    <Divider style={{ margin: '12px 0' }} />
    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
      <Button type="primary" onClick={onApply} style={{ flex: 1 }}>应用设置</Button>
      <Button onClick={onReset} style={{ flex: 1 }}>恢复默认</Button>
    </Space>
    <Divider style={{ margin: '12px 0' }} /><Text strong>视图</Text><Divider style={{ margin: '8px 0' }} />
    <Space wrap style={{ width: '100%' }}>
      <Button size="small" onClick={onZoomIn}>放大</Button>
      <Button size="small" onClick={onZoomOut}>缩小</Button>
      <Button size="small" onClick={onResetZoom}>重置</Button>
      <Button size="small" onClick={onFitView}>适配</Button>
    </Space>
  </Card>
);

export default ForceSettingsPanel;
