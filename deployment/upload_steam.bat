@echo off
title Upload to Steam
cd /d "%~dp0.."
set "ROOT=%CD%"
set "VDF_PATH=%ROOT%\deployment\config\app_build_4326170.vdf"

echo ===================================================
echo   STEAM UPLOAD
echo ===================================================
echo VDF: %VDF_PATH%
echo.

:check_steamcmd
set "STEAMCMD_PATH=C:\steamcmd\steamcmd.exe"
if exist "%STEAMCMD_PATH%" goto found
if exist "%ROOT%\steamcmd\steamcmd.exe" set "STEAMCMD_PATH=%ROOT%\steamcmd\steamcmd.exe" & goto found
if exist "%ROOT%\steamcmd.exe" set "STEAMCMD_PATH=%ROOT%\steamcmd.exe" & goto found

echo ERROR: steamcmd.exe not found.
echo Check C:\steamcmd\steamcmd.exe or put it in the project folder.
pause
exit /b 1

:found
echo Using: %STEAMCMD_PATH%
echo.
echo Enter Steam Credentials:
set /p STEAM_USER=Username: 
echo.

"%STEAMCMD_PATH%" +login %STEAM_USER% +run_app_build "%VDF_PATH%" +quit

echo.
echo Done.
pause
