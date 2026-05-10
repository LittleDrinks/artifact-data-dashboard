# 知识图谱模块规格说明

> 最后更新：2026-04-17
> 当前实现状态：**三级 fallback 已实现，节点类型过滤已实现，P0 默认显示问题已修复，CSV 导入/导出和知识抽取已实现**

---

## 当前实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 三级 fallback 架构 | ✅ 已实现 | Neo4j primary → LightRAG KV Store → SQLite fallback |
| SQLite 图谱构建 | ✅ 已实现 | 从文物数据动态构建 artifact→era/category/location/tag 关系图 |
| 节点类型过滤 | ✅ 已实现 | `node_types` 参数，前端 Checkbox 筛选 |
| 默认显示关系 | ✅ 已修复 | 默认 node_types 包含所有类型，显示 artifact→era/category 关系 |
| 全图加载 | ✅ 已实现 | `/api/graph/full` |
| 关键词搜索 | ✅ 已实现 | `/api/graph/search` |
| 节点详情 | ✅ 已实现 | `/api/graph/node/:node_id` |
| CSV 导出 | ✅ 已实现 | `/api/graph/export` 导出三元组 |
| CSV 导入 | ✅ 已实现 | `/api/graph/import` 导入三元组到 Neo4j |
| 文本知识抽取 | ✅ 已实现 | `/api/graph/extract` LightRAG 增量提取 |
| D3.js 力导向图 | ✅ 已实现 | 拖拽、缩放、平移、节点点击 |
| 类型颜色编码 | ✅ 已实现 | artifact=紫色, era=橙色, category=绿色, location=蓝色, tag=灰色 |
| 标签去重 | ✅ 已实现 | 标签名匹配已有 era/category/location 时链接到现有节点 |

---

## 1. 需求概述

知识图谱模块提供文物实体关系的可视化探索和查询能力，是本系统的核心差异化功能。

### 1.1 业务需求

| 需求 | 描述 | 优先级 |
|------|------|--------|
| 图谱可视化 | D3.js 力导向图，支持拖拽、缩放、平移 | P0 |
| 全图加载 | 一键加载全部节点和关系 | P0 |
| 关键词搜索 | 输入关键词搜索节点，支持深度扩展 | P0 |
| 节点详情 | 点击节点弹出详情面板 | P0 |
| 类型过滤 | 按节点类型设置显示数量上限 | P1 |

---

## 2. 数据源架构

### 2.1 实际数据源策略

```
PRIMARY: Neo4j（语义图谱，优先使用）
FALLBACK 1: LightRAG KV Store（质量较差，通常跳过）
FALLBACK 2: SQLite 文物数据（动态构建 artifact→era/category/location/tag 关系图）
```

> **架构说明**：Neo4j 是主要数据源（优先级最高）。如果 Neo4j 不可用或无数据，fallback 到 SQLite 从文物表的 era/category/location/tags 字段构建关系图。LightRAG KV Store 作为中间 fallback，但质量较差通常被跳过。优先级定义在 `backend/app/services/graph.py` 文档字符串中。

### 2.2 SQLite 图谱构建

**函数位置**：`backend/app/services/graph.py:222-350`

```python
def build_graph_from_artifacts(artifacts):
    """从文物列表构建图谱节点和边。"""
    # 为每个文物创建 artifact 节点
    # 创建 era/category/location 节点（去重）
    # 创建 artifact→era/category/location 关系边
    # 处理 tags：同名标签链接到现有 era/category/location 节点
```

**去重策略**：预先收集所有 era/category/location 名称，处理 tags 时检查是否与已存在节点同名。如果同名，链接到现有节点而非创建重复的 tag 节点。

### 2.3 Neo4j 增强层

**函数位置**：`backend/app/services/graph.py:53-124`

如果 Neo4j 有数据，会合并到 SQLite 基础图中，增强语义实体覆盖。

### 2.4 默认节点类型

**位置**：`backend/app/services/graph.py:443-444`, `frontend/src/pages/Graph.tsx:114`

```python
default_types = ["artifact", "era", "category", "location", "tag"]
```

默认显示所有类型，确保 artifact→era/category/location 关系边可见。

---

## 3. 数据模型

### 3.1 Neo4j 节点类型（已预留）

| Label | 属性 | 说明 | MVP |
|-------|------|------|-----|
| Artifact | id, name, description, category, era | 文物节点 | ✅ |
| Category | name, description | 类别节点 | ✅ |
| Era | name, startYear, endYear | 年代节点 | ✅ |
| Location | name, region | 地点节点 | ✅ |
| Material | name, description | 材质节点 | ✅ |

### 3.2 SQLite Fallback 节点类型

| 类型 | ID 格式 | 来源 |
|------|---------|------|
| artifact | `artifact_{id}` | artifacts 表 |
| era | `era_{era值}` | artifacts.era 字段 |
| category | `cat_{category值}` | artifacts.category 字段 |
| location | `loc_{location值}` | artifacts.location 字段 |
| tag | `tag_{tag值}` | artifacts.tags 字段（逗号分隔） |

### 3.3 关系类型

| 关系 | 起点 | 终点 | 说明 |
|------|------|------|------|
| 属于朝代 | Artifact | Era | SQLite fallback |
| 属于类别 | Artifact | Category | SQLite fallback |
| 出土于 | Artifact | Location | SQLite fallback |
| 包含标签 | Artifact | Tag | SQLite fallback |
| 相关 | Entity | Entity | LightRAG KV Store |

---

## 4. API 接口

### 4.1 图谱数据 API

| 端点 | 方法 | 参数 | 说明 |
|------|------|------|------|
| `/api/graph/full` | GET | `limit`, `offset`, `node_types` | 加载全图数据 |
| `/api/graph/search` | GET | `keyword`, `node_types`, `depth` | 搜索图谱 |
| `/api/graph/node/:node_id` | GET | — | 获取节点详情 |
| `/api/graph/export` | GET | `limit` | 导出三元组 CSV |
| `/api/graph/import` | POST | `file`（CSV） | 导入三元组到 Neo4j |
| `/api/graph/extract` | POST | `{text}` | LightRAG 文本知识抽取 |

### 4.2 node_types 参数

默认值：`["artifact", "era", "category", "location", "tag"]`（全部类型）

> **修复历史**：原默认值 `["artifact"]` 导致图谱无边显示（边连接 artifact→era/category），已修复为默认显示全部类型。

可选值：`artifact`, `era`, `category`, `location`, `tag`

**位置**：
- 后端：`backend/app/routers/graph.py:22-25`
- 前端：`frontend/src/pages/Graph.tsx:114`

### 4.3 响应格式

```json
{
  "nodes": [
    {"id": "artifact_1", "name": "后母戊鼎", "type": "artifact", "properties": {...}},
    {"id": "era_商", "name": "商", "type": "era"}
  ],
  "links": [
    {"source": "artifact_1", "target": "era_商", "relation": "属于朝代"}
  ],
  "total_nodes": 100,
  "total_links": 150
}
```

---

## 5. 前端可视化

### 5.1 D3.js 力导向图配置

**位置**：`frontend/src/pages/Graph.tsx`

```typescript
const simulation = d3.forceSimulation(nodes)
  .force("link", d3.forceLink(edges).distance(linkDistance))  // 默认 120
  .force("charge", d3.forceManyBody().strength(chargeStrength))  // 默认 -400
  .force("center", d3.forceCenter(width/2, height/2))
  .force("collision", d3.forceCollide().radius((d) => d.r + collisionPadding))  // 默认 6
```

### 5.2 节点类型颜色映射

```typescript
const TYPE_COLORS: Record<string, string> = {
  artifact: '#533afd',  // 紫色（主色）
  era: '#c45100',       // 橙色
  category: '#3d8b37',  // 绿色
  location: '#2874ad',  // 蓝色
  tag: '#8c8c8c',       // 灰色
};
```

### 5.3 节点类型筛选控件

**位置**：`frontend/src/pages/Graph.tsx:114`

```typescript
// 默认显示全部类型以呈现关系
const allTypes = ['artifact', 'era', 'category', 'location', 'tag'] as const;
const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(allTypes));
}, [visibleTypes])
```

Checkbox 控件：
- 默认全部勾选（显示所有类型以呈现关系边）
- 可取消勾选 era/category/location/tag 进行过滤

### 5.4 交互功能

| 功能 | 实现方式 |
|------|---------|
| 节点拖拽 | `d3.drag()` + `simulation.alpha(0.3).restart()`（drag start），`alphaTarget(0)` + 清除 fx/fy（drag end） |
| 缩放平移 | `d3.zoom()` + SVG transform |
| 节点点击 | 弹出详情面板 |
| 节点高亮 | 搜索匹配节点 `stroke: '#533afd'` |
| 类型过滤 | Checkbox + `node_types` 参数 |

---

## 6. 节点类型过滤实现

### 6.1 后端过滤逻辑

**函数位置**：`backend/app/services/graph.py:315-335`

```python
def _filter_graph_by_types(nodes_dict, links_dict, node_types):
    """Filter graph nodes/links to only include requested node types."""
    allowed = set(node_types)
    filtered_nodes = {nid: n for nid, n in nodes_dict.items() if n.type in allowed}
    filtered_links = {
        lk: l for lk, l in links_dict.items()
        if l.source in filtered_nodes and l.target in filtered_nodes
    }
    return list(filtered_nodes.values()), list(filtered_links.values())
```

### 6.2 前端默认值

默认 `visibleTypes = allTypes`，显示全部类型以呈现关系边。

---

## 7. 已知问题

| ID | 问题 | 来源 | 优先级 | 说明 |
|-----|------|------|--------|------|
| **P0-GRAPH-DEFAULT** | ~~默认 node_types=["artifact"] 导致图谱无边显示~~ | [review-chat-graph] | ~~**P0**~~ | **2026-04-17 已修复**：默认值改为全部类型，关系边正常显示。 |
| P1-GRAPH-INDEX | LightRAG 索引规模小 | [review-chat-graph] | P1 | 仅 21 实体、16 关系，需重建或参数调优（当前已跳过 LightRAG，使用 SQLite） |
| P2-GRAPH-5 | ~~图谱统计文案"X个文物"误导~~ | [review-round-2] | ~~P2~~ | **已修复**：准确区分文物和属性节点 |
| P2-GRAPH-10 | 图谱搜索无分页限制 | [review-round-1] | P2 | `search_graph` 对 SQLite fallback 执行 `.all()` 无 limit |
| UX-GRAPH-1 | 节点详情面板信息较少 | [设计] | P3 | 点击节点仅显示基础属性，缺少关联文物列表 |

---

## 8. CSV 导入端点

### 8.1 导入 API

**端点**：`POST /api/graph/import`

上传 CSV 文件导入三元组到 Neo4j。CSV 格式与导出一致：

```csv
source_name,relation,target_name,source_type,target_type
后母戊鼎,属于朝代,商,artifact,era
```

- 必需列：`source_name`, `relation`, `target_name`
- 可选列：`source_type`, `target_type`（默认 "unknown"）
- 导入的三元组添加 `source='csv_import'` 属性
- Neo4j label 经过 sanitize 防止 Cypher 注入

**位置**：`backend/app/routers/graph.py:126-278`

### 8.2 导出 API

**端点**：`GET /api/graph/export`

流式响应（`text/csv`），文件名 `graph_triples_export.csv`。

**位置**：`backend/app/routers/graph.py:87-123`

---

## 9. 文本知识抽取端点

### 9.1 抽取 API

**端点**：`POST /api/graph/extract`

请求体：
```json
{
  "text": "后母戊鼎是商代晚期的青铜礼器..."
}
```

流程：
1. 初始化 LightRAG 服务
2. 调用 `rag.ainsert(text)` 进行增量提取
3. 查询 Neo4j 获取新提取的实体和关系
4. 返回结构化结果（实体列表 + 关系列表）

超时：120 秒。

**位置**：`backend/app/routers/graph.py:281-405`

---

## 10. 知识抽取页面

### 10.1 页面路由

**路由**：`/knowledge`
**组件**：`frontend/src/pages/Knowledge.tsx`
**菜单标签**：知识抽取（ExperimentOutlined 图标）

### 10.2 功能

| 功能 | 说明 |
|------|------|
| 文本知识抽取 | 输入文本 → LightRAG 提取实体和关系 → 展示 Tag 标签 |
| CSV 导入 | 上传 CSV 文件 → 预览前 5 行 → 导入 Neo4j |
| CSV 导出 | 导出当前知识图谱三元组（下载 CSV 文件） |

### 10.3 实体类型颜色

```typescript
const ENTITY_COLORS: Record<string, string> = {
  文物: '#533afd',
  朝代: '#f59e0b',
  类别: '#10b981',
  地点: '#ef4444',
  标签: '#6366f1',
  其他: '#64748b',
};
```

---

## 11. 验收标准

| 检查项 | 标准 | 当前状态 |
|--------|------|---------|
| 全图加载 | 成功显示节点和边 | ✅ 默认显示全部类型，关系可见 |
| 搜索功能 | 关键词匹配正确 | ✅ 已实现 |
| 节点详情 | 点击弹出完整属性 | ✅ 已实现 |
| 类型过滤 | Checkbox 生效 | ✅ 已实现 |
| 性能 | 500 节点流畅渲染 | ✅ D3.js 优化 |
| CSV 导出 | 导出三元组 | ✅ 已实现 |
| CSV 导入 | 导入三元组到 Neo4j | ✅ 已实现 |
| 文本知识抽取 | LightRAG 增量提取 | ✅ 已实现 |
| SQLite 图谱 | 动态构建关系图 | ✅ fallback 数据源 |

---

## 12. 关键文件索引

| 文件 | 负责内容 |
|------|---------|
| `backend/app/services/graph.py` | 三级 fallback、节点类型过滤、图谱构建 |
| `backend/app/routers/graph.py` | API 端点（含 import/extract） |
| `frontend/src/pages/Graph.tsx` | D3.js 力导向图、Checkbox 筛选 |
| `frontend/src/pages/Knowledge.tsx` | 知识抽取页面（文本抽取、CSV 导入导出） |
| `frontend/src/api/graph.ts` | 图谱 API 调用 |
| `backend/data/lightrag/` | LightRAG KV Store 文件 |

---

*最后更新：2026-04-18*