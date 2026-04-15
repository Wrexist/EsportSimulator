@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Esports Manager ^(Local ^& Dev^)
color 0b
cls

set "NEED_INSTALL=0"

echo ===================================================
echo   ESPORTS MANAGER - LOCAL PLAY
echo ===================================================
echo.
echo [1] Checking Node.js...
node -v >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed!
    pause
    exit /b 1
)

echo [2] Checking project dependencies...
if not exist "node_modules\.bin\concurrently.cmd" set "NEED_INSTALL=1"
if not exist "node_modules\.bin\next.cmd" set "NEED_INSTALL=1"
if not exist "node_modules\electron\dist\electron.exe" set "NEED_INSTALL=1"

if "%NEED_INSTALL%"=="1" (
    echo     First run or incomplete install detected.
    echo     Installing missing packages. This can take a few minutes...
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        echo.
        echo Dependency installation failed.
        pause
        exit /b 1
    )
)

if not exist "node_modules\.bin\concurrently.cmd" (
    echo Error: Dev launcher dependencies are still missing after install.
    pause
    exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
    echo Error: Electron install is incomplete. Try running PLAY_DEV again.
    pause
    exit /b 1
)

echo [3] Launching Next.js + Electron...
echo     Cleaning up stale local dev processes...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$root = (Resolve-Path '.').Path; " ^
    "$targets = Get-CimInstance Win32_Process | Where-Object { " ^
    "  ($_.Name -in @('node.exe','electron.exe')) -and $_.CommandLine -like ('*' + $root + '*')" ^
    "}; " ^
    "$targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 /nobreak >nul
call npm run electron:dev
set "EXIT_CODE=%errorlevel%"

echo.
echo Closing...
exit /b %EXIT_CODE%
