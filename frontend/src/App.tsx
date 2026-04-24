import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin, App as AntApp } from 'antd';
import MainLayout from './layouts/MainLayout';

/* ── Lazy-loaded pages ── */
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Artifacts = lazy(() => import('./pages/Artifacts'));
const ArtifactDetail = lazy(() => import('./pages/ArtifactDetail'));
const Graph = lazy(() => import('./pages/Graph'));
const Chat = lazy(() => import('./pages/Chat'));
const Knowledge = lazy(() => import('./pages/Knowledge'));
const KnowledgeDemo = lazy(() => import('./pages/KnowledgeDemo'));
const NotFound = lazy(() => import('./pages/NotFound'));

/** Loading fallback */
function PageLoader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 200,
      }}
    >
      <Spin size="large" />
    </div>
  );
}

/** 路由守卫：未登录跳转登录页 */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  // Token 存在但可能已过期 — API 层 401 拦截会自动跳转
  return <>{children}</>;
}

/** 应用路由配置 */
export default function App() {
  return (
    <AntApp>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
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
              <Route path="knowledge" element={<Knowledge />} />
              <Route path="knowledge-demo" element={<KnowledgeDemo />} />
            </Route>

            {/* 未匹配路由 — 404 页面 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AntApp>
  );
}
