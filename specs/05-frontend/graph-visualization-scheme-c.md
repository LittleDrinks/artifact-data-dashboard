# 知识图谱可视化 - 方案 C（混合方案）详细设计

> **决策状态**：已确认采用方案 C（动态聚合 + 鱼眼视图）

---

## 核心概念

### 什么是"混合方案"？

结合两种视图的优势：
1. **核心节点**：始终显示度数高的重要节点（完全展开）
2. **聚合标签**：周围节点按属性聚合为可交互标签
3. **鱼眼效果**：鼠标聚焦区域自动放大，边缘压缩

### 用户体验流程

```
初始视图（轻量）
    │
    ▼
核心节点 + 聚合标签  ──悬停──▶  聚合展开显示内部节点
    │
点击节点  
    │
    ▼
以该节点为中心重新布局
    │
筛选/搜索
    │
    ▼
高亮匹配节点，淡化其他
```

---

## 界面设计

### 主视图布局

```
┌───────────────────────────────────────────────────────────────────────┐
│  知识图谱                                    [导出 ▼] [设置 ▼] [?]   │
├───────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────────────────────────────────────┐  │
│  │             │  │                                              │  │
│  │  筛选面板    │  │              图谱画布                        │  │
│  │             │  │                                              │  │
│  │  朝代       │  │        +-----------+                         │  │
│  │  [全部 ▼]   │  │        |   唐代    |                         │  │
│  │             │  │        | (128件)  |                         │  │
│  │  类别       │  │        +-----┬-----+                         │  │
│  │  [全部 ▼]   │  │              │                               │  │
│  │             │  │    +---------● 故宫博物院 ●---------+        │  │
│  │  材质       │  │    |         /  |  \         |        │  │
│  │  [全部 ▼]   │  │  金缕玉衣 ●   |  |   ● 四羊方尊     │  │
│  │             │  │    |       /    |    \       |        │  │
│  │  ─────────  │  │  +-----+ /   商陶盘  \ +-----+        │  │
│  │             │  │  | 宋  |/     (展开)   \| 明  |        │  │
│  │  视图模式   │  │  +-----+               +-----+        │  │
│  │  ○ 聚合     │  │                                              │  │
│  │  ● 动态     │  │  [鼠标悬停"唐代"标签，自动展开显示]         │  │
│  │  ○ 全量     │  │                                              │  │
│  │             │  │                                              │  │
│  │  ─────────  │  │  ┌──────────────────────────────────────┐   │  │
│  │             │  │  │  迷你图例                             │   │  │
│  │  [路径发现] │  │  │  ● 文物  ○ 人物  △ 地点  □ 朝代      │   │  │
│  │  [重置视图] │  │  └──────────────────────────────────────┘   │  │
│  │             │  │                                              │  │
│  └─────────────┘  └──────────────────────────────────────────────┘  │
│                                                                       │
│  状态: 显示 15 个核心节点 + 8 个聚合类别    缩放: 100%  [+][-][⟲]     │
└───────────────────────────────────────────────────────────────────────┘
```

### 节点样式定义

| 节点类型 | 形状 | 颜色 | 大小 | 标签显示 |
|----------|------|------|------|----------|
| 核心文物节点 | 圆形 | #1890ff | 大 (40px) | 名称 + 年代 |
| 次要文物节点 | 圆形 | #69c0ff | 中 (25px) | 仅名称 |
| 聚合标签节点 | 圆角矩形 | #fa8c16 | 根据数量 | 类别名 + 数量 |
| 人物节点 | 人形图标 | #52c41a | 中 (30px) | 姓名 |
| 地点节点 | 地标图标 | #722ed1 | 中 (30px) | 地名 |
| 朝代节点 | 菱形 | #eb2f96 | 小 (20px) | 朝代名 |

### 聚合标签展开效果

```
鼠标悬停在"唐代 (128件)"标签上：

                    压缩区域
                  ┌─────────┐
                  │   宋    │
                  │  (96件) │
                  └────┬────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                   │
    │  金缕玉衣        ● 故宫博物院        │
    │    唐代         / \    中心节点      │
    │               /   \                 │
    │   +-----------------------------+   │
    │   │     唐代 (128件) ← 展开      │   │  ← 聚焦区域
    │   │  ┌─────┐    ┌─────┐         │   │     (鱼眼放大)
    │   │  │陶盘 │────│铜镜 │         │   │
    │   │  │唐代 │    │唐代 │         │   │
    │   │  └─────┘    └─────┘         │   │
    │   │  ┌─────┐    ┌─────┐         │   │
    │   │  │陶俑 │────│玉璧 │         │   │
    │   │  │唐代 │    │唐代 │         │   │
    │   │  └─────┘    └─────┘         │   │
    │   +-----------------------------+   │
    │              \   /                 │
    │               \ /                  │
    │                ●                   │
    │              四羊方尊              │
    │               商代                 │
    │                                    │
    └────────────────────────────────────┘
```

---

## 交互设计

### 1. 鼠标交互

| 操作 | 效果 |
|------|------|
| **悬停节点** | 节点放大 20%，显示详细tooltip，相关边高亮 |
| **悬停聚合标签** | 展开显示该类别的部分代表节点（最多 6 个） |
| **单击节点** | 选中节点，右侧显示详情面板，以该节点为中心重新布局 |
| **双击节点** | 展开/折叠该节点的邻居节点 |
| **拖拽节点** | 手动调整节点位置，松开后力导向继续 |
| **滚轮** | 缩放画布，缩放范围 50% - 200% |
| **拖拽画布** | 平移视图 |

### 2. 聚焦模式（鱼眼视图）

```javascript
// 鱼眼视图核心逻辑
function applyFisheye(nodes, mouseX, mouseY, radius = 200, power = 2) {
  return nodes.map(node => {
    const distance = Math.sqrt(
      Math.pow(node.x - mouseX, 2) + 
      Math.pow(node.y - mouseY, 2)
    );
    
    if (distance < radius) {
      // 在聚焦范围内，根据距离计算放大比例
      const distortion = Math.pow(distance / radius, power);
      const scale = 1 + (1 - distortion) * 0.5;
      
      return {
        ...node,
        displayX: mouseX + (node.x - mouseX) * scale,
        displayY: mouseY + (node.y - mouseY) * scale,
        displaySize: node.size * scale
      };
    }
    
    return node;
  });
}
```

### 3. 聚合展开动画

```
聚合标签展开时的过渡动画：

时间: 0ms        150ms        300ms        450ms
      │           │            │            │
      ▼           ▼            ▼            ▼
    ┌─────┐    ┌─────┐      ┌─────┐      ┌───────┐
    │唐代 │ →  │唐代 │  →   │唐代 │   →  │ 唐代  │
    │128件│    │     │      │ ○ ○ │      │○ ○ ○ ○│
    └─────┘    └─────┘      └─────┘      └───────┘
    
    初始状态    轻微放大     显示2个样本   展开6个样本
```

---

## 数据结构

### 后端返回的数据格式

```typescript
interface GraphData {
  // 核心节点（度数高，始终显示）
  coreNodes: Array<{
    id: string;
    name: string;
    type: 'artifact' | 'person' | 'location' | 'dynasty';
    properties: {
      era?: string;
      category?: string;
      material?: string;
      image?: string;
    };
    degree: number;  // 连接数
    x?: number;      // 布局位置
    y?: number;
  }>;
  
  // 聚合节点（按类别分组）
  clusters: Array<{
    id: string;
    type: 'cluster';
    groupBy: 'era' | 'category' | 'material' | 'museum';
    groupValue: string;
    count: number;
    sampleNodes: Array<{
      id: string;
      name: string;
      image?: string;
    }>;  // 样本节点（用于预览）
    centroid: { x: number; y: number };
  }>;
  
  // 边（只包含核心节点之间的边，以及核心节点与聚合标签的边）
  links: Array<{
    source: string;  // 节点ID或聚合ID
    target: string;
    type: string;    // 关系类型
    strength?: number;
  }>;
}
```

### 动态展开时的数据加载

```typescript
// 展开聚合节点时的API
interface ExpandClusterRequest {
  clusterId: string;      // 聚合节点ID
  groupBy: string;        // 分组维度
  groupValue: string;     // 分组值
  filters?: {
    era?: string;
    category?: string;
    material?: string;
  };
  limit: number;          // 返回数量限制
  offset: number;         // 分页偏移
}

interface ExpandClusterResponse {
  nodes: Array<{
    id: string;
    name: string;
    type: 'artifact';
    properties: object;
  }>;
  total: number;
  hasMore: boolean;
}
```

---

## 后端 API 设计

### 1. 获取图谱数据（动态视图）

```http
GET /api/graph/dynamic?view=center&centerId=artifact_123&limit=50

Query Parameters:
- view: string - 视图类型 ('center' | 'global')
- centerId: string - 中心节点ID（view=center时必填）
- limit: number - 核心节点数量限制（默认50）
- filters: object - 筛选条件

Response:
{
  "coreNodes": [...],
  "clusters": [...],
  "links": [...],
  "statistics": {
    "totalNodes": 1247,
    "totalClusters": 8,
    "filteredNodes": 156
  }
}
```

### 2. 展开聚合节点

```http
GET /api/graph/cluster/:clusterId/expand?limit=20&offset=0

Response:
{
  "nodes": [...],
  "total": 128,
  "hasMore": true
}
```

### 3. 路径发现

```http
POST /api/graph/path

Request:
{
  "sourceId": "artifact_123",
  "targetId": "location_456",
  "maxDepth": 4,
  "algorithm": "shortest"  // 'shortest' | 'all'
}

Response:
{
  "paths": [
    {
      "pathId": "path_1",
      "length": 3,
      "nodes": [...],
      "links": [...]
    }
  ]
}
```

---

## 性能优化策略

### 1. 前端优化

```javascript
// 1. 使用 requestAnimationFrame 优化动画
function animate() {
  requestAnimationFrame(() => {
    updateFisheye();
    render();
    animate();
  });
}

// 2. 虚拟渲染（只渲染视口内的节点）
function getVisibleNodes(nodes, viewport) {
  return nodes.filter(node => 
    node.x >= viewport.x && 
    node.x <= viewport.x + viewport.width &&
    node.y >= viewport.y &&
    node.y <= viewport.y + viewport.height
  );
}

// 3. 防抖处理高频事件
const debouncedHover = debounce(handleNodeHover, 50);

// 4. Web Worker 处理布局计算
const worker = new Worker('layout-worker.js');
worker.postMessage({ nodes, links });
worker.onmessage = (e) => updateLayout(e.data);
```

### 2. 后端优化

```sql
-- 1. 预计算节点度数，存入缓存
CREATE TABLE node_degrees AS
MATCH (n)
OPTIONAL MATCH (n)-[r]-()
RETURN n.id as node_id, count(r) as degree;

CREATE INDEX idx_degree ON node_degrees(degree DESC);

-- 2. 核心节点查询（使用索引）
MATCH (n)
WHERE n.id IN (SELECT node_id FROM node_degrees ORDER BY degree DESC LIMIT 50)
RETURN n;

-- 3. 聚合查询（预计算或使用缓存）
MATCH (n:Artifact)
WHERE n.era IS NOT NULL
RETURN n.era as era, count(n) as count, collect(n)[0..5] as samples;
```

---

## 实现任务清单

### Phase 1：基础功能（2 周）

- [ ] 后端 API：获取动态视图数据
- [ ] 后端 API：聚合节点展开
- [ ] 前端：D3.js 力导向图基础渲染
- [ ] 前端：核心节点和聚合标签显示
- [ ] 前端：鼠标悬停基础交互

### Phase 2：高级交互（2 周）

- [ ] 鱼眼视图效果实现
- [ ] 聚合展开动画
- [ ] 节点详情侧边面板
- [ ] 筛选面板联动
- [ ] 路径发现功能

### Phase 3：性能优化（1 周）

- [ ] 虚拟渲染优化
- [ ] Web Worker 布局计算
- [ ] 后端缓存优化
- [ ] 大数据量测试

---

## 验收标准

- [ ] 1000+ 节点能流畅交互（FPS > 30）
- [ ] 聚合标签悬停 300ms 内展开
- [ ] 鱼眼视图跟随鼠标平滑移动
- [ ] 路径发现支持 6 度以内查询
- [ ] 支持导出 PNG/SVG

---

*文档版本：v1.0*
*设计确认：2026-02-13*
*负责模块：前端 Graph 组件*
