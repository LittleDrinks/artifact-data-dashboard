# 2025.5.10

github 学生认证白嫖 copilot
搞了好几天，发现其实是机器认证，只需要拿张纸手写一下信息就可以了
然后名字不要改掉，否则会 Revoked
权限到账很慢，说三天之内，真的三天才到账

# 2025.5.13

使用 `https://github.com/tech-shrimp/docker_image_pusher` 部署docker镜像站

前期工作的时候试着写了下文档，然后这次喂给 GPT-o4 mini 重写了文档

```
阅读doc/document.md中的内容，并根据其中的内容撰写开发文档readme.md。
您需要确保一个技术熟练的程序员可以根据您的文档独立开发出这个系统。必要时能可以生成一些html文件作为demo。
我担心某些功能可能有多种技术实现方式，请优先选择如下的框架：后端neo4j，前端react。请选择确保您的文档中不要出现模糊不清的表述
我担心document.md中提到的关于AI的部分内容可能不易于实现，因此您需要优先保证完成前后端文档的撰写（后端包括知识图谱的构建，但是不包括数据分析和智能问答，前端需要实现数据分析和智能问答的标签页或者说”入口“，但具体的交互逻辑待定），对于您无法确保正确的部分，请使用明显的记号标出，以供我修改
```



````
修改readme.md
1. 注明 [TODO]/[UNIMPLEMENTED] 的含义
2. 参考如下内容，进一步细化文档

## 1. 项目简介

本系统旨在为文物数据的管理、分析与智能化应用提供一站式解决方案。系统支持账户登录、关键词搜索、数据可视化大屏、词云分析、知识图谱（基于Neo4j）、智能问答（Neo4j+MCP大模型）等功能，适用于文博机构、研究人员及相关从业者。

---

## 2. 技术架构

- 前端：React/Vue + Ant Design/ECharts/D3.js
- 后端：Node.js (Express/Koa) 或 Python (FastAPI/Flask)
- 数据库：MySQL/PostgreSQL（结构化数据），Neo4j（知识图谱）
- AI服务：MCP大模型 API（智能问答）
- 其他：Redis（缓存）、Nginx（反向代理）、Docker（部署）

---

## 3. 功能模块与实现细节

### 3.1 账户登录

- 支持用户名/邮箱+密码登录，JWT鉴权。
- 密码加密存储（bcrypt）。
- 可扩展第三方登录（如OAuth2）。
- 前端实现登录表单，后端提供 `/api/auth/login`、`/api/auth/register` 等接口。

### 3.2 关键词搜索

- 支持对文物名称、描述、类别等字段的模糊搜索。
- 后端实现全文检索（如MySQL全文索引/Elasticsearch）。
- 前端提供搜索框，展示结果列表，支持分页。

### 3.3 数据大屏

- 采用 ECharts/D3.js 实现数据可视化大屏。
- 展示文物总量、分类分布、地域分布、年代分布等统计信息。
- 后端提供聚合统计接口，前端定时拉取数据。

### 3.4 词云分析

- 后端对文物描述、标签等字段进行分词与词频统计（可用jieba分词）。
- 前端用 ECharts/wordcloud.js 渲染词云图。
- 支持按类别、时间等维度筛选。

### 3.5 知识图谱（Neo4j）

- Neo4j 存储文物实体、属性及关系（如“出土地-文物-年代-人物”等）。
- 后端通过 Neo4j Driver 提供图谱查询、可视化接口。
- 前端用 D3.js/cytoscape.js 展示知识图谱，支持节点点击、关系探索。

### 3.6 智能问答（Neo4j+MCP大模型）

- 用户输入自然语言问题。
- 后端调用 MCP 大模型 API 进行意图识别、问题解析。
- 若为结构化查询，自动生成 Cypher 查询，检索 Neo4j 数据。
- 若为复杂问答，结合大模型生成答案。
- 前端实现问答交互界面，支持上下文对话。

---

## 4. 数据库设计

### 4.1 结构化数据库（MySQL/PostgreSQL）

- 用户表（users）：id, username, email, password_hash, role, created_at
- 文物表（artifacts）：id, name, description, category, era, location, image_url, tags, created_at
- 操作日志表（logs）：id, user_id, action, target_id, timestamp

### 4.2 知识图谱（Neo4j）

- 节点类型：文物、地点、年代、人物、事件等
- 关系类型：出土于、属于、相关于、参与等

---

## 5. 部署与运维

- 推荐使用 Docker Compose 管理多服务部署（Web、API、DB、Neo4j、AI服务）。
- Nginx 统一反向代理，支持 HTTPS。
- 日志与监控：Prometheus + Grafana。
- 数据定期备份，Neo4j 图谱数据单独备份。

---

## 6. 安全与权限

- JWT 鉴权，接口权限校验。
- 管理员/普通用户权限分级。
- 防止SQL注入、XSS、CSRF等常见安全风险。

---

## 7. 开发建议

- 前后端分离，接口RESTful设计。
- 代码模块化，注重可扩展性与可维护性。
- 单元测试与接口测试覆盖主要功能。
- 文档完善，接口文档建议用Swagger/OpenAPI生成。

---

## 8. 参考资源

- [Neo4j 官方文档](https://neo4j.com/docs/)
- [MCP大模型 API 文档]（根据实际接入的API补充）
- [ECharts 文档](https://echarts.apache.org/)
- [Ant Design](https://ant.design/) https://element-plus.org/)
- [Docker 官方文档](https://docs.docker.com/)

---

## 9. 目录结构建议

```
         # 前端项目
          # 后端服务
               # 数据库脚本
            # 图谱建模与脚本
             # 项目文档

README.md
```

---

## 10. 联系与支持

如有问题或建议，请联系项目维护者或提交 Issue。
````


写完文档之后建了 github 的仓库，添加 remote 然后 push 了一发，之后交给 Claude 3.7 Sonnet 开写


```
根据 `doc/readme.md` 中的内容完成前后端的开发。
```


写完之后用 docker 部署的时候遇到了点问题，交给 Claude 各种修理，比如：


```
请确保您在dockerfile中正确使用了我在doc/readme.md中提到的镜像站。如果需要指定库的版本，请修改doc/images.txt
```


貌似 docker 配好了，代码好不好不太清楚，之后再说
