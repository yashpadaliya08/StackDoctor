@echo off
title StackDoctor — Universal Deployment Platform Launcher
echo ========================================================
echo   Starting StackDoctor (Universal Deployment Platform)
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] Launching Backend Server (FastAPI on Port 8000)...
start "StackDoctor Backend (Port 8000)" cmd /k "cd /d "%~dp0" && python -m uvicorn server.main:app --host 127.0.0.1 --port 8000 --reload"

timeout /t 2 /nobreak >nul

echo [2/2] Launching Frontend Dashboard (Vite on Port 5173)...
start "StackDoctor Frontend (Port 5173)" cmd /k "cd /d "%~dp0web" && npm run dev -- --host 0.0.0.0 --port 5173"

timeout /t 2 /nobreak >nul

echo.
echo ========================================================
echo   StackDoctor is running independently!
echo   Dashboard URL: http://127.0.0.1:5173/
echo   API Docs URL:  http://127.0.0.1:8000/docs
echo ========================================================
echo.
echo Opening browser...
start http://127.0.0.1:5173/
pause
