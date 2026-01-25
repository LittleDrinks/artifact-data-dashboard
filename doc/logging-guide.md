# 日志系统使用指南

本项目使用 Winston 实现企业级结构化日志，支持日志轮转、敏感数据脱敏、环境特定配置等功能。

## 日志配置

### 环境变量

在 `.env` 文件中配置以下变量：

```bash
# 日志级别: error | warn | info | debug
LOG_LEVEL=debug

# 日志目录（容器内路径）
LOG_DIR=/app/logs

# 单个日志文件最大大小
LOG_MAX_SIZE=20m

# 日志文件保留时间
LOG_MAX_FILES=14d
```

### 日志级别说明

- **error**: 仅记录错误
- **warn**: 记录警告和错误
- **info**: 记录信息、警告和错误（生产环境推荐）
- **debug**: 记录所有日志，包括调试信息（开发环境）

## 在代码中使用日志

### 1. 导入Logger

```javascript
const { createLogger } = require('../utils/logger');
const logger = createLogger('ModuleName');  // ModuleName 是你的模块名称
```

### 2. 记录日志

```javascript
// 信息日志
logger.info('User logged in', { userId: 123, username: 'john' });

// 警告日志
logger.warn('High memory usage', { usage: '85%' });

// 错误日志
logger.error('Database connection failed', { error: err.message });

// 调试日志
logger.debug('Query executed', { query: 'SELECT * FROM users', duration: '15ms' });
```

### 3. HTTP请求日志

```javascript
const { createRequestLogger } = require('../utils/logger');

// 在路由中使用
router.use(createRequestLogger('API'));

// 自动记录所有HTTP请求和响应
```

### 4. 性能计时

```javascript
const timer = logger.time('DatabaseQuery');

// ... 执行操作 ...

timer.end('Query completed', { rows: 100 });
// 自动记录执行时间
```

## 日志格式

所有日志以JSON格式输出，便于日志聚合工具解析：

```json
{
  "level": "info",
  "message": "User logged in",
  "metadata": {
    "userId": 123,
    "username": "john",
    "module": "AuthService"
  },
  "timestamp": "2026-01-25 15:56:53"
}
```

## 日志文件

日志文件位于 `/app/logs/` 目录：

- **combined-YYYY-MM-DD.log**: 所有级别的日志
- **error-YYYY-MM-DD.log**: 仅错误日志
- **exceptions-YYYY-MM-DD.log**: 未捕获的异常

日志文件每天轮转，单个文件最大20MB，保留14天。

## 查看日志

### 在Docker容器中

```bash
# 查看最新50行日志
docker logs artifact-dashboard-backend --tail 50

# 实时查看combined日志
docker exec artifact-dashboard-backend tail -f /app/logs/combined-*.log

# 查看error日志
docker exec artifact-dashboard-backend tail -f /app/logs/error-*.log

# 查看所有日志文件
docker exec artifact-dashboard-backend ls -lah /app/logs/
```

### 使用jq解析JSON日志

```bash
# 查看最新10条info级别日志
docker exec artifact-dashboard-backend tail -100 /app/logs/combined-*.log | jq 'select(.level=="info")'

# 查看特定模块的日志
docker exec artifact-dashboard-backend tail -100 /app/logs/combined-*.log | jq 'select(.metadata.module=="CypherExecutor")'

# 查看错误日志并高亮关键字段
docker exec artifact-dashboard-backend tail -100 /app/logs/error-*.log | jq '{level, message, module: .metadata.module}'
```

## 敏感数据脱敏

日志系统自动脱敏以下字段：

- `password`
- `token`
- `secret`
- `key`
- `authorization`
- `cookie`
- `api_key`

示例：

```javascript
logger.info('User data', { username: 'john', password: '123456' });
// 输出: { username: 'john', password: '***REDACTED***' }
```

## 生产环境最佳实践

1. **设置日志级别为 info**
   ```bash
   LOG_LEVEL=info
   ```

2. **配置日志轮转**
   ```bash
   LOG_MAX_SIZE=50m
   LOG_MAX_FILES=30d
   ```

3. **定期备份日志**
   ```bash
   # 使用Docker卷持久化日志
   docker-compose.yml:
     volumes:
       - ./logs:/app/logs
   ```

4. **集成日志聚合工具**
   - ELK Stack (Elasticsearch, Logstash, Kibana)
   - Grafana Loki
   - Splunk
   - Datadog

5. **监控日志告警**
   - 错误率阈值告警
   - 异常模式检测
   - 性能降级通知

## 故障排查

### 日志文件未生成

检查日志目录权限：
```bash
docker exec artifact-dashboard-backend ls -la /app/logs/
```

确保容器有写权限。

### 日志级别不生效

检查环境变量：
```bash
docker exec artifact-dashboard-backend printenv | grep LOG
```

重启容器使配置生效：
```bash
docker compose restart backend
```

### 日志文件过大

调整轮转配置：
```bash
# 减小单文件大小
LOG_MAX_SIZE=10m

# 减少保留天数
LOG_MAX_FILES=7d
```

## 验证脚本

运行自动验证脚本检查日志系统是否正常工作：

```bash
# Windows PowerShell
.\scripts\verify-003-quality-fixes.ps1

# 或直接在仓库根目录运行
pwsh -File scripts/verify-003-quality-fixes.ps1
```

验证内容包括：
- ✅ 容器运行状态
- ✅ 健康端点响应
- ✅ 日志文件生成
- ✅ 日志格式正确性
- ✅ Winston依赖安装

## 常见问题

### Q: 如何查看特定时间段的日志？

A: 使用 `grep` 过滤时间戳：
```bash
docker exec artifact-dashboard-backend grep "2026-01-25 15:" /app/logs/combined-*.log
```

### Q: 如何导出日志到本地？

A: 使用 `docker cp`：
```bash
docker cp artifact-dashboard-backend:/app/logs/ ./local-logs/
```

### Q: 日志中文乱码怎么办？

A: 日志文件使用UTF-8编码，确保查看工具支持UTF-8：
```bash
# Linux/Mac
cat /app/logs/combined-*.log | less

# Windows PowerShell
Get-Content .\logs\combined-*.log -Encoding UTF8
```

### Q: 如何禁用控制台日志输出？

A: 修改 `backend/src/config/logger.js`，注释掉 console transport：
```javascript
// if (!isProduction) {
//   baseLogger.add(new winston.transports.Console({
//     format: prettyFormat
//   }));
// }
```

## 相关文档

- [Winston官方文档](https://github.com/winstonjs/winston)
- [winston-daily-rotate-file](https://github.com/winstonjs/winston-daily-rotate-file)
- [003代码质量修复完整报告](../specs/003-code-quality-fixes/IMPLEMENTATION_COMPLETE.md)

---

**更新时间**: 2026-01-25  
**版本**: 1.0.0  
**适用环境**: Docker容器部署
