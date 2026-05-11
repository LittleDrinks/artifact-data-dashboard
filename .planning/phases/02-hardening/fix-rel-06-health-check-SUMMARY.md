---
plan: fix-rel-06-health-check
phase: 2
wave: 1
status: complete
completed: 2026-05-11
---

# SUMMARY: Health check 深度探测

## What Was Built

重写 `routers/health.py`，从静态字符串 `{"status": "ok"}` 升级为深度依赖探测，
覆盖 SQLite、Neo4j、AI API 三个关键依赖项。

## Key Changes

- `backend/app/routers/health.py`:
  - `_check_sqlite()`: 执行 `SELECT 1` 探测 SQLite 连通性
  - `_check_neo4j()`: 调用 `driver.verify_connectivity()` 探测 Neo4j
  - `_check_ai_api()`: HEAD 请求探测 AI API base URL 可达性
  - `health_check()`: 返回 `{"status": "ok|degraded", "checks": {...}}`
- 保持同步 `def` 签名，FastAPI 自动放入 threadpool

## Verification

- `curl http://localhost:8000/api/health` 返回包含 `status` 和 `checks` 的 JSON
- `checks.sqlite` = "ok"（当 SQLite 正常时）
- pytest 123 passed

## Self-Check

- [x] SQLite 探测通过 SELECT 1
- [x] Neo4j 探测通过 verify_connectivity()
- [x] AI API 探测通过 HEAD 请求（5s 超时）
- [x] 任一依赖失败时返回 degraded 而非 500
