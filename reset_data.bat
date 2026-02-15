@echo off
chcp 65001 >nul

setlocal EnableExtensions EnableDelayedExpansion

set "ENV_FILE=.env"

if not exist "%ENV_FILE%" (
	echo [ERROR] .env file not found in current directory.
	echo [INFO] Please copy .env.example to .env and set MYSQL_ROOT_PASSWORD.
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
	echo [ERROR] MYSQL_ROOT_PASSWORD not found in %ENV_FILE%
	echo [INFO] Please add: MYSQL_ROOT_PASSWORD=your_password
	echo.
	pause
	exit /b 1
)

echo [INFO] Resetting MySQL database: %MYSQL_DATABASE%
echo [INFO] Also resetting Neo4j graph database (removing neo4j-data / neo4j-logs volumes)
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
	echo [ERROR] Failed to start Neo4j container. Check if docker compose is available.
	pause
	exit /b 1
)

echo [INFO] Waiting for Neo4j to be ready...
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
	echo [ERROR] Neo4j did not become ready within timeout period.
	pause
	exit /b 1
)

echo [INFO] Initializing Neo4j graph data (knowledge graph)...
docker compose run --rm -T -e NEO4J_URI=bolt://neo4j:7687 -e NEO4J_USER=%NEO4J_USER% -e NEO4J_PASSWORD=%NEO4J_PASSWORD% backend node scripts/init-neo4j.js
if %errorlevel% neq 0 (
	echo [ERROR] Neo4j initialization script failed.
	pause
	exit /b 1
)

docker exec -i artifact-dashboard-mysql mysql -uroot -p%MYSQL_ROOT_PASSWORD% -e "DROP DATABASE IF EXISTS %MYSQL_DATABASE%; CREATE DATABASE %MYSQL_DATABASE% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if %errorlevel% neq 0 (
	echo [ERROR] Failed to recreate database. Check if MySQL container is running and MYSQL_ROOT_PASSWORD is correct.
	pause
	exit /b 1
)

set "SCRIPT_DIR=%~dp0"
docker exec -i artifact-dashboard-mysql mysql -uroot -p%MYSQL_ROOT_PASSWORD% %MYSQL_DATABASE% < "%SCRIPT_DIR%backend\scripts\init-mysql.sql"
if %errorlevel% neq 0 (
	echo [ERROR] Failed to execute init-mysql.sql
	pause
	exit /b 1
)

echo [INFO] Syncing MySQL data to Neo4j...
docker compose run --rm -T -e NEO4J_URI=bolt://neo4j:7687 -e NEO4J_USER=%NEO4J_USER% -e NEO4J_PASSWORD=%NEO4J_PASSWORD% backend node scripts/sync-mysql-to-neo4j.js
if %errorlevel% neq 0 (
	echo [WARNING] Failed to sync data to Neo4j, but MySQL initialization completed.
	echo [WARNING] You can manually sync later by running: docker compose exec backend node scripts/sync-mysql-to-neo4j.js
)

echo [SUCCESS] Database reset completed. System is ready.
echo.
pause
