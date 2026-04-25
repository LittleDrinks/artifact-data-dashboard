import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Spin } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  ApartmentOutlined,
  MessageOutlined,
  LogoutOutlined,
  UserOutlined,
  ExperimentOutlined,
  MenuOutlined,
  LeftOutlined,
  RightOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';

const { Sider, Header, Content } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/artifacts', icon: <AppstoreOutlined />, label: '文物管理' },
  { key: '/graph', icon: <ApartmentOutlined />, label: '知识图谱' },
  { key: '/chat', icon: <MessageOutlined />, label: 'AI 问答' },
  { key: '/knowledge', icon: <ExperimentOutlined />, label: '知识抽取' },
  { key: '/knowledge-demo', icon: <ExperimentOutlined />, label: 'LightRAG Demo' },
];

const MOBILE_BREAKPOINT = 768;

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(true);
        setMobileOpen(false);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Listen for auth:logout event from API client (401 handler)
  useEffect(() => {
    const handleAuthLogout = () => {
      logout();
      navigate('/login', { replace: true });
    };
    window.addEventListener('auth:logout', handleAuthLogout);
    return () => window.removeEventListener('auth:logout', handleAuthLogout);
  }, [logout, navigate]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const selectedKey = menuItems.find((item) => {
    if (item.key === '/') return location.pathname === '/';
    return location.pathname.startsWith(item.key);
  })?.key ?? '/';

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  // Mobile: overlay drawer
  if (isMobile) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            onClick={() => setMobileOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 99,
            }}
          />
        )}

        {/* Mobile sidebar */}
        <div
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            width: 240,
            background: 'var(--bg-panel)',
            borderRight: '1px solid var(--border)',
            zIndex: 100,
            transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header with close button */}
          <div style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>
                文
              </div>
              <span style={{ fontSize: 15, color: 'var(--text-heading)' }}>文物大数据平台</span>
            </div>
            <div
              onClick={() => setMobileOpen(false)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-canvas)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <CloseOutlined style={{ fontSize: 16 }} />
            </div>
          </div>

          {/* Scrollable menu area */}
          <div style={{ flex: 1, overflowY: 'auto', paddingTop: 4 }}>
            <Menu
              mode="inline"
              selectedKeys={[selectedKey]}
              onClick={handleMenuClick}
              items={menuItems}
              style={{ border: 'none', background: 'transparent', padding: '8px' }}
            />
          </div>

          {/* Fixed bottom user section */}
          <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff' }}>
                <UserOutlined />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-heading)' }}>{user?.username ?? '用户'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user?.role === 'admin' ? '管理员' : '普通用户'}</div>
              </div>
              <LogoutOutlined onClick={logout} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} />
            </div>
          </div>
        </div>

        {/* Mobile main area */}
        <Layout>
          <Header style={{ height: 56, background: 'var(--bg-canvas)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', position: 'sticky', top: 0, zIndex: 50 }}>
            <MenuOutlined
              onClick={() => setMobileOpen(!mobileOpen)}
              style={{ fontSize: 18, cursor: 'pointer', color: 'var(--text-heading)' }}
            />
            <h1 style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-heading)', margin: 0 }}>
              {menuItems.find((i) => i.key === selectedKey)?.label ?? '文物大数据平台'}
            </h1>
          </Header>
          <Content style={{ padding: 12, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    );
  }

  // Desktop layout
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
        <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--border)', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>
            文
          </div>
          {!collapsed && (
            <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-heading)', letterSpacing: '-0.165px' }}>
              文物大数据平台
            </span>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={handleMenuClick}
          items={menuItems}
          style={{ border: 'none', background: 'transparent', padding: '8px', marginTop: 4 }}
        />

        {/* Collapse/expand toggle at bottom of sider */}
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'flex-end',
            padding: collapsed ? '4px 0' : '4px 12px',
          }}
        >
          <div
            onClick={() => setCollapsed(!collapsed)}
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#94a3b8',
              transition: 'all 0.15s',
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = '#f0f4f8';
              (e.currentTarget as HTMLElement).style.color = '#061b31';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = '#94a3b8';
            }}
          >
            {collapsed ? <RightOutlined style={{ fontSize: 12 }} /> : <LeftOutlined style={{ fontSize: 12 }} />}
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff' }}>
              <UserOutlined />
            </div>
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-heading)' }}>{user?.username ?? '用户'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user?.role === 'admin' ? '管理员' : '普通用户'}</div>
              </div>
            )}
            {!collapsed && (
              <LogoutOutlined onClick={logout} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} />
            )}
          </div>
        </div>
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 240, transition: 'margin-left 0.2s' }}>
        <Header style={{ height: 56, background: 'var(--bg-canvas)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--content-pad)', position: 'sticky', top: 0, zIndex: 50 }}>
          <h1 style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-heading)', letterSpacing: '-0.165px', margin: 0 }}>
            {menuItems.find((i) => i.key === selectedKey)?.label ?? '文物大数据平台'}
          </h1>
        </Header>
        <Content style={{ padding: 'var(--content-pad)', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
