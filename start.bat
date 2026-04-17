@echo off
chcp 65001 >nul 2>nul

echo ============================================
echo   Starting Heritage Platform...
echo ============================================
echo.

echo [1/3] Starting Neo4j (Docker) ...
wsl -e bash -lic "docker start neo4j-add 2>/dev/null || docker run -d --name neo4j-add -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:5" >nul 2>nul
if errorlevel 1 (
    echo   [WARN] Neo4j start failed - graph features may not work
) else (
    echo   Neo4j: bolt://localhost:7687
)
echo.

echo [2/3] Starting Backend (FastAPI :8000) ...
cscript //nologo //e:vbscript "%~dp0start_hidden.vbs" "%~dp0backend" ".venv\Scripts\activate && python -m uvicorn app.main:app --reload --port 8000"

ping -n 4 127.0.0.1 >nul

echo [3/3] Starting Frontend (Vite :5173) ...
cscript //nologo //e:vbscript "%~dp0start_hidden.vbs" "%~dp0frontend" "npm run dev"

echo.
echo ============================================
echo   Done! Services running in background.
echo   Neo4j:    http://localhost:7474
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo   Login:    admin / admin123
echo ============================================
echo.

@rem Auto-close after 3 seconds
ping -n 4 127.0.0.1 >nul
