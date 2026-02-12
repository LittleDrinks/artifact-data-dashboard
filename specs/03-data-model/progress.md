# 数据模型实现进度

## 实现状态

### MySQL 表实现状态

| 表名 | 状态 | 备注 |
|------|------|------|
| `users` | ✅ 已实现 | 用户认证、角色管理 |
| `artifacts` | ✅ 已实现 | 核心文物数据 |
| `documents` | ✅ 已实现 | 文献管理 |
| `folders` | ✅ 已实现 | 文件夹层级结构 |
| `attachments` | ✅ 已实现 | 多态关联附件系统 |
| `tags` | ✅ 已实现 | 标签定义 |
| `artifact_tags` | ✅ 已实现 | 多对多关联 |
| `import_tasks` | ✅ 已实现 | 异步导入任务跟踪 |
| `categories` | 📝 规划中 | 文物分类标准化 |

### Neo4j 节点标签实现状态

| 标签 | 状态 | 备注 |
|------|------|------|
| `Artifact` | ✅ 已实现 | 文物节点 |
| `Person` | ✅ 已实现 | 人物节点 |
| `Location` | ✅ 已实现 | 地点节点 |
| `Dynasty` | 📝 规划中 | 朝代节点 |
| `Event` | 📝 规划中 | 事件节点 |
| `Concept` | 📝 规划中 | 概念/主题节点 |
| `Document` | 📝 规划中 | 文献节点 |

---

## MySQL 与 Neo4j 同步问题

### 当前机制

1. 文物在 MySQL 中创建时，后端代码同时写入 Neo4j
2. 关系通过 AI 自动提取或人工标注录入

### 存在的问题（已知缺陷）

| 问题 | 严重程度 | 描述 |
|------|----------|------|
| 无事务保证 | 🔴 高 | MySQL 和 Neo4j 写入不在同一事务中，可能出现 MySQL 有数据但 Neo4j 没有 |
| 级联删除缺失 | 🔴 高 | 删除 MySQL 记录时，Neo4j 节点不会自动级联删除，导致数据残留 |
| 批量导入性能差 | 🟡 中 | 逐条插入 Neo4j，大文件导入时性能瓶颈明显 |
| 数据一致性 | 🟡 中 | 数据一致性完全靠业务代码保证，缺乏约束机制 |

### 建议改进方案

- 使用消息队列（如 RabbitMQ/Kafka）解耦双写逻辑
- 定期全量同步作为兜底方案
- 引入 Saga 模式处理分布式事务
- 添加数据一致性校验任务

---

## 索引使用情况

### MySQL 索引

| 表名 | 索引名 | 字段 | 用途 |
|------|--------|------|------|
| `users` | `PRIMARY` | `id` | 主键查询 |
| `users` | `username` | `username` | 登录验证（唯一） |
| `artifacts` | `PRIMARY` | `id` | 主键查询 |
| `artifacts` | `idx_era` | `era` | 年代筛选 |
| `artifacts` | `idx_category` | `category_id` | 分类筛选 |
| `attachments` | `PRIMARY` | `id` | 主键查询 |
| `attachments` | `idx_ref` | `ref_type`, `ref_id` | 多态关联查询 |
| `folders` | `PRIMARY` | `id` | 主键查询 |
| `folders` | `parent_id` | `parent_id` | 层级查询 |

### 待优化索引

| 表名 | 建议索引 | 理由 |
|------|----------|------|
| `artifacts` | `idx_name` | 名称搜索频繁 |
| `artifacts` | `idx_created_by` | 用户数据隔离查询 |
| `documents` | `idx_author` | 作者筛选 |
| `import_tasks` | `idx_status` | 按状态查询待处理任务 |

---

## 新数据源接入状态

### 百度百科博物馆数据

**文档**：[baidu-encyclopedia-datasource.md](./baidu-encyclopedia-datasource.md)

**爬虫代码**：`build_kg/crawler/baidu/`

**当前状态**：
- [x] 博物馆列表爬取代码完成
- [x] 文物列表爬取代码完成
- [x] 文物详情爬取代码完成
- [x] 基础数据清洗逻辑完成
- [ ] 字段标准化规则完善
- [ ] 数据入库脚本开发
- [ ] 图片下载与存储
- [ ] 增量更新机制

**预估数据量**：
| 类型 | 数量 |
|------|------|
| 博物馆 | 500+ |
| 文物 | 50,000+ |
| 图片 | 200,000+ |

**优先级**：🔴 高（v0.7 完成数据迁移）

---

## 数据备份策略

### MySQL 备份

```bash
# 全量备份
docker exec artifact-dashboard-mysqldump -u root -p$MYSQL_ROOT_PASSWORD artifact_dashboard > backup_$(date +%Y%m%d).sql
```

**建议策略**：
- 每日全量备份（凌晨 2 点）
- 保留最近 7 天备份
- 每月存档一份长期保留

### Neo4j 备份

```bash
# 导出图数据
docker exec artifact-dashboard-neo4j neo4j-admin dump --database=neo4j --to=/backups/neo4j_$(date +%Y%m%d).dump
```

**建议策略**：
- 每周全量导出
- 保留最近 4 份备份
- 重要变更后手动触发备份

### Redis 备份

```bash
# 持久化（RDB 已开启）
docker exec artifact-dashboard-redis redis-cli SAVE
```

**建议策略**：
- RDB 已配置自动保存（900s/1change, 300s/10change, 60s/10000change）
- 定期复制 RDB 文件到备份目录
