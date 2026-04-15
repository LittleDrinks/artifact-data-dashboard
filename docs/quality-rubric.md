# 质量评审标准（Quality Rubric）

> 最后更新：2026-04-16
> 版本：v1.0
> 用途：系统性评审「文物大数据与人工智能集成系统」各模块的质量标准，每条标准有明确的 pass/fail 判定。

---

## 评审维度概览

| # | 维度 | 标准数 | 关注点 |
|---|------|--------|--------|
| A | 异步安全 | 5 | SSE 流、竞态条件、资源清理 |
| B | 数据一致性 | 5 | 会话/消息持久化、CRUD 原子性 |
| C | 交互反馈 | 5 | 加载状态、错误提示、空状态 |
| D | 视觉一致性 | 5 | 设计系统遵循、响应式、组件规范 |
| E | API 健壮性 | 5 | 认证、参数校验、错误处理 |

---

## A. 异步安全（Async Safety）

### A1. SSE 流中途断开不泄漏资源

- **判定方式**：用户在 SSE 流式响应进行中关闭页面/切换会话时，后端 generator 应能被 GC 正常回收，不留僵尸连接。
- **Pass**：后端 `stream_chat_response` generator 退出后无残留线程或未关闭的 HTTP 连接；前端在组件卸载或切换会话时通过 `AbortController` 主动取消 fetch 请求，后端收到取消信号后停止 LLM 调用。
- **Fail**：前端没有 abort 机制（当前状态：`Chat.tsx` 和 `chat.ts` 未使用 `AbortController`，用户关闭页面后后端仍继续执行 LLM 推理并浪费资源），或后端日志出现 "Connection reset" 堆栈未被捕获，或数据库连接数持续增长。
- **当前状态：❌ Fail** — 前端 `sendChatMessage` 使用 `fetch + ReadableStream` 但未传入 `AbortController` signal，无法取消请求。建议在 `Chat` 组件中添加 `useRef<AbortController>` 并在 `handleSend` 中传入 signal，同时在组件卸载和切换会话时调用 `abort()`。

### A2. 连续发送消息不会产生竞态

- **判定方式**：快速连续点击"发送"两次，前端应将前一次请求取消或禁止重复发送。
- **Pass**：`loading` 状态为 `true` 时发送按钮和 Enter 键均被禁用；`handleSend` 首行检查 `loading` 状态。
- **Fail**：出现两条用户消息对应两条 AI 回复交错渲染的情况。

### A3. 流式响应中切换会话后 UI 不残留旧数据

- **判定方式**：在 AI 正在流式回答时点击历史记录中的另一个会话。
- **Pass**：消息列表正确切换到目标会话的历史消息；RAG 面板重置为空状态；`activeSessionId` 更新为新会话 ID。
- **Fail**：新会话的消息列表中出现旧会话的流式内容。

### A4. SSE 连接超时后前端展示友好提示

- **判定方式**：模拟网络延迟超过 120 秒（后端 OpenAI client timeout）。
- **Pass**：前端 catch 到 `fetch` 错误后展示 `message.error` 提示；assistant 占位消息被移除；`loading` 恢复为 `false`。
- **Fail**：页面永久卡在 "思考中" 状态，用户无法继续操作。

### A5. `done` 事件是 SSE 流的最终事件

- **判定方式**：完整的 SSE 事件流必须以 `done` 结束，`done` 后不再有增量事件。
- **完整 SSE 事件类型**：后端 `stream_chat_response` generator 产生以下 7 种事件（按时序排列）：
  1. `thinking_start` — AI 开始推理思考
  2. `thinking_delta` — 推理内容增量（可能多次）
  3. `thinking_end` — 推理阶段结束
  4. `tool_call_start` — 工具调用开始（含 `tool`, `query` 字段）
  5. `tool_call_result` — 工具调用返回结果（含 `results`, `count`, `elapsed` 字段）
  6. `answer_start` — 最终回答开始
  7. `answer_delta` — 回答内容增量（可能多次）
  8. `answer_end` — 回答结束
  9. `done` — 流结束（含 `elapsed`, `sources` 字段，**始终是最后一个事件**）
  - 注：每轮 ReAct 循环会重复 1-5，最后一轮跳过工具调用直接进入 6-9。
- **Pass**：后端 generator 中 `yield _sse_event("done", ...)` 是最后一个 yield；前端收到 `done` 后将 `loading` 设为 `false`。
- **Fail**：`done` 之后仍有增量内容导致前端状态异常。

---

## B. 数据一致性（Data Consistency）

### B1. 用户消息和 AI 回复成对保存

- **判定方式**：发送一条消息后，检查数据库中该 session 的消息。
- **Pass**：存在一条 `role=user` + 一条 `role=assistant` 的消息，且 `assistant` 消息的 `content` 非空。
- **Fail**：只有 user 消息没有 assistant 消息（如 AI 异常但未保存 fallback 回复）。

### B2. 新会话标题由首条消息自动生成

- **判定方式**：在新对话中发送第一条消息，检查 session 记录。
- **Pass**：`chat_sessions.title` 等于首条消息的前 50 字符（超出截断加 `...`）。
- **Fail**：标题仍为 "新对话"，或标题不匹配首条消息内容。

### B3. 删除会话同时删除关联消息

- **判定方式**：删除一个 session 后，检查 `chat_messages` 表。
- **Pass**：`chat_messages` 中不再有 `session_id` 指向已删除 session 的记录。
- **Fail**：session 被删除但 messages 残留（外键约束未生效或手动删除遗漏）。

### B4. 用户只能访问自己的会话

- **判定方式**：用户 A 尝试获取用户 B 的 session 消息。
- **Pass**：API 返回 404 "会话不存在"（而非 403，避免信息泄露）。
- **Fail**：用户 A 能读到用户 B 的聊天记录。

### B5. 会话列表按创建时间倒序排列

- **判定方式**：获取 `/api/chat/sessions` 返回列表。
- **Pass**：`items[0].created_at >= items[1].created_at >= ...`。
- **Fail**：列表乱序或按 id 排列而非时间。

---

## C. 交互反馈（Interaction Feedback）

### C1. 发送消息时显示加载状态

- **判定方式**：点击发送后立即检查 UI。
- **Pass**：发送按钮变为 loading 状态（显示 spinner）；textarea 被 `disabled`；AI 回复旁出现闪烁光标（`.streaming` 为 true）。
- **Fail**：发送后 UI 无任何变化，用户不确定是否在处理中。

### C2. AI 回复完成后加载状态消失

- **判定方式**：收到 `done` 事件后检查 UI。
- **Pass**：闪烁光标消失；发送按钮恢复正常；`loading` 为 `false`；textarea 可输入。
- **Fail**：streaming 光标仍然显示或按钮仍然 loading。

### C3. 空消息不能发送

- **判定方式**：textarea 为空时点击发送或按 Enter。
- **Pass**：`handleSend` 首行检查 `!query` 提前返回，无 API 调用发生。
- **Fail**：发送了空消息，后端返回错误或创建了一条空内容的会话。

### C4. 历史记录抽屉正确展示会话列表

- **判定方式**：点击"历史记录"按钮。
- **Pass**：左侧 Drawer 弹出，显示会话列表（标题 + 创建时间）；当前活跃会话高亮（紫色左边框）。
- **Fail**：Drawer 未弹出或列表为空（实际有会话）。

### C5. 批量删除会话有确认提示

- **判定方式**：选中多个会话后点击"删除"。
- **Pass**：弹出 `Popconfirm` 提示 "确定删除 N 条会话？"，需二次确认才执行删除。
- **Fail**：点击删除立即执行，无确认步骤。

---

## D. 视觉一致性（Visual Consistency）

### D1. 主色调遵循设计系统

- **判定方式**：检查页面中主要品牌色。
- **Pass**：主按钮、链接、活跃态颜色为 `#533afd`（CSS 变量 `--purple`）；不应使用 `#3b82f6`（蓝色）或其他品牌色。
- **Fail**：使用了非设计系统规定的品牌色。

### D2. 用户/AI 消息气泡方向和样式正确

- **判定方式**：发送一条消息后检查气泡布局。
- **Pass**：用户消息右对齐、紫色背景（`#533afd`）、白色文字；AI 消息左对齐、白色背景、浅灰边框。
- **Fail**：消息方向反转或样式不符合设计稿。

### D3. Thinking 块默认折叠，可展开

- **判定方式**：AI 回复包含 thinking 内容时。
- **Pass**：Thinking 区域初始折叠（仅显示标题行）；点击后展开显示完整推理文本；折叠/展开有旋转箭头动画。
- **Fail**：Thinking 内容始终展开或始终不可见。

### D4. RAG 知识面板可显示/隐藏

- **判定方式**：点击"隐藏面板"或"知识面板"按钮。
- **Pass**：右侧面板显示/隐藏切换正常；隐藏后对话区域占满宽度。
- **Fail**：面板始终显示或始终隐藏，切换按钮无效。

### D5. 输入框在视口内可见

- **判定方式**：在 1280x720 分辨率下访问 Chat 页面。
- **Pass**：输入框 bottom 边缘在 viewport 范围内（`bottom <= window.innerHeight`）。
- **Fail**：输入框被挤出视口，需要滚动才能看到。

---

## E. API 健壮性（API Robustness）

### E1. 未认证请求返回 401

- **判定方式**：不带 token 或带无效 token 访问 `/api/chat/sessions`。
- **Pass**：返回 HTTP 401，响应体包含 `detail` 字段。
- **Fail**：返回 200 或 500。

### E2. 请求参数校验返回 422

- **判定方式**：向 `/api/chat/ask` 发送空 body 或无效 JSON。
- **Pass**：FastAPI 自动返回 422 Validation Error，包含字段级别的错误描述。
- **Fail**：返回 500 或 200（静默忽略错误参数）。

### E3. 不存在的会话返回 404

- **判定方式**：请求 `GET /api/chat/sessions/99999/messages`（假设 99999 不存在或不属于当前用户）。
- **Pass**：返回 404 + `detail: "会话不存在"`。
- **Fail**：返回 200 + 空数组（泄露了 session 存在性信息）。

### E4. CORS 正确配置

- **判定方式**：从前端 `localhost:5173` 发请求到后端 `localhost:8000`。
- **Pass**：浏览器预检请求（OPTIONS）返回 200，包含 `Access-Control-Allow-Origin` 头。
- **Fail**：浏览器控制台报 CORS 错误，请求被拦截。

### E5. 批量删除的 ids 参数格式错误返回 400

- **判定方式**：请求 `DELETE /api/chat/sessions?ids=abc,def`。
- **Pass**：返回 400 + `detail: "ids 格式错误，应为逗号分隔的数字"`。
- **Fail**：返回 500（未处理 ValueError）或静默忽略。

---

## 测试覆盖映射

| 标准 | 测试文件 | 测试函数 |
|------|---------|---------|
| A1 | `test_quality.py` | ⚠️ 未覆盖（需前端实现 AbortController 后补充） |
| A2 | `test_quality.py` | `test_rapid_send_blocked_by_loading` |
| A3 | `test_quality.py` | `test_session_switch_clears_messages` |
| A4 | `test_quality.py` | `test_network_error_shows_friendly_msg` |
| A5 | `test_quality.py` | `test_done_event_ends_streaming` |
| B1 | `test_quality.py` | `test_message_pair_persisted` |
| B2 | — | ⚠️ 未覆盖（需测试会话标题自动生成逻辑） |
| B3 | — | ⚠️ 未覆盖（需测试删除会话时关联消息同步删除） |
| B4 | `test_quality.py` | `test_cross_user_session_access_denied` |
| B5 | `test_quality.py` | `test_sessions_ordered_by_time` |
| C1 | `test_quality.py` | `test_send_shows_loading_state` |
| C2 | `test_quality.py` | `test_done_removes_loading_state` |
| C3 | `test_quality.py` | `test_empty_message_not_sent` |
| C4 | `test_quality.py` | `test_history_drawer_shows_sessions` |
| C5 | `test_quality.py` | `test_batch_delete_has_confirm` |
| D1 | `test_quality.py` | `test_brand_color_is_purple` |
| D2 | `test_quality.py` | `test_message_bubble_direction` |
| D3 | `test_quality.py` | `test_thinking_block_collapsible` |
| D4 | `test_quality.py` | `test_rag_panel_toggle` |
| D5 | `test_quality.py` | `test_input_within_viewport` |
| E1 | `test_quality.py` | `test_unauthenticated_returns_401` |
| E2 | — | ⚠️ 未覆盖（需测试无效 JSON body 返回 422） |
| E3 | `test_quality.py` | `test_nonexistent_session_returns_404` |
| E4 | — | ⚠️ 未覆盖（需测试 CORS 预检请求响应头） |
| E5 | `test_quality.py` | `test_invalid_ids_returns_400` |

---

## 评审流程

1. 确保前端和后端开发服务器已启动（`localhost:5173` 和 `localhost:8000`）
2. 运行 `cd tests && python -m pytest test_quality.py -v` 执行全部质量标准测试
   - 如遇到 asyncio 相关问题，尝试 `python -m pytest test_quality.py -v --tb=short`
3. 每条失败的测试对应上述标准的具体 fail 条件
4. 修复后重新运行直到全部 pass
5. CI 环境应将此测试套件纳入合并门槛
