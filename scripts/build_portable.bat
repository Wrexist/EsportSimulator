@echo off
setlocal EnableDelayedExpansion
title Portable Build Creator
cd /d "%~dp0.."

set "SOURCE=%CD%"
set "DEST=%CD%\SteamBuild"
set "APP=%DEST%\app"
set "BIN=%DEST%\bin"

echo ===================================================
echo   PORTABLE BUILD CREATOR (BATCH)
echo ===================================================
echo Source: %SOURCE%
echo Dest:   %DEST%
echo.

if exist "%DEST%" (
    echo Cleaning old build...
    rmdir /s /q "%DEST%"
)
mkdir "%DEST%"
mkdir "%APP%"
mkdir "%BIN%"

echo [1/3] Embedding Node.js...
:: Try standard path
if exist "C:\Program Files\nodejs\node.exe" (
    copy "C:\Program Files\nodejs\node.exe" "%BIN%\node.exe" >nul
) else (
    echo WARNING: node.exe not found at standard path. Trying to find it...
    for /f "delims=" %%F in ('where node') do copy "%%F" "%BIN%\node.exe" >nul
)

if not exist "%BIN%\node.exe" (
    echo ERROR: Could not find node.exe!
    pause
    exit /b 1
)
echo Node.exe embedded.

echo [2/3] Mirroring Game Files (Robocopy)...
:: Exclude: .git, SteamBuild, tmp, .vscode, dist, out, logs
:: Robocopy exit code < 8 is success
robocopy "%SOURCE%" "%APP%" /MIR /XD .git SteamBuild tmp .vscode dist out test-results node_modules\@types /XF *.log *.lock .DS_Store /MT:8

if %ERRORLEVEL% LSS 8 (
    echo Robocopy finished successfully (Code %ERRORLEVEL%).
) else (
    echo Robocopy failed (Code %ERRORLEVEL%).
    pause
    exit /b 1
)

echo [3/3] Creating Launcher...
(
echo @echo off
echo title Esports Manager Simulator
echo color 0b
echo cls
echo set "PATH=%%~dp0bin;%%PATH%%"
echo.
echo echo ===================================================
echo echo   ESPORTS MANAGER SIMULATOR
echo echo ===================================================
echo echo.
echo echo [1/2] Starting Engine...
echo cd app
echo start /B ..\bin\node.exe node_modules\next\dist\bin\next dev ^>nul 2^>^&1
echo.
echo :waitloop
echo timeout /t 2 /nobreak ^>nul
echo netstat -an ^| find "3000" ^| find "LISTENING" ^>nul
echo if %%errorlevel%% neq 0 goto waitloop
echo.
echo echo [2/2] Launching Interface...
echo ..\bin\node.exe node_modules\electron\cli.js .
echo.
echo taskkill /F /IM node.exe ^>nul 2^>^&1
echo exit
) > "%DEST%\Launch Game.bat"

if exist "public\branding\icon.ico" copy "public\branding\icon.ico" "%DEST%\game.ico" >nul

echo.
echo ===================================================
echo   BUILD COMPLETE!
echo   Location: %DEST%
echo ===================================================
pause
