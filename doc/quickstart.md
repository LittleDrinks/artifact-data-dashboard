# 快速启动指南

## 概述

本指南将帮助您快速搭建和运行文物数据仪表板系统。通过简单的几步操作，您就可以拥有一个完整的文物数据管理平台。

## 前置条件

### 系统要求
- **操作系统**：Windows 10/11、macOS 10.15+ 或 Linux
- **Docker**：版本 20.10 或更高
- **Docker Compose**：版本 2.0 或更高
- **内存**：至少 4GB 可用内存
- **磁盘空间**：至少 5GB 可用空间

### 环境检查
运行以下命令确认Docker环境正常：

```bash
# 检查Docker版本
docker --version
# 检查Docker Compose版本
docker compose version
# 检查Docker服务状态
docker info
```

## 环境配置

### 1. 获取项目代码
```bash
# 克隆项目仓库
git clone https://github.com/LittleDrinks/artifact-data-dashboard.git
cd artifact-data-dashboard
```

### 2. 配置环境变量
```bash
# 复制环境变量模板
copy .env.example .env
```

### 3. 编辑配置文件
使用文本编辑器打开 `.env` 文件，配置以下关键参数：

```env
# 应用环境
APP_ENV=development

# 数据库配置
MYSQL_ROOT_PASSWORD=your_mysql_password
MYSQL_PASSWORD=your_mysql_password
MYSQL_USER=artifact_user
MYSQL_DATABASE=artifact_db

# Redis配置
REDIS_PASSWORD=your_redis_password

# Neo4j配置
NEO4J_AUTH=neo4j/your_neo4j_password

# AI插件配置（可选）
AI_PLUGINS_CONFIG=./backend/src/config/ai-plugins.json
```

**安全提示**：请使用强密码，不要在生产环境中使用默认密码。

## 开发环境启动

### 使用Docker Compose启动
```bash
# 构建并启动所有服务
docker compose up -d --build
```

### 启动过程说明
- 首次启动需要下载镜像和构建服务，可能需要几分钟
- `-d` 参数表示后台运行
- `--build` 参数确保使用最新代码构建

### 验证启动状态
```bash
# 查看服务运行状态
docker compose ps

# 查看启动日志
docker compose logs backend
```

## 访问系统

### 开发环境访问地址
- **前端界面**：http://localhost:8080
- **后端API文档**：http://localhost:3000/api-docs
- **Neo4j浏览器**：http://localhost:17474 (默认用户名: neo4j, 密码: 与.env中一致)

### 健康检查
访问健康检查端点确认系统正常：

```bash
curl http://localhost:3000/health
```

期望返回：
```json
{
  "status": "ok",
  "timestamp": "2024-01-09T...",
  "services": {
    "database": "connected",
    "redis": "connected",
    "neo4j": "connected"
  }
}
```

## 生产环境部署

### 使用生产配置文件
```bash
# 使用生产环境配置启动
docker compose -f docker-compose.prod.yml up -d --build
```

### 生产环境访问地址
- **后端API文档**：http://localhost:13000/api-docs
- **前端界面**：根据nginx配置的端口

## Windows快捷脚本

项目提供了便捷的批处理脚本：

### 开发环境
```batch
# 启动开发环境
start-dev.bat
```

### 数据重置
```batch
# 重置MySQL数据（谨慎使用）
reset_data.bat
```

### 日志查看
```batch
# 查看容器日志
view-logs.bat
```

## 基本功能验证

### 1. API文档浏览
1. 打开 http://localhost:3000/api-docs
2. 浏览可用的API端点
3. 测试基础的健康检查接口

### 2. 前端界面访问
1. 打开 http://localhost:8080
2. 尝试注册新用户或登录
3. 浏览仪表板和各个功能模块

### 3. 数据库连接测试
1. 打开Neo4j浏览器 http://localhost:17474
2. 使用配置的用户名密码登录
3. 执行简单的Cypher查询测试连接

## 故障排查

### 常见启动问题

**问题**：端口被占用
```
解决方案：修改 .env 文件中的端口配置，或停止占用端口的服务
```

**问题**：内存不足
```
解决方案：关闭其他应用程序，或增加Docker内存分配
```

**问题**：镜像下载失败
```
解决方案：检查网络连接，尝试使用国内镜像源
```

### 服务状态检查
```bash
# 检查所有服务状态
docker compose ps

# 查看特定服务日志
docker compose logs backend
docker compose logs frontend
```

### 重启服务
```bash
# 重启所有服务
docker compose restart

# 重启特定服务
docker compose restart backend
```

## 停止和清理

### 正常停止
```bash
# 停止所有服务
docker compose down
```

### 清理数据卷（谨慎操作）
```bash
# 停止服务并删除数据卷
docker compose down -v
```

## 下一步

恭喜！您已经成功启动了文物数据仪表板系统。

### 推荐后续操作
1. **数据导入**：参考 [数据与导入指南](data-guide.md) 导入您的文物数据
2. **功能探索**：尝试上传附件、创建知识图谱等功能
3. **运维学习**：阅读 [运维与排障指南](ops.md) 了解系统维护知识

### 获取帮助
- 查看项目GitHub Issues
- 查阅各模块的详细文档
- 联系开发团队获取支持

祝您使用愉快！

