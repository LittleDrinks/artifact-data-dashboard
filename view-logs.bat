@echo off
echo ========================================
echo 查看服务日志
echo ========================================
echo.

echo 选择要查看的服务日志：
echo 1. 所有服务
echo 2. 前端 (frontend)
echo 3. 后端 (backend)
echo 4. MySQL
echo 5. Neo4j
echo 6. Redis
echo.

set /p choice="请输入选项 (1-6): "

if "%choice%"=="1" (
    echo 查看所有服务日志...
    docker-compose logs -f
) else if "%choice%"=="2" (
    echo 查看前端日志...
    docker-compose logs -f frontend
) else if "%choice%"=="3" (
    echo 查看后端日志...
    docker-compose logs -f backend
) else if "%choice%"=="4" (
    echo 查看 MySQL 日志...
    docker-compose logs -f mysql
) else if "%choice%"=="5" (
    echo 查看 Neo4j 日志...
    docker-compose logs -f neo4j
) else if "%choice%"=="6" (
    echo 查看 Redis 日志...
    docker-compose logs -f redis
) else (
    echo 无效选项
    pause
)
