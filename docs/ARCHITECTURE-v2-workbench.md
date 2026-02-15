# 新架构设计概要
# 工作台为中心的功能集成系统

> **文档版本**: v2.0 - 工作台架构
> **更新日期**: 2026-02-15
> **核心卖点**: 一键部署 · 功能集成 · 工作台中心

---

## 一、架构愿景

### 1.1 为什么改变？

**当前问题**:
- 功能分散在多个独立页面（Dashboard、Search、Chat、KnowledgeGraph...）
- 用户需要在不同页面间频繁切换，打断工作流
- 每个页面重复加载，体验割裂

**新架构核心**:
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

### 1.2 核心价值主张（新）

**一键部署**
- 单个 `docker-compose up` 启动完整系统
- 零配置初始化，开箱即用
- 内置示例数据，5分钟内看到效果

**功能集成**
- 单一界面完成"搜索→探索→修复→问答"完整工作流
- 组件间实时联动：选中搜索结果 → 图谱高亮 → AI自动关联问答
- 全局状态共享，无需重复操作

**工作台中心**
- 左侧面板：文物发现（搜索+图谱）
- 右侧面板：智能助手（问答+修复）
- 所有操作在统一画布内完成

---

## 二、功能模块重定义

### 2.1 工作台布局 (WorkbenchLayout)

```typescript
interface WorkbenchLayout {
  // 左侧面板：探索区
  leftPanel: {
    mode: 'search' | 'graph' | 'split';  // 搜索模式 / 图谱模式 / 分屏模式
    search: SearchPanelConfig;
    graph: GraphPanelConfig;
  };
  
  // 右侧面板：AI助手区
  rightPanel: {
    mode: 'chat' | 'inpaint' | 'split';  // 问答模式 / 修复模式 / 分屏模式
    chat: ChatPanelConfig;
    inpaint: InpaintPanelConfig;
  };
  
  // 全局状态
  global: {
    selectedArtifact: Artifact | null;  // 当前选中的文物
    selectedImage: Image | null;        // 当前选中的图片（用于修复）
    contextMode: 'artifact' | 'image' | 'general';  // 当前上下文类型
  };
}
```

### 2.2 左侧面板：文物探索

#### 模式 A: 搜索模式 (Search Mode)
- 顶部：搜索框 + 筛选器
- 中部：搜索结果网格/列表
- 底部：分页控制
- 交互：点击文物 → 选中状态 → 触发右侧AI关联

#### 模式 B: 图谱模式 (Graph Mode)
- 全幅：D3.js力导向图
- 悬浮：图谱控制工具栏
- 交互：点击节点 → 显示详情 → 触发右侧AI关联

#### 模式 C: 分屏模式 (Split Mode)
- 上半：搜索结果列表
- 下半：选中项的关联图谱

### 2.3 右侧面板：智能助手

#### 模式 A: AI问答 (Chat Mode)
- 顶部：模式选择器（图谱/知识/通用）+ 工具开关
- 中部：对话历史（支持Markdown）
- 底部：输入框 + 快捷问题
- **智能上下文**：自动感知左侧选中的文物/图片

#### 模式 B: 图像修复 (Inpaint Mode)
- 顶部：修复类型选择（去水印/人脸修复/超分/上色）
- 左部：原图预览（从左侧拖拽或本地上传）
- 右部：修复后预览 + 对比滑块
- 底部：修复按钮 + 保存/下载

#### 模式 C: 分屏模式 (Split Mode)
- 上半：AI问答
- 下半：图像修复（或反之）

---

## 三、技术架构调整

### 3.1 前端路由简化

**当前路由** (多页面):
```
/              → Dashboard
/search        → Search
/knowledge-graph → KnowledgeGraph  
/chat          → Chat
/attachments   → Attachments
...
```

**新路由** (工作台为主):
```
/              → Workbench (工作台，包含所有功能)
/admin         → 管理后台 (保留独立，低频使用)
/login         → 登录
/register      → 注册
```

**可选：保留独立页面作为备用**
```
/workbench     → 默认工作台视图
/search        → 重定向到 /workbench?left=search
/chat          → 重定向到 /workbench?right=chat
```

### 3.2 组件架构

```
Workbench/
├── Layout/
│   ├── WorkbenchLayout.tsx      # 主布局容器（左/右面板框架）
│   ├── ResizableDivider.tsx     # 可拖拽分隔线
│   └── PanelToggle.tsx          # 面板显示/隐藏控制
│
├── LeftPanel/                   # 左侧：探索区
│   ├── SearchPanel/
│   │   ├── SearchInput.tsx
│   │   ├── FilterBar.tsx
│   │   ├── ResultGrid.tsx
│   │   └── SelectedArtifactCard.tsx
│   │
│   └── GraphPanel/
│       ├── GraphCanvas.tsx      # D3.js图谱画布
│       ├── GraphControls.tsx    # 缩放/重置/布局控制
│       ├── NodeDetails.tsx      # 节点详情浮层
│       └── LegendPanel.tsx      # 图例
│
├── RightPanel/                  # 右侧：AI助手区
│   ├── ChatPanel/
│   │   ├── ModeSelector.tsx     # 图谱/知识/通用模式切换
│   │   ├── ToolToggle.tsx       # MCP工具开关
│   │   ├── MessageList.tsx      # 消息历史（Markdown渲染）
│   │   ├── InputBox.tsx         # 输入框
│   │   └── QuickQuestions.tsx   # 快捷问题
│   │
│   └── InpaintPanel/
│       ├── UploadZone.tsx       # 拖拽上传区
│       ├── RepairTypeSelector.tsx
│       ├── PreviewCompare.tsx   # 前后对比
│       └── ActionBar.tsx        # 修复/保存/下载
│
└── Shared/
    ├── ContextBridge.tsx        # 左右面板状态同步
    ├── SelectionProvider.tsx    # 全局选中状态管理
    └── ArtifactCard.tsx         # 通用文物卡片
```

### 3.3 状态管理

**全局状态 (Redux/Zustand)**:
```typescript
interface WorkbenchState {
  // 布局状态
  layout: {
    leftPanelMode: 'search' | 'graph' | 'split';
    rightPanelMode: 'chat' | 'inpaint' | 'split';
    leftPanelWidth: number;  // 百分比或像素
    rightPanelWidth: number;
  };
  
  // 选中文物（左右面板共享）
  selection: {
    artifact: Artifact | null;
    relatedArtifacts: Artifact[];
    graphNodes: GraphNode[];
  };
  
  // AI上下文
  aiContext: {
    mode: 'graph' | 'knowledge' | 'general';
    toolsEnabled: string[];
    conversationHistory: Message[];
  };
  
  // 图像修复状态
  inpaint: {
    sourceImage: Image | null;
    repairedImage: Image | null;
    repairType: 'watermark' | 'face' | 'super' | 'colorize';
    isProcessing: boolean;
  };
}
```

**跨面板联动机制**:
```typescript
// 示例：左侧选中文物 → 右侧AI自动关联
useEffect(() => {
  if (selectedArtifact) {
    // 自动更新AI上下文
    dispatch(aiActions.setContextArtifact(selectedArtifact));
    
    // 可选：自动发送问候消息
    dispatch(aiActions.sendContextualMessage(
      `我正在查看"${selectedArtifact.name}"，你能告诉我更多关于它的信息吗？`
    ));
  }
}, [selectedArtifact]);
```

---

## 四、数据流设计

### 4.1 用户工作流

```
场景：研究员探索一批青铜器

1. 打开工作台 → 左侧搜索"青铜器"
   ↓
2. 浏览结果，点击"四羊方尊"
   ↓ 自动触发
3. 右侧AI显示："四羊方尊是商代晚期..."
   ↓
4. 切换到图谱模式，查看关联
   ↓ 发现与"湖南宁乡"关联
5. 问AI："湖南宁乡还出土了哪些文物？"
   ↓
6. 上传破损照片 → 右侧切换图像修复
   ↓
7. 修复完成，保存到该文物的附件

全程无需离开工作台页面
```

### 4.2 关键技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 布局方案 | 左右分栏+可拖拽分隔线 | 用户可自由分配空间 |
| 面板状态 | URL参数持久化 | 刷新不丢失，可分享链接 |
| 图谱渲染 | D3.js + Canvas混合 | 大量节点时性能优化 |
| AI流式响应 | Server-Sent Events | 已有基础，保持现状 |
| 图像修复 | 阿里云API + 本地缓存 | 成本控制+重复利用 |

---

## 五、阶段规划（重新编排）

### Phase 1: 工作台框架 (v0.1)
**目标**: 搭建可运行的Workbench基础框架

**任务**:
- [ ] 创建 WorkbenchLayout 组件
- [ ] 实现可拖拽分隔线
- [ ] 左侧面板占位符（Search/Graph模式切换）
- [ ] 右侧面板占位符（Chat/Inpaint模式切换）
- [ ] 全局状态管理（Zustand/Redux setup）
- [ ] 路由重构：/workbench 主入口

**验收标准**:
- 工作台页面可正常访问
- 左右面板可切换模式
- 分隔线可拖拽调整宽度

### Phase 2: 左侧探索区 (v0.2)
**目标**: 迁移现有Search和KnowledgeGraph到左侧面板

**任务**:
- [ ] SearchPanel组件封装
- [ ] GraphPanel组件封装
- [ ] 选中状态共享机制
- [ ] 分屏模式实现

**验收标准**:
- 搜索功能正常工作
- 图谱可视化正常工作
- 选中结果可跨面板传递

### Phase 3: 右侧AI助手 (v0.3)
**目标**: 迁移Chat和集成图像修复到右侧面板

**任务**:
- [ ] ChatPanel组件封装（基于现有Chat.js）
- [ ] InpaintPanel组件实现
- [ ] 阿里云API后端集成
- [ ] 左右上下文联动（选中→AI感知）

**验收标准**:
- AI问答正常工作
- 图像修复端到端可用
- 选中文物自动触发AI关联

### Phase 4: 集成优化 (v0.4)
**目标**: 打磨体验，性能优化

**任务**:
- [ ] URL状态持久化
- [ ] 面板状态记忆
- [ ] 移动端适配（面板堆叠）
- [ ] 性能优化（虚拟列表、懒加载）
- [ ] 快捷键支持

**验收标准**:
- 刷新后恢复之前布局
- 链接可分享特定状态
- 200+节点图谱流畅

### Phase 5: 遗留迁移 (v0.5)
**目标**: 旧页面平滑过渡或移除

**任务**:
- [ ] 旧路由重定向到工作台
- [ ] 删除废弃组件
- [ ] 更新文档
- [ ] 用户引导

---

## 六、部署策略（强化一键部署）

### 6.1 目标体验

```bash
# 用户只需执行
git clone <repo>
cd artifact-data-dashboard
cp .env.example .env
docker-compose up -d

# 5分钟后访问 http://localhost:8080
# 使用 admin/admin123 登录
# 即可看到完整工作台，内置示例数据
```

### 6.2 技术保障

- **健康检查**: 容器启动后自动等待依赖就绪
- **数据初始化**: 首次启动自动导入示例数据
- **错误提示**: 启动失败时给出明确的诊断信息
- **资源优化**: 生产环境最小化镜像，开发环境热重载

---

## 七、文档重写清单

基于新架构，以下文档需要重写或更新：

| 文档 | 变更类型 | 主要内容 |
|------|----------|----------|
| specs/01-system-overview/spec.md | 重写 | 新定位：工作台为中心的一站式文物研究平台 |
| specs/05-frontend/spec.md | 重写 | Workbench组件架构、左右面板设计 |
| specs/06-ai-mcp/spec.md | 重写 | 右侧AI助手的集成设计 |
| specs/02-architecture/spec.md | 更新 | 工作台状态管理、跨面板通信 |
| specs/README.md | 更新 | 新架构文档导航 |
| docs/WBS.md | 重写 | 基于新阶段规划的WBS |
| README.md | 更新 | 强调一键部署和工作台体验 |

---

*本文档作为新架构的顶层设计，指导后续spec文档的重写工作。*
