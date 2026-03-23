# Steam Build Creator
# Strategy: Portable Source Distribution (Dev-as-Prod)

$ErrorActionPreference = "Stop"

$SourceDir = $PSScriptRoot | Split-Path -Parent
$BuildDir = Join-Path $SourceDir "SteamBuild"
$AppDir = Join-Path $BuildDir "app"
$BinDir = Join-Path $BuildDir "bin"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   CREATING PORTABLE STEAM BUILD (V3)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Source: $SourceDir"
Write-Host "Dest:   $BuildDir"

# 1. Clean previous build
if (Test-Path $BuildDir) {
    Write-Host "[1/5] Cleaning old build..."
    Remove-Item $BuildDir -Recurse -Force
}
New-Item -ItemType Directory -Path $BuildDir | Out-Null
New-Item -ItemType Directory -Path $AppDir | Out-Null
New-Item -ItemType Directory -Path $BinDir | Out-Null

# 2. Embed Node.js
Write-Host "[2/5] Embedding portable Node.js runtime..."
$SystemNode = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path $SystemNode)) {
    $SystemNode = (Get-Command node).Source
}

if ($SystemNode -and (Test-Path $SystemNode)) {
    Copy-Item $SystemNode -Destination (Join-Path $BinDir "node.exe")
    Write-Host "      Copied from: $SystemNode" -ForegroundColor Green
}
else {
    Write-Error "Could not find node.exe on system! Please install Node.js."
    exit 1
}

# 3. Copy Game Files (Robocopy direct call)
Write-Host "[3/5] Copying game files..."

# Robocopy args must be unquoted if simple, or carefully quoted
# We use & operator to call it
$RoboLog = robocopy "$SourceDir" "$AppDir" /E /XD .git SteamBuild tmp .vscode dist out test-results node_modules\@types /XF *.log *.lock .DS_Store /MT:8 /R:2 /W:2 /NFL /NDL

# Robocopy exit codes: 0-7 are success. >=8 is error.
if ($LASTEXITCODE -ge 8) {
    Write-Error "Robocopy failed with exit code $LASTEXITCODE"
    exit 1
}
Write-Host "      Files copied successfully." -ForegroundColor Green

# 4. Create Launcher Script
Write-Host "[4/5] Creating launcher..."
$LauncherContent = @"
@echo off
title Esports Manager Simulator
color 0b
cls

:: Set path to use our embedded Node.js
set "PATH=%~dp0bin;%PATH%"

echo ===================================================
echo   ESPORTS MANAGER SIMULATOR
echo ===================================================
echo.
echo [1/2] Starting Engine...

:: Start Next.js (Dev server) in background
cd app
start /B ..\bin\node.exe node_modules\next\dist\bin\next dev >nul 2>&1

:: Wait for port 3000
:waitloop
timeout /t 2 /nobreak >nul
netstat -an | find "3000" | find "LISTENING" >nul
if %errorlevel% neq 0 goto waitloop

echo [2/2] Launching Interface...
:: Launch Electron directly
..\bin\node.exe node_modules\electron\cli.js .

echo.
echo Closing...
taskkill /F /IM node.exe >nul 2>&1
exit
"@

$LauncherPath = Join-Path $BuildDir "Launch Game.bat"
Set-Content -Path $LauncherPath -Value $LauncherContent

# 4b. Create Helper Readme
$ReadmeContent = @"
# Esports Manager Simulator - Portable Build
This folder contains a fully portable version of the game.

To play:
1. Double-click 'Launch Game.bat'
2. Wait for the engine to start (10-15s)
3. Play!

Do not rename the folder structure.
"@
Set-Content -Path (Join-Path $BuildDir "README.txt") -Value $ReadmeContent

# 4c. Copy launch icon if exists
if (Test-Path "$SourceDir\public\branding\icon.ico") {
    Copy-Item "$SourceDir\public\branding\icon.ico" -Destination "$BuildDir\game.ico"
}

# 5. Verification
Write-Host "[5/5] Build Complete!" -ForegroundColor Green
Write-Host "Output: $BuildDir"
Write-Host "Size:   $((Get-ChildItem $BuildDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB) MB"
Write-Host "READY FOR STEAM UPLOAD." -ForegroundColor Yellow
