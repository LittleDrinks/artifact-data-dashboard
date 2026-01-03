# Contract: Environment Keys

**Feature**: [spec.md](../spec.md)
**Research**: [research.md](../research.md)
**Date**: 2026-01-03

本文件定义“环境变量命名与归属”的契约，用于：
- `.env.example` 的字段清单
- docker-compose 的注入
- 后端/前端读取的一致性

## Precedence (优先级)

1. 启动参数/显式覆盖
2. 环境变量（包含从仓库根目录 `.env` 注入）
3. 代码内默认值

## Key Groups

### Runtime profile

- `APP_ENV` (recommended): `development|production`
- `NODE_ENV`: Node runtime mode（与 `APP_ENV` 可同时存在；`NODE_ENV` 主要影响依赖行为）

### Backend HTTP

- `PORT`: backend listen port
- `TRUST_PROXY`: `true|false|number|string`（影响 `express` trust proxy）

### MySQL (container + app)

- `MYSQL_ROOT_PASSWORD` (sensitive): MySQL 容器 root 密码
- `MYSQL_DATABASE`: 默认数据库名
- `MYSQL_USER`: 应用连接的数据库用户（非 root）
- `MYSQL_PASSWORD` (sensitive): 应用连接的数据库密码
- `MYSQL_HOST`: backend 连接 host（compose 场景通常是 `mysql`）
- `MYSQL_PORT`: backend 连接端口（compose 场景通常是 `3306`）

### Neo4j (container + app)

- `NEO4J_USER`: Neo4j 用户
- `NEO4J_PASSWORD` (sensitive): Neo4j 密码
- `NEO4J_URI`: backend 连接 URI（compose 场景通常 `bolt://neo4j:7687`）

### Redis (container + app)

- `REDIS_PASSWORD` (sensitive): Redis 密码（容器 requirepass 与 backend 连接使用同一值）
- `REDIS_HOST`: backend 连接 host（compose 场景通常是 `redis`）
- `REDIS_PORT`: backend 连接端口（compose 场景通常是 `6379`）

### Auth / JWT

- `JWT_SECRET` (sensitive): JWT 签名密钥
- `JWT_EXPIRES_IN`: 例如 `24h`

### AI / MCP

- `AI_API_ENDPOINT`
- `AI_API_KEY` (sensitive)
- `AI_MODEL`
- `AI_TEMPERATURE`
- `AI_MAX_TOKENS`

### Uploads

- `UPLOAD_DIR`
- `MAX_UPLOAD_SIZE_MB`

### Frontend

> CRA/React Scripts 只会将 `REACT_APP_*` 注入到前端代码侧。

- `REACT_APP_API_URL`: 前端 axios baseURL

## Redaction Rules (脱敏)

- 所有标记为 sensitive 的 key：
  - 诊断输出中只允许出现“已设置/未设置/被覆盖/来源类别”，不得输出完整值。
  - 可选：保留长度/前后 1-2 位的部分掩码（仍需谨慎，默认不建议）。
