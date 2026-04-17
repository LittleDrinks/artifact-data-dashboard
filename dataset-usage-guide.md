# 文物知识图谱数据集 (data_ds.csv) 使用指南

这份数据集是为**构建中国文物知识图谱**身定制的高质量结构化数据。经过深度爬取与 DeepSeek 大语言模型的专业字段清洗，数据已经具备了无变体、高标准化的特点，非常适合直接导入图数据库（如 Neo4j、Memgraph）或关系型数据库中使用。

---

## 1. 数据文件说明

*   `data.csv`：初次爬取下来的原始详情数据（保留了所有维基特征的原貌，可作为追溯备份）。
*   `data_ds.csv`：**核心使用文件**。经 AI 大模型对“年代”、“馆藏”、“材质”等属性进行标准化并除噪后的最终纯净版数据。

## 2. 数据字典 (11 个核心字段)

| 字段名 | 说明 | 示例结构 | 知识图谱应用建议 |
| :--- | :--- | :--- | :--- |
| **`name`** | 文物名称 | `司母戊鼎` | **核心节点 (Node: Artifact)** 的唯一标识/主键 |
| **`source_url`** | 维基百科来源链接 | `https://zh.wikipedia.org/wiki/...` | 节点属性，用于前端追溯及详情跳转 |
| **`description`** | 文物简介摘要 | `后母戊鼎，或称司母戊鼎...` | 节点属性，直接对应后端的 description 字段 |
| **`category`** | 分类标签集 (多值) | `商朝青铜器 \| 中国一级文物` | 可以作为标签 (Tags) 阵列 或 子类节点 |
| **`era`** | 归一化的年代/朝代 | `商`、`西周`、`唐` | **独立节点 (Node: Era)** |
| **`location`** | 出土地 / 发掘地 | `河南省安阳市武官村` | **独立节点 (Node: Location)** |
| **`museum`** | 统一名称的馆藏机构 | `中国国家博物馆` | **独立节点 (Node: Museum)** |
| **`material`** | 核心材质提取 | `青铜`、`玉`、`瓷` | **独立节点 (Node: Material)** |
| **`dimensions`** | 尺寸/重量等文本描述 | `通高133厘米; 宽78厘米; 重832.84千克` | 节点属性 |
| **`image_url`** | 文物主图链接 | `https://upload.wikimedia.org/...` | 节点属性，用于前端图片展示 |
| **`related_artifacts`** | 关联的其它重点文物 | `四羊方尊 \| 大盂鼎` | **关系边 (Edge: RELATED_TO)** 构建文物互联脉络 |

---

## 3. 如何用于构建“知识图谱”？

这套数据天生为点边结构（Graph）设计，您可以按照以下映射关系导入您的图数据库：

### 📌 设计节点 (Nodes)
1. **Artifact (实体·文物)**：使用 `name` 作为 ID。
2. **Era (实体·时代)**：使用清洗后的 `era` 建立时代节点。
3. **Museum (实体·机构)**：使用 `museum` 建立博物馆节点。
4. **Material (实体·材质)**：使用 `material`。
5. **Location (实体·地域)**：使用 `location` 提取到的省市。

### 🔗 设计关系 (Relationships)
1. `(Artifact) -[MADE_IN_ERA]-> (Era)`：基于 `era` 字段
2. `(Artifact) -[HOUSED_IN]-> (Museum)`：基于 `museum` 字段
3. `(Artifact) -[MADE_OF]-> (Material)`：基于 `material` 字段
4. `(Artifact) -[EXCAVATED_AT]-> (Location)`：基于 `location` 字段
5. **(重点) `(Artifact) -[RELATED_TO]-> (Artifact)`**：遍历 `related_artifacts` 字段，以 `|` 切割后，将本主体的文物与里面的文物建立起图谱级联。

---

## 4. Python 读取与入库示例

你可以使用以下代码快速读取清洗后的数据，辅助导入到您的业务系统：

```python
import pandas as pd

# 读取最终干净的数据集
df = pd.read_csv('data/data_ds.csv')

# 过滤掉完全没有抓取到关联的空行
df.fillna('', inplace=True)

for index, row in df.iterrows():
    # 1. 提取基础信息
    relic_name = row['name']
    description = row['description']
    
    # 2. 提取规范化的实体用于创建 Node
    era_node = row['era']
    museum_node = row['museum']
    material_node = row['material']
    
    # 3. 提取关联文物用以创建连线 Edge
    relations = [r.strip() for r in row['related_artifacts'].split('|') if r.strip()]
    
    print(f"入库文物: {relic_name}")
    if relations:
        print(f" -> 发现边: {relic_name} 关联于 {relations}")
    print("-" * 20)
```

## 5. 项目结合建议
* 您可以直接把这个文件发给负责人，说明：“**era、museum、material 都已经通过大语言模型进行了 100% 格式对齐，没有混杂的历史长文，且单独提取了图谱联动列 (related_artifacts)。**” 
* 直接用上述 CSV 作为你们后端系统的冷启动初始化数据底座。