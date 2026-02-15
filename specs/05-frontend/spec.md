# 前端架构规范 - 工作台中心架构 v2.0

> **版本**: v2.0
> **更新日期**: 2026-02-15
> **架构**: 工作台为中心，左右分栏布局

---

## 一、技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **框架** | React 18.x | UI 框架 |
| **构建工具** | Create React App 5.0.1 | 构建（计划迁移到 Vite） |
| **UI 组件库** | Ant Design 5.x | 组件库 |
| **状态管理** | Zustand 4.x | 全局状态（替代 Context+useReducer） |
| **路由** | React Router 6 | 客户端路由 |
| **可视化** | D3.js 7.x | 知识图谱力导向图 |
| **HTTP 客户端** | Axios | API 请求 |
| **Markdown 渲染** | react-markdown 9.x | AI 消息渲染 |
| **样式方案** | CSS Modules + Ant Design 主题 | 样式管理 |

---

## 二、目录结构

```
frontend/src/
├── App.js                           # 根组件，路由配置
├── index.js                         # 入口
├──
├── stores/                          # Zustand 状态管理（新增）
│   ├── useWorkbenchStore.ts         # 工作台全局状态
│   ├── useSelectionStore.ts         # 选中文物状态
│   └── useAIContextStore.ts         # AI 上下文状态
│
├── components/                      # 可复用组件
│   ├── Workbench/                   # 工作台组件（核心，新增）
│   │   ├── Layout/
│   │   │   ├── WorkbenchLayout.tsx      # 主布局容器
│   │   │   ├── ResizableDivider.tsx     # 可拖拽分隔线
│   │   │   └── PanelContainer.tsx       # 面板容器
│   │   │
│   │   ├── LeftPanel/               # 左侧面板：探索区
│   │   │   ├── SearchPanel.tsx          # 搜索面板
│   │   │   ├── GraphPanel.tsx           # 知识图谱面板
│   │   │   ├── PanelToggle.tsx          # 模式切换器
│   │   │   ├── SearchPanel/
│   │   │   │   ├── SearchInput.tsx
│   │   │   │   ├── FilterBar.tsx
│   │   │   │   ├── ResultList.tsx
│   │   │   │   └── ArtifactCard.tsx
│   │   │   └── GraphPanel/
│   │   │       ├── GraphCanvas.tsx      # D3.js 画布
│   │   │       ├── GraphControls.tsx    # 图谱控制
│   │   │       └── NodeTooltip.tsx      # 节点提示
│   │   │
│   │   ├── RightPanel/              # 右侧面板：AI助手区
│   │   │   ├── ChatPanel.tsx            # AI问答面板
│   │   │   ├── InpaintPanel.tsx         # 图像修复面板
│   │   │   ├── PanelToggle.tsx          # 模式切换器
│   │   │   ├── ChatPanel/
│   │   │   │   ├── ModeSelector.tsx     # 问答模式切换
│   │   │   │   ├── ToolToggle.tsx       # MCP工具开关
│   │   │   │   ├── MessageList.tsx      # 消息列表
│   │   │   │   ├── MessageItem.tsx      # 单条消息
│   │   │   │   ├── InputBox.tsx         # 输入框
│   │   │   │   └── QuickQuestions.tsx   # 快捷问题
│   │   │   └── InpaintPanel/
│   │   │       ├── UploadZone.tsx       # 拖拽上传区
│   │   │       ├── RepairTypeSelector.tsx
│   │   │       ├── PreviewCompare.tsx   # 前后对比
│   │   │       └── ActionBar.tsx        # 操作按钮
│   │   │
│   │   └── Shared/                  # 工作台共享组件
│   │       ├── ContextBridge.tsx        # 跨面板上下文桥接
│   │       ├── SelectionIndicator.tsx   # 全局选中指示器
│   │       └── ArtifactPreview.tsx      # 文物预览浮层
│   │
│   ├── Admin/                       # 系统管理
│   │   ├── UserManager.tsx
│   │   ├── ModeManager.tsx          # AI模式管理
│   │   └── SystemSettings.tsx
│   │
│   ├── AssetLibrary/                # 资产库
│   │   ├── AssetList.tsx
│   │   ├── AssetDetail.tsx
│   │   ├── AssetForm.tsx
│   │   ├── AssetPicker.tsx
│   │   ├── FolderTree.tsx
│   │   ├── FolderManager.tsx
│   │   ├── UploadModal.tsx
│   │   ├── ImportModal.tsx
│   │   ├── ExportModal.tsx
│   │   └── TagManager.tsx
│   │
│   ├── Common/                      # 通用组件
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   ├── ImageViewer.tsx
│   │   └── FileUploader.tsx
│   │
│   └── Statistics/                  # 统计分析
│       ├── WordCloud.tsx
│       └── ChartPanel.tsx
│
├── pages/                           # 页面级组件
│   ├── WorkbenchPage.tsx            # 工作台主页面（新增）
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── DashboardPage.tsx            # 数据大屏（保留独立页面）
│   ├── AssetLibraryPage.tsx
│   ├── WordcloudPage.tsx
│   ├── ProfilePage.tsx
│   ├── AdminPage.tsx
│   └── DebugPage.tsx
│
├── services/                        # API 封装
│   ├── api.ts                       # Axios 实例（迁移到 TS）
│   ├── auth.service.ts
│   ├── artifact.service.ts
│   ├── attachment.service.ts
│   ├── folder.service.ts
│   ├── graph.service.ts
│   ├── chat.service.ts
│   ├── mcp.service.ts
│   ├── mode.service.ts
│   └── inpaint.service.ts           # 图像修复服务（新增）
│
├── hooks/                           # 自定义 Hooks
│   ├── useWorkbench.ts              # 工作台状态 Hook
│   ├── useSelection.ts              # 选中状态 Hook
│   ├── useAIContext.ts              # AI上下文 Hook
│   ├── useGraph.ts                  # 图谱数据 Hook
│   └── useInpaint.ts                # 图像修复 Hook
│
├── utils/                           # 工具函数
│   ├── request.ts
│   ├── format.ts
│   ├── validators.ts
│   └── url-state.ts                 # URL状态同步（新增）
│
└── styles/                          # 全局样式
    ├── variables.css                # CSS变量
    ├── workbench.css                # 工作台特定样式
    └── custom.css
```

---

## 三、路由设计

### 3.1 新路由表

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

### 3.2 URL 状态持久化

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

---

## 四、核心组件规格

### 4.1 WorkbenchLayout（工作台主布局）

**功能**: 提供左右分栏的可拖拽布局容器，管理面板显示/隐藏。

**布局结构**:
```
┌─────────────────────────────────────────────────────────────┐
│  Header (固定高度)                                           │
├───────────────────────────┬─────────────────────────────────┤
│                           │                                 │
│    LeftPanel              │    RightPanel                   │
│    (可拖拽调整宽度)        │    (自适应剩余宽度)              │
│                           │                                 │
│  ┌─────────────────────┐  │  ┌───────────────────────────┐  │
│  │                     │  │  │                           │  │
│  │   SearchPanel       │  │  │   ChatPanel               │  │
│  │   or GraphPanel     │  │  │   or InpaintPanel         │  │
│  │                     │  │  │                           │  │
│  │   [PanelToggle]     │  │  │   [PanelToggle]           │  │
│  │                     │  │  │                           │  │
│  └─────────────────────┘  │  └───────────────────────────┘  │
│                           │                                 │
└───────────────────────────┴─────────────────────────────────┘
         ↑
    ResizableDivider (可拖拽分隔线)
```

**接口定义**:
```typescript
interface WorkbenchLayoutProps {
  // 初始配置
  initialLeftMode?: 'search' | 'graph' | 'split';
  initialRightMode?: 'chat' | 'inpaint' | 'split';
  initialLeftWidth?: number;  // 百分比，默认 50

  //  children 由内部根据模式渲染
}

interface WorkbenchLayoutState {
  // 布局状态
  leftPanelMode: 'search' | 'graph' | 'split';
  rightPanelMode: 'chat' | 'inpaint' | 'split';
  leftPanelWidth: number;     // 百分比 20-80
  isDragging: boolean;        // 是否正在拖拽

  // 面板显隐（移动端用）
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
}
```

**实现要点**:
- 使用 `react-resizable-panels` 或自定义实现可拖拽分隔线
- 支持键盘快捷键调整面板宽度（Ctrl/Cmd + ←/→）
- 移动端自动切换为堆叠布局（上下排列）
- 面板状态变更自动同步到 URL 参数

---

### 4.2 SearchPanel（搜索面板）

**功能**: 提供文物搜索、结果展示和选中功能。与右侧 AI 面板联动。

**界面结构**:
```
┌─────────────────────────────────────┐
│  SearchInput (搜索框 + 筛选器)        │
├─────────────────────────────────────┤
│                                     │
│  ResultList (搜索结果列表)           │
│  ┌───────────────────────────────┐  │
│  │ ArtifactCard                  │  │
│  │ - 图片缩略图                   │  │
│  │ - 名称/年代/类别               │  │
│  │ - [选中高亮]                  │  │
│  └───────────────────────────────┘  │
│  ...                                │
│                                     │
├─────────────────────────────────────┤
│  Pagination (分页控件)               │
└─────────────────────────────────────┘
```

**接口定义**:
```typescript
interface SearchPanelProps {
  // 初始搜索词
  initialQuery?: string;

  // 选中回调（触发右侧 AI 上下文更新）
  onArtifactSelect?: (artifact: Artifact) => void;

  // 当前选中的文物 ID（用于高亮）
  selectedArtifactId?: string;
}

interface SearchPanelState {
  // 搜索状态
  query: string;
  filters: SearchFilters;
  results: Artifact[];
  pagination: {
    current: number;
    pageSize: number;
    total: number;
  };
  loading: boolean;
  error: string | null;

  // 视图状态
  viewMode: 'list' | 'grid';
}

interface SearchFilters {
  era?: string[];
  category?: string[];
  material?: string[];
  location?: string[];
}

interface Artifact {
  id: string;
  name: string;
  era: string;
  category: string;
  location: string;
  material: string;
  description: string;
  imageUrl?: string;
  tags: string[];
}
```

**与右侧联动**:
```typescript
// SearchPanel.tsx
const SearchPanel: React.FC<SearchPanelProps> = ({ onArtifactSelect }) => {
  const { setSelectedArtifact } = useSelectionStore();

  const handleArtifactClick = (artifact: Artifact) => {
    // 更新本地选中状态
    setSelectedArtifact(artifact);

    // 触发父组件回调（WorkbenchLayout 会传递到右侧）
    onArtifactSelect?.(artifact);

    // 同步到 URL
    updateURLState({ selectedArtifactId: artifact.id });
  };

  // ...
};
```

---

### 4.3 GraphPanel（图谱面板）

**功能**: 提供知识图谱可视化，支持节点探索和高亮。

**界面结构**:
```
┌─────────────────────────────────────┐
│  GraphToolbar (工具栏)              │
│  [搜索] [缩放] [重置] [适配] [设置]   │
├─────────────────────────────────────┤
│                                     │
│  GraphCanvas (D3.js 画布)           │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │    ○───○                    │    │
│  │   /      \                  │    │
│  │  ○   ●────○                 │    │
│  │       \    /                │    │
│  │        ○──○                 │    │
│  │                             │    │
│  │  ● = 选中/高亮节点           │    │
│  └─────────────────────────────┘    │
│                                     │
│  Legend (图例)                      │
└─────────────────────────────────────┘
```

**接口定义**:
```typescript
interface GraphPanelProps {
  // 初始聚焦节点
  initialFocusNodeId?: string;

  // 高亮节点列表（从 Chat 传递）
  highlightNodeIds?: string[];

  // 节点点击回调
  onNodeSelect?: (node: GraphNode) => void;
}

interface GraphPanelState {
  // 图谱数据
  nodes: GraphNode[];
  edges: GraphEdge[];
  loading: boolean;
  error: string | null;

  // 视图状态
  zoom: number;
  selectedNode: GraphNode | null;
  focusedNode: GraphNode | null;

  // D3 配置
  forceSettings: ForceSettings;
  displaySettings: DisplaySettings;
}

interface GraphNode {
  id: string;
  label: string;
  type: 'artifact' | 'category' | 'era' | 'author' | 'location' | 'material';
  properties: Record<string, any>;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  label: string;
  type: string;
}

interface ForceSettings {
  linkDistance: number;
  linkStrength: number;
  chargeStrength: number;
  collisionRadius: number;
  centerStrength: number;
}

interface DisplaySettings {
  showNodeLabels: boolean;
  showLinkLabels: boolean;
  nodeSize: number;
  theme: 'light' | 'dark';
}
```

---

### 4.4 ChatPanel（AI 问答面板）

**功能**: 提供智能问答，支持三种模式（图谱/知识/通用），与左侧选中文物联动。

**界面结构**:
```
┌─────────────────────────────────────┐
│  ChatHeader (头部工具栏)             │
│  [模式选择] [工具开关] [清空]         │
├─────────────────────────────────────┤
│                                     │
│  MessageList (消息列表)              │
│  ┌───────────────────────────────┐  │
│  │ 用户: 四羊方尊是什么年代的？   │  │
│  ├───────────────────────────────┤  │
│  │ AI: 四羊方尊是商代晚期...      │  │
│  │ [来源: 知识图谱] [查看图谱]    │  │
│  ├───────────────────────────────┤  │
│  │ 🎨 正在生成回答...            │  │
│  └───────────────────────────────┘  │
│                                     │
├─────────────────────────────────────┤
│  ContextIndicator (当前上下文)       │
│  📎 正在讨论: 四羊方尊              │
├─────────────────────────────────────┤
│  InputArea (输入区)                  │
│  ┌─────────────────────────────┐    │
│  │ 请输入问题...      [发送]   │    │
│  └─────────────────────────────┘    │
│  QuickQuestions (快捷问题)           │
│  [简介] [年代] [出土地] [相关文物]   │
└─────────────────────────────────────┘
```

**接口定义**:
```typescript
interface ChatPanelProps {
  // 初始模式
  initialMode?: 'graph' | 'knowledge' | 'general';

  // 外部传入的上下文（从左侧选中文物）
  contextArtifact?: Artifact | null;

  // 会话 ID（用于恢复历史）
  sessionId?: string;
}

interface ChatPanelState {
  // 消息列表
  messages: Message[];
  loading: boolean;
  streaming: boolean;
  error: string | null;

  // 输入状态
  inputValue: string;

  // AI 配置
  mode: 'graph' | 'knowledge' | 'general';
  enabledTools: string[];
  aiModel: 'ONLINE' | 'LOCAL' | 'MOCK';

  // 会话
  conversationId: string | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  type?: 'text' | 'tool_call' | 'thinking';
  source?: 'knowledge_graph' | 'mcp_model' | 'simulation' | 'tool_calling';
  toolResults?: ToolResult[];
  toolsCalled?: ToolCall[];
  toolsError?: string;
  pending?: boolean;
  isError?: boolean;
  data?: any;  // 图谱数据（用于"查看图谱"）
}

interface ToolResult {
  name: string;
  status: 'success' | 'error';
  data?: any;
  error?: string;
}

interface ToolCall {
  name: string;
  status: 'success' | 'error';
  error?: string;
}
```

**上下文联动机制**:
```typescript
// ChatPanel.tsx
const ChatPanel: React.FC<ChatPanelProps> = ({ contextArtifact }) => {
  const { messages, addMessage, sendMessage } = useAIContextStore();

  // 监听左侧选中文物变化，自动更新上下文
  useEffect(() => {
    if (contextArtifact) {
      // 自动发送上下文问候语
      const contextualPrompt = `我正在查看"${contextArtifact.name}"，你能告诉我关于它的详细信息吗？`;

      // 添加到消息列表（可选，取决于产品设计）
      addMessage({
        role: 'system',
        content: `当前讨论文物: ${contextArtifact.name}`,
        type: 'context_update'
      });
    }
  }, [contextArtifact?.id]);

  // 发送问题时附带上下文
  const handleSend = async (question: string) => {
    const config = {
      mode: currentMode,
      model: aiModel,
      enabledTools,
      contextArtifact: contextArtifact || undefined
    };

    await sendMessage(question, config);
  };

  // ...
};
```

---

### 4.5 InpaintPanel（图像修复面板）

**功能**: 提供图像上传、修复类型选择和结果预览，支持从左侧拖拽图片。

**界面结构**:
```
┌─────────────────────────────────────┐
│  RepairTypeSelector (修复类型选择)   │
│  [去水印] [人脸修复] [超分辨率] [上色]│
├─────────────────────────────────────┤
│                                     │
│  UploadZone (上传/拖拽区)            │
│  ┌─────────────────────────────┐    │
│  │    📷                       │    │
│  │   拖拽图片到此处             │    │
│  │   或点击上传                 │    │
│  │   支持 JPG, PNG, WebP       │    │
│  └─────────────────────────────┘    │
│                                     │
│  或                                   │
│                                     │
│  PreviewCompare (前后对比)           │
│  ┌─────────────────────────────┐    │
│  │  [原图]    |    [修复后]    │    │
│  │            |                │    │
│  │   ◀──── 对比滑块 ────▶     │    │
│  │            |                │    │
│  └─────────────────────────────┘    │
│                                     │
├─────────────────────────────────────┤
│  ActionBar (操作栏)                  │
│  [开始修复] [保存] [下载] [取消]      │
└─────────────────────────────────────┘
```

**接口定义**:
```typescript
interface InpaintPanelProps {
  // 初始图片（从左侧拖拽传入）
  initialImage?: ImageSource | null;

  // 关联的文物 ID
  artifactId?: string;
}

interface InpaintPanelState {
  // 图片状态
  sourceImage: ImageSource | null;
  repairedImage: ImageSource | null;
  isDragging: boolean;

  // 修复配置
  repairType: 'watermark' | 'face' | 'super' | 'colorize';
  isProcessing: boolean;
  progress: number;

  // 结果
  error: string | null;
  taskId: string | null;
}

interface ImageSource {
  id: string;
  url: string;
  file?: File;
  width: number;
  height: number;
  artifactId?: string;
}

interface RepairTask {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  resultUrl?: string;
  error?: string;
}
```

**拖拽接收实现**:
```typescript
// InpaintPanel.tsx
const InpaintPanel: React.FC<InpaintPanelProps> = ({ initialImage }) => {
  const [sourceImage, setSourceImage] = useState<ImageSource | null>(initialImage);

  // 监听拖拽事件
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      // 检查是否有从左侧传来的图片数据
      const imageData = e.dataTransfer?.getData('application/json');
      if (imageData) {
        const parsed = JSON.parse(imageData);
        setSourceImage(parsed);
      }
    };

    const dropZone = dropZoneRef.current;
    if (dropZone) {
      dropZone.addEventListener('dragover', handleDragOver);
      dropZone.addEventListener('drop', handleDrop);
    }

    return () => {
      if (dropZone) {
        dropZone.removeEventListener('dragover', handleDragOver);
        dropZone.removeEventListener('drop', handleDrop);
      }
    };
  }, []);

  // ...
};
```

---

### 4.6 PanelToggle（面板模式切换器）

**功能**: 在面板内提供快速切换模式的控件。

**接口定义**:
```typescript
interface PanelToggleProps {
  // 当前模式
  currentMode: 'search' | 'graph' | 'split' | 'chat' | 'inpaint';

  // 可用模式列表
  availableModes: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
  }>;

  // 模式切换回调
  onModeChange: (mode: string) => void;

  // 位置
  position?: 'top' | 'bottom';
}
```

---

## 五、状态管理

### 5.1 架构概述

采用 **Zustand** 进行全局状态管理，按功能拆分为多个 Store：

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

### 5.2 useWorkbenchStore（工作台状态）

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

### 5.3 useSelectionStore（选中状态）

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

### 5.4 useAIContextStore（AI 上下文状态）

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

---

## 六、跨面板通信机制

### 6.1 通信场景

工作台需要处理以下跨面板通信场景：

1. **左选右应**: 左侧选中文物 → 右侧 AI 自动感知上下文
2. **图问联动**: Chat 返回图谱数据 → 左侧图谱自动高亮节点
3. **图问切换**: 点击"查看图谱" → 左侧切换到图谱模式并聚焦
4. **图修联动**: 左侧拖拽图片 → 右侧修复面板接收图片

### 6.2 通信机制

采用 **Zustand 全局状态 + 事件回调** 的双层机制：

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

### 6.3 实现示例

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

      // 可选：自动切换到 Chat 模式
      // setRightPanelMode('chat');

      // 可选：自动发送问候语
      // sendContextualGreeting(selectedArtifact);
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

    // 可选：切换到图谱模式
    useWorkbenchStore.getState().setLeftPanelMode('graph');

    // 同步到 URL
    updateURLState({
      left: 'graph',
      graphFocusId: nodeIds[0]
    });
  };

  // ...
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

  // ...
};
```

**场景 3: 拖拽图片到修复面板**

```typescript
// ArtifactCard.tsx（左侧搜索结果）
const ArtifactCard: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
  const handleDragStart = (e: DragEvent) => {
    if (artifact.imageUrl) {
      const imageData = JSON.stringify({
        id: artifact.id,
        url: artifact.imageUrl,
        artifactId: artifact.id,
        width: artifact.imageWidth,
        height: artifact.imageHeight
      });
      e.dataTransfer.setData('application/json', imageData);
    }
  };

  return (
    <div draggable onDragStart={handleDragStart}>
      <img src={artifact.imageUrl} alt={artifact.name} />
      <span>{artifact.name}</span>
    </div>
  );
};
```

### 6.4 URL 状态同步

实现 `url-state.ts` 工具，确保状态变更自动同步到 URL：

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

---

## 七、样式规范

### 7.1 CSS 变量

```css
/* styles/variables.css */
:root {
  /* 布局 */
  --workbench-header-height: 48px;
  --workbench-divider-width: 8px;
  --panel-min-width: 320px;

  /* 颜色 */
  --color-primary: #1890ff;
  --color-success: #52c41a;
  --color-warning: #faad14;
  --color-error: #f5222d;

  /* 面板 */
  --panel-bg: #ffffff;
  --panel-border: #d9d9d9;
  --panel-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  /* 图谱 */
  --graph-node-artifact: #1890ff;
  --graph-node-category: #52c41a;
  --graph-node-era: #fa8c16;
  --graph-node-author: #722ed1;
  --graph-node-location: #eb2f96;

  /* 动画 */
  --transition-fast: 150ms ease;
  --transition-normal: 300ms ease;
}
```

### 7.2 响应式断点

```typescript
// 响应式配置
const breakpoints = {
  mobile: 768,      // 移动端：面板堆叠
  tablet: 1024,     // 平板：面板分栏但宽度受限
  desktop: 1280,    // 桌面：完整分栏
  wide: 1600        // 宽屏：可展开更多内容
};

// 移动端行为
// - 左右面板切换显示（Tab 切换）
// - 隐藏拖拽分隔线
// - 底部固定导航
```

---

## 八、迁移指南

### 8.1 从旧页面迁移

现有页面需要迁移到工作台组件：

| 旧页面 | 新组件 | 迁移说明 |
|--------|--------|----------|
| `pages/Search.js` | `Workbench/LeftPanel/SearchPanel` | 提取核心逻辑，移除路由相关代码 |
| `pages/KnowledgeGraph.js` | `Workbench/LeftPanel/GraphPanel` | 提取 D3 逻辑，适配面板尺寸 |
| `pages/Chat.js` | `Workbench/RightPanel/ChatPanel` | 提取消息管理，添加上下文接收 |
| `pages/Attachments.js` | `AssetLibraryPage` | 保持独立页面（管理功能） |

### 8.2 向后兼容

旧路由通过重定向保持兼容：

```typescript
// 旧路由重定向配置
<Route path="/search" element={<Navigate to="/workbench?left=search" replace />} />
<Route path="/knowledge-graph" element={<Navigate to="/workbench?left=graph" replace />} />
<Route path="/chat" element={<Navigate to="/workbench?right=chat" replace />} />
```

---

## 九、开发检查清单

### 9.1 WorkbenchLayout 实现检查

- [ ] 左右面板正确渲染
- [ ] 可拖拽分隔线正常工作
- [ ] 宽度限制（20%-80%）
- [ ] 移动端自动切换堆叠布局
- [ ] URL 状态同步
- [ ] 键盘快捷键支持

### 9.2 跨面板通信检查

- [ ] 左侧选中文物 → 右侧 AI 感知
- [ ] Chat 图谱数据 → 左侧高亮
- [ ] 拖拽图片 → 修复面板接收
- [ ] URL 参数刷新后恢复状态

### 9.3 性能检查

- [ ] 图谱节点数 >100 时流畅
- [ ] 消息列表虚拟滚动（>50 条）
- [ ] 图片懒加载
- [ ] 状态变更不引起不必要重渲染

---

*本文档基于工作台架构 v2.0 编写，指导前端重构实现。*

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
