#!/bin/sh
# Docker container bootstrap script
set -e

echo "等待MySQL数据库启动..."
sleep 15

echo "等待Neo4j数据库启动..."
sleep 15

echo "初始化Neo4j知识图谱..."
node ./scripts/init-neo4j.js

echo "启动后端应用服务..."
npm start
