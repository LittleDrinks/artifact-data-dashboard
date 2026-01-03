# Specification — artifact-data-dashboard

<!--
Sync Impact Report
- Version change: none -> 1.0.0
- Added sections: Goals, Scope, Architecture, APIs, Data Models, NFRs, Acceptance, Risks
- Templates requiring updates: ⚠ pending (.specify/templates/spec-template.md)
-->

- **Spec Version**: 1.0.0
- **Last Updated**: 2025-12-31
- **Sources**: doc/document.md, backend/src/routes/*.js, frontend/src/pages/*, docker-compose.yml

## Goals
- 知识图谱：构建文物领域实体/关系图（Neo4j），提供可视化与查询。
- 问答：基于图谱与外部 LLM 服务的 QA/聊天体验，支持历史存储（Redis）。

## Clarifications
### Session 2026-01-02
- Q: Should the "Predictive Model" be included in v1 scope? → A: Remove from v1 scope to focus on core features.
- Q: Who can perform CUD (Create, Update, Delete) operations on artifacts? → A: Admin only; ordinary users have read-only access.
- Q: How should the Knowledge Graph handle large datasets? → A: Limit initial load to Top 100 nodes to ensure performance; support on-demand expansion.
- Q: Should full chat history be persisted in MySQL? → A: No, only metadata in MySQL; full content in Redis (7-day TTL).
- Q: What is the language support scope for v1? → A: Chinese only.

## Scope
- **In Scope**: 数据采集与 ETL（爬虫/清洗）、MySQL 表存储、Neo4j 图模型、Redis 聊天记录；后端 API（auth/artifacts/graph/chat/wordcloud）；前端查询、可视化（Dashboard、KnowledgeGraph、Wordcloud、Chat）；容器化部署（Docker/Docker Compose）。
- **Out of Scope**: 生产级模型训练管线运维、第三方收费 LLM 凭证管理策略细节、超大规模多租户隔离。

## Architecture Overview
- 前端：React 18 + AntD，路由与页面在 frontend/src/pages（Dashboard, KnowledgeGraph, Chat, Wordcloud, Debug 等）。
- 后端：Express 4，JWT 保护除 /api/auth 与 /health 外的路由；集中 mysqlPool、neo4jDriver、redisClient；swagger 挂载 /api-docs（容器暴露 13000->3000）。
- 数据层：MySQL（表/日志）、Neo4j（节点/关系）、Redis（聊天历史，7 天 TTL）。
- 数据采集：build_kg/crawler/main.py 脚本从深圳博物馆 API (https://www.shenzhenmuseum.com/api/v1/wwk/collection) 爬取文物数据，包括列表获取和详细信息提取，存储为 JSON 文件用于后续 ETL 处理。
- 部署：docker-compose（前后端 + MySQL + Neo4j + Redis），后端 start.sh 包含初始化脚本（init-mysql.sql, init-neo4j.js）。

## Key APIs (baseline)
- Auth: POST /api/auth/login, POST /api/auth/register (公开)；JWT 颁发与刷新。
- Artifacts: CRUD (仅管理员) 与列表搜索 (所有认证用户)（/api/artifacts/...），附件上传/下载由 attachment.routes.js 提供；受 JWT 保护。
- Graph: GET /api/graph (知识图谱数据 nodes/edges，默认限制 Top 100)，POST /api/graph/query (若存在，基于图查询/过滤)；受 JWT。
- Chat/QA: POST /api/chat (对话问答，经 handleGraphQueries + mcp.service LLM 调用)，GET /api/chat/history；受 JWT。
- Wordcloud: POST /api/wordcloud/analyze 返回 {wordcloudData, meta}；受 JWT。
- Stats/Debug: /api/stats/test-db-connection, /api/stats/test-recent-activities, /api/health, /api/debug/*；用于诊断。

## Data Models (summary)
- **MySQL (init-mysql.sql)**: 
  - users（id, username, email, password_hash, role, organization, title, bio, created_at, updated_at）
  - artifacts（id, name, description, category, era, location, image_url, tags, is_cataloged, is_digitized, needs_repair, created_at, updated_at）
  - logs（id, user_id, action, target_id, timestamp, details）
- **Neo4j (init-neo4j.js)**: 
  - 节点类型：Artifact {id, name, description, tags, isCataloged, isDigitized, needsRepair}, Category {name, description}, Era {name, startYear, endYear}, Location {name, region, longitude, latitude}, Material {name, description}, Dimension {label, value, unit}, DamageType {name, severity, description}, RestorationMethod {name, description}, ReinforcementMethod {name, description}, InspectionTechnique {name, description}, ProtectiveMaterial {name, description}, InspectionMetric {name, unit, idealRange}
  - 关系类型：HAS_CATEGORY, BELONGS_TO_ERA, STORED_AT, MADE_OF, HAS_DIMENSION, HAS_DAMAGE, USES_RESTORATION, USES_REINFORCEMENT, INSPECTED_BY, MEASURED_BY, PROTECTED_WITH
- **Redis**: chat:<conversationId> -> messages[], TTL=7d；用于会话历史。MySQL `logs` 表仅记录会话元数据（ID、时间），不存储完整聊天内容。

## Interfaces & Contracts
- 所有非 /api/auth 与 /health 路由需 Authorization: Bearer <JWT>。
- axios 拦截器集中在 frontend/src/services/auth.service.js；前端其他 service 直接使用 axios。
- Payload 示例：
	- POST /api/chat {conversationId?, message}
	- POST /api/wordcloud/analyze {text}
	- GET /api/graph -> {nodes: [{id,label,type,...}], edges: [{id,source,target,relation,...}]}
- Excel 导入格式：
  - 结构需与 `backend/src/routes/debug.routes.js` 导出结构一致。
  - 工作表命名：`Artifacts`, `Categories`, `Eras`, `Materials`, `Locations` 等节点表；`REL_HAS_CATEGORY`, `REL_BELONGS_TO_ERA` 等关系表（长度≤31字符）。
  - 字段列名：固定顺序。`Artifacts` 需包含 `artifact_id`, `name`, `description`, `tags`, `isCataloged`, `isDigitized`, `needsRepair`；关系表使用 `artifact_id` 与关联实体字段。
  - 值约定：布尔值 `TRUE`/`FALSE`；多值用 `;` 分隔；空值留空。
  - 工具支持：`build_kg/convert_artifact_to_excel.py` 用于 JSON 转 Excel。

## Non-Functional Requirements
- 可部署性：必须支持 docker-compose up 一键启动（前端/后端/DB/Neo4j/Redis）。
- 可追溯性：数据来源、导入脚本与版本需记录（遵循宪章）。
- 安全性：凭证通过 .env 注入，仓库不存放密钥；JWT 保护业务路由。
- 可观察性：至少保留健康检查与 DB/图/日志诊断接口；错误经 error.middleware.js 规范化处理。
- 性能：API 响应时间 < 2秒（95% 分位），支持并发用户数 > 50；前端页面加载时间 < 3秒。

## Acceptance Criteria (end-to-end)
1) Auth：使用种子账号 admin/admin123 登录成功并获取 JWT。
2) Artifacts：创建/查询文物记录成功，日志记录生成。
3) Graph：GET /api/graph 返回节点/边；前端 KnowledgeGraph 页面可视化展示。
4) Chat：POST /api/chat 返回回答并写入 Redis 历史；前端 Chat 页面显示对话。
5) Wordcloud：POST /api/wordcloud/analyze 返回词云数据；前端 Wordcloud 页面渲染成功。
6) 端到端示例：用户登录 -> 查询文物 -> 查看图谱关系 -> 发起问答 -> 结果可视化（图谱/词云）无错误。

## Testing Strategy
- 单元测试：覆盖后端服务函数（services/*.js）和前端组件（src/pages/*.js），目标代码覆盖率 > 80%。
- 集成测试：测试 API 端点（使用 Jest/Supertest），包括 auth、artifacts、graph、chat、wordcloud 路由；前端与后端集成测试。
- 端到端测试：使用 Cypress 或 Selenium 模拟用户流程（登录 -> 数据操作 -> 可视化），验证 Acceptance Criteria。
- 自动化：集成到 CI/CD 管道（GitHub Actions），每次推送运行测试。

## Constraints & Dependencies
- 语言支持：仅限中文（界面与数据处理）。
- 环境变量：backend/.env 基于 .env.example（MySQL/Neo4j/Redis/JWT/LLM 端点）。
- 端口：后端 3000 (compose 暴露 13000)，前端 3001 (compose 暴露 13001 默认)。
- 外部服务：LLM/飞桨 API（经 mcp.service.js）；需要可用的 API key 才能返回真实答案，否则使用模拟响应。

## Risks / Open Items
- LLM 依赖可用性与成本；需降级策略（已提供模拟）。
- 数据质量依赖爬虫/ETL（需持续校验与标准化）。
- 前端对后端响应格式依赖强，接口变更需同步版本与测试。