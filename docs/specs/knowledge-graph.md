# 知识图谱模块规格说明

> 参考：`docs/PRD.md` §3.3 知识图谱
> 相关 ADR：ADR-002 (SQLite + Neo4j)、ADR-003 (LightRAG + LangChain Agent)、ADR-004 (维基百科 + Wikidata)

---

## 1. 需求概述

知识图谱模块提供文物实体关系的可视化探索和查询能力，是本系统的核心差异化功能。

### 1.1 业务需求

| 需求 | 描述 | 优先级 |
|------|------|--------|
| 图谱可视化 | D3.js 力导向图，支持拖拽、缩放、平移 | P0 |
| 全图加载 | 一键加载 Neo4j 中全部节点和关系 | P0 |
| 关键词搜索 | 输入关键词搜索节点，支持深度扩展（1-3层） | P0 |
| 节点详情 | 点击节点弹出详情面板 | P0 |
| 类型过滤 | 按节点类型设置显示数量上限 | P1 |
| 参数调节 | 力导向参数可调节（斥力、连接距离） | P1 |

---

## 2. 数据模型

### 2.1 Neo4j 节点类型

| Label | 属性 | 说明 | MVP |
|-------|------|------|-----|
| Artifact | id, name, description, category, era, location | 文物节点 | ✓ |
| Category | name, description | 类别节点 | ✓ |
| Era | name, startYear, endYear | 年代节点 | ✓ |
| Location | name, region | 地点节点 | ✓ |
| Material | name, description | 材质节点 | ✓ |
| Museum | name, region | 博物馆节点 | ✓ |

### 2.2 关系类型

| 关系 | 起点 | 终点 | 说明 |
|------|------|------|------|
| BELONGS_TO_CATEGORY | Artifact | Category | 属于类别 |
| BELONGS_TO_ERA | Artifact | Era | 属于年代 |
| EXCAVATED_AT | Artifact | Location | 出土于 |
| MADE_OF | Artifact | Material | 制作材料 |
| COLLECTED_BY | Artifact | Museum | 收藏于 |
| SAME_SITE | Artifact | Artifact | 同批出土 |
| SAME_ERA | Artifact | Artifact | 同时代 |
| RELATED_TO | Artifact | Artifact | LightRAG 抽取的语义关联 |

### 2.3 双层架构

```
┌─────────────────────────────────────────────────┐
│  第一层：结构化数据层（Wikidata + SQLite 映射）   │
│  Artifact → Era → Location → Category → Museum   │
│  关系明确，数量有限，作为骨架                      │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  第二层：语义关联层（LightRAG 抽取）             │
│  Artifact ←→ Artifact                            │
│  关系来自文本描述：工艺相似、纹饰关联、文化意义    │
│  数量丰富，语义深度，增强图谱                     │
└─────────────────────────────────────────────────┘
```

---

## 3. API 接口

### 3.1 图谱数据 API

| 端点 | 方法 | 说明 |
|------|------|------|
| /api/graph/full | GET | 加载全图数据 |
| /api/graph/search | GET | 按关键词搜索（keyword, depth） |
| /api/graph/entity/:type/:id | GET | 获取实体详情 |

### 3.2 响应格式

**全图响应**：
```json
{
  "nodes": [
    {"id": "1", "label": "Artifact", "name": "后母戊鼎", "properties": {...}},
    {"id": "2", "label": "Era", "name": "商", "properties": {...}}
  ],
  "edges": [
    {"source": "1", "target": "2", "type": "BELONGS_TO_ERA"}
  ]
}
```

**搜索响应**：
```json
{
  "keyword": "后母戊鼎",
  "depth": 2,
  "nodes": [...],
  "edges": [...],
  "match_count": 1
}
```

---

## 4. 前端可视化

### 4.1 D3.js 力导向图配置

```typescript
// frontend/src/pages/Graph.tsx
const simulation = d3.forceSimulation(nodes)
  .force("link", d3.forceLink(edges).distance(100))
  .force("charge", d3.forceManyBody().strength(-300))
  .force("center", d3.forceCenter(width/2, height/2))
  .force("collision", d3.forceCollide().radius(30));
```

### 4.2 节点类型颜色映射

```typescript
const TYPE_COLORS: Record<string, string> = {
  Artifact: '#533afd',    // 紫色（主色）
  Era: '#061b31',         // 深蓝（年代）
  Location: '#15be53',    // 绿色（地点）
  Category: '#ea2261',    // 红色（类别）
  Material: '#f96bee',    // 粉色（材质）
  Museum: '#273951'       // 灰蓝（博物馆）
};
```

### 4.3 交互功能

| 功能 | 实现方式 |
|------|---------|
| 节点拖拽 | `d3.drag()` + `simulation.alphaTarget(0.3)` |
| 缩放平移 | `d3.zoom()` + SVG transform |
| 节点点击 | 事件监听 → 弹出详情面板 |
| 节点高亮 | 搜索匹配节点 `stroke: '#533afd', stroke-width: 3` |
| 类型过滤 | `nodes.filter(n => typeCount[n.label] <= limit)` |

---

## 5. 图谱构建流程

### 5.1 结构化数据层构建

```python
# scripts/build_graph.py
# 从 artifacts 表构建基础图谱
for artifact in artifacts:
    # 创建文物节点
    graph.create_node("Artifact", artifact.id, artifact.name, ...)
    
    # 创建年代节点 + 关系
    if artifact.era:
        era_node = graph.get_or_create("Era", artifact.era)
        graph.create_edge(artifact.id, era_node.id, "BELONGS_TO_ERA")
    
    # 同理：Category, Location, Museum...
```

### 5.2 LightRAG 语义层构建

```python
# backend/app/ai/lightrag_service.py
# LightRAG 使用 Neo4j 作为图存储后端
lightrag = LightRAG(
    graph_storage="Neo4JStorage",
    ...
)

# 对每条文物描述抽取语义关系
for artifact in artifacts:
    if artifact.full_text and len(artifact.full_text) >= 200:
        lightrag.insert(artifact.full_text)
        # 自动生成 Artifact ↔ Artifact 的 RELATED_TO 关系
```

---

## 6. 性能要求

| 指标 | 标准 |
|------|------|
| 全图渲染 | 500 节点以内流畅交互 |
| 搜索响应 | < 500ms |
| 节点详情 | < 200ms |

**优化策略**：
- 大节点集时开启类型过滤（每类限制 50 个）
- 力导向参数可调节（降低斥力、减少迭代）
- Neo4j 查询使用索引（name 字段）

---

## 7. 验收标准

| 检查项 | 标准 | 验证方法 |
|--------|------|---------|
| 全图加载 | 成功显示所有节点和关系 | 手动测试 |
| 搜索功能 | 关键词匹配正确，深度扩展有效 | 测试用例 |
| 节点详情 | 点击弹出完整属性和关系 | 手动测试 |
| 类型过滤 | 各类型数量上限生效 | 手动测试 |
| 性能 | 500 节点流畅渲染 | Chrome DevTools FPS 检测 |
| Neo4j 数据 | 三元组 ≥1000（含 LightRAG 关系） | Cypher 查询计数 |

---

## 8. 踩坑记录

参考 `docs/pitfalls.md`。

---

*最后更新：2026-04-14*