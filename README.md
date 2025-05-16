# 文物大数据与人工智能集成系统

## 项目概述

本项目是一个综合性的文物数据管理和智能分析平台，集成了大数据分析、知识图谱和人工智能技术，旨在为文物研究、数字化保护和公众教育提供先进的技术支持。

## 系统架构

系统采用前后端分离架构，包括以下主要组件：

- **前端**：基于React和Ant Design构建的用户界面
- **后端**：基于Node.js和Express的RESTful API服务
- **数据库**：
  - MySQL：存储结构化文物信息和用户数据
  - Neo4j：构建文物知识图谱，展示文物间的关系网络
  - Redis：缓存和会话管理
- **AI集成**：利用MCP大模型API实现智能问答功能

## 开发与部署

### 开发环境
项目使用Docker Compose进行开发环境配置，开发模式下提供实时代码更新：

```bash
# 启动开发环境
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 生产环境
生产环境使用专用配置文件：

```bash
# 启动生产环境
docker-compose -f docker-compose.prod.yml up -d

# 查看生产环境日志
docker-compose -f docker-compose.prod.yml logs -f
```

## 核心功能

1. **文物数据管理**
   - 文物信息的增删改查
   - 多维度搜索和筛选
   - 文物状态追踪（编目、数字化、修复等）

2. **数据可视化分析**
   - 文物类别、年代、地区等多维统计图表
   - 数据趋势分析和预测
   - 词云分析文物描述信息

3. **知识图谱**
   - 可视化展示文物、朝代、地点、材质等实体间的关系
   - 交互式探索和查询
   - 路径分析和关系推理

4. **智能问答系统**
   - 基于MCP大模型的文物知识问答
   - 知识图谱辅助的精准回答
   - 多轮对话和上下文理解

## 技术栈

### 前端
- React.js：前端框架
- Ant Design：UI组件库
- ECharts：数据可视化图表
- vis.js：知识图谱交互可视化
- Axios：HTTP客户端

### 后端
- Node.js & Express：后端框架
- JWT：身份认证
- Sequelize：MySQL ORM
- neo4j-driver：Neo4j图数据库驱动
- Redis：缓存和会话存储
- Swagger：API文档生成

### 人工智能
- MCP大模型API：提供自然语言理解和生成能力
- 自定义意图识别：区分普通问答和知识图谱查询

## 部署指南

### 环境要求
- Docker和Docker Compose
- Node.js (开发环境)
- MySQL (可使用Docker)
- Neo4j (可使用Docker)
- Redis (可使用Docker)

### Docker部署步骤

1. 克隆代码仓库
```bash
git clone https://github.com/yourusername/artifact-data-dashboard.git
cd artifact-data-dashboard
```

2. 配置环境变量
```bash
# 编辑backend/.env文件设置数据库凭证和API密钥
```

3. 使用Docker Compose启动所有服务
```bash
docker-compose up -d
```

4. 访问应用
- 前端: http://localhost
- API文档: http://localhost:3000/api-docs
- Neo4j浏览器: http://localhost:7474

## 系统使用指南

### 管理员账户
- 用户名: admin
- 密码: admin123

### 知识图谱使用
1. 进入"知识图谱"页面
2. 使用顶部搜索框输入关键词
3. 点击节点可查看详情，拖拽可调整视图
4. 使用右侧控制面板过滤节点类型

### 智能问答
1. 进入"智能问答"页面
2. 在输入框中输入关于文物的问题
3. 系统将从知识图谱或大模型获取回答
4. 可查看历史对话记录

## 示例问题
- "四羊方尊是什么年代的文物？"
- "唐朝有哪些著名的文物？"
- "西周青铜器的特点是什么？"
- "文物保护有哪些重要原则？"
- "清明上河图的作者是谁？"
- "敦煌莫高窟有哪些珍贵壁画？"

## 系统截图
[此处可添加系统界面截图]

## API文档
详细的API文档请参见 [API文档](./api-doc.md) 或访问运行中系统的 `/api-docs` 端点。

## 联系方式
如有问题或建议，请联系：
- 邮箱：your.email@example.com
- 项目仓库：https://github.com/yourusername/artifact-data-dashboard
