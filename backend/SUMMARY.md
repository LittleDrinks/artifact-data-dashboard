# Phase 1: REL-03 SSE 生成器与 Session 解耦 — 执行摘要

## 变更文件

- `backend/app/services/chat.py`
- `backend/app/routers/chat.py`

## 修改内容

### 1. `app/services/chat.py` — 生成器去耦合

- `stream_chat_response()` 新增 `collector: dict | None = None` 参数，用于收集流完成后需要持久化的元数据。
- 移除生成器内所有 `save_message()` 调用：
  - 不再在生成器开头保存 user 消息
  - 不再在生成器末尾保存 assistant 消息
  - 不再在 `_react_gen()` 的 ReAct 循环中保存 tool 结果消息
- 移除生成器内所有 `db.commit()` 调用（原通过 `save_message` 隐式触发）。
- `_react_gen()` 新增 `tool_results: list[dict]` 参数，将 tool 执行结果收集到列表中，交由调用方后续持久化。
- 生成器仍保留 `db: Session` 用于只读操作（`load_history`、`execute_tool`）。

### 2. `app/routers/chat.py` — 路由器接管持久化

- 新增 `_persist_chat_response()` 后台任务函数，使用独立 `SessionLocal()` 会话完成：
  1. 保存 assistant 消息（含 `tool_calls`、`reasoning_content`）
  2. 保存所有 tool 结果消息（`role="tool"`）
  3. 更新会话标题（若仍为默认"新对话"）
- `ask_question` 端点：
  - 新增 `background_tasks: BackgroundTasks` 依赖注入
  - 在创建 `StreamingResponse` **之前**同步保存 user 消息
  - 实例化 `collector = {}` 传给生成器
  - `StreamingResponse` 通过 `background=background_tasks.add_task(...)` 注册后台持久化任务

## 验收结果

| 验收项 | 结果 |
|--------|------|
| 生成器内无 `save_message` 调用（排除函数定义） | PASS |
| 路由器使用 `BackgroundTask` 进行流后持久化 | PASS |
| `pytest backend/tests/test_chat.py -v` | 17/17 PASS |
| `pytest backend/tests/` 全量 | 71/72 PASS（唯一失败为预存在的 artifact delete 状态码问题，与本次变更无关） |

## 技术要点

- **生成器纯化**：SSE 生成器仅负责 yield 事件流，不再触碰数据库写操作，符合 FastAPI 最佳实践。
- **后台任务隔离**：`_persist_chat_response` 使用独立的 `SessionLocal()` 会话，避免与请求生命周期会话冲突。
- **数据完整性**：user 消息在流开始前同步保存；assistant 消息和 tool 结果在流结束后通过 BackgroundTask 保存，确保会话历史连续性。
