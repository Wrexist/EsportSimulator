@echo off
setlocal EnableDelayedExpansion
title Esports Manager Simulator
color 0b

:: Re-entry guard: if port 3000 is already in use, game is running
netstat -an 2>nul | find ":3000" | find "LISTENING" >nul
if %errorlevel% equ 0 (
    echo Game is already running.
    exit /b 0
)

:: Set paths relative to this script
set "SCRIPT_DIR=%~dp0"
set "GAME_DIR=%SCRIPT_DIR%game"
set "RUNTIME_DIR=%SCRIPT_DIR%runtime"
set "NODE_EXE=%RUNTIME_DIR%\node.exe"

:: Verify node exists
if not exist "%NODE_EXE%" (
    echo ERROR: Game runtime not found!
    echo Please verify game files through Steam.
    pause
    exit /b 1
)

:: Start Next.js production server in background and capture its PID
cd /d "%GAME_DIR%"
start /B "" "%NODE_EXE%" node_modules\next\dist\bin\next start >nul 2>&1

:: Capture the PID of the node server we just started
for /f "tokens=2" %%a in ('wmic process where "CommandLine like '%%next start%%' and Name='node.exe'" get ProcessId /format:list 2^>nul ^| find "="') do set "NODE_PID=%%a"

:: Wait for server to be ready (check port 3000)
echo Starting game engine...
:waitloop
timeout /t 1 /nobreak >nul
netstat -an 2>nul | find ":3000" | find "LISTENING" >nul
if %errorlevel% neq 0 goto waitloop

:: Launch Electron
echo Launching game...
if exist "%GAME_DIR%\node_modules\electron\dist\electron.exe" (
    "%GAME_DIR%\node_modules\electron\dist\electron.exe" .
) else (
    "%NODE_EXE%" node_modules\electron\cli.js .
)

:: Cleanup only our game's node process when Electron closes
if defined NODE_PID (
    taskkill /F /PID %NODE_PID% >nul 2>&1
) else (
    :: Fallback: kill only the specific next start process
    for /f "tokens=2" %%a in ('wmic process where "CommandLine like '%%next start%%' and Name='node.exe'" get ProcessId /format:list 2^>nul ^| find "="') do taskkill /F /PID %%a >nul 2>&1
)
exit
