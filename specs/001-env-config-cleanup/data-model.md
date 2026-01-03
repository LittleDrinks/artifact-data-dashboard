# Phase 1 Data Model: 环境配置治理抽象模型

> 本文件描述“配置治理”所需的概念实体与约束，用于统一文档、诊断输出与 contracts；不代表必须引入数据库表。

**Feature**: [spec.md](spec.md)
**Research**: [research.md](research.md)
**Date**: 2026-01-03

## Entities

### 1) ConfigKey（配置项）

表示一个可被系统读取的配置值。

- `name` (string, required): 配置名（例如 `MYSQL_PASSWORD`、`REACT_APP_API_URL`）
- `description` (string, required): 用途描述
- `required` (boolean, required): 是否必填（对某个 Profile 而言）
- `sensitive` (boolean, required): 是否敏感（诊断/日志必须脱敏）
- `defaultBehavior` (string, optional): 默认值策略（例如“无默认，必须提供”或“默认为 password，仅供开发”）
- `validation` (object, optional):
  - `type`: `string|number|boolean|enum|url|hostport`
  - `pattern` / `min` / `max` / `allowedValues`

### 2) ConfigSource（配置来源）

配置可以来自多个来源；本特性要求来源与优先级明确。

- `kind` (enum, required): `explicitOverride|environment|default`
- `details` (string, optional): 说明（例如“来自 docker-compose env_file 注入”）

### 3) ConfigProfile（运行模式 / 配置集合）

一次启动所属的配置集合。

- `name` (enum, required): `development|production`（或等价命名）
- `entrypoint` (string, required): 启动入口（本特性约束为 `docker-compose.yml`）
- `keySet` (array<ConfigKey>, required): 在该 Profile 下的必填/可选配置项集合

### 4) EffectiveConfig（生效配置）

某次启动最终生效的一组配置。

- `profile` (ConfigProfile, required)
- `values` (map<string, string|number|boolean>, required): 生效值（敏感项不得以明文出现于诊断输出）
- `valueOrigins` (map<string, ConfigSource>, required): 每个配置项的来源

### 5) StartupDiagnostics（启动诊断摘要）

用于排障与可观测的摘要（stdout 输出）。

- `timestamp` (string, required): ISO8601
- `profile` (string, required)
- `detectedSources` (array<ConfigSource>, required)
- `overrides` (array<{key: string, from: ConfigSource, to: ConfigSource}>, required)
- `missingRequired` (array<string>, required)
- `invalid` (array<{key: string, reason: string}>, required)
- `redactedKeys` (array<string>, required)

## Relationships

- `ConfigProfile` **defines** many `ConfigKey`
- `EffectiveConfig` **resolves** `ConfigKey` → `ConfigSource`
- `StartupDiagnostics` **summarizes** `EffectiveConfig`（但不包含敏感明文）

## Validation Rules (核心约束)

- 所有 `sensitive=true` 的 `ConfigKey` 在诊断/日志中只能出现“已设置/未设置/被覆盖”之类信息，不得输出原文。
- 同一配置项多来源同时存在时，必须按优先级：`explicitOverride > environment(.env 注入) > default`。
- `production` profile 下，所有凭证类配置（DB/Redis/Neo4j/JWT/AI key）应被标记为 `sensitive=true` 且缺失即启动失败。
