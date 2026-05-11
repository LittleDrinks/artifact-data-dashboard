---
plan: fix-rel-02-null-pointer-graph
phase: 2
wave: 1
status: complete
completed: 2026-05-11
---

# SUMMARY: SQLite graph search 空指针修复

## What Was Built

在 `services/graph.py` 和 `ai/tools.py` 中对所有 `n.properties` 和 `record.get("props")` 访问添加了空值保护。

## Key Changes

- `backend/app/services/graph.py`:
  - `props = dict(record.get("props") or {})`（3 处）
- `backend/app/ai/tools.py`:
  - `(n.properties or {}).get("description", "")`（Neo4j 实体查询）
  - `(n.properties or {}).get("description", "")`（SQLite fallback 实体构建）

## Verification

- `grep "\.properties\.get(" backend/app/ai/tools.py` → 空（无未保护访问）
- `grep 'record.get("props") or {}' backend/app/services/graph.py` → 3 处匹配
- pytest 123 passed

## Self-Check

- [x] graph.py 所有 record.get("props") 已加 or {} 保护
- [x] tools.py 所有 n.properties.get() 已改为 (n.properties or {}).get()
