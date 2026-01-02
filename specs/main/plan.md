# Implementation Plan: Artifact Data Dashboard v1.0.0

**Branch**: `main` | **Date**: 2026-01-02 | **Spec**: [specs/main/spec.md](specs/main/spec.md)
**Input**: 来自 `.specify/memory/specification.md` 的功能规格说明

**Note**: 本文档由 `/speckit.plan` 命令自动填充。执行流程见 `.specify/templates/commands/plan.md`。

## Summary

Artifact Data Dashboard 是一个整合 MySQL、Neo4j 与 Redis 的全栈应用，用于提供文物（artifact）管理、知识图谱可视化以及 AI Chat。本计划聚焦于稳定 v1.0.0：强化数据质量、将写权限限制为 Admin、优化图谱性能，并移除超出范围的预测模型（predictive model）。

## Technical Context

**Language/Version**: Node.js 18+（Backend）, React 18（Frontend）, Python 3.9+（Scripts）
**Primary Dependencies**: Express, Neo4j Driver, MySQL2, Redis, Ant Design, ECharts, Cytoscape.js
**Storage**: MySQL 8.0, Neo4j 5.x, Redis 7.x
**Testing**: Jest, Supertest（Backend）, Cypress（E2E - Proposed）
**Target Platform**: Docker Compose（Linux containers）
**Project Type**: Web Application（Frontend + Backend）
**Performance Goals**: API < 2s p95，Graph load < 3s（Top 100 nodes）
**Constraints**: 中文（Chinese）单语言，单租户部署（Single-tenant）
**Scale/Scope**: ~10k artifacts，~50k graph nodes

## Constitution Check

*GATE：在 Phase 0 研究前必须通过；Phase 1 设计后需要复查。*

- [x] **Data Traceability**: `main.py` crawler 已存在；需要确保记录执行元数据（execution metadata）。
- [x] **Data Quality**: Excel 导入 schema 已在 spec 与 `debug.routes.js` 中定义。
- [x] **Modular/Docker**: `docker-compose.yml` 已存在且可用。
- [x] **Interface Contracts**: API routes 已定义；已生成 OpenAPI spec。
- [x] **Secure Credentials**: 所有服务已建立 `.env` 的使用方式。
- [x] **Automated Pipelines**: `build_kg/` 中已有数据导入脚本。

## Project Structure

### 文档（本功能输出）

```text
specs/main/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.yaml
└── tasks.md             # Phase 2 output (to be generated)
```

### 源码（仓库根目录）

```text
backend/
├── src/
│   ├── config/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   └── index.js
├── scripts/
│   ├── init-mysql.sql
│   └── init-neo4j.js
└── Dockerfile

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   └── App.js
└── Dockerfile

build_kg/
├── crawler/
│   └── main.py
└── convert_artifact_to_excel.py
```

**Structure Decision**: 标准 Monorepo：Frontend/Backend 与数据脚本分离。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
