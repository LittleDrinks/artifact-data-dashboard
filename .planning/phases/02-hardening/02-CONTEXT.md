# Phase 2: 加固 — 讨论上下文

**Phase:** 2
**Name:** 加固
**Goal:** 核心功能有测试保护，架构债务得到缓解，代码可维护
**前置条件:** Phase 1 止血完成（18 plans, 4 waves, UAT 7/7 passed）
**Duration:** 3-4 周
**Target:** 2026-06-21（v0.2 加固版）

---

## 一、Phase 1 遗留与当前代码基线

### 已完成的 Phase 1 修复（代码已落地）

| 修复项 | 文件 | 状态 |
|--------|------|------|
| REL-01 DeepSeek 400 | `backend/app/services/chat.py` | ✅ REASONER_MODELS 集合，条件恢复 reasoning_content |
| SEC-01 JWT 默认密钥 | `backend/app/config.py` | ✅ model_post_init 校验，生产环境拒绝默认密钥 |
| SEC-02 DEBUG 默认 | `backend/app/config.py` | ✅ DEBUG: bool = False |
| SEC-04 SSRF 防护 | `backend/app/routers/repair.py` | ✅ _validate_image_url 四重校验 |
| SEC-05 XSS 过滤 | `frontend/src/pages/Chat.tsx` | ✅ rehype-sanitize |
| SEC-07 管理员密码 | `backend/app/database.py` | ✅ 强制环境变量，最小 8 位 |
| TEST-05 CI 骨架 | `.github/workflows/ci.yml` | ✅ pytest + ruff + tsc |

### Phase 1 计划内但未完成的项

| 项 | 原 Wave | 原因 | 处理方式 |
|----|---------|------|----------|
| REL-03 SSE 解耦 | Wave 3 | 改动面大，涉及 chat.py 重构 | **移入 Phase 2** |
| REL-04 run_in_threadpool | Wave 3 | 依赖 REL-03 | **移入 Phase 2** |
| REL-06 Health check 深度 | Wave 3 | 时间不足 | **移入 Phase 2** |
| SEC-03 Cypher 白名单 | Wave 2 | 需要更多测试覆盖 | **移入 Phase 2** |
| SEC-06 CORS 收紧 | Wave 2 | 低优先级 | **移入 Phase 2** |
| REL-02 空指针保护 | Wave 2 | 需要确认所有访问点 | **移入 Phase 2** |
| REL-05 docker-compose | Wave 2 | 配置已正确 | ✅ 无需改动 |
| TEST-01~04 测试补全 | Wave 4 | 时间不足 | **移入 Phase 2** |

---

## 二、Phase 2 任务清单（来自 ROADMAP + 技术债务）

### 安全加固（P1）

1. **SEC-03: Cypher 注入修复 — 标签参数化 + 白名单**
   - 文件: `backend/app/routers/graph.py`, `backend/app/services/graph.py`
   - 现状: `sanitize_label()` 仅过滤字符，无白名单
   - 目标: `ALLOWED_LABELS = {"artifact", "era", "category", "location", "tag", "material", "museum"}`

2. **SEC-06: CORS 收紧为实际前端域名**
   - 文件: `backend/app/config.py`
   - 现状: 默认值含 `http://localhost`（无端口）
   - 目标: 仅保留 `localhost:5173` 和 `127.0.0.1:5173`

### 架构缓解（P1）

3. **REL-03: SSE 生成器与 Session 解耦**
   - 文件: `backend/app/services/chat.py`, `backend/app/routers/chat.py`
   - 现状: `stream_chat_response()` 内直接 `save_message(db, ...)` commit
   - 目标: 生成器纯 yield，路由器用 BackgroundTask 保存 assistant 消息
   - 风险: **改动面最大**，影响所有 chat 流程

4. **REL-04: 同步 ORM 临时方案（run_in_threadpool 包裹）**
   - 文件: `backend/app/routers/chat.py`, `backend/app/routers/graph.py`
   - 现状: 同步 `def` 路由 + SQLAlchemy sync Session
   - 目标: `async def` + `run_in_threadpool` 包裹 DB 操作
   - 依赖: REL-03 完成后实施

5. **REL-06: Health check 深度探测**
   - 文件: `backend/app/routers/health.py`
   - 现状: 仅返回 `{"status": "ok"}`
   - 目标: SQLite `SELECT 1`、Neo4j 连通、AI API 配置状态

6. **REL-02: SQLite graph search 空指针修复**
   - 文件: `backend/app/services/graph.py`, `backend/app/ai/tools.py`
   - 现状: `n.properties.get(...)` 未做空值保护
   - 目标: `(n.properties or {}).get(...)` 模式全覆盖

### 测试补全（P1）

7. **TEST-01: Python 3.12 统一 + pytest/httpx 依赖**
   - 文件: `backend/requirements-dev.txt`（新建）
   - 现状: 无 requirements-dev.txt
   - 目标: `pytest>=8.0.0`, `pytest-asyncio>=0.23.0`, `httpx>=0.27.0`

8. **TEST-02: repair 单元测试（mock cv2.inpaint）**
   - 文件: `backend/tests/test_repair.py`（新建）
   - 覆盖: SSRF 校验、修复端点 mock

9. **TEST-03: chat/ask SSE 端点测试**
   - 文件: `backend/tests/test_chat_sse.py`（新建）
   - 覆盖: SSE 流格式、session 创建、无效 session 404

10. **TEST-04: graph API 测试**
    - 文件: `backend/tests/test_graph_api.py`（新建）
    - 覆盖: /full, /search, /export, /import

11. **TEST-05: CI 完善（Playwright E2E + 覆盖率）**
    - 文件: `.github/workflows/ci.yml`
    - 目标: Playwright install + `npm run test:e2e`，pytest 覆盖率上报

### 前端拆分（P1）

12. **FE-01: Chat.tsx 拆分**
    - 文件: `frontend/src/pages/Chat.tsx`（当前 ~1200 行）
    - 目标: `ChatContainer.tsx` + `MessageList.tsx` + `useSSE.ts`
    - 成功标准: Chat.tsx < 500 行

13. **FE-02: Graph.tsx 拆分**
    - 文件: `frontend/src/pages/Graph.tsx`
    - 目标: `useGraphSimulation.ts` + `CanvasRenderer.tsx`
    - 成功标准: Graph.tsx < 500 行

### 前端体验（技术债务 P1）

14. **TD-02: ReAct 流式输出分组跳动**
    - 文件: `frontend/src/pages/Chat.tsx`
    - 根因: thinking/tool_calling/answer 分组渲染导致跳动

15. **TD-03: Markdown 表格未渲染**
    - 文件: `frontend/src/pages/Chat.tsx`
    - 根因: 缺少 `remark-gfm` 插件

16. **TD-04: 长回答挤走输入框**
    - 文件: `frontend/src/pages/Chat.tsx`
    - 根因: 无独立滚动容器

### 其他（P1-P2）

17. **FE-03: PrivateRoute 增强 — Token 有效性预热校验**
    - 文件: `frontend/src/components/PrivateRoute.tsx`
    - 目标: 进入页面前校验 token 是否有效，避免过期后仍能进入页面

18. **TEST-06: E2E 优化 — 硬等待 → 状态等待**
    - 文件: `frontend/e2e/`（若有 Playwright 测试）
    - 目标: 消除 `page.waitForTimeout`，改为状态断言

19. **DOC-01: 文档补齐**
    - `docs/deployment.md` — Docker 部署说明
    - `docs/testing.md` — 测试策略与命令
    - `docs/security.md` — 安全模型与威胁缓解

---

## 三、依赖关系与波次安排

```
Wave 1（并行，安全 + 测试基础设施）:
  SEC-03  SEC-06  REL-02  REL-06  TEST-01

Wave 2（并行，后端架构 + 测试）:
  REL-03  TEST-02  TEST-04
  [TEST-02 depends on SEC-04(已完成) + TEST-01]
  [TEST-04 depends on REL-02 + TEST-01]

Wave 3（REL-03 完成后，ORM 包裹 + SSE 测试）:
  REL-04  TEST-03
  [REL-04 depends on REL-03]
  [TEST-03 depends on REL-03 + TEST-01]

Wave 4（并行，前端拆分 + 体验 + CI）:
  FE-01  FE-02  TD-02  TD-03  TD-04  FE-03  TEST-05  TEST-06  DOC-01
  [TEST-05 depends on TEST-01~04]
```

---

## 四、关键决策点

### 决策 1: REL-03 SSE 解耦的方案选择

**选项 A**（推荐）: 生成器纯 yield，路由器 BackgroundTask 保存
- 优点: 架构清晰，Session 生命周期可控
- 缺点: 改动大，需重构 chat.py 核心流程

**选项 B**: 保留当前结构，仅加 `run_in_threadpool`
- 优点: 改动小
- 缺点: 未解耦根本问题，Session 仍与生成器绑定

### 决策 2: FE-01 Chat.tsx 拆分的边界

Chat.tsx ~1200 行，拆分目标:
- `useSSE.ts` — SSE 连接管理、事件解析、自动重连
- `MessageList.tsx` — 消息渲染（含 Markdown、分组、滚动）
- `ChatContainer.tsx` — 状态管理、布局、输入框
- 保留 `Chat.tsx` — 页面级组件，组合以上子组件

问题: TD-02/03/04 都是 Chat.tsx 的改动，是否先修复体验再拆分？
- 建议: **先拆分再修复**，否则修复代码在拆分后需要重新迁移

### 决策 3: 测试覆盖率目标

ROADMAP 要求 ≥ 60%。当前测试:
- `test_auth.py` — 认证
- `test_artifacts.py` — 文物 CRUD
- `test_stats.py` — 统计
- `test_chat.py` — 会话管理（无 SSE）
- `test_graph_knowledge.py` — LightRAG mock

Phase 2 新增:
- `test_repair.py` — repair + SSRF
- `test_chat_sse.py` — SSE 流
- `test_graph_api.py` — graph 查询/导入/导出

预计新增后覆盖率可达 50-60%。若不足，需补充 auth/artifacts 的边缘 case。

### 决策 4: Playwright E2E 现状

需要确认:
- frontend 是否已有 Playwright 配置？
- `npm run test:e2e` 脚本是否存在？
- 现有 E2E 测试有哪些？是否有硬等待需优化？

---

## 五、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| REL-03 改动面过大引入回归 | 高 | 拆分多个 PR，每个 PR 有独立测试 |
| FE-01 Chat.tsx 拆分后功能丢失 | 中 | 拆分后浏览器验证所有交互路径 |
| 测试覆盖率不达 60% | 中 | 优先覆盖核心路径，边缘 case 后续补充 |
| Playwright E2E 环境配置复杂 | 低 | 本地验证通过后再接入 CI |

---

## 六、Phase 2 退出标准

- [ ] 后端测试覆盖率 ≥ 60%
- [ ] CI 全绿（pytest + Playwright）
- [ ] Chat.tsx < 500 行，Graph.tsx < 500 行
- [ ] 无 E2E 硬等待（全部改为状态断言）
- [ ] 部署文档可让新成员 1 天跑通环境

---

*Phase 2 讨论上下文 — 基于 Phase 1 完成状态与 ROADMAP 生成*
*Created: 2026-05-11*
