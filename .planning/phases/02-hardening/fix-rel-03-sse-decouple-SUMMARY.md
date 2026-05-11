---
plan: fix-rel-03-sse-decouple
phase: 2
wave: 2
status: complete
completed: 2026-05-11
---

# SUMMARY: SSE 生成器与 Session 解耦（方案 A：BackgroundTask）

## What Was Built

采用方案 A 实现 SSE 生成器与 Session 解耦：生成器仅 yield SSE 事件，
assistant 消息的保存由路由器的 `BackgroundTask` 在流完成后执行。

## Key Changes

- `backend/app/routers/chat.py`:
  - `_persist_chat_response()` BackgroundTask：保存 assistant 消息、tool results、更新会话标题
  - `ask_question()` 中 `StreamingResponse` 配置 `background=background_tasks.add_task(...)`
- `backend/app/services/chat.py`:
  - `stream_chat_response()` docstring 明确声明 "decoupled from DB writes — does NOT call save_message()"
  - 生成器内通过 `collector` dict 收集元数据，供 BackgroundTask 使用
  - `save_message()` 调用已完全从生成器中移除

## Architecture

```
ask_question()
  ├─ save_message(user) ──→ DB (同步，请求事务内)
  ├─ stream_chat_response() ──→ SSE 流 (yield only, collector 收集元数据)
  └─ BackgroundTask(_persist_chat_response) ──→ DB (流完成后保存 assistant)
```

## Note on db Parameter

`stream_chat_response()` 仍接收 `db: Session` 参数，用于 ReAct 工具调用
（`execute_tool()` 查询 SQLite）。这与消息保存解耦是不同层面的问题。
REL-04（run_in_threadpool 包裹）将进一步处理同步 ORM 在异步上下文中的问题。

## Verification

- `grep -n "save_message" backend/app/services/chat.py` → 仅函数定义行（128）和 docstring（268），生成器内无调用
- `grep -n "BackgroundTask" backend/app/routers/chat.py` → 第 7 行 import，第 216 行使用
- pytest 123+ passed
- **浏览器验证**: AI 问答流式输出正常，历史消息保存成功

## Self-Check

- [x] 生成器内无 save_message 调用
- [x] BackgroundTask 保存 assistant 消息
- [x] collector 模式收集元数据
- [x] 浏览器验证通过
