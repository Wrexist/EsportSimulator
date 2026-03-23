@echo off
title Repairing Build Dependencies
cd /d "%~dp0.."

set "SOURCE=%CD%\node_modules"
set "DEST=%CD%\SteamBuild\app\node_modules"

echo ===================================================
echo   REPAIRING NODE_MODULES
echo ===================================================
echo Source: %SOURCE%
echo Dest:   %DEST%
echo.

if not exist "%SOURCE%" (
    echo ERROR: Source node_modules missing!
    pause
    exit /b
)

if not exist "%DEST%" mkdir "%DEST%"

echo Copying node_modules (this is robust mode, please wait)...
:: /E = Recursive
:: /J = Unbuffered I/O (faster for big files)
:: /MT:32 = 32 threads (faster for small files)
:: /NFL /NDL = No file/dir logging (faster)
:: /R:3 /W:1 = Retry 3 times, wait 1 sec
robocopy "%SOURCE%" "%DEST%" /E /J /MT:32 /R:3 /W:1 /NFL /NDL

if %ERRORLEVEL% LSS 8 (
    echo.
    echo SUCCESS: node_modules copied.
    echo You can now run "Launch Game.bat" in SteamBuild.
) else (
    echo.
    echo ERROR: Robocopy failed with code %ERRORLEVEL%.
)
pause
