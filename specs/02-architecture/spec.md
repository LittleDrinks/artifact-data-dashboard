# 系统架构规格说明

> **版本**: v2.0 - 工作台架构
> **更新日期**: 2026-02-15
> **核心变更**: 从多页面架构迁移到工作台为中心的统一架构，状态管理升级为 Zustand

---

## 一、架构目标

### 1.1 核心目标

- **高内聚低耦合**: 各服务职责单一，通过标准接口通信
- **可水平扩展**: 无状态设计，支持多实例部署
- **故障隔离**: 单点故障不影响整体服务
- **开发友好**: 一键启动，本地可完整复现生产环境
- **工作台内数据流畅通**: 左侧面板（探索）到右侧面板（AI助手）的无缝数据流转

### 1.2 工作台架构核心价值

**功能集成**: 单一界面完成"搜索→探索→修复→问答"完整工作流
**实时联动**: 选中搜索结果 → 图谱高亮 → AI自动关联问答
**全局状态共享**: 跨面板状态同步，无需重复操作

---

## 二、分层架构

### 2.1 客户端层

**技术栈**:

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI 框架 |
| Ant Design | 5.x | 组件库 |
| Zustand | 4.x | **全局状态管理（替代 React Context）** |
| D3.js | 7.x | 知识图谱可视化 |
| ECharts | 5.x | 统计图表 |

**设计约束**:
- 前端**禁止直接连接** Neo4j，所有数据走后端 API
- AI 问答使用 **SSE (Server-Sent Events)** 实现流式响应
- **状态管理使用 Zustand**（取代 React Context，支持跨面板通信和持久化）
- **URL 状态同步**: 工作台状态通过 URL 参数持久化，支持刷新恢复和链接分享

### 2.2 网关层（Nginx）

**职责**:
- 静态资源服务（前端 build 产物）
- API 反向代理 → backend:3000
- SSL/TLS 终端（生产环境）

### 2.3 应用层（Node.js + Express）

**目录规范**:

```
backend/src/
├── routes/        # API 端点定义
├── middleware/    # 认证、日志、验证
├── services/      # 业务逻辑
├── models/        # 数据库操作
└── utils/         # 工具函数
```

**请求处理流程**:

```
HTTP Request
    ↓
auth.middleware.js (JWT 验证)
    ↓
validation.middleware.js (参数校验)
    ↓
xxx.routes.js (路由分发)
    ↓
xxx.service.js (业务逻辑)
    ↓
models/ (数据库操作)
    ↓
MySQL / Neo4j / Redis
```

**约束**:
- 所有 API 响应统一格式: `{ code, message, data }`
- 错误统一由 error.middleware.js 处理
- 数据库连接通过 `backend/src/config/database.js` 单一入口

### 2.4 数据层

#### MySQL 8 —— 关系型数据

**存储内容**:
- 用户账号、权限
- 文物/文献基础元数据
- 文件夹、标签结构
- 附件元数据

**选型理由**:
- 事务性强（用户注册、权限变更）
- 团队熟悉，运维简单
- 复杂条件查询 SQL 写起来快

#### Neo4j 4.4 —— 知识图谱

**存储内容**:
- 实体: Artifact、Person、Location、Event、Dynasty
- 关系: CREATED_BY、COLLECTED_BY、STORED_AT、BELONGS_TO 等

**选型理由**:
- 成熟的管理界面（Neo4j Browser）
- Cypher 查询直观易学
- 社区版功能足够

#### Redis 7.2 —— 缓存与状态

**用途**:
- 会话缓存（TTL 24h）
- AI 运行状态（模式、健康检查结果）
- API 限流计数
- 未来: 任务队列

---

## 三、工作台数据流（新增）

### 3.1 工作台布局架构

```
┌─────────────────────────────────────────────────────────────┐
│                    统一工作台 (Workbench)                      │
├───────────────────────────┬─────────────────────────────────┤
│                           │                                 │
│    左侧：探索与发现          │    右侧：智能助手                │
│                           │                                 │
│  ┌─────────────────────┐  │  ┌───────────────────────────┐  │
│  │   文物搜索           │  │  │    AI 智能问答            │  │
│  │   - 关键词检索       │  │  │    - 自然语言查询         │  │
│  │   - 图片浏览         │  │  │    - 知识图谱问答         │  │
│  │   - 筛选过滤         │  │  │    - 多轮对话             │  │
│  └─────────────────────┘  │  └───────────────────────────┘  │
│                           │                                 │
│  ┌─────────────────────┐  │  ┌───────────────────────────┐  │
│  │   知识图谱可视化      │  │  │    AI 图像修复            │  │
│  │   - 力导向图         │  │  │    - 破损图像上传         │  │
│  │   - 实体关联         │  │  │    - 修复预览             │  │
│  │   - 路径分析         │  │  │    - 前后对比             │  │
│  └─────────────────────┘  │  └───────────────────────────┘  │
│                           │                                 │
└───────────────────────────┴─────────────────────────────────┘
```

### 3.2 核心数据流

```
用户操作（左面板搜索/选中）
    ↓
SelectionStore（全局选中状态）
    ↓
├─→ AIContextStore（自动更新AI上下文）
├─→ URL同步（状态持久化）
└─→ 右面板响应（上下文感知）
```

### 3.3 跨面板通信机制

#### 3.3.1 通信场景

| 场景 | 触发 | 响应 |
|------|------|------|
| 左选右应 | 左侧选中文物 | 右侧 AI 自动感知上下文 |
| 图问联动 | Chat 返回图谱数据 | 左侧图谱自动高亮节点 |
| 图问切换 | 点击"查看图谱" | 左侧切换到图谱模式并聚焦 |
| 图修联动 | 左侧拖拽图片 | 右侧修复面板接收图片 |

#### 3.3.2 通信架构

```
┌─────────────────────────────────────────────────────────────┐
│                    跨面板通信架构                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐         Zustand Store         ┌──────────┐│
│  │  LeftPanel   │ ◄──────────────────────────► │ RightPanel││
│  │              │                              │           ││
│  │  SearchPanel │    useSelectionStore         │ ChatPanel ││
│  │  GraphPanel  │    - selectedArtifact        │ Inpaint   ││
│  │              │    - highlightedGraphNodes   │           ││
│  └──────────────┘                              └───────────┘│
│         │                                              │    │
│         │         Props Callback (实时响应)            │    │
│         └───────────────────┬──────────────────────────┘    │
│                             │                               │
│                    ┌────────┴────────┐                      │
│                    │  WorkbenchLayout │                      │
│                    │  - 协调左右通信   │                      │
│                    └─────────────────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 3.3.3 数据流代码示例

**场景 1: 左侧选中文物 → 右侧 AI 感知**

```typescript
// WorkbenchLayout.tsx
const WorkbenchLayout: React.FC = () => {
  const { selectedArtifact } = useSelectionStore();
  const [rightContext, setRightContext] = useState<Artifact | null>(null);

  // 左侧选中文物时更新右侧上下文
  useEffect(() => {
    if (selectedArtifact) {
      setRightContext(selectedArtifact);

      // 同步到 URL
      updateURLState({ selectedArtifactId: selectedArtifact.id });
    }
  }, [selectedArtifact?.id]);

  return (
    <div className="workbench-layout">
      <LeftPanel
        selectedArtifactId={selectedArtifact?.id}
        onArtifactSelect={(artifact) => {
          useSelectionStore.getState().setSelectedArtifact(artifact);
        }}
      />
      <ResizableDivider />
      <RightPanel contextArtifact={rightContext} />
    </div>
  );
};
```

**场景 2: Chat 返回图谱 → 左侧高亮**

```typescript
// ChatPanel.tsx
const ChatPanel: React.FC = () => {
  const handleViewGraph = (graphData: GraphData) => {
    // 更新全局高亮状态
    const nodeIds = graphData.nodes.map((n) => n.id);
    useSelectionStore.getState().highlightGraphNodes(nodeIds);

    // 切换到图谱模式
    useWorkbenchStore.getState().setLeftPanelMode('graph');

    // 同步到 URL
    updateURLState({
      left: 'graph',
      graphFocusId: nodeIds[0]
    });
  };
};

// GraphPanel.tsx
const GraphPanel: React.FC = () => {
  const { highlightedGraphNodeIds } = useSelectionStore();

  // 监听高亮变化，更新 D3 视觉状态
  useEffect(() => {
    if (highlightedGraphNodeIds.length > 0) {
      updateGraphHighlight(highlightedGraphNodeIds);
    }
  }, [highlightedGraphNodeIds]);
};
```

---

## 四、状态管理规范（新增）

### 4.1 架构概述

采用 **Zustand** 进行全局状态管理，按功能拆分为三个核心 Store：

```
┌─────────────────────────────────────────────────────────┐
│                    Zustand Stores                        │
├─────────────────┬─────────────────┬─────────────────────┤
│ useWorkbenchStore│ useSelectionStore│ useAIContextStore  │
├─────────────────┼─────────────────┼─────────────────────┤
│ - 布局状态       │ - 当前选中文物   │ - AI 配置           │
│ - 面板模式       │ - 相关文物列表   │ - 消息历史          │
│ - 面板宽度       │ - 选中图谱节点   │ - 会话状态          │
└─────────────────┴─────────────────┴─────────────────────┘
```

### 4.2 useWorkbenchStore（工作台状态）

```typescript
// stores/useWorkbenchStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WorkbenchState {
  // 布局状态
  leftPanelMode: 'search' | 'graph' | 'split';
  rightPanelMode: 'chat' | 'inpaint' | 'split';
  leftPanelWidth: number;  // 百分比
  isMobile: boolean;

  // 面板显隐（移动端）
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;

  // Actions
  setLeftPanelMode: (mode: WorkbenchState['leftPanelMode']) => void;
  setRightPanelMode: (mode: WorkbenchState['rightPanelMode']) => void;
  setLeftPanelWidth: (width: number) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setMobile: (isMobile: boolean) => void;

  // 重置
  resetLayout: () => void;
}

export const useWorkbenchStore = create<WorkbenchState>()(
  persist(
    (set) => ({
      // 初始状态
      leftPanelMode: 'search',
      rightPanelMode: 'chat',
      leftPanelWidth: 50,
      isMobile: false,
      leftPanelVisible: true,
      rightPanelVisible: true,

      // Actions
      setLeftPanelMode: (mode) => set({ leftPanelMode: mode }),
      setRightPanelMode: (mode) => set({ rightPanelMode: mode }),
      setLeftPanelWidth: (width) => set({ leftPanelWidth: Math.max(20, Math.min(80, width)) }),
      toggleLeftPanel: () => set((state) => ({ leftPanelVisible: !state.leftPanelVisible })),
      toggleRightPanel: () => set((state) => ({ rightPanelVisible: !state.rightPanelVisible })),
      setMobile: (isMobile) => set({ isMobile }),

      // 重置
      resetLayout: () => set({
        leftPanelMode: 'search',
        rightPanelMode: 'chat',
        leftPanelWidth: 50,
        leftPanelVisible: true,
        rightPanelVisible: true
      })
    }),
    {
      name: 'workbench-storage',
      partialize: (state) => ({
        leftPanelMode: state.leftPanelMode,
        rightPanelMode: state.rightPanelMode,
        leftPanelWidth: state.leftPanelWidth
      })
    }
  )
);
```

### 4.3 useSelectionStore（选中状态）

```typescript
// stores/useSelectionStore.ts
import { create } from 'zustand';

interface SelectionState {
  // 当前选中文物（左右面板共享）
  selectedArtifact: Artifact | null;
  relatedArtifacts: Artifact[];

  // 图谱选中
  selectedGraphNodes: GraphNode[];
  highlightedGraphNodeIds: string[];

  // 图片选中（用于修复）
  selectedImage: ImageSource | null;

  // Actions
  setSelectedArtifact: (artifact: Artifact | null) => void;
  setRelatedArtifacts: (artifacts: Artifact[]) => void;
  setSelectedGraphNodes: (nodes: GraphNode[]) => void;
  highlightGraphNodes: (nodeIds: string[]) => void;
  setSelectedImage: (image: ImageSource | null) => void;

  // 清空
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedArtifact: null,
  relatedArtifacts: [],
  selectedGraphNodes: [],
  highlightedGraphNodeIds: [],
  selectedImage: null,

  setSelectedArtifact: (artifact) => set({ selectedArtifact: artifact }),
  setRelatedArtifacts: (artifacts) => set({ relatedArtifacts: artifacts }),
  setSelectedGraphNodes: (nodes) => set({ selectedGraphNodes: nodes }),
  highlightGraphNodes: (nodeIds) => set({ highlightedGraphNodeIds: nodeIds }),
  setSelectedImage: (image) => set({ selectedImage: image }),

  clearSelection: () => set({
    selectedArtifact: null,
    relatedArtifacts: [],
    selectedGraphNodes: [],
    highlightedGraphNodeIds: [],
    selectedImage: null
  })
}));
```

### 4.4 useAIContextStore（AI 上下文状态）

```typescript
// stores/useAIContextStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AIContextState {
  // AI 配置
  mode: 'graph' | 'knowledge' | 'general';
  model: 'ONLINE' | 'LOCAL' | 'MOCK';
  enabledTools: string[];

  // 会话状态
  conversationId: string | null;
  sessionId: string;

  // Actions
  setMode: (mode: AIContextState['mode']) => void;
  setModel: (model: AIContextState['model']) => void;
  toggleTool: (toolName: string) => void;
  setConversationId: (id: string | null) => void;
}

export const useAIContextStore = create<AIContextState>()(
  persist(
    (set) => ({
      mode: 'graph',
      model: 'LOCAL',
      enabledTools: ['query_graph', 'search_artifacts'],
      conversationId: null,
      sessionId: generateSessionId(),

      setMode: (mode) => set({ mode }),
      setModel: (model) => set({ model }),
      toggleTool: (toolName) => set((state) => ({
        enabledTools: state.enabledTools.includes(toolName)
          ? state.enabledTools.filter((t) => t !== toolName)
          : [...state.enabledTools, toolName]
      })),
      setConversationId: (id) => set({ conversationId: id })
    }),
    {
      name: 'ai-context-storage',
      partialize: (state) => ({
        mode: state.mode,
        model: state.model,
        enabledTools: state.enabledTools
      })
    }
  )
);
```

### 4.5 状态持久化策略

| 状态类型 | 持久化方式 | 说明 |
|----------|-----------|------|
| 布局状态 | localStorage + URL | 面板模式、宽度比例 |
| 选中状态 | URL 参数 | 当前选中文物 ID，支持分享链接 |
| AI 配置 | localStorage | 用户偏好（模式、模型、工具开关） |
| 会话状态 | sessionStorage | 当前对话历史（页面关闭清除） |

---

## 五、AI 层架构

### 5.1 三级模式设计

```
┌────────────────────────────────────────┐
│           AI 服务路由层                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ ONLINE  │ │  LOCAL  │ │   MOCK  │  │
│  │ 云端API │ │  Ollama │ │ 模拟响应 │  │
│  │ DeepSeek│ │本地8B模型│ │  (测试) │  │
│  └────┬────┘ └────┬────┘ └────┬────┘  │
│       └────────────┴───────────┘       │
│              ↑ 健康检查/自动降级        │
└────────────────────────────────────────┘
```

**模式说明**:

| 模式 | 用途 | 触发条件 |
|------|------|----------|
| ONLINE | 云端大模型，质量最高 | 网络畅通时 |
| LOCAL | Ollama 本地 8B 模型 | 内网环境或云端不可用时 |
| MOCK | 预设响应 | 开发和测试 |

**自动降级逻辑**:
- 每 30 秒健康检查
- 连续 3 次失败自动降级
- 上级恢复后自动升级

---

## 六、通信协议

### 6.1 同步通信

| 通信双方 | 协议 | 说明 |
|----------|------|------|
| 前端 ↔ 后端 | HTTP REST + SSE | SSE 用于 AI 流式响应 |
| 后端 ↔ Ollama | OpenAI 兼容 API | `/v1/chat/completions` |
| 后端 ↔ MCP Servers | HTTP/SSE | 工具调用协议 |

### 6.2 URL 状态同步协议（新增）

工作台状态通过 URL 查询参数持久化，支持刷新恢复和链接分享：

```typescript
// URL 参数定义
interface WorkbenchURLState {
  // 左侧面板模式
  left?: 'search' | 'graph' | 'split';

  // 右侧面板模式
  right?: 'chat' | 'inpaint' | 'split';

  // 面板宽度（百分比）
  leftWidth?: number;      // 0-100

  // 搜索相关
  searchQuery?: string;
  searchPage?: number;

  // 图谱相关
  graphKeyword?: string;
  graphFocusId?: string;

  // 选中文物
  selectedArtifactId?: string;

  // AI 相关
  chatMode?: 'graph' | 'knowledge' | 'general';
  chatSessionId?: string;
}

// 示例 URL
// /workbench?left=search&right=chat&leftWidth=45&searchQuery=青铜器&selectedArtifactId=123
```

**URL 状态同步实现**:

```typescript
// utils/url-state.ts
import { useSearchParams } from 'react-router-dom';

export function useWorkbenchURLState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const getState = (): WorkbenchURLState => {
    return {
      left: (searchParams.get('left') as any) || 'search',
      right: (searchParams.get('right') as any) || 'chat',
      leftWidth: parseInt(searchParams.get('leftWidth') || '50'),
      searchQuery: searchParams.get('searchQuery') || undefined,
      selectedArtifactId: searchParams.get('selectedArtifactId') || undefined
      // ...
    };
  };

  const updateState = (updates: Partial<WorkbenchURLState>) => {
    const newParams = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        newParams.delete(key);
      } else {
        newParams.set(key, String(value));
      }
    });

    setSearchParams(newParams, { replace: true });
  };

  return { state: getState(), updateState };
}
```

### 6.3 异步通信（规划）

- Excel 大文件导入 → Redis 队列 + Worker
- 知识图谱批量构建 → 消息队列

---

## 七、部署架构

### 7.1 开发环境

```yaml
services:
  frontend:    # React dev server (port 8080)
  backend:     # Node.js (port 3000)
  mysql:       # 开发数据 (port 13306)
  neo4j:       # 开发图谱 (port 17474)
  redis:       # 开发缓存 (port 16379)
  ollama:      # 本地模型 (port 11434)
```

### 7.2 生产环境

差异点:
- 前端用 **Nginx** 静态服务
- 后端暴露 **13000** 端口
- **无 Ollama**（云端 API）
- 数据卷持久化到宿主机

---

## 八、接口规范

### 8.1 REST API 设计

- **基础路径**: `/api/{resource}`
- **HTTP 方法**: GET（查询）、POST（创建）、PUT（更新）、DELETE（删除）
- **状态码**: 200 成功，400 参数错误，401 未认证，403 无权限，500 服务器错误

### 8.2 SSE 事件规范

```
event: message
data: {"type": "thinking", "content": "..."}

event: message
data: {"type": "content", "content": "..."}

event: done
data: {}
```

---

## 九、技术决策

### 9.1 为什么选 Node.js 而非 Java/Go？

- 团队熟悉 JavaScript，开发效率高
- AI 生态（OpenAI SDK）对 Node.js 支持最好
- 项目规模小，Node.js 性能足够

### 9.2 为什么用 Neo4j 而非 RDF/图计算框架？

- 成熟的管理界面（Browser）
- Cypher 查询比 SPARQL 好学
- 社区版够用

### 9.3 为什么 AI 用本地 Ollama？

- 文物数据敏感，部分客户要求不出内网
- 8B 模型对简单问答够用
- 云端 API 作为降级兜底

### 9.4 为什么从 React Context 升级到 Zustand？

- **跨面板通信**: Context 在深层嵌套组件中传递困难，Zustand 提供全局访问
- **性能优化**: Context 容易导致不必要的重渲染，Zustand 支持细粒度订阅
- **持久化支持**: Zustand 内置 `persist` 中间件，轻松实现状态持久化
- **开发体验**: 更少的样板代码，TypeScript 支持更好

---

## 十、路由设计（工作台架构）

### 10.1 新路由表

```typescript
// App.tsx 路由配置
import { Routes, Route, Navigate } from 'react-router-dom';

<Routes>
  {/* 认证路由 */}
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />

  {/* 工作台主路由 */}
  <Route path="/workbench" element={<WorkbenchPage />} />

  {/* 旧路由重定向（向后兼容） */}
  <Route path="/search" element={<Navigate to="/workbench?left=search" replace />} />
  <Route path="/chat" element={<Navigate to="/workbench?right=chat" replace />} />
  <Route path="/knowledge-graph" element={<Navigate to="/workbench?left=graph" replace />} />

  {/* 保留独立页面（低频/管理功能） */}
  <Route element={<PrivateLayout />}>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/wordcloud" element={<WordcloudPage />} />
    <Route path="/attachments" element={<AssetLibraryPage />} />
    <Route path="/profile" element={<ProfilePage />} />
    <Route path="/admin/*" element={<AdminPage />} />
    <Route path="/debug" element={<DebugPage />} />
  </Route>

  {/* 默认重定向到工作台 */}
  <Route path="*" element={<Navigate to="/workbench" replace />} />
</Routes>
```

---

*本文档基于工作台架构 v2.0 编写，指导系统架构设计和实现。*
