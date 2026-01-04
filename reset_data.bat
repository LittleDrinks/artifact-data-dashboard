@echo off

setlocal EnableExtensions EnableDelayedExpansion

set "ENV_FILE=.env"

if not exist "%ENV_FILE%" (
	echo [错误] 根目录 %ENV_FILE% 不存在。
	echo [操作] 请先从 .env.example 生成 .env 并填写 MYSQL_ROOT_PASSWORD。
	echo.
	pause
	exit /b 1
)

set "MYSQL_ROOT_PASSWORD="
set "MYSQL_DATABASE=artifact_dashboard"

set "NEO4J_USER=neo4j"
set "NEO4J_PASSWORD=password"

for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /C:"^MYSQL_ROOT_PASSWORD=" "%ENV_FILE%"`) do set "MYSQL_ROOT_PASSWORD=%%B"
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /C:"^MYSQL_DATABASE=" "%ENV_FILE%"`) do set "MYSQL_DATABASE=%%B"

for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /C:"^NEO4J_USER=" "%ENV_FILE%"`) do set "NEO4J_USER=%%B"
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /C:"^NEO4J_PASSWORD=" "%ENV_FILE%"`) do set "NEO4J_PASSWORD=%%B"

if "%MYSQL_ROOT_PASSWORD%"=="" (
	echo [错误] 未在 %ENV_FILE% 中找到 MYSQL_ROOT_PASSWORD。
	echo [操作] 请在 .env 中设置 MYSQL_ROOT_PASSWORD=... 后重试。
	echo.
	pause
	exit /b 1
)

echo [操作] 将重置 MySQL 数据库：%MYSQL_DATABASE%
echo [操作] 将同时重置 Neo4j 图数据库（删除 neo4j-data / neo4j-logs volumes）
echo.

rem --- Reset Neo4j (data is stored in named volumes; rebuild won't clear volumes) ---
rem Stop neo4j service if present
docker compose stop neo4j >nul 2>&1

rem Remove neo4j container to release volumes (ignore errors if container not found)
docker rm -f artifact-dashboard-neo4j >nul 2>&1

rem Remove neo4j named volumes (ignore errors if not found)
docker volume rm artifact-data-dashboard_neo4j-data >nul 2>&1
docker volume rm artifact-data-dashboard_neo4j-logs >nul 2>&1

rem Start neo4j again
docker compose up -d neo4j
if %errorlevel% neq 0 (
	echo [错误] Neo4j 重置/启动失败，请检查 docker compose 是否可用。
	pause
	exit /b 1
)

echo [操作] 等待 Neo4j 就绪...
set "NEO4J_READY=0"
for /L %%i in (1,1,60) do (
	docker exec artifact-dashboard-neo4j cypher-shell -u %NEO4J_USER% -p %NEO4J_PASSWORD% "RETURN 1;" >nul 2>&1
	if !errorlevel! equ 0 (
		set "NEO4J_READY=1"
		goto :neo4j_ready
	)
	timeout /t 2 /nobreak >nul
)
:neo4j_ready
if "%NEO4J_READY%"=="0" (
	echo [错误] Neo4j 未在预期时间内就绪。
	pause
	exit /b 1
)

echo [操作] 初始化 Neo4j 图数据（示例知识图谱）...
docker compose run --rm -T -e NEO4J_URI=bolt://neo4j:7687 -e NEO4J_USER=%NEO4J_USER% -e NEO4J_PASSWORD=%NEO4J_PASSWORD% backend node scripts/init-neo4j.js
if %errorlevel% neq 0 (
	echo [错误] Neo4j 初始化脚本执行失败。
	pause
	exit /b 1
)

docker exec -i artifact-dashboard-mysql mysql -uroot -p%MYSQL_ROOT_PASSWORD% -e "DROP DATABASE IF EXISTS %MYSQL_DATABASE%; CREATE DATABASE %MYSQL_DATABASE% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if %errorlevel% neq 0 (
	echo [错误] 执行数据库重置失败，请检查容器是否运行以及 MYSQL_ROOT_PASSWORD 是否正确。
	pause
	exit /b 1
)

docker exec -i artifact-dashboard-mysql mysql -uroot -p%MYSQL_ROOT_PASSWORD% %MYSQL_DATABASE% < backend/scripts/init-mysql.sql
if %errorlevel% neq 0 (
	echo [错误] 导入 init-mysql.sql 失败。
	pause
	exit /b 1
)

echo [完成] 数据已重置，请重启系统。
