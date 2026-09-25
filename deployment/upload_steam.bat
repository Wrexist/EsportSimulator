@echo off
title Upload to Steam
cd /d "%~dp0.."
node scripts\upload-steam.cjs
exit /b %errorlevel%
