# 文物大数据与人工智能集成系统 (Artifact Data Dashboard)

[![项目状态](https://img.shields.io/badge/状态-功能基本完整-green.svg)](https://github.com/LittleDrinks/artifact-data-dashboard)
[![Docker](https://img.shields.io/badge/部署-Docker%20Compose-2496ED.svg?logo=docker)](https://github.com)

本项目是一个文物数据管理和智能分析平台，集成了大数据分析、知识图谱和人工智能技术。目标是为数据工程师、馆藏管理员、研究人员提供文物/文献的采集、检索、知识图谱与可视化分析平台，支持上传/转换 Excel、生成知识图谱、聊天/检索接口与统计图表。

## 🔧 架构预览

- 后端（Node.js）：API、身份认证、文件上传、聊天接口、Excel→KG 服务。
- 前端（React）：管理面板、搜索、知识图谱、聊天与附件页面。
- 数据与爬虫（Python）：爬虫与导出脚本、样例数据在 crawler。
- 部署：Docker Compose 和 Dockerfiles。

### 关键模块与接口
后端路由：artifact.routes.js、attachment.routes.js、chat.routes.js、graph.routes.js 等。
后端服务：excel-kg.service.js（Excel→KG）、mcp.service.js（外部 AI/插件交互）。
前端页面：Search.js、KnowledgeGraph.js、Chat.js、Attachments.js 等。
API 合同：api.yaml（查看现有接口定义）。

### 数据与初始化
您可以使用 DB 初始化脚本：init-mysql.sql、init-neo4j.js。也可以在启动系统后导入指定格式的 .xlsx 文件。


## 🚀 部署指南 (Deployment)

### 环境要求
- Docker 20.10+
- Docker Compose 2.0+

### 一键启动
```bash
# 1. 克隆项目
git clone https://github.com/LittleDrinks/artifact-data-dashboard.git
cd artifact-data-dashboard

# 2. 配置环境变量
# 说明：本项目的唯一“人工配置入口”为仓库根目录 `.env`：
# - docker compose 通过 `env_file: ./.env` 将变量注入到后端/前端容器。
cp .env.example .env

# 3. 启动服务 (生产环境)
docker-compose -f docker-compose.prod.yml up -d --build

# 或者启动开发环境
docker-compose up -d --build

# 如果你的环境没有 docker-compose 命令（仅提供 Compose v2 插件），请将命令改为：
# docker compose ...
```

运行模式切换（`APP_ENV`）：

- PowerShell：`$env:APP_ENV='development'; docker compose up --build`
- PowerShell（类生产）：`$env:APP_ENV='production'; docker compose up -d --build`
- Bash：`APP_ENV=development docker compose up --build`
- Bash（类生产）：`APP_ENV=production docker compose up -d --build`

Windows 也可以直接使用脚本：

- 开发环境：双击运行 `start-dev.bat`
- 重置 MySQL 数据：双击运行 `reset_data.bat`
- 查看日志：双击运行 `view-logs.bat`

访问地址：
- **前端**: http://localhost:8080
- **后端API (开发环境)**: http://localhost:3000/api-docs
- **后端API (生产环境)**: http://localhost:13000/api-docs
- **Neo4j Browser**: http://localhost:17474 (默认账号: neo4j / password；由 docker-compose 的 `NEO4J_USER`/`NEO4J_PASSWORD` 控制，建议同步更新根目录 `.env` 保持一致)

其他常用端口（开发环境 docker-compose.yml）：

- **MySQL**: localhost:13306
- **Redis**: localhost:16379 (默认密码: password；可通过根目录 `.env` 的 `REDIS_PASSWORD` 覆盖)

最小验证（建议）：

- 后端健康检查：`http://localhost:3000/health`（开发环境）
- 后端 API 文档：`http://localhost:3000/api-docs`（开发环境）
- 如启动失败：先运行 `view-logs.bat` 查看 backend 日志中的 JSON 诊断摘要

## 📖 使用指南 (Usage)

### 1. 数据导入格式 (Data Formats)

系统支持通过 Excel 文件批量导入文物数据。导入功能位于“附件管理”模块（仅限管理员）。


Excel 模板的 **sheet/列名/列顺序** 为固定 schema，权威定义以：

- `backend/src/config/excel-schema.js`

为准。Python 侧转换建议复用：

- `build_kg/convert_artifact_to_excel.py` 中的 `derive_export_payload()` / `write_workbook()`

### 2. AI 插件配置 (AI Plugins)

智能问答功能基于 MCP (Model Context Protocol) 架构。

- **配置文件**: `backend/config/ai-plugins.json`（可通过 `.env` 的 `AI_PLUGINS_CONFIG` 覆盖路径）
- **配置方式**: 修改配置后重启后端容器生效。
- **查看状态**: `GET /api/ai-plugins/status`（仅管理员）

示例配置：
```json
{
  "version": 1,
  "defaultProvider": "mcp",
  "providers": {
    "mcp": { "enabled": true }
  },
  "capabilities": {
    "sanitize": { "enabled": true },
    "logging": { "enabled": true }
  }
}
```

### 3. 附件管理 (Attachments)

附件管理提供分页查询接口，用于管理上传的图片和文档。

- **接口**: `GET /api/attachments`
- **参数**: `page` (页码), `limit` (每页数量，默认 50), `ownerType`/`ownerId`（可选过滤）
- **功能**: 支持 Excel 导入/导出 (Admin Only)。

Excel 导入/导出（移自 Debug，Admin Only）：

- 导出为附件：`POST /api/attachments/excel/export`（生成 `ownerType="system_export"` 的附件）
- 从附件触发导入：`POST /api/attachments/{id}/excel/import?strategy=append|overwrite`（要求该附件为 `ownerType="system_import"`）

## 🛠️ 开发与维护

### 目录结构
- `backend/`: Node.js Express 服务
- `frontend/`: React Ant Design 应用
- `build_kg/`: Python 数据处理脚本 (爬虫、Excel转换)
- `specs/`: 项目文档与规范

### 常用命令
```bash
# 重置数据 (Windows)
./reset_data.bat

# 启动开发环境 (Windows)
./start-dev.bat

# 查看日志 (Windows)
./view-logs.bat
```

注意：`reset_data.bat` 目前默认使用 MySQL root 密码 `password` 连接容器；如果你修改了 `MYSQL_ROOT_PASSWORD`，需要同步更新该脚本或改用手动命令。

### 环境变量（重要）

配置入口：

- 根目录 `.env`：唯一需要手动维护的配置文件（docker compose 会注入到容器内的 `process.env`）。
- 根目录 `.env.example`：模板文件（用于生成 `.env`）。

关于历史文件：

- `backend/.env*`：已移除（不再作为配置入口），请只维护根目录 `.env`。

如果你选择在宿主机直接运行 backend（不在容器里），仍建议从根目录 `.env` 提供相同的一组变量，并把 host/port 调整为宿主机地址与映射端口（例如 MySQL 13306）。

### 排障路径（启动失败/连接失败）

1) 查看后端启动诊断摘要（stdout / 容器日志）

- 使用 `view-logs.bat` 选择 backend
- 后端启动时会输出 JSON（不包含敏感值），重点关注：
  - `missingRequired`: 缺失的必填配置
  - `invalid`: 非法值/弱默认值（`APP_ENV=production` 时更严格）
  - `profile` / `entrypoint`: 当前运行模式与启动入口

2) 常见修复

- `missingRequired` 非空：从 `.env.example` 重新生成 `.env` 并补齐缺失项
- 数据库/缓存连接失败：检查 `.env` 里的 `*_HOST`/`*_PORT`/`*_PASSWORD` 是否与 compose 容器侧一致
- Redis 报错 `auth`：确保 `docker-compose.yml` 的 `--requirepass` 与 `REDIS_PASSWORD` 一致

## 📄 许可证
MIT License
