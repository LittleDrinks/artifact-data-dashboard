@echo off
chcp 65001 >nul 2>nul

echo ============================================
echo   Starting Heritage Platform...
echo ============================================
echo.

echo [1/2] Starting Backend (FastAPI :8000) ...
start "Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\activate && python -m uvicorn app.main:app --reload --port 8000"

ping -n 4 127.0.0.1 >nul

echo [2/2] Starting Frontend (Vite :5173) ...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================
echo   Done!
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo   Login:    admin / admin123
echo ============================================
echo.
pause
