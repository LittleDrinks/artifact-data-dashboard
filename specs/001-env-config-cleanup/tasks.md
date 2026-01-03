---

description: "Task list for feature implementation"
---

# Tasks: 环境配置与系统变量治理

**Input**: Design documents from `/specs/001-env-config-cleanup/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

> 说明：本任务列表不包含“测试优先”的强制要求（spec 未要求 TDD）。如需要补测，可在最终 Polish phase 追加。

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 创建根目录 `.env.example` 并对齐 specs/001-env-config-cleanup/contracts/env-keys.md
- [X] T002 更新 `.gitignore`：忽略根目录 `.env`（不得提交敏感值）
- [X] T003 [P] 更新 `README.md`：将“根目录 `.env` + `.env.example`”作为唯一人工入口并解释与 docker compose 的关系
- [X] T004 [P] 更新 `start-dev.bat`：从根目录 `.env.example` 生成 `.env`（不再生成/依赖 `backend/.env`）

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: 本阶段完成前，不开始任何用户故事实现。

- [X] T005 更新 `docker-compose.yml`：backend 使用 `env_file: ./.env`（移除 `./backend/.env`）并注入 `APP_ENV`
- [X] T006 [P] 更新 `docker-compose.yml`：frontend 使用 `env_file: ./.env` 并注入 `REACT_APP_API_URL`
- [X] T007 更新 `docker-compose.yml`：`redis` 服务 `command` 改为 `--requirepass ${REDIS_PASSWORD:-password}`
- [X] T008 更新根目录 `.env.example`：默认使用 `MYSQL_USER`/`MYSQL_PASSWORD`（非 root）并与 `docker-compose.yml` MySQL 初始化保持一致
- [X] T009 新增后端配置加载与校验模块 `backend/src/config/env.js`（对齐 `contracts/startup-diagnostics.schema.json`，含脱敏与必填校验）
- [X] T010 在 `backend/src/index.js` 接入 `backend/src/config/env.js`：启动时 stdout 打印诊断摘要，缺失/非法配置快速失败
- [X] T011 [P] 移除 `backend/.env.example`：避免双入口误导（以根目录 `.env` + `.env.example` 为唯一人工入口）
- [X] T012 [P] 更新 `frontend/src/services/auth.service.js`：明确 `REACT_APP_API_URL` 为空时的行为（同源/代理）并避免误用

**Checkpoint**: 完成后应满足：`APP_ENV=development` 可启动并输出诊断；缺失配置能被诊断并失败；不再依赖系统级环境变量。

---

## Phase 3: User Story 1 - 新成员可快速启动项目 (Priority: P1) 🎯 MVP

**Goal**: 新开发者只需按文档与模板创建根目录 `.env`，即可一键启动并完成最小验证。

**Independent Test**: 删除本机相关环境变量与历史 `.env` 后，仅按 README + `.env.example` 操作，执行 `start-dev.bat` 或 `docker compose up --build` 可启动并访问前端/后端健康检查。

- [X] T013 [US1] 在 `README.md` 补齐“零配置上手”步骤：从 `.env.example` 生成 `.env`、填写字段、启动与最小验证
- [X] T014 [P] [US1] 更新 `view-logs.bat`：增加“查看诊断摘要”的指引（stdout/容器日志）并对齐 compose 入口
- [X] T015 [P] [US1] 更新 `reset_data.bat`：避免假定 `MYSQL_ROOT_PASSWORD=password`；改为从根目录 `.env` 读取或提示用户设置
- [X] T016 [US1] 更新 `README.md`：明确 `backend/.env*` 为非主入口并给出迁移说明

---

## Phase 4: User Story 2 - 开发者可明确切换运行模式 (Priority: P2)

**Goal**: 同一套 `docker-compose.yml` 入口下，通过 `APP_ENV` 切换 dev/prod-like 行为，且配置来源/覆盖关系可观测。

**Independent Test**: 在同一台机器上先后执行 `APP_ENV=development` 与 `APP_ENV=production` 启动，两次都能在 stdout 中看到 profile 与来源摘要，且不会互相污染。

- [X] T017 [US2] 在 `backend/src/config/env.js` 实现 `APP_ENV=production` 的更严格校验规则（缺失敏感/关键连接项即失败）
- [X] T018 [US2] 在 `README.md` 增加 `APP_ENV` 切换示例（PowerShell/Bash）并说明 dev/prod-like 的差异
- [X] T019 [US2] 在 `backend/src/config/env.js` 的诊断摘要中输出 `profile` 与 `entrypoint=docker-compose.yml`

---

## Phase 5: User Story 3 - 排障更直接 (Priority: P3)

**Goal**: 启动失败时能直接区分配置缺失/冲突/非法值 vs 服务不可用，并给出可执行修复建议。

**Independent Test**: 人为制造缺失/非法/冲突配置，启动时 stdout 输出包含 `missingRequired` / `invalid` 等字段，且不泄漏敏感值。

- [X] T020 [US3] 在 `backend/src/config/env.js` 为常见缺失/非法配置提供“原因 + 下一步建议”（脱敏）
- [X] T021 [US3] 在 `backend/src/config/database.js` 改善连接失败的错误分类与提示（DNS/端口/认证失败等），并与诊断术语一致
- [X] T022 [US3] 在 `README.md` 增加“排障路径”章节：与诊断摘要字段对齐（missingRequired/invalid/overrides）

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T023 [P] 同步 `docker-compose.prod.yml`：消除与 `docker-compose.yml` 的变量命名漂移（尤其是 `REDIS_PASSWORD` 与 env 注入方式）
- [X] T024 [P] 更新 `specs/001-env-config-cleanup/quickstart.md`：补齐与最终实现一致的命令与验收点（不包含真实密钥）
- [X] T025 [P] 审计仓库是否存在误提交的敏感值（文档/示例/脚本），并在 `README.md` 明确“不得提交的文件/字段”
- [X] T026 运行一次最小端到端验证并把结果记录到 `specs/001-env-config-cleanup/plan.md`
- [X] T027 完善 `README.md`：将配置入口/优先级/迁移/排障与安全注意事项整合为单一权威说明，并确保与最终 compose 与 `backend/src/config/env.js` 行为一致

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3+ (User Stories) → Phase 6 (Polish)

### User Story Dependencies

- US1/US2/US3 均依赖 Foundational（Phase 2）完成
- US2 与 US3 不依赖 US1（但共享同一套配置治理能力）

### User Story Dependency Graph

```text
Phase 1 (Setup)
	↓
Phase 2 (Foundational)
	↓
 ┌───────────────┬───────────────┬───────────────┐
 │ US1 (P1 / MVP) │ US2 (P2)       │ US3 (P3)       │
 └───────────────┴───────────────┴───────────────┘
	↓
Phase 6 (Polish)
```

### Parallel Opportunities

- Phase 1: T003、T004 可并行
- Phase 2: T010、T011 可并行
- US1: T013、T014 可并行
- Phase 6: T022、T023、T024 可并行

---

## Parallel Example: User Story 1

```text
并行执行示例（US1）：
- T014 更新 view-logs.bat（不改业务代码）
- T015 更新 reset_data.bat（不改业务代码）
```

---

## Parallel Example: User Story 2

```text
并行执行示例（US2）：
- T018 更新 README 的 APP_ENV 切换说明
- T019 增强 env.js 的诊断摘要字段（profile/entrypoint）
```

---

## Parallel Example: User Story 3

```text
并行执行示例（US3）：
- T021 改善 database.js 的连接失败分类
- T022 更新 README 的排障路径章节
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1
2. 完成 Phase 2（关键门禁）
3. 完成 US1（Phase 3）
4. 停止并验证 US1 的独立验收

### Incremental Delivery

- 在 Phase 2 完成后，按 US1 → US2 → US3 逐步交付，每一步都能独立演示与回归。
