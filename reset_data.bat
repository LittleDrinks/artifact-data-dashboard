@echo off

setlocal EnableExtensions

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

for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /C:"^MYSQL_ROOT_PASSWORD=" "%ENV_FILE%"`) do set "MYSQL_ROOT_PASSWORD=%%B"
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /C:"^MYSQL_DATABASE=" "%ENV_FILE%"`) do set "MYSQL_DATABASE=%%B"

if "%MYSQL_ROOT_PASSWORD%"=="" (
	echo [错误] 未在 %ENV_FILE% 中找到 MYSQL_ROOT_PASSWORD。
	echo [操作] 请在 .env 中设置 MYSQL_ROOT_PASSWORD=... 后重试。
	echo.
	pause
	exit /b 1
)

echo [操作] 将重置 MySQL 数据库：%MYSQL_DATABASE%
echo.

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

echo [完成] 数据已重置。
pause