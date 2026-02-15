# 项目规格文档

> **重构说明**：本文档体系于 2026-02-13 彻底重写，替代所有历史需求文档（001-xxx 等）。
> 
> 每个模块下包含两个文件：
> - **spec.md** —— 需求规格、设计规范（应该是什么样）
> - **progress.md** —— 实现进度、已知问题、债务清单（现在是什么样）

---

## 文档地图

| 目录 | spec.md（需求） | progress.md（进度） | 当前状态 |
|------|-----------------|---------------------|----------|
| [01-system-overview](./01-system-overview/) | 项目定位、用户场景、功能需求、**工作台架构** | 功能完成度、数据现状、迭代路线图 | 🚧 **新架构重写中** |
| [02-architecture](./02-architecture/) | 分层架构、组件职责、通信协议、**工作台状态管理** | 架构实现状态、性能基线 | 🚧 **待更新** |
| [03-data-model](./03-data-model/) | 核心+扩展数据模型、图谱双视图、**百度百科数据源** | 模型实现状态、同步问题 | 🚧 扩展模型待实现 |
| [04-api-contracts](./04-api-contracts/) | API 规范、接口定义、错误码 | API 实现状态、分页缺失问题 | ✅ 基本稳定 |
| [05-frontend](./05-frontend/) | **Workbench 组件规格**、代码规范、**左右面板设计** | 组件状态、**工作台迁移进度** | 🚧 **工作台最高优先级** |
| [06-ai-mcp](./06-ai-mcp/) | **三种问答模式**、MCP 协议、**右侧AI助手集成** | **ChatPanel 迁移中**、工具清单 | 🚧 **v0.3 核心任务** |
| [07-deployment](./07-deployment/) | Docker 配置、备份策略、**一键部署优化** | 部署状态、排查清单 | ✅ 稳定 |
| [08-external-apis](./08-external-apis/) | **图像修复 API 调研**、**统一 API 配置** | - | 📋 调研完成 |
| [08-external-apis/aliyun-inpainting-setup.md](./08-external-apis/aliyun-inpainting-setup.md) | **阿里云 API 接入教程** | - | 📖 教程 |
| [05-frontend/graph-visualization-scheme-c.md](./05-frontend/graph-visualization-scheme-c.md) | **方案 C 详细设计**（已确认） | - | ✅ 设计确认 |
| [03-data-model/baidu-data-migration-assessment.md](./03-data-model/baidu-data-migration-assessment.md) | **数据迁移评估** | - | 📋 待决策 |
| **📖 新架构参考文档** | | | |
| [docs/ARCHITECTURE-v2-workbench.md](../docs/ARCHITECTURE-v2-workbench.md) | **工作台架构设计概要** | - | 📖 **必读** |
| [docs/WBS.md](../docs/WBS.md) | **阶段规划与任务分解 (v0.1-v0.5)** | - | 📖 **必读** |

---

## 快速导航

### 我是新接手的负责人

**新架构核心理念**：工作台为中心的一站式文物研究平台

阅读顺序：
1. **[docs/ARCHITECTURE-v2-workbench.md](../docs/ARCHITECTURE-v2-workbench.md)** —— **先读新架构概要**，理解"左探索+右助手"的设计理念
2. [01-system-overview/spec.md](./01-system-overview/spec.md) —— 项目定位、用户场景、功能需求
3. [05-frontend/spec.md](./05-frontend/spec.md) —— **前端规格**：Workbench 组件架构、左右面板设计
4. [06-ai-mcp/spec.md](./06-ai-mcp/spec.md) —— AI 设计：三种问答模式、MCP 协议、右侧 AI 助手集成

### 我要开发工作台

**核心目标**：从多页面架构迁移到统一工作台 (`/workbench`)

**按当前阶段选择**：

| 当前阶段 | 查看文档 |
|----------|----------|
| **Phase 1 (v0.1)** 框架搭建 | [05-frontend/spec.md](./05-frontend/spec.md) WorkbenchLayout 组件规格 |
| **Phase 2 (v0.2)** 左侧探索区 | [05-frontend/spec.md](./05-frontend/spec.md) SearchPanel + GraphPanel 设计 |
| **Phase 3 (v0.3)** 右侧AI助手 | [06-ai-mcp/spec.md](./06-ai-mcp/spec.md) ChatPanel + InpaintPanel 集成 |
| **Phase 4 (v0.4)** 集成优化 | [05-frontend/progress.md](./05-frontend/progress.md) 性能优化、状态持久化 |
| **Phase 5 (v0.5)** 遗留迁移 | [05-frontend/progress.md](./05-frontend/progress.md) 旧路由重定向、组件清理 |

**详细任务分解**：[docs/WBS.md](../docs/WBS.md) —— 完整的 5 阶段工作分解结构

### 我要排查问题

| 问题类型 | 查看文档 |
|----------|----------|
| 服务起不来 | [07-deployment/progress.md](./07-deployment/progress.md) 常见问题排查 |
| API 报错 | [04-api-contracts/spec.md](./04-api-contracts/spec.md) 错误码速查 |
| 数据不一致 | [03-data-model/progress.md](./03-data-model/progress.md) 同步问题说明 |
| AI 不响应 | [06-ai-mcp/progress.md](./06-ai-mcp/progress.md) 故障排查 |
| 前端报错 | [05-frontend/progress.md](./05-frontend/progress.md) 已知问题 |

---

## 项目关键信息速查

### 技术栈

- **后端**：Node.js 16 + Express 4（计划升级到 20）
- **前端**：React 18 + Ant Design 5（计划迁移到 Vite）
- **数据库**：MySQL 8 + Neo4j 4.4 + Redis 7.2
- **AI**：Ollama（本地）/ DeepSeek（云端）
- **部署**：Docker Compose

### 数据现状

| 数据类型 | 数量 | 质量 | 说明 |
|----------|------|------|------|
| 文物基础记录 | 2485 条 | 🟡 中 | 部分字段缺失 |
| 保护修复记录 | **0 条** | 🔴 无 | **尚未采集** |
| 人物实体 | ~200 条 | 🟢 好 | - |
| 地点实体 | ~50 条 | 🟢 好 | - |

**数据迁移计划**：弃用深圳博物馆数据，改用**百度百科数据**（50,000+ 文物，详见 [03-data-model/baidu-encyclopedia-datasource.md](./03-data-model/baidu-encyclopedia-datasource.md)）

**结论**：当前只启用**本体视图**，保护修复插件待数据补充后开放。

### 端口映射（开发环境）

| 服务 | 主机端口 | 说明 |
|------|----------|------|
| 前端 | 8080 | React 开发服务器 |
| 后端 | 3000 | REST API |
| MySQL | 13306 | 数据库 |
| Neo4j | 17474/17687 | 图数据库 |
| Redis | 16379 | 缓存 |
| Ollama | 11434 | 本地 LLM |

### 阶段规划（v0.1-v0.5）

**主题**：工作台为中心的功能集成系统

| 阶段 | 版本 | 目标 | 预计周期 |
|------|------|------|----------|
| **Phase 1** | v0.1 | 工作台框架 | 3天 |
| **Phase 2** | v0.2 | 左侧探索区（搜索+图谱） | 4天 |
| **Phase 3** | v0.3 | 右侧AI助手（问答+图像修复） | 4天 |
| **Phase 4** | v0.4 | 集成优化（性能、移动端） | 3天 |
| **Phase 5** | v0.5 | 遗留迁移（旧页面清理） | 1天 |

**详细任务分解**：[docs/WBS.md](../docs/WBS.md) —— 包含完整的任务依赖、验收标准、检查清单

---

## 核心设计决策

### 1. 插件化架构

```
核心系统（始终启用）
├── 资产管理
├── 知识图谱（本体视图）
└── AI 问答

扩展插件（可选启用）
├── 文物保护修复（需修复数据支持）
├── 图像修复（Inpainting）
└── 统计分析
```

### 2. 知识图谱双视图

| 视图 | 节点 | 用途 |
|------|------|------|
| 本体视图 | 文物、人物、地点、朝代 | 博物馆研究 |
| 保护修复视图 | 损害类型、修复技术、材料 | 文物保护修复 |

**当前**：只启用本体视图（保护修复数据为 0）

### 3. AI 问答三种模式

| 模式 | 说明 | 示例 |
|------|------|------|
| **图谱模式** | 只查图谱，回答事实 | "哪些唐代青铜器在故宫？" |
| **知识模式** | 查图谱→归纳知识 | "唐代青铜器有什么特点？" |
| **通用模式** | AI 自由回答 | "青铜器制作工艺简介" |

**关键**：用户可在聊天界面**实时切换**模式和工具开关。

### 4. 图像修复 API（已确认）

**选择**：阿里云视觉智能开放平台

**理由**：
- 国内访问稳定
- 价格便宜（0.01元/次起）
- 功能丰富（去水印、人脸修复、超分、上色）

**接入教程**：[aliyun-inpainting-setup.md](./08-external-apis/aliyun-inpainting-setup.md)

### 5. 知识图谱可视化（已确认）

**选择**：方案 C（动态聚合 + 鱼眼视图）

**特点**：
- 核心节点始终显示
- 周围节点按属性聚合
- 鼠标聚焦区域自动放大

**详细设计**：[graph-visualization-scheme-c.md](./05-frontend/graph-visualization-scheme-c.md)

### 6. API 配置管理（待实现）

**策略**：先平台统一管理，v0.7 支持用户自定义

**配置层级**：
1. 用户自定义 API（如有）
2. 系统默认 API（兜底）

**规格**：[unified-api-config.md](./08-external-apis/unified-api-config.md)

### 7. 数据迁移（待评估）

**方向**：弃用深圳博物馆数据，改用百度百科数据

**方案**：渐进式迁移（方案 C）
- 第一批：Top 5 博物馆（1周）
- 第二批：再 10 个博物馆（1周）
- 后续：批量自动化处理

**评估报告**：[baidu-data-migration-assessment.md](./03-data-model/baidu-data-migration-assessment.md)

### 8. 工作台架构（新架构核心）

**核心理念**：从分散的多页面架构迁移到统一工作台界面

**布局设计**：
```
┌─────────────────────────────────────────────────────────────┐
│                    统一工作台 (Workbench)                      │
├───────────────────────────┬─────────────────────────────────┤
│    左侧：文物探索          │    右侧：智能助手                │
│  ┌─────────────────────┐  │  ┌───────────────────────────┐  │
│  │   文物搜索           │  │  │    AI 智能问答            │  │
│  │   · 关键词检索       │  │  │    · 三种问答模式         │  │
│  │   · 图片浏览         │  │  │    · MCP工具调用          │  │
│  └─────────────────────┘  │  └───────────────────────────┘  │
│  ┌─────────────────────┐  │  ┌───────────────────────────┐  │
│  │   知识图谱可视化      │  │  │    AI 图像修复            │  │
│  │   · 力导向图         │  │  │    · 阿里云API集成        │  │
│  │   · 实体关联         │  │  │    · 前后对比预览         │  │
│  └─────────────────────┘  │  └───────────────────────────┘  │
└───────────────────────────┴─────────────────────────────────┘
```

**关键特性**：
- **统一入口**：所有功能集中在 `/workbench` 路由
- **左右联动**：选中文物自动触发右侧 AI 关联问答
- **状态持久化**：面板模式、选中状态可通过 URL 分享
- **可拖拽布局**：用户可自由调整左右面板宽度

**详细设计**：[docs/ARCHITECTURE-v2-workbench.md](../docs/ARCHITECTURE-v2-workbench.md)

---

## 状态标识

本文档使用以下标识：

- ✅ **已完成**：已实现且稳定的功能
- 🚧 **半吊子**：已实现但有问题或不完善
- ❌ **欠账**：计划但未实现的功能
- 💀 **技术债务**：已知需要重构的代码

---

## 更新记录

| 日期 | 变更 |
|------|------|
| 2026-02-15 | **新架构重写**：从多页面架构迁移到工作台为中心的设计，更新文档地图、快速导航、阶段规划 |
| 2026-02-15 | 新增核心设计决策第 8 条：工作台架构（Workbench Architecture） |
| 2026-02-15 | 引用新架构文档：[docs/ARCHITECTURE-v2-workbench.md](../docs/ARCHITECTURE-v2-workbench.md)、[docs/WBS.md](../docs/WBS.md) |
| 2026-02-15 | 更新里程碑规划：从 v0.6 改为 v0.1-v0.5 五阶段工作台开发计划 |
| 2026-02-13 | 彻底重构，删除所有旧文档（001-xxx 等），建立新体系 |
| 2026-02-13 | 每个模块拆分为 spec.md（需求）和 progress.md（进度）|
| 2026-02-13 | 根据用户输入更新：明确插件化架构、AI 三种模式、用户可控配置 |
| 2026-02-13 | 新增 08-external-apis：图像修复 API 调研、统一 API 配置规格 |
| 2026-02-13 | 新增 05-frontend/graph-visualization-options.md：知识图谱可视化三方案 |
| 2026-02-13 | 新增 05-frontend/graph-visualization-scheme-c.md：方案 C 详细设计（已确认） |
| 2026-02-13 | 新增 03-data-model/baidu-encyclopedia-datasource.md：百度百科数据规格 |
| 2026-02-13 | 新增 03-data-model/baidu-data-migration-assessment.md：数据迁移评估 |
| 2026-02-13 | 新增 08-external-apis/aliyun-inpainting-setup.md：阿里云 API 接入教程 |

---

## 如何更新本文档

**原则**：代码改完后必须同步更新文档。

**流程**：
1. 修改代码
2. 测试验证
3. 更新对应模块的 `spec.md` 或 `progress.md`
   - 改功能 → 更新 `spec.md`
   - 改进度/修复问题 → 更新 `progress.md`
4. 提交时注明 "docs: xxx"

**注意**：不要让文档和代码再次分道扬镳，这是屎山的根源之一。
