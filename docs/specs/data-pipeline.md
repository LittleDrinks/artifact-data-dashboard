# 数据管道模块规格说明

> 参考：`docs/PRD.md` §3.2 文物数据管理、§3.5 仪表盘
> 相关 ADR：ADR-003 (LightRAG + LangChain Agent)、ADR-004 (维基百科 + Wikidata 数据源)

---

## 1. 需求概述

数据管道模块负责文物数据的全生命周期管理：采集、清洗、存储、索引构建。

### 1.1 业务需求

| 需求 | 描述 | 优先级 |
|------|------|--------|
| 数据采集 | 从维基百科 + Wikidata 获取文物数据 | P0 |
| 数据清洗 | 年代归一化、去重、去除非文物条目 | P0 |
| 数据存储 | SQLite 存储结构化数据，Neo4j 存储图谱数据 | P0 |
| 索引构建 | LightRAG 语义索引（向量 + 图谱） | P0 |
| 覆盖率目标 | 禁止出境展览文物 ≥95%（185+/195） | P1 |

### 1.2 覆盖优先级分层

| 层级 | 覆盖范围 | 数量目标 | 来源 |
|------|---------|---------|------|
| T1（必须） | 禁止出境展览文物 | 195件，覆盖率≥95% | 国家文物局官方名单 |
| T2（应该） | 各大博物馆镇馆之宝 | ~100件 | 博物馆官方公布 |
| T3（理想） | 一级文物知名条目 | 数千件 | 维基百科分类 |
| T4（后续） | 二三级文物 | 百万级 | 专业数据库（暂不涉及） |

---

## 2. 数据模型

### 2.1 SQLite artifacts 表

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| id | INTEGER (PK) | 自增主键 | 自动 |
| name | VARCHAR(255) | 文物名称 | ✓ |
| description | TEXT | 文物描述（≥200字） | ✓ |
| category | VARCHAR(50) | 类别 | |
| era | VARCHAR(50) | 年代（标准朝代名） | |
| location | VARCHAR(100) | 出土地点 | |
| museum | VARCHAR(100) | 收藏机构 | |
| image_url | VARCHAR(255) | 图片链接 | |
| tags | TEXT | 标签（逗号分隔） | |
| full_text | TEXT | 完整正文（LightRAG 输入） | |
| node_type | VARCHAR(20) | 节点类型：artifact/dynasty/museum | 默认 artifact |
| properties_json | JSON | 类型专属属性 | 可选 |

### 2.2 年代归一化规则

将 76 种原始年代值归一化为 15 种标准朝代：

| 标准朝代 | 原始值示例 |
|---------|-----------|
| 新石器时代 | 新石器时代、仰韶文化、龙山文化、良渚文化 |
| 夏 | 夏、夏朝 |
| 商 | 商、商代、商朝、商晚期 |
| 西周 | 西周、西周早期 |
| 东周 | 东周、春秋、战国 |
| 秦 | 秦、秦朝 |
| 汉 | 汉、西汉、东汉、两汉 |
| 三国 | 三国、曹魏、蜀汉、东吴 |
| 南北朝 | 南北朝、北魏、南朝 |
| 唐 | 唐、唐朝、唐代 |
| 五代 | 五代、五代十国 |
| 宋 | 宋、北宋、南宋 |
| 元 | 元、元朝 |
| 明 | 明、明朝 |
| 清 | 清、清朝、清代 |

---

## 3. 数据采集策略

### 3.1 数据源

| 数据源 | 获取方式 | 内容 |
|--------|---------|------|
| 维基百科 | MediaWiki API + BeautifulSoup | 文物列表 + 详细描述 |
| Wikidata | SPARQLWrapper | 结构化属性（三元组） |
| 故宫数字文物库 | Selenium（动态加载） | 官方图片和分类 |

### 3.2 维基百科分类爬取优先级

```
Priority 1: 禁止出境展览文物（三批）
Priority 2: 各博物馆镇馆之宝（国博、故宫、湖北、陕西、湖南）
Priority 3: 中国青铜器、中国陶瓷、中国玉器分类
Priority 4: 书法家、画家分类（书画作品）
Priority 5: 秦始皇陵、唐三彩、中国古代科学仪器分类
```

### 3.3 知识抽取方案

使用 Qwen2.5-7B（通过 Ollama 本地部署或 DeepSeek API）从 infobox + 正文提取结构化字段：

**抽取字段**：era、location、museum、material、dimensions、tags

**准确率目标**：F1 ≥ 0.85（需抽样 30-50 条实测验证）

---

## 4. LightRAG 索引构建

### 4.1 输入语料要求

- 文本长度：≥200 字（短文本抽不出有意义的关系）
- 文本干净：无维基引用标记 `[1]`、无 HTML 标签
- 覆盖全面：1000-1500 条有效文物

### 4.2 索引配置

```python
# backend/app/ai/lightrag_service.py
LightRAG(
    working_dir="data/lightrag_storage",
    llm_model_func=lambda prompt: call_deepseek_api(prompt),  # 或 Ollama
    graph_storage="Neo4JStorage",  # 共用 Neo4j 实例
    kv_storage="JsonKVStorage",
    vector_storage="NanoVectorDBStorage"
)
```

### 4.3 索引构建流程

```
Phase 1: 语料准备
   ├── 合并 name + description + full_text
   ├── 清除维基标记、HTML 标签
   └── 过滤 <200 字的条目

Phase 2: LightRAG 抽取
   ├── 对每条文物调用 LightRAG.insert(text)
   ├── 自动抽取实体 + 关系
   └── 存储到 Neo4j（graph_storage）

Phase 3: 验证
   ├── 人工抽样 50 条三元组
   ├── 评估准确性和完整性
   └── 调整 LightRAG 参数（chunk_size, entity_types）
```

---

## 5. API 接口

### 5.1 数据导入 API

| 端点 | 方法 | 说明 |
|------|------|------|
| /api/admin/import | POST | 导入 JSON 数据到 SQLite |
| /api/admin/build-index | POST | 构建 LightRAG 索引 |

### 5.2 导入脚本

```bash
# scripts/import_artifacts.py
python scripts/import_artifacts.py --source data/artifacts_list.json
python scripts/import_artifacts.py --detail-dir data/artifacts_detail/
```

---

## 6. 验收标准

| 检查项 | 标准 | 验证方法 |
|--------|------|---------|
| 数据量 | 1000-1500 条有效文物 | `SELECT COUNT(*) FROM artifacts WHERE node_type='artifact'` |
| T1 覆盖率 | ≥95%（185+/195） | 对照官方名单逐条检查 |
| 文本质量 | ≥90% 有 ≥200 字描述 | 统计 `LENGTH(description)` |
| 年代完整性 | ≥70% 有标准朝代值 | 统计 `era IS NOT NULL` 比例 |
| 地点完整性 | ≥50% 有出土地点 | 统计 `location IS NOT NULL` 比例 |
| LightRAG 索引 | 成功构建，三元组 ≥1000 | 查 Neo4j 关系数量 |

---

## 7. 踩坑记录

参考 `docs/pitfalls.md`。

---

*最后更新：2026-04-14*