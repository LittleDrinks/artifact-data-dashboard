import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  ApartmentOutlined,
  MessageOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';

const { Sider, Header, Content } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/artifacts', icon: <AppstoreOutlined />, label: '文物管理' },
  { key: '/graph', icon: <ApartmentOutlined />, label: '知识图谱' },
  { key: '/chat', icon: <MessageOutlined />, label: 'AI 问答' },
];

/** 主布局：侧边栏 + 顶栏 */
export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // 匹配当前路由到菜单项
  const selectedKey = menuItems.find((item) => {
    if (item.key === '/') return location.pathname === '/';
    return location.pathname.startsWith(item.key);
  })?.key ?? '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={240}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border)',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          overflow: 'auto',
        }}
        trigger={null}
      >
        {/* Logo */}
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            borderBottom: '1px solid var(--border)',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              background: 'var(--purple)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 14,
              fontWeight: 400,
            }}
          >
            文
          </div>
          {!collapsed && (
            <span
              style={{
                fontSize: 15,
                fontWeight: 400,
                color: 'var(--text-heading)',
                letterSpacing: '-0.165px',
              }}
            >
              文物大数据平台
            </span>
          )}
        </div>

        {/* 导航菜单 */}
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => navigate(key)}
          items={menuItems}
          style={{
            border: 'none',
            background: 'transparent',
            padding: '8px',
            marginTop: 4,
          }}
        />

        {/* 底部用户区域 */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 8,
            borderTop: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 12px',
              borderRadius: 4,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--purple)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 400,
                color: '#fff',
              }}
            >
              <UserOutlined />
            </div>
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-heading)' }}>
                  {user?.username ?? '用户'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {user?.role === 'admin' ? '管理员' : '普通用户'}
                </div>
              </div>
            )}
            {!collapsed && (
              <LogoutOutlined
                onClick={logout}
                style={{ color: 'var(--text-muted)', cursor: 'pointer' }}
              />
            )}
          </div>
        </div>
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 240, transition: 'margin-left 0.2s' }}>
        {/* 顶部栏 */}
        <Header
          style={{
            height: 56,
            background: 'var(--bg-canvas)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 var(--content-pad)',
            position: 'sticky',
            top: 0,
            zIndex: 50,
          }}
        >
          <h1
            style={{
              fontSize: 16,
              fontWeight: 400,
              color: 'var(--text-heading)',
              letterSpacing: '-0.165px',
              margin: 0,
            }}
          >
            {menuItems.find((i) => i.key === selectedKey)?.label ?? '文物大数据平台'}
          </h1>
        </Header>

        {/* 内容区 */}
        <Content style={{ padding: 'var(--content-pad)', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
