# 运维与排障指南

## 概述

本指南提供系统运维和故障排查的实用信息，帮助您快速诊断和解决常见问题。涵盖健康检查、日志查看、配置管理和问题解决策略。

## 系统健康检查

### 健康检查端点
- **开发环境**：`GET http://localhost:3000/health`
- **生产环境**：`GET http://localhost:13000/health`

### API文档访问
- 开发：`http://localhost:3000/api-docs`
- 生产：`http://localhost:13000/api-docs`

### 快速验证步骤
1. 访问健康检查端点，确认返回状态为"ok"
2. 打开API文档页面，验证Swagger界面正常加载
3. 检查各服务端口是否可访问

## 服务端口配置

### 开发环境端口
| 服务 | 端口 | 说明 |
|------|------|------|
| 前端 | 8080 | React应用界面 |
| 后端 | 3000 | Express API服务 |
| MySQL | 13306 | 数据库服务 |
| Redis | 16379 | 缓存服务 |
| Neo4j HTTP | 17474 | 图数据库Web界面 |
| Neo4j Bolt | 17687 | 图数据库连接端口 |

### 端口检查命令
```bash
# 检查端口是否监听
netstat -an | findstr :3000
# 或使用PowerShell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

## 日志管理

### 查看日志的方法
1. **使用批处理脚本**：运行 `view-logs.bat`，选择backend服务
2. **Docker命令**：`docker compose logs backend -f`
3. **直接查看日志文件**：进入 `backend/logs/` 目录

### 日志分析要点
- 启动日志中查找 `missingRequired` 等错误提示
- 注意时间戳和错误级别（ERROR、WARN、INFO）
- 记录关键错误信息用于问题诊断

## 环境变量配置

### 关键环境变量
位于根目录 `.env` 文件中的重要配置：

```env
# 应用环境
APP_ENV=development

# MySQL配置
MYSQL_HOST=localhost
MYSQL_PORT=13306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=artifact_db

# Redis配置
REDIS_PASSWORD=your_redis_password
REDIS_PORT=16379

# Neo4j配置
NEO4J_URI=bolt://localhost:17687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_neo4j_password

# AI插件配置
AI_PLUGINS_CONFIG=./backend/src/config/ai-plugins.json
```

### 配置验证
- 确保所有密码与Docker Compose中的环境变量一致
- 检查端口映射是否与实际服务端口匹配
- 验证文件路径是否正确

## 常见问题解决

### 连接失败
**症状**：服务无法启动或API调用失败

**排查步骤**：
1. 确认容器运行状态：`docker compose ps`
2. 检查端口映射：`docker compose port backend`
3. 验证环境变量配置
4. 查看服务日志中的连接错误

**解决方案**：
- 重启相关服务：`docker compose restart backend`
- 检查网络配置和防火墙设置

### Redis认证错误
**症状**：缓存操作失败，日志显示认证错误

**排查步骤**：
1. 确认Redis容器正在运行
2. 检查 `REDIS_PASSWORD` 与compose文件中的 `--requirepass` 参数一致
3. 验证Redis端口配置

**解决方案**：
```bash
# 测试Redis连接
docker exec -it redis redis-cli -a your_password ping
```

### 数据异常
**症状**：数据查询结果异常或丢失

**排查步骤**：
1. 检查MySQL连接和数据库状态
2. 查看数据迁移脚本执行情况
3. 确认Neo4j图数据完整性

**解决方案**：
- 使用 `reset_data.bat` 重置MySQL数据
- 如果修改过root密码，确保脚本中的密码同步更新

### 性能问题
**症状**：系统响应慢或超时

**排查步骤**：
1. 检查各服务CPU/内存使用情况
2. 查看数据库查询性能
3. 确认Redis缓存工作正常

**解决方案**：
- 增加容器资源限制
- 优化数据库索引
- 调整缓存策略

## 维护操作

### 日常维护
- 定期检查日志文件大小，及时清理
- 监控磁盘空间使用情况
- 备份重要数据和配置文件

### 紧急处理
- 服务宕机时优先检查容器状态
- 保留错误日志用于问题分析
- 在测试环境验证修复方案后再应用到生产

## 联系支持

如果问题无法自行解决，请提供以下信息：
- 完整的错误日志
- 系统环境信息（OS版本、Docker版本）
- 配置文件（脱敏后）
- 问题复现步骤
