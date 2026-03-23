@echo off
title Kill Stuck Processes
echo Killing Node.js...
taskkill /F /IM node.exe /T >nul 2>&1
echo Killing Electron...
taskkill /F /IM electron.exe /T >nul 2>&1
echo Done.
timeout /t 2 >nul
