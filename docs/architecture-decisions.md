# 文物大数据与人工智能集成系统 — 架构决策记录 (ADR)

> **文档状态：进行中**
> 记录截至 2026-04-13 的架构决策，每个决策附推理过程、假设和风险。

---

## 已确认的决策

### ADR-001: Python FastAPI 单服务架构

**状态：已确认**

**背景：** 原 PRD 采用 Node.js(Express) + Python(FastAPI/LangChain) 双后端微服务架构。

**决策：** 砍掉 Node.js 服务，统一使用 Python FastAPI 单服务。

**理由：**
1. LangChain、LightRAG 均为 Python 原生，Python 服务不可避免
2. FastAPI 能覆盖所有 Node.js/Express 的功能（REST API、SSE、WebSocket、文件上传、认证）
3. 单服务消除了服务间通信开销（特别是 SSE 流式转发的问题）
4. 减少一半的容器数、依赖管理和调试复杂度

**假设：**
- [H1] LangChain/LightRAG 是核心组件，Python 不可避免 ✓
- [H2] 开发者能在 LLM 辅助下使用 Python/FastAPI ✓（开发者有 Python 经验）

**风险：**
- 无显著风险

---

### ADR-002: SQLite + Neo4j 数据层（砍掉 MySQL 和 Redis）

**状态：已确认**

**背景：** 原 PRD 使用 MySQL + Redis + Neo4j 三个数据库。

**决策：** MVP 阶段用 SQLite 替代 MySQL，直接砍掉 Redis。

**理由：**
1. SQLite 零配置、零容器、单文件，适合单人演示场景
2. SQLAlchemy ORM 同时兼容 SQLite 和 MySQL/PostgreSQL，升级只需改配置
3. Redis 在 MVP 阶段的三个用途（会话缓存、AI 模式状态、MCP 状态）均可替代：
   - 会话缓存 → 直接查 SQLite（万级数据毫秒响应）
   - AI 模式状态 → 配置变量
   - MCP 状态 → 配置变量
4. 容器数从 6 个降至 3 个（前端 + FastAPI + Neo4j）

**假设：**
- [H3] 答辩演示时为单人或少量用户操作，不会触发 SQLite 写并发限制
- Neo4j 使用 Community Edition（免费，单机）

**风险：**
- 如果答辩需要多人同时操作（不太可能），需升级到 PostgreSQL
- SQLite 的全文检索（FTS5）不如 MySQL FULLTEXT，但够用

**升级路径：** SQLAlchemy ORM 使得从 SQLite 迁移到 PostgreSQL 只需修改连接字符串。

---

### ADR-003: LightRAG + LangChain Agent 的 LLM 集成方案

**状态：待实验验证**

**背景：** 需要在多种 LLM + 知识图谱集成方案中选择。候选方案：普通 RAG、LightRAG、GraphRAG、Tool Calling、Text-to-Cypher。

**决策：** 采用 LightRAG + LangChain Agent 混合方案。
- LightRAG：从维基百科文物描述文本中抽取语义关联，构建增强图谱
- LangChain Agent：编排查询流程（何时走 LightRAG 语义检索，何时走结构化查询）

**理由：**
1. 纯结构化数据（名称、年代、材质）语义太薄，无法支撑多跳推理（已由开发者实际验证）
2. LightRAG 从描述文本中抽取的语义关联（工艺、纹饰、文化意义）能弥补结构化数据的不足
3. LightRAG 原生支持 Neo4j 作为图存储后端（`graph_storage="Neo4JStorage"`），与结构化图谱共享同一个 Neo4j 实例
4. LangChain Agent 提供透明的工具调用过程，符合"可观察、可干预"的设计理念

**假设：**
- [H4] 维基百科文物描述文本中有足够的语义信息供 LightRAG 抽取有价值的关系
- [H5] LightRAG + Neo4j 的集成在实际使用中稳定可用
- [H6] LangChain Agent 能直接调用 LightRAG query 作为 Tool（需验证）

**风险：**
- [R5] 500件文物×几百字描述，LightRAG 能抽取到多少有价值的语义关联？需实验验证
- [R7] LightRAG 索引 500 条数据需要 30-60 分钟（非 thinking 模型），时间成本可接受
- [R8] LangChain + LightRAG 的集成路径成熟度不确定，可能需要自行编写桥接

**实验计划：**
- 对比普通 RAG（FAISS + 向量检索）vs LightRAG 在 15 个测试问题上的表现
- 测试问题分三层：简单事实(5)、单跳关联(5)、多跳推理(5)
- 用实验结果最终确认是否采用 LightRAG

---

### ADR-004: 数据源策略——维基百科 + Wikidata

**状态：已确认**

**背景：** 开发者之前使用百度百科爬取 500 件文物数据，语义信息太薄。

**决策：** 改用维基百科（Wikipedia）作为主要描述文本来源，Wikidata 作为结构化属性来源。

**理由：**
1. 维基百科中文文物词条的语义丰富度显著高于百度百科：
   - 工艺描述：有完整章节（铸造技术、装饰工艺）
   - 历史背景：考古背景、文化意义详尽
   - 纹饰描述：系统描述饕餮纹、云雷纹等
   - 关联信息：同批出土、同类器物、同时代文物
2. Wikidata 提供结构化三元组数据，可直接导入 Neo4j，无需 LLM 抽取
3. 两者互补：Wikidata 提供结构化属性，维基百科提供语义丰富的描述文本

**数据获取优先级：**
```
第1层：维基百科分类页面 → 文物列表 + 详细描述（LightRAG 输入）
第2层：Wikidata SPARQL → 结构化属性（直接导入 Neo4j）
第3层：故宫数字文物库 → 补充官方图片和分类
第4层：（后续）学术论文 → 深度语义补充
```

**数据量目标：** 800-1000 条深度数据（青铜器 100+、瓷器 100+、其他 200+、重点文保单位 500+）

**爬取技术：**
- 维基百科：requests + BeautifulSoup
- Wikidata：SPARQLWrapper
- 故宫数字库：Selenium（动态加载）

**风险：**
- 维基百科中文文物词条覆盖度可能不够（某些小众文物可能没有独立词条）
- 维基百科的 robots.txt 需要遵守，控制爬取频率

---

## 待决策项

### ADR-005: 前端框架——Vite + React + TypeScript + Ant Design

**状态：已确认**

**背景：** 需要选择前端框架，核心标准是"LLM 辅助编码效率最高"。

**决策：** 使用 Vite + React + TypeScript + Ant Design。

**理由：**
1. LLM 训练数据中 React + Ant Design 的代码量最大，生成质量最高
2. Vite 启动毫秒级（vs CRA 几十秒），改代码后快速验证
3. TypeScript 帮助 LLM 减少类型错误
4. 轻量脚手架 = LLM 容易理解和修改，不受 Ant Design Pro 等重型框架的约定约束
5. 浏览器自动化测试可用 Playwright MCP + Chrome DevTools MCP

**LLM 自主测试能力：**
- 能做：编译检查、页面能否打开、按钮能否点击、控制台报错检测、截图
- 不能做：判断视觉效果、布局美观度（需人工确认）

**假设：**
- [H8] Vite + React + TS 的简单脚手架能让 LLM 高效生成前端代码

**风险：**
- [R9] React 18+ 的复杂性（Server Components 等）可能造成困惑。规避方式：MVP 用纯 SPA，不用 SSR

**升级路径：** 如果后续需要 SSR/SEO，可迁移到 Next.js，Ant Design 组件代码可复用。

---

### ADR-006: 图像修复插件——IOPaint

**状态：已确认**

**背景：** 白皮书将图像修复定位为"第一个 MCP Tool"，用于验证系统可扩展性。

**决策：** IOPaint + LaMa 算法。

**方案要点：**
- LaMa（Resolution-robust Large Mask Inpainting）— 大面积破损修复效果好
- 集成流程：文物详情 → 绘制遮罩 → 调用 IOPaint API → 前后对比展示
- 演示素材：从完好文物照片出发，用 PIL 人为添加破损效果，展示三图对比（破损→修复→原始）
- 答辩定位：以图像修复为例，展示第三方 AI 工具如何作为插件集成到平台

**假设：**
- [H9] IOPaint + LaMa 在 CPU 上的修复速度可接受（单张 < 30 秒）
- [H10] 人为添加的破损效果足够逼真，不会在答辩时被质疑

**风险：**
- [R10] IOPaint 依赖 PyTorch，Docker 镜像较大（~2GB）
- [R11] 如果答辩现场网络不好，需要本地模型文件（需提前下载）

---

### ADR-007: 多模态附件管理

**状态：已确认**

**背景：** 系统定位为"集成平台"，多模态数据管理是核心能力。

**决策：** MVP 实现图片上传/展示 + 元数据存储。

**MVP 范围：**
- 文物详情页展示多张图片（画廊组件）
- 图片上传功能 + 附件元数据（文件名、类型、大小、上传时间）
- 本地文件系统存储（`data/uploads/`），后续可升级到 MinIO/OSS

**不做（后续扩展）：** 3D 模型、视频、OCR、元数据标准（Dublin Core/CDWA）

---

### ADR-008: 部署方案——Docker Compose

**状态：已确认**

**背景：** 需要一种简单的部署方式，支持答辩演示一键启动。

**决策：** Docker Compose 编排 3 个容器：Nginx（前端静态文件 + 反向代理）、FastAPI、Neo4j。

**理由：**
1. 一条命令 `docker compose up` 启动全部服务
2. 容器隔离保证环境一致性
3. Nginx 反向代理解决 CORS，无需额外配置

**假设：**
- [H11] 答辩现场电脑可运行 Docker Desktop（需提前确认）
- [H12] Neo4j Community Edition 单机模式足够（无集群需求）

**风险：**
- [R12] Neo4j + IOPaint（如果独立容器化）会增加镜像体积
- [R13] 如果答辩电脑性能不足（<8GB RAM），可能需要调整 Neo4j 内存限制

---

### ADR-009: MVP 功能范围（最终裁剪）

**状态：已确认**

**背景：** 原 PRD 包含 9 大功能模块，远超 2 周开发能力。需要在"够用"和"能答辩"之间找到平衡点。

**决策：** MVP 包含 7 个模块。详细规格见 [`MVP-scope.md`](MVP-scope.md)。

**7 个模块：** 文物管理、知识图谱、AI 智能问答（P0）+ 统计面板、附件管理、图像修复插件、用户认证（P1）。

**理由：**
- P0 三个模块是核心差异化能力（知识图谱 + LLM 融合），不可削减
- 统计面板保留：作为首页/入口，展示数据全貌，答辩第一印象
- 附件管理 + 图像修复：体现"集成平台"的可扩展架构理念
- 用户认证：JWT 轻量实现，保证基本安全性

**假设：**
- [H13] LLM 辅助编码效率足够高，单人能在 2 周内完成
- [H14] LightRAG 索引构建可在离线阶段完成，不影响演示

**风险：**
- [R14] LightRAG 集成复杂度可能超预期（备选：降级为普通 RAG）
- [R15] 前端开发可能成为瓶颈（开发者不熟悉前端，依赖 LLM 生成）

---

### ADR-010: 项目目录结构

**状态：已确认**

**决策：** 前后端分离的 monorepo 结构。

**结构概要：**
- `backend/app/` — FastAPI 应用（api/ services/ models/ schemas/ ai/ plugins/）
- `frontend/src/` — React SPA（pages/ components/ services/）
- `data/` — 爬取的原始 JSON 数据
- `scripts/` — 数据导入和索引构建脚本
- `docker-compose.yml` — 三容器编排

**设计原则：**
1. `api/` 只做路由和参数校验，业务逻辑在 `services/`
2. `ai/` 独立于业务逻辑，方便后续替换（如 LightRAG → GraphRAG）
3. `plugins/` 按插件隔离，每个插件一个文件，可独立启用/禁用

---

### ADR-011: 认证方案——JWT 轻量认证

**状态：已确认**

**背景：** 需要基本的用户认证，但不能引入复杂权限系统。

**决策：** JWT + 两级角色（admin/viewer）。

**方案要点：**
- `python-jose` + `passlib[bcrypt]`，集成代码量极小
- 初始通过脚本创建 admin 账户（不做注册页面）
- JWT 无状态，不需要 Redis 存储 session（与 ADR-002 一致）
- 过期时间 24h（MVP 可接受无法主动失效的局限）

### ADR-012: 前端设计工具

**状态：已确认**

**背景：** 开发者不擅长前端设计，需要低成本产出专业外观。

**决策：** Ant Design Pro 模板 + Stylebot 浏览器扩展微调 + Playwright MCP 自动化验证。

**流程：**
1. 基于 Ant Design Pro 脚手架创建项目（专业布局，0 设计成本）
2. 开发过程中用 Stylebot 在浏览器中实时微调 CSS（颜色、间距、字号）
3. 确认效果后将 Stylebot 修改的 CSS 写入代码
4. 用 Playwright MCP 自动截图验证页面效果

**理由：**
1. Ant Design Pro 提供 ProLayout（侧边栏 + 面包屑 + 标签页），开箱即用
2. 无需 Figma 等设计工具，减少工作流环节
3. LLM 可通过 Playwright MCP 直接截图验证前端效果

**风险：**
- [R16] 不做专门设计可能导致视觉平庸。缓解：答辩重点是功能和技术架构，不是 UI

### ADR-013: 聊天右侧面板——GraphRAG vs RAG 待测决策

**状态：待测**

**背景：** PRD 3.5.3 最初定义为"知识图谱面板"（GraphRAG 思路），Demo 实现为"RAG 知识检索详情面板"（普通 RAG 思路）。两者定位不同，不确定哪种效果更好。

**决策：** MVP 先实现基础版右侧面板（展示检索结果 + 引用来源），预留 GraphRAG 接口。后续做对比测试（LightRAG 普通检索 vs GraphRAG 图谱增强检索）再定最终方案。

**理由：**
1. GraphRAG 需要先构建高质量的 Neo4j 图谱，当前图谱数据尚不完整
2. 普通 RAG（LightRAG 向量检索）链路更短，MVP 可快速验证
3. 两种方案的对比实验本身可作为大创论文的实验内容

**假设：**
- [A13-1] LightRAG 的向量检索质量足够支撑基础问答
- [A13-2] GraphRAG 在多跳关系查询（如"哪些文物出土于同一遗址"）上可能表现更好

**风险：**
- [R17] 如果 GraphRAG 效果显著更好，面板需要重构。缓解：面板设计保持抽象，数据源可切换

---

## 架构总览（最终确认）

```
┌──────────────────────────────────────┐
│    React + Ant Design Pro + Vite     │  前端（ADR-005, ADR-012）
│  ┌────────┬────────┬───────┬───────┐ │
│  │文物列表 │知识图谱 │AI问答  │图像修复│ │
│  │+ 详情  │D3.js   │SSE流式 │IOPaint│ │
│  └────────┴────────┴───────┴───────┘ │
└───────────────┬──────────────────────┘
                │ HTTP / SSE / WebSocket
┌───────────────▼──────────────────────┐
│          Python FastAPI               │  单后端（ADR-001）
│  ┌───────────┐  ┌──────────────────┐ │
│  │ 业务 API  │  │    AI 引擎       │ │
│  │ CRUD      │  │ LangChain Agent  │ │
│  │ JWT 认证  │  │ + LightRAG       │ │
│  │ 附件管理  │  │ SSE 流式输出     │ │
│  └───────────┘  └──────────────────┘ │
│  ┌───────────┐                        │
│  │ 插件系统  │  IOPaint (ADR-006)     │
│  └───────────┘                        │
└───┬───────────────────┬──────────────┘
    │                   │
┌───▼────┐         ┌───▼─────────────┐
│SQLite  │         │     Neo4j       │
│文物元数据│        │ 结构化三元组     │ ← Wikidata（ADR-004）
│用户/认证│         │ +               │
│附件记录 │         │ LightRAG        │ ← Wikipedia 描述抽取
│        │         │ 语义关联         │
└────────┘         └─────────────────┘

容器数：3（前端 Nginx + FastAPI + Neo4j）→ Docker Compose（ADR-008）
```

**已确认决策汇总：**

| 编号 | 决策 | 状态 |
|------|------|------|
| ADR-001 | Python FastAPI 单服务 | 已确认 |
| ADR-002 | SQLite + Neo4j，砍掉 MySQL/Redis | 已确认 |
| ADR-003 | LightRAG + LangChain Agent | 待实验验证 |
| ADR-004 | 维基百科 + Wikidata 数据源 | 已确认 |
| ADR-005 | Vite + React + TypeScript + Ant Design | 已确认 |
| ADR-006 | IOPaint + LaMa 图像修复插件 | 已确认 |
| ADR-007 | 图片上传/画廊 + 附件元数据 | 已确认 |
| ADR-008 | Docker Compose 三容器部署 | 已确认 |
| ADR-009 | MVP 7 模块（含统计面板），详见 MVP-scope.md | 已确认 |
| ADR-010 | 前后端分离 monorepo 目录结构 | 已确认 |
| ADR-011 | JWT 两级角色认证 | 已确认 |
| ADR-012 | Ant Design Pro + Stylebot + Playwright | 已确认 |
| ADR-013 | 聊天右侧面板 GraphRAG vs RAG 待测 | 待测 |

> 详细功能范围、排期和演示路径见 [`MVP-scope.md`](MVP-scope.md)

---

*最后更新：2026-04-14*
