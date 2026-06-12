# 文物大数据与人工智能集成系统 — 架构设计文档

> 文档版本: 1.0
> 更新日期: 2026-05-10

---

## 1. 系统概述

### 1.1 项目简介

**文物大数据与人工智能集成系统**是一个人机协作的文化遗产数据平台，核心功能包括：

- **数据管理**：文物信息的录入、查询、编辑、删除与导出
- **知识图谱**：文物关系的可视化展示与交互式探索
- **AI 智能问答**：基于大语言模型的文物知识问答系统
- **知识抽取**：从文本中自动提取实体和关系

### 1.2 技术栈总览

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 前端 | Vite + React + TypeScript | React 19 | 构建工具 + UI 框架 |
| UI 组件库 | Ant Design | v5 | 企业级组件库 |
| 后端 | Python FastAPI | 3.12+ | 高性能异步 Web 框架 |
| ORM | SQLAlchemy | 2.0 | 数据库对象关系映射 |
| 关系数据库 | SQLite (WAL) | - | 轻量级，支持并发读写 |
| 图数据库 | Neo4j | 5.x | 知识图谱存储 |
| AI 框架 | LangChain + LightRAG | 0.3+ / 1.4+ | LLM 应用框架 + 知识图谱 RAG |
| Embedding | sentence-transformers | - | BAAI/bge-m3 本地模型 |
| 认证 | JWT (bcrypt) | - | Token 身份认证 |
| 容器化 | Docker + Docker Compose | - | 一键部署 |

---

## 2. 系统架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                        表示层 (Presentation)                  │
│    React 19 + Vite + TypeScript + Ant Design 5              │
│    Dashboard | 文物管理 | 知识图谱 | AI 问答 | 知识抽取       │
├─────────────────────────────────────────────────────────────┤
│                        API 网关层 (API Gateway)               │
│    RESTful API / JWT 认证 / SSE 流式传输 / CORS              │
├─────────────────────────────────────────────────────────────┤
│                        业务逻辑层 (Business Logic)            │
│    FastAPI Routers → Services → Models → Schemas            │
│    Auth | Artifacts | Stats | Graph | Chat | Repair | AI     │
├─────────────────────────────────────────────────────────────┤
│                        数据层 (Data Layer)                    │
│    SQLite (WAL) ────── 文物 / 用户 / 会话 / 附件             │
│    Neo4j 5 ─────────── 规则三元组 / 知识抽取结果             │
│    LightRAG KV Store ─ 向量索引 / 知识图谱 (独立系统)        │
├─────────────────────────────────────────────────────────────┤
│                        AI 服务层 (AI Services)                │
│    LLM API (OpenAI-compatible) ─── Chat / LightRAG 推理      │
│    Embedding (bge-m3) ─────────── 本地文本嵌入模型           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 部署架构

```yaml
# docker-compose.yml
services:
  neo4j:      # 图数据库 (端口 7474/7687)
  backend:    # FastAPI 后端 (端口 8000)
  frontend:   # Nginx 静态服务 (端口 80)
```

- **开发环境**: 前端 Vite dev server (5173) + 后端 uvicorn (8000) + Neo4j (Docker)
- **生产环境**: Docker Compose 一键启动，前端静态文件由 Nginx 服务，或由 FastAPI 直接挂载 dist 目录

---

## 3. 核心模块详解

### 3.1 前端模块

#### 3.1.1 项目结构

```
frontend/src/
├── App.tsx                 # 应用入口：路由配置 + 懒加载
├── main.tsx                # React 根渲染
├── layouts/
│   └── MainLayout.tsx      # 主布局：侧边栏 + 头部 + 内容区
├── pages/                  # 页面组件（按路由划分）
│   ├── Dashboard.tsx       # 数据总览仪表盘
│   ├── Artifacts.tsx       # 文物列表（搜索/筛选/分页）
│   ├── ArtifactDetail.tsx  # 文物详情页
│   ├── Graph.tsx           # 知识图谱可视化
│   ├── Chat.tsx            # AI 问答聊天界面
│   ├── Knowledge.tsx       # 知识抽取页面
│   └── Login.tsx           # 登录页
├── api/                    # API 调用层
│   ├── client.ts           # Axios 实例（拦截器：JWT / 401 处理）
│   ├── artifacts.ts        # 文物 API
│   ├── auth.ts             # 认证 API
│   ├── chat.ts             # 聊天 API（含 SSE 处理）
│   ├── graph.ts            # 图谱 API
│   └── stats.ts            # 统计 API
├── hooks/
│   └── useAuth.ts          # 认证状态管理 Hook
└── constants/
    └── colors.ts           # 主题色常量
```

#### 3.1.2 路由设计

| 路由 | 页面 | 说明 | 认证 |
|------|------|------|------|
| `/login` | Login | 登录页 | 公开 |
| `/` | Dashboard | 数据仪表盘 | 需登录 |
| `/artifacts` | Artifacts | 文物列表 | 需登录 |
| `/artifacts/:id` | ArtifactDetail | 文物详情 | 需登录 |
| `/graph` | Graph | 知识图谱 | 需登录 |
| `/chat` | Chat | AI 问答 | 需登录 |
| `/knowledge` | Knowledge | 知识抽取 | 需登录 |
| `*` | NotFound | 404 页面 | 公开 |

#### 3.1.3 状态管理

- **认证状态**: 自定义 `useAuth` Hook，localStorage 存储 JWT token
- **全局事件**: `auth:logout` 自定义事件，用于 Axios 拦截器 401 时通知 React 路由跳转
- **页面状态**: React 本地 state（无 Redux/Zustand，项目规模适中）

#### 3.1.4 关键前端技术决策

| 决策 | 说明 |
|------|------|
| 懒加载 (`React.lazy`) | 减少首屏加载时间 |
| SSE 手动解析 | POST SSE 不能用 `EventSource`，使用 `fetch + ReadableStream` 逐行解析 `data:` 前缀 |
| Axios 拦截器 | 请求自动附加 `Authorization: Bearer <token>`；响应 401 触发全局登出事件 |
| 响应式布局 | 移动端适配（768px 断点），侧边栏变为抽屉式覆盖层 |

---

### 3.2 后端模块

#### 3.2.1 项目结构

```
backend/app/
├── main.py                 # FastAPI 入口：生命周期管理 + 路由注册 + CORS
├── config.py               # Pydantic Settings：环境变量配置
├── database.py             # SQLAlchemy 引擎 + 会话 + 初始化
├── models/                 # SQLAlchemy ORM 模型
│   ├── artifact.py         # 文物模型
│   ├── user.py             # 用户模型
│   ├── chat.py             # 聊天会话/消息模型
│   └── attachment.py       # 附件模型
├── schemas/                # Pydantic v2 数据校验模型
│   ├── artifact.py         # 文物 CRUD Schema
│   ├── auth.py             # 认证相关 Schema
│   ├── chat.py             # 聊天消息 Schema
│   ├── graph.py            # 图谱数据 Schema
│   └── stats.py            # 统计数据 Schema
├── routers/                # API 路由层（Controller）
│   ├── auth.py             # 登录/注册/JWT
│   ├── artifacts.py        # 文物 CRUD + 导出 CSV
│   ├── stats.py            # 统计数据
│   ├── graph.py            # 图谱查询/导入导出/知识抽取
│   ├── chat.py             # 聊天会话 + SSE 流式问答
│   ├── repair.py           # 图像修复（占位）
│   └── health.py           # 健康检查
├── services/               # 业务逻辑层（Service）
│   ├── auth.py             # 认证服务（密码哈希/JWT）
│   ├── artifact.py         # 文物业务逻辑
│   ├── stats.py            # 统计计算
│   ├── graph.py            # 图谱构建与查询
│   └── chat.py             # AI 聊天逻辑（LangChain + SSE）
└── ai/                     # AI 模块
    ├── lightrag_service.py # LightRAG 单例封装
    └── tools.py            # LangChain 工具定义（文物搜索/图谱查询）
```

#### 3.2.2 三层架构模式

```
Router (控制器) → Service (业务逻辑) → Model (数据访问)
     ↓                  ↓                    ↓
  参数校验           业务规则            SQLAlchemy ORM
  HTTP 响应          数据转换            SQLite/Neo4j
```

**路由层职责**：
- HTTP 请求参数解析（Query/Path/Body）
- 依赖注入（`get_db` 会话、`get_current_user` 认证）
- HTTP 状态码和响应模型返回

**服务层职责**：
- 核心业务逻辑实现
- 数据库操作封装
- 外部服务调用（LLM API、Neo4j）

**模型层职责**：
- 数据表结构定义
- ORM 关系映射

#### 3.2.3 API 路由清单

| 路由前缀 | 端点 | 方法 | 说明 | 认证 |
|----------|------|------|------|------|
| `/api/health` | `/` | GET | 健康检查 | 公开 |
| `/api/auth` | `/register` | POST | 用户注册 | 公开 |
| `/api/auth` | `/login` | POST | 用户登录 | 公开 |
| `/api/auth` | `/me` | GET | 当前用户信息 | 需登录 |
| `/api/artifacts` | `/` | GET | 文物列表（分页/搜索/筛选） | 公开 |
| `/api/artifacts` | `/` | POST | 创建文物 | 需登录 |
| `/api/artifacts` | `/export` | GET | 导出 CSV | 需登录 |
| `/api/artifacts` | `/{id}` | GET | 文物详情 | 公开 |
| `/api/artifacts` | `/{id}` | PUT | 更新文物 | 需登录 |
| `/api/artifacts` | `/{id}` | DELETE | 删除文物 | 需管理员 |
| `/api/stats` | `/dashboard` | GET | 仪表盘统计数据 | 公开 |
| `/api/graph` | `/full` | GET | 完整图谱数据 | 公开 |
| `/api/graph` | `/search` | GET | 图谱搜索 | 公开 |
| `/api/graph` | `/node/{id}` | GET | 节点详情 | 公开 |
| `/api/graph` | `/export` | GET | 导出图谱 CSV | 公开 |
| `/api/graph` | `/import` | POST | 导入 CSV 到 Neo4j | 需登录 |
| `/api/graph` | `/extract` | POST | LightRAG 知识抽取 | 需登录 |
| `/api/graph` | `/knowledge-query` | POST | 知识库查询 | 需登录 |
| `/api/chat` | `/sessions` | POST | 创建会话 | 需登录 |
| `/api/chat` | `/sessions` | GET | 会话列表 | 需登录 |
| `/api/chat` | `/sessions/{id}/messages` | GET | 历史消息 | 需登录 |
| `/api/chat` | `/sessions` | DELETE | 批量删除会话 | 需登录 |
| `/api/chat` | `/ask` | POST | AI 问答（SSE 流式） | 需登录 |

---

### 3.3 数据层模块

#### 3.3.1 SQLite 数据库

**选型理由**：
- 项目规模适中（771 条文物数据），无需重型数据库
- 零配置，单文件便于迁移和备份
- WAL (Write-Ahead Logging) 模式支持读写并发

**数据模型**：

```sql
-- 用户表
users (id, username, email, password_hash, role, created_at)

-- 文物表
artifacts (
  id, name, description, category, era, location, image_url, tags,
  material, museum, source_url, dimensions, related_artifacts,
  created_at, updated_at
)

-- 聊天会话表
chat_sessions (id, user_id, title, mode_used, created_at)

-- 聊天消息表
chat_messages (id, session_id, role, content, tool_calls, created_at)

-- 附件表
attachments (id, artifact_id, filename, file_path, file_type, created_at)
```

**索引策略**：
- `artifacts.name` / `category` / `era` / `material` / `museum` — 高频筛选字段
- `chat_messages.session_id` — 消息查询
- `attachments.artifact_id` — 附件关联查询
- `chat_sessions.user_id` — 用户会话列表

#### 3.3.2 Neo4j 图数据库

**用途**：
- 存储规则定义的三元组（source-relation-target）
- 存储 LightRAG 知识抽取的结果（实体和关系）

**节点标签**：`artifact`, `era`, `category`, `location`, `tag`, `entity`

**关系类型**：`belongs_to`, `located_in`, `has_tag`, `related_to`, 等

**重要限制**（技术债务）：
- Neo4j 和 LightRAG 是两套独立系统
- AI 问答不直接查询 Neo4j
- 知识抽取结果不可被 AI 问答直接使用

#### 3.3.3 LightRAG KV Store

**用途**：独立的 AI 知识库系统

**工作流程**：
1. 将文物文本数据插入 LightRAG (`ainsert`)
2. LightRAG 内部调用 LLM 提取实体和关系
3. 使用 bge-m3 生成文本嵌入向量
4. 存储为本地 KV 文件（`backend/data/lightrag/`）
5. 查询时混合检索（向量 + 图谱）

---

### 3.4 AI 模块

#### 3.4.1 LightRAG 服务封装

```python
# 单例模式封装
class LightRAGService:
    - LLM: 用户配置的 OpenAI-compatible API
    - Embedding: sentence-transformers (BAAI/bge-m3, 1024维)
    - 工作目录: backend/data/lightrag/
    - 方法: aquery() / ainsert()
```

#### 3.4.2 AI 问答流程

```
用户提问
    ↓
Chat API (/api/chat/ask)
    ↓
chat_service.stream_chat_response()
    ↓
LangChain 链式调用
    ├── 工具调用决策（需不需要查数据库/图谱？）
    │   ├── get_artifact_detail — 查询文物详情
    │   ├── search_artifacts — 搜索文物列表
    │   └── query_knowledge_graph — 查询知识图谱
    ↓
LLM API 生成回答
    ↓
SSE 流式返回前端
    ├── event: thinking (推理过程)
    ├── event: tool_call (工具调用结果)
    ├── event: answer (最终答案)
    └── event: done (完成标记 + 引用来源)
```

#### 3.4.3 双 LLM 配置

| 用途 | 配置项 | 说明 |
|------|--------|------|
| Chat 问答 | `AI_API_KEY` / `AI_API_BASE` / `AI_MODEL_NAME` | 对话生成 |
| LightRAG | `LIGHTRAG_API_KEY` / `LIGHTRAG_API_BASE` / `LIGHTRAG_MODEL_NAME` | 知识提取与查询 |

两个配置可以相同也可以不同，支持分别指定。

---

## 4. 数据流详解

### 4.1 文物数据管理流

```
[前端] 用户填写表单 / 使用搜索筛选
    ↓ GET/POST/PUT/DELETE /api/artifacts/*
[后端] artifacts Router → artifact Service
    ↓ SQLAlchemy CRUD
[数据] SQLite artifacts 表
    ↓ 返回 JSON
[前端] 更新列表 / 显示详情
```

**导出 CSV 流**：
- 查询符合条件的所有文物（上限 10000 条）
- 生成 UTF-8 BOM 格式的 CSV（兼容 Excel）
- `StreamingResponse` 流式返回

### 4.2 AI 智能问答流

```
[前端] 用户输入问题
    ↓ POST /api/chat/ask (SSE)
[后端] chat Router
    ├── 会话管理（创建新会话或复用现有会话）
    ├── 速率限制检查（IP 级别，60秒/10次）
    ↓ chat Service
        ├── LangChain 构建 prompt
        ├── 工具调用循环
        │   ├── search_artifacts: 关键词搜索 SQLite
        │   ├── get_artifact_detail: 根据 ID 查询详情
        │   └── query_knowledge_graph: 查询图谱关系
        ↓ LLM API 调用
            ↓ SSE 事件流推送
[前端] 实时渲染 thinking / tool_call / answer / done 事件
```

**SSE 事件格式**：

```json
{"type": "thinking", "content": "用户问的是..."}
{"type": "tool_call", "tool": "search_artifacts", "query": "青铜", "results": [...], "count": 5}
{"type": "answer", "content": "根据搜索结果..."}
{"type": "done", "sources": [{"name": "四羊方尊", "source": "文物数据库", "artifact_id": 42}]}
```

### 4.3 知识图谱流

#### 4.3.1 图谱可视化流

```
[前端] 请求图谱数据
    ↓ GET /api/graph/full
[后端] graph Router → graph Service
    ↓ 从 SQLite artifacts 表动态构建图谱节点和边
[数据] SQLite (主数据源)
    ↓ 返回 nodes + links
[前端] 使用 D3/ECharts 渲染力导向图
```

**动态构建逻辑**：
- 每个文物是一个节点（类型: `artifact`）
- 年代、类别、地点、标签也是节点
- 边表示关系：`belongs_to`, `in_era`, `located_in`, `has_tag`

#### 4.3.2 知识抽取流

```
[前端] 用户粘贴文本
    ↓ POST /api/graph/extract
[后端] graph Router
    ↓ LightRAG ainsert(text)
        ├── LLM 提取实体和关系
        ├── Embedding 生成向量
        └── 存入 LightRAG KV Store
    ↓ 查询 Neo4j 获取新实体
[前端] 显示提取的实体列表和关系列表
```

#### 4.3.3 知识查询流

```
[前端] 用户提问
    ↓ POST /api/graph/knowledge-query
[后端] graph Router
    ↓ LightRAG aquery(question)
        ├── 向量检索相关文本片段
        ├── 图谱检索相关实体关系
        └── LLM 综合生成答案
[前端] 显示答案
```

---

## 5. 认证与安全

### 5.1 JWT 认证流程

```
[注册] POST /api/auth/register
    → bcrypt 哈希密码 → 存入 users 表

[登录] POST /api/auth/login
    → 验证用户名密码 → 生成 JWT Token
    → 返回 {access_token, token_type: "bearer"}

[请求] 前端 Axios 拦截器自动附加 Header
    → Authorization: Bearer <token>

[验证] 后端 get_current_user 依赖
    → 解码 JWT → 查询用户 → 注入到路由

[登出] 前端移除 localStorage token
    → 401 时自动触发 auth:logout 事件
```

### 5.2 权限控制

| 角色 | 权限 |
|------|------|
| 普通用户 | 查看文物、AI 问答、知识图谱浏览、知识抽取 |
| 管理员 | 以上 + 创建/编辑/删除文物、删除用户数据 |

### 5.3 安全措施

- **密码存储**: bcrypt 哈希（自动加盐）
- **CORS**: 只允许特定前端地址
- **速率限制**: AI 问答端点 IP 级别限流（10次/60秒）
- **全局异常处理**: 生产环境不泄露堆栈跟踪
- **SQL 注入防护**: SQLAlchemy ORM + 参数化查询
- **Cypher 注入防护**: Neo4j 查询使用参数化 + 标签白名单

---

## 6. 配置管理

### 6.1 环境变量

| 变量 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `AI_API_KEY` | Chat 问答 LLM API Key | 是 | - |
| `AI_API_BASE` | Chat 问答 API 地址 | 是 | - |
| `AI_MODEL_NAME` | Chat 问答模型名 | 是 | - |
| `LIGHTRAG_API_KEY` | 知识图谱提取 LLM API Key | 是 | - |
| `LIGHTRAG_API_BASE` | 知识图谱提取 API 地址 | 是 | - |
| `LIGHTRAG_MODEL_NAME` | 知识图谱提取模型名 | 是 | - |
| `NEO4J_URI` | Neo4j 连接地址 | 否 | `bolt://localhost:7687` |
| `NEO4J_PASSWORD` | Neo4j 密码 | 否 | - |
| `JWT_SECRET_KEY` | JWT 签名密钥 | 否 | 开发默认值 |
| `ADMIN_DEFAULT_PASSWORD` | 默认管理员密码 | 否 | `admin123` |

### 6.2 配置加载顺序

1. `.env` 文件（最高优先级）
2. 系统环境变量
3. Pydantic Settings 默认值

---

## 7. 已知问题与技术债务

### 7.1 架构层面的问题

| 问题 | 影响 | 状态 |
|------|------|------|
| Neo4j 与 LightRAG 数据不互通 | AI 问答无法利用 Neo4j 中的规则三元组 | 未解决 |
| 知识抽取结果不可被 AI 使用 | 知识抽取页面为独立 Demo，无实际联动 | 未解决 |
| Neo4j 未真正发挥作用 | 规则三元组导入了但 AI 不查询 | 未解决 |
| 单点 SQLite | 高并发写入可能成为瓶颈 | 可接受 |

### 7.2 推荐改进方向

1. **统一知识库**: 将 SQLite 文物数据同步到 Neo4j，AI 问答时联合查询
2. **LightRAG 索引预构建**: 在应用启动时自动将文物数据插入 LightRAG
3. **缓存层**: 引入 Redis 缓存热点数据（如统计信息、频繁查询的文物）
4. **异步任务**: 知识抽取等耗时操作改为 Celery 后台任务
5. **全文搜索**: SQLite 的 FTS5 扩展或引入 Elasticsearch

---

## 8. 附录

### 8.1 数据库 ER 图（简化）

```
users ||--o{ chat_sessions : owns
users ||--o{ chat_messages : sends
chat_sessions ||--o{ chat_messages : contains
artifacts ||--o{ attachments : has
```

### 8.2 外部依赖关系

```
backend/
    ├── fastapi           # Web 框架
    ├── sqlalchemy        # ORM
    ├── pydantic          # 数据校验
    ├── pydantic-settings # 配置管理
    ├── python-jose       # JWT
    ├── passlib[bcrypt]   # 密码哈希
    ├── neo4j             # 图数据库驱动
    ├── lightrag          # 知识图谱 RAG
    ├── langchain         # LLM 应用框架
    ├── sentence-transformers  # 文本嵌入
    └── openai            # OpenAI API 客户端

frontend/
    ├── react             # UI 框架
    ├── react-router-dom  # 路由
    ├── antd              # 组件库
    ├── axios             # HTTP 客户端
    ├── vite              # 构建工具
    └── typescript        # 类型系统
```

### 8.3 端口映射

| 服务 | 开发端口 | 生产端口 |
|------|----------|----------|
| 前端 (Vite) | 5173 | 80 (Nginx) |
| 后端 (FastAPI) | 8000 | 8000 |
| Neo4j HTTP | 7474 | 7474 |
| Neo4j Bolt | 7687 | 7687 |
