# 文物大数据与人工智能集成系统

[![项目状态](https://img.shields.io/badge/状态-功能基本完整-green.svg)](https://github.com/LittleDrinks/artifact-data-dashboard)
[![技术栈](https://img.shields.io/badge/技术栈-React%20%7C%20Node.js%20%7C%20Neo4j%20%7C%20MySQL-blue.svg)](https://github.com)
[![Docker](https://img.shields.io/badge/部署-Docker%20Compose-2496ED.svg?logo=docker)](https://github.com)

## 项目概述

本项目是一个文物数据管理和智能分析平台，集成了大数据分析、知识图谱和人工智能技术。系统**功能基本完整**，包括用户管理、文物搜索、数据可视化、知识图谱、智能问答和词云分析等核心功能，适用于文博机构、研究人员及文物爱好者。

> **📌 功能说明**：除个人信息编辑功能外，其他核心功能均已实现并可正常使用。智能问答功能在无外部API配置时会使用内置模拟回答。

## 系统架构

系统采用现代化的前后端分离架构：

### 🎨 前端技术栈
- **React 18.2.0** + **React Router 6** - 现代化单页应用
- **Ant Design 5.4.6** - 企业级UI组件库
- **ECharts 5.4.2** + **ECharts-WordCloud 2.1.0** - 专业数据可视化
- **Cytoscape.js 3.23.0** - 知识图谱交互式可视化
- **Axios** - HTTP客户端

### 🔧 后端技术栈
- **Node.js** + **Express 4.18.2** - 高性能Web服务器
- **JWT + bcrypt** - 安全的身份认证
- **Swagger UI** - 自动化API文档
- **Express Rate Limit + Helmet** - 安全防护

### 💾 数据存储
- **MySQL 8.0** - 结构化文物数据和用户信息
- **Neo4j 5.x** - 知识图谱存储和查询
- **Redis 7.x** - 缓存和会话管理

### 🤖 AI集成
- **MCP大模型API** - 智能问答服务
- **NodeJieba 2.5.2** - 中文分词和词云分析
- **智能意图识别** - 区分知识图谱查询和通用问答

## ✨ 核心功能（已实现）

### 🔐 用户认证系统
- **JWT令牌认证** - 安全的无状态身份验证
- **bcrypt密码加密** - 行业标准密码保护
- **角色权限管理** - 管理员/普通用户权限控制
- **用户资料管理** - 完整的用户信息维护

### 🔍 智能搜索系统
- **全文搜索** - 基于MySQL FULLTEXT索引的高效搜索
- **多维筛选** - 按类别、年代、地点等维度过滤
- **模糊匹配** - 智能匹配文物名称、描述和标签
- **分页展示** - 优化的搜索结果展示

### 📊 数据可视化大屏
- **实时统计** - 文物总量、状态分布统计
- **ECharts图表** - 专业的柱状图、饼图、折线图
- **多维分析** - 按类别、年代、地区的数据分析
- **响应式设计** - 适配不同屏幕尺寸

## ⚠️ 核心功能（未实现）

### ☁️ 词云分析
- **中文分词** - 基于NodeJieba的智能分词
- **词频统计** - 文物描述和标签的词频分析
- **动态词云** - ECharts WordCloud可视化
- **自定义筛选** - 支持按类别和时间筛选

### 🕸️ 知识图谱
- **Neo4j支持** - 专业图数据库存储
- **Cytoscape.js可视化** - 交互式图谱展示
- **多类型节点** - 文物、朝代、地点、材质等实体
- **关系探索** - 点击节点查看详情和关联关系
- **动态布局** - 自适应图谱布局算法

### 🤖 智能问答系统
- **MCP大模型集成** - 支持自然语言问答
- **意图识别** - 自动区分知识图谱查询和通用问答
- **上下文对话** - 多轮对话支持
- **降级处理** - API不可用时自动使用模拟回答
- **对话历史** - 完整的聊天记录管理

### 👤 个人信息管理
- **用户资料查看** - 查看个人基本信息和角色权限
- **账户信息展示** - 显示用户名、邮箱、注册时间等
- **登录历史** - 查看操作日志记录


### 🛠️ 系统诊断
- **健康检查** - 数据库连接状态监控
- **调试界面** - 系统状态实时查看
- **错误处理** - 完善的错误捕获和用户提示
- **日志记录** - 详细的操作日志

## 🗄️ 数据库设计

### MySQL 结构化数据
```sql
-- 用户表
users: id, username, email, password_hash, role, created_at, updated_at

-- 文物表
artifacts: id, name, description, category, era, location, 
           image_url, tags, is_cataloged, is_digitized, 
           needs_repair, created_at, updated_at

-- 操作日志表
logs: id, user_id, action, target_id, timestamp, details
```

### Neo4j 知识图谱
```cypher
// 节点标签与属性
(:Artifact {
   id,
   name,
   description,
   tags,
   isCataloged,
   isDigitized,
   needsRepair
})
(:Era {name, startYear, endYear})
(:Category {name, description})
(:Dimension {label, value, unit})
(:Material {name, description})
(:Location {name, region, longitude, latitude})
(:DamageType {name, severity, description})
(:RestorationMethod {name, description})
(:ReinforcementMethod {name, description})
(:InspectionTechnique {name, description})
(:ProtectiveMaterial {name, description})
(:InspectionMetric {name, unit, idealRange})

// 关系类型
(:Artifact)-[:BELONGS_TO_ERA]->(:Era)
(:Artifact)-[:HAS_CATEGORY]->(:Category)
(:Artifact)-[:HAS_DIMENSION]->(:Dimension)
(:Artifact)-[:MADE_OF]->(:Material)
(:Artifact)-[:STORED_AT]->(:Location)
(:Artifact)-[:HAS_DAMAGE]->(:DamageType)
(:Artifact)-[:USES_RESTORATION]->(:RestorationMethod)
(:Artifact)-[:USES_REINFORCEMENT]->(:ReinforcementMethod)
(:Artifact)-[:INSPECTED_BY]->(:InspectionTechnique)
(:Artifact)-[:MEASURED_BY]->(:InspectionMetric)
(:Artifact)-[:PROTECTED_WITH]->(:ProtectiveMaterial)
```

## 🚀 快速开始

### 环境要求
- Docker 20.10+ 和 Docker Compose 2.0+
- 4GB+ 可用内存（推荐8GB）
- 20GB+ 可用磁盘空间

### 一键部署

1. **克隆项目**
```bash
git clone https://github.com/yourusername/artifact-data-dashboard.git
cd artifact-data-dashboard
```

2. **配置环境变量**
```bash
# 复制环境变量模板
cp backend/.env.example backend/.env

# 编辑配置文件，设置数据库密码和API密钥
notepad backend/.env  # Windows
# 或
nano backend/.env     # Linux/Mac
```

3. **启动所有服务**
```bash
# 开发环境（支持热重载）
docker-compose up -d

# 生产环境
docker-compose -f docker-compose.prod.yml up -d
```

4. **访问应用**
- **前端界面**: http://localhost:8080
- **API文档**: http://localhost:3000/api-docs
- **Neo4j浏览器**: http://localhost:7474

### 默认账户
- **用户名**: `admin`
- **密码**: `admin123`

## 📱 功能使用指南

### 文物搜索
1. 登录系统后进入"文物搜索"页面
2. 在搜索框中输入关键词（支持文物名称、描述、标签）
3. 使用筛选器按类别、年代、地点等维度过滤
4. 点击搜索结果查看详细信息

### 数据可视化
1. 访问"数据大屏"查看文物统计信息
2. 查看文物总量、编目状态、数字化进度等指标
3. 通过图表分析文物的类别分布、年代分布等

### 知识图谱探索
1. 进入"知识图谱"页面
2. 使用搜索框输入关键词过滤节点
3. 点击节点查看详细信息和关联关系
4. 拖拽节点调整视图，双击展开关联节点

### 智能问答
1. 进入"智能问答"页面
2. 输入关于文物的问题，如：
   - "四羊方尊是什么年代的文物？"
   - "商代有哪些著名的青铜器？"
   - "文物保护的基本原则是什么？"
3. 系统会自动判断是查询知识图谱还是调用AI模型
4. 查看历史对话记录

### 词云分析
1. 访问"词云分析"页面
2. 系统自动分析文物描述和标签文本
3. 生成动态词云，字体大小反映词频
4. 支持按类别筛选分析范围

## 🔧 开发环境设置

### 本地开发
```bash
# 后端开发
cd backend
npm install
npm run dev  # 启动开发服务器

# 前端开发
cd frontend
npm install
npm start    # 启动React开发服务器
```

### 数据库初始化
```bash
# MySQL数据初始化
docker exec -i artifact-dashboard-mysql mysql -u root -p[密码] artifact_db < backend/scripts/init-mysql.sql

# Neo4j数据初始化
docker exec artifact-dashboard-backend node /app/scripts/init-neo4j.js
```

### Excel导入格式要求
- Excel 工作簿需要使用 `backend/src/routes/debug.routes.js` 导出的结构，以确保节点与关系表字段一致。
- **工作表命名**：保留系统预期的多表结构，其中包括 `Artifacts`、`Categories`、`Eras`、`Materials`、`Locations` 等节点表，以及 `REL_HAS_CATEGORY`、`REL_BELONGS_TO_ERA` 等关系表；名称长度建议≤31字符。
- **字段列名**：每个工作表必须保持固定列顺序，例如 `Artifacts` 需要包含 `artifact_id`、`name`、`description`、`tags`、`isCataloged`、`isDigitized`、`needsRepair`；关系表应使用 `artifact_id` 与关联实体字段（如 `category_name`）。
- **值约定**：布尔值采用 `TRUE`/`FALSE`；多值字段使用英文分号分隔；空值留空即可，无需填充 `NULL`。

### JSON/dict → Excel：只提供关键函数（无独立脚本）

为便于你直接“套用并添加自己的逻辑”，仓库不在文档中提供独立导出脚本；请直接复用 `build_kg/convert_artifact_to_excel.py` 中的关键函数 `derive_export_payload()`。

当你的输入是“爬虫/原始 dict”（顶层 `artifact_id -> payload`）时，payload 内会被读取的字段如下（其余字段可忽略）：

- `name`：文物名称（建议提供）
- 组成 `description` 的可选字段：`note`、`sourceDetail`、`deptSizeInfo`、`explainTxt`（允许 HTML）
- 组成 `tags` 的可选字段：`categoryName`、`levelName`、`yearInfo`（用 `; ` 拼接）
- 类别：`categoryName` 或 `categoryInfo`（用于类别名）；`categoryInfo` 也会作为类别描述
- 年代：`yearStartName` 或 `yearInfo`（用于年代名）；`yearStart` / `yearEnd`（起止年份）

最小复用方式（你自己的脚本/Notebook 中）：

```python
from pathlib import Path

from build_kg.convert_artifact_to_excel import derive_export_payload, load_json, write_workbook

raw_payload = load_json(Path("artifact.json"))
prepared_payload = derive_export_payload(raw_payload)
write_workbook(prepared_payload, Path("output.xlsx"))
```

## 📋 API文档

系统提供完整的RESTful API，支持Swagger在线文档：

### 主要API端点
- **认证**: `/api/auth/*` - 登录、注册、用户管理
- **文物**: `/api/artifacts/*` - 文物CRUD操作
- **统计**: `/api/stats/*` - 数据统计和图表数据
- **图谱**: `/api/graph/*` - 知识图谱查询
- **问答**: `/api/chat/*` - 智能问答服务
- **词云**: `/api/wordcloud/*` - 词云数据生成

访问 `http://localhost:13000/api-docs` 查看完整API文档。

## 🐳 Docker部署详情

### 服务组件
- **frontend**: React应用 (端口8080)
- **backend**: Node.js API服务 (端口13000)
- **mysql**: MySQL 8.0数据库 (端口3306)
- **neo4j**: Neo4j图数据库 (端口7474, 7687)
- **redis**: Redis缓存 (端口6379)

### 镜像说明
项目使用自定义镜像仓库：
```
crpi-kl2yo8a1hefddu65.cn-hangzhou.personal.cr.aliyuncs.com/csj_images/
```

### 数据持久化
- MySQL数据: `./data/mysql`
- Neo4j数据: `./data/neo4j`
- Redis数据: `./data/redis`
- 应用日志: `./backend/logs`

## 🔒 安全特性

- **密码加密**: bcrypt哈希算法
- **JWT认证**: 无状态令牌验证
- **CORS保护**: 跨域请求控制
- **限流保护**: 防止API滥用
- **输入验证**: 严格的参数校验
- **错误处理**: 安全的错误信息返回

## 🚧 已知限制与问题

### ⚠️ 功能限制
1. **个人信息更新功能** - 用户资料编辑和更新功能尚未实现，只能查看不能修改
2. **AI服务依赖** - 智能问答功能需要MCP API配置，未配置时使用模拟回答
3. **中文优化** - 系统主要针对中文文物数据优化
4. **单机部署** - 当前版本为单机部署，未支持集群
5. **备份机制** - 需要手动配置数据库备份策略

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证



## 📞 联系方式

- **项目维护者**: LittleDrinks
- **邮箱**: 2635836894@qq.com
- **项目地址**: https://github.com/LittleDrinks/artifact-data-dashboard

