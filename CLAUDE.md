# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 项目概述

**文物大数据与人工智能集成系统** — 大创项目，人机协作的文化遗产数据平台。核心功能：数据管理、知识图谱、AI智能问答。

**技术债务**: 详见 `docs/technical-debt.md`，包含 Neo4j 未真正发挥作用、知识抽取页面伪实现、数据质量问题等。

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | Vite + React + TypeScript + Ant Design | React 19, AntD 5 |
| 后端 | Python FastAPI | 3.12（最低 3.10） |
| AI | LangChain + LightRAG | LangChain 0.3 |
| 关系数据库 | SQLite（WAL模式） | - |
| 图数据库 | Neo4j | 5.x |
| 认证 | JWT（bcrypt） | - |

**已砍掉**: Node.js, Express, MySQL, Redis, CRA, WebSocket

---

## 常用命令

### 后端开发

```bash
# 创建虚拟环境（首次）
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt

# 启动开发服务器
uvicorn app.main:app --reload --port 8000

# 运行测试
pytest tests/ -v

# 创建管理员用户
python scripts/create_admin.py
```

### 前端开发

```bash
cd frontend
npm install
npm run dev      # 开发服务器 http://localhost:5173
npm run build    # 生产构建
npm run lint     # ESLint 检查
npm run test:e2e # Playwright E2E 测试
```

### 数据导入

```bash
# 导入文物数据到 SQLite
python scripts/import_artifacts.py

# 导入规则三元组到 Neo4j
python scripts/import_to_neo4j.py
```

---

## 项目结构

```
ADD_new/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI 入口
│   │   ├── config.py        # 配置（环境变量）
│   │   ├── database.py      # SQLite 连接
│   │   ├── models/          # SQLAlchemy 模型
│   │   ├── schemas/         # Pydantic schema
│   │   ├── routers/         # API 路由
│   │   ├── services/        # 业务逻辑
│   │   └── ai/              # LightRAG 服务
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/           # 页面组件
│   │   ├── layouts/         # 布局组件
│   │   ├── api/             # API 调用封装
│   │   └── main.tsx         # 入口
│   └── package.json
├── data/
│   ├── final/               # 清洗后的数据（771条文物）
│   ├── graph_data.json      # 图谱数据
│   └── official_195_list.json
├── docs/
│   ├── PRD.md               # 产品需求文档
│   ├── pitfalls.md          # 踩坑记录
│   ├── technical-debt.md    # 技术债务
│   └── review-round-1.md    # E2E 测试评审
└── demo/                    # UI 原型（参考，不要修改）
```

---

## 核心架构

### 数据流

```
SQLite (artifacts) ──┐
                     ├──> 知识图谱页面 (/graph)
Neo4j (规则三元组) ──┘

LightRAG KV Store ────> AI 问答 (/chat)

Neo4j + LightRAG ────> 知识抽取 (/knowledge) — ⚠️ 数据不互通
```

**关键问题**: Neo4j 和 LightRAG 是两套独立系统，AI 问答不查 Neo4j，知识抽取结果不可被 AI 使用。详见 `docs/technical-debt.md`。

### API 端点

| 路由 | 说明 |
|------|------|
| `/api/auth/*` | 登录/注册/JWT 认证 |
| `/api/artifacts/*` | 文物 CRUD |
| `/api/stats/*` | 统计数据 |
| `/api/graph/*` | 知识图谱查询、导入导出、知识抽取 |
| `/api/chat/*` | AI 问答（SSE 流式） |

---

## 开发规范

### 后端

- 路由/服务/模型三层分离
- Pydantic v2 schema
- SQLAlchemy 2.0（同步）
- SSE 用 `StreamingResponse`
- 错误统一 `HTTPException`

### 前端

- 按功能分模块（pages/features）
- API 调用封装在 `api/` 目录
- SSE 用 `fetch` + `ReadableStream`（POST 请求不能用 EventSource）
- 路由：React Router v6

### Git

- commit 格式：`feat(module): 描述`
- 不提交 `node_modules`, `__pycache__`, `.env`

---

## Agent 使用规范

### 模型选择（强制）

派 agent 时**必须**指定 `model` 参数：
- `opus`：复杂架构决策、代码审查
- `sonnet`：日常开发、功能实现（**默认**）
- `haiku`：简单查询、文件搜索

### 验证要求

**"编译通过" ≠ "能跑"。必须用浏览器实际验证。**

前端改动后必须：
1. 启动 dev server
2. 打开浏览器访问对应页面
3. 验证数据有内容、交互能用、边界情况处理

---

## 关键约束

1. **本地开发优先**：直接跑 FastAPI + Vite dev，不用 Docker
2. **不要问用户**：参考 docs/ 文档，拿不准按最简方案
3. **不要修改 docs/ 和 demo/**：这些是参考文档
4. **数据已有**：`data/final/` 有 771 条清洗后的文物数据
5. **端口**：后端 8000，前端 5173
6. **CORS**：已配置允许前端跨域
7. **Python 版本**：3.10+（用了 `X | None` 语法），必须用虚拟环境
8. **Windows 环境**：`open()` 加 `encoding='utf-8'`，路径用 `os.path.join`

---

## 踩坑记录

开发中遇到的问题实时追加到 `docs/pitfalls.md`。

关键踩坑：
- POST SSE 不能用 EventSource，必须用 fetch + ReadableStream
- SSE 需要禁用 Nginx/代理缓冲
- Windows 下 `open()` 必须指定 `encoding='utf-8'`
- recharts TypeScript 类型严格，不要手动标注更窄的类型
