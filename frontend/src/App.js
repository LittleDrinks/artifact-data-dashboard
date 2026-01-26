import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Layout, Menu, Spin, message } from 'antd';
import {
  DashboardOutlined,
  SearchOutlined,
  CloudOutlined,
  ShareAltOutlined,
  MessageOutlined,
  PaperClipOutlined,
  UserOutlined,
  LoginOutlined,
  LogoutOutlined,
  BugOutlined,
  FolderOutlined
} from '@ant-design/icons';

// 导入页面组件
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Search from './pages/Search';
import Wordcloud from './pages/Wordcloud';
import KnowledgeGraph from './pages/KnowledgeGraph';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import Debug from './pages/Debug'; // 导入调试页面
import Attachments from './pages/Attachments';
import AssetLibrary from './pages/AssetLibrary'; // 导入资产库页面
import ModeManager from './components/Admin/ModeManager'; // 导入模式管理组件

// 导入服务和上下文
import { getCurrentUser, logout } from './services/auth.service';

const { Header, Sider, Content } = Layout;

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  // 在组件挂载时检查用户是否已登录  // 检查用户登录状态和导航
  useEffect(() => {
    const checkUserLoggedIn = async () => {
      try {
        const currentUser = getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          // 确保用户在登录后导航到首页
          if (location.pathname === '/login' || location.pathname === '/register') {
            navigate('/');
          }
        }
      } catch (error) {
        console.error('验证用户状态失败:', error);
      } finally {
        setLoading(false);
      }
    };
    
    checkUserLoggedIn();
  }, [navigate, location.pathname]);
  
  // 处理菜单项点击
  const isAdmin = user?.role === 'admin';

  const handleMenuClick = (e) => {
    switch (e.key) {
      case 'dashboard':
        navigate('/');
        break;
      case 'search':
        navigate('/search');
        break;
      case 'wordcloud':
        navigate('/wordcloud');
        break;
      case 'knowledge-graph':
        navigate('/knowledge-graph');
        break;
      case 'chat':
        navigate('/chat');
        break;
      case 'profile':
        navigate('/profile');
        break;
      case 'attachments':
        navigate('/attachments');
        break;
      case 'asset-library':
        navigate('/asset-library');
        break;
      case 'debug':
        if (isAdmin) {
          navigate('/debug');
        }
        break;
      case 'login':
        navigate('/login');
        break;
      case 'register':
        navigate('/register');
        break;
      case 'logout':
        handleLogout();
        break;
      default:
        break;
    }
  };
  
  // 处理登出
  const handleLogout = () => {
    logout();
    setUser(null);
    message.success('已成功登出');
    navigate('/login');
  };

  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: '数据大屏',
    },
    {
      key: 'search',
      icon: <SearchOutlined />,
      label: '关键词搜索',
    },
    {
      key: 'wordcloud',
      icon: <CloudOutlined />,
      label: '词云分析',
    },
    {
      key: 'knowledge-graph',
      icon: <ShareAltOutlined />,
      label: '知识图谱',
    },
    {
      key: 'chat',
      icon: <MessageOutlined />,
      label: '智能问答',
    },
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人信息',
    }
    ,
    {
      key: 'attachments',
      icon: <PaperClipOutlined />,
      label: '附件管理',
    },
    {
      key: 'asset-library',
      icon: <FolderOutlined />,
      label: '资产库',
    }
  ];

  if (isAdmin) {
    menuItems.push({
      key: 'debug',
      icon: <BugOutlined />,
      label: '系统调试',
    });
  }

  menuItems.push({
    key: 'logout',
    icon: <LogoutOutlined />,
    label: '退出登录',
  });
    // 获取当前激活的菜单项
  const getActiveMenuItem = () => {
    const path = location.pathname;
    
    // 处理根路径为 dashboard
    if (path === '/' || path === '') return 'dashboard';
      // 处理其他路径
    if (path === '/search') return 'search';
    if (path === '/wordcloud') return 'wordcloud';
    if (path === '/knowledge-graph') return 'knowledge-graph';
    if (path === '/chat') return 'chat';
    if (path === '/profile') return 'profile';
    if (path === '/attachments') return 'attachments';
    if (path === '/asset-library') return 'asset-library';
    if (path === '/debug') {
      return isAdmin ? 'debug' : 'dashboard';
    }
    
    // 默认返回 dashboard
    return 'dashboard';
  };
  
  // 加载中状态
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }
  
  // 用户未登录，仅显示登录/注册路由
  if (!user) {
    return (
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Login onLoginSuccess={setUser} />} />
      </Routes>
    );
  }
    // 用户已登录，显示完整应用
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        collapsible 
        collapsed={collapsed} 
        onCollapse={setCollapsed}
        style={{ 
          overflow: 'auto', 
          height: '100vh', 
          position: 'fixed', 
          left: 0,
          top: 0,
          bottom: 0 
        }}
      >
        <div className="logo">
          {!collapsed ? '文物数据系统' : '文物'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[getActiveMenuItem()]}
          onClick={handleMenuClick}
          items={menuItems}
        />
      </Sider>
      <Layout className="site-layout" style={{ marginLeft: collapsed ? 80 : 200 }}>
        <Header className="site-layout-background" style={{ padding: 0, background: '#fff', position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ marginLeft: 16 }}>
            <span style={{ fontSize: 18, fontWeight: 'bold' }}>文物大数据与人工智能集成系统</span>
          </div>
          <div className="header-right" style={{ marginRight: 16, color: '#333' }}>
            <UserOutlined style={{ marginRight: 8 }} />
            <span>{user.username}</span>
          </div>
        </Header>
        <Content style={{ margin: '16px' }}>          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/search" element={<Search />} />
            <Route path="/wordcloud" element={<Wordcloud />} />
            <Route path="/knowledge-graph" element={<KnowledgeGraph />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/attachments" element={<Attachments />} />
            <Route path="/asset-library" element={<AssetLibrary />} />
            <Route
              path="/debug"
              element={isAdmin ? <Debug /> : <Navigate to="/" replace />}
            />
            <Route
              path="/admin/mode"
              element={isAdmin ? <ModeManager /> : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
