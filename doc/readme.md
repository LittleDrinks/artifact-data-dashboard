<!-- filepath: e:\shared\workplace\artifact-data-dashboard\doc\readme.md -->
# 文物大数据与人工智能集成系统

<!-- 标记说明：
  [TODO]：待实现或待补充部分；
  [UNIMPLEMENTED]：目前已在文档中声明但后端/前端尚未实现的功能。
-->

## 1. 项目简介

本系统旨在为文物数据的管理、分析与智能化应用提供一站式解决方案。系统支持账户登录、关键词搜索、数据可视化大屏、词云分析、知识图谱（基于 Neo4j）、智能问答（Neo4j + MCP 大模型）等功能，适用于文博机构、研究人员及相关从业者。

---

## 2. 技术架构

- 前端：React + Ant Design + ECharts/D3.js
- 后端：Node.js (Express) + Neo4j 驱动  或  Python (FastAPI)
- 数据库：MySQL/PostgreSQL（结构化数据），Neo4j（知识图谱）
- AI 服务：MCP 大模型 API（智能问答）
- 其他：Redis（缓存）、Nginx（反向代理）、Docker（部署）

---

## 3. 功能模块与实现细节

### 3.1 账户登录

- 支持用户名/邮箱 + 密码登录，基于 JWT 鉴权。密码使用 bcrypt 加密存储。
- 后端接口：
  - POST `/api/auth/register`：用户注册
  - POST `/api/auth/login`：用户登录，返回 JWT
  - GET `/api/auth/profile`：获取当前用户信息（需鉴权）
- 前端：登录与注册表单，拦截未授权访问。

### 3.2 关键词搜索

- 支持对文物名称、描述、类别等字段的模糊搜索。
- 后端实现：MySQL 全文索引或 Elasticsearch 集成。
- 前端：搜索框 + 结果列表，支持分页与高亮展示。

### 3.3 数据可视化大屏

- 使用 ECharts/D3.js 构建可视化大屏，展示文物总量、分类分布、地域分布、年代分布等统计信息。
- 后端聚合接口：GET `/api/stats/overview` 返回汇总数据。
- 前端定时轮询或 WebSocket 实时更新。

### 3.4 词云分析

- 后端对文物描述、标签字段进行分词与词频统计（可选 jieba）。
- 前端使用 ECharts WordCloud 或 wordcloud.js 渲染词云。
- 支持按类别、时间等维度筛选视图。

### 3.5 知识图谱（Neo4j）

- 节点类型：Artifact、Author、Era、Material、Location、Category 等。
- 关系类型示例：
  - (Artifact)-[:CREATED_BY]->(Author)
  - (Artifact)-[:BELONGS_TO]->(Category)
  - (Artifact)-[:MADE_OF]->(Material)
  - (Artifact)-[:DISCOVERED_IN]->(Location)
  - (Artifact)-[:DATED_AS]->(Era)
- 后端：使用 Neo4j Driver 提供查询和可视化数据接口，如 GET `/api/graph/artifacts`。
- 前端：基于 D3.js/cytoscape.js 展示，支持节点点击与关系拓展。

### 3.6 智能问答（Neo4j + MCP 大模型）

- 用户输入自然语言问题。
- 后端调用 MCP 大模型 API 进行意图识别：
  - 若意图为结构化查询，自动生成 Cypher 并检索 Neo4j。
  - 若为复杂问答，混合大模型答案与图谱数据。
- 前端：聊天对话界面，支持上下文维护。
- [TODO] 对话状态管理、错误处理、消息持久化等细节。

---

## 4. 数据库设计

### 4.1 结构化数据库（MySQL/PostgreSQL）

- `users`：id, username, email, password_hash, role, created_at
- `artifacts`：id, name, description, category, era, location, image_url, tags, created_at
- `logs`：id, user_id, action, target_id, timestamp

### 4.2 知识图谱（Neo4j）

- 节点：文物(Artifact)、地点(Location)、年代(Era)、作者(Author)、材质(Material) 等
- 关系：出土于(DISCOVERED_IN)、属于(BELONGS_TO)、制作人(CREATED_BY)、含材质(MADE_OF)，参与(…)

---

## 5. 部署与运维

- 使用 Docker Compose 管理前端、后端、MySQL/PostgreSQL、Neo4j、Redis、AI 服务等容器。
    - `docker pull` 请使用镜像站 `crpi-kl2yo8a1hefddu65.cn-hangzhou.personal.cr.aliyuncs.com/csj_images/xxx`，镜像站中可用的仓库的名称及版本都记录在了 `images.txt` 中，未标注版本默认为 latest
- Nginx 反向代理并支持 HTTPS。
- 日志与监控：Prometheus + Grafana。
- 定期备份：关系库与图谱数据分离备份。

---

## 6. 安全与权限

- JWT 鉴权 + 接口权限校验。
- 角色分级：管理员、普通用户。
- 防护：SQL 注入、XSS、CSRF。

---

## 7. 开发建议

- 前后端分离，RESTful API 设计。
- 代码模块化，注重可扩展性与可维护性。
- 单元测试与接口测试，使用 Jest/Mocha、Supertest。
- 接口文档使用 Swagger/OpenAPI 自动生成。

---

## 8. 参考资源

- Neo4j 官方文档：https://neo4j.com/docs/
- MCP 大模型 API 文档 [根据实际接入补充]
- ECharts 文档：https://echarts.apache.org/
- Ant Design：https://ant.design/
- Docker 官方文档：https://docs.docker.com/
- Demo 文件见 `doc/demo.html`

---

## 9. 建议目录结构

```
artifact-data-dashboard/
├─ backend/              # 后端服务代码（Node.js/Express 或 Python/FastAPI）
│   ├─ scripts/          # 数据脚本、图谱加载脚本
│   └─ src/              # 源代码
├─ frontend/             # 前端项目（React）
│   ├─ public/
│   └─ src/
├─ docker-compose.yml    # 多服务部署配置
└─ doc/                  # 项目文档
    ├─ readme.md
    └─ document.md
```

---

## 10. 联系与支持

如有问题或建议，请联系项目维护者或提交 Issue。