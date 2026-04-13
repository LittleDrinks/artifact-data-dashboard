import { Card, Empty } from 'antd';

/** AI 问答占位页面 */
export default function Chat() {
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
        <Empty description="AI 问答页面将在后续任务中实现" />
      </Card>
    </div>
  );
}
