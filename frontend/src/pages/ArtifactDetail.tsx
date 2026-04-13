import { Card, Empty } from 'antd';

/** 文物详情占位页面 */
export default function ArtifactDetail() {
  return (
    <div>
      <Card
        style={{
          borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-sm)',
          textAlign: 'center',
          padding: 40,
        }}
      >
        <Empty description="文物详情页面将在后续任务中实现" />
      </Card>
    </div>
  );
}
