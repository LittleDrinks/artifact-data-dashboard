# 百度百科数据源规格

## 概述

系统将从**百度百科博物馆频道**爬取文物数据，替代原有的深圳博物馆数据源。

数据来源：
- 百度百科博物馆页面：`https://baike.baidu.com/museum`
- 各博物馆词条页面：如 `https://baike.baidu.com/museum/sanxingdui`
- 文物详情页面：如 `https://baike.baidu.com/item/商陶盘/xxxx`

---

## 数据特点

### 优势
1. **数据量大**：覆盖全国数百家博物馆，数万件文物
2. **结构化程度较高**：包含名称、年代、类别、尺寸、材质、收藏地等字段
3. **图文丰富**：包含多张文物图片
4. **关系丰富**：包含人物（作者/收藏者）、地点、朝代等关联信息

### 挑战
1. **数据质量不一**：不同博物馆的词条编辑质量参差不齐
2. **字段不完整**：部分文物缺少某些字段
3. **格式不统一**：同一字段可能有多种表达方式
4. **爬取限制**：需要考虑反爬策略和频率控制

---

## 爬虫架构

```
┌─────────────────────────────────────────────────────────────┐
│                    百度百科爬虫系统                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │ 博物馆列表  │───▶│ 文物列表    │───▶│ 文物详情    │    │
│  │ 爬虫        │    │ 爬虫        │    │ 爬虫        │    │
│  └─────────────┘    └─────────────┘    └─────────────┘    │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │ museums.json│    │ artifacts/  │    │ entries/    │    │
│  │             │    │ 每馆一个文件│    │ 每文物一个  │    │
│  └─────────────┘    └─────────────┘    └─────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    数据清洗层                        │   │
│  │  - 字段标准化（年代、类别、材质）                    │   │
│  │  - 缺失值填充                                       │   │
│  │  - 重复数据去重                                     │   │
│  │  - 数据验证                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                             │                               │
│                             ▼                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    数据入库层                        │   │
│  │  - MySQL (文物结构化数据)                           │   │
│  │  - Neo4j (知识图谱关系)                             │   │
│  │  - 图片存储 (本地/对象存储)                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 爬取流程

### Stage 1：获取博物馆列表

**API 端点**：`https://baike.baidu.com/api/museum/getmuseumlist`

**输出格式**：
```json
{
  "name": "三星堆博物馆",
  "domain": "sanxingdui",
  "museumId": "xxxx",
  "provCode": "510000",
  "cityCode": "510600",
  "lemmaUrl": "https://baike.baidu.com/item/三星堆博物馆/xxxx",
  "picUrl": "https://..."
}
```

### Stage 2：获取博物馆文物列表

**页面 URL**：`https://baike.baidu.com/museum/{domain}`

**提取方式**：
- 从页面 JavaScript 中提取 `exibitList` 数组
- 包含 `collectionId`, `branchId`, `lemmaUrl` 等字段

**输出格式**：
```json
{
  "museum_name": "三星堆博物馆",
  "museum_url": "https://baike.baidu.com/museum/sanxingdui",
  "branch_id": "408",
  "collection_id": "11399",
  "entry_url": "https://baike.baidu.com/item/商陶盘/xxxx",
  "title": "商陶盘",
  "intro": "此文物为商代的陶器...",
  "upload_date": "2019年1月28日"
}
```

### Stage 3：获取文物详情页

**页面 URL**：`https://baike.baidu.com/item/{title}/{itemId}`

**提取字段**：
- 基本信息（标题、描述、图片）
- 元数据（名称、年代、类别、尺寸、材质、收藏地）
- 正文文本

**输出格式**：详见下方"数据模型"

---

## 数据模型

### 原始数据格式（Raw Data）

```json
{
  "source": {
    "museum_name": "三星堆博物馆",
    "museum_url": "https://baike.baidu.com/museum/sanxingdui",
    "branch_id": "408",
    "collection_id": "11399",
    "entry_url": "https://baike.baidu.com/item/商陶盘/xxxx",
    "title": "商陶盘",
    "intro": "此文物为商代的陶器，高12.4cm...",
    "upload_date": "2019年1月28日"
  },
  "entry_url": "https://baike.baidu.com/item/商陶盘/xxxx",
  "crawl_time": "2026-01-11T04:33:49Z",
  "url": "https://baike.baidu.com/item/商陶盘/xxxx",
  "title": "商陶盘",
  "metadata": {
    "中文名": "商陶盘",
    "馆藏地点": "三星堆博物馆",
    "所属年代": "商代",
    "类    别": "陶器"
  },
  "text": "商陶盘是三星堆遗址出土的陶器...",
  "images": [
    "https://bkimg.cdn.bcebos.com/pic/xxxx"
  ],
  "raw_html": "<!DOCTYPE html>...",
  "status": "ok"
}
```

### 清洗后数据格式（Cleaned Data）

```json
{
  "id": "bd_11399",
  "source": "baidu_baike",
  "source_id": "11399",
  
  "name": "商陶盘",
  "aliases": ["商代陶盘"],
  
  "era": {
    "raw": "商代",
    "normalized": "商",
    "start_year": -1600,
    "end_year": -1046
  },
  
  "category": {
    "raw": "陶器",
    "normalized": "陶瓷",
    "hierarchy": ["文物", "陶瓷", "陶器"]
  },
  
  "material": {
    "raw": "陶",
    "normalized": "陶土"
  },
  
  "dimensions": {
    "raw": "高12.4cm，口径38.5cm，底径5.5cm",
    "parsed": {
      "height": { "value": 12.4, "unit": "cm" },
      "diameter": { "value": 38.5, "unit": "cm" },
      "base_diameter": { "value": 5.5, "unit": "cm" }
    }
  },
  
  "location": {
    "museum": "三星堆博物馆",
    "city": "广汉市",
    "province": "四川省"
  },
  
  "description": "此文物为商代的陶器，素面，色泽不均...",
  
  "images": [
    {
      "url": "https://bkimg.cdn.bcebos.com/pic/xxxx",
      "type": "original",
      "downloaded": true,
      "local_path": "/data/images/bd_11399_01.jpg"
    }
  ],
  
  "related_entities": {
    "persons": [],
    "locations": ["三星堆遗址"],
    "dynasties": ["商"],
    "categories": ["陶器"]
  },
  
  "crawl_info": {
    "crawled_at": "2026-01-11T04:33:49Z",
    "page_url": "https://baike.baidu.com/item/商陶盘/xxxx",
    "version": "1.0"
  },
  
  "quality_score": 0.85
}
```

---

## 字段标准化规则

### 1. 年代标准化

| 原始值 | 标准化值 | 起年 | 止年 |
|--------|----------|------|------|
| 商代、商、商朝 | 商 | -1600 | -1046 |
| 周代、周、周朝 | 周 | -1046 | -256 |
| 西汉 | 西汉 | -206 | 8 |
| 东汉 | 东汉 | 25 | 220 |
| 唐代、唐、唐朝 | 唐 | 618 | 907 |
| 宋代、宋、宋朝 | 宋 | 960 | 1279 |
| 元代、元、元朝 | 元 | 1271 | 1368 |
| 明代、明、明朝 | 明 | 1368 | 1644 |
| 清代、清、清朝 | 清 | 1644 | 1912 |
| 近现代 | 近现代 | 1840 | 1949 |

**正则匹配规则**：
```javascript
const eraPatterns = [
  { pattern: /商代?|商朝?/, value: '商', start: -1600, end: -1046 },
  { pattern: /周代?|周朝?/, value: '周', start: -1046, end: -256 },
  { pattern: /西汉|前汉/, value: '西汉', start: -206, end: 8 },
  { pattern: /东汉|后汉/, value: '东汉', start: 25, end: 220 },
  { pattern: /唐代?|唐朝?/, value: '唐', start: 618, end: 907 },
  { pattern: /宋代?|宋朝?|北宋|南宋/, value: '宋', start: 960, end: 1279 },
  { pattern: /元代?|元朝?/, value: '元', start: 1271, end: 1368 },
  { pattern: /明代?|明朝?/, value: '明', start: 1368, end: 1644 },
  { pattern: /清代?|清朝?|晚清|清初/, value: '清', start: 1644, end: 1912 },
];
```

### 2. 类别标准化

```javascript
const categoryHierarchy = {
  '青铜器': ['文物', '金属器', '青铜器'],
  '铜器': ['文物', '金属器', '铜器'],
  '金器': ['文物', '金属器', '金器'],
  '银器': ['文物', '金属器', '银器'],
  '铁器': ['文物', '金属器', '铁器'],
  
  '陶器': ['文物', '陶瓷', '陶器'],
  '瓷器': ['文物', '陶瓷', '瓷器'],
  '唐三彩': ['文物', '陶瓷', '唐三彩'],
  
  '玉器': ['文物', '玉石器', '玉器'],
  '石器': ['文物', '玉石器', '石器'],
  '石刻': ['文物', '石刻', '石刻'],
  
  '书画': ['文物', '书画', '书画'],
  '书法': ['文物', '书画', '书法'],
  '绘画': ['文物', '书画', '绘画'],
  
  '文献': ['文物', '文献', '文献'],
  '古籍': ['文物', '文献', '古籍'],
  '档案': ['文物', '文献', '档案'],
};
```

### 3. 材质标准化

```javascript
const materialMapping = {
  '青铜': '青铜',
  '铜': '铜',
  '铁': '铁',
  '金': '金',
  '银': '银',
  '玉': '玉',
  '石': '石',
  '陶': '陶土',
  '瓷': '瓷',
  '木': '木',
  '竹': '竹',
  '纸': '纸',
  '绢': '绢',
  '布': '布',
  '漆': '漆',
};
```

---

## 数据质量评估

### 质量分数计算

```javascript
function calculateQualityScore(artifact) {
  let score = 0;
  let maxScore = 0;
  
  // 基本信息（必需）
  maxScore += 20;
  if (artifact.name) score += 20;
  
  // 核心属性（重要）
  maxScore += 40;
  if (artifact.era?.normalized) score += 10;
  if (artifact.category?.normalized) score += 10;
  if (artifact.material?.normalized) score += 10;
  if (artifact.location?.museum) score += 10;
  
  // 详细信息（加分）
  maxScore += 20;
  if (artifact.dimensions?.parsed) score += 5;
  if (artifact.description?.length > 50) score += 5;
  if (artifact.images?.length > 0) score += 5;
  if (artifact.related_entities?.persons?.length > 0) score += 5;
  
  // 关系信息（加分）
  maxScore += 20;
  if (artifact.related_entities?.dynasties?.length > 0) score += 5;
  if (artifact.related_entities?.locations?.length > 0) score += 5;
  if (artifact.metadata?.length > 3) score += 10;
  
  return score / maxScore;
}
```

### 质量等级

| 分数 | 等级 | 处理策略 |
|------|------|----------|
| 0.8 - 1.0 | 优秀 | 直接入库 |
| 0.6 - 0.8 | 良好 | 自动入库，标记待完善 |
| 0.4 - 0.6 | 一般 | 人工审核后入库 |
| < 0.4 | 较差 | 暂不录入，记录待处理 |

---

## 数据入库流程

### 1. MySQL 文物表

```sql
INSERT INTO artifacts (
  source, source_id,
  name, era, category, material, dimensions,
  current_location, description,
  quality_score, status
) VALUES (
  'baidu_baike', '11399',
  '商陶盘', '商', '陶器', '陶土', '高12.4cm,口径38.5cm',
  '三星堆博物馆', '此文物为商代的陶器...',
  0.85, 'active'
);
```

### 2. Neo4j 知识图谱

```cypher
// 创建文物节点
MERGE (a:Artifact {source_id: 'bd_11399'})
SET a.name = '商陶盘',
    a.era = '商',
    a.category = '陶器'

// 创建朝代节点并关联
MERGE (d:Dynasty {name: '商'})
SET d.startYear = -1600, d.endYear = -1046
MERGE (a)-[:BELONGS_TO_DYNASTY]->(d)

// 创建收藏地节点并关联
MERGE (l:Location {name: '三星堆博物馆', type: 'museum'})
MERGE (a)-[:STORED_AT]->(l)

// 创建类别节点并关联
MERGE (c:Category {name: '陶器'})
MERGE (a)-[:BELONGS_TO_CATEGORY]->(c)
```

---

## 增量更新策略

### 检测更新

1. **定时任务**：每周运行一次全量对比
2. **字段对比**：比较 `upload_date` 和已录入数据
3. **哈希对比**：计算内容哈希，检测变更

### 更新流程

```
检测到更新
    │
    ▼
┌─────────────┐
│ 下载新数据  │
└─────────────┘
    │
    ▼
┌─────────────┐
│ 质量评估    │
└─────────────┘
    │
    ├── 质量合格 ──▶ 更新数据库
    │
    └── 质量不合格 ──▶ 人工审核队列
```

---

## 爬虫运行规范

### 频率限制

| 操作 | 频率 | 说明 |
|------|------|------|
| 博物馆列表 | 1次/天 | 变化较少 |
| 文物列表 | 1次/周 | 按博物馆分批 |
| 文物详情 | 2次/秒 | 避免触发反爬 |
| 图片下载 | 5次/秒 | 控制带宽 |

### 错误处理

```python
# 重试策略
retry_strategy = {
    'max_attempts': 3,
    'backoff_factor': 2,
    'status_forcelist': [429, 500, 502, 503, 504]
}

# 常见错误处理
error_handlers = {
    'HTTP 429': '暂停 60 秒后继续',
    'HTTP 404': '标记为已删除，跳过',
    'Timeout': '重试 3 次后标记失败',
    'ParseError': '记录日志，人工处理'
}
```

### 存储结构

```
data/crawler/
├── museums.json              # 博物馆列表
├── artifacts_by_museum/      # 每馆文物列表
│   ├── artifacts_三星堆博物馆.json
│   ├── artifacts_故宫博物院.json
│   └── ...
├── entries/                  # 文物详情页
│   ├── bd_11399_商陶盘.json
│   ├── bd_11400_商陶小平底罐.json
│   └── ...
├── images/                   # 下载的图片
│   ├── bd_11399_01.jpg
│   └── ...
└── logs/                     # 爬取日志
    ├── crawl_2026-02-01.log
    └── ...
```

---

## 实施计划

### Phase 1：基础设施（1-2 周）
- [ ] 完善爬虫代码，增加错误处理和重试机制
- [ ] 搭建数据清洗流水线
- [ ] 实现字段标准化规则

### Phase 2：数据爬取（2-3 周）
- [ ] 爬取 Top 50 博物馆数据
- [ ] 质量评估和人工抽检
- [ ] 处理异常数据

### Phase 3：数据入库（1 周）
- [ ] 开发数据入库脚本
- [ ] MySQL 数据导入
- [ ] Neo4j 知识图谱构建

### Phase 4：增量更新（1 周）
- [ ] 实现增量更新检测
- [ ] 配置定时任务
- [ ] 监控和告警

---

## 数据量预估

| 指标 | 预估数量 |
|------|----------|
| 博物馆数量 | 500+ |
| 文物数量 | 50,000+ |
| 平均每个文物图片 | 3-5 张 |
| 预计图片总量 | 200,000+ |
| 存储空间（原图） | ~500GB |
| 存储空间（缩略图） | ~50GB |
