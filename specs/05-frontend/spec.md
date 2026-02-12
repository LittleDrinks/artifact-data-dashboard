# 前端架构规范

## 技术栈

- **框架**：React 18
- **构建工具**：Create React App 5.0.1（*待升级*）
- **UI 组件库**：Ant Design 5.x
- **状态管理**：React Context + useReducer
- **路由**：React Router 6
- **可视化**：D3.js 7.x（知识图谱）、ECharts 5.x（统计图表）
- **HTTP 客户端**：Axios
- **Markdown 渲染**：react-markdown

---

## 目录结构规范

```
frontend/src/
├── App.js                    # 根组件，路由配置
├── index.js                  # 入口
├── context/
│   └── AuthContext.js        # 认证状态
├── components/               # 可复用组件
│   ├── Admin/               # 系统管理
│   │   ├── UserManager.js   # 用户管理
│   │   └── SystemSettings.js # 系统设置
│   ├── AssetLibrary/        # 资产库（核心）
│   │   ├── AssetList.js     # 文物列表
│   │   ├── AssetDetail.js   # 文物详情
│   │   ├── AssetForm.js     # 新增/编辑表单
│   │   ├── AssetPicker.js   # 文物选择器（弹窗）
│   │   ├── FolderTree.js    # 文件夹树
│   │   ├── FolderManager.js # 文件夹管理
│   │   ├── UploadModal.js   # 上传弹窗
│   │   ├── ImportModal.js   # Excel 导入
│   │   ├── ExportModal.js   # Excel 导出
│   │   └── TagManager.js    # 标签管理
│   ├── Chat/                # AI 问答
│   │   ├── ChatWindow.js    # 聊天窗口
│   │   ├── ChatInput.js     # 输入框
│   │   ├── MessageList.js   # 消息列表
│   │   ├── MessageItem.js   # 单条消息
│   │   ├── ModeIndicator.js # AI 模式指示
│   │   └── ToolResultCard.js # 工具调用结果展示
│   ├── Graph/               # 知识图谱
│   │   ├── ForceGraph.js    # D3.js 力导向图
│   │   ├── GraphControls.js # 图谱控制面板
│   │   ├── NodeDetail.js    # 节点详情弹窗
│   │   └── RelationEditor.js # 关系编辑
│   ├── Common/              # 通用组件
│   │   ├── Header.js        # 顶部导航
│   │   ├── Sidebar.js       # 侧边栏
│   │   ├── ImageViewer.js   # 图片预览
│   │   └── FileUploader.js  # 文件上传
│   └── Statistics/          # 统计分析
│       ├── WordCloud.js     # 词云
│       └── ChartPanel.js    # 图表面板
├── pages/                   # 页面级组件
│   ├── LoginPage.js         # 登录
│   ├── DashboardPage.js     # 首页仪表盘
│   ├── AssetLibraryPage.js  # 资产库主页面
│   ├── GraphPage.js         # 知识图谱分析
│   ├── ChatPage.js          # 智能问答
│   ├── StatisticsPage.js    # 统计分析
│   └── AdminPage.js         # 系统管理
├── services/                # API 封装
│   ├── api.js               # Axios 实例
│   ├── auth.service.js      # 认证相关
│   ├── artifact.service.js  # 文物管理
│   ├── attachment.service.js # 附件管理
│   ├── folder.service.js    # 文件夹
│   ├── graph.service.js     # 知识图谱
│   ├── chat.service.js      # AI 问答
│   └── mcp.service.js       # MCP 服务
├── utils/                   # 工具函数
│   ├── request.js           # 请求拦截
│   ├── format.js            # 格式化（日期、文件大小）
│   └── validators.js        # 表单验证
└── styles/                  # 样式（较少使用，主要用 Ant Design）
    └── custom.css
```

---

## 路由设计

```javascript
// App.js 路由配置
<Routes>
  <Route path="/login" element={<LoginPage />} />
  
  {/* 需要认证的路由 */}
  <Route element={<PrivateLayout />}>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/assets" element={<AssetLibraryPage />} />
    <Route path="/assets/:id" element={<AssetDetailPage />} />
    <Route path="/graph" element={<GraphPage />} />
    <Route path="/chat" element={<ChatPage />} />
    <Route path="/statistics" element={<StatisticsPage />} />
    <Route path="/admin" element={<AdminPage />} />
  </Route>
</Routes>
```

---

## 核心组件规格

### AssetLibraryPage（资产库主页面）

**布局**：
```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar (文件夹树)   │  主内容区                            │
│                     │  ┌─────────────────────────────┐    │
│  - 全部文物         │  │  工具栏 (新建/导入/导出)    │    │
│  - 文件夹 A         │  ├─────────────────────────────┤    │
│    - 子文件夹       │  │  筛选栏 (年代/分类/关键词)  │    │
│  - 文件夹 B         │  ├─────────────────────────────┤    │
│                     │  │                             │    │
│                     │  │  文物列表 (卡片/表格视图)   │    │
│                     │  │                             │    │
│                     │  └─────────────────────────────┘    │
└─────────────────────┴─────────────────────────────────────┘
```

**状态管理**：
- `selectedFolderId`: 当前选中文件夹
- `viewMode`: 'grid' | 'list'
- `filters`: 筛选条件
- `pagination`: 分页信息

---

### ChatWindow（AI 问答窗口）

**功能**：
- 文本输入（支持 Enter 发送，Shift+Enter 换行）
- 消息历史（本地存储）
- 流式响应展示（打字机效果）
- 工具调用结果渲染（表格、图谱子集）

**消息类型**：
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'tool_call' | 'thinking';
  toolResults?: ToolResult[];
  timestamp: number;
}
```

**SSE 处理**：
```javascript
// chat.service.js
const sendMessage = (message, onChunk) => {
  const eventSource = new EventSource(`/api/chat?message=${encodeURIComponent(message)}`);
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onChunk(data);
  };
  
  eventSource.addEventListener('done', () => {
    eventSource.close();
  });
};
```

---

### ForceGraph（知识图谱可视化）

**技术**：D3.js 力导向图模拟

**配置参数**：
```javascript
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id(d => d.id).distance(100))
  .force('charge', d3.forceManyBody().strength(-300))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide().radius(30));
```

**交互**：
- 拖拽节点
- 滚轮缩放
- 点击选中（显示详情面板）
- 双击展开（查询该节点的关联）

---

## 状态管理设计

### 为什么不用 Redux？

项目规模中等，Redux 样板代码太多。用 Context + useReducer 足够：

```javascript
// context/AuthContext.js
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  
  const login = async (credentials) => {
    const { token, user } = await authService.login(credentials);
    localStorage.setItem('token', token);
    dispatch({ type: 'LOGIN', payload: user });
  };
  
  return (
    <AuthContext.Provider value={{ ...state, login }}>
      {children}
    </AuthContext.Provider>
  );
};
```

### 全局状态

| Context | 数据 | 说明 |
|---------|------|------|
| AuthContext | user, isAuthenticated | 当前登录用户 |
| ThemeContext | theme | 主题（light/dark） |
| ChatContext | messages, sessionId | 当前对话 |

### 本地状态

- 列表页：useState 管理 filters、pagination
- 表单：Ant Design Form 管理
- 弹窗：visible 由父组件控制

---

## API 请求封装规范

### Axios 实例配置

```javascript
// services/api.js
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器：添加 Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：统一错误处理
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error.response?.data?.message || '请求失败');
  }
);
```

---

## 代码规范

### 文件命名

- 组件：PascalCase（`AssetList.js`）
- 工具函数：camelCase（`formatDate.js`）
- 样式：组件同名（`AssetList.css`）

### 代码风格

- 使用函数组件 + Hooks
- Props 解构（`const { title, onClick } = props;`）
- 异步用 async/await
- 错误处理用 try/catch

### 导入顺序

```javascript
// 1. React 内置
import React, { useState, useEffect } from 'react';

// 2. 第三方库
import { Button, Table } from 'antd';
import axios from 'axios';

// 3. 本地组件
import AssetCard from './AssetCard';

// 4. 工具函数
import { formatDate } from '../utils/format';

// 5. 样式
import './AssetList.css';
```
