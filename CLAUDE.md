# 项目指南 — 文物大数据与人工智能集成系统

## 项目概述

大创项目：文物大数据与人工智能集成系统。一个人机协作的文化遗产数据平台，核心是数据管理、知识图谱、AI智能问答。

## 技术栈（已确认，不可更改）

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | Vite + React + TypeScript + Ant Design Pro | React 18, AntD 5 |
| 后端 | Python FastAPI | 3.12（最低3.10，需用虚拟环境） |
| AI | LangChain + LightRAG | LangChain 0.3 |
| 关系数据库 | SQLite（WAL模式） | - |
| 图数据库 | Neo4j | 5.x |
| 认证 | JWT（bcrypt） | - |
| 部署 | Docker Compose（3容器） | - |

**已砍掉的（不要用）**：Node.js, Express, MySQL, Redis, CRA, WebSocket

## 项目结构

```
ADD_new/
├── backend/           # FastAPI 后端
│   ├── app/
│   │   ├── main.py    # FastAPI 入口
│   │   ├── config.py  # 配置管理
│   │   ├── database.py # SQLite 连接
│   │   ├── models/    # SQLAlchemy 模型
│   │   ├── schemas/   # Pydantic schema
│   │   ├── routers/   # API 路由
│   │   ├── services/  # 业务逻辑
│   │   └── ai/        # LangChain/LightRAG
│   ├── tests/
│   ├── requirements.txt
│   └── alembic/       # 数据库迁移（可选）
├── frontend/          # React 前端
│   ├── src/
│   │   ├── features/  # 按功能分模块
│   │   ├── components/ # 共享组件
│   │   ├── api/       # API 调用层
│   │   ├── store/     # 状态管理
│   │   └── router/    # 路由配置
│   ├── package.json
│   └── vite.config.ts
├── scripts/           # 数据脚本
├── data/              # 数据资产
├── demo/              # UI 原型（参考，不要修改）
└── docs/              # 项目文档（不要修改）
```

## MVP 页面（6个）

1. `/login` — 登录/注册
2. `/` — Dashboard（统计卡片+柱状图+饼图+词云）
3. `/artifacts` — 文物管理（搜索+筛选+列表+分页）
4. `/artifacts/:id` — 文物详情（元数据+图片）
5. `/graph` — 知识图谱（D3.js力导向图）
6. `/chat` — AI智能问答（Thinking+ToolCall+Answer三阶段）

## MVP API

| 端点 | 方法 | 说明 |
|------|------|------|
| /api/auth/register | POST | 注册 |
| /api/auth/login | POST | 登录（返回JWT） |
| /api/auth/me | GET | 当前用户信息 |
| /api/artifacts | GET | 文物列表（分页+搜索+筛选） |
| /api/artifacts | POST | 创建文物 |
| /api/artifacts/:id | GET | 文物详情 |
| /api/artifacts/:id | PUT | 更新文物 |
| /api/artifacts/:id | DELETE | 删除文物 |
| /api/stats/overview | GET | 统计概览 |
| /api/stats/by-era | GET | 按年代统计 |
| /api/stats/by-category | GET | 按类别统计 |
| /api/stats/by-location | GET | 按出土地点统计 |
| /api/stats/wordcloud | GET | 词云数据 |
| /api/graph/full | GET | 全图数据 |
| /api/graph/search | GET | 图谱搜索 |
| /api/graph/node/:node_id | GET | 节点详情 |
| /api/chat/sessions | GET/POST | 会话管理 |
| /api/chat/sessions | DELETE | 批量删除会话 |
| /api/chat/sessions/:id/messages | GET | 历史消息 |
| /api/chat/ask | POST | AI问答（SSE流式） |
| /api/artifacts/:id/repair-image | POST | 图像修复（需认证） |

## SQLite 数据模型

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK(role IN ('admin','user')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  era TEXT,
  location TEXT,
  image_url TEXT,
  tags TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  title TEXT,
  mode_used TEXT DEFAULT 'tool_calling',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES chat_sessions(id),
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content TEXT,
  tool_calls TEXT,  -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_id INTEGER REFERENCES artifacts(id),
  original_name TEXT,
  storage_path TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);  -- 注意：MVP 不含附件上传功能，此表预留
```

## 设计系统

- Stripe风格，白色背景 #ffffff，深色标题 #061b31，紫色主色 #533afd
- 字体：Söhne（或系统无衬线字体回退）
- 参考 demo/style.css（约550行完整CSS变量体系）
- 参考 demo/*.html 页面布局

## 开发规范

### 后端
- Python 3.12, FastAPI
- 路由/服务/模型三层分离
- Pydantic v2 schema
- SQLAlchemy 2.0（同步即可，不需要async）
- JWT认证，bcrypt密码哈希
- SSE流式响应用 StreamingResponse
- 错误处理：统一HTTPException + 错误码

### 前端
- Vite + React 18 + TypeScript
- Ant Design Pro 组件库
- 按功能分模块（features/artifacts, features/graph, features/chat 等）
- API 调用统一封装在 api/ 目录
- 状态管理：Zustand 或 React Context
- SSE 使用 EventSource API
- 路由：React Router v6

### Git
- 每个 agent 每完成一个功能模块 commit 一次
- commit message 格式：`feat(module): 描述`
- 不要 commit node_modules, __pycache__, .env 等

## Agent 使用规范

### 模型选择（强制）
派 agent 时**必须**指定 `model` 参数，可选值：
- `opus`：复杂架构决策、代码审查、需要深度思考的任务
- `sonnet`：日常开发、功能实现、代码修改（**默认选择**）
- `haiku`：简单查询、文件搜索、轻量任务

**禁止**：不指定 model（会回退到 claude-opus-4-6，该模型不可用）

### Subagent vs Agent Team Member

| 场景 | 方式 | 说明 |
|------|------|------|
| 简单搜索、代码查找 | Subagent（`subagent_type`） | Explore/Plan 等内置类型，无 team 上下文 |
| 单次独立任务 | Subagent | 用完即弃，不需要通信 |
| 多 agent 并行协作 | **Agent Team Member**（`team_name`） | 共享 task list，可互相通信 |
| 需要 reviewer-generator 对抗流程 | **Agent Team Member** | reviewer 审完通知 generator |

### 对抗式优化流程
1. reviewer-X：审查系统，输出问题报告到 `docs/review-round-X.md`，只审不改
2. generator-X：按报告修复，自检，commit，通知 reviewer 确认
3. 本轮完成后删除两个 teammate（必须同时关闭对应 tmux pane：`tmux kill-pane -t <pane_id>`），清理上下文，开启下一轮

## 关键约束

1. **本地开发优先**：先不搞Docker，直接本地跑 FastAPI + Vite dev
2. **不要问用户**：所有决策参考 docs/ 下的文档，拿不准就按最简方案
3. **不要修改 docs/ 和 demo/ 目录**：这些是参考文档
4. **数据已有**：data/artifacts_list.json 有 629 条文物数据，data/artifacts_detail/ 有详情，可以直接导入 SQLite
5. **后端端口 8000，前端端口 5173**
6. **CORS 允许前端跨域访问后端**
7. **Python 需要 3.10+**（用了 `X | None` 语法），必须建虚拟环境（`python -m venv .venv`），激活后再安装依赖
8. **Windows 环境**：Python open() 加 encoding='utf-8'，路径用 os.path.join

## 踩坑记录

开发过程中遇到的每个坑都要记录到 `docs/pitfalls.md`，格式：

```markdown
### [日期] 问题简述
- **现象**：发生了什么
- **原因**：根本原因
- **解决**：怎么修的
- **教训**：一句话总结，给后来人看
```

每个 agent 遇到非显而易见的问题时（编码错误、依赖冲突、平台兼容性、API 行为异常等），必须追加到这个文件。不要等任务结束再写，遇到就记。

每个 agent 接到一个任务后：
1. 读 CLAUDE.md 获取项目上下文
2. 实现功能代码
3. 本地验证（启动 dev server，确认无报错）
4. git commit
5. 自我 review：是否所有 user story 都覆盖了？异步操作是否正常？边界情况是否处理？
6. 汇报完成状态和可改进点
