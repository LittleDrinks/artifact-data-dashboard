@echo off
echo ========================================
echo 测试 D3-Force 知识图谱重构
echo ========================================
echo.

REM 检查 Docker 是否运行
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Docker 未运行，请先启动 Docker
    pause
    exit /b 1
)

echo [1/5] 检查前端依赖...
docker-compose exec frontend npm list d3 --depth=0 2>nul
if %errorlevel% equ 0 (
    echo [OK] D3.js 已安装
) else (
    echo [警告] D3.js 未安装，正在安装...
    docker-compose exec frontend npm install d3
)

echo.
echo [2/5] 检查后端 API 健康状态...
curl -s -o nul -w "状态码: %%{http_code}" http://localhost:3000/health
echo.

echo.
echo [3/5] 检查图谱 API...
curl -s -o nul -w "状态码: %%{http_code}" http://localhost:3000/api/graph
echo.

echo.
echo [4/5] 检查 Neo4j 连接...
curl -s -o nul -w "状态码: %%{http_code}" http://localhost:17474
echo.

echo.
echo [5/5] 检查前端应用...
curl -s -o nul -w "状态码: %%{http_code}" http://localhost:8080
echo.

echo.
echo ========================================
echo 测试完成！
echo ========================================
echo.
echo 访问地址：
echo   前端: http://localhost:8080
echo   后端 API: http://localhost:3000
echo   Swagger 文档: http://localhost:3000/api-docs
echo   Neo4j 浏览器: http://localhost:17474
echo.
echo 提示：
echo   - 登录后访问'知识图谱'页面查看 D3-Force 实现
echo   - 可以拖拽节点、缩放画布、点击节点查看详情
echo   - 修改 frontend/src/pages/KnowledgeGraph.js 会自动热重载
echo.
pause
