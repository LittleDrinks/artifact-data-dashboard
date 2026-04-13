import { Card, Row, Col, Statistic } from 'antd';
import {
  AppstoreOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { getOverview } from '../api/stats';
import type { OverviewStats } from '../api/stats';

/** Dashboard 占位页面 */
export default function Dashboard() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOverview()
      .then(setStats)
      .catch(() => {
        // 后端未就绪时使用占位数据
        setStats({
          total_artifacts: 629,
          total_categories: 0,
          total_eras: 0,
          total_locations: 0,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    {
      title: '文物总数',
      value: stats?.total_artifacts ?? 0,
      icon: <AppstoreOutlined />,
    },
    {
      title: '类别数',
      value: stats?.total_categories ?? 0,
      icon: <TagOutlined />,
    },
    {
      title: '年代数',
      value: stats?.total_eras ?? 0,
      icon: <CalendarOutlined />,
    },
    {
      title: '地区数',
      value: stats?.total_locations ?? 0,
      icon: <EnvironmentOutlined />,
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {statCards.map((item) => (
          <Col span={6} key={item.title}>
            <Card
              loading={loading}
              style={{
                borderRadius: 'var(--r-card)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Statistic
                title={
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {item.title}
                  </span>
                }
                value={item.value}
                prefix={item.icon}
                valueStyle={{
                  fontSize: 28,
                  fontWeight: 300,
                  color: 'var(--text-heading)',
                  fontFamily: 'var(--mono)',
                }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        style={{
          borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-sm)',
          textAlign: 'center',
          padding: 40,
        }}
      >
        <p style={{ color: 'var(--text-body)', fontSize: 16 }}>
          柱状图、饼图、词云等内容将在后续任务中实现
        </p>
      </Card>
    </div>
  );
}
