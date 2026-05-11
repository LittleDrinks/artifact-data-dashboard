---
plan: fix-test-05-ci-coverage
phase: 2
wave: 4
status: partial
completed: 2026-05-11
---

# SUMMARY: CI 完善 — 覆盖率上报 + Playwright E2E 接入

## What Was Built

修改 `.github/workflows/ci.yml`，添加 pytest 覆盖率上报和 Playwright E2E 步骤。

## Key Changes

- `.github/workflows/ci.yml`:
  - Backend: 添加 `--cov=app --cov-report=xml --cov-fail-under=60`
  - Backend: 添加 `actions/upload-artifact@v4` 用于失败时上报报告
  - Frontend: 添加 `npx playwright install --with-deps chromium`
  - Frontend: 添加 `npm run test:e2e`

## Note

Playwright E2E 在 CI 中需要完整环境（后端服务 + 数据库 + Neo4j）。
当前 CI 为分 job 架构，frontend job 不启动后端，E2E 可能需要在同一 job 中
同时启动前后端才能正常运行。此问题需在后续迭代中解决。

## Verification

- `grep -n "pytest.*--cov" .github/workflows/ci.yml` → 匹配
- `grep -n "playwright install" .github/workflows/ci.yml` → 匹配
- `grep -n "test:e2e" .github/workflows/ci.yml` → 匹配
- `grep -n "cov-fail-under" .github/workflows/ci.yml` → 匹配（值 60）

## Self-Check

- [x] pytest 覆盖率上报
- [x] cov-fail-under=60
- [x] Playwright 安装步骤
- [ ] E2E 在 CI 中完整运行（需后续环境配置）
