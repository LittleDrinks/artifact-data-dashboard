# Specification: Artifact Data Dashboard v1.0.0

**范围说明**：本规格用于定义 v1.0.0 的业务能力边界与验收标准，面向产品/研发/测试共用。避免包含实现细节（框架、代码结构、具体库）。

## 1. 背景与目标

系统目标：本项目旨在解决文物数据分散、关联性挖掘困难的问题。通过整合爬虫抓取与 Excel 导入的数据，构建以“文物”为核心的知识图谱，并利用 AI 技术提供自然语言交互能力，辅助研究人员与爱好者发现文物背后的历史关联。

核心价值:

- 数据整合: 统一管理多来源（爬虫、Excel）的文物数据。
- 关联洞察: 通过知识图谱直观展示文物、人物、地点、时间之间的关系。
- 智能交互: 通过对话式 AI 降低数据检索与分析的门槛。

## 2. 用户场景 (User Scenarios)

| 角色 | 场景描述 | 预期结果 |
| :--- | :--- | :--- |
| **研究员** | 上传一份包含文物信息的 Excel 表格，希望自动分析其中的实体关系。 | 系统解析 Excel，自动生成知识图谱，用户可在“图谱页面”查看节点与连线。 |
| **策展人** | 需要查找“清代”且包含“龙纹”的所有瓷器，并查看其分布统计。 | 搜索结果准确展示符合条件的文物；统计看板展示相关文物的词云与分类占比。 |
| **普通用户** | 在聊天窗口提问：“乾隆时期有哪些著名的珐琅彩瓷器？” | AI 助手结合库内数据回答，并列出相关文物的跳转链接。 |
| **数据工程师** | 运行爬虫脚本抓取故宫博物院的新增文物数据。 | 爬虫自动下载图片与元数据，并清洗入库，更新系统数据源。 |

## 3. 功能规格 (Functional Requirements)

### 3.1 文物数据核心 (Artifact Core)
系统维护文物的全生命周期数据，是所有上层应用的基础。

- **数据模型**:
  - 核心字段：名称、年代、类别、尺寸、描述、来源（Source）。
  - 多媒体：支持关联多张高清图片与附件文档。
- **检索能力**:
  - 支持全文检索（基于名称、描述）。
  - 支持多维度筛选（年代、材质、馆藏地）。
- **数据展示**:
  - 列表页支持网格/列表视图切换。
  - 详情页展示完整元数据、图片轮播及关联的知识图谱节点。

### 3.2 知识图谱引擎 (Knowledge Graph Engine)
将结构化数据转化为关系网络，支持基于 Excel 的批量构建。

- **Excel 导入与解析**:
  - 系统需识别特定 Schema 的 Excel 文件。
  - **实体提取**: 自动从行数据中提取 Artifact（文物）、Person（人物）、Location（地点）、Time（时期）等节点。
  - **关系构建**: 自动建立 `CREATED_BY` (制作于), `LOCATED_AT` (出土/收藏于), `BELONGS_TO` (属于某时期) 等边关系。
- **图数据库同步**:
  - 解析结果需原子性地同步至 Neo4j 数据库。
- **可视化交互**:
  - 提供力导向图（Force-directed Graph）前端组件。
  - 支持点击节点展开/折叠邻居节点。
  - 支持在图谱中直接跳转至文物详情页。

### 3.3 AI 智能助手 (AI Assistant)
基于 RAG (检索增强生成) 技术，提供上下文感知的问答服务。

- **对话接口**:
  - 提供类似 ChatGPT 的流式对话界面。
  - 支持多轮对话上下文记忆。
- **数据增强 (RAG)**:
  - 用户提问时，系统需先检索本地文物数据库与知识图谱。
  - 将检索到的相关事实（Facts）作为 Context 注入 Prompt，确保回答基于库内真实数据。
- **插件扩展 (MCP)**:
  - 支持通过 Model Context Protocol (MCP) 集成外部工具（如高级统计工具、外部百科搜索）。

### 3.4 数据采集与处理 (Data Ingestion)
- **爬虫系统**:
  - 提供针对特定博物馆（如故宫、深圳博物馆）的 Python 爬虫脚本。
  - 策略：自动遍历分页、下载详情页 HTML、解析 JSON/DOM、下载图片至本地存储。
- **数据清洗**:
  - 提供脚本将爬取的原始 JSON 转换为系统标准的导入格式。
  - 图片去重与缩略图生成。
- **文件格式**：`.xlsx`
- **结构**：输出/输入为一个 xlsx，包含固定 sheet 与固定列顺序：
  - 节点（Nodes）sheet：
    - Artifacts: `artifact_id, name, description, tags, isCataloged, isDigitized, needsRepair`
    - Categories: `name, description`
    - Eras: `name, startYear, endYear`
    - Locations: `name, region, longitude, latitude`
    - Materials: `name, description`
    - Dimensions: `label, value, unit`
    - DamageTypes: `name, severity, description`
    - RestorationMethods: `name, description`
    - ReinforcementMethods: `name, description`
    - InspectionTechniques: `name, description`
    - ProtectiveMaterials: `name, description`
    - InspectionMetrics: `name, unit, idealRange`
  - 关系（Relations）sheet：
    - REL_HAS_CATEGORY: `artifact_id, category_name`
    - REL_BELONGS_TO_ERA: `artifact_id, era_name`
    - REL_STORED_AT: `artifact_id, location_name`
    - REL_MADE_OF: `artifact_id, material_name`
    - REL_HAS_DIMENSION: `artifact_id, dimension_label`
    - REL_HAS_DAMAGE: `artifact_id, damage_name`
    - REL_USES_RESTORATION: `artifact_id, restoration_name`
    - REL_USES_REINFORCEMENT: `artifact_id, reinforcement_name`
    - REL_INSPECTED_BY: `artifact_id, technique_name`
    - REL_PROTECTED_WITH: `artifact_id, protective_material_name`
    - REL_MEASURED_BY: `artifact_id, metric_name`

### 3.5 AI 扩展能力插件化（Plugin-based AI Extensions）

在不影响核心业务逻辑（文物检索/图谱/聊天主路径）的前提下，支持未来扩展 AI 能力：
- Provider 插件：支持多模型服务提供方
- Capability 插件：支持多模态与功能插件


## 4. 数据与日志

### 4.1 MySQL
- `users` / `artifacts` / `logs` / `attachments`（详见 data-model.md）

### 4.2 资源存储
- 附件文件以服务端存储名落盘（或等价存储），元数据写 MySQL。

### 4.3 日志（logs）约定
- 附件相关：
  - `upload_attachment`
  - `delete_attachment`
- AI 插件相关（建议约定，便于审计）：
  - `ai_provider_call`
  - `ai_plugin_call`
  - `ai_plugin_error`

## 5. 兼容性与非功能性要求
- 中文为主的用户体验
- Docker Compose 可一键启动
- 权限错误必须明确（403）
- 失败要可观测（日志）
