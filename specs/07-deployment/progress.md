# 部署实现状态

## 监控与日志

### 日志查看

```bash
# 查看所有服务日志
docker-compose logs

# 查看特定服务（实时刷新）
docker-compose logs -f backend

# 查看最近 100 行
docker-compose logs --tail=100 backend

# 查看时间戳
docker-compose logs -t backend
```

### 应用日志

后端使用 **Winston** 记录结构化日志：

```bash
# 查看日志文件
docker exec artifact-dashboard-backend cat /app/logs/app.log

# 日志格式（JSON）
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "info",
  "message": "用户登录成功",
  "meta": {
    "userId": 1,
    "username": "admin",
    "ip": "192.168.1.100"
  }
}
```

### 健康检查

```bash
# API 健康检查
curl http://localhost:3000/health

# 预期响应
{
  "status": "healthy",
  "services": {
    "mysql": "connected",
    "neo4j": "connected",
    "redis": "connected"
  },
  "timestamp": "2024-01-15T10:30:00.123Z"
}
```

---

## 常见问题排查清单

### 服务启动失败

**问题**：`docker-compose up` 后某个容器退出

**排查步骤**：
```bash
# 1. 查看容器状态
docker-compose ps

# 2. 查看失败容器日志
docker-compose logs <service-name>

# 3. 常见原因
# - 端口冲突：检查端口是否被占用
# - 内存不足：Docker Desktop 分配内存至少 4GB
# - 权限问题：Linux 上检查 volume 权限
```

### 数据库连接失败

**后端日志**：`Error: connect ECONNREFUSED mysql:3306`

**解决**：
```bash
# 1. 确认 MySQL 容器运行中
docker-compose ps mysql

# 2. 检查 MySQL 是否就绪（可能需要等 30 秒初始化）
docker-compose logs mysql | grep "ready for connections"

# 3. 重启后端（等 MySQL 就绪后）
docker-compose restart backend
```

### 前端无法访问后端

**排查**：
```bash
# 1. 确认后端健康
curl http://localhost:3000/health

# 2. 检查前端环境变量
# frontend/.env 中 REACT_APP_API_URL 应指向 http://localhost:3000

# 3. 检查浏览器 Network 面板
# 确认请求 URL 正确，没有 CORS 错误
```

### Ollama 模型下载慢

**问题**：首次启动 `deepseek-r1:8b` 下载很慢

**解决**：
```bash
# 使用国内镜像加速
# 在 docker-compose.yml 中给 ollama 服务添加环境变量
environment:
  - OLLAMA_MODELS=/root/.ollama/models
  - OLLAMA_ORIGINS=*
# 或使用预下载模型卷
```

---

## 升级维护流程

### 更新代码后重启

```bash
# 拉取最新代码
git pull origin main

# 重建并重启（保留数据卷）
docker-compose up -d --build

# 如果依赖有变化，需要重新构建镜像
docker-compose down
docker-compose up -d --build
```

### 数据库迁移

**添加新表/字段**：
```bash
# 1. 在 backend/scripts/migrations/ 创建 SQL 文件
# 20240115_add_new_table.sql

# 2. 进入 MySQL 容器执行
docker exec -i artifact-dashboard-mysql \
  mysql -u root -ppassword artifact_dashboard \
  < backend/scripts/migrations/20240115_add_new_table.sql
```

### 清理重建（数据清空）

```bash
# 停止并删除容器
docker-compose down

# 删除数据卷（清空所有数据！）
docker volume rm artifact-data-dashboard_mysql-data
docker volume rm artifact-data-dashboard_neo4j-data

# 重新启动
docker-compose up -d
```

---

## 生产检查清单

- [ ] 修改所有默认密码（MySQL、Neo4j、Redis、JWT_SECRET）
- [ ] 关闭调试端口（9229）
- [ ] 设置防火墙规则，只暴露必要端口
- [ ] 配置 SSL/TLS（Nginx 反向代理）
- [ ] 设置日志轮转（防止磁盘占满）
- [ ] 配置自动备份
- [ ] 设置监控告警（健康检查失败通知）
- [ ] 准备灾难恢复方案

---

## 性能优化建议

### MySQL

```sql
-- 添加常用查询索引
CREATE INDEX idx_artifacts_era ON artifacts(era);
CREATE INDEX idx_artifacts_category ON artifacts(category_id);
CREATE INDEX idx_artifacts_created ON artifacts(created_at);
```

### Neo4j

```cypher
-- 添加节点属性索引
CREATE INDEX artifact_name FOR (a:Artifact) ON (a.name);
CREATE INDEX person_name FOR (p:Person) ON (p.name);

-- 检查查询执行计划
EXPLAIN MATCH (a:Artifact {era: '唐代'}) RETURN a;
```

### 后端

- 启用 Redis 缓存热点数据
- 图片使用 CDN 或对象存储（而非本地）
- 大查询添加分页（limit/offset）
