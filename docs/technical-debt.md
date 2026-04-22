# 技术债务记录

> 记录项目中遗留的技术债务、伪实现、数据质量问题，供后续迭代参考。
>
> **最后更新**: 2026-04-22

---

## 1. 知识图谱层 — Neo4j 未真正发挥作用

### 1.1 问题描述

Neo4j 图数据库已部署并导入数据，但系统核心功能并未真正利用其图查询能力：

| 功能 | 实际实现 | 问题 |
|------|----------|------|
| 知识图谱页面 `/graph` | 从 SQLite 构建，Neo4j 仅作为可选数据源 | Neo4j 有数据时优先用 Neo4j，但数据来源是规则导入，不是 LLM 语义抽取 |
| AI 问答知识检索 | LightRAG 查询自己的 KV Store，不查 Neo4j | Neo4j 和 LightRAG 是两套独立系统，数据不互通 |
| 知识抽取页面 `/knowledge` | LightRAG 提取后存入 Neo4j，但查询走 LightRAG KV Store | 提取和查询链路断裂 |

### 1.2 根本原因

1. **架构割裂**：Neo4j 存储规则三元组（artifact → era/category/location），LightRAG 存储语义抽取结果，两者没有融合
2. **LightRAG 不依赖 Neo4j**：LightRAG 默认用本地 JSON 文件做 KV Store，Neo4j 只是额外存储，查询时不走 Neo4j
3. **时间压力**：结题前无法重构 AI 问答链路

### 1.3 影响范围

- Neo4j 形同虚设，仅作为数据展示层
- AI 问答无法利用结构化图谱关系
- 知识抽取页面是"假"的 — 抽取结果无法被 AI 问答真正使用

### 1.4 修复建议

1. **短期**：在 `graph.py` 中增加 Neo4j 图查询工具，让 AI 问答可以调用
2. **中期**：统一数据层 — LightRAG 使用 Neo4j 作为存储后端（需要自定义 Storage 类）
3. **长期**：重构为 GraphRAG 架构，Neo4j 作为核心知识库

---

## 2. 知识抽取页面 — Demo 级实现

### 2.1 问题描述

`/knowledge` 页面存在以下问题：

| 问题 | 详情 |
|------|------|
| 抽取结果不可用 | LightRAG 提取的实体/关系存入 Neo4j，但 AI 问答不走 Neo4j |
| 无增量验证 | 用户抽取后无法验证数据是否真的被系统使用 |
| CSV 导入/导出 | 与 LightRAG 数据不互通，导入的数据 AI 问答查不到 |

### 2.2 代码位置

- 前端：`frontend/src/pages/Knowledge.tsx`
- 后端：`backend/app/routers/graph.py` — `/extract`, `/knowledge-query`

### 2.3 修复建议

1. 抽取后立即调用 `knowledge-query` 验证
2. 统一数据存储层
3. 或者直接砍掉这个页面，专注 AI 问答 + 图谱可视化

---

## 3. 数据质量问题

### 3.1 已清洗的问题（记录在案）

| 问题 | 状态 | 清洗脚本 |
|------|------|----------|
| category 字段被 Wikipedia 多分类污染 | ✅ 已清洗 | Ollama LLM 批量判断 |
| image_url 存储 Wikipedia 页面链接 | ✅ 已清洗 | 检测并置空 |
| 非文物条目（人物、事件等） | ✅ 已过滤 | 黑名单过滤 |

### 3.2 遗留问题

| 问题 | 影响 | 建议 |
|------|------|------|
| 部分文物缺少 description | AI 问答信息不足 | 补充数据或标注"暂无描述" |
| tags 字段格式不统一 | 图谱节点重复 | 统一分隔符 |
| image_url 约 30% 为空 | 详情页无图 | 使用占位图或补充数据 |

### 3.3 数据资产位置

```
data/
├── final/                    # 清洗后的最终数据
│   ├── artifacts_clean.json  # 771 条有效文物
│   └── benchmark_*.json      # 评测数据集
├── graph_data.json           # 图谱数据（Neo4j 导出）
├── non_artifact_blacklist.json # 非文物黑名单
└── official_195_list.json    # 195 件禁止出境展览文物
```

---

## 4. E2E 测试基础设施问题

### 4.1 问题描述

详见 `docs/review-round-1.md`：

| 问题 | 影响 |
|------|------|
| 后端登录限流 60s/5 次 | E2E 测试全部被限流 |
| E2E login helper 无重试机制 | 测试失败无法恢复 |
| 登录页按钮文本有空格 | Playwright 选择器失配 |
| 注册 Tab 选择器歧义 | 元素定位错误 |

### 4.2 修复状态

- [ ] 后端限流配置（测试环境禁用）
- [ ] E2E login helper 重构
- [ ] 登录页选择器修复

---

## 5. 代码债务

### 5.1 后端

| 位置 | 问题 | 建议 |
|------|------|------|
| `services/graph.py` | 900+ 行，职责过多 | 拆分为 neo4j_client, lightrag_client, sqlite_graph |
| `routers/graph.py` | extract/knowledge-query 逻辑混杂 | 拆分为 knowledge_router |
| `ai/lightrag_service.py` | 单例模式 + 线程池混用 | 统一异步模型 |

### 5.2 前端

| 位置 | 问题 | 建议 |
|------|------|------|
| `pages/Knowledge.tsx` | 700+ 行，逻辑复杂 | 拆分为 ExtractionCard, QueryCard, ImportCard |
| `pages/Chat.tsx` | SSE 处理逻辑内联 | 抽取为 useChatStream hook |
| API 层无错误边界 | 接口失败直接报错 | 增加全局错误处理 |

---

## 6. 配置债务

### 6.1 环境变量

| 变量 | 问题 | 建议 |
|------|------|------|
| `LIGHTRAG_API_KEY` | 无默认值，服务不可用时静默失败 | 增加健康检查端点 |
| `NEO4J_URI/USER/PASSWORD` | 无连接池配置 | 增加连接池参数 |
| `RATE_LIMIT_ENABLED` | 不存在，限流硬编码 | 增加开关 |

### 6.2 Docker 配置

| 文件 | 问题 |
|------|------|
| `docker-compose.yml` | 3 容器配置，但本地开发不用 Docker |
| `backend/Dockerfile` | 未优化镜像大小 |

---

## 7. 文档债务

| 文档 | 状态 | 问题 |
|------|------|------|
| `docs/背景调研.md` | 待完善 | 多处 TODO 未填充 |
| `docs/PRD.md` | 完成 | 无 |
| `docs/pitfalls.md` | 持续更新 | 无 |
| API 文档 | 缺失 | 依赖 FastAPI 自动生成，无独立文档 |

---

## 8. 优先级建议

| 优先级 | 任务 | 工作量 |
|--------|------|--------|
| P0 | 修复 E2E 测试基础设施 | 1-2 天 |
| P1 | Neo4j 与 LightRAG 数据打通 | 3-5 天 |
| P1 | 砍掉或修复知识抽取页面 | 1 天 |
| P2 | 代码重构（graph.py 拆分） | 2-3 天 |
| P2 | 补充数据描述和图片 | 2-3 天 |
| P3 | Docker 部署优化 | 1-2 天 |

---

*最后更新: 2026-04-22*
