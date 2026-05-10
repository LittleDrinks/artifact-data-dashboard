# Roadmap: 文物大数据与人工智能集成系统

**Created:** 2026-05-10
**Project:** 棕地项目治理 — 止血 → 加固 → 打通

---

## Phase 1: 止血（P0 安全与可用性修复）

**Goal:** 消除所有阻断性缺陷，建立安全的代码基线
**Duration:** 1-2 周（质量优先，不赶工）
**Owner:** 全栈团队

### Tasks

1. **SEV-1 修复**：DeepSeek API 400 — 剥离非 reasoner 模型的 reasoning_content
2. **安全加固**：JWT 硬编码校验、DEBUG→False、CORS 收紧、管理员密码强制
3. **基础设施**：docker-compose env_file 路径修正、Python 3.12 统一、pytest 依赖
4. **前端安全**：ReactMarkdown XSS 过滤（rehype-sanitize）
5. **空指针修复**：SQLite graph search 防御式编程
6. **文档补齐**：README、technical-debt.md
7. **CI 骨架**：GitHub Actions 基础配置（lint + build）

### Success Criteria

- [ ] AI 问答功能恢复（DeepSeek 400 不再出现）
- [ ] `docker-compose up` 一次启动成功
- [ ] pytest 可运行（至少 10+ smoke 测试通过）
- [ ] 安全扫描无 P0 级漏洞（JWT/SSRF/Cypher 注入已修复）
- [ ] README 包含完整的前置要求和启动说明

### Exit Gate

- CI 流水线通过
- 手动验证：登录 → 文物列表 → AI 问答 → 知识图谱 → 图片修复

---

## Phase 2: 加固（P1 架构与测试覆盖）

**Goal:** 核心功能有测试保护，架构债务得到缓解，代码可维护
**Duration:** 3-4 周
**Owner:** 全栈团队

### Tasks

1. **Cypher 注入修复**：标签参数化 + 白名单
2. **SSRF 修复**：repair.py 四重校验
3. **同步 ORM 临时方案**：run_in_threadpool 包裹数据库操作
4. **SSE 解耦**：生成器与 Session 分离
5. **测试补全**：repair/chat/ask/graph 核心单元测试
6. **CI 完善**：Playwright E2E 接入、覆盖率统计
7. **前端拆分**：Chat.tsx → ChatContainer + MessageList + useSSE
8. **前端拆分**：Graph.tsx → useGraphSimulation + CanvasRenderer
9. **PrivateRoute 增强**：Token 有效性预热校验
10. **E2E 优化**：硬等待 → 状态等待，恢复 skip 用例
11. **文档补齐**：deployment.md、testing.md、security.md

### Success Criteria

- [ ] 后端测试覆盖率 ≥ 60%
- [ ] CI 全绿（pytest + Playwright）
- [ ] Chat.tsx < 500 行，Graph.tsx < 500 行
- [ ] 无 E2E 硬等待（全部改为状态断言）
- [ ] 部署文档可让新成员 1 天跑通环境

### Exit Gate

- 代码审查通过（至少 1 人 Approve）
- 全量测试通过
- 手动回归验证通过

---

## Phase 3: 打通（P2 架构演进）

**Goal:** 解决 Neo4j/LightRAG 数据孤岛，建立工程规范，展示架构设计能力
**Duration:** 4-6 周
**Owner:** 后端为主

### Tasks

1. **统一知识网关设计**：Neo4j ↔ LightRAG 联合查询方案
2. **知识同步管道**：ainsert → 解析实体 → 写入 Neo4j → 触发重索引
3. **Alembic 迁移体系**：替代 `_ensure_new_columns`
4. **限流持久化**：SQLite 替代内存字典
5. **JWT httpOnly Cookie**：前后端配合迁移
6. **Health check 深度探测**：SQLite/Neo4j/AI API 状态
7. **前端组件测试**：Vitest + RTL 引入
8. **LightRAG 线程模型修复**：消除 asyncio.run 嵌套

### Success Criteria

- [ ] AI 问答可查询 Neo4j 规则三元组
- [ ] 知识抽取结果可被 AI 使用
- [ ] Alembic migration 脚本可正常升降级
- [ ] 限流器多 worker 场景有效
- [ ] 前端核心组件有单元测试

### Exit Gate

- 架构评审通过
- 数据同步端到端验证
- 性能基准测试（并发 5+ 用户）

---

## Phase 4: 演进（P3 可选扩展）

**Goal:** 按需扩展，提升可维护性和用户体验
**Duration:** 按需触发
**Owner:** 团队自主决定

### Trigger Conditions

| 任务 | 触发条件 |
|------|----------|
| PostgreSQL 迁移 | 文物数据 > 5000 条 或 写入 QPS > 10 |
| Redis 缓存层 | 多实例部署 |
| 消息虚拟滚动 | 长会话 > 100 条消息 |
| 前端样式体系化 | 前端团队有设计资源 |
| 双 LLM 降级策略 | 生产环境高可用要求 |
| 结构化日志 + 可观测性 | 部署到公有云 |
| 批量文物导入（CSV/Excel） | 产品需求 |
| 聊天会话导出（Markdown/PDF） | 产品需求 |

### Out of Scope（坚决不做）

- 自研 LLM
- 微服务拆分
- 多租户
- 实时协同编辑

---

## Milestones

| Milestone | Phase | Target | Definition of Done |
|-----------|-------|--------|-------------------|
| v0.1 止血版 | Phase 1 | 2026-05-24 | SEV-1 修复 + CI 通过 + README 完整 |
| v0.2 加固版 | Phase 2 | 2026-06-21 | 测试覆盖 60% + 巨石拆分 + 部署文档 |
| v0.3 打通版 | Phase 3 | 2026-08-02 | 统一知识网关 + Alembic + httpOnly |
| v1.0 展示版 | Phase 4 | 按需 | 所有 P0-P2 完成 + 面试展示就绪 |

---

*Roadmap created: 2026-05-10*
*Last updated: 2026-05-10 after project initialization*
