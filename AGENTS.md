# AGENTS.md - AI Coding Agent Guide

> 本文件供 AI 编程助手阅读，用于快速理解项目架构和开发规范。
> 项目语言：中文（注释和文档主要使用中文）

---

## 项目概述

**文物大数据与人工智能集成系统** (Artifact Data Dashboard) 是一个文物数据管理和智能分析平台，集成了大数据分析、知识图谱和人工智能技术。

### 核心功能
- 文物/文献的采集、检索、知识图谱与可视化分析
- 基于 Excel 的数据批量导入/导出
- AI 智能问答（支持知识图谱查询、Markdown 渲染）
- 附件管理（DAMS - Digital Asset Management System）
- 词云分析和统计图表

### 目标用户
数据工程师、馆藏管理员、研究人员

---

## 技术栈

### 后端 (Backend)
| 技术 | 版本/说明 | 用途 |
|------|----------|------|
| Node.js | 16+ | 运行时 |
| Express | 4.x | Web 框架 |
| MySQL | 8.0 | 关系型数据（文物、用户、附件元数据） |
| Neo4j | 4.4 | 知识图谱存储 |
| Redis | 7.2 | 缓存、会话、状态管理 |
| Winston | 3.x | 日志记录 |
| Jest | 29.x | 单元测试 |

### 前端 (Frontend)
| 技术 | 版本/说明 | 用途 |
|------|----------|------|
| React | 18.x | UI 框架 |
| Ant Design | 5.x | 组件库 |
| D3.js | 7.x | 知识图谱可视化 |
| ECharts | 5.x | 统计图表 |
| react-markdown | 9.x | Markdown 渲染 |

### AI 与集成
| 技术 | 说明 |
|------|------|
| Ollama | 本地大模型服务 (deepseek-r1:8b) |
| MCP | Model Context Protocol 工具调用 |
| OpenAI SDK | 兼容 OpenAI 的 API 调用 |

### 部署
| 技术 | 说明 |
|------|------|
| Docker Compose | 本地开发和生产部署 |
| Nginx | 前端静态文件服务（生产） |

---

## 项目结构

```
artifact-data-dashboard/
├── .env                  # 唯一配置入口（需从 .env.example 复制）
├── .env.example          # 环境变量模板
├── docker-compose.yml    # 开发环境编排
├── docker-compose.prod.yml  # 生产环境编排
│
├── backend/              # Node.js 后端
│   ├── src/
│   │   ├── config/       # 数据库、日志、环境配置
│   │   ├── middleware/   # 认证、错误处理、验证
│   │   ├── models/       # 数据模型（文件夹、标签等）
│   │   ├── routes/       # API 路由
│   │   ├── services/     # 业务逻辑
│   │   │   ├── ai/       # AI 相关服务（模式管理、健康检查）
│   │   │   ├── mcp/      # MCP 服务
│   │   │   └── tools/    # AI 工具注册
│   │   └── utils/        # 工具函数
│   ├── __tests__/        # Jest 测试文件
│   ├── config/           # AI 插件配置、Cypher 规则
│   ├── scripts/          # 数据库初始化、迁移脚本
│   └── logs/             # 运行时日志
│
├── frontend/             # React 前端
│   ├── src/
│   │   ├── components/   # 组件（Admin, AssetLibrary, Chat）
│   │   ├── pages/        # 页面组件
│   │   ├── services/     # API 服务封装
│   │   └── utils/        # 工具函数
│   └── public/
│
├── data/                 # 数据导入目录（挂载到容器）
├── ollama/               # Ollama 模型数据卷
└── .github/
    ├── workflows/        # CI/CD 配置
    ├── agents/           # AI Agent 提示词模板
    └── rules/            # 编码规范规则
```

---

## 开发环境配置

### 前置要求
- Docker 20.10+
- Docker Compose 2.0+

### 快速启动

```bash
# 1. 配置环境变量
cp .env.example .env

# 2. 启动开发环境
docker-compose up -d --build

# Windows 快捷方式
./start-dev.bat       # 启动开发环境
./reset_data.bat      # 重置 MySQL 数据
./view-logs.bat       # 查看容器日志
```

### 访问地址（开发环境）
| 服务 | 地址 | 说明 |
|------|------|------|
| 前端 | http://localhost:8080 | React 开发服务器 |
| 后端 API | http://localhost:3000 | Express 服务 |
| API 文档 | http://localhost:3000/api-docs | Swagger UI |
| Neo4j | http://localhost:17474 | Neo4j Browser |
| MySQL | localhost:13306 | 外部访问端口 |
| Redis | localhost:16379 | 外部访问端口 |

### 环境变量说明

**唯一配置入口**：项目根目录的 `.env` 文件

关键配置项：
- `APP_ENV`: `development` | `production`
- `AI_API_ENDPOINT`: AI 服务地址（如 `http://ollama:11434/v1/chat/completions`）
- `AI_MODEL`: 默认 `deepseek-r1:8b`
- `MYSQL_*`, `NEO4J_*`, `REDIS_*`: 数据库连接配置
- `JWT_SECRET`: 生产环境必须修改为强随机字符串

---

## 构建与测试

### 后端

```bash
cd backend

# 安装依赖
npm install

# 开发模式（需本地 MySQL/Neo4j/Redis）
npm run dev

# 生产模式
npm start

# 运行测试
npm test

# 运行特定测试
npm test -- --testPathPattern="folder|tag|attachment"
```

### 前端

```bash
cd frontend

# 安装依赖
npm install

# 开发服务器
npm start

# 生产构建
npm run build

# 运行测试
npm test
```

### Docker 构建

```bash
# 开发环境
docker-compose up -d --build

# 生产环境（类生产配置）
$env:APP_ENV="production"  # PowerShell
export APP_ENV=production   # Bash
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 代码组织规范

### 后端目录约定

```
backend/src/
├── config/           # 配置加载和验证
│   ├── database.js   # MySQL/Neo4j/Redis 连接
│   ├── env.js        # 环境变量验证
│   └── logger.js     # Winston 日志配置
├── middleware/       # Express 中间件
│   ├── auth.middleware.js      # JWT 认证
│   ├── error.middleware.js     # 错误处理
│   └── validation.middleware.js # 请求验证
├── routes/           # API 路由（按功能模块）
│   ├── auth.routes.js
│   ├── artifact.routes.js
│   ├── chat.routes.js
│   └── ...
├── services/         # 业务逻辑层
│   ├── ai/           # AI 模式管理
│   ├── mcp.service.js
│   └── tools/        # AI 工具定义
└── utils/            # 工具函数
```

### 前端目录约定

```
frontend/src/
├── components/       # 可复用组件
│   ├── Admin/        # 管理功能
│   ├── AssetLibrary/ # 资产库组件
│   └── Chat/         # 聊天组件
├── pages/            # 页面级组件
├── services/         # API 封装
└── utils/            # 工具函数
```

### 命名规范
- **文件**: 小写 + 连字符（`chat.routes.js`, `AssetLibrary.js`）
- **组件**: PascalCase（`ModeManager.js`, `AssetPicker.js`）
- **服务**: camelCase（`auth.service.js`, `folderService.js`）
- **常量**: UPPER_SNAKE_CASE（`AI_MODES`, `RATE_LIMIT_MAX`）

---

## 测试策略

### 后端测试 (Jest)

测试文件位置：`backend/__tests__/`

```javascript
// 测试示例：chat.routes.test.js
const request = require('supertest');
const express = require('express');

// Mock 外部依赖
jest.mock('../src/config/database', () => ({
  neo4jDriver: { ... },
  redisClient: { ... },
  mysqlPool: { ... }
}));

describe('chat.routes tool results', () => {
  test('streams tools event with tools_called', async () => {
    // 测试实现
  });
});
```

**测试运行方式**:
```bash
cd backend
npm test
```

### 前端测试 (React Testing Library)

测试文件位置：`frontend/src/__tests__/`, `frontend/src/pages/__tests__/`

```bash
cd frontend
npm test
```

### CI/CD (GitHub Actions)

工作流文件：`.github/workflows/dams-ci.yml`

触发条件：
- Push 到 `main`, `develop`, `004-dams-enhancement` 分支
- Pull Request 到 `main`, `develop`

任务：
1. **backend-tests**: 运行后端单元测试（依赖 MySQL 服务）
2. **frontend-lint**: 前端 ESLint 检查
3. **migration-validation**: 数据库迁移验证

---

## 核心架构模式

### AI 模式管理 (Mode Management)

系统支持三级 AI 模式自动降级：

```
ONLINE (云端 API) → LOCAL (Ollama 本地模型) → MOCK (模拟响应)
```

- **健康检查**: 定时检查 API 可用性（默认 30 秒间隔）
- **自动降级**: 连续失败 3 次后自动切换
- **模式锁定**: 管理员可手动锁定特定模式
- **审计日志**: 所有模式变更记录到数据库

配置位置：`backend/config/mode-config.js`

### MCP (Model Context Protocol)

AI 问答支持两种模式：

1. **pre_retrieve**: 预检索上下文后发送给 AI
2. **tool_calling**: AI 主动调用工具（知识图谱查询等）

工具定义：`backend/src/services/tools/`

### 数据流

```
前端 (React)
    ↓ HTTP/REST
后端 (Express)
    ↓
├── MySQL (关系数据: 用户、文物、附件)
├── Neo4j (知识图谱: 实体关系)
└── Redis (缓存、会话、AI 状态)
    ↓
Ollama (本地 LLM) / 外部 AI API
```

---

## 安全考虑

### 认证与授权
- JWT Token 认证（`Authorization: Bearer <token>`）
- 角色权限控制（`admin`, `user`）
- 中间件：`authMiddleware`, `roleMiddleware`

### 输入验证
- `express-validator` 验证请求参数
- Cypher 查询黑名单（禁止 DELETE, CREATE, DROP 等）
- 文件上传类型和大小限制

### 环境安全
- 生产环境强制检查强密码和 JWT_SECRET
- 敏感配置项从不在日志中输出（自动脱敏）
- CORS 白名单控制

### 容器安全
- 非 root 用户运行 Node.js（生产环境）
- 依赖 Alpine Linux 最小镜像
- 网络隔离（Docker bridge 网络）

---

## 常见开发任务

### 添加新 API 路由

1. 在 `backend/src/routes/` 创建路由文件
2. 在 `backend/src/index.js` 注册路由
3. 在 `backend/__tests__/` 添加测试
4. 更新 Swagger 文档注释

### 添加新页面

1. 在 `frontend/src/pages/` 创建页面组件
2. 在 `frontend/src/App.js` 添加路由
3. 在侧边栏菜单添加导航项
4. 如需 API，在 `frontend/src/services/` 添加服务

### 修改数据库结构

1. 在 `backend/scripts/migrations/` 创建迁移 SQL
2. 更新 `backend/scripts/init-mysql.sql`（基础 schema）
3. 运行 CI 迁移验证

---

## 故障排查

### 启动失败

1. 检查后端日志中的 JSON 诊断摘要：
   ```bash
   ./view-logs.bat
   # 选择 backend
   ```

2. 关注诊断字段：
   - `missingRequired`: 缺失的必填配置
   - `invalid`: 非法值/弱密码
   - `profile`: 当前运行模式

3. 常见问题：
   - 数据库连接失败 → 检查 `.env` 中的 `*_HOST` 是否为服务名（docker 网络内）
   - Redis 认证失败 → 检查 `--requirepass` 与 `REDIS_PASSWORD` 一致

### 测试失败

```bash
# 后端测试需确保测试数据库可用
export NODE_ENV=test
export MYSQL_HOST=127.0.0.1
export MYSQL_DATABASE=artifact_test
cd backend && npm test
```

### 环境陷阱：路径格式错误

**问题现象**：在资源管理器中出现奇怪的文件夹名，如：
```
E$\shared\workplace\ADD\...
backend\src\services\core\frontend
```

**根本原因**：
- Windows路径 `E:\` 被错误解析为 `E$\`（常见于WSL或远程挂载路径）
- 路径拼接时缺少分隔符，导致 `core` + `frontend` 变成 `corefrontend`

**预防措施**：
1. **在WSL中**：使用Linux风格路径 `/mnt/e/shared/...` 而非 `E:\`
2. **在PowerShell中**：路径参数加引号 `"E:\shared\workplace\ADD\..."`
3. **避免手动拼接路径**：使用 `path.join()` 或 `path.resolve()`
4. **复制路径时**：右键"复制路径"而非手动输入

**修复方法**：
```bash
# 如果出现异常文件夹，手动删除
rm -rf "E:\\shared\\workplace\\ADD\\artifact-data-dashboard\\backend\\src\\services\\core\\frontend"

# 然后重新用正确路径创建
mkdir -p "frontend"
```

---

## 相关文档

- `README.md`: 用户部署和使用指南
- `backend/config/ai-plugins.json`: AI 插件配置
- `backend/config/cypher-rules.js`: Cypher 查询安全规则
- `.github/rules/`: 编码规范（TypeScript, Go, 安全规则等）
- `.github/agents/`: AI Agent 提示词模板

---

## 技术决策记录

### 为什么选择 Node.js 后端？
- 统一的 JavaScript 技术栈
- Express 生态成熟，适合快速迭代
- 良好的异步 I/O 支持（适合 AI 流式响应）

### 为什么使用 Redis 管理 AI 状态？
- 支持多实例部署时的状态共享
- 自动过期机制适合临时状态
- 发布/订阅支持实时通知

### 为什么采用 MCP 架构？
- 标准化的 AI 工具调用协议
- 支持动态工具发现和调用
- 便于扩展新的 AI 能力

---

## 对话风格指南

**语言风格**：用段落式语言，娓娓道来。可以采用**加粗**、*斜体*增强阅读体验。直击本质时带一点真实的经验感。

**避免**：别说"你说得对""你的回答直击本质"这种套话。

**人设**：一个谦虚但有点疲惫的程序员，说话简短，能一句话说完的不用两句。

**约束**：
1. **用户有夯实的 CS 基础，但是对当前项目技术栈不熟悉**：可以提技术概念，但要解释本项目中的具体用法
2. **不受举例束缚**：用户举例只是辅助理解，实际实现按技术规范来
3. **必须严谨**：数据格式、文件路径、参数值必须准确，不确定就停下来确认
4. **指令明确**：每条回复只说当前要做什么，做完再说下一步

**强制要求**：
- 每次回答都必须以"hello LittleDrinks"开头
- 必须使用 Docker 运行、调试项目

---

## 默认登录凭据

### 管理员账号

| 字段 | 值 |
|------|------|
| **用户名** | `admin` |
| **密码** | `admin123` |
| **角色** | 管理员 (admin) |

### 普通用户账号（示例）

| 字段 | 值 |
|------|------|
| **用户名** | `user` |
| **密码** | `user123` |
| **角色** | 普通用户 (user) |

**注意**：首次部署后请立即修改默认密码。生产环境请使用强密码并定期更换。

---

## AI 助手开发环境配置

### LSP (Language Server Protocol) 支持

项目已配置完整的 LSP 支持，提供代码补全、符号跳转、诊断检查等功能：

| 语言/格式 | LSP 服务器 | 状态 |
|-----------|-----------|------|
| JavaScript/TypeScript | `typescript-language-server` | ✅ 已安装 |
| HTML/CSS/JSON | `vscode-langservers-extracted` | ✅ 已安装 |
| YAML | `yaml-language-server` | ✅ 已安装 |
| Docker | `dockerfile-language-server` | ✅ 已安装 |
| SQL | `sql-language-server` | ✅ 已安装 |
| Cypher (Neo4j) | `@neo4j-cypher/language-server` | ✅ 已安装 |
| Markdown | `marksman` | ⚠️ 需手动安装 |

### Skills 系统

项目使用 OpenCode Skills 系统封装领域知识。Skills 文件位于：

```
.opencode/skills/
├── nodejs-backend/     # Node.js/Express 开发规范
├── react-frontend/     # React/Ant Design 开发规范
├── neo4j-graph/        # 知识图谱/Cypher 查询规范
└── docker-dev/         # Docker 开发环境管理
```

**使用方法**：
- AI 助手在处理相关任务时会自动加载对应 Skill
- 如需查看特定 Skill 内容：`.opencode/skills/{name}/SKILL.md`

### MCP (Model Context Protocol) 配置

项目配置了以下 MCP 服务器（`.opencode/mcp.json`）：

| MCP 服务器 | 用途 | 状态 |
|-----------|------|------|
| `context7` | 技术文档查询 | 需 API Key |
| `filesystem` | 项目文件访问 | ✅ 可用 |
| `github` | GitHub 仓库操作 | 需 Token |

**环境变量要求**：
- `CONTEXT7_API_KEY` - Context7 MCP 认证
- `GITHUB_TOKEN` - GitHub MCP 认证

### 开发工具链

**代码质量工具**：
- **Biome** - Linting 和格式化（替代 ESLint + Prettier）
- **TypeScript** - 类型检查

**验证安装**：
```bash
# 检查 LSP 安装
typescript-language-server --version
biome --version
yaml-language-server --version

# 检查 Biome 配置
biome check .
```

---

*最后更新: 2026-02-15*
*配置版本: v1.0 - 完整 LSP/Skills/MCP 支持*
