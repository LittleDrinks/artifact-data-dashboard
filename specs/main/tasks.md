# Tasks: Artifact Data Dashboard v1.0.0

**Input**: Design documents from `/specs/main/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`)

**Scope (2026-01-03)**: 聚焦三条用户故事：附件管理（含分页与审计）、dict/JSON→xlsx 固定 schema、AI 插件化（配置+重启生效+审计）。

**Tests**: 规格未显式要求 TDD / 测试优先，因此本任务清单不包含测试任务。

## Checklist Format (REQUIRED)

每条任务必须严格遵循：

`- [ ] T### [P?] [US#] 描述（必须包含文件路径）`

- `[P]`：可并行（不同文件、无未完成依赖）
- `[US#]`：仅用于 User Story 阶段任务（Setup/Foundational/Polish 不加）

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 为后续改动提供一致的本地/容器运行与配置基线。

- [ ] T001 补齐附件上传与 AI 插件相关环境变量示例在 backend/.env.example
- [ ] T002 明确 v1.0.0 的交付范围与验收口径（链接到 plan/spec/contract）在 specs/main/plan.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 提供跨故事共用的最小基础约定（数据库/合同基础结构）。

- [ ] T003 校验并对齐 logs/attachments 表结构（含 details 字段与索引）在 backend/scripts/init-mysql.sql
- [ ] T004 提供可复用的分页与附件响应 schema（PaginationMeta/AttachmentsListResponse）在 specs/main/contracts/api.yaml

---

## Phase 3: User Story 1 - 附件管理（分页 + 过滤 + 审计）(Priority: P1) MVP

**Goal**: 登录用户可 list/get/download；管理员可 upload/delete；附件列表支持 `page/limit`（默认 `limit=50`）与 `ownerType/ownerId` 过滤，并返回 `meta`。

**Independent Test Criteria**:
- `GET /api/attachments` 默认返回 <= 50 条，且包含 `meta.total/page/limit/totalPages`。
- `GET /api/attachments?page=2&limit=10` 按 `id DESC` 分页正确。
- `GET /api/attachments?ownerType=artifact&ownerId=<id>&page=1&limit=10` 过滤与分页同时生效。
- 非 admin 调用上传/删除返回 403 且错误信息明确。

### Implementation

- [ ] T005 [US1] 实现/校验 `GET /api/attachments` 的 `page/limit` 默认值、过滤条件、COUNT 与 `meta` 在 backend/src/routes/attachment.routes.js
- [ ] T006 [US1] 确保附件列表按 `id DESC`，并对 limit/offset 做安全校验在 backend/src/routes/attachment.routes.js
- [ ] T007 [P] [US1] 前端 listAttachments 透传 ownerType/ownerId/page/limit 在 frontend/src/services/attachment.service.js
- [ ] T008 [US1] 附件管理页使用服务端分页（Table 受控分页 + 切页/改 pageSize 触发请求）在 frontend/src/pages/Attachments.js
- [ ] T009 [P] [US1] OpenAPI 对齐 `/attachments` 的 query 参数与响应 `data+meta` 在 specs/main/contracts/api.yaml
- [ ] T010 [US1] Swagger 注释与规格一致（默认 limit=50、权限描述、meta 字段）在 backend/src/routes/attachment.routes.js
- [ ] T011 [P] [US1] 文物详情附件区对齐响应结构与权限提示（上传/删除仅 admin）在 frontend/src/pages/Search.js
- [ ] T012 [US1] 上传/删除附件写入审计日志 action=`upload_attachment`/`delete_attachment`（含 details）在 backend/src/routes/attachment.routes.js

---

## Phase 4: User Story 2 - dict/JSON → xlsx 固定 schema (Priority: P2)

**Goal**: 产出 xlsx 的 sheet/列名/列顺序稳定，值归一化规则一致，并与后端权威 schema 保持同步。

**Independent Test Criteria**:
- 同一输入多次导出：sheet 集合不变、列名与列顺序不变。
- `None/null`→空字符串；`bool`→`TRUE/FALSE`；`list/tuple`→`; ` 拼接。
- 文档明确说明复用 `derive_export_payload()`/`write_workbook()`，不提供独立可运行导出脚本。

### Implementation

- [ ] T013 [US2] 对齐并冻结权威 Excel schema（sheets+columns）在 backend/src/config/excel-schema.js
- [ ] T014 [P] [US2] 对齐 Python 侧 schema 常量与后端权威 schema 在 build_kg/convert_artifact_to_excel.py
- [ ] T015 [US2] 校验并补齐值归一化规则实现（None/bool/list）在 build_kg/convert_artifact_to_excel.py
- [ ] T016 [US2] 文档化导出复用方式与输入字段规范（保持“无独立脚本”）在 specs/main/spec.md
- [ ] T017 [P] [US2] 实现 Excel 导入/导出逻辑（移自 debug）：导出生成附件，导入从附件触发，仅 admin 可用在 backend/src/routes/attachment.routes.js

---

## Phase 5: User Story 3 - AI 插件化（配置 + 重启生效 + 审计）(Priority: P3)

**Goal**: 后端启动时读取 `backend/config/ai-plugins.json` 构建启用状态；改配置后重启生效；聊天路径在插件禁用时返回可理解提示；调用链写入审计日志。

**Independent Test Criteria**:
- 禁用 provider 时：聊天接口不崩溃，返回“未启用/不可用”提示。
- 启用 provider 时：聊天正常工作；写入 `logs` action=`ai_provider_call`/`ai_plugin_call`/`ai_plugin_error`。
- `/api/ai-plugins/status` 为 admin-only 且可返回当前配置与启用状态。

### Implementation

- [ ] T018 [P] [US3] 定义 AI 插件配置文件结构与默认值在 backend/config/ai-plugins.json
- [ ] T019 [US3] 实现配置加载、校验与缓存（失败降级但不影响启动）在 backend/src/services/ai/plugin-config.js
- [ ] T020 [P] [US3] 实现 Provider 封装（至少 MCP Provider）在 backend/src/services/ai/providers/mcp.provider.js
- [ ] T021 [P] [US3] 实现 Capability 管道（sanitize/logging 开关）在 backend/src/services/ai/capabilities/index.js
- [ ] T022 [US3] 在聊天 SSE 路径接入 provider 选择与 capability 应用，并处理 provider 不可用分支在 backend/src/routes/chat.routes.js
- [ ] T023 [US3] 将 AI 调用审计写入 MySQL logs（含 providerId、durationMs、结果状态）在 backend/src/routes/chat.routes.js
- [ ] T024 [US3] 提供 admin-only 插件状态接口在 backend/src/routes/ai-plugins.routes.js
- [ ] T025 [US3] 挂载 AI 插件路由并保持鉴权/角色校验在 backend/src/index.js
- [ ] T026 [P] [US3] OpenAPI 增补 `/ai-plugins/status` 接口定义在 specs/main/contracts/api.yaml

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 文档与运维验证，确保交付可运行且“规格/合同/实现”一致。

- [ ] T027 [P] 更新运行与运维说明（附件分页默认值、AI 插件配置路径与重启生效）在 README.md
- [ ] T028 [P] 记录 docker-compose 启动与关键接口 smoke checklist 在 specs/doc/diary.md

---

## Dependencies & Execution Order

### Dependency Graph

```text
Phase 1 (Setup) ─▶ Phase 2 (Foundational) ─▶ US1 (P1, MVP)
										 ├─▶ US2 (P2)
										 └─▶ US3 (P3)
										(then) ─▶ Polish
```

### User Story Dependencies

- US1/US2/US3 都依赖 Foundational（Phase 2）。
- US2 与 US3 之间无强依赖；可在 Phase 2 完成后并行推进。

---

## Parallel Execution Examples (Per Story)

### US1

- 可并行：T007（frontend/src/services/attachment.service.js）与 T009（specs/main/contracts/api.yaml）
- 可并行：T011（frontend/src/pages/Search.js）与后端 T005/T006（backend/src/routes/attachment.routes.js）

### US2

- 可并行：T014（build_kg/convert_artifact_to_excel.py）与 T016（specs/main/spec.md）

### US3

- 可并行：T018（backend/config/ai-plugins.json）、T020（backend/src/services/ai/providers/mcp.provider.js）、T021（backend/src/services/ai/capabilities/index.js）
- 可并行：T026（specs/main/contracts/api.yaml）与后端实现任务（T022-T025）

---

## Implementation Strategy

### MVP First (US1 Only)

1) 完成 Phase 1 + Phase 2
2) 完成 Phase 3（US1）
3) **停止并验收**：按 US1 的 Independent Test Criteria 验证

### Incremental Delivery

1) Setup + Foundational → Foundation ready
2) US1 → 可独立验收/演示
3) US2、US3 可并行推进（或按优先级顺序推进）
4) 最后补齐 Polish
