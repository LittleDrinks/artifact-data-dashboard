# 系统架构 - 规格说明

## 架构目标

- **高内聚低耦合**：各服务职责单一，通过标准接口通信
- **可水平扩展**：无状态设计，支持多实例部署
- **故障隔离**：单点故障不影响整体服务
- **开发友好**：一键启动，本地可完整复现生产环境

---

## 分层架构

### 1. 客户端层

**技术栈**：
- React 18 + Ant Design 5
- D3.js 7.x（知识图谱可视化）
- ECharts 5.x（统计图表）

**设计约束**：
- 前端**禁止直接连接** Neo4j，所有数据走后端 API
- AI 问答使用 **SSE (Server-Sent Events)** 实现流式响应
- 状态管理使用 React Context（项目规模下足够，避免 Redux 样板代码）

### 2. 网关层（Nginx）

**职责**：
- 静态资源服务（前端 build 产物）
- API 反向代理 → backend:3000
- SSL/TLS 终端（生产环境）

### 3. 应用层（Node.js + Express）

**目录规范**：
```
backend/src/
├── routes/        # API 端点定义
├── middleware/    # 认证、日志、验证
├── services/      # 业务逻辑
├── models/        # 数据库操作
└── utils/         # 工具函数
```

**请求处理流程**：
```
HTTP Request
    ↓
auth.middleware.js (JWT 验证)
    ↓
validation.middleware.js (参数校验)
    ↓
xxx.routes.js (路由分发)
    ↓
xxx.service.js (业务逻辑)
    ↓
models/ (数据库操作)
    ↓
MySQL / Neo4j / Redis
```

**约束**：
- 所有 API 响应统一格式：`{ code, message, data }`
- 错误统一由 error.middleware.js 处理
- 数据库连接通过 `backend/src/config/database.js` 单一入口

### 4. 数据层

#### MySQL 8 —— 关系型数据

**存储内容**：
- 用户账号、权限
- 文物/文献基础元数据
- 文件夹、标签结构
- 附件元数据

**选型理由**：
- 事务性强（用户注册、权限变更）
- 团队熟悉，运维简单
- 复杂条件查询 SQL 写起来快

#### Neo4j 4.4 —— 知识图谱

**存储内容**：
- 实体：Artifact、Person、Location、Event、Dynasty
- 关系：CREATED_BY、COLLECTED_BY、STORED_AT、BELONGS_TO 等

**选型理由**：
- 成熟的管理界面（Neo4j Browser）
- Cypher 查询直观易学
- 社区版功能足够

#### Redis 7.2 —— 缓存与状态

**用途**：
- 会话缓存（TTL 24h）
- AI 运行状态（模式、健康检查结果）
- API 限流计数
- 未来：任务队列

---

## AI 层架构

### 三级模式设计

```
┌────────────────────────────────────────┐
│           AI 服务路由层                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ ONLINE  │ │  LOCAL  │ │   MOCK  │  │
│  │ 云端API │ │  Ollama │ │ 模拟响应 │  │
│  │ DeepSeek│ │本地8B模型│ │  (测试) │  │
│  └────┬────┘ └────┬────┘ └────┬────┘  │
│       └────────────┴───────────┘       │
│              ↑ 健康检查/自动降级        │
└────────────────────────────────────────┘
```

**模式说明**：
| 模式 | 用途 | 触发条件 |
|------|------|----------|
| ONLINE | 云端大模型，质量最高 | 网络畅通时 |
| LOCAL | Ollama 本地 8B 模型 | 内网环境或云端不可用时 |
| MOCK | 预设响应 | 开发和测试 |

**自动降级逻辑**：
- 每 30 秒健康检查
- 连续 3 次失败自动降级
- 上级恢复后自动升级

---

## 通信协议

### 同步通信

| 通信双方 | 协议 | 说明 |
|----------|------|------|
| 前端 ↔ 后端 | HTTP REST + SSE | SSE 用于 AI 流式响应 |
| 后端 ↔ Ollama | OpenAI 兼容 API | `/v1/chat/completions` |
| 后端 ↔ MCP Servers | HTTP/SSE | 工具调用协议 |

### 异步通信（规划）

- Excel 大文件导入 → Redis 队列 + Worker
- 知识图谱批量构建 → 消息队列

---

## 部署架构

### 开发环境

```yaml
services:
  frontend:    # React dev server (port 8080)
  backend:     # Node.js (port 3000)
  mysql:       # 开发数据 (port 13306)
  neo4j:       # 开发图谱 (port 17474)
  redis:       # 开发缓存 (port 16379)
  ollama:      # 本地模型 (port 11434)
```

### 生产环境

差异点：
- 前端用 **Nginx** 静态服务
- 后端暴露 **13000** 端口
- **无 Ollama**（云端 API）
- 数据卷持久化到宿主机

---

## 接口规范

### REST API 设计

- **基础路径**：`/api/{resource}`
- **HTTP 方法**：GET（查询）、POST（创建）、PUT（更新）、DELETE（删除）
- **状态码**：200 成功，400 参数错误，401 未认证，403 无权限，500 服务器错误

### SSE 事件规范

```
event: message
data: {"type": "thinking", "content": "..."}

event: message
data: {"type": "content", "content": "..."}

event: done
data: {}
```

---

## 技术决策

### 为什么选 Node.js 而非 Java/Go？

- 团队熟悉 JavaScript，开发效率高
- AI 生态（OpenAI SDK）对 Node.js 支持最好
- 项目规模小，Node.js 性能足够

### 为什么用 Neo4j 而非 RDF/图计算框架？

- 成熟的管理界面（Browser）
- Cypher 查询比 SPARQL 好学
- 社区版够用

### 为什么 AI 用本地 Ollama？

- 文物数据敏感，部分客户要求不出内网
- 8B 模型对简单问答够用
- 云端 API 作为降级兜底
