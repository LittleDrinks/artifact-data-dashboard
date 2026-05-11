---
plan: fix-sec-03-cypher-whitelist
phase: 2
wave: 1
status: complete
completed: 2026-05-11
---

# SUMMARY: Cypher 查询标签参数化 + 白名单校验

## What Was Built

在 `backend/app/services/graph.py` 中定义了标签白名单集合 `ALLOWED_LABELS` 和校验函数 `validate_label()`，
所有 Neo4j Cypher 查询中的动态标签在使用前必须通过白名单校验。

## Key Changes

- `ALLOWED_LABELS = {"artifact", "era", "category", "location", "tag", "material", "museum"}`
- `validate_label(label: str) -> str` — 不在白名单内时抛出 `ValueError`
- `routers/graph.py` 导入端点中 `source_type` / `target_type` 已使用 `validate_label()` 校验
- `services/graph.py` 的 `_query_neo4j_base_layer` 等函数中所有标签参数已使用 `validate_label()`

## Verification

- `python -c "from app.services.graph import validate_label; validate_label('artifact')"` → 成功
- `python -c "from app.services.graph import validate_label; validate_label('invalid')"` → ValueError
- pytest 123 passed

## Self-Check

- [x] 白名单定义在 services/graph.py 顶部
- [x] routers/graph.py 导入端点校验 source_type / target_type
- [x] services/graph.py 查询函数校验所有动态标签
- [x] 保留 sanitize_label() 作为第一层过滤
