@echo off
title SHIP GAME TO STEAM
color 0b
cls

echo ===================================================
echo   ESPORTS MANAGER - RELEASE PIPELINE
echo ===================================================
echo.
echo [1] BUILD RELEASE
echo     Creates a portable version of the game in SteamBuild/
echo.
echo [2] UPLOAD TO STEAM
echo     Uploads the SteamBuild folder to Steam.
echo.
echo ===================================================
set /p CHOICE=Run full pipeline? (Y/N): 
if /I "%CHOICE%" neq "Y" exit

call deployment\build_release.bat
if %ERRORLEVEL% neq 0 (
    echo Build failed!
    pause
    exit /b
)

echo.
echo Build complete. Ready to upload?
pause

call deployment\upload_steam.bat
pause
