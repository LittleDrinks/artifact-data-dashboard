# 数据模型 - 规格说明

## 概述

系统采用**双存储+插件化扩展**架构：

- **MySQL**：结构化关系数据（用户、文物核心属性、插件扩展数据）
- **Neo4j**：图数据（核心知识图谱 + 可选插件图谱）

**插件化设计原则**：
- 核心数据表始终存在
- 扩展数据表按需创建（启用插件时）
- 知识图谱视图根据启用的插件动态切换

---

## MySQL 数据模型

### 核心数据模型（始终启用）

#### 1. 用户表（users）

```sql
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    enabled_plugins JSON,  -- 用户启用的插件列表 ["conservation", "inpainting"]
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### 2. 文物核心表（artifacts）

```sql
CREATE TABLE artifacts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    era VARCHAR(100),           -- 年代（如：唐代、明清）
    category_id BIGINT UNSIGNED,
    material VARCHAR(100),       -- 材质
    dimensions VARCHAR(255),     -- 尺寸
    description TEXT,
    source VARCHAR(255),         -- 来源
    current_location VARCHAR(255), -- 收藏地
    
    -- 扩展标记
    has_conservation_record BOOLEAN DEFAULT FALSE,  -- 是否有保护修复记录
    
    created_by BIGINT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_era (era),
    INDEX idx_category (category_id)
);
```

#### 3. 分类表（categories）

```sql
CREATE TABLE categories (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_id BIGINT UNSIGNED NULL,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);
```

#### 4. 文件夹表（folders）

```sql
CREATE TABLE folders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

#### 5. 附件表（attachments）

```sql
CREATE TABLE attachments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    original_name VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT UNSIGNED,
    mime_type VARCHAR(100),
    
    ref_type VARCHAR(50) NOT NULL,  -- 'artifact' | 'document' | 'conservation_record'
    ref_id BIGINT UNSIGNED NOT NULL,
    
    attachment_type VARCHAR(50),     -- 'original' | 'thumbnail' | 'inpainting_result'
    metadata JSON,                   -- 图片尺寸、修复参数等
    
    created_by BIGINT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_ref (ref_type, ref_id),
    INDEX idx_type (attachment_type),
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

---

### 扩展数据模型（保护修复插件启用时创建）

#### 6. 保护修复记录表（conservation_records）

```sql
CREATE TABLE conservation_records (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    artifact_id BIGINT UNSIGNED NOT NULL,
    
    -- 损害信息
    damage_types JSON,             -- ["裂纹", "锈蚀"]
    damage_description TEXT,
    
    -- 修复信息
    repair_methods JSON,           -- ["清洗", "补配"]
    reinforcement_method VARCHAR(255),
    repair_description TEXT,
    
    -- 检测信息
    detection_techniques JSON,     -- ["X射线", "红外光谱"]
    detection_indicators JSON,     -- ["成分分析", "年代测定"]
    detection_report TEXT,
    
    -- 材料信息
    conservation_materials JSON,   -- ["环氧树脂", "矿物颜料"]
    
    -- 时间信息
    repair_date DATE,
    repairer VARCHAR(255),
    
    -- 图像对比（关联 attachments）
    before_image_id BIGINT UNSIGNED,
    after_image_id BIGINT UNSIGNED,
    
    created_by BIGINT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
    FOREIGN KEY (before_image_id) REFERENCES attachments(id),
    FOREIGN KEY (after_image_id) REFERENCES attachments(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

**触发器**：插入/删除时同步更新 `artifacts.has_conservation_record`

```sql
-- 插入时标记
CREATE TRIGGER trg_conservation_insert
AFTER INSERT ON conservation_records
FOR EACH ROW
UPDATE artifacts SET has_conservation_record = TRUE WHERE id = NEW.artifact_id;

-- 删除时检查是否还有其他记录
CREATE TRIGGER trg_conservation_delete
AFTER DELETE ON conservation_records
FOR EACH ROW
BEGIN
    DECLARE record_count INT;
    SELECT COUNT(*) INTO record_count FROM conservation_records WHERE artifact_id = OLD.artifact_id;
    IF record_count = 0 THEN
        UPDATE artifacts SET has_conservation_record = FALSE WHERE id = OLD.artifact_id;
    END IF;
END;
```

---

### 插件配置表

#### 7. 插件定义表（plugins）

```sql
CREATE TABLE plugins (
    id VARCHAR(50) PRIMARY KEY,     -- 'conservation', 'inpainting', 'statistics'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    version VARCHAR(20),
    required_tables JSON,           -- ["conservation_records"]
    required_graph_nodes JSON,      -- ["DamageType", "RepairMethod"]
    is_core BOOLEAN DEFAULT FALSE,  -- 核心插件不可禁用
    enabled_by_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 初始化数据
INSERT INTO plugins (id, name, description, version, is_core, enabled_by_default) VALUES
('core', '核心系统', '资产管理、知识图谱、AI问答', '1.0.0', TRUE, TRUE),
('conservation', '文物保护修复', '修复记录管理、保护修复知识图谱', '1.0.0', FALSE, FALSE),
('inpainting', '图像修复', 'AI 图像修复、前后对比', '1.0.0', FALSE, FALSE),
('statistics', '统计分析', '词云、图表、数据报表', '1.0.0', FALSE, TRUE);
```

---

## Neo4j 图模型

### 核心图谱（本体视图）- 始终启用

**节点标签**：

| Label | 属性 | 说明 |
|-------|------|------|
| `Artifact` | id, name, era, material, category | 文物 |
| `Person` | id, name, role, dynasty | 人物（艺术家、收藏家） |
| `Location` | id, name, type, city | 地点（博物馆、遗址） |
| `Dynasty` | id, name, startYear, endYear | 朝代 |
| `Category` | id, name, parentCategory | 类别 |

**关系类型**：

| 关系 | 方向 | 含义 |
|------|------|------|
| `CREATED_BY` | Artifact → Person | 创作于 |
| `COLLECTED_BY` | Artifact → Person | 收藏于（收藏家） |
| `STORED_AT` | Artifact → Location | 现藏地 |
| `BELONGS_TO_DYNASTY` | Artifact → Dynasty | 所属朝代 |
| `BELONGS_TO_CATEGORY` | Artifact → Category | 所属类别 |
| `DISCOVERED_AT` | Artifact → Location | 出土地点 |

**典型查询**：
```cypher
// 某文物的关联网络（2度关系）
MATCH path = (a:Artifact {id: 'a123'})-[*1..2]-(n)
RETURN path

// 某收藏家的藏品
MATCH (p:Person {name: '张伯驹'})<-[:COLLECTED_BY]-(artifact:Artifact)
RETURN artifact
```

---

### 扩展图谱（保护修复视图）- 启用插件时创建

**节点标签**：

| Label | 属性 | 说明 |
|-------|------|------|
| `DamageType` | id, name, severity | 损害类型（裂纹、锈蚀等） |
| `RepairMethod` | id, name, description | 修复方法 |
| `DetectionTechnique` | id, name, principle | 检测技术 |
| `ConservationMaterial` | id, name, composition | 保护材料 |

**关系类型**：

| 关系 | 方向 | 含义 |
|------|------|------|
| `HAS_DAMAGE` | Artifact → DamageType | 存在损害 |
| `REPAIRED_WITH` | Artifact → RepairMethod | 使用修复方法 |
| `DETECTED_BY` | Artifact → DetectionTechnique | 使用检测技术 |
| `USED_MATERIAL` | Artifact → ConservationMaterial | 采用保护材料 |
| `SUITABLE_FOR` | RepairMethod → DamageType | 适用于（技术-损害关联） |

**典型查询**：
```cypher
// 某文物的修复历史
MATCH (a:Artifact {id: 'a123'})-[r:HAS_DAMAGE|REPAIRED_WITH|DETECTED_BY]->(n)
RETURN type(r) as relation, n

// 某修复技术的适用案例
MATCH (method:RepairMethod {name: '环氧树脂补配'})<-[:REPAIRED_WITH]-(a:Artifact)
RETURN a
```

---

### 图谱视图切换

**系统根据启用的插件动态构建查询**：

```javascript
// 获取当前启用的图谱节点类型
function getEnabledNodeLabels(userId) {
  const user = db.users.findById(userId);
  const plugins = user.enabled_plugins || ['core'];
  
  const coreLabels = ['Artifact', 'Person', 'Location', 'Dynasty', 'Category'];
  const conservationLabels = ['DamageType', 'RepairMethod', 'DetectionTechnique', 'ConservationMaterial'];
  
  let labels = [...coreLabels];
  if (plugins.includes('conservation')) {
    labels = [...labels, ...conservationLabels];
  }
  return labels;
}

// 构建图谱查询（只查询启用的节点类型）
function buildGraphQuery(nodeLabels, keyword) {
  const labelFilter = nodeLabels.map(l => `n:${l}`).join(' OR ');
  return `
    MATCH (n)
    WHERE (${labelFilter}) AND n.name CONTAINS $keyword
    OPTIONAL MATCH (n)-[r]-(m)
    WHERE (${labelFilter.replace(/n:/g, 'm:')})
    RETURN n, r, m
    LIMIT 100
  `;
}
```

---

## 数据字典

### 通用状态值

```javascript
// 导入任务状态
const ImportStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// AI 运行模式
const AIMode = {
  ONLINE: 'ONLINE',
  LOCAL: 'LOCAL',
  MOCK: 'MOCK'
};

// AI 问答模式（用户可切换）
const ChatMode = {
  GRAPH: 'graph',      // 图谱模式：只查图谱
  KNOWLEDGE: 'knowledge', // 知识模式：基于图谱实例归纳知识
  GENERAL: 'general'   // 通用模式：不限制
};

// 用户角色
const UserRole = {
  ADMIN: 'admin',
  USER: 'user'
};

// 附件类型
const AttachmentType = {
  ORIGINAL: 'original',
  THUMBNAIL: 'thumbnail',
  INPAINTING_RESULT: 'inpainting_result'
};
```

### 字段命名规范

| 前缀/后缀 | 含义 | 示例 |
|-----------|------|------|
| `*_id` | 外键 | `created_by` → `users.id` |
| `*_at` | 时间戳 | `created_at`, `updated_at` |
| `*_hash` | 哈希值 | `password_hash` |
| `is_*` / `has_*` | 布尔 | `has_conservation_record` |
| `*_types` / `*_methods` | JSON 数组 | `damage_types: ["裂纹", "锈蚀"]` |
