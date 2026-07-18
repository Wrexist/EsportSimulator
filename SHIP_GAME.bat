@echo off
title SHIP GAME TO STEAM
color 0b
cls
cd /d "%~dp0"

echo ===================================================
echo   ESPORTS MANAGER - RELEASE PIPELINE (Electron)
echo ===================================================
echo.
echo This builds a REAL packaged Windows app with electron-builder
echo (produces dist\win-unpacked\EsportsManager.exe) and uploads it.
echo.
echo   Steam launch option MUST be: EsportsManager.exe
echo.
echo   Do NOT ship the old portable SteamBuild\ folder - it has no
echo   EsportsManager.exe and Steam will reject the build (it picks up
echo   node_modules\7zip-bin\...\7za.exe instead). See
echo   HOW_TO_BUILD_AND_SHIP.md for details.
echo ===================================================
echo.
set /p CHOICE=Run full pipeline? (Y/N):
if /I "%CHOICE%" neq "Y" exit /b

echo.
echo [1/3] Building packaged app (electron-builder)...
call npm run dist
if %ERRORLEVEL% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Verifying the ship build before upload...
call npm run ship:verify
if %ERRORLEVEL% neq 0 (
    echo.
    echo Ship verification FAILED - not uploading. Fix the issues above.
    pause
    exit /b 1
)

echo.
echo Build verified. Ready to upload to Steam?
pause

echo.
echo [3/3] Uploading to Steam...
call deployment\upload_steam.bat
pause
