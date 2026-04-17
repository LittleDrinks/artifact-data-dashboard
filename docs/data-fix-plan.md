# 数据质量修复计划

**创建日期**: 2026-04-16
**基于报告**: docs/data-quality-report.md
**目标**: 修复 P1 问题 + 关键 P2 问题，提升数据质量评分至 A 级

---

## 修复总览

### 必须修复（P1 全部）

| # | 问题 | 影响范围 | 预估工作量 |
|---|------|---------|-----------|
| 1 | 46 条非文物条目混入 | 数据库 5.6% 条目无效 | 中 |
| 2 | 6 个数据字段无模型映射（material, museum, url 等） | 导入时丢失数据 | 中 |
| 3 | 8 条文物缺少详情文件（繁体字问题） | 知识抽取不完整 | 低 |
| 4 | 26 条 QA 关于非文物条目 | AI 评估不准确 | 低 |

### 建议修复（关键 P2）

| # | 问题 | 影响范围 | 预估工作量 |
|---|------|---------|-----------|
| 5 | Era 值不一致 | 统计和筛选不准 | 低（已有脚本） |
| 6 | Museum 值不一致 | 按博物馆统计不准 | 低 |
| 7 | Material 值含描述性句子 | 数据不干净 | 低 |
| 8 | image_url 字段无数据 | 前端无法显示图片 | 中 |
| 9 | tags 字段无数据 | 标签筛选功能不可用 | 低 |

---

## 修复任务

### 任务 1: 过滤非文物条目

- **问题来源**: P1#1 — 46 条非文物条目混入
- **涉及文件**:
  - `scripts/filter_non_artifacts.py`（新建）
  - `data/non_artifact_blacklist.json`（新建）
  - `backend/app/services/artifact.py`（可选：添加查询过滤）
- **具体方案**:

  1. **建立黑名单**：创建 `data/non_artifact_blacklist.json`，包含以下类别：
     - 朝代/时期：商代、商朝、西周、战国、战国时期、秦朝、汉朝、西汉、东汉、曹魏、晋朝、三国、南朝 (中国朝代)、南北朝、唐朝、西夏、元朝、明朝、隋朝、五代十国、宋朝、夏朝、新石器时代
     - 地点/机构：中华人民共和国、国家文物局、湖南省、宁乡县、中国国家博物馆、中国青铜器、中国文物学会、破四旧、如果国宝会说话
     - 人物：杜牧、黄筌、文彦博、马和之
     - 器物通类：鼎、尊、盉、觥、觯、斝、卣、钫 (器皿)、豆 (器皿)、中国青铜器

  2. **创建过滤脚本**：
     ```python
     # scripts/filter_non_artifacts.py
     # 功能：
     # - 从 artifacts_list.json 中过滤黑名单条目，生成 artifacts_list_clean.json
     # - 更新数据库：删除黑名单中的条目（需要 admin 权限）
     # - 生成过滤报告
     ```

  3. **更新 benchmark QA**：同步删除 source_artifact 为黑名单条目的 QA（见任务 4）

- **验收标准**:
  - `data/artifacts_list_clean.json` 不包含任何黑名单条目
  - 数据库中非文物条目已删除或标记 `is_artifact=false`
  - 过滤报告显示删除条目数 = 46

- **风险点**:
  - 需确认黑名单完整，遗漏会导致问题持续存在
  - 数据库删除需谨慎，建议先标记再批量删除

---

### 任务 2: 扩展后端数据模型

- **问题来源**: P1#2 — 6 个数据字段无模型映射
- **涉及文件**:
  - `backend/app/models/artifact.py`
  - `backend/app/schemas/artifact.py`
  - `backend/app/database.py`（添加索引）
  - `frontend/src/api/artifacts.ts`
  - `frontend/src/pages/ArtifactDetail.tsx`
  - `frontend/src/pages/Artifacts.tsx`（可选：添加筛选）
  - `scripts/import_and_fill.py`（更新导入逻辑）
- **具体方案**:

  1. **后端模型扩展**（Artifact 模型）：
     ```python
     # 新增字段
     material: Mapped[Optional[str]] = mapped_column(String(50), index=True)  # 材质
     museum: Mapped[Optional[str]] = mapped_column(String(100), index=True)   # 馆藏
     source_url: Mapped[Optional[str]] = mapped_column(String(500))           # Wikipedia 来源链接
     dimensions: Mapped[Optional[str]] = mapped_column(String(100))           # 尺寸
     ```
     - 注：SQLite ALTER TABLE 不支持 ADD COLUMN with NOT NULL，所有新字段必须 Optional
     - 使用 `alembic` 或手动 SQL 执行迁移

  2. **Schema 更新**：
     - `ArtifactBase`、`ArtifactCreate`、`ArtifactUpdate`、`ArtifactResponse` 都需添加对应字段
     - `ArtifactFormData`（前端）也需同步

  3. **前端显示更新**：
     - `ArtifactDetail.tsx`：在基本信息卡片中添加"材质"、"馆藏"字段显示
     - `Artifacts.tsx`：可选添加"馆藏"筛选器（类似现有的年代/类别筛选）

  4. **数据导入更新**：
     - 修改 `scripts/import_and_fill.py`，导入时填充 material, museum, source_url, dimensions
     - 添加数据库迁移逻辑（检测字段是否存在，不存在则添加）

- **验收标准**:
  - 数据库 artifacts 表包含 material, museum, source_url, dimensions 字段
  - 前端详情页能正确显示材质和馆藏信息
  - API `/api/artifacts/:id` 返回新字段

- **风险点**:
  - SQLite ALTER TABLE 限制：不能添加有 NOT NULL 约束的列
  - 前后端需同步更新，否则 API 返回字段前端无法显示
  - 数据库迁移需在生产环境测试

---

### 任务 3: 补充缺失的详情文件

- **问题来源**: P1#3 — 8 条文物缺少详情文件（繁体字问题）
- **涉及文件**:
  - `scripts/fix_detail_filenames.py`（新建）
  - `data/artifacts_detail/`（文件重命名/补充）
- **缺失的文物**:
  景雲鐘、鑄客銅鼎、竹林的賢與榮啟期、清明上河圖、五牛圖、伯遠帖、張好好詩、趙佶草書千字文

- **具体方案**:

  1. **创建修复脚本**：
     ```python
     # scripts/fix_detail_filenames.py
     # 功能：
     # - 扫描 artifacts_detail/ 目录，检测繁体字文件名
     # - 建立繁体→简体映射（使用 opencc 或手动映射）
     # - 重命名文件为简体名（如：景雲鐘.json → 景云钟.json）
     # - 或补充缺失的详情文件（从 Wikipedia 重新爬取）
     ```

  2. **具体映射**：
     - 景雲鐘 → 景云钟
     - 鑄客銅鼎 → 铸客铜鼎
     - 竹林的賢與榮啟期 → 竹林七贤与荣启期
     - 清明上河圖 → 清明上河图
     - 五牛圖 → 五牛图
     - 伯遠帖 → 伯远帖
     - 張好好詩 → 张好好诗
     - 趙佶草書千字文 → 赵佶草书千字文

  3. **验证详情文件存在**：确认重命名后 8 条文物都有对应的详情文件

- **验收标准**:
  - 8 条文物在 `data/artifacts_detail/` 目录下都有简体名详情文件
  - 详情文件内容非空（至少有 name 字段）

- **风险点**:
  - 文件系统编码问题，需确保 UTF-8 处理正确
  - 如果原文件确实不存在，需要重新爬取 Wikipedia

---

### 任务 4: 清理非文物相关 QA

- **问题来源**: P1#4 — 26 条 QA 关于非文物条目
- **涉及文件**:
  - `data/benchmark_qa.json`
  - `scripts/filter_benchmark_qa.py`（新建或扩展现有脚本）
- **具体方案**:

  1. **识别问题 QA**：
     - source_artifact 为黑名单条目的 QA（共 26 条）
     - 主要包括：五代十国、南北朝、南朝 (中国朝代)、文彦博 等

  2. **处理策略**：
     - 方案 A：直接删除这些 QA（推荐，简单直接）
     - 方案 B：重新生成问题（针对正确文物重新提问）
     - 建议：先删除，后续如有需要再补充

  3. **创建清理脚本**：
     ```python
     # scripts/filter_benchmark_qa.py
     # 功能：
     # - 加载黑名单
     # - 过滤 benchmark_qa.json 中 source_artifact 在黑名单中的条目
     # - 生成 benchmark_qa_clean.json
     # - 更新原文件或生成备份
     ```

- **验收标准**:
  - `data/benchmark_qa.json` 不包含 source_artifact 为非文物条目的 QA
  - QA 总数减少约 26 条（1572 → 1546）

- **风险点**:
  - 删除 QA 可能影响 AI 评估覆盖率
  - 需同步更新 LightRAG 知识库索引（如果 QA 已导入）

---

### 任务 5: Era 标准化（已部分完成）

- **问题来源**: P2#5 — Era 值不一致
- **涉及文件**:
  - `scripts/normalize_eras.py`（已存在，需验证运行结果）
  - `backend/app/models/artifact.py`（模型已有 era 字段）
- **现状**: 已有完整的标准化脚本，包含映射表和 GLM 辅助

- **具体方案**:

  1. **运行现有脚本**：
     ```bash
     cd E:/shared/workplace/ADD_new
     backend/.venv/Scripts/python scripts/normalize_eras.py
     ```

  2. **验证结果**：
     - 检查数据库 era 字段分布
     - 确认无"唐朝"、"唐代"、"商朝"等变体，统一为"唐"、"商"

  3. **如有遗漏**：
     - 扩展 `ERA_MAPPING` 映射表
     - 重新运行脚本

- **验收标准**:
  - 数据库 era 字段仅包含标准朝代名（见 STANDARD_DYNASTIES 列表）
  - 无变体值如"唐朝"、"唐代"、"商朝"等
  - Era 覆盖率提升（目标 60%+）

- **风险点**:
  - GLM API 可能不稳定，需有重试机制
  - 部分 era 值可能无法标准化（如特殊描述）

---

### 任务 6: Museum 标准化

- **问题来源**: P2#6 — Museum 值不一致
- **涉及文件**:
  - `scripts/normalize_museum.py`（新建）
  - `backend/app/models/artifact.py`（需先添加 museum 字段，见任务 2）
- **具体方案**:

  1. **建立标准化映射表**：
     ```python
     MUSEUM_MAPPING = {
         "故宫博物院": "故宫博物院",
         "北京故宫博物院": "故宫博物院",
         "台北市士林区国立故宫博物院": "台北故宫博物院",
         "国立故宫博物院": "台北故宫博物院",
         "于上海博物馆": "上海博物馆",
         "湖南省博物馆": "湖南博物院",  # 注：2022年改名
         "湖南博物院": "湖南博物院",
         "中国国家博物馆": "中国国家博物馆",
         # ... 更多映射
     }
     ```

  2. **创建标准化脚本**：
     ```python
     # scripts/normalize_museum.py
     # 功能：
     # - 从 artifacts_detail 中提取所有 museum 值
     # - 应用映射表标准化
     # - 更新数据库/详情文件
     ```

  3. **导入时标准化**：更新导入脚本，导入 museum 时自动标准化

- **验收标准**:
  - 数据库 museum 字段值一致（无"北京故宫博物院"与"故宫博物院"并存）
  - Museum 统计接口返回一致的博物馆名

- **风险点**:
  - 博物馆改名历史（如湖南博物馆→湖南博物院）需确定统一名称
  - 需等任务 2 完成（museum 字段添加）才能执行

---

### 任务 7: Material 清洗

- **问题来源**: P2#7 — Material 值含描述性句子
- **涉及文件**:
  - `scripts/clean_material.py`（新建或扩展 clean_and_extract.py）
  - `data/artifacts_detail/*.json`
- **问题示例**:
  - "鼓不但可用于音乐性质" → 应为空或具体材质
  - "大玉戈是商前期的玉质" → 应为 "玉"
  - "文信圜钱采用石质" → 应为 "石"

- **具体方案**:

  1. **建立材质关键词表**（参考 clean_and_extract.py 的 MATERIAL_KEYWORDS）：
     ```python
     VALID_MATERIALS = [
         '青铜', '铜', '陶', '瓷', '玉', '金', '银', '石', '木', '丝',
         '纸', '绢', '竹', '骨', '漆', '铁', '锡', '铅', '琉璃', '珐琅',
         '水晶', '玛瑙', '琥珀', '翡翠', '珊瑚', '象牙', '犀角', '玳瑁',
     ]
     ```

  2. **清洗规则**：
     - 如果 material 值包含有效材质关键词 → 提取关键词
     - 如果 material 值为描述性句子且不含关键词 → 清空
     - 如果 material 值长度 > 8 且不含关键词 → 截断或清空

  3. **创建清洗脚本**：
     ```python
     # scripts/clean_material.py
     # 功能：
     # - 扫描 artifacts_detail/*.json
     # - 对每个 material 字段应用清洗规则
     # - 更新文件
     # - 生成清洗报告
     ```

- **验收标准**:
  - 所有 material 字段值 ≤ 6 字符或为空
  - 无描述性句子作为材质值
  - Material 覆盖率保持不变（清洗不应丢失有效数据）

- **风险点**:
  - 过度清洗可能丢失有效材质信息
  - 需人工检查清洗结果（抽样验证）

---

### 任务 8: 补充 image_url 数据

- **问题来源**: P2#8 — image_url 字段无数据
- **涉及文件**:
  - `scripts/fetch_images.py`（新建）
  - `data/artifact_images/`（新建目录，存放图片）
  - `backend/app/routers/artifacts.py`（可选：添加图片上传接口）
  - `frontend/src/pages/ArtifactDetail.tsx`（已有图片显示，需数据）
- **现状**: 数据库有 image_url 字段，但无数据

- **具体方案**:

  1. **数据来源分析**：
     - Wikipedia 页面通常有文物图片，可从 Wikipedia API 获取
     - 或使用占位图（placeholder）先展示
     - 建议：先对重点文物（禁止出境展览文物）获取真实图片

  2. **创建图片获取脚本**：
     ```python
     # scripts/fetch_images.py
     # 功能：
     # - 遍历 artifacts_list.json
     # - 对每个文物，从 Wikipedia API 获取主图 URL
     # - 下载图片到 data/artifact_images/
     # - 更新数据库 image_url 字段（指向本地路径或远程 URL）
     ```

  3. **Wikipedia 图片获取逻辑**：
     ```python
     # 使用 Wikipedia API:
     # https://en.wikipedia.org/w/api.php?action=query&titles=PAGE&prop=images
     # 或使用 Wikimedia Commons API
     ```

  4. **备用方案**：使用占位图服务生成"暂无图片"占位

- **验收标准**:
  - 至少 50% 的文物有 image_url 数据
  - 禁止出境展览文物（174 条）优先，覆盖率 80%+
  - 前端详情页能正常显示图片

- **风险点**:
  - Wikipedia 图片可能受版权限制
  - 图片下载可能失败（网络、API限制）
  - 本地存储图片需考虑空间和路径配置

---

### 任务 9: Tags 自动生成

- **问题来源**: P2#9 — tags 字段无数据
- **涉及文件**:
  - `scripts/generate_tags.py`（新建）
  - `backend/app/models/artifact.py`（已有 tags 字段）
  - `frontend/src/pages/Artifacts.tsx`（已有标签筛选，需数据）
- **具体方案**:

  1. **标签生成规则**：
     ```python
     def generate_tags(artifact):
         tags = []
         # 从 category 生成
         if artifact.category:
             tags.append(artifact.category)
         # 从 era 生成（朝代标签）
         if artifact.era:
             tags.append(artifact.era)
         # 从 material 生成（材质标签）
         if artifact.material:
             tags.append(artifact.material)
         # 从 location 提取省份
         if artifact.location:
             # 提取省份名（如"河南省安阳市" → "河南")
             province = extract_province(artifact.location)
             if province:
                 tags.append(province)
         return ','.join(tags)
     ```

  2. **创建生成脚本**：
     ```python
     # scripts/generate_tags.py
     # 功能：
     # - 遍历数据库所有文物
     # - 根据规则生成 tags
     # - 更新数据库
     ```

  3. **导入时生成**：更新导入脚本，导入时自动生成 tags

- **验收标准**:
  - 数据库 tags 字段覆盖率 > 80%
  - 前端标签筛选功能可用
  - 标签值合理（无重复、无过长值）

- **风险点**:
  - 自动生成标签可能不够精确（如 location 提取省份需正则）
  - 需等任务 2（material 字段）完成后效果更好

---

## 执行顺序建议

按依赖关系排序，建议执行顺序：

| 阶段 | 任务 | 说明 |
|------|------|------|
| 1 | 任务 1 + 任务 4 | 先清理非文物条目和 QA，后续操作基于干净数据 |
| 2 | 任务 3 | 补充详情文件，确保数据完整 |
| 3 | 任务 2 | 扩展模型字段（material, museum 等） |
| 4 | 任务 5 + 任务 6 + 任务 7 | 数据标准化（Era/Museum/Material） |
| 5 | 任务 8 + 任务 9 | 补充衍生数据（image_url, tags） |

---

## 数据一致性考虑

### 修改 era/museum 后的影响

1. **统计 API**：`/api/stats/by-era`、`/api/stats/by-location` 结果变化
2. **筛选器**：前端筛选器选项变化（下拉值减少）
3. **QA 数据**：benchmark_qa.json 中的 answer 字段可能需要同步更新（如"唐朝"→"唐"）
   - 建议：QA 数据不修改，答案本身语义正确，只是格式不一致

### SQLite 迁移注意事项

1. ALTER TABLE 不支持：
   - 添加 NOT NULL 列
   - 添加 FOREIGN KEY 约束
   - 修改列类型

2. 解决方案：
   ```python
   # 检测字段是否存在
   def add_column_if_not_exists(conn, table, column, type_spec):
       cursor = conn.execute(f"PRAGMA table_info({table})")
       columns = [row[1] for row in cursor.fetchall()]
       if column not in columns:
           conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {type_spec}")
           conn.commit()
   ```

---

## 验证方案

修复完成后需验证：

1. **数据库验证**：
   ```sql
   -- 检查非文物条目
   SELECT COUNT(*) FROM artifacts WHERE name IN (黑名单);
   -- 应返回 0

   -- 检查 era 标准化
   SELECT era, COUNT(*) FROM artifacts WHERE era IS NOT NULL GROUP BY era ORDER BY era;
   -- 应无变体值

   -- 检查字段覆盖率
   SELECT
       COUNT(*) as total,
       COUNT(era) as era_count,
       COUNT(material) as material_count,
       COUNT(museum) as museum_count,
       COUNT(image_url) as image_count,
       COUNT(tags) as tags_count
   FROM artifacts;
   ```

2. **API 验证**：
   - `/api/artifacts` 列表筛选功能正常
   - `/api/artifacts/:id` 详情包含新字段
   - `/api/stats/by-era` 返回标准化朝代

3. **前端验证**：
   - 文物列表页筛选器选项减少（无变体）
   - 详情页显示材质、馆藏信息
   - 图片正常显示（部分文物）

---

## 附录：黑名单完整列表

```json
[
  "商代", "商朝", "西周", "战国", "战国时期", "秦朝", "汉朝", "西汉", "东汉",
  "曹魏", "晋朝", "三国", "南朝 (中国朝代)", "南北朝", "唐朝", "西夏", "元朝",
  "明朝", "隋朝", "五代十国", "宋朝", "夏朝", "新石器时代",
  "中华人民共和国", "国家文物局", "湖南省", "宁乡县", "中国国家博物馆",
  "中国青铜器", "中国文物学会", "破四旧", "如果国宝会说话",
  "杜牧", "黄筌", "文彦博", "马和之",
  "鼎", "尊", "盉", "觥", "觯", "斝", "卣", "钫 (器皿)", "豆 (器皿)", "中国青铜器"
]
```

---

## 附录：标准朝代列表

```python
STANDARD_DYNASTIES = [
    "夏", "商", "西周", "东周", "春秋", "战国", "秦", "西汉", "东汉",
    "三国", "西晋", "东晋", "南北朝", "北魏", "东魏", "西魏", "北齐",
    "北周", "南朝", "隋", "唐", "五代十国", "北宋", "南宋", "辽", "金",
    "宋", "西夏", "元", "明", "清", "民国", "新石器时代",
]
```

---

## 附录：标准材质列表

```python
VALID_MATERIALS = [
    "青铜", "铜", "陶", "瓷", "玉", "金", "银", "石", "木", "丝",
    "纸", "绢", "竹", "骨", "漆", "铁", "锡", "铅", "琉璃", "珐琅",
    "水晶", "玛瑙", "琥珀", "翡翠", "珊瑚", "象牙", "犀角", "玳瑁",
]
```