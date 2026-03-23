@echo off
setlocal EnableDelayedExpansion
title Esports Manager - Professional Build
cd /d "%~dp0.."

:: Define Paths (Professional structure)
set "ROOT=%CD%"
set "DEPLOY_DIR=%ROOT%\deployment"
set "BUILD_DIR=%ROOT%\SteamBuild"
set "GAME_DIR=%BUILD_DIR%\game"
set "RUNTIME_DIR=%BUILD_DIR%\runtime"

echo ===================================================
echo   ESPORTS MANAGER - PROFESSIONAL BUILD
echo ===================================================
echo Root: %ROOT%
echo Dest: %BUILD_DIR%
echo.

:: 1. Clean Build (Robust with retry)
echo [1/6] Cleaning previous build...
if exist "%BUILD_DIR%" (
    :: Try to clean using robocopy
    if not exist "%DEPLOY_DIR%\empty_stub" mkdir "%DEPLOY_DIR%\empty_stub"
    robocopy "%DEPLOY_DIR%\empty_stub" "%BUILD_DIR%" /MIR /NFL /NDL /NJH /NJS >nul 2>&1
    rmdir /s /q "%DEPLOY_DIR%\empty_stub" 2>nul
    rmdir /s /q "%BUILD_DIR%" 2>nul
    
    :: If still exists, try waiting and retrying
    if exist "%BUILD_DIR%" (
        echo    Waiting for folder to be released...
        timeout /t 2 /nobreak >nul
        rmdir /s /q "%BUILD_DIR%" 2>nul
    )
    
    :: If STILL exists, just clean contents and reuse folder
    if exist "%BUILD_DIR%" (
        echo    Folder locked, cleaning contents instead...
        del /q /s "%BUILD_DIR%\*" 2>nul
        for /d %%d in ("%BUILD_DIR%\*") do rmdir /s /q "%%d" 2>nul
    )
)
if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%"
if not exist "%GAME_DIR%" mkdir "%GAME_DIR%"
mkdir "%RUNTIME_DIR%"

:: 2. Embed Node.js Runtime
echo [2/6] Embedding Node.js Runtime...
set "NODE_SRC="
if exist "C:\Program Files\nodejs\node.exe" set "NODE_SRC=C:\Program Files\nodejs\node.exe"
if not defined NODE_SRC (
    for /f "delims=" %%F in ('where node 2^>nul') do set "NODE_SRC=%%F"
)

if defined NODE_SRC (
    copy "%NODE_SRC%" "%RUNTIME_DIR%\node.exe" >nul
    echo       Embedded: %NODE_SRC%
) else (
    echo ERROR: Node.js not found. Install Node.js first.
    pause
    exit /b 1
)

:: 3. Mirror Source Code (with extensive exclusions)
echo [3/6] Copying game files...

:: Directories to exclude
set "XDIRS=.git .github .vscode SteamBuild tmp deployment dist out test-results node_modules playwright-report coverage steamcmd remotion .claude .gemini .codex .expo"

:: Files to exclude
set "XFILES=*.log *.lock .DS_Store .env .env.* *.map *.d.ts build_output.txt *.test.ts *.spec.ts"

robocopy "%ROOT%" "%GAME_DIR%" /MIR /XD %XDIRS% /XF %XFILES% /MT:8 /NFL /NDL

:: 4. Copy node_modules (Robust Mode)
echo [4/6] Copying dependencies...
robocopy "%ROOT%\node_modules" "%GAME_DIR%\node_modules" /E /J /MT:32 /R:3 /W:1 /NFL /NDL

:: Remove dev-only packages from node_modules (optional, saves space)
:: rd /s /q "%GAME_DIR%\node_modules\@types" 2>nul
:: rd /s /q "%GAME_DIR%\node_modules\typescript" 2>nul
:: rd /s /q "%GAME_DIR%\node_modules\eslint*" 2>nul

:: Reset error level
ver >nul

:: 4b. Build Next.js production output
echo [4b/7] Building Next.js production bundle...
set "NODE_EXE=%RUNTIME_DIR%\node.exe"
cd /d "%GAME_DIR%"
set NODE_OPTIONS=--max-old-space-size=4096
"%NODE_EXE%" node_modules\next\dist\bin\next build
if %errorlevel% neq 0 (
    echo ERROR: Next.js build failed!
    pause
    exit /b 1
)
cd /d "%ROOT%"

:: 5. Create Professional Launcher
echo [5/7] Creating launcher...

:: Copy the launcher files
copy "%DEPLOY_DIR%\launcher_internal.bat" "%BUILD_DIR%\launcher_internal.bat" >nul
copy "%DEPLOY_DIR%\launcher.vbs" "%BUILD_DIR%\launcher.vbs" >nul

:: Create a simple batch-to-exe wrapper using wscript
:: For now, we'll use a .bat renamed with a more professional approach
:: Create the main launcher that Steam will call
(
echo @echo off
echo cd /d "%%~dp0"
echo wscript.exe "%%~dp0launcher.vbs"
) > "%BUILD_DIR%\Esports Manager Simulator.bat"

:: Copy game icon
if exist "%ROOT%\public\branding\icon.ico" (
    copy "%ROOT%\public\branding\icon.ico" "%BUILD_DIR%\game.ico" >nul
)

:: Copy steam_appid.txt (use set /p to avoid trailing space)
<nul set /p ="4326170"> "%GAME_DIR%\steam_appid.txt"

:: 6. Cleanup - Remove files that shouldn't be in customer builds
echo [6/7] Final cleanup...

:: Preserve critical config files before cleanup
copy "%GAME_DIR%\next.config.js" "%BUILD_DIR%\next.config.js.bak" >nul 2>nul
copy "%GAME_DIR%\postcss.config.mjs" "%BUILD_DIR%\postcss.config.mjs.bak" >nul 2>nul

:: Remove development batch/script files from root only (not recursive)
del /q "%GAME_DIR%\*.bat" 2>nul
del /q "%GAME_DIR%\*.ps1" 2>nul
del /q "%GAME_DIR%\*.py" 2>nul
del /q "%GAME_DIR%\*.js" 2>nul
del /q "%GAME_DIR%\*.ts" 2>nul
del /q "%GAME_DIR%\*.mjs" 2>nul
del /q "%GAME_DIR%\*.txt" 2>nul
del /q "%GAME_DIR%\*.xlsx" 2>nul
del /q "%GAME_DIR%\*.zip" 2>nul
del /q "%GAME_DIR%\*.yaml" 2>nul
del /q "%GAME_DIR%\*.md" 2>nul

:: Keep package.json but remove lock files
del /q "%GAME_DIR%\package-lock.json" 2>nul
del /q "%GAME_DIR%\pnpm-lock.yaml" 2>nul
del /q "%GAME_DIR%\yarn.lock" 2>nul

:: Remove config files
del /q "%GAME_DIR%\tailwind.config.*" 2>nul
del /q "%GAME_DIR%\components.json" 2>nul
del /q "%GAME_DIR%\playwright.config.*" 2>nul
del /q "%GAME_DIR%\.gitignore" 2>nul
del /q "%GAME_DIR%\.eslintrc*" 2>nul
del /q "%GAME_DIR%\ordbok" 2>nul
del /q "%GAME_DIR%\rebuild-scripts.json" 2>nul
del /q "%GAME_DIR%\player-excel-data.json" 2>nul
del /q "%GAME_DIR%\steamworks ids" 2>nul

:: Remove development directories
rd /s /q "%GAME_DIR%\.git" 2>nul
rd /s /q "%GAME_DIR%\.github" 2>nul
rd /s /q "%GAME_DIR%\.vscode" 2>nul
rd /s /q "%GAME_DIR%\.claude" 2>nul
rd /s /q "%GAME_DIR%\.gemini" 2>nul
rd /s /q "%GAME_DIR%\.next\cache" 2>nul
rd /s /q "%GAME_DIR%\scripts" 2>nul
rd /s /q "%GAME_DIR%\tests" 2>nul
rd /s /q "%GAME_DIR%\__tests__" 2>nul
rd /s /q "%GAME_DIR%\docs" 2>nul
rd /s /q "%GAME_DIR%\temp-app" 2>nul
rd /s /q "%GAME_DIR%\steamcmd" 2>nul

:: 7. Restore critical files
echo [7/7] Restoring critical config files...

:: Restore next.config.js (required by next start at runtime)
if exist "%BUILD_DIR%\next.config.js.bak" (
    copy "%BUILD_DIR%\next.config.js.bak" "%GAME_DIR%\next.config.js" >nul
    del /q "%BUILD_DIR%\next.config.js.bak" 2>nul
)
:: Restore postcss.config.mjs (required for CSS processing)
if exist "%BUILD_DIR%\postcss.config.mjs.bak" (
    copy "%BUILD_DIR%\postcss.config.mjs.bak" "%GAME_DIR%\postcss.config.mjs" >nul
    del /q "%BUILD_DIR%\postcss.config.mjs.bak" 2>nul
)

:: Add steam_appid.txt back (needed by Steamworks - use set /p to avoid trailing space)
<nul set /p ="4326170"> "%GAME_DIR%\steam_appid.txt"

echo.
echo ===================================================
echo   BUILD SUCCESSFUL!
echo   Location: %BUILD_DIR%
echo.
echo   Structure:
echo   - Esports Manager Simulator.bat (entry point)
echo   - game/  (game files)
echo   - runtime/  (Node.js engine)
echo ===================================================
echo.
exit /b 0
