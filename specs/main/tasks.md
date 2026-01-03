# Tasks: Artifact Data Dashboard v1.0.0

**Input**: Design documents from `/specs/main/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`)

**Scope (2026-01-03)**: 基于 [specs/main/plan.md](specs/main/plan.md) 的“Next”计划拆分任务，聚焦：附件分页端到端对齐、Excel schema 一致性、AI 插件化 MVP（配置+重启+审计）。

**Tests**: 本轮未显式要求 TDD / 测试优先，因此不生成测试任务；如需引入 Jest/Supertest/Cypress，可在后续增补。

## Format

每条任务必须严格遵循：

`- [ ] T### [P?] [US#] 描述（必须包含文件路径）`

- `[P]`：可并行（不同文件、无未完成依赖）
- `[US#]`：仅用于 User Story 阶段任务（Setup/Foundational/Polish 不加）

---

## Phase 1: Setup (Project Initialization)

**Purpose**: 为后续改动提供一致的本地/容器运行基线。

- [ ] T001 校验附件上传相关环境变量示例与说明在 backend/.env.example
- [ ] T002 记录附件分页接口的预期响应示例到 specs/main/spec.md（更新 3.1.5 的响应示例段落）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 提供跨功能的基础约定与复用点。

- [ ] T003 统一附件列表响应结构（data + meta）并补齐错误响应约定到 specs/main/contracts/api.yaml

---

## Phase 3: User Story 1 - Attachment List Pagination (Priority: P1) 🎯 MVP

**Goal**: `/api/attachments` 支持 `page/limit`（默认 `limit=50`），并在前端实现服务端分页；spec/合同/实现对齐。

**Independent Test**:
- 启动服务后，请求 `GET /api/attachments` 返回最多 50 条，并包含 `meta.total/page/limit/totalPages`。
- 请求 `GET /api/attachments?page=2&limit=10` 正确分页且仍按 `id DESC`。
- 携带 `ownerType/ownerId` 时分页仍生效。
- 前端附件页切换分页会触发新请求并更新表格。

### Implementation

- [ ] T004 [US1] 为 `GET /api/attachments` 增加 `page/limit` 与 COUNT 查询（LIMIT/OFFSET）在 backend/src/routes/attachment.routes.js
- [ ] T005 [US1] 为附件列表响应增加 `meta` 字段并保持 `id DESC` 在 backend/src/routes/attachment.routes.js
- [ ] T006 [P] [US1] 为 listAttachments 增加 `page/limit` 参数透传在 frontend/src/services/attachment.service.js
- [ ] T007 [US1] 将附件管理页改为服务端分页（Table pagination 受控、onChange 触发请求）在 frontend/src/pages/Attachments.js
- [ ] T008 [P] [US1] 为 OpenAPI `/attachments` 增加 `page/limit` 参数与 `meta` 响应结构在 specs/main/contracts/api.yaml
- [ ] T009 [US1] 修正附件列表 swagger 注释与真实行为一致在 backend/src/routes/attachment.routes.js

---

## Phase 4: User Story 2 - Dict/JSON → XLSX Schema Consistency (Priority: P2)

**Goal**: 以一个“单一权威 schema”减少 Excel 导出/导入/脚本之间的漂移，并保持与 spec 的固定 sheet/列一致。

**Independent Test**:
- 后端导出的 Excel（若已有导出功能）与 `build_kg/convert_artifact_to_excel.py` 生成的表头集合/列顺序一致。
- 导入侧严格校验：缺少 sheet 或列名不匹配会拒绝并给出清晰错误。

### Implementation

- [ ] T010 [US2] 定义权威 Excel schema（sheets + columns）在 backend/src/config/excel-schema.js
- [ ] T011 [US2] 让导出逻辑使用 excel-schema.js 的固定顺序在 backend/src/routes/debug.routes.js
- [ ] T012 [US2] 校验并更新 Python 导出 schema 常量以匹配权威 schema 在 build_kg/convert_artifact_to_excel.py
- [ ] T013 [US2] 在导入/校验路径中强制 Excel schema 严格匹配并给出错误明细在 backend/src/routes/debug.routes.js

---

## Phase 5: User Story 3 - Plugin-based AI Extensions MVP (Priority: P3)

**Goal**: 在不影响核心路径的前提下，引入“配置驱动 + 重启生效”的 AI 插件化骨架，并写入审计日志。

**Independent Test**:
- 配置文件禁用 provider 时，聊天接口仍可返回“未启用/不可用”的清晰提示（不崩溃）。
- 启用 provider 后，聊天正常调用；调用过程写入 `logs`（`ai_provider_call`/`ai_plugin_call`/`ai_plugin_error`）。
- 修改配置并重启后生效。

### Implementation

- [ ] T014 [US3] 新增 AI 插件配置文件示例并定义字段结构在 backend/config/ai-plugins.json
- [ ] T015 [US3] 实现配置加载与校验（启动时读取，失败可降级）在 backend/src/services/ai/plugin-config.js
- [ ] T016 [US3] 抽象 Provider 接口并封装现有 MCP 调用为 provider 在 backend/src/services/ai/providers/mcp.provider.js
- [ ] T017 [US3] 实现 Capability 管道（至少包含 sanitize/logging 的包装点）在 backend/src/services/ai/capabilities/index.js
- [ ] T018 [US3] 在聊天路径接入插件选择与 capability 管道在 backend/src/routes/chat.routes.js
- [ ] T019 [US3] 将 AI 调用审计写入 MySQL logs（含 provider/capability 标识与结果）在 backend/src/routes/chat.routes.js
- [ ] T020 [US3] 提供 admin-only 插件状态查看接口（只读即可）在 backend/src/routes/ai-plugins.routes.js
- [ ] T021 [US3] 挂载 AI 插件状态路由并补充 Swagger/OpenAPI 在 backend/src/index.js

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 文档与运维验证，确保交付可用且一致。

- [ ] T022 [P] 更新运行与运维说明（附件分页默认值、AI 插件配置与重启生效）在 README.md
- [ ] T023 使用 docker-compose.yml 做一次 smoke test 并记录步骤/检查点到 specs/doc/diary.md

---

## Dependencies & Execution Order

### User Story Completion Order

- Phase 1 → Phase 2 → **US1（附件分页）** → **US2（Excel schema 一致性）** → **US3（AI 插件化 MVP）** → Polish

### Why this order

- US1 是当前最大的 spec/合同/实现偏差（P0），优先修复。
- US2 解决数据导入/导出长期漂移风险。
- US3 涉及架构变更与审计链路，放在后面降低回归风险。

---

## Parallel Execution Examples

### US1

- 你可以并行处理：
	- `T006`（frontend/src/services/attachment.service.js）
	- `T008`（specs/main/contracts/api.yaml）

### Polish

- `T022`（README.md）可与其他开发并行推进。

---

## Implementation Strategy

### MVP First

1) 完成 Phase 1 + Phase 2
2) 完成 Phase 3（US1：附件分页端到端）
3) **停止并验证**：按 US1 的 Independent Test 验收

### Incremental Delivery

- US1 → US2 → US3 每个阶段都要求“可独立验收”，避免一次性大改导致回归难定位。
