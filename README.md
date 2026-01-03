# 文物大数据与人工智能集成系统 (Artifact Data Dashboard)

[![项目状态](https://img.shields.io/badge/状态-功能基本完整-green.svg)](https://github.com/LittleDrinks/artifact-data-dashboard)
[![Docker](https://img.shields.io/badge/部署-Docker%20Compose-2496ED.svg?logo=docker)](https://github.com)

本项目是一个文物数据管理和智能分析平台，集成了大数据分析、知识图谱和人工智能技术。

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
cp .env.example .env
# 说明：本项目的唯一“人工配置入口”为仓库根目录 `.env`：
# - docker compose 通过 `env_file: ./.env` 将变量注入到后端/前端容器。
# - `.env` 不得提交；`.env.example` 为可提交模板。
# Windows: notepad .env
# Linux/Mac: nano .env

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

> **💡 示例文件与工具**：
> 项目在 `build_kg/` 目录下提供了示例数据和转换脚本，可用于生成标准的导入模板：
> - **[build_kg/test.json](build_kg/test.json)**: JSON 格式的完整示例文物数据。
> - **[build_kg/process.py](build_kg/process.py)**: 将 JSON 数据转换为符合系统要求的 Excel 文件的 Python 脚本。
>
> **生成示例 Excel**:
> ```bash
> cd build_kg
> python process.py test.json artifact_import_template.xlsx
> ```

Excel 模板字段/工作表的最终定义以后端配置为准：

- `backend/src/config/excel-schema.js`

**Excel 结构要求：**
Excel 文件应包含以下工作表（Sheet），每个工作表对应一类实体或关系。

#### 实体表 (Entities)

| 工作表名 | 必需列 (Columns) | 说明 |
| :--- | :--- | :--- |
| **Artifacts** | `artifact_id`, `name`, `category`, `era`, `description`, `image_url` | 文物核心数据 |
| **Eras** | `name`, `start_year`, `end_year` | 朝代/时期信息 |
| **Categories** | `name`, `description` | 文物类别 |
| **Materials** | `name`, `description` | 材质信息 |
| **Locations** | `name`, `region` | 馆藏地点 |

#### 关系表 (Relationships)

| 工作表名 | 必需列 (Columns) | 说明 |
| :--- | :--- | :--- |
| **REL_HAS_CATEGORY** | `artifact_id`, `category_name` | 文物 -> 类别 |
| **REL_BELONGS_TO_ERA** | `artifact_id`, `era_name` | 文物 -> 朝代 |
| **REL_MADE_OF** | `artifact_id`, `material_name` | 文物 -> 材质 |
| **REL_STORED_AT** | `artifact_id`, `location_name` | 文物 -> 地点 |

> **注意**：
> - `artifact_id` 必须唯一。
> - 关系表中的 `*_name` 必须与对应实体表中的 `name` 一致。
> - 布尔值请使用 `TRUE`/`FALSE`。

### 2. AI 插件配置 (AI Plugins)

智能问答功能基于 MCP (Model Context Protocol) 架构。

- **配置文件**: `backend/config/ai-plugins.json`
- **配置方式**: 修改文件后重启后端容器。
- **查看状态**: `GET /api/ai-plugins/status` (管理员)

示例配置：
```json
{
  "plugins": [
    {
      "name": "artifact-qa",
      "enabled": true,
      "provider": "openai",
      "config": { "model": "gpt-3.5-turbo" }
    }
  ]
}
```

### 3. 附件管理 (Attachments)

附件管理提供分页查询接口，用于管理上传的图片和文档。

- **接口**: `GET /api/attachments`
- **参数**: `page` (页码), `limit` (每页数量)
- **功能**: 支持 Excel 导入/导出 (Admin Only)。

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
