@echo off
chcp 65001 >nul 2>nul

echo ============================================
echo   Stopping Heritage Platform...
echo ============================================
echo.

echo [1/2] Stopping Backend (port 8000) ...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>nul
    echo   Killed PID %%a
)

echo [2/2] Stopping Frontend (port 5173) ...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>nul
    echo   Killed PID %%a
)

echo.
echo   All services stopped.
echo.
pause
