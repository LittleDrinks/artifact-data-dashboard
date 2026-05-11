---
plan: fix-test-04-graph-api-test
phase: 2
wave: 2
status: complete
completed: 2026-05-11
---

# SUMMARY: graph 查询/导入/导出端点单元测试

## What Was Built

补充 graph API 测试，新增 extract_triples 和 knowledge_query 端点覆盖。

## Key Changes

- `backend/tests/test_graph.py`:
  - 新增 `TestGraphExtractTriples`: 空文本 400、LightRAG unavailable、成功路径
  - 新增 `TestGraphKnowledgeQuery`: 空问题 400、LightRAG unavailable、成功路径
  - 总测试数: 27 → 34

## Verification

- `pytest tests/test_graph.py -v` → 34 passed
- Coverage: `app\routers\graph.py` 90% (目标 ≥ 85%)
- 覆盖端点: /full, /search, /node, /export, /import, /extract, /knowledge-query

## Self-Check

- [x] test_graph.py 存在且测试通过
- [x] routers/graph.py 覆盖率 ≥ 85%
