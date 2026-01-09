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

