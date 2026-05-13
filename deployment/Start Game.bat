@echo off
title Esports Manager Simulator Launcher
color 0b
cls

echo ===================================================
echo   ESPORTS MANAGER SIMULATOR - LAUNCHER
echo ===================================================
echo.
echo [1/3] Checking environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed!
    pause
    exit
)

echo [2/3] Starting Game Engine...
start /B npm run start >nul 2>&1

:waitloop
timeout /t 2 /nobreak >nul
netstat -an | find "3000" | find "LISTENING" >nul
if %errorlevel% neq 0 goto waitloop

echo [3/3] Launching Game...
call npx electron .

taskkill /F /IM node.exe >nul 2>&1
exit
