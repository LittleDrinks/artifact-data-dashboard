@echo off
echo ========================================
echo 启动文物数据看板 - Docker 开发环境
echo ========================================
echo.

REM 检查 Docker 是否运行
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Docker 未运行，请先启动 Docker Desktop
    pause
    exit /b 1
)

echo [检查] Docker 正在运行...
echo.

REM 检查 .env 文件
if not exist "backend\.env" (
    echo [警告] backend\.env 文件不存在
    echo [操作] 从 .env.example 创建 .env 文件...
    copy "backend\.env.example" "backend\.env"
    echo [完成] .env 文件已创建
    echo.
)

echo [提示] 即将启动以下服务：
echo   - 前端 (React): http://localhost:8080
echo   - 后端 (Express): http://localhost:3000
echo   - MySQL: localhost:13306
echo   - Neo4j: http://localhost:17474
echo   - Redis: localhost:16379
echo.

echo [操作] 正在构建并启动 Docker 容器...
echo.

docker-compose up --build

REM 如果用户按 Ctrl+C 停止，显示清理提示
echo.
echo [提示] 容器已停止
echo.
echo 常用命令：
echo   启动: docker-compose up
echo   后台启动: docker-compose up -d
echo   停止: docker-compose down
echo   查看日志: docker-compose logs -f
echo   重置数据: docker-compose down -v
echo.
pause
