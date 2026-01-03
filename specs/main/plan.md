# Implementation Plan: Artifact Data Dashboard v1.0.0

**Branch**: `main` | **Date**: 2026-01-03 | **Spec**: [specs/main/spec.md](specs/main/spec.md)
**Input**: 来自 `.specify/memory/specification.md` 的功能规格说明

**Note**: 本文档由 `/speckit.plan` 命令自动填充。执行流程见 `.specify/templates/commands/plan.md`。

## Summary

Artifact Data Dashboard 是一个整合 MySQL、Neo4j 与 Redis 的全栈应用，用于提供文物（artifact）管理、知识图谱可视化以及 AI Chat。

本计划以“当前仓库实现状态”为基线（已用 repomix 复核），聚焦 v1.0.0 的收敛与对齐：

1) 对齐附件列表分页（spec 已确认 `GET /attachments?page&limit`，默认 `limit=50`）并同步前端与 OpenAPI
2) 修正实现与文档/Swagger 注释的偏差，减少误导
3) 以最小可交付方式落地 AI 插件化（配置文件 + 重启生效 + 审计日志），避免影响核心路径
4) 同步 tasks 勾选与验收口径，保持“规格/合同/实现”一致

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
	- 后端：已实现上传/删除 admin-only，读取/下载登录可用。
	- 前端：独立附件管理页与文物详情内附件区已接入；非 admin 有提示。
- **数据导出（dict/JSON -> xlsx）**：文档明确固定 sheet/列顺序与归一化规则；提供关键函数复用方式（`derive_export_payload()` / `write_workbook()`）。
- **Excel 导入/导出（移自 Debug）**：
	- 导出：生成 Excel 并作为附件保存（`ownerType="system_export"`）。
	- 导入：从附件（`ownerType="system_import"`）触发导入逻辑。
	- 权限：仅 admin 可触发。
- **AI 插件化**：目前为规格/任务层，代码仍为单一 MCPService（未引入配置驱动的 provider/capability registry）。

## Gap Analysis (Spec / Contract / Implementation)

1) **附件分页（P0）**
	 - Spec：要求 `GET /attachments?page&limit`，默认 `limit=50`，按 `id DESC`。
	 - 实现：`GET /api/attachments` 当前为全量返回（仅过滤 ownerType/ownerId），无 page/limit。
	 - OpenAPI：`/attachments` 当前缺少 page/limit 参数与分页 meta 约定。
	 - 影响：数据量上来后会造成接口慢/前端体验差，并且“spec/合同/实现”不一致。

2) **附件 Swagger 注释不一致（P1）**
	 - `backend/src/routes/attachment.routes.js` 的注释仍包含“默认仅返回当前用户上传”的描述，但实际实现是全量（可过滤）。
	 - 影响：API 文档误导使用者。

3) **AI 插件化未落地（P2）**
	 - Spec：配置文件 + 重启生效；admin-only 管理（最小可解释为“仅 admin 可查看/变更开关”）；调用写入 logs。
	 - 实现：MCPService 直接读取 env 并调用，不存在插件 registry、配置文件与审计落库。

## Execution Plan (Next)

### Phase A (P0): Attachments Pagination — End-to-End

目标：把分页“端到端”补齐，并保证 spec/合同/实现一致。

后端（必做）：
- `backend/src/routes/attachment.routes.js`
	- 为 `GET /api/attachments` 增加 `page`/`limit` query（默认 `limit=50`；page 默认 1）。
	- 返回结构增加 `meta: { total, page, limit, totalPages }`。
	- SQL：增加 `LIMIT/OFFSET`；增加总数查询 `COUNT(*)`（与过滤条件一致）。

前端（必做）：
- `frontend/src/services/attachment.service.js`：`listAttachments` 支持传入 `page`/`limit`。
- `frontend/src/pages/Attachments.js`
	- Table 改为受控分页（由接口返回 meta 驱动），避免仅做前端本地分页。
	- 交互：切页/改 pageSize 触发重新请求。

合同（必做）：
- `specs/main/contracts/api.yaml`
	- 为 `/attachments` 增加 `page`/`limit` 参数。
	- 响应中补充 `meta` 结构（与后端保持一致）。

验收点：
- 默认不传 `limit` 时，返回最多 50 条。
- 按 `id DESC`。
- `ownerType/ownerId` 过滤与分页同时生效。

### Phase B (P1): Documentation / Swagger Consistency

目标：消除已知误导。

- 修正 `backend/src/routes/attachment.routes.js` 中 swagger summary/description，使其描述真实行为（可按 ownerType/ownerId 过滤，不默认限制 uploaded_by）。

### Phase C (P2): AI Plugins MVP (Config + Restart + Audit)

目标：在不重构现有聊天主链路的前提下，引入“最小插件化骨架”。

建议最小交付内容：
- 新增配置文件（示例：`backend/config/ai-plugins.json`）：声明启用的 provider 与 capability。
- 引入轻量 registry（provider vs capability 的边界按 spec）：
	- provider：负责实际模型调用（先把现有 MCPService 包装成一个 provider）。
	- capability：对输入/输出做增强（例如 logging/sanitize 的包装层）。
- 在聊天调用路径中写入 MySQL `logs`：
	- `ai_provider_call` / `ai_plugin_call` / `ai_plugin_error`

验收点：
- 改配置后重启生效。
- 插件禁用时不影响核心路径（给出可理解的“未启用”反馈）。
- 调用可追溯（logs 有记录）。

### Phase D: Sync Tasks

目标：让 `specs/main/tasks.md` 与代码现状一致。

- 勾选已完成项（Artifacts admin-only、附件权限收敛等）。
- 将附件分页拆成明确子任务（后端/前端/合同）。
- AI 插件化拆成“配置文件、registry、日志”三个子任务，便于迭代验收。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
