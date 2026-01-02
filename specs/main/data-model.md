# Data Model: Artifact Data Dashboard v1.0.0

## MySQL Schema

### `users`
- `id`: INT 主键，自增
- `username`: VARCHAR(50) 唯一
- `email`: VARCHAR(100) 唯一
- `password_hash`: VARCHAR(255)
- `role`: ENUM('admin', 'user') 默认 'user'
- `organization`: VARCHAR(150) 可为空
- `title`: VARCHAR(100) 可为空
- `bio`: TEXT 可为空
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

### `artifacts`
- `id`: INT 主键，自增
- `name`: VARCHAR(255)
- `description`: TEXT
- `category`: VARCHAR(50)
- `era`: VARCHAR(50)
- `location`: VARCHAR(100)
- `image_url`: VARCHAR(255)
- `tags`: TEXT
- `is_cataloged`: BOOLEAN
- `is_digitized`: BOOLEAN
- `needs_repair`: BOOLEAN
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP
- **Indexes**: FULLTEXT(name, description, tags)

### `logs`
- `id`: INT 主键，自增
- `user_id`: INT 外键 -> users.id
- `action`: VARCHAR(50)
- `target_id`: INT
- `timestamp`: TIMESTAMP
- `details`: TEXT

## Neo4j Graph Model

### Nodes（节点）
- **Artifact**: `{id, name, description, tags, isCataloged, isDigitized, needsRepair}`
- **Category**: `{name, description}`
- **Era**: `{name, startYear, endYear}`
- **Location**: `{name, region, longitude, latitude}`
- **Material**: `{name, description}`
- **Dimension**: `{label, value, unit}`
- **DamageType**: `{name, severity, description}`
- **RestorationMethod**: `{name, description}`
- **ReinforcementMethod**: `{name, description}`
- **InspectionTechnique**: `{name, description}`
- **ProtectiveMaterial**: `{name, description}`
- **InspectionMetric**: `{name, unit, idealRange}`

### Relationships（关系）
- `(:Artifact)-[:HAS_CATEGORY]->(:Category)`
- `(:Artifact)-[:BELONGS_TO_ERA]->(:Era)`
- `(:Artifact)-[:STORED_AT]->(:Location)`
- `(:Artifact)-[:MADE_OF]->(:Material)`
- `(:Artifact)-[:HAS_DIMENSION]->(:Dimension)`
- `(:Artifact)-[:HAS_DAMAGE]->(:DamageType)`
- `(:Artifact)-[:USES_RESTORATION]->(:RestorationMethod)`
- `(:Artifact)-[:USES_REINFORCEMENT]->(:ReinforcementMethod)`
- `(:Artifact)-[:INSPECTED_BY]->(:InspectionTechnique)`
- `(:Artifact)-[:MEASURED_BY]->(:InspectionMetric)`
- `(:Artifact)-[:PROTECTED_WITH]->(:ProtectiveMaterial)`

## Redis Data Structures

### Chat History（聊天历史）
- **Key**: `chat:<conversationId>`
- **Type**: List（JSON 字符串）
- **TTL**: 7 days
- **Content**: `[{role: 'user'|'assistant', content: string, timestamp: number}, ...]`
