# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 项目概述

**文物大数据与人工智能集成系统** — 大创项目，人机协作的文化遗产数据平台。核心功能：数据管理、知识图谱、AI 智能问答。

项目规划与阶段状态详见 `.planning/` 目录。

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | Vite + React + TypeScript + Ant Design | React 19, AntD 5 |
| 后端 | Python FastAPI | 3.12（最低 3.10） |
| AI | LangChain + LightRAG | LangChain 0.3 |
| 关系数据库 | SQLite（WAL 模式） | - |
| 图数据库 | Neo4j | 5.x |
| 认证 | JWT（bcrypt） | - |

---

## 常用命令

```bash
# 后端
cd backend && .venv\Scripts\activate  # Windows
uvicorn app.main:app --reload --port 8000
pytest tests/ -v

# 前端
cd frontend
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

---

## 项目结构（关键路径）

```
backend/app/
  main.py          # FastAPI 入口
  config.py        # pydantic-settings，.env 加载
  database.py      # SQLite + WAL，_ensure_new_columns() 迁移
  models/          # SQLAlchemy 模型
  routers/         # API 路由
  services/        # 业务逻辑
  ai/              # LightRAG 服务
frontend/src/
  pages/           # 页面（Chat, Graph, Artifacts...）
  api/             # API 封装
data/final/        # 771 条清洗后的文物数据
docs/              # PRD, pitfalls, technical-debt（只读参考）
.planning/         # GSD 规划、roadmap、phase 状态
```

---

## GitHub 仓库配置

**仓库**: https://github.com/LittleDrinks/artifact-data-dashboard
**默认分支**: `main`

### CI/CD 工作流

| Workflow | 触发条件 | 说明 |
|----------|----------|------|
| `.github/workflows/ci.yml` | PR / push to `main` | ruff lint/format, pytest, npm lint, tsc |
| `.github/workflows/coderabbit.yml` | PR `opened/reopened/synchronize` | AI PR review，模型 `deepseek-v4-flash` |
| `.github/workflows/lighthouse.yml` | PR / push to `main` | Lighthouse CI 性能检测 |

### 已安装 GitHub Apps

- **CodeRabbit**: AI PR review（OSS 版），模型 `deepseek-v4-flash`
- **Lighthouse CI**: 前端性能报告，报告上传至 `temporary-public-storage`

### Secrets

| Secret | 用途 |
|--------|------|
| `DEEPSEEK_API_KEY` | CodeRabbit AI review |
| `LHCI_GITHUB_APP_TOKEN` | Lighthouse CI PR 评论 |

### 分支保护规则

| 规则 | 说明 |
|------|------|
| 禁止删除/force push | 保护 main 分支历史 |
| 必须通过 PR merge | 不允许直接 push 到 main |
| 必须 resolve review conversations | 所有 PR review comments 需标记 resolved |
| 必须 pass status checks | backend + frontend CI 全绿 |
| dismiss stale reviews on push | push 新代码后旧 review 自动失效 |

### PR 流程

1. 从 `main` 切功能分支
2. push 后 CodeRabbit 自动 review
3. **手动 resolve Copilot/CodeRabbit 的 review conversations**
4. CI 全绿后手动 merge

---

## 核心架构

```
SQLite (artifacts) ──┐
                     ├──> 知识图谱页面 (/graph)
Neo4j (规则三元组) ──┘

LightRAG KV Store ────> AI 问答 (/chat)

Neo4j + LightRAG ────> 知识抽取 (/knowledge) — ⚠️ 数据不互通
```

**技术债务**: 见 `.planning/technical-debt.md`。

---

## Agent 使用规范

详见 `AGENTS.md` — 包含任务拆分、死循环预防、清理检查清单、Kimi prompt 规则等完整规范。

核心要点：
- 派 agent 时**必须**指定 `model` 参数：`opus`（架构决策）、`sonnet`（日常开发，默认）、`haiku`（简单查询）
- **前端改动必须用浏览器验证** — 启动 dev server，打开页面，确认数据和交互正常
- Agent 死循环预警信号：50 次 tool calling 后仍在重复读文件 → 立即 kill，拆任务重新派发

---

## 关键约束

1. **本地开发优先**：直接跑 FastAPI + Vite dev，不用 Docker
2. **不要问用户**：参考 docs/ 文档，拿不准按最简方案
3. **不要修改 docs/ 和 demo/**
4. **数据已有**：`data/final/` 有 771 条文物数据
5. **端口**：后端 8000，前端 5173
6. **Python 版本**：3.10+，必须用虚拟环境
7. **Windows 环境**：`open()` 加 `encoding='utf-8'`，路径用 `os.path.join`

---

## 工作模式（协作约定）

### Review 处理流程

处理 Copilot / CodeRabbit PR review 时遵循以下顺序：

1. **逐条 reply** — 在每条 review comment 下直接回复，不在 PR 发 summary comment。
2. **修了标注 commit** — 回复格式
3. ：`✅ Fixed in commit <hash>: <根因说明>`。
4. **不用修就 rebuttal** — 在代码对应位置加注释声明原因，回复格式：`📝 Rebuttal — <解释>`。
5. **用户有权喊停** — 如果用户说"先这样，我不想改了"，尊重判断，不再纠缠，继续推进主线任务。

### PR 管理

- **聚焦 merge** — 当前 PR 的首要目标是合并，不要引入不相关的改动。
- **无关改动拆 PR** — workflow、文档更新、工具配置等非功能改动，单独开分支和 PR。
- **技术债务同步** — 发现的技术债务记录到 `.planning/technical-debt.md`，并同步到 GitHub Issues。
- **新建 PR 后必须等 review** — push 后不要立刻告诉用户"完成了"。等待 Copilot / CodeRabbit 跑完 review，逐条处理建议（
- 修复或 rebuttal），直到没有新的 blocking 评论，再通知用户检查并 merge。
- **AI Review 语言** — 已通过 `.coderabbit.yaml` 和 `.github/copilot-instructions.md` 要求 CodeRabbit / Copilot 用**简体中文**回复。如果 review 仍用英文，在首条 rebuttal 中追加提醒：`请用中文回复。`

---

## 踩坑记录

实时追加到 `docs/pitfalls.md`。

关键踩坑：
- POST SSE 不能用 EventSource，必须用 `fetch` + `ReadableStream`
- Windows 下 `open()` 必须指定 `encoding='utf-8'`
- `package.json` 有 `"type": "module"`，配置文件用 `.cjs` 而非 `.js`
- recharts TypeScript 类型严格，不要手动标注更窄的类型
