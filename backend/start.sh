#!/bin/sh
# 初始化脚本 - 在Docker容器启动后运行

# 等待数据库准备就绪
echo "等待MySQL数据库启动..."
sleep 15

# 等待Neo4j数据库准备就绪
echo "等待Neo4j数据库启动..."
sleep 15

# 初始化Neo4j知识图谱
echo "初始化Neo4j知识图谱..."
node ./scripts/init-neo4j.js

# 启动应用
echo "启动后端应用服务..."
npm start
