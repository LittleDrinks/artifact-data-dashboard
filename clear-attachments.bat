@echo off
chcp 65001 >nul
echo ====================================================
echo 清空所有附件
echo ====================================================
echo.
echo 此脚本将删除所有附件文件和数据库记录！
echo.

set /p confirm="确定要继续吗? (输入 YES 确认): "
if /i not "%confirm%"=="YES" (
    echo 操作已取消。
    pause
    exit /b 0
)

echo.
echo 正在清空附件...
docker compose exec backend node scripts/clear-all-attachments.js --force

if %ERRORLEVEL% neq 0 (
    echo.
    echo 清空失败！请检查容器是否正在运行。
    pause
    exit /b 1
)

echo.
echo 附件已清空完成！
pause
