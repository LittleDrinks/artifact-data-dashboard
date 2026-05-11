---
plan: fix-rel-04-sync-orm-wrap
phase: 2
wave: 3
status: complete
completed: 2026-05-11
---

# SUMMARY: 同步 ORM 临时方案（run_in_threadpool 包裹）

## What Was Built

将 `routers/chat.py` 中 `ask_question` 从 `def` 改为 `async def`，
所有同步 DB 操作使用 `run_in_threadpool` 包裹，避免阻塞事件循环。

## Key Changes

- `backend/app/routers/chat.py`:
  - 导入 `starlette.concurrency.run_in_threadpool`
  - `ask_question` 改为 `async def`
  - `create_session` 调用包裹在 `run_in_threadpool` 中
  - `db.query(ChatSession).filter(...).first()` 包裹在 `run_in_threadpool` 中
  - `save_message` 调用包裹在 `run_in_threadpool` 中

## Verification

- `grep -n "async def ask_question" backend/app/routers/chat.py` → 匹配
- `grep -n "run_in_threadpool" backend/app/routers/chat.py` → 3 处匹配
- pytest tests/test_chat.py -v → 23 passed
- pytest tests/test_chat_sse.py -v → 4 passed

## Self-Check

- [x] ask_question 为 async def
- [x] run_in_threadpool 包裹 DB 操作（create_session, query, save_message）
- [x] 测试通过
