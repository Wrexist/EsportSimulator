# Steam Build Creator (Simple Version)
$ErrorActionPreference = "Stop"

$SourceDir = $PSScriptRoot | Split-Path -Parent
$BuildDir = Join-Path $SourceDir "SteamBuild"
$AppDir = Join-Path $BuildDir "app"
$BinDir = Join-Path $BuildDir "bin"

Write-Host "creating build in $BuildDir..."

# Clean
if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
New-Item -ItemType Directory -Path $BuildDir | Out-Null
New-Item -ItemType Directory -Path $AppDir | Out-Null
New-Item -ItemType Directory -Path $BinDir | Out-Null

# Embed Node
$SystemNode = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path $SystemNode)) { $SystemNode = (Get-Command node).Source }
Copy-Item $SystemNode -Destination (Join-Path $BinDir "node.exe")

# Copy Files (Copy-Item is slow but safe)
Write-Host "Copying files (this may take 1-2 mins)..."
$Items = Get-ChildItem -Path $SourceDir -Exclude ".git", "SteamBuild", "tmp", "dist", "out", ".vscode"
foreach ($item in $Items) {
    Write-Host "Copying $($item.Name)..."
    Copy-Item -Path $item.FullName -Destination $AppDir -Recurse -Force
}

# Create Launcher
$LauncherContent = @"
@echo off
title Esports Manager Simulator
color 0b
cls
set "PATH=%~dp0bin;%PATH%"

echo ===================================================
echo   ESPORTS MANAGER SIMULATOR
echo ===================================================
echo.
echo [1/2] Starting Engine...
cd app
start /B ..\bin\node.exe node_modules\next\dist\bin\next dev >nul 2>&1

:waitloop
timeout /t 2 /nobreak >nul
netstat -an | find "3000" | find "LISTENING" >nul
if %errorlevel% neq 0 goto waitloop

echo [2/2] Launching Interface...
..\bin\node.exe node_modules\electron\cli.js .

taskkill /F /IM node.exe >nul 2>&1
exit
"@
Set-Content -Path (Join-Path $BuildDir "Launch Game.bat") -Value $LauncherContent

# Copy icon
if (Test-Path "$SourceDir\public\branding\icon.ico") {
    Copy-Item "$SourceDir\public\branding\icon.ico" -Destination "$BuildDir\game.ico"
}

Write-Host "DONE. Size: $((Get-ChildItem $BuildDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB) MB"
