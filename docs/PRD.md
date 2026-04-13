# 文物大数据与人工智能集成系统 — 产品需求文档 (PRD)

---

## 1. 项目背景与目标

### 1.1 背景

文化遗产数字化是国家文化战略的重要方向。传统的文物数据管理以表格录入为主，缺乏关联分析、智能检索和可视化探索能力。

### 1.2 项目定位

**文物大数据与人工智能集成系统** — 一个人机协作的文化遗产数据平台。让人类专家和 AI 助手共享同一套工具：数据查询、知识图谱、图像修复等功能，既有直观的界面面板，也有标准化接口（MCP）供 AI 调用，协作过程完全透明。

核心哲学：**AI 不是黑盒顾问，而是可观察、可干预的协作者。**

### 1.3 目标

1. 建立统一的文物数据管理平台，覆盖数据录入、检索、统计、导出全流程
2. 构建基于 Neo4j 的文物知识图谱，支持实体关系可视化和交互式探索
3. 提供基于大语言模型（LLM）的智能问答能力，支持多种推理模式
4. 所有功能同时暴露为 MCP Tool，供 AI Agent 调用，人机共享同一数据和服务层

---

## 2. 用户角色与权限

### 2.1 角色定义

| 角色 | 标识 | 说明 |
|------|------|------|
| 管理员 | `admin` | 拥有系统全部权限，包括用户管理、系统配置、AI 模式控制等 |
| 普通用户 | `user` | 可使用文物数据查看、知识图谱、智能问答等功能，部分写操作受限 |

---

## 3. 功能模块详细需求

### 3.1 用户认证与账户管理

#### 3.1.1 登录与注册

- **登录页面**：左右分栏布局，左侧展示系统介绍，右侧提供登录/注册 Tab 切换
- **用户注册**：需填写用户名、邮箱、密码（至少 8 位，需包含字母和数字）、确认密码
- **用户登录**：支持用户名/邮箱 + 密码登录；登录成功后获取 JWT Token，跳转到首页
- **会话管理**：JWT 认证，Token 通过 HTTP Header 传递

#### 3.1.2 个人中心

- **基本信息**：展示和编辑用户信息（用户名、邮箱、机构、职称、简介）
- **修改密码**：输入旧密码和新密码完成修改
- **API 配置**：配置个人的 AI 服务 API Key（支持 openai / ollama / deepseek），包括 API Key、Base URL、模型名称

---

### 3.2 文物数据管理

#### 3.2.1 文物列表与检索

- **文物列表**：分页展示所有文物记录，支持按页码和每页数量切换
- **文物搜索**：支持按关键词搜索（全文检索，SQLite FTS5 覆盖 name、description、tags 字段）
- **字段筛选**：支持按类别（category）、年代（era）、地点（location）筛选
- **排序**：支持按名称、创建时间排序

#### 3.2.2 文物详情与编辑

- **文物详情**：展示文物的全部字段（名称、描述、类别、年代、出土地点、图片、标签等）
- **文物创建**：填写文物信息创建新记录
- **文物更新**：修改已有文物记录
- **文物删除**：删除文物记录（管理员或创建者）

#### 3.2.3 文物数据模型

文物（artifacts）表核心字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER (PK) | 自增主键 |
| name | VARCHAR(255) | 文物名称 |
| description | TEXT | 文物描述 |
| category | VARCHAR(50) | 类别 |
| era | VARCHAR(50) | 年代 |
| location | VARCHAR(100) | 出土地点 |
| image_url | VARCHAR(255) | 图片链接 |
| tags | TEXT | 标签（逗号分隔） |

---

### 3.3 知识图谱

#### 3.3.1 图谱可视化

- **力导向图渲染**：基于 D3.js 的 SVG 力导向图，支持节点拖拽、缩放、平移
- **加载全图**：一键加载 Neo4j 中全部节点和关系
- **关键词搜索**：输入关键词搜索图谱中的节点，支持深度参数（1-3 层关系扩展）
- **节点点击详情**：点击节点弹出实体详情面板，展示该实体的完整属性和关联关系
- **节点高亮**：搜索命中的节点以高亮样式突出显示
- **类型过滤面板**：按节点类型设置显示数量上限
- **力导向参数调节**：可调节斥力强度、连接距离、碰撞半径等参数

#### 3.3.2 图谱数据服务

- **按关键词搜索**：`GET /api/graph/search?keyword=xxx&depth=1`
- **加载全图**：`GET /api/graph/full`
- **实体详情**：`GET /api/graph/entity/:type/:id`

#### 3.3.3 Neo4j 图谱节点类型

| Label | 属性 | 说明 | MVP |
|-------|------|------|-----|
| Artifact | id, name, description, tags | 文物 | ✅ |
| Category | name, description | 类别 | ✅ |
| Era | name, startYear, endYear | 年代 | ✅ |
| Location | name, region | 地点 | ✅ |
| Material | name, description | 材质 | ✅ |

关系类型：属于类别、属于年代、出土于、制作材料等。

---

### 3.4 智能问答（AI 对话）

#### 3.4.1 聊天界面

- **双栏布局**：左侧聊天区 + 右侧 RAG 知识面板
- **会话管理**：创建/切换/重命名/删除会话，会话列表显示标题、消息数、最后更新时间
- **消息展示**：
  - 用户消息气泡
  - AI 回复含三阶段展示：**Thinking**（可折叠）→ **Tool Call**（检索指示条）→ **回答内容**（流式打字动画）
  - 工具调用展示：工具名称、查询参数、执行结果数量、耗时
  - 参考来源列表
- **消息输入**：文本输入区 + 发送按钮 + 停止生成按钮

#### 3.4.2 AI 配置

- **模型选择**：选择 AI 模型（ONLINE / LOCAL）
- **MCP 工具开关**：启用/禁用 AI 工具调用能力
- **模式选择**：tool_calling / pre_retrieve

#### 3.4.3 RAG 知识面板（聊天右侧）

> **注意**：面板最终形态（GraphRAG 图谱面板 vs RAG 检索面板）待对比测试后确定（ADR-013）。MVP 先实现基础检索面板。

- **Thinking 详情**：展示 AI 推理过程（可折叠），包括检索策略和语义扩展
- **Tool Calling 详情**：展示工具调用参数、检索结果（含相似度、来源）
- **引用结果**：列出最终回答引用的来源文物和数据
- **面板联动**：点击聊天中的工具调用条可高亮右侧面板

#### 3.4.4 SSE 流式响应

- 前端通过 SSE（Server-Sent Events）接收 AI 回复
- 事件类型：

| 层次 | SSE 事件 | 展示位置 | 内容 |
|------|----------|----------|------|
| LLM Thinking | `thinking_start` / `thinking_delta` / `thinking_end` | 聊天气泡内，可折叠 | AI 推理过程 |
| Tool Call | `tool_call_start` / `tool_call_delta` / `tool_call_result` | 聊天气泡内 + 右侧面板 | 检索策略 + 执行结果 |
| Answer | `answer_delta` / `done` | 聊天气泡内 | 最终回答 + 引用 |

- 安全超时机制（60 秒无数据自动终止）
- 支持中断生成（abortController）

#### 3.4.5 AI 问答模式

**模式一：tool_calling（工具调用模式）**
- LangChain AgentExecutor 驱动
- AI 自主决定是否调用工具
- 可用工具：
  - `search_artifacts` — 按关键词搜索文物列表（查询 SQLite）
  - `query_graph` — 查询知识图谱实体关系（查询 Neo4j）
  - `rag_query` — LightRAG 语义检索（向量索引，ADR-003）
  - `get_artifact_detail` — 根据 ID 获取文物完整详情（查询 SQLite）

**模式二：pre_retrieve（预检索模式）**
- 先使用 jieba TF-IDF 提取关键词
- 并行查询 SQLite 文物数据 + Neo4j 图谱数据 + LightRAG 向量索引
- 将检索结果作为上下文注入 System Prompt
- 再调用 LLM 生成回答

#### 3.4.6 聊天会话持久化

- 聊天会话和消息存储在 SQLite（chat_sessions / chat_messages 表）
- 支持按会话 ID 加载历史消息

---

### 3.5 仪表盘 / 数据大屏

- **统计卡片**：展示文物总数、知识图谱三元组数、AI 问答次数等
- **柱状图**：各朝代文物数量分布
- **饼图**：文物类别占比
- **词云**：基于文物描述的词云分析
- **最近活动表**：按时间线展示系统操作记录

- **统计 API**：
  - `GET /api/stats/overview` — 返回总数、分类统计、年代统计
  - `GET /api/wordcloud/analyze?category=xxx&limit=100` — 分词统计结果

---

### 3.6 附件管理（后续扩展）

- 附件列表、文件夹树、文件预览、下载
- 多文件批量上传、上传队列
- 知识图谱 XLSX 导入导出
- 标签管理

---

## 4. 非功能性需求

### 4.1 性能要求

- **API 响应时间**：普通 CRUD 接口 < 500ms；统计聚合接口 < 2s
- **SSE 流式首字节**：AI 问答首 token 返回 < 3s
- **图谱渲染**：支持 500 节点以内的流畅交互
- **数据库**：SQLite WAL 模式 + FastAPI async，避免锁竞争

### 4.2 安全要求

- **认证**：JWT Token 认证（ADR-011）
- **权限控制**：基于角色的访问控制（RBAC）
- **密码安全**：bcrypt 哈希存储
- **SQL 注入防护**：全部使用参数化查询
- **文件上传安全**：文件路径校验防止路径穿越，文件大小限制
- **CORS**：跨域资源共享配置

### 4.3 可用性要求

- **热重载**：前端 Vite HMR 热更新，后端 FastAPI uvicorn --reload
- **优雅降级**：Neo4j 不可用时降级处理，不影响基础文物管理功能
- **健康检查**：所有 Docker 容器配置健康检查
- **错误处理**：统一错误响应格式，前端展示友好错误提示

---

## 5. 技术栈

> **最终技术栈以 `docs/architecture-decisions.md` 为准。**

| 层级 | 技术 | 备注 |
|------|------|------|
| 前端 | Vite + React 18 + TypeScript + Ant Design Pro | SPA，按功能分模块（`features/`） |
| 后端 | Python 3.12 + FastAPI | 单服务架构（ADR-001） |
| AI 服务 | LangChain 0.3 + LightRAG | RAG 检索增强（ADR-003） |
| 关系数据库 | SQLite | 文物数据、用户、会话等结构化数据（ADR-002） |
| 图数据库 | Neo4j 5.x | 知识图谱实体关系 |
| LLM | DeepSeek（Ollama 本地 / API 远程） | OpenAI 兼容接口 |
| 部署 | Docker Compose（3 容器） | FastAPI + Neo4j + React（ADR-008） |

### 模块规范

- 前端 TypeScript ES Modules，按功能分模块（`features/`）
- 后端 Python FastAPI，路由/服务/模型三层分离
- LangChain Tool 使用 `@tool` 装饰器定义

### 部署架构

| 文件 | 用途 | 包含的服务 |
|------|------|-----------|
| `docker-compose.yml` | 全容器开发 | FastAPI, Neo4j, React Frontend, Ollama（可选） |

### 服务端口

| 服务 | 容器内 | 宿主机 |
|------|--------|--------|
| Frontend | 5173 | 5173 (Vite dev) |
| Backend (FastAPI) | 8000 | 8000 |
| Neo4j HTTP/Bolt | 7474/7687 | 7474/7687 |
| Ollama（可选） | 11434 | 11434 |

---

## 6. 数据模型

### 6.1 SQLite 核心表（MVP）

| 表名 | 用途 | 主要字段 |
|------|------|----------|
| users | 用户账户 | id, username, email, password_hash, role(ENUM:admin/user) |
| artifacts | 文物数据 | id, name, description, category, era, location, image_url, tags |
| chat_sessions | 聊天会话 | id, user_id, title, mode_used, created_at |
| chat_messages | 聊天消息 | id, session_id, role, content, tool_calls(JSON), created_at |
| attachments | 附件 | id, artifact_id, original_name, storage_path, mime_type, size_bytes |

### 6.2 Neo4j 图谱模型

节点类型（MVP）：Artifact, Category, Era, Location, Material

关系类型：属于类别、属于年代、出土于、制作材料等。

### 6.3 缓存策略

MVP 阶段不使用独立缓存服务，后续按需引入。

---

## 7. API 概述

### 7.1 路由模块清单

| 模块 | 路由前缀 | 说明 | MVP |
|------|----------|------|-----|
| auth.routes | /api/auth | 注册、登录、用户信息 | ✅ |
| artifact.routes | /api/artifacts | 文物 CRUD + 搜索 | ✅ |
| stats.routes | /api/stats | 统计数据 | ✅ |
| graph.routes | /api/graph | 知识图谱查询 | ✅ |
| chat.routes | /api/chat | 智能问答（SSE） | ✅ |
| wordcloud.routes | /api/wordcloud | 词云分析 | ✅ |
| attachment.routes | /api/attachments | 附件管理 | 后续扩展 |
| triple.routes | /api/triples | 三元组管理 | 后续扩展 |
| admin.routes | /api/admin | 用户管理 | 后续扩展 |

### 7.2 LangChain 服务端点

| 端点 | 方法 | 说明 |
|------|------|------|
| /health | GET | 健康检查（SQLite + Neo4j 连通性） |
| /ask | POST | 智能问答（SSE 流式响应） |

---

## 8. 页面与路由

| 路由 | 页面 | 说明 | MVP |
|------|------|------|-----|
| /login | Login | 登录/注册页面 | ✅ |
| / | Dashboard | 数据大屏（首页） | ✅ |
| /artifacts | ArtifactList | 文物管理（搜索+列表） | ✅ |
| /artifacts/:id | ArtifactDetail | 文物详情（元数据+图片+修复） | ✅ |
| /graph | KnowledgeGraph | 知识图谱可视化 | ✅ |
| /chat | Chat | AI 智能对话 | ✅ |
| /profile | Profile | 个人中心 | 后续扩展 |
| /admin/users | AdminUsers | 用户管理 | 后续扩展 |
| /workbench | WorkbenchPage | 工作台 | 后续扩展 |

侧边栏菜单（MVP）：Dashboard、文物管理、知识图谱、AI 对话。

---

## 9. 已知限制与未来方向

### 9.1 当前已知问题

| 问题 | 表现 | 状态 |
|------|------|------|
| SSE 流稳定性 | spinner 一直转圈 | 待修复 |
| 图谱性能 | 大节点集渲染卡顿 | 待优化 |

### 9.2 待补充的学术文档

| 文档 | 状态 | 说明 |
|------|------|------|
| 文献综述 | 待完成 | 15 篇论文调研 |
| 实验验证 | 待完成 | AI 质量评估 + GraphRAG vs RAG 对比实验 |
| 论文大纲 | 待完成 | 完整论文结构 |

### 9.3 未来方向

- **GraphRAG vs RAG 对比实验**（ADR-013）
- **LightRAG 集成深化**：增强 RAG 检索质量
- **工作台升级**：Obsidian 式自由布局
- **图像修复 MCP Tool**：IOPaint 集成（ADR-006）
- **E2E 测试**：Playwright 自动化回归测试
- **时空维度分析**：朝代时间轴 + 地理热力图

---

*本文档技术栈已同步至 docs/architecture-decisions.md。最后更新：2026-04-14*
