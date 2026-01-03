# Implementation Plan: 001-env-config-cleanup

**Date**: 2026-01-03  
**Spec**: specs/001-env-config-cleanup/spec.md

## Summary

统一配置入口为仓库根目录 `.env`（不提交）+ `.env.example`（提交模板）：

- docker compose 使用 `env_file: ./.env` 注入后端/前端容器
- 后端启动时输出结构化诊断摘要（JSON，脱敏），并对缺失/非法配置快速失败
- Redis/MySQL/Neo4j/前后端变量命名一致，避免“容器一套、应用一套”的漂移

## Technical Context

**Backend**: Node.js + Express（backend/src/index.js）

- 通过 backend/src/config/env.js 进行配置加载、校验与诊断输出

**Frontend**: React (CRA)

- axios 默认同源；dev 依赖 CRA proxy；prod 依赖 nginx /api 反代

**Infra**: docker compose + MySQL 8 + Neo4j 4.4 + Redis 7.2

## Project Structure

```text
backend/
  src/
    config/
      env.js
      database.js
frontend/
  src/
    services/
      auth.service.js
```

## Validation Notes (Minimal)

- 已将 docker-compose.yml / docker-compose.prod.yml 的配置入口统一为根目录 .env
- 后端会输出 StartupDiagnostics（profile/entrypoint/missingRequired/invalid 等）

验证记录：

- 2026-01-03：在本地从 `.env.example` 生成 `.env` 后执行 `docker compose -f docker-compose.yml config`，解析通过。

