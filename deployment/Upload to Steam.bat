@echo off
title Upload to Steam
color 0b
cls

echo ===================================================
echo   ESPORTS MANAGER - STEAM UPLOADER
echo ===================================================
echo.
echo This script will upload the "SteamBuild" folder to Steam.
echo You need "steamcmd" installed.
echo.


:check_steamcmd
set "STEAMCMD_PATH=C:\steamcmd\steamcmd.exe"
if exist "%STEAMCMD_PATH%" goto found

:: Try current folder
if exist "%~dp0steamcmd.exe" (
    set "STEAMCMD_PATH=%~dp0steamcmd.exe"
    goto found
)

:: Try another common path
set "STEAMCMD_PATH=C:\Program Files (x86)\Steam\steamcmd.exe"
if exist "%STEAMCMD_PATH%" goto found

echo Could not find steamcmd.exe automatically.
echo Please enter the full path to steamcmd.exe (drag and drop the file here):
set /p STEAMCMD_PATH=Path: 

:found
echo using: %STEAMCMD_PATH%
echo.
echo Please enter your Steam Login Credentials to upload.
set /p STEAM_USER=Username: 
echo.

"%STEAMCMD_PATH%" +login %STEAM_USER% +run_app_build "%~dp0steam_config\app_build_4326170.vdf" +quit

echo.
echo Upload process finished.
pause
