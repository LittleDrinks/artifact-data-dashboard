# Phase 0 Research: 环境配置与系统变量治理

**Feature**: [spec.md](spec.md)
**Date**: 2026-01-03

## Context Snapshot (现状摘要)

- `docker-compose.yml` / `docker-compose.prod.yml`：
  - MySQL/Neo4j/Redis 使用 `${VAR:-default}` 形式，但 dev 环境 Redis 密码存在硬编码 `password`（`--requirepass password`）。
  - `backend` 服务使用 `env_file: ./backend/.env`（而 README 同时建议项目根目录 `.env` 给 compose 使用）。
  - `mysql` 默认创建非 root 用户（`MYSQL_USER`/`MYSQL_PASSWORD`），但后端示例文件 `backend/.env.example` 默认用 `MYSQL_USER=root`。
- 后端：`backend/src/index.js` 在进程启动时调用 `dotenv.config()`，并大量依赖 `process.env.*`。
- 前端：使用 `REACT_APP_API_URL` 作为 axios baseURL（`frontend/src/services/auth.service.js`）。

## Decisions

### Decision 1: 以仓库根目录 `.env` + `.env.example` 作为唯一“人工配置入口”

- **Decision**: 统一将“开发者需要手动填写的配置”集中到仓库根目录 `.env`（不提交）与 `.env.example`（提交）。
- **Rationale**:
  - 符合宪章 Principle 5（凭证与敏感配置不得提交；使用 `.env` 模板说明注入策略）。
  - 避免 `backend/.env`、系统环境变量、compose 变量多头维护导致的漂移与冲突。
  - 与用户澄清一致（Clarifications：已选 A）。
- **Alternatives considered**:
  - `backend/.env` 作为主入口：会导致前端/compose 变量另起一套。
  - 只用系统环境变量：可复现性差且容易污染机器全局环境。

### Decision 2: 生产/类生产启动以 `docker-compose.yml` + “生产模式变量”实现

- **Decision**: “生产/类生产”验收以 `docker-compose.yml` 为入口，通过一个明确变量切换模式（例如 `APP_ENV=production` 或同等概念），不强制依赖 `docker-compose.prod.yml`。
- **Rationale**:
  - 与用户澄清一致（Clarifications：已选 B）。
  - 避免两套 compose 文件在变量/端口/挂载上长期分叉。
- **Alternatives considered**:
  - 以 `docker-compose.prod.yml` 为唯一生产入口：对现状可行，但会强化“双文件双规则”，反而加大治理面。

### Decision 3: 配置优先级固定为“显式覆盖 > 环境变量(.env 注入) > 默认值”

- **Decision**: 优先级规则为：启动参数/显式覆盖 > 环境变量（含从 `.env` 注入）> 代码内默认值。
- **Rationale**:
  - 与用户澄清一致（推荐项）。
  - 有利于解释覆盖链路，并支撑诊断输出（可观测）。
- **Alternatives considered**:
  - 环境变量高于显式覆盖：会让临时排障/一次性覆盖更困难。

### Decision 4: Compose 侧“容器自身凭证”与“应用连接凭证”使用同一组变量名，并杜绝硬编码默认密码

- **Decision**:
  - Redis、MySQL、Neo4j 的密码不在 compose 中硬编码；统一使用 `${REDIS_PASSWORD:-password}` 等形式，并确保后端连接使用同一变量值。
  - 后端默认不使用 MySQL root 账号连接数据库；使用 compose 创建的普通账号（`MYSQL_USER`/`MYSQL_PASSWORD`），除非显式覆盖。
- **Rationale**:
  - 降低“容器用一套，后端用一套”的漂移风险（README 里也明确提到该问题）。
  - 遵循最小权限原则。
- **Alternatives considered**:
  - 后端继续用 root：短期省事，但增加误操作风险，且与 compose 默认用户策略冲突。

### Decision 5: 诊断报告只输出到 stdout，并提供结构化 JSON（脱敏）

- **Decision**:
  - 每次启动打印一段结构化诊断摘要到 stdout（JSON 形式，脱敏），容器场景通过日志查看。
- **Rationale**:
  - 与用户澄清一致（仅 stdout）。
  - stdout 对本地与容器均一致；更易形成统一排障路径。
- **Alternatives considered**:
  - 写文件：需要额外卷挂载/权限与清理策略，复杂度更高。
  - Debug API/页面：超出本特性要求。

## Risks & Mitigations

- **Risk**: 迁移变量命名/来源会影响现有启动方式。
  - **Mitigation**: 提供过渡期兼容（例如旧变量名映射/启动脚本提示），并通过诊断输出明确覆盖关系。
- **Risk**: 前端 CRA 环境变量具有“构建时注入”的限制。
  - **Mitigation**: 在 compose 中显式注入 `REACT_APP_*`；并在 quickstart 中说明“修改后需重启/重新构建”的边界。

## Open Questions

- 无（spec 中不存在 NEEDS CLARIFICATION；关键行为已通过 Clarifications 确认）。
