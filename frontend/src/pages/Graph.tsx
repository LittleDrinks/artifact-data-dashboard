import { Card, Empty } from 'antd';

/** 知识图谱占位页面 */
export default function Graph() {
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
        <Empty description="知识图谱页面将在后续任务中实现" />
      </Card>
    </div>
  );
}
