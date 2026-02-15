import React, { useState, useMemo } from 'react';
import { Modal, Spin, Empty, Descriptions, Divider, Space, Switch, Radio, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';

const { Text } = Typography;

const EntityDetailModal = ({
  visible,
  onClose,
  selectedEntity,
  entityDetails,
  loading,
  isNodePinned,
  onTogglePin
}) => {
  const [relationshipStatMode, setRelationshipStatMode] = useState('entityType');

  const relationshipStat = useMemo(() => {
    const rels = entityDetails?.relationships || [];
    const counts = new Map();
    for (const rel of rels) {
      const key = relationshipStatMode === 'relationType'
        ? (rel?.type || '未知')
        : (rel?.entity?.type || '未知');
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const data = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    return {
      total: rels.length,
      data
    };
  }, [entityDetails, relationshipStatMode]);

  const entityId = selectedEntity?.id;
  const entityLabel = selectedEntity?.label;
  const pinned = entityId ? isNodePinned(entityId) : false;

  return (
    <Modal
      title={entityLabel ? `实体详情: ${entityLabel}` : '实体详情'}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin size="large" tip="加载详情中..." />
        </div>
      ) : (
        <>
          {entityDetails ? (
            <div>
              {entityId && (
                <div style={{ marginBottom: 12 }}>
                  <Space wrap>
                    <Text type="secondary">交互：</Text>
                    <Text type="secondary">Shift+单击可钉住/取消；Shift+拖拽松手可钉住</Text>
                    <Divider type="vertical" />
                    <Text>钉住该节点</Text>
                    <Switch
                      checked={pinned}
                      onChange={(checked) => onTogglePin(entityId, checked)}
                    />
                  </Space>
                </div>
              )}
              <Descriptions bordered column={2}>
                <Descriptions.Item label="ID">{entityDetails.entity.id}</Descriptions.Item>
                <Descriptions.Item label="类型">{entityDetails.entity.type}</Descriptions.Item>
                <Descriptions.Item label="名称">{entityDetails.entity.name}</Descriptions.Item>
                
                {entityDetails.entity.description && (
                  <Descriptions.Item label="描述" span={2}>
                    {entityDetails.entity.description}
                  </Descriptions.Item>
                )}
                
                {entityDetails.entity.era && (
                  <Descriptions.Item label="年代">
                    {entityDetails.entity.era}
                  </Descriptions.Item>
                )}
                
                {entityDetails.entity.location && (
                  <Descriptions.Item label="地点">
                    {entityDetails.entity.location}
                  </Descriptions.Item>
                )}
              </Descriptions>
              
              <h3 style={{ marginTop: 24, marginBottom: 16 }}>关联关系</h3>

              <div style={{ marginBottom: 12 }}>
                <Space wrap>
                  <Text type="secondary">共 {relationshipStat.total} 条关系</Text>
                  <Radio.Group
                    value={relationshipStatMode}
                    onChange={(e) => setRelationshipStatMode(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                    size="small"
                    options={[
                      { label: '按对端类型', value: 'entityType' },
                      { label: '按关系类型', value: 'relationType' }
                    ]}
                  />
                </Space>
              </div>

              {relationshipStat.data.length > 0 && (
                <ReactECharts
                  style={{ height: 260 }}
                  option={{
                    tooltip: { trigger: 'item' },
                    series: [
                      {
                        type: 'pie',
                        radius: ['35%', '70%'],
                        avoidLabelOverlap: true,
                        label: { show: true, formatter: '{b}: {c}' },
                        labelLine: { show: true },
                        data: relationshipStat.data
                      }
                    ]
                  }}
                />
              )}
              
              {entityDetails.relationships.length > 0 ? (
                <ul>
                  {entityDetails.relationships.map((rel) => (
                    <li key={`${rel.entity.id}-${rel.type}`}>
                      {rel.direction === 'outgoing' ? (
                        <span>→ {rel.type} → <strong>{rel.entity.name}</strong> ({rel.entity.type})</span>
                      ) : (
                        <span>← {rel.type} ← <strong>{rel.entity.name}</strong> ({rel.entity.type})</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>没有相关联的关系</p>
              )}
            </div>
          ) : (
            <Empty description="暂无详细信息" />
          )}
        </>
      )}
    </Modal>
  );
};

export default EntityDetailModal;
