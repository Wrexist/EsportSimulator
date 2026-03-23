@echo off
title Esports Manager (Local & Dev)
color 0b
cls

echo ===================================================
echo   ESPORTS MANAGER - LOCAL PLAY
echo ===================================================
echo.
echo [1] Checking Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed!
    pause
    exit
)

echo [2] Starting Game Engine (Dev Mode)...
echo     Wait for "Ready"...
start /B npm run dev >nul 2>&1

:: Wait for port 3000
:waitloop
timeout /t 2 /nobreak >nul
netstat -an | find "3000" | find "LISTENING" >nul
if %errorlevel% neq 0 goto waitloop

echo [3] Launching Electron...
call npx electron .

echo.
echo Closing...
taskkill /F /IM node.exe >nul 2>&1
exit
