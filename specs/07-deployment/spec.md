# 部署规范

## 环境配置规范

### 环境变量文件

**唯一配置入口**：项目根目录 `.env`

```bash
# =============================================
# 基础配置
# =============================================
APP_ENV=development          # development | production
NODE_ENV=development         # 影响依赖安装和构建行为

# =============================================
# AI 配置
# =============================================
AI_MODE=auto                 # auto | online | local | mock
AI_API_ENDPOINT=http://ollama:11434/v1/chat/completions
AI_MODEL=deepseek-r1:8b
AI_FALLBACK_ENABLED=true
AI_HEALTH_CHECK_INTERVAL=30000

# 云端 API 配置（AI_MODE=online 时使用）
DEEPSEEK_API_KEY=your_key_here
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions

# =============================================
# MySQL 配置
# =============================================
MYSQL_HOST=mysql             # Docker 内用服务名，外部用 localhost
MYSQL_PORT=3306              # 容器内端口
MYSQL_ROOT_PASSWORD=password # 生产环境必须修改
MYSQL_DATABASE=artifact_dashboard
MYSQL_USER=user
MYSQL_PASSWORD=password      # 生产环境必须修改

# =============================================
# Neo4j 配置
# =============================================
NEO4J_HOST=neo4j
NEO4J_PORT=7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password      # 生产环境必须修改
NEO4J_URI=bolt://neo4j:7687

# =============================================
# Redis 配置
# =============================================
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=password

# =============================================
# JWT 配置
# =============================================
JWT_SECRET=your_jwt_secret_change_in_production  # 生产必须修改！
JWT_EXPIRES_IN=24h

# =============================================
# 文件上传配置
# =============================================
UPLOAD_DIR=/app/uploads      # 容器内路径
MAX_FILE_SIZE=50mb           # 单文件大小限制
ALLOWED_EXTENSIONS=jpg,jpeg,png,pdf,doc,docx,xlsx

# =============================================
# 日志配置
# =============================================
LOG_LEVEL=info               # debug | info | warn | error
LOG_DIR=./logs
```

### 不同环境差异

| 配置项 | 开发环境 | 生产环境 |
|--------|----------|----------|
| APP_ENV | development | production |
| 前端端口 | 8080 (React dev server) | 80 (Nginx) |
| 后端端口 | 3000 | 13000 |
| 数据库密码 | password | 强随机密码 |
| JWT_SECRET | dev_secret | 32位以上随机字符串 |
| 日志级别 | debug | warn |
| AI_MODE | local | auto |

---

## Docker Compose 服务定义

### 开发配置（docker-compose.yml）

关键特性：
- 前端用 **React 开发服务器**（热更新）
- 后端启用 **Node.js 调试端口**（9229）
- 源码通过 **volume 挂载**（修改无需重建）
- 包含 **Ollama** 本地模型

```yaml
# 核心服务配置节选
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "8080:3000"
    volumes:
      - ./frontend:/app        # 源码挂载
      - /app/node_modules      # 排除 node_modules
  
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
      - "9229:9229"            # 调试端口
    command: node --inspect=0.0.0.0:9229 src/index.js
    volumes:
      - ./backend/src:/app/src  # 源码挂载
```

### 生产配置（docker-compose.prod.yml）

关键差异：
- 前端用 **Nginx** 服务静态文件
- 后端**无源码挂载**，完全基于镜像
- **无调试端口**
- **无 Ollama**（假定用云端 API）
- 后端暴露 **13000** 端口（便于外部负载均衡）

---

## 端口映射规范

### 开发环境

| 服务 | 容器端口 | 主机端口 | 说明 |
|------|----------|----------|------|
| frontend | 3000 | 8080 | React 开发服务器 |
| backend | 3000 | 3000 | Node.js API |
| mysql | 3306 | 13306 | 数据库 |
| neo4j | 7474/7687 | 17474/17687 | 图数据库 |
| redis | 6379 | 16379 | 缓存 |
| ollama | 11434 | 11434 | 本地 LLM |

### 生产环境

| 服务 | 容器端口 | 主机端口 | 说明 |
|------|----------|----------|------|
| frontend | 80 | 8080 | Nginx 静态服务 |
| backend | 3000 | 13000 | Node.js API |
| mysql | 3306 | 13306 | 数据库 |
| neo4j | 7474/7687 | 17474/17687 | 图数据库 |
| redis | 6379 | 16379 | 缓存 |

---

## 数据持久化策略

### 数据卷配置

```yaml
volumes:
  mysql-data:      # MySQL 数据
  neo4j-data:      # Neo4j 数据
  neo4j-logs:      # Neo4j 日志
  redis-data:      # Redis 持久化
  uploads-data:    # 用户上传文件
```

**查看卷位置**：
```bash
docker volume ls
docker volume inspect artifact-data-dashboard_mysql-data
```

---

## 备份策略

### MySQL 备份

```bash
# 手动备份
docker exec artifact-dashboard-mysql \
  mysqldump -u root -ppassword artifact_dashboard \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# 自动备份脚本（建议加到 crontab）
#!/bin/bash
BACKUP_DIR=/backups/mysql
DATE=$(date +%Y%m%d_%H%M%S)
docker exec artifact-dashboard-mysql \
  mysqldump -u root -p$MYSQL_ROOT_PASSWORD artifact_dashboard \
  | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# 保留 7 天
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
```

### Neo4j 备份

```bash
# 创建备份（需要停止写入）
docker exec artifact-dashboard-neo4j \
  neo4j-admin dump --database=neo4j --to=/backups/neo4j_$(date +%Y%m%d).dump

# 恢复备份
docker exec artifact-dashboard-neo4j \
  neo4j-admin load --from=/backups/neo4j_20240115.dump --database=neo4j --force
```

### 附件备份

附件存储在 Docker 卷 `uploads-data` 中：

```bash
# 打包备份
docker run --rm \
  -v artifact-data-dashboard_uploads-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/uploads_$(date +%Y%m%d).tar.gz -C /data .
```
