# 数据与导入指南

## 概述

本指南帮助您了解如何准备和导入数据到文物数据仪表板系统中。通过遵循标准化的Excel模板和导入流程，您可以高效地将文物和文献数据集成到系统中，支持后续的检索、图谱分析和AI问答功能。

## Excel 模板准备

### 模板要求
- **标准格式**：严格遵循 `backend/src/config/excel-schema.js` 中定义的sheet名称、列名和顺序。
- **编码**：确保文件使用UTF-8编码，避免中文乱码问题。
- **数据格式**：日期和ID字段必须符合schema规范。

### 模板结构示例
```
Sheet1: 文物基本信息
- 列1: 文物ID (必填)
- 列2: 名称
- 列3: 年代
- 列4: 描述
...

Sheet2: 附件信息
- 列1: 附件ID
- 列2: 文件名
...
```

## 数据导入流程

### 管理员操作步骤

1. **上传Excel文件**
   - 登录系统，进入附件模块
   - 点击"上传"按钮，选择准备好的Excel文件
   - 等待上传完成，记下返回的附件ID

2. **执行导入**
   - 使用API调用：`POST /api/attachments/{附件ID}/excel/import`
   - 参数选择：
     - `strategy=append`：追加数据（推荐）
     - `strategy=overwrite`：覆盖现有数据（谨慎使用）

3. **验证结果**
   - 检查系统日志确认导入成功
   - 在文物列表中查看新导入的数据

### 示例API调用
```bash
curl -X POST "http://localhost:3000/api/attachments/123/excel/import?strategy=append" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 数据导出流程

### 导出操作
1. 调用导出API：`POST /api/attachments/excel/export`
2. 系统生成 `ownerType="system_export"` 的附件
3. 通过附件ID下载导出的Excel文件

### 备份建议
- 在执行覆盖导入前，先导出当前数据作为备份
- 定期导出重要数据以防意外丢失

## 图谱转换

### 后端服务
- `excel-kg.service.js` 自动处理Excel数据到知识图谱的转换
- 支持实体关系提取和图谱构建

### Python脚本辅助
- 使用 `build_kg/` 目录下的脚本处理爬取或清洗后的数据
- 将数据转换为标准Excel模板格式后再导入

## 存储架构

### 数据分层
- **MySQL**：存储主数据表（文物、用户、附件等）
- **Neo4j**：存储知识图谱关系和图数据
- **Redis**：提供缓存服务，提高查询性能

### 配置要求
确保 `.env` 文件中的连接参数与Docker Compose配置一致：
```
MYSQL_HOST=localhost
MYSQL_PORT=13306
REDIS_PORT=16379
NEO4J_URI=bolt://localhost:17687
```

## 数字资产管理 (DAMS)

### 概述
数字资产管理系统提供企业级的文件管理能力，将附件从简单存储升级为可管理、可分类、可共享的数字资产。

### 核心功能

#### 文件夹管理
- **层级结构**：支持无限层级的文件夹嵌套
- **拖拽操作**：通过拖拽移动文件和文件夹
- **批量管理**：支持批量移动、删除操作

#### 标签系统
- **多标签**：每个资产可添加多个标签
- **颜色标识**：每个标签可自定义颜色
- **筛选过滤**：根据标签快速筛选资产
- **批量打标**：支持批量添加/移除标签

#### 公开分享
- **临时链接**：生成带有效期的公开访问链接
- **密码保护**：可选密码保护敏感资产
- **下载限制**：可设置最大下载次数
- **访问日志**：记录每次访问的IP和时间

#### 资产选择器
- **文物关联**：在创建文物时直接从资产库选择图片
- **双模式**：支持"从资产库选择"或"上传新文件"
- **预览支持**：选择前可预览图片内容

#### 引用追踪
- **双向关联**：查看资产被哪些文物/对话引用
- **快速导航**：点击引用可跳转到关联内容

### API 端点

#### 文件夹操作
```bash
# 获取文件夹树
GET /api/folders

# 创建文件夹
POST /api/folders
{
  "name": "文物图片",
  "parentFolderId": null  # null表示根目录
}

# 移动文件夹
PUT /api/folders/:id/move
{
  "parentFolderId": "目标父文件夹ID"
}
```

#### 标签操作
```bash
# 获取所有标签
GET /api/tags

# 创建标签
POST /api/tags
{
  "name": "重要",
  "color": "#ff4d4f"
}

# 为资产添加标签
POST /api/tags/file/:attachmentId
{
  "tagId": "标签ID"
}

# 批量打标
POST /api/attachments/bulk/tags
{
  "attachmentIds": [1, 2, 3],
  "tagIds": [10, 11],
  "action": "add"  # 或 "remove"
}
```

#### 公开链接
```bash
# 创建公开链接
POST /api/public-links
{
  "attachmentId": 123,
  "expiresAt": "2024-12-31T23:59:59Z",  # 可选
  "password": "secret123",               # 可选
  "maxDownloads": 10                     # 可选
}

# 公开访问（无需认证）
GET /public/:token/download
GET /public/:token/info
```

#### 引用查询
```bash
# 查询资产引用
GET /api/attachments/:id/references

# 响应示例
{
  "artifacts": [
    {"id": 1, "name": "青铜鼎", "type": "image_url"}
  ],
  "chats": [
    {"id": 5, "preview": "这件文物的图片..."}
  ]
}
```

### 数据库表结构

#### folders 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键 |
| name | VARCHAR(255) | 文件夹名称 |
| parent_folder_id | INT | 父文件夹ID |
| created_at | DATETIME | 创建时间 |

#### tags 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键 |
| name | VARCHAR(100) | 标签名称 |
| color | VARCHAR(7) | 颜色代码 |

#### file_tags 表
| 字段 | 类型 | 说明 |
|------|------|------|
| file_id | INT | 附件ID |
| tag_id | INT | 标签ID |

#### public_links 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键 |
| attachment_id | INT | 关联附件 |
| token | VARCHAR(36) | 访问令牌 |
| expires_at | DATETIME | 过期时间 |
| password_hash | VARCHAR(255) | 密码哈希 |
| max_downloads | INT | 最大下载次数 |
| download_count | INT | 已下载次数 |

## 常见问题与校验

### 数据校验要点
- 上传前检查日期格式（YYYY-MM-DD）
- 确认ID字段唯一且符合规范
- 验证必填字段完整性

### 故障排查
- **导入失败**：检查Excel格式是否符合schema
- **数据异常**：查看后端日志中的错误信息
- **性能问题**：确认数据库连接正常，索引完整

### 最佳实践
- 小批量测试导入后再处理大量数据
- 定期备份重要数据
- 使用开发环境测试导入逻辑后再部署到生产

