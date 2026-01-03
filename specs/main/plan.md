# Implementation Plan: Artifact Data Dashboard v1.0.0

**Branch**: `main` | **Date**: 2026-01-03 | **Spec**: [specs/main/spec.md](specs/main/spec.md)
**Input**: 来自 `.specify/memory/specification.md` 的功能规格说明

**Note**: 本文档由 `/speckit.plan` 命令自动填充。执行流程见 `.specify/templates/commands/plan.md`。

## Summary

Artifact Data Dashboard 是一个整合 MySQL、Neo4j 与 Redis 的全栈应用，用于提供文物（artifact）管理、知识图谱可视化以及 AI Chat。

本计划以“当前仓库实现状态”为基线，聚焦 v1.0.0 的三条用户故事（US1/US2/US3）收敛与对齐：

1) **附件管理（分页+过滤+审计）**：`GET /api/attachments` 支持 `page/limit`（默认 `limit=50`）、`ownerType/ownerId` 过滤，返回 `data + meta`，并在上传/删除时落审计日志。
2) **dict/JSON → xlsx 固定 schema**：后端提供权威 Excel schema；Python 侧导出实现与其保持同步，并落实值归一化规则。
3) **AI 插件化（配置+重启生效+审计）**：启动时读取 `backend/config/ai-plugins.json`；聊天路径按配置选择 provider/capability；调用链写入 MySQL `logs`。

验收口径以 [specs/main/spec.md](specs/main/spec.md) 与 [specs/main/contracts/api.yaml](specs/main/contracts/api.yaml) 为准，并要求“规格/合同/实现”一致。

> 备注：数据导出文档策略已调整为“仅提供关键函数 `derive_export_payload()` 与输入字段规范”，不再提供独立导出脚本。

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
- [x] **Data Quality**: Excel 导入 schema 已在 spec 与 `attachment.routes.js` (原 debug) 中定义。
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
└── tasks.md             # Phase 2 output
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

## Current State (as of 2026-01-03)

基于仓库现状（代码 + 文档 + OpenAPI）汇总：

- **Artifacts 管理**：后端已限制 POST/PUT/DELETE 为 admin；前端已接入 admin 编辑/删除入口（以 Search 详情弹窗为最小入口）。
- **附件管理**：
	- 后端：上传/删除 admin-only；读取/下载登录可用；列表已实现 `page/limit`（默认 50）+ `ownerType/ownerId` 过滤，并返回 `meta`。
	- 前端：独立附件管理页使用服务端分页；文物详情内附件区已接入且对 admin 隐藏/提示上传删除能力。
- **数据导出（dict/JSON -> xlsx）**：文档明确固定 sheet/列顺序与归一化规则；提供关键函数复用方式（`derive_export_payload()` / `write_workbook()`）。
- **Excel 导入/导出（移自 System Debug）**：
	- 当前导入/导出逻辑仍在 debug 路由中，需迁移到附件路由，并按 spec 以“附件”作为交付与触发载体。
- **AI 插件化**：已实现配置加载（失败降级）、provider/capability 管道、聊天路径接入与日志审计；剩余是补齐 OpenAPI 对 `/ai-plugins/status` 的定义。

## Gap Analysis (Spec / Contract / Implementation)

1) **Excel 导入/导出迁移（P0）**
	 - Spec：导出应生成 Excel 并保存为附件（`ownerType="system_export"`）；导入应“先上传为附件（`ownerType="system_import"`）再按附件 ID 触发执行”。
	 - 现状：逻辑仍在 debug 路由，未与附件系统打通。

2) **合同补齐（P1）**
	 - OpenAPI：需要补齐 `/ai-plugins/status`（admin-only）的接口定义，确保对外契约完整。

## Execution Plan (Next)

### Phase A (P0): Excel 导入/导出迁移到附件系统

目标：按 [specs/main/spec.md](specs/main/spec.md) 3.1.6，把导入/导出从 debug 路由迁移到附件路由：

- 导出：admin-only 触发，生成 xlsx 并保存为附件（`ownerType="system_export"`）。
- 导入：admin-only 触发，针对指定附件 ID 执行导入；默认策略为“仅新增（append）”，可选“全量覆盖（overwrite）”。

### Phase B (P1): OpenAPI 对齐

目标：补齐对外契约，最少包括：

- `/ai-plugins/status`（admin-only）接口定义。

### Phase C: Sync Tasks + Smoke

目标：勾选任务清单并记录 smoke checklist，便于交付验收。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
