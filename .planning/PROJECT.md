# 文物大数据与人工智能集成系统

## What This Is

一个基于人机协作的文化遗产数据平台，核心功能包括文物数据管理、知识图谱可视化、AI 智能问答。面向大创项目答辩和文化遗产领域研究人员。

## Core Value

打造可展示技术深度的高质量全栈项目——代码整洁、架构合理、测试完备、文档齐全，能在面试中清晰讲述设计决策和问题解决过程。

## Requirements

### Validated

- 文物数据的 CRUD 管理（SQLite 存储，771 条数据已入库）
- JWT 认证体系（登录/注册/Token 刷新）
- 知识图谱可视化（D3 + Canvas 渲染，Neo4j 规则三元组）
- AI 智能问答（LightRAG + SSE 流式响应）
- 统计数据仪表盘（echarts 图表）
- 图片修复功能（OpenCV inpaint）

### Active

- [ ] 修复 SEV-1：DeepSeek API 400 导致 AI 问答中断
- [ ] 安全加固：JWT 硬编码、DEBUG=True、Cypher 注入、SSRF
- [ ] 建立 CI/CD 流水线（GitHub Actions）
- [ ] 补全核心测试覆盖（repair/chat/ask/graph）
- [ ] 前端巨石组件拆分（Chat.tsx / Graph.tsx）
- [ ] 统一知识网关设计（Neo4j ↔ LightRAG 数据同步）
- [ ] 补齐关键文档（部署/测试/安全/数据库 schema）
- [ ] 前端样式体系重构（Tailwind / CSS Modules）
- [ ] PostgreSQL 迁移评估（展示数据库选型决策能力）

### Out of Scope

- 自研 LLM — 成本极高，无团队能力
- 微服务拆分 — 单实例部署足够，过度设计
- 多租户 — 非项目目标
- 实时协同编辑 — 超出大创范围
- PostgreSQL 迁移 — 当前 771 条数据 SQLite 完全够用，触发条件 >5000 条
- Redis 缓存层 — 单实例部署无需共享存储
- 前端样式体系重构（Tailwind/CSS Modules）— 面试展示加分项，可纳入 P2

## Context

**项目背景**：大创项目（大学生创新创业训练计划），团队规模 3-4 人，以答辩可演示为首要目标。

**技术债务现状**：
- 综合健康评分 62/100（🔴）
- 16 项安全债务（JWT 硬编码、Cypher 注入、SSRF、XSS）
- 同步 ORM 阻塞异步 FastAPI 事件循环
- Neo4j 与 LightRAG 数据完全隔离，ROI 极低
- repair/chat/ask 零测试覆盖，无 CI/CD
- docker-compose env_file 路径错误

**开发环境**：
- Windows 11 + WSL（Docker 在 WSL 内部，无 Docker Desktop）
- 本机直接跑 FastAPI + Vite dev，生产用 WSL/Docker
- Python 3.12（最低 3.10），必须用虚拟环境

**数据状态**：
- `data/final/` 771 条清洗后文物数据
- category 被 Wikipedia 污染，JUNK_CATEGORIES 硬编码
- image_url 存页面链接（外链易失效）

## Constraints

- **Timeline**: 无硬 deadline，追求质量而非速度，按阶段稳步交付
- **Team Size**: 3-4 人，含前后端全栈，无专职 SRE/测试
- **Tech Stack Locked**: FastAPI + React19 + AntD5 + SQLite + Neo4j + LightRAG，不新增依赖（除 Alembic、pytest）
- **Deployment**: 生产环境必须用 WSL + Docker，本机开发直接跑
- **Budget**: 学生项目，零预算，DeepSeek API 已付费
- **Compatibility**: Windows 开发优先（`open()` 必须 `encoding='utf-8'`）

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 保留 Neo4j + LightRAG 双存储 | 答辩需要展示知识图谱，移除 Neo4j 影响可视化 | ⚠️ Revisit — 需统一知识网关 |
| 短期用 `run_in_threadpool` 包裹同步 ORM | AsyncSession 迁移成本 3 天，答辩前不现实 | — Pending |
| GitHub Flow 轻量版（main 即生产） | 团队小，不设 develop 分支 | — Pending |
| 测试策略：后端 pytest + 前端 Playwright E2E | 学生项目，组件测试优先级低于功能覆盖 | — Pending |
| JWT 短期保留 localStorage，中期迁 httpOnly Cookie | httpOnly 需前后端配合，P2 处理 | — Pending |

## Evolution

**更新规则**：
- 每阶段完成后：验证需求是否完成，决策是否需重新评估
- 每里程碑后：全面审查所有章节，核心目标是否仍正确
- 技术债务变更：同步更新 `docs/technical-debt.md`

---
*Last updated: 2026-05-10 after project initialization*
