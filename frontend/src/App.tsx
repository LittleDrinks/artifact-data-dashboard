import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Artifacts from './pages/Artifacts';
import ArtifactDetail from './pages/ArtifactDetail';
import Graph from './pages/Graph';
import Chat from './pages/Chat';

/** 路由守卫：未登录跳转登录页 */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/** 应用路由配置 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 登录页 — 无侧边栏 */}
        <Route path="/login" element={<Login />} />

        {/* 主布局路由 — 需要登录 */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="artifacts" element={<Artifacts />} />
          <Route path="artifacts/:id" element={<ArtifactDetail />} />
          <Route path="graph" element={<Graph />} />
          <Route path="chat" element={<Chat />} />
        </Route>

        {/* 未匹配路由重定向 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
