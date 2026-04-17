# 知识图谱模块规格说明

> 最后更新：2026-04-16
> 当前实现状态：**三级 fallback 已实现，节点类型过滤已实现**

---

## 当前实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 三级 fallback 架构 | ✅ 已实现 | Neo4j → LightRAG KV Store → SQLite |
| LightRAG KV Store 读取 | ✅ 已实现 | `_query_lightrag_kvstore()` 读取 JSON 文件 |
| 节点类型过滤 | ✅ 已实现 | `node_types` 参数，前端 Checkbox 筛选 |
| 全图加载 | ✅ 已实现 | `/api/graph/full` |
| 关键词搜索 | ✅ 已实现 | `/api/graph/search` |
| 节点详情 | ✅ 已实现 | `/api/graph/node/:node_id` |
| D3.js 力导向图 | ✅ 已实现 | 拖拽、缩放、平移、节点点击 |
| 类型颜色编码 | ✅ 已实现 | artifact=紫色, era=深蓝, location=绿色等 |

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

## 2. 三级 Fallback 架构

### 2.1 数据源优先级

```
Level 1: Neo4j（语义图谱）
    ↓ 如果无数据或不可用
Level 2: LightRAG KV Store（JSON 文件）
    ↓ 如果文件不存在
Level 3: SQLite（结构化属性关系）
```

### 2.2 LightRAG KV Store 读取

**函数位置**：`backend/app/services/graph.py:140-208`

```python
def _query_lightrag_kvstore(limit, keyword):
    """Read LightRAG KV Store JSON files."""
    entities_path = os.path.join(lightrag_dir, "kv_store_full_entities.json")
    relations_path = os.path.join(lightrag_dir, "kv_store_full_relations.json")
    # 解析 JSON，构建节点和边
```

读取文件：
- `kv_store_full_entities.json` — 实体文档，包含 `entity_names` 数组
- `kv_store_full_relations.json` — 关系文档，包含 `relation_pairs` 数组

### 2.3 SQLite Fallback

**函数位置**：`backend/app/services/graph.py:221-312`

```python
def build_graph_from_artifacts(artifacts):
    """从文物列表构建图谱节点和边。"""
    # 为每个文物创建节点
    # 创建 era/category/location/tag 关系节点
```

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
| `/api/graph/full` | GET | `limit`, `node_types` | 加载全图数据 |
| `/api/graph/search` | GET | `keyword`, `node_types` | 搜索图谱 |
| `/api/graph/node/:node_id` | GET | — | 获取节点详情 |

### 4.2 node_types 参数

默认值：`["artifact"]`

可选值：`artifact`, `era`, `category`, `location`, `tag`

**位置**：
- 后端：`backend/app/routers/graph.py:19-26`
- 前端 API：`frontend/src/api/graph.ts:36-39, 48-51`

### 4.3 响应格式

```json
{
  "nodes": [
    {"id": "artifact_1", "name": "后母戊鼎", "type": "artifact", "properties": {...}},
    {"id": "era_商", "name": "商", "type": "era"}
  ],
  "edges": [
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
  .force("link", d3.forceLink(edges).distance(100))
  .force("charge", d3.forceManyBody().strength(-300))
  .force("center", d3.forceCenter(width/2, height/2))
  .force("collision", d3.forceCollide().radius(30));
```

### 5.2 节点类型颜色映射

```typescript
const TYPE_COLORS: Record<string, string> = {
  Artifact: '#533afd',    // 紫色（主色）
  Era: '#061b31',         // 深蓝
  Location: '#15be53',    // 绿色
  Category: '#ea2261',    // 红色
  Tag: '#f96bee',         // 粉色
};
```

### 5.3 节点类型筛选控件

**位置**：`frontend/src/pages/Graph.tsx:104-105, 676-724`

```typescript
const [visibleTypes, setVisibleTypes] = useState(['artifact'])

// 监听 visibleTypes 变化，重新 fetch 数据
useEffect(() => {
  fetchGraph()
}, [visibleTypes])
```

Checkbox 控件：
- 默认只勾选"文物"
- 可勾选 era/category/location/tag

### 5.4 交互功能

| 功能 | 实现方式 |
|------|---------|
| 节点拖拽 | `d3.drag()` + `simulation.alphaTarget(0.3)` |
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

默认 `visibleTypes = ['artifact']`，仅显示文物节点。

---

## 7. 已知问题

| ID | 问题 | 来源 | 优先级 | 说明 |
|-----|------|------|--------|------|
| **P0-GRAPH-DEFAULT** | 默认 node_types=["artifact"] 导致图谱无边显示 | [review-chat-graph] | **P0** | Artifacts 之间无直接边（边连接 artifact→era/category），默认只显示 artifact 时边数为 0。需修改默认值为 `["artifact", "era", "category", "location"]` 或提示用户勾选其他类型。 |
| P1-GRAPH-INDEX | LightRAG 索引规模小 | [review-chat-graph] | P1 | 仅 21 实体、16 关系，需重建或参数调优 |
| P2-GRAPH-5 | 图谱统计文案"X个文物"误导 | [review-round-2] | ✅ 已修复 | `Graph.tsx:540-556` 已正确实现：`artCount = nodes.filter(n => n.type === 'artifact').length`，文案为 `{artCount} 个文物 · {attrCount} 个属性`，准确区分文物和属性节点 |
| P2-GRAPH-10 | 图谱搜索无分页限制 | [review-round-1] | P2 | `search_graph` 对 SQLite fallback 执行 `.all()` 无 limit |
| UX-GRAPH-1 | 节点详情面板信息较少 | [设计] | P3 | 点击节点仅显示基础属性，缺少关联文物列表 |

### P0-GRAPH-DEFAULT 详细分析

**现象**：默认加载图谱时，只显示 artifact 节点，无任何边连接。视觉效果为散点图。

**根因**：
- SQLite fallback 的边连接 artifact → era/category/location/tag
- 默认 node_types=["artifact"] 过滤掉了 era/category 等节点
- 边的两端节点必须在过滤后的节点集合中才保留
- 因此所有边都被过滤掉

**修复建议**：
1. 修改前端默认 visibleTypes 为 `['artifact', 'era', 'category', 'location']`
2. 或在 UI 中添加提示"勾选其他类型以显示关系"
3. 或在后端 get_full_graph 中自动包含 artifact 的关联节点

---

## 8. 验收标准

| 检查项 | 标准 | 当前状态 |
|--------|------|---------|
| 全图加载 | 成功显示节点和边 | ⚠️ 默认只显示 artifact，无边 |
| 搜索功能 | 关键词匹配正确 | ✅ 已实现 |
| 节点详情 | 点击弹出完整属性 | ✅ 已实现 |
| 类型过滤 | Checkbox 生效 | ✅ 已实现 |
| 性能 | 500 节点流畅渲染 | ✅ D3.js 优化 |
| Neo4j 数据 | 三元组 ≥1000 | ⚠️ Neo4j 未接入，依赖 fallback |

---

## 9. 关键文件索引

| 文件 | 负责内容 |
|------|---------|
| `backend/app/services/graph.py` | 三级 fallback、节点类型过滤、图谱构建 |
| `backend/app/routers/graph.py` | API 端点 |
| `frontend/src/pages/Graph.tsx` | D3.js 力导向图、Checkbox 筛选 |
| `frontend/src/api/graph.ts` | 图谱 API 调用 |
| `backend/data/lightrag/` | LightRAG KV Store 文件 |

---

*最后更新：2026-04-16*