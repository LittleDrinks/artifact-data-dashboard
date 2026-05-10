# 文物大数据与人工智能集成系统 — 项目治理规划

> 评审角色：产品评审员（CEO/设计/工程/DX 评审专家）
> 日期：2026-05-10
> 目标读者：GStack 工程团队、学生开发团队

---

## 1. 开发者协作管理模式

### 1.1 Git 工作流选择：GitHub Flow（轻量版）

**推荐方案：GitHub Flow 简化版**，理由如下：

| 工作流 | 适用场景 | 本项目匹配度 |
|--------|---------|------------|
| Git Flow | 大型团队、严格版本发布周期 | ❌ 过重，学生团队难以维护 release/hotfix 分支 |
| GitHub Flow | 持续交付、Web 应用、小团队 | ✅ 主分支即生产，PR 驱动开发 |
| Trunk-based | 极客团队、Feature Flag 成熟 | ⚠️ 需要强自动化，当前无 CI/CD 不适合 |

**本项目规则**：
- `main` 为主分支，始终保持可部署状态
- 所有开发通过功能分支 → Pull Request → 合并到 `main`
- **不设 `develop` 分支**，减少合并层级（学生团队容易在分支合并时出错）
- 紧急修复走同样的 PR 流程，但允许 "reviewer 在线口头确认" 后合并

### 1.2 分支命名规范

```
feature/artifact-export-csv      # 新功能
fix/deepseek-400-reasoning       # Bug 修复
fixup/jwt-hardcoded-secret       # 安全修复
refactor/chat-component-split    # 重构
docs/deployment-guide            # 文档
chore/alembic-migration          # 工程化
```

**约束**：
- 小写 + 连字符分隔
- 必须以类型前缀开头
- 描述控制在 3-5 个英文单词

### 1.3 Commit 规范（轻量版 Conventional Commits）

```
<type>: <简短描述>

[可选：详细描述，说明为什么改而非怎么改]
```

| 类型 | 使用场景 |
|------|---------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `sec` | 安全修复（单独标记以便审计） |
| `refactor` | 不改变行为的代码重构 |
| `test` | 补充/修改测试 |
| `docs` | 仅文档变更 |
| `chore` | 工程化、依赖升级、配置调整 |

**学生团队特批简化**：
- 允许中文 commit message（鼓励表达清晰）
- 但安全修复必须用 `sec:` 前缀
- 不强制要求 body 和 footer

### 1.4 PR 规范

**PR 标题格式**：`[类型] 简短描述`，如 `[fix] 修复 DeepSeek API 400 错误导致 AI 问答中断`

**PR 描述模板**（写入 `.github/pull_request_template.md`）：

```markdown
## 变更内容
- 

## 关联问题
Fixes #issue编号（如有）

## 测试方式
- [ ] 本地手动验证通过
- [ ] 新增/更新测试用例
- [ ] E2E 测试通过

## 自检清单
- [ ] 敏感信息未硬编码
- [ ] 异步函数未使用同步 IO
- [ ] 前端 XSS 防护已考虑
```

**合并规则**：
- 至少 **1 人 Code Review Approve**（团队 3-4 人时足够）
- CI 通过（建立后）
- 由作者自己合并（own your code）

### 1.5 轻量化代码审查策略

**学生团队痛点**：没有专职 reviewer，review 容易流于形式。

**落地策略**：

1. **按风险分级审查**：
   | 变更类型 | 审查要求 |
   |---------|---------|
   | 安全相关（auth、config、repair） | 必须有人逐行 review |
   | AI 核心逻辑（chat、tools） | 必须有人逐行 review |
   | 数据层（models、database） | 必须有人逐行 review |
   | UI 纯样式调整 | 可快速浏览通过 |
   | 文档更新 | 可快速浏览通过 |

2. **Review Checklist（Reviewer 必查）**：
   - [ ] 是否有新的硬编码密钥/密码？
   - [ ] 是否有同步 IO 进入异步路由？
   - [ ] 是否有用户输入拼接进查询（SQL/Cypher）？
   - [ ] 是否有未处理的异常可能泄露敏感信息？
   - [ ] 前端渲染是否过滤了用户/AI 生成的 HTML？

3. **自动化辅助**（降低人工负担）：
   - GitHub Actions 跑 pytest + Playwright（建立后）
   - 引入 `ruff`（Python linter）+ `eslint`（TS linter）自动检查代码风格
   - 引入 `bandit`（Python 安全扫描）自动标记高危模式

### 1.6 开发者 Onboarding 流程

目标：新成员 **1 天内** 能本地跑通项目，**3 天内** 能提交第一个 PR。

**Step 1：环境准备（30 分钟）**
- 提供 `.env.example`（所有必填环境变量 + 说明）
- 提供 `scripts/setup.ps1`（Windows）和 `scripts/setup.sh`（Mac/Linux）一键初始化

**Step 2：代码结构导览（30 分钟）**
- 阅读 `docs/architecture.md` §2-3
- 重点看一个完整链路：`frontend/src/api/artifacts.ts` → `routers/artifacts.py` → `services/artifact.py` → `models/artifact.py`

**Step 3：本地运行（30 分钟）**
```bash
docker-compose up -d neo4j   # 仅启动 Neo4j
cd backend && uvicorn app.main:app --reload
cd frontend && npm run dev
```

**Step 4：第一个任务（由组长分配）**
- 推荐：修复一个 `good-first-issue` 标签的 bug（如文档 typo、简单 UI 调整）
- 走完整 PR 流程体验协作规范

**必须补全的 onboarding 资产**：
| 缺失资产 | 优先级 | 说明 |
|---------|--------|------|
| `.env.example` | P0 | 当前缺失，新成员无从知晓需要哪些环境变量 |
| `scripts/setup.ps1` | P1 | Windows 开发环境一键初始化 |
| `docs/CONTRIBUTING.md` | P1 | 协作规范、提交规则、PR 流程 |
| `docs/development.md` | P1 | 本地开发指南、常见问题排错 |

---

## 2. 项目优先级排序矩阵

### 优先级定义

| 优先级 | 时间要求 | 不修复的后果 |
|--------|---------|-------------|
| **P0** | 立即（1-3 天） | 系统不可用、数据泄露、安全事件 |
| **P1** | 本周（1 周内） | 核心功能缺陷、显著安全风险、阻塞开发效率 |
| **P2** | 两周内（2 周） | 架构债务、可维护性问题、中等安全风险 |
| **P3** | 本月+（按需） | 性能优化、体验改进、技术前瞻 |

### P0 — 立即处理（Blocking）

| # | 问题 | 根因 | 修复建议 | 估时 |
|---|------|------|---------|------|
| P0-1 | **SEV-1: DeepSeek API 400 错误 → AI 问答完全中断** | `reasoning_content` 无条件传回非 reasoner 模型；错误码误判触发无效重试 | 构造 API 请求前剥离非 reasoner 模型的 `reasoning_content`；将 reasoning 400 从 tool-fallback 分支独立处理 | 1d |
| P0-2 | **JWT_SECRET_KEY 硬编码** | `config.py` 默认值 `"your-secret-key-change-in-production"` | 启动时强制校验：若为默认值且 `DEBUG=False`，拒绝启动抛异常；开发环境用 `.env.example` 引导 | 0.5d |
| P0-3 | **DEBUG 默认 True** | 生产环境泄露异常堆栈、SQL echo | 默认改为 `False`；环境变量强制控制 | 0.5d |
| P0-4 | **Python 3.9/3.10 语法兼容** | `X \| None` 等语法在 3.9 报错 | 统一 Python 3.12 环境；`requirements-dev.txt` 加入 pytest/httpx | 1d |
| P0-5 | **docker-compose env_file 路径错误** | 指向根目录而非 `./backend/.env` | 修正路径或建软链接 | 即时 |
| P0-6 | **ReactMarkdown XSS（前端）** | 未使用 `rehype-sanitize` 过滤 AI 生成内容 | 引入 `rehype-sanitize`，禁止渲染 raw HTML | 0.5d |

### P1 — 本周处理（High Priority）

| # | 问题 | 风险/影响 | 修复建议 | 估时 |
|---|------|----------|---------|------|
| P1-1 | **Cypher 注入** | `graph.py` f-string 拼接标签名 | 参数化查询 + 标签白名单（仅允许 `artifact`/`era`/`category`/`location`/`tag`/`entity`） | 1d |
| P1-2 | **SSRF（repair.py）** | `requests.get(url)` 下载任意 URL | URL 域名白名单 + 文件大小限制（≤10MB）+ Content-Type 校验（仅 image/*） | 1d |
| P1-3 | **同步 ORM 阻塞异步事件循环** | FastAPI 异步路由中全程使用同步 `Session` | 短期：`run_in_threadpool` 包裹数据库操作；中期：迁移 `AsyncSession` | 2d |
| P1-4 | **SSE 生成器内直接操作同步 Session** | 长连接占用连接不释放 | 流式生成器与数据库操作解耦：先读写数据，再独立 yield | 1d |
| P1-5 | **Chat.tsx 巨石组件（1800+ 行）** | 维护困难、Bug 率高 | 拆分为 `ChatContainer` + `MessageList` + `RAGPanel` + `useSSE` | 2d |
| P1-6 | **Graph.tsx 巨石组件（1100+ 行）** | D3 逻辑与渲染耦合 | 拆分为 `useGraphSimulation` + `CanvasRenderer` + `GraphControls` | 2d |
| P1-7 | **repair/chat/ask 零测试覆盖** | 回归风险极高 | 补充 pytest 单元测试：正常/异常/边界/mock | 2d |
| P1-8 | **无 CI/CD** | 无法自动验证 PR | GitHub Actions：PR 时自动跑 pytest + ruff + build | 2d |
| P1-9 | **PrivateRoute 不验证 token 有效性** | 过期 token 仍可进入受保护页面 | 页面加载时调用 `/auth/me` 校验；或前端解码 JWT 预判过期 | 0.5d |
| P1-10 | **SQLite graph search 空指针（SEV-2）** | `n.properties` 为 None 时调用 `.get()` | 防御式 `(n.properties or {}).get()` + GraphNode 默认 `properties={}` | 0.5d |

### P2 — 两周内处理（Medium Priority）

| # | 问题 | 风险/影响 | 修复建议 | 估时 |
|---|------|----------|---------|------|
| P2-1 | **Neo4j 与 LightRAG 数据孤岛** | AI 问答不查 Neo4j，知识抽取结果不可被 AI 使用 | 设计统一知识网关：`query_knowledge_graph` 联合查询 Neo4j + LightRAG | 方案 2d + 实现 3d |
| P2-2 | **知识抽取页面伪实现** | `ainsert` 后 Neo4j 查询为空，数据孤岛化 | 明确提示用户 "抽取结果暂不可用于 AI 问答"；中期重构同步管道 | 0.5d（提示）+ 3d（重构） |
| P2-3 | **SQLite 无迁移体系** | `_ensure_new_columns` 临时方案，schema 演进不可追溯 | 引入 Alembic；将临时方案转为正式 migration | 1d |
| P2-4 | **限流器单进程内存字典** | 多 worker 部署失效、重启丢失 | 短期：SQLite 持久化限流日志；中期：Redis | 1d |
| P2-5 | **JWT 存 localStorage** | XSS 可导致 Token 窃取 | 评估迁移 `httpOnly` Cookie（需后端配合 CSRF 防护） | 2d |
| P2-6 | **CORS 过宽** | `allow_methods=["*"]` / `allow_headers=["*"]` | 生产环境收紧为实际前端域名 + 显式方法白名单 | 0.5d |
| P2-7 | **前端表单字段缺失** | `material`/`museum`/`source_url`/`dimensions` 无前端维护入口 | 补全编辑弹窗表单字段 | 0.5d |
| P2-8 | **Health check 无深度探测** | 仅返回 `{"status":"ok"}` | 增加 SQLite/Neo4j/AI API 探活 | 0.5d |
| P2-9 | **文档缺失严重** | `technical-debt.md` 缺失、无部署/运维/安全文档 | 按 P0-P2 补全：README 贡献指南、deployment.md、security.md、testing.md | 3d |
| P2-10 | **LightRAG 线程模型脆弱** | `threading.Thread` + `asyncio.run` 嵌套事件循环 | 使用 `asyncio.wait_for` + 可取消 Task；或引入 Celery | 2d |
| P2-11 | **ADMIN_DEFAULT_PASSWORD 弱密码** | 默认 `"admin123"` | 强制从环境变量读取；或随机生成并写入日志 | 0.5d |

### P3 — 本月及以后（Low Priority / 前瞻性）

| # | 问题 | 建议 | 触发条件 |
|---|------|------|---------|
| P3-1 | SQLite → PostgreSQL 迁移 | 设定阈值：文物数据 > 5000 条 或 写入 QPS > 10 或 需要多写者并发 | 数据量/并发达标 |
| P3-2 | 引入 Redis 缓存层 | 缓存热点统计、限流、会话 | 多实例部署时 |
| P3-3 | 消息虚拟滚动 | `react-window` 或 `react-virtuoso` | 长会话消息 > 100 条时 |
| P3-4 | API 版本策略 | 新增 `/api/v1/` 前缀 | 需要 breaking change 时 |
| P3-5 | 前端样式体系化 | CSS Modules / Tailwind | 前端团队有设计资源时 |
| P3-6 | 双 LLM 降级策略 | 主 API 故障时回退备用配置 | 生产环境高可用要求 |
| P3-7 | 前端单元测试（Vitest） | 补组件/Hook 测试 | 前端团队熟悉测试后 |
| P3-8 | 统一日志结构化（JSON） | 接入 OpenTelemetry | 需要运维可观测性时 |
| P3-9 | Playwright 跨浏览器扩展 | WebKit/Firefox | 面向公众发布前 |
| P3-10 | Neo4j 容器资源限制 | `mem_limit` / `cpus` | 部署到资源受限服务器时 |

---

## 3. 功能路线图（未来 6 个月）

### 核心约束声明

- **团队性质**：学生大创团队，人员可能流动，时间碎片化
- **技术能力**：以全栈开发为主，无专职运维/测试/安全工程师
- **目标导向**：以 "答辩 Demo 流畅 + 代码质量过关" 为近期核心，不为技术而技术
- **投入原则**：**砍过度设计，补关键债务，再谈新功能**

### 短期（1 个月内）—— 止血与可演示

**主题：让系统稳定、安全、可演示**

| 功能/任务 | 目标 | 优先级 |
|----------|------|--------|
| 修复 DeepSeek 400（SEV-1） | AI 问答恢复可用 | P0 |
| 安全加固（JWT、DEBUG、Cypher、SSRF、XSS） | 消除高危安全漏洞 | P0/P1 |
| 补全关键文档（README、部署指南、贡献指南） | 新成员可上手 | P1 |
| 建立 GitHub Actions CI（pytest + lint + build） | PR 有基本质量门禁 | P1 |
| 修复 docker-compose 部署 | 一键启动可用 | P0 |
| 前端巨石组件拆分（Chat/Graph） | 降低维护成本 | P1 |
| 修复 PrivateRoute 和 Token 校验 | 认证流程正确 | P1 |

**此阶段不做的**：
- ❌ 不迁移 PostgreSQL（当前 771 条数据，SQLite 完全够用）
- ❌ 不引入 Redis（单实例部署，内存限流够用）
- ❌ 不新增业务功能（除非答辩必需）

### 中期（1-3 个月）—— 打通与工程化

**主题：解决架构孤岛，建立工程规范**

| 功能/任务 | 目标 | 优先级 |
|----------|------|--------|
| **统一知识网关** | 让 AI 问答能查询 Neo4j 规则三元组 | P2 |
| **Neo4j ↔ LightRAG 同步管道** | 文物 CRUD 后自动同步到 Neo4j；知识抽取结果回流 | P2 |
| **Alembic 迁移体系** | Schema 变更可追溯 | P2 |
| **异步 ORM 迁移** | 消除同步 ORM 阻塞事件循环的根本矛盾 | P2 |
| **测试覆盖达标** | 后端核心模块覆盖 > 70%，Repair/Chat/Graph 零盲区 | P1 |
| **JWT httpOnly Cookie 迁移** | 消除 XSS 窃取 Token 风险 | P2 |
| **限流持久化** | 多 worker 环境下限流有效 | P2 |
| **文档补齐** | deployment.md、security.md、testing.md、database-schema.md | P2 |
| **前端表单字段补全** | `material`/`museum`/`source_url`/`dimensions` 可维护 | P1 |
| **健康检查深度探测** | `/api/health` 检查 SQLite/Neo4j/AI API | P2 |

**可考虑的新功能（仅在债务可控后）**：
- ✅ **批量文物导入**（CSV/Excel）—— 管理端效率提升，工作量中等
- ✅ **聊天会话导出**（Markdown/PDF）—— 用户价值高，工作量小

### 长期（3-6 个月）—— 演进与扩展

**主题：在质量基座稳固后，扩展产品能力**

| 功能/任务 | 价值 | 可行性评估 |
|----------|------|-----------|
| **数据层迁移 PostgreSQL** | 支持高并发写入、多实例部署 | 数据量 > 5000 条时启动；当前 771 条不着急 |
| **Redis 缓存层** | 热点统计缓存、分布式限流、Session 存储 | 多实例部署时必选 |
| **可观测性（日志/监控）** | 结构化日志 + 关键指标 Dashboard | 部署到公有云后需要 |
| **智能推荐增强** | 文物详情页 "相关文物" 从规则推荐升级为语义推荐（基于 LightRAG 向量相似度） | 需要 LightRAG 索引质量过关 |
| **多模态 AI 问答** | 支持上传文物图片进行 AI 识别/问答 | 工作量大，需评估模型成本 |
| **用户反馈闭环** | AI 回答 "点赞/点踩" 收集，用于后续 RAG 优化 | 产品价值高，工作量小 |
| **开放 API / 插件市场** | 将文物检索、图谱查询能力开放为标准化 API | 与项目 "人机协作" 哲学一致 |

**坚决不做（避免过度设计）**：
- ❌ 自研 LLM / 自研 Embedding 模型（成本和技术门槛过高）
- ❌ 微服务拆分（当前单体架构完全够用）
- ❌ 多租户/组织隔离（当前仅 admin/user 两级）
- ❌ 实时协同编辑（与核心场景无关）

---

## 4. 架构设计优化建议（产品视角）

### 4.1 Neo4j + LightRAG 双孤岛：决策建议

**现状诊断**：
- Neo4j 存储规则三元组（source='rule'），仅用于图谱可视化
- LightRAG 管理独立 KV Store，仅用于 AI 问答检索
- 两者无数据同步，投入 double 运维成本，无 synergy

**三个选项评估**：

| 选项 | 描述 | 优点 | 缺点 | 推荐度 |
|------|------|------|------|--------|
| **A. 以 Neo4j 为主，LightRAG 为向量索引层** | SQLite → Neo4j 同步规则三元组；Neo4j → LightRAG 同步文本做向量索引；AI 问答联合查询 | Neo4j 成为统一图谱 source of truth；可视化与 AI 共用同一知识库 | 需要维护同步管道；LightRAG 索引构建耗时 | ⭐⭐⭐ **推荐** |
| **B. 去掉 Neo4j，只用 LightRAG** | LightRAG 内置图存储足够支撑当前需求 | 砍掉一个容器，简化部署；学生团队维护成本低 | 丧失 Neo4j 图查询能力（复杂 traversal）；可视化需从 LightRAG 提取 | ⭐⭐ 资源紧张时可选 |
| **C. 保持现状，建立同步** | 维持双系统，只做数据互通 | 不动现有架构 | 运维成本不降；同步复杂度增加；ROI 仍低 | ⭐ 不推荐 |

**产品决策建议**：

**如果团队有 1 名后端成员能投入 1 周 → 选 A**：
- 将 `query_knowledge_graph` 工具改造为联合查询：先查 Neo4j 规则关系，再查 LightRAG 语义关系
- 文物 CRUD 后自动 `MERGE` 到 Neo4j（用 `source='rule'` 标记）
- 知识抽取后解析 LightRAG 内部实体，回写 Neo4j（用 `source='extracted'` 标记）
- 这样 Neo4j 真正成为 "统一知识图谱"，LightRAG 退化为 "AI 检索加速层"，与 PRD 中的 "混合知识图谱" 卖点一致

**如果团队人力紧张、以答辩为首要目标 → 选 B**：
- 直接去掉 Neo4j 容器和相关代码
- 图谱可视化从 SQLite 动态构建（当前已实现）
- AI 问答完全依赖 LightRAG
- 牺牲复杂图遍历能力，但当前 771 条数据根本不需要复杂 traversal

### 4.2 过度设计识别与砍减建议

| 疑似过度设计 | 现状 | 建议 |
|-------------|------|------|
| **Neo4j 容器** | 占 ~500MB 内存，但仅服务可视化回退 | 如果选 B（去掉 Neo4j），立即释放资源；如果选 A，必须让它服务 AI 问答 |
| **双 LLM 配置** | `AI_API_*` 和 `LIGHTRAG_API_*` 分开，但无降级策略 | **保留配置灵活性**（这是好设计），但需补充：① 配置校验（启动时验证两者可用性）② 文档明确推荐组合 ③ 短期可加 failover |
| **图像修复（OpenCV inpainting）** | Demo 级实现，SSRF 风险高，与核心文物数据管理关联弱 | **建议降级为 "实验性功能"**：加明显标识、限制使用次数、或移到独立服务；修复 SSRF 前禁止访问外网图片 |
| **附件表（attachments）** | 模型已定义，但 PRD 和代码审查中未见实际使用 | 若当前无文件上传功能，**暂缓实现**，避免 dead code |
| **LightRAG 本地实体提取** | RTX 4060 8GB 无法运行，已证明不可行 | 明确文档化 "仅支持云 API 模式"，去掉本地模式相关代码和配置 |

### 4.3 SQLite → PostgreSQL 迁移阈值建议

**当前 SQLite 完全够用的理由**：
- 771 条文物数据，SQLite 性能无压力
- WAL 模式支持读写并发
- 零配置、单文件备份简单
- 学生团队熟悉成本低

**建议触发迁移的阈值**（满足任一即启动评估）：

| 阈值指标 | 当前值 | 触发值 | 说明 |
|---------|--------|--------|------|
| 文物数据量 | 771 | > 5,000 | SQLite 单表 10k+ 开始性能下降 |
| 并发写入 QPS | < 1 | > 10 | WAL 模式写仍为串行 |
| 同时在线用户 | < 10 | > 50 | 连接池管理需求 |
| 多实例部署 | 无 | 有需要时 | SQLite 无法多实例共享 |
| 复杂查询需求 | 简单 CRUD + 统计 | 全文检索、地理查询 | SQLite FTS5 弱于 PG 的 GIN/GiST |

**迁移策略**：
- 不主动迁移，先设限观测
- 若触发阈值，使用 `pgloader` 或 SQLAlchemy 脚本迁移数据
- 保留 SQLite 作为开发和测试环境（降低开发成本）

---

## 附录：优先级与路线图对照速查表

| 问题/任务 | 优先级 | 路线图阶段 | 负责角色 |
|----------|--------|-----------|---------|
| DeepSeek 400 修复 | P0 | 短期（1 月内） | 后端 |
| JWT/DEBUG/Cypher/SSRF/XSS 加固 | P0/P1 | 短期（1 月内） | 后端/前端 |
| CI/CD 搭建 | P1 | 短期（1 月内） | SRE |
| 前端巨石组件拆分 | P1 | 短期（1 月内） | 前端 |
| 同步 ORM → AsyncSession | P1/P2 | 中期（1-3 月） | 后端 |
| Neo4j/LightRAG 统一知识网关 | P2 | 中期（1-3 月） | 架构/后端 |
| Alembic 迁移体系 | P2 | 中期（1-3 月） | 后端 |
| SQLite → PostgreSQL | P3 | 长期（3-6 月，触发达标） | 后端 |
| Redis / 可观测性 | P3 | 长期（3-6 月） | SRE |
| 新功能（批量导入、推荐） | - | 长期（债务可控后） | 产品/全栈 |
