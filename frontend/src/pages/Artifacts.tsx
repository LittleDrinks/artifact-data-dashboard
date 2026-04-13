import { Card, Empty } from 'antd';

/** 文物管理占位页面 */
export default function Artifacts() {
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
        <Empty description="文物管理页面将在后续任务中实现" />
      </Card>
    </div>
  );
}
