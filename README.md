# 文物大数据与人工智能集成系统

人机协作的文化遗产数据平台，核心功能：数据管理、知识图谱、AI 智能问答。

## 快速启动

### Docker（推荐）

```bash
# 1. 复制环境变量并填入 API Key
cp .env.example .env

# 2. 一键启动
docker compose up -d

# 3. 访问
# 前端：http://localhost
# 后端：http://localhost:8000/docs
```

### 本地开发

```bash
# 后端
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev                    # http://localhost:5173
```

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| AI_API_KEY | Chat 问答 LLM API Key | 是 |
| AI_API_BASE | Chat 问答 API 地址 | 是 |
| AI_MODEL_NAME | Chat 问答模型名 | 是 |
| LIGHTRAG_API_KEY | 知识图谱提取 LLM API Key | 是 |
| LIGHTRAG_API_BASE | 知识图谱提取 API 地址 | 是 |
| LIGHTRAG_MODEL_NAME | 知识图谱提取模型名 | 是 |
| NEO4J_URI | Neo4j 连接地址 | 否（默认 bolt://localhost:7687） |
| NEO4J_PASSWORD | Neo4j 密码 | 否 |

## 技术栈

- **前端**：Vite + React 19 + TypeScript + Ant Design 5
- **后端**：Python 3.12 + FastAPI + SQLAlchemy 2.0
- **AI**：LangChain + LightRAG（embedding: sentence-transformers/bge-m3）
- **数据库**：SQLite（WAL）+ Neo4j 5
- **认证**：JWT + bcrypt

## 项目结构

```
├── backend/           # FastAPI 后端
│   ├── app/
│   │   ├── main.py    # 入口
│   │   ├── config.py  # 配置
│   │   ├── routers/   # API 路由
│   │   ├── services/  # 业务逻辑
│   │   ├── models/    # 数据模型
│   │   └── ai/        # LightRAG + 工具调用
│   └── requirements.txt
├── frontend/          # React 前端
│   ├── src/
│   │   ├── features/  # 功能模块
│   │   ├── api/       # API 调用层
│   │   └── router/    # 路由
│   └── package.json
├── data/              # 数据资产
├── scripts/           # 数据脚本
└── docs/              # 文档
    ├── PRD.md         # 产品需求
    ├── specs/         # API 与页面规格
    ├── stripe/        # 前端设计规范
    └── 背景调研.md
```