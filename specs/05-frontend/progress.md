# 前端开发进度

## 组件实现状态

| 模块 | 组件 | 状态 | 备注 |
|------|------|------|------|
| **认证** | LoginPage | ✅ 已完成 | 基础登录功能 |
| **仪表盘** | DashboardPage | ✅ 已完成 | 统计概览展示 |
| **资产库** | AssetLibraryPage | ✅ 已完成 | 主页面布局 |
| | AssetList | ✅ 已完成 | 列表/网格视图 |
| | AssetDetail | ✅ 已完成 | 详情弹窗 |
| | AssetForm | ✅ 已完成 | 新增/编辑表单 |
| | FolderTree | ✅ 已完成 | 文件夹导航 |
| | UploadModal | ✅ 已完成 | 文件上传 |
| | ImportModal | ✅ 已完成 | Excel 导入 |
| | ExportModal | ✅ 已完成 | Excel 导出 |
| **AI 问答** | ChatPage | ✅ 已完成 | 对话页面 |
| | ChatWindow | ✅ 已完成 | 聊天窗口容器 |
| | ChatInput | ✅ 已完成 | 输入框组件 |
| | MessageList | ✅ 已完成 | 消息列表 |
| | ToolResultCard | ✅ 已完成 | 工具结果展示 |
| | **AIConfigPanel** | ❌ **未开始** | **模型/模式/工具开关（v0.6 最高优先级）** |
| **知识图谱** | GraphPage | ✅ 已完成 | 图谱分析页面 |
| | ForceGraph | ✅ 已完成 | D3.js 力导向图 |
| | GraphControls | ✅ 已完成 | 控制面板 |
| | NodeDetail | ✅ 已完成 | 节点详情 |
| | **GraphVisualization** | 📝 **方案待选** | **分页/聚合/混合三方案** |
| | **PathFinder** | 📝 **规划中** | **节点间最短路径** |
| | **GraphExporter** | 📝 **规划中** | **导出 PNG/SVG/GEXF** |
| **统计** | StatisticsPage | ✅ 已完成 | 统计分析页面 |
| | WordCloud | ✅ 已完成 | 词云展示 |
| | ChartPanel | ✅ 已完成 | ECharts 图表 |
| **管理** | AdminPage | ✅ 已完成 | 系统管理页面 |
| | UserManager | ✅ 已完成 | 用户管理 |

---

## 已知问题

### 1. Create React App 过时

**问题**：
- 构建慢（没有 Vite 快）
- ESLint 配置僵化
- 热更新慢

**影响**：开发效率降低，构建时间较长

---

### 2. 组件粒度不均

**问题**：
- `AssetLibraryPage.js` 超过 500 行
- 业务逻辑和 UI 耦合

**影响**：
- 代码难以维护
- 测试困难
- 复用性低

---

### 3. 测试缺失

**问题**：目前只有手工测试

**影响**：
- 回归测试成本高
- 容易引入 bug
- 代码重构风险大

---

### 4. 知识图谱性能

**问题**：节点超过 500 个时，D3.js 卡顿

**影响**：大数据量场景下用户体验差

**方案文档**：[graph-visualization-options.md](./graph-visualization-options.md)

**待决策**：
- [ ] 选择方案 A（分页加载）、B（聚合视图）或 C（混合方案）
- [ ] 实现路径发现功能
- [ ] 实现图谱导出功能

---

## 重构计划

### 短期（1-2 周）

#### 1. 组件拆分

**目标**：将大组件拆分为小组件 + Hooks

```
AssetLibraryPage/
├── index.js           # 页面入口，只负责布局
├── useAssetList.js    # 列表逻辑 Hook
├── useFolderTree.js   # 文件夹逻辑 Hook
├── components/
│   ├── Toolbar.js
│   ├── FilterBar.js
│   └── AssetGrid.js
```

**任务清单**：
- [ ] 提取 `useAssetList` Hook
- [ ] 提取 `useFolderTree` Hook
- [ ] 拆分 Toolbar 组件
- [ ] 拆分 FilterBar 组件
- [ ] 拆分 AssetGrid 组件

---

### 中期（1 个月）

#### 2. 迁移到 Vite

**升级路径**：
```bash
# 创建新的 Vite 项目
npm create vite@latest frontend-vite -- --template react

# 迁移配置：
# 1. 复制 src 目录
# 2. 迁移依赖（package.json）
# 3. 配置路径别名
# 4. 配置环境变量（VITE_ 前缀）
# 5. 更新 Dockerfile
```

**任务清单**：
- [ ] 创建 Vite 项目脚手架
- [ ] 迁移源代码
- [ ] 配置路径别名 (@/components 等)
- [ ] 迁移环境变量
- [ ] 更新 CI/CD 配置
- [ ] 性能对比测试

#### 3. 添加单元测试

**计划**：
```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom
```

**测试范围**：
- [ ] Utils 工具函数
- [ ] Services API 封装
- [ ] Hooks 逻辑
- [ ] 基础组件渲染

---

### 长期（2-3 个月）

#### 4. 状态管理优化

**考虑方案**：
- Zustand：轻量级状态管理
- TanStack Query：服务端状态管理

---

## 性能优化建议

### 1. 知识图谱优化

**方案对比**：[graph-visualization-options.md](./graph-visualization-options.md)

| 方案 | 描述 | 优先级 | 状态 |
|------|------|--------|------|
| **方案 A：分页加载** | 按度数排序，每次显示 Top N | 高 | 📝 待实现 |
| **方案 B：聚合视图** | 按类别/朝代聚合为超级节点 | 中 | 📝 待实现 |
| **方案 C：混合方案** ⭐ | 动态聚合 + 鱼眼视图 | 高 ⭐ | 📝 **推荐** |
| WebGL 渲染 | 使用 force-graph 库替代 D3 | 中 | 📝 待评估 |
| 路径发现 | 两节点间最短路径查询 | 中 | 📝 待实现 |
| 导出功能 | PNG/SVG/GEXF/JSON/CSV | 低 | 📝 待实现 |

### 2. 构建优化

| 方案 | 描述 | 优先级 |
|------|------|--------|
| 迁移 Vite | 替换 CRA | 高 |
| 代码分割 | 按路由懒加载 | 高 |
| 依赖分析 | 优化 bundle 大小 | 中 |
| Tree Shaking | 移除未使用代码 | 中 |

### 3. 运行时优化

| 方案 | 描述 | 优先级 |
|------|------|--------|
| 虚拟列表 | 大量数据列表优化 | 中 |
| 图片懒加载 | 文物图片优化 | 中 |
| 缓存策略 | API 响应缓存 | 中 |
| Service Worker | 离线缓存 | 低 |

---

## 技术债务追踪

| 问题 | 严重程度 | 计划解决时间 | 负责人 |
|------|----------|--------------|--------|
| **AI 配置面板缺失** | **🔴 最高** | **v0.6** | **待分配** |
| CRA 过时 | 高 | 1 个月内 | 待分配 |
| 组件过大 | 中 | 2 周内 | 待分配 |
| 缺少测试 | 中 | 1 个月内 | 待分配 |
| 图谱性能 | 中 | 按需处理 | 待分配 |

---

## 新增组件需求（v0.6）

### AI 配置面板（AIConfigPanel）

**需求描述**：在聊天界面添加可折叠的配置面板，让用户实时控制 AI 行为。

**界面元素**：
```
┌─────────────────────────────────────────────────────────────┐
│  AI 配置面板                                                 │
├─────────────────────────────────────────────────────────────┤
│  模型选择:                                                   │
│  ○ 云端 (DeepSeek)    ● 本地 (Ollama 8B)   ○ 模拟           │
│  [锁定模型]  健康状态: ● 正常                                │
│                                                             │
│  问答模式:                                                   │
│  ○ 图谱模式    ● 知识模式    ○ 通用模式                     │
│                                                             │
│  MCP 工具:                                                   │
│  ☑ 图谱查询    ☑ 文物搜索    ☐ 数据分析                     │
└─────────────────────────────────────────────────────────────┘
```

**交互逻辑**：
- 模型切换：立即生效，发送请求到新的模型端点
- 锁定按钮：锁定后无视自动降级逻辑
- 模式切换：变更系统提示词，影响下一条消息
- 工具开关：禁用后 AI 不会收到该工具定义

**任务清单**：
- [ ] 创建 `AIConfigPanel` 组件
- [ ] 实现模型选择器（RadioGroup）
- [ ] 实现锁定按钮（Switch）
- [ ] 实现模式切换（RadioGroup）
- [ ] 实现工具开关组（CheckboxGroup）
- [ ] 配置状态管理（React Context）
- [ ] 配置持久化（localStorage + API 同步）
- [ ] 折叠/展开动画
- [ ] 响应式布局（移动端适配）

**API 依赖**：
```typescript
// 获取当前配置
GET /api/chat/config

// 更新配置
POST /api/chat/config
{
  "mode": "knowledge",      // graph | knowledge | general
  "model": "LOCAL",         // ONLINE | LOCAL | MOCK
  "modelLocked": false,
  "enabledTools": ["query_graph", "search_artifacts"]
}
```
