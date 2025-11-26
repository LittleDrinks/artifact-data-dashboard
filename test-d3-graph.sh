#!/bin/bash

echo "========================================"
echo "测试 D3-Force 知识图谱重构"
echo "========================================"
echo ""

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "[错误] Docker 未运行，请先启动 Docker"
    exit 1
fi

echo "[1/5] 检查前端依赖..."
docker-compose exec frontend npm list d3 --depth=0 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ D3.js 已安装"
else
    echo "✗ D3.js 未安装，正在安装..."
    docker-compose exec frontend npm install d3 d3-force
fi

echo ""
echo "[2/5] 检查后端 API 健康状态..."
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
if [ "$response" = "200" ]; then
    echo "✓ 后端 API 正常运行"
else
    echo "✗ 后端 API 未响应 (状态码: $response)"
fi

echo ""
echo "[3/5] 检查图谱 API..."
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/graph)
if [ "$response" = "200" ]; then
    echo "✓ 图谱 API 正常"
    # 获取节点和边的数量
    data=$(curl -s http://localhost:3000/api/graph)
    echo "  数据统计: $data" | grep -o '"nodes":\[.*\],"edges":\[.*\]' | head -1
else
    echo "✗ 图谱 API 异常 (状态码: $response)"
fi

echo ""
echo "[4/5] 检查 Neo4j 连接..."
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:17474)
if [ "$response" = "200" ]; then
    echo "✓ Neo4j 浏览器可访问"
else
    echo "✗ Neo4j 浏览器不可访问 (状态码: $response)"
fi

echo ""
echo "[5/5] 检查前端应用..."
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080)
if [ "$response" = "200" ]; then
    echo "✓ 前端应用正常运行"
else
    echo "✗ 前端应用未响应 (状态码: $response)"
fi

echo ""
echo "========================================"
echo "测试完成！"
echo "========================================"
echo ""
echo "访问地址："
echo "  前端: http://localhost:8080"
echo "  后端 API: http://localhost:3000"
echo "  Swagger 文档: http://localhost:3000/api-docs"
echo "  Neo4j 浏览器: http://localhost:17474"
echo ""
echo "提示："
echo "  - 登录后访问'知识图谱'页面查看 D3-Force 实现"
echo "  - 可以拖拽节点、缩放画布、点击节点查看详情"
echo "  - 修改 frontend/src/pages/KnowledgeGraph.js 会自动热重载"
echo ""
