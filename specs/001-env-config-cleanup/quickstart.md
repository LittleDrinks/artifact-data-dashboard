# Quickstart: 环境配置治理后的启动方式（目标形态）

> 本 quickstart 描述本特性完成后的“目标启动方式”，用于实现阶段对齐与验收；示例不包含真实密钥。

**Feature**: [spec.md](spec.md)
**Research**: [research.md](research.md)
**Date**: 2026-01-03

## Prerequisites

- Docker Desktop（或等价 Docker Engine）
- Docker Compose v2

## 1) 创建根目录 `.env`

1. 从模板生成本地配置：
   - 复制 `.env.example` → `.env`
2. 根据你的环境填写 `.env` 中的敏感配置（密码、JWT、AI key 等）。

> 规则：`.env` 不提交到仓库；所有敏感值必须只存在于本机/CI secrets。

## 2) 启动（开发模式）

- 使用 `docker-compose.yml` 作为入口
- 设置 `APP_ENV=development`

示例（PowerShell）：

- `$env:APP_ENV='development'; docker compose up --build`

验收点：
- 前端可访问（例如 `http://localhost:8080`）
- 后端健康检查可访问（例如 `/health`）
- 控制台可见一段“启动诊断摘要”（stdout），且不包含敏感明文

## 3) 启动（生产/类生产模式）

- 仍然使用 `docker-compose.yml`
- 通过变量切换：`APP_ENV=production`

示例（PowerShell）：

- `$env:APP_ENV='production'; docker compose up -d --build`

验收点：
- 端口与模式符合文档约定
- 诊断摘要可通过容器日志读取（stdout）

## 4) 最小验证（端到端）

- 登录/注册：前端调用后端认证接口成功
- 数据大屏或查询页面能拉取数据并展示

## 5) 常见问题（治理后的排障路径）

- 启动失败：查看 stdout 诊断摘要中的 `missingRequired` / `invalid`
- 连接失败：确认 `.env` 中容器凭证与后端连接凭证是否一致（详见 [contracts/env-keys.md](contracts/env-keys.md)）
- 前端 API URL 不生效：确认 `REACT_APP_API_URL` 注入方式与“修改后需要重启/重建”的边界
