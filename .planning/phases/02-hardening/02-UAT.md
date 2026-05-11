---
status: complete
phase: 02-hardening
source:
  - fix-rel-06-health-check-SUMMARY.md
  - fix-sec-06-cors-tighten-SUMMARY.md
  - fix-rel-03-sse-decouple-SUMMARY.md
  - fix-test-03-chat-sse-test-SUMMARY.md
  - fix-rel-04-sync-orm-wrap-SUMMARY.md
started: 2026-05-11T12:00:00Z
updated: 2026-05-11T12:00:00Z
---

## Current Test

[testing complete]

---

updated: 2026-05-11T12:15:00Z

## Tests

### 1. Cold Start Smoke Test
expected: |
  启动后端服务（uvicorn app.main:app --reload --port 8000），
  服务无报错启动，/api/health 返回包含 status 和 checks 的 JSON。
result: pass

### 2. Health Check 深度探测
expected: |
  访问 http://localhost:8000/api/health，
  返回 JSON 包含 {"status": "ok|degraded", "checks": {"sqlite": "ok", "neo4j": "...", "ai_api": "..."}}。
  SQLite 检查为 "ok"，任一依赖失败时返回 degraded 而非 500。
result: pass

### 3. CORS 开发环境正常
expected: |
  前端（http://localhost:5173）能正常访问后端 API，
  登录、AI 问答、知识图谱等页面无跨域报错。
result: pass

### 4. Chat SSE 流式输出
expected: |
  登录后进入 AI 问答页面，发送消息 "你好"，
  看到流式输出（thinking_start → thinking_delta → answer_delta → done），
  无卡顿，输出完整。
result: pass

### 5. Chat 历史消息保存
expected: |
  发送消息后，刷新页面或重新进入 AI 问答页面，
  历史消息列表中显示刚才的对话（用户消息 + AI 回复）。
result: pass

### 6. pytest 全绿
expected: |
  运行 pytest tests/ -v，所有单元测试通过（不包含 Playwright E2E），
  覆盖率 ≥ 55%。
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
