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
cp backend/.env.example backend/.env
# 务必根据你的部署方式修改配置：
# - 后端自身配置：backend/.env（后端容器/进程读取）
#   - JWT密钥 (JWT_SECRET)
#   - AI配置 (AI_API_KEY, AI_MODEL)
#   - 后端连接数据库/图数据库/Redis 的账号密码（需与容器侧一致）
# - 容器侧账号密码（MySQL/Neo4j/Redis 容器自身使用）：建议在“项目根目录”创建 .env（docker-compose 会自动读取）
#   - MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD
#   - NEO4J_USER / NEO4J_PASSWORD
#   - REDIS_PASSWORD
# 提示：如果你只改了 backend/.env，但没有同步改 docker-compose 的变量，可能导致后端无法连上容器。
# Windows: notepad backend/.env
# Linux/Mac: nano backend/.env

# 3. 启动服务 (生产环境)
docker-compose -f docker-compose.prod.yml up -d --build

# 或者启动开发环境
docker-compose up -d --build

# 如果你的环境没有 docker-compose 命令（仅提供 Compose v2 插件），请将命令改为：
# docker compose ...
```

Windows 也可以直接使用脚本：

- 开发环境：双击运行 `start-dev.bat`
- 重置 MySQL 数据：双击运行 `reset_data.bat`
- 查看日志：双击运行 `view-logs.bat`

访问地址：
- **前端**: http://localhost:8080
- **后端API (开发环境)**: http://localhost:3000/api-docs
- **后端API (生产环境)**: http://localhost:13000/api-docs
- **Neo4j Browser**: http://localhost:17474 (默认账号: neo4j / password；由 docker-compose 的 `NEO4J_USER`/`NEO4J_PASSWORD` 控制，建议同步更新 `backend/.env` 保持一致)

其他常用端口（开发环境 docker-compose.yml）：

- **MySQL**: localhost:13306
- **Redis**: localhost:16379 (默认密码: password；生产环境可通过 docker-compose 的 `REDIS_PASSWORD` 覆盖，后端也需同步更新 `backend/.env`)

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

后端通过 `backend/.env` 读取数据库/Neo4j/Redis 配置。

- `backend/.env.example` 默认按 Docker Compose 场景配置（容器内使用服务名 `mysql`/`neo4j`/`redis` 互联）。
- 如果你选择在宿主机直接运行后端（不在容器里），需要把这些 host 改成 `localhost`，并使用 compose 暴露的宿主机端口（例如 MySQL 13306）。

## 📄 许可证
MIT License
