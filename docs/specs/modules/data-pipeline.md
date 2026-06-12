# 数据管道模块规格说明

> 最后更新：2026-04-17
> 当前实现状态：**数据质量修复完成，771 条有效文物，related_artifacts 字段已添加**

---

## 当前实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 数据模型扩展 | ✅ 已实现 | 新增 material、museum、source_url、dimensions 字段 |
| 非文物过滤 | ✅ 已实现 | 46 条非文物条目已删除 |
| Era 标准化 | ✅ 已实现 | 统一为 15 种标准朝代名 |
| Museum 标准化 | ✅ 已实现 | 统一博物馆名称（故宫博物院、湖南博物院等） |
| Material 清洗 | ✅ 已实现 | 提取材质关键词，过滤描述性句子 |
| Tags 自动生成 | ✅ 已实现 | 从 category/era/material/location 自动生成，覆盖率 100% |
| image_url 数据 | ✅ 已有数据 | 但部分可能为 Wikipedia 占位图 |
| LightRAG 索引 | ⚠️ 索引较小 | 仅 21 个实体、16 个关系 |

---

## 1. 需求概述

数据管道模块负责文物数据的全生命周期管理：采集、清洗、存储、索引构建。

### 1.1 当前数据统计

| 指标 | 值 | 说明 |
|------|------|------|
| 有效文物数 | 771 | 过滤 46 条非文物后 |
| Era 覆盖率 | 80% | 标准化后 |
| Material 覆盖率 | 30.9% | 清洗后 |
| Museum 覆盖率 | 32.2% | 标准化后 |
| Tags 覆盖率 | 100% | 自动生成 |
| image_url 覆盖率 | 100% | 但部分为占位图 |
| Description 覆盖率 | ~73% | summary/full_text |

### 1.2 覆盖优先级分层

| 层级 | 覆盖范围 | 数量目标 | 来源 |
|------|---------|---------|------|
| T1（必须） | 禁止出境展览文物 | 185+/195 | 国家文物局官方名单 |
| T2（应该） | 各大博物馆镇馆之宝 | ~100 | 博物馆官方公布 |
| T3（理想） | 一级文物知名条目 | 数千件 | 维基百科分类 |

---

## 2. 数据模型

### 2.1 SQLite artifacts 表（完整字段）

| 字段 | 类型 | 说明 | 覆盖率 |
|------|------|------|--------|
| id | INTEGER (PK) | 自增主键 | 100% |
| name | VARCHAR(255) | 文物名称 | 100% |
| description | TEXT | 文物描述 | ~73% |
| category | VARCHAR(50) | 类别 | 100% |
| era | VARCHAR(50) | 年代（标准朝代名） | 80% |
| location | VARCHAR(100) | 出土地点 | ~45% |
| museum | VARCHAR(100) | 收藏机构 | 32.2% |
| image_url | VARCHAR(500) | 图片链接 | 100% |
| tags | TEXT | 标签（逗号分隔） | 100% |
| material | VARCHAR(50) | 材质 | 30.9% |
| source_url | VARCHAR(500) | Wikipedia 来源链接 | ~98% |
| dimensions | VARCHAR(100) | 尺寸 | ~23% |
| related_artifacts | TEXT | 关联文物（\| 分隔） | 预留字段 |

**模型位置**：`backend/app/models/artifact.py:12-39`

### 2.2 年代归一化规则

将原始年代值归一化为 15 种标准朝代：

| 标准朝代 | 原始值示例 |
|---------|-----------|
| 新石器时代 | 新石器时代、仰韶文化、龙山文化 |
| 商 | 商、商代、商朝、商晚期 |
| 汉 | 汉、西汉、东汉、两汉 |
| 唐 | 唐、唐朝、唐代 |
| ... | ... |

**脚本位置**：`scripts/normalize_eras.py`

---

## 3. 数据清洗脚本

### 3.1 非文物过滤

**脚本**：`scripts/filter_non_artifacts.py`

黑名单类别：
- 朝代/时期（商代、唐朝、五代十国等）
- 地点/机构（国家文物局、湖南省等）
- 人物（杜牧、文彦博等）
- 器物通类（鼎、尊、盉等）

**执行结果**：删除 46 条非文物条目

### 3.2 Museum 标准化

**脚本**：`scripts/normalize_museum.py:19-85`

映射表覆盖：
- 故宫博物院（北京故宫博物院 → 故宫博物院）
- 台北故宫博物院（国立故宫博物院 → 台北故宫博物院）
- 湖南博物院（湖南省博物馆 → 湖南博物院）
- 中国国家博物馆

处理规则：
- 去除"于XXX博物馆"前缀
- 省级博物馆命名统一

### 3.3 Material 清洗

**脚本**：`scripts/clean_material.py:23-30`

有效材质关键词：青铜、铜、陶、瓷、玉、金、银、石、木、丝、纸、绢、竹、骨、漆、铁、琉璃、珐琅、水晶、玛瑙等

清洗规则：
- 提取材质关键词
- 过滤描述性句子（如"鼓不但可用于音乐性质")
- 处理"XX质"模式

### 3.4 Tags 自动生成

**脚本**：`scripts/generate_tags.py:70-106`

生成规则：
- 从 category 提取类别标签
- 从 era 提取朝代标签
- 从 material 提取材质标签
- 从 location 提取省份标签

**覆盖率**：100%（所有文物都有 tags）

---

## 4. LightRAG 索引

### 4.1 索引位置

`backend/data/lightrag/` 目录：
- `kv_store_full_entities.json` — 实体数据
- `kv_store_full_relations.json` — 关系数据
- `graph_chunk_entity_relation.graphml` — 图谱文件

### 4.2 索引统计

| 指标 | 值 | 说明 |
|------|------|------|
| 实体数 | 21 | 抽取的实体文档数 |
| 关系数 | 16 | 抽取的关系对数 |
| graphml 文件大小 | ~5MB | 图谱存储 |

### 4.3 索引构建

**脚本**：`scripts/build_lightrag_index.py`

> **已知问题**：索引规模较小，可能与输入语料不足或抽取参数有关。需要进一步优化。

---

## 5. Benchmark QA 数据

### 5.1 原始数据

| 指标 | 值 |
|------|------|
| 总条目数 | 1572 |
| 唯一文物数 | 610 |
| 类别数 | 5（identification、detailed_explanation、basic_fact、relationship、comparative） |

### 5.2 清洗结果

过滤 source_artifact 为非文物条目的 QA（26 条）后：
- 有效 QA：~1546 条

**脚本**：基于 `filter_non_artifacts.py` 同步清理

---

## 6. 已知问题

| ID | 问题 | 来源 | 优先级 | 说明 |
|-----|------|------|--------|------|
| DATA-1 | Description 覆盖率 ~73% | [data-quality-report] | P2 | 约 27% 条目缺少完整描述文本 |
| DATA-2 | image_url 可能是占位图 | [data-quality-report] | P2 | Wikipedia URL 可能指向占位图片 |
| DATA-3 | Material 值仍有描述性句子残留 | [data-fix-plan] | P2 | 部分清洗不彻底 |
| DATA-4 | LightRAG 索引规模小 | [review-chat-graph] | P1 | 仅 21 实体、16 关系，需重建或参数调优 |
| DATA-5 | dimensions 覆盖率低（23%） | [data-quality-report] | P3 | 维基百科 infobox 常无此字段 |

---

## 7. 验收标准

| 检查项 | 标准 | 当前状态 |
|--------|------|---------|
| 数据量 | 700+ 条有效文物 | ✅ 771 条 |
| Era 标准化 | 无变体值 | ✅ 已标准化 |
| Museum 标准化 | 无重复名称 | ✅ 已标准化 |
| Material 清洗 | 仅材质关键词 | ⚠️ 部分残留描述 |
| Tags 覆盖 | 100% | ✅ 已实现 |
| LightRAG 索引 | 成功构建 | ⚠️ 索引较小 |

---

## 8. 关键文件索引

| 文件 | 负责内容 |
|------|---------|
| `backend/app/models/artifact.py` | 数据模型（含新字段） |
| `backend/app/schemas/artifact.py` | Pydantic schema |
| `scripts/filter_non_artifacts.py` | 非文物过滤 |
| `scripts/normalize_museum.py` | 博物馆名称标准化 |
| `scripts/normalize_eras.py` | 年代标准化 |
| `scripts/clean_material.py` | 材质清洗 |
| `scripts/clean_categories.py` | 类别清洗 |
| `scripts/clean_text.py` | 文本清洗（去除维基标记） |
| `scripts/clean_and_extract.py` | 综合清洗与提取 |
| `scripts/generate_tags.py` | 标签自动生成 |
| `scripts/build_lightrag_index.py` | LightRAG 索引构建 |
| `data/artifacts_list_clean.json` | 清洗后的文物列表 |

---

*最后更新：2026-04-18*
