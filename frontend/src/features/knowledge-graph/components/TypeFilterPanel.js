import React from 'react';
import { Card, Space, InputNumber, Button, Divider, Typography } from 'antd';

const { Text } = Typography;

const TypeFilterPanel = ({
  availableTypes,
  typeLimitsDraft,
  onUpdateTypeLimit,
  overviewText,
  pinnedCount,
  displayedTypeCounts
}) => {
  return (
    <Card size="small" title="类型限量与概览">
      <Text type="secondary">
        当前展示：节点 {overviewText.nodeCount}，边 {overviewText.edgeCount}
      </Text>

      <br />
      <Text type="secondary">
        已钉住节点：{pinnedCount}（Shift+单击可钉住/取消；Shift+拖拽松手可钉住）
      </Text>

      <Divider style={{ margin: '12px 0' }} />
      <Text strong>按类型节点上限</Text>
      <Divider style={{ margin: '8px 0' }} />

      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        {availableTypes.length === 0 ? (
          <Text type="secondary">暂无数据</Text>
        ) : (
          availableTypes.map((t) => (
            <Space key={t} style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>{t}</Text>
              <Space>
                <InputNumber
                  value={typeLimitsDraft[t] === undefined ? null : typeLimitsDraft[t]}
                  min={0}
                  step={1}
                  placeholder="不限"
                  onChange={(v) => onUpdateTypeLimit(t, v)}
                  style={{ width: 110 }}
                />
                <Button size="small" onClick={() => onUpdateTypeLimit(t, null)}>不限</Button>
              </Space>
            </Space>
          ))
        )}
      </Space>

      {displayedTypeCounts.length > 0 && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <Text strong>类型分布（Top）</Text>
          <Divider style={{ margin: '8px 0' }} />
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            {displayedTypeCounts.slice(0, 10).map(item => (
              <Text key={item.type} type="secondary">
                {item.type}: {item.count}
              </Text>
            ))}
          </Space>
        </>
      )}
    </Card>
  );
};

export default TypeFilterPanel;
