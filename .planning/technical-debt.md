# 技术债务

## TD-01: Neo4j 与 LightRAG 数据不互通

**Issue**: #17

**现状**:
- Neo4j 存储规则三元组（用于知识图谱可视化）
- LightRAG 使用自己的 KV Store（用于 AI 问答）
- 两者数据完全独立，没有共享

**影响**:
- 知识图谱页面的数据和 AI 问答的数据不一致
- 知识抽取（/knowledge）的结果只进入 LightRAG，不进入 Neo4j
- 用户维护两套数据，成本高

**可能的解决方案**:
1. 统一存储层：让 LightRAG 用 Neo4j 作为后端（需要修改 LightRAG 源码）
2. 双向同步：Neo4j <-> LightRAG KV Store 定期同步
3. 弃用 Neo4j：全部迁移到 LightRAG（知识图谱可视化需要重写）

**优先级**: P2（Phase 3 之后考虑）

---

## TD-02: Chat 页面 ReAct 流式输出分组跳动

**Issue**: #18

**现状**:
AI 回复的 thinking、tool_calling、answer 内容被分组显示，导致流式输出时整块跳动。

**根因**:
Chat.tsx 将不同类型的 SSE 事件渲染为独立的 UI 组件，每次新组件出现时页面跳动。

**涉及文件**: `frontend/src/pages/Chat.tsx`

**优先级**: P1（Phase 2 修复）

---

## TD-03: Chat 页面 Markdown 表格未渲染

**Issue**: #19

**现状**:
AI 回复中的 Markdown 表格语法以原始文本显示，没有渲染为 HTML 表格。

**根因**:
ReactMarkdown 缺少 `remark-gfm` 插件，不支持 GFM 表格语法。

**涉及文件**: `frontend/src/pages/Chat.tsx`

**优先级**: P1（Phase 2 修复）

---

## TD-04: Chat 页面长回答挤走输入框

**Issue**: #20

**现状**:
AI 生成超长回答时，输入框被挤出视口，用户需手动滚动到底部。

**根因**:
对话区域没有独立的滚动容器，页面滚动针对整个 `document.body`。

**涉及文件**: `frontend/src/pages/Chat.tsx`

**优先级**: P1（Phase 2 修复）

---

## TD-05: run_in_threadpool 临时方案需迁移 AsyncSession

**Issue**: #21

**现状**:
使用 `run_in_threadpool(lambda: sync_func(db, ...))` 在 async endpoint 中调用同步 ORM。模式不标准，增加并发复杂度。

**期望**:
迁移到 SQLAlchemy AsyncSession + async ORM 操作。

**涉及范围**: `backend/app/routers/*.py` 中使用 `run_in_threadpool` 的所有 endpoint

**优先级**: P2（Phase 3 考虑）

---

## TD-06: localStorage JWT 需迁移 httpOnly Cookie

**Issue**: #22

**现状**:
JWT token 存储在浏览器 localStorage 中，存在 XSS 风险。

**期望**:
- 后端登录接口设置 `Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Strict`
- 前端移除 localStorage token 存取逻辑
- 后端从 Cookie 中读取 token

**涉及范围**:
- `backend/app/routers/auth.py`
- `frontend/src/api/`

**优先级**: P2（Phase 3 考虑）

---

## TD-07: 后端覆盖率门槛临时下调

**Issue**: #28

**现状**:
CI 中 `pytest --cov-fail-under` 从 60 暂时下调到 55，以匹配当前稳定覆盖率基线（约 56%）并恢复流水线可用性。

**期望**:
- 通过补齐后端测试把覆盖率重新提升到 60% 及以上
- 提升后将 CI 门槛回调到 60%

**涉及文件**:
- `.github/workflows/ci.yml`
- `backend/tests/`

**优先级**: P1（Phase 2 收尾）

---

*新增技术债务时在此文件追加，格式：TD-XX: 标题 + Issue 链接 + 现状/根因/涉及文件/优先级*
