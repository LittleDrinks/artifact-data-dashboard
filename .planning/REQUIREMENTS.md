# Requirements: 文物大数据与人工智能集成系统

**Defined:** 2026-05-10
**Core Value:** 让系统稳定、安全、可演示

## v1 Requirements

### Security (SEC)

- [ ] **SEC-01**: JWT_SECRET_KEY 非默认值启动校验 — 若默认值且 DEBUG=False 则拒绝启动
- [ ] **SEC-02**: DEBUG 默认改为 False，通过 `.env` 覆盖
- [ ] **SEC-03**: Cypher 查询标签参数化 + 白名单校验
- [ ] **SEC-04**: repair.py 图片下载 SSRF 防护（域名/IP/大小/Content-Type 四重校验）
- [ ] **SEC-05**: ReactMarkdown XSS 过滤（rehype-sanitize）
- [ ] **SEC-06**: CORS 收紧为实际前端域名
- [ ] **SEC-07**: 管理员密码强制从环境变量读取

### Reliability (REL)

- [ ] **REL-01**: 修复 DeepSeek API 400（SEV-1）— 剥离非 reasoner 模型的 reasoning_content
- [ ] **REL-02**: SQLite graph search 空指针修复（n.properties or {}）
- [ ] **REL-03**: SSE 生成器与 Session 解耦
- [ ] **REL-04**: 同步 ORM 临时方案（run_in_threadpool 包裹）
- [ ] **REL-05**: docker-compose env_file 路径修正
- [ ] **REL-06**: Health check 深度探测（SQLite/Neo4j/AI API）

### Testing (TEST)

- [ ] **TEST-01**: Python 3.12 环境统一 + pytest/httpx 写入 requirements-dev.txt
- [ ] **TEST-02**: repair 核心功能单元测试（mock cv2.inpaint）
- [ ] **TEST-03**: chat/ask SSE 端点单元测试（mock stream_chat_response）
- [ ] **TEST-04**: graph 查询/导入/导出端点单元测试
- [ ] **TEST-05**: GitHub Actions CI 搭建（PR 触发 pytest + Playwright）

### Frontend (FE)

- [ ] **FE-01**: Chat.tsx 拆分为 ChatContainer + MessageList + useSSE
- [ ] **FE-02**: Graph.tsx 拆分为 useGraphSimulation + CanvasRenderer
- [ ] **FE-03**: PrivateRoute Token 校验增强（请求 /auth/me 预热）
- [ ] **FE-04**: 前端表单字段补全（material/museum/source_url/dimensions）
- [ ] **FE-05**: E2E 硬等待 → 状态等待（expect().toBeVisible()）
- [ ] **FE-06**: 恢复 knowledge.spec.ts 3 个 skip 用例

### Documentation (DOC)

- [ ] **DOC-01**: README 补全（前置要求、运行测试、贡献指南）
- [ ] **DOC-02**: 补齐 docs/technical-debt.md（从 architecture.md §7 提取）
- [ ] **DOC-03**: 补齐 docs/deployment.md（生产部署、环境变量清单）
- [ ] **DOC-04**: 补齐 docs/testing.md（测试策略、fixtures 说明）
- [ ] **DOC-05**: 补齐 docs/security.md（认证机制、密钥管理、已知风险）

## v2 Requirements

### Architecture (ARCH)

- **ARCH-01**: Neo4j/LightRAG 统一知识网关设计
- **ARCH-02**: Alembic 迁移体系建立
- **ARCH-03**: AsyncSession + create_async_engine 全链路迁移
- **ARCH-04**: LightRAG 线程模型修复（asyncio.run_coroutine_threadsafe）

### Security v2 (SEC2)

- **SEC2-01**: JWT 从 localStorage → httpOnly Cookie
- **SEC2-02**: 限流器 SQLite 持久化（替代内存字典）
- **SEC2-03**: 双 LLM 降级策略（主 API 超时 → 备用配置）

### Frontend v2 (FE2)

- **FE2-01**: 消息虚拟滚动（react-window / react-virtuoso）
- **FE2-02**: 前端组件测试引入（Vitest + RTL）
- **FE2-03**: ImageRepair E2E 补全
- **FE2-04**: 前端样式体系化（CSS Modules / Tailwind）— 触发条件：有设计资源

## Out of Scope

| Feature | Reason |
|---------|--------|
| 自研 LLM | 成本极高，无团队能力 |
| 微服务拆分 | 单实例部署足够，过度设计 |
| 多租户 | 非项目目标 |
| 实时协同编辑 | 超出大创范围 |
| PostgreSQL 迁移 | 当前 771 条数据 SQLite 够用，触发条件 >5000 条 |
| Redis 缓存层 | 单实例部署无需共享存储 |
| Playwright 跨浏览器（WebKit/Firefox） | 面向公众发布前才需要 |
| API 版本策略（/api/v1/） | 需要 breaking change 时触发 |
| 前端样式体系化（Tailwind/CSS Modules）| 面试展示加分项，P2 或 P3 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |
| SEC-04 | Phase 1 | Pending |
| SEC-05 | Phase 1 | Pending |
| SEC-06 | Phase 1 | Pending |
| SEC-07 | Phase 1 | Pending |
| REL-01 | Phase 1 | Pending |
| REL-02 | Phase 1 | Pending |
| REL-03 | Phase 2 | Pending |
| REL-04 | Phase 2 | Pending |
| REL-05 | Phase 1 | Pending |
| REL-06 | Phase 2 | Pending |
| TEST-01 | Phase 1 | Pending |
| TEST-02 | Phase 2 | Pending |
| TEST-03 | Phase 2 | Pending |
| TEST-04 | Phase 2 | Pending |
| TEST-05 | Phase 1 | Pending |
| FE-01 | Phase 2 | Pending |
| FE-02 | Phase 2 | Pending |
| FE-03 | Phase 1 | Pending |
| FE-04 | Phase 1 | Pending |
| FE-05 | Phase 2 | Pending |
| FE-06 | Phase 2 | Pending |
| DOC-01 | Phase 1 | Pending |
| DOC-02 | Phase 1 | Pending |
| DOC-03 | Phase 2 | Pending |
| DOC-04 | Phase 2 | Pending |
| DOC-05 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-10*
*Last updated: 2026-05-10 after project initialization*
