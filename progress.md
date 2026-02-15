# Artifact Data Dashboard - 项目进度追踪

> **本文档定位**：项目总体进度单一事实来源 (Single Source of Truth)  
> **更新频率**：每日/每周更新（发生变更时立即更新）  
> **最后更新**: 2026-02-16  
> **版本体系**: 语义化版本 (v0.x) + 工作台Phase映射

---

## 📊 统一版本状态

| 版本 | 代号 | 对应原规划 | 状态 | 发布日期 | 主要成果 |
|------|------|-----------|------|---------|---------|
| **v0.0** | Genesis | v0.0 | ✅ 已发布 | 2026-02-15 | 初始基线 |
| **v0.1** | Bronze | v0.1 | ✅ 已发布 | 2026-02-15 | 后端架构重构 |
| **v0.2** | Silver | v0.2 | ✅ 已发布 | 2026-02-16 | 前端Feature重构 + Bug修复 |
| **v0.3** | **Workbench** | WBS Phase 1-2 | 🚧 **当前** | - | 工作台框架 + 左侧探索区 |
| **v0.4** | Porcelain | WBS Phase 3 | 📅 计划中 | 2026-03-05 | 右侧AI助手 + 图像修复 |
| **v0.5** | Integration | WBS Phase 4 | 📅 计划中 | 2026-03-15 | 集成优化 + 性能提升 |
| **v0.6** | Migration | WBS Phase 5 | 📅 计划中 | 2026-03-25 | 遗留迁移 + Node.js 20 |
| **v0.7** | TypeScript | roadmap v0.3 | 📅 未来 | 2026-04-10 | 类型安全迁移 |
| **v0.8** | Polish | roadmap v0.4 | 📅 未来 | 2026-04-25 | UI/UX完善 + 测试覆盖 |

**版本号映射规则**:
```
已完成:  v0.0 → v0.1 → v0.2
进行中:  v0.3 = WBS Phase 1-2 (工作台基础)
计划中:  v0.4 = Phase 3, v0.5 = Phase 4, v0.6 = Phase 5
未来:    v0.7+ = 技术升级和功能增强
```

---

## 🎯 当前版本目标：v0.3 Workbench

**对应 WBS**: Phase 1-2 (工作台框架 + 左侧探索区)  
**预计发布**: 2026-02-25  
**核心目标**: 搭建可运行的统一工作台框架，左侧集成搜索和图谱功能  
**技术规格**: `specs/05-frontend/spec.md` (Workbench章节)

### v0.3 架构愿景

```
┌─────────────────────────────────────────────────────────────┐
│                    统一工作台 (/workbench)                    │
├───────────────────────────┬─────────────────────────────────┤
│                           │                                 │
│    左侧：文物探索          │    右侧：智能助手                │
│                           │                                 │
│  ┌─────────────────────┐  │  ┌───────────────────────────┐  │
│  │   文物搜索           │  │  │    AI 智能问答            │  │
│  │   · 关键词检索       │  │  │    · 三种问答模式         │  │
│  │   · 图片浏览         │  │  │    · MCP工具调用          │  │
│  └─────────────────────┘  │  └───────────────────────────┘  │
│                           │                                 │
│  ┌─────────────────────┐  │  ┌───────────────────────────┐  │
│  │   知识图谱可视化      │  │  │    AI 图像修复            │  │
│  │   · 力导向图         │  │  │    · 破损图像上传         │  │
│  │   · 实体关联         │  │  │    · 修复预览             │  │
│  └─────────────────────┘  │  └───────────────────────────┘  │
│                           │                                 │
└───────────────────────────┴─────────────────────────────────┘
```

### v0.3 任务清单

| Phase | 任务 | 子任务 | 状态 | 负责人 | 预计时间 |
|-------|------|-------|------|--------|----------|
| **Phase 1** | **工作台框架** | | | | **3天** |
| | 1.1 | 创建 WorkbenchLayout 组件 | ⏳ 待开始 | 待分配 | 4h |
| | 1.2 | 实现 ResizableDivider 拖拽 | ⏳ 待开始 | 待分配 | 4h |
| | 1.3 | 配置 Zustand Store | ⏳ 待开始 | 待分配 | 4h |
| | 1.4 | 创建 /workbench 路由 | ⏳ 待开始 | 待分配 | 2h |
| | 1.5 | 面板折叠/展开功能 | ⏳ 待开始 | 待分配 | 4h |
| | 1.6 | URL状态持久化 | ⏳ 待开始 | 待分配 | 4h |
| **Phase 2** | **左侧探索区** | | | | **4天** |
| | 2.1 | 封装 SearchPanel 组件 | ⏳ 待开始 | 待分配 | 8h |
| | 2.2 | 封装 GraphPanel 组件 | ⏳ 待开始 | 待分配 | 8h |
| | 2.3 | 实现选中状态共享 | ⏳ 待开始 | 待分配 | 6h |
| | 2.4 | 搜索与图谱联动 | ⏳ 待开始 | 待分配 | 6h |
| | 2.5 | 响应式适配 | ⏳ 待开始 | 待分配 | 4h |

### v0.3 验收标准

- [ ] `/workbench` 页面可正常访问
- [ ] 左右面板宽度可通过拖拽分隔线调整
- [ ] 左侧面板可在 search/graph/split 模式间切换
- [ ] 点击文物可在右侧触发AI上下文
- [ ] URL自动记录完整状态，链接可直接分享
- [ ] 刷新后布局和选中状态保持

---

## ✅ 已完成工作（历史版本）

### v0.2 Silver - 前端重构（2026-02-16 完成）

**对应**: 原 roadmap v0.2.0 Porcelain (前端架构优化)

| 页面 | 重构前 | 重构后 | 状态 |
|------|--------|--------|------|
| **Chat.js** | 706行 | 217行 | ✅ Feature-based |
| **Attachments.js** | 757行 | 198行 | ✅ Feature-based |
| **AssetLibrary.js** | 721行 | 125行 | ✅ Feature-based |
| **KnowledgeGraph.js** | 1453行 | 413行 | ✅ Feature-based |

**创建 Feature 模块**:
- ✅ `frontend/src/features/chat/`
- ✅ `frontend/src/features/attachments/`
- ✅ `frontend/src/features/asset-library/`
- ✅ `frontend/src/features/knowledge-graph/`

**Bug修复**:
- 🔧 修复 KG 刷新 bug (进行中)
- 🔧 修复 backend barrel 导出命名 (待开始)

### v0.1 Bronze - 后端架构重构（2026-02-15 完成）

**关键成果**:
- ✅ 32个服务文件重新组织到7个子目录（core/kg/ai/infra/utils/tools）
- ✅ 命名统一为 kebab-case
- ✅ 删除重复文件（neo4j-tool.js）
- ✅ 创建 services/index.js barrel 文件
- ✅ 测试通过率：59/76（11个失败与nodejieba原生模块相关）
- ✅ Docker环境验证通过

### v0.0 Genesis - 初始基线（2026-02-15 发布）

**关键成果**:
- ✅ 初始项目结构
- ✅ 基础CRUD功能
- ✅ Docker Compose部署

---

## 🐛 已知问题

### 🔴 高优先级（影响v0.3）

#### 1. 知识图谱点击节点后图谱立即刷新

**现象**:
- 点击节点查看具体信息 → 图谱立即刷新，节点位置重置
- 添加黄标记（Ctrl+点击）→ 图谱立即刷新

**根因**:
```javascript
// useGraphData.js 第104-106行
const displayedGraphData = useMemo(() => {
  return applyTypeLimits(graphData, typeLimits, normalizeType, focusNodeIdRef?.current);
}, [graphData, typeLimits, focusNodeIdRef]);  // ❌ focusNodeIdRef导致问题
```

**修复方案**:
- 移除 `focusNodeIdRef` 依赖，改用 state 管理 focusNodeId
- 或使用深比较稳定数据引用

**相关文件**:
- `frontend/src/features/knowledge-graph/hooks/useGraphData.js`
- `frontend/src/features/knowledge-graph/components/GraphRenderer.js`

**预计修复时间**: 1-2小时  
**状态**: 🔧 待修复（需在v0.3开发前解决）

---

### 🟡 中优先级（技术债务）

#### 2. Backend barrel文件导出命名不匹配

**问题**:
- `backend/src/services/index.js` 导出 `pluginConfig`
- 但 `plugin-config.js` 实际导出 `{ getAiPluginsConfig, getAiPluginsStatus }`

**修复方案**:
```javascript
// 修改前：
const pluginConfig = require('./ai/plugin-config');

// 修改后：
const { getAiPluginsConfig, getAiPluginsStatus } = require('./ai/plugin-config');
```

**预计修复时间**: 10分钟

#### 3. Node.js 16 EOL

**问题**: Node.js 16 将于 2026-04 停止维护

**计划**: v0.6 升级到 Node.js 20 LTS

---

### 🟢 低优先级

#### 4. 测试覆盖率

- 后端单元测试：约60%（59/76通过）
- 前端测试：几乎为零
- 11个失败与 nodejieba 原生模块相关

---

## 📋 下一步行动（按优先级）

### 本周（2月16-22日）

| 优先级 | 任务 | 预计时间 | 完成后标记 |
|--------|------|---------|-----------|
| 🔴 P0 | 修复KG刷新bug | 1-2h | 🐛 → ✅ |
| 🔴 P0 | 修复barrel导出命名 | 10min | 🐛 → ✅ |
| 🟡 P1 | 创建v0.3 Workbench标签 | 5min | 待执行 |
| 🟡 P1 | 开始Phase 1.1: WorkbenchLayout | 4h | ⏳ → 🚧 |

### 下周（2月23-28日）

| 优先级 | 任务 | 预计时间 |
|--------|------|---------|
| 🔴 P0 | 完成Phase 1（工作台框架） | 3天 |
| 🟡 P1 | 开始Phase 2（左侧探索区） | 4天 |

---

## 📅 未来版本规划

| 版本 | 代号 | 对应WBS | 目标 | 预计发布 | 关键交付物 |
|------|------|---------|------|---------|-----------|
| **v0.4** | Porcelain | Phase 3 | 右侧AI助手 | 2026-03-05 | ChatPanel + InpaintPanel |
| **v0.5** | Integration | Phase 4 | 集成优化 | 2026-03-15 | 性能优化 + 移动端适配 |
| **v0.6** | Migration | Phase 5 | 遗留迁移 | 2026-03-25 | Node.js 20 + 旧页面清理 |
| **v0.7** | TypeScript | - | 类型安全 | 2026-04-10 | 核心模块TS迁移 |
| **v0.8** | Polish | - | 完善打磨 | 2026-04-25 | 暗色模式 + 测试覆盖 |

---

## 📚 文档导航

### 按职责查找文档

| 你的角色 | 必读文档 |
|----------|---------|
| **产品经理** | `docs/MRD.md` → `docs/PRD.md` → 本文档 |
| **架构师** | `docs/ARCHITECTURE-v2-workbench.md` → `specs/02-architecture/spec.md` |
| **前端开发** | `specs/05-frontend/spec.md` → `docs/WBS.md` (Phase 1-2) → 本文档 |
| **后端开发** | `specs/04-api-contracts/spec.md` → `specs/06-ai-mcp/spec.md` |
| **新成员** | `AGENTS.md` → 本文档 → `specs/README.md` |

### 按版本查找文档

| 版本 | 需求文档 | 技术规格 | 进度追踪 |
|------|---------|---------|---------|
| **v0.3** | `docs/WBS.md` | `specs/05-frontend/spec.md` | 本文档 |
| **v0.4** | `docs/WBS.md` | `specs/06-ai-mcp/spec.md` | 本文档 |
| **历史** | `docs/PRD.md` | `specs/01-system-overview/spec.md` | `VERSION.md` |

---

## 🎯 决策矩阵

| 如果你有... | 建议行动 | 预期产出 |
|-------------|----------|---------|
| **2小时** | 修复KG刷新bug + barrel命名 | v0.2收尾完成 |
| **1天** | 上述 + 创建v0.3标签 + 开始WorkbenchLayout | v0.3启动 |
| **1周** | 完成Phase 1（工作台框架） | 可拖拽的左右分栏 |
| **2周** | 完成Phase 1-2（工作台基础） | 左侧搜索+图谱集成 |

---

## 📝 最近变更记录

| 日期 | 变更内容 | 类型 | 提交者 |
|------|---------|------|--------|
| 2026-02-16 | 更新为统一版本规划（v0.0-v0.8） | docs | AI Agent |
| 2026-02-16 | 前端重构Phases 4-8完成 | feat | User |
| 2026-02-15 | 后端重构v0.1 Bronze完成 | refactor | AI Agent |
| 2026-02-15 | 创建v0.0 Genesis标签 | release | AI Agent |

---

## ⚠️ 文档维护规则

**更新时机**:
- ✅ 版本发布时 → 更新本表格 + VERSION.md
- ✅ 任务状态变更时 → 更新任务清单
- ✅ 发现新bug时 → 添加到已知问题
- ✅ 计划调整时 → 更新版本规划并记录原因

**提交规范**:
```bash
# 文档更新
git add progress.md
git commit -m "docs: update progress for v0.3 workbench

- Mark v0.2 Silver as completed
- Add v0.3 workbench task breakdown
- Update known issues status"

# 任务完成
git add progress.md
git commit -m "feat: complete Phase 1.1 WorkbenchLayout

- Add resizable divider
- Implement Zustand store
- Update progress.md"
```

**禁止**:
- ❌ 只在对话中说"我们接下来要做X"
- ❌ 只创建临时todo list而不更新本文档
- ❌ 让进度只存在于某个agent的上下文中

---

*本文档由AI助手和开发团队共同维护*  
*如有疑问，先查本文档，再查AGENTS.md，最后问人*
