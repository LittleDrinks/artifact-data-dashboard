# 知识图谱重构指南 - D3-Force 实现

## 变更摘要

本次重构将前端知识图谱从 Cytoscape.js 迁移到 D3.js 的力导向图（d3-force）实现。

## 主要变更

### 1. 依赖包变更 (frontend/package.json)

**移除的包：**
- `cytoscape: ^3.23.0`
- `cytoscape-fcose: ^2.2.0`
- `react-cytoscapejs: ^2.0.0`

**新增的包：**
- `d3: ^7.8.5`
- `d3-force: ^3.0.0`

### 2. 组件重构 (frontend/src/pages/KnowledgeGraph.js)

**核心变更：**

#### 从 Cytoscape 到 D3 的迁移

**之前（Cytoscape）：**
- 使用 `<CytoscapeComponent>` 渲染图谱
- 自定义物理引擎实现（手动计算弹簧力、排斥力、阻尼等）
- 使用 Cytoscape 的 COSE 布局算法
- 复杂的状态管理（600+ 行代码处理物理模拟）

**现在（D3-Force）：**
- 使用原生 SVG 元素渲染
- 使用 D3 内置的力模拟引擎
- 简洁的代码实现（约 200 行核心逻辑）
- 更好的性能和可维护性

#### D3-Force 功能特性

1. **力模拟配置：**
   ```javascript
   d3.forceSimulation(nodes)
     .force('link', d3.forceLink(links)        // 连接力
       .id(d => d.id)
       .distance(100)                          // 连接长度
       .strength(0.5))                         // 弹簧强度
     .force('charge', d3.forceManyBody()       // 节点排斥力
       .strength(-300)
       .distanceMax(400))
     .force('center', d3.forceCenter(...))     // 居中力
     .force('collision', d3.forceCollide()     // 碰撞检测
       .radius(30))
   ```

2. **交互功能：**
   - **缩放和平移：** 使用 `d3.zoom()` 实现画布缩放（0.1x - 4x）
   - **节点拖拽：** 使用 `d3.drag()` 实现平滑拖拽
   - **节点高亮：** 鼠标悬停时边框加粗
   - **节点点击：** 显示实体详情模态框

3. **视觉元素：**
   - **节点：** 圆形节点，半径 20px，根据类型着色
   - **连线：** 带箭头的连接线
   - **标签：** 节点下方显示标签，连线中间显示关系类型
   - **颜色方案：** 保持与原 Cytoscape 版本一致
     - artifact: #1890ff (蓝色)
     - category: #52c41a (绿色)
     - era: #fa8c16 (橙色)
     - author: #722ed1 (紫色)
     - location: #eb2f96 (粉色)
     - material: #f5222d (红色)

4. **自动布局：**
   - 初始加载时自动计算最佳缩放和居中
   - 使用 `getBBox()` 计算内容边界
   - 平滑过渡动画（750ms）

## Docker 调试指南

### 前置条件

1. 确保已安装 Docker 和 Docker Compose
2. 确保 `backend/.env` 文件存在（从 `.env.example` 复制）

### 启动开发环境

```bash
# 进入项目目录
cd e:\shared\workplace\artifact-data-dashboard

# 启动所有服务（首次启动会自动构建）
docker-compose up --build

# 或者后台运行
docker-compose up -d --build
```

### 服务端口

- **前端：** http://localhost:8080
- **后端 API：** http://localhost:3000
- **MySQL：** localhost:13306
- **Neo4j 浏览器：** http://localhost:17474
- **Neo4j Bolt：** bolt://localhost:17687
- **Redis：** localhost:16379

### 热重载配置

前端已配置热重载，修改代码后会自动刷新：

```yaml
# docker-compose.yml 中的前端配置
environment:
  - CHOKIDAR_USEPOLLING=true
  - WATCHPACK_POLLING=true
  - FAST_REFRESH=true
volumes:
  - ./frontend:/app
  - /app/node_modules
```

### 调试步骤

1. **启动服务：**
   ```bash
   docker-compose up
   ```

2. **查看日志：**
   ```bash
   # 查看所有服务日志
   docker-compose logs -f

   # 只查看前端日志
   docker-compose logs -f frontend

   # 只查看后端日志
   docker-compose logs -f backend
   ```

3. **访问应用：**
   - 打开浏览器访问 http://localhost:8080
   - 登录后导航到"知识图谱"页面

4. **修改代码：**
   - 编辑 `frontend/src/pages/KnowledgeGraph.js`
   - 保存后浏览器会自动刷新（热重载）

5. **查看效果：**
   - 在知识图谱页面可以：
     - 缩放画布（鼠标滚轮）
     - 拖动画布（鼠标拖拽空白处）
     - 拖动节点（鼠标拖拽节点）
     - 点击节点查看详情
     - 搜索关键词过滤图谱

### 常用 Docker 命令

```bash
# 停止所有服务
docker-compose down

# 停止并删除所有数据卷（重置数据库）
docker-compose down -v

# 重启单个服务
docker-compose restart frontend

# 进入容器内部调试
docker-compose exec frontend sh
docker-compose exec backend sh

# 查看容器状态
docker-compose ps

# 重新构建特定服务
docker-compose build frontend
docker-compose build backend
```

### 安装依赖

如果需要在 Docker 容器中安装新的 npm 包：

```bash
# 前端
docker-compose exec frontend npm install <package-name>

# 后端
docker-compose exec backend npm install <package-name>
```

## 性能优化

D3-Force 相比之前的 Cytoscape 实现有以下优势：

1. **更少的代码量：** 从 820 行减少到约 300 行
2. **原生力模拟：** 使用 D3 优化的物理引擎，性能更好
3. **更简单的状态管理：** 不需要手动管理大量 refs
4. **更好的可维护性：** 代码结构更清晰

## 功能对比

| 功能 | Cytoscape 版本 | D3-Force 版本 |
|------|---------------|---------------|
| 力导向布局 | ✓ (COSE) | ✓ (d3-force) |
| 节点拖拽 | ✓ | ✓ |
| 缩放平移 | ✓ | ✓ |
| 节点点击 | ✓ | ✓ |
| 节点高亮 | ✓ | ✓ |
| 搜索过滤 | ✓ | ✓ |
| 实体详情 | ✓ | ✓ |
| 自动布局 | ✓ | ✓ |
| 性能 | 中等 | 更好 |
| 代码量 | 820 行 | ~300 行 |

## 故障排除

### 问题：前端无法连接后端

**解决方案：**
- 检查 `frontend/package.json` 中的 proxy 配置：`"proxy": "http://backend:3000"`
- 确保所有容器都在同一网络（artifact-network）

### 问题：图谱不显示

**解决方案：**
- 打开浏览器控制台查看错误
- 检查后端 API 是否返回数据：访问 http://localhost:3000/api/graph
- 确保 Neo4j 数据库已初始化数据

### 问题：热重载不工作

**解决方案：**
- 确认 `docker-compose.yml` 中的环境变量已设置
- 检查文件卷挂载是否正确
- 重启前端容器：`docker-compose restart frontend`

### 问题：D3 图谱渲染异常

**解决方案：**
- 检查数据格式是否正确（nodes 和 edges 数组）
- 打开浏览器开发者工具检查 SVG 元素
- 确认 D3 库已正确安装：`docker-compose exec frontend npm list d3`

## 下一步改进

可以考虑的进一步优化：

1. **性能优化：**
   - 对大型图谱使用 Canvas 渲染替代 SVG
   - 实现节点聚合（节点数 > 100 时）
   - 添加虚拟化技术

2. **功能增强：**
   - 添加多选节点功能
   - 实现节点分组/聚类
   - 支持导出图谱为图片
   - 添加图谱布局算法选择（树形、径向等）

3. **视觉优化：**
   - 添加连线动画效果
   - 实现节点图标支持
   - 优化节点标签避免重叠

## 参考资源

- [D3.js 官方文档](https://d3js.org/)
- [D3-Force 文档](https://github.com/d3/d3-force)
- [Docker Compose 文档](https://docs.docker.com/compose/)
