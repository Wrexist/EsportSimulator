const { app, BrowserWindow, Menu, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const steam = require('./steam');

// Single-instance lock — must be checked BEFORE any heavy initialization
// (steamworks, next.js) to prevent duplicate windows on alt-tab / re-launch.
app.setAppUserModelId('com.esportssim.game');
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}
// Smart GPU acceleration: enable by default, disable only if previous GPU crash detected
// or if user explicitly sets ESM_STABILITY_MODE=1
const gpuCrashFlagPath = path.join(app.getPath('userData'), 'gpu-crash-flag');
const hadGpuCrash = fs.existsSync(gpuCrashFlagPath);
const forceStabilityMode = process.env.ESM_STABILITY_MODE === '1';
const STABILITY_MODE = forceStabilityMode || hadGpuCrash;
if (STABILITY_MODE) {
    app.disableHardwareAcceleration();
}

const http = require('http');
const { parse } = require('url');
const next = require('next');

// Diagnostic log — writes to a file in userData so we can debug packaged builds
const debugLogLines = [];
const debugLog = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    debugLogLines.push(line);
};
const flushDebugLog = () => {
    try {
        const logDir = path.join(app.getPath('userData'), 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const logFile = path.join(logDir, 'startup-debug.log');
        fs.writeFileSync(logFile, debugLogLines.join('\n') + '\n', 'utf8');
    } catch (e) { /* best effort */ }
};
app.on('child-process-gone', (_event, details) => {
    const type = details?.type || 'unknown';
    const reason = details?.reason || 'unknown';
    const exitCode = Number.isInteger(details?.exitCode) ? details.exitCode : 'n/a';
    const gpuTag = type === 'GPU' ? ' [GPU]' : '';
    debugLog(`[Process${gpuTag}] child-process-gone type=${type} reason=${reason} exitCode=${exitCode}`);
    // If GPU process crashed, flag it so next launch uses software rendering
    if (type === 'GPU' && reason !== 'clean-exit') {
        try {
            fs.writeFileSync(gpuCrashFlagPath, new Date().toISOString(), 'utf8');
            debugLog('[GPU] Crash flag written - next launch will use software rendering');
        } catch (e) { /* best effort */ }
    }
    flushDebugLog();
});

const startNextJSServer = async () => {
    const SERVER_TIMEOUT_MS = 60000;

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            flushDebugLog();
            reject(new Error(`Next.js server failed to start within ${SERVER_TIMEOUT_MS / 1000}s`));
        }, SERVER_TIMEOUT_MS);
    });

    const serverPromise = (async () => {
        // When packaged, use app.getAppPath() which points to the ASAR root.
        // Electron transparently redirects reads for asarUnpack'd files to
        // app.asar.unpacked/. This keeps module resolution working through ASAR.
        const appDir = app.isPackaged
            ? app.getAppPath()
            : path.join(__dirname, '../');
        debugLog('Starting Next.js server...');
        debugLog('Is packaged: ' + app.isPackaged);
        debugLog('App directory: ' + appDir);
        debugLog('App path: ' + app.getAppPath());
        debugLog('Resources path: ' + process.resourcesPath);
        debugLog('Node version: ' + process.version);

        // Verify critical files exist before attempting to start
        const configPath = path.join(appDir, 'next.config.js');
        const nextDir = path.join(appDir, '.next');
        const buildIdPath = path.join(nextDir, 'BUILD_ID');

        const configExists = fs.existsSync(configPath);
        const nextDirExists = fs.existsSync(nextDir);
        const buildIdExists = fs.existsSync(buildIdPath);
        debugLog('next.config.js exists: ' + configExists + ' at ' + configPath);
        debugLog('.next dir exists: ' + nextDirExists + ' at ' + nextDir);
        debugLog('BUILD_ID exists: ' + buildIdExists);

        if (!configExists) {
            throw new Error('next.config.js not found at: ' + configPath);
        }
        if (!nextDirExists) {
            throw new Error('.next directory not found at: ' + nextDir);
        }

        debugLog('Creating Next.js app instance...');
        const nextApp = next({ dev: false, dir: appDir });
        const handle = nextApp.getRequestHandler();

        debugLog('Calling nextApp.prepare()...');
        await nextApp.prepare();
        debugLog('nextApp.prepare() completed successfully');

        const server = http.createServer((req, res) => {
            const parsedUrl = parse(req.url, true);
            handle(req, res, parsedUrl);
        });

        // Try ports 3000-3009 to handle port conflicts
        const tryPort = (port) => new Promise((resolve, reject) => {
            const onError = (err) => {
                if (err.code === 'EADDRINUSE' && port < 3010) {
                    debugLog(`Port ${port} in use, trying ${port + 1}...`);
                    server.removeListener('error', onError);
                    resolve(tryPort(port + 1));
                } else {
                    debugLog('Server listen error: ' + err.message);
                    flushDebugLog();
                    reject(err);
                }
            };
            server.on('error', onError);
            server.listen(port, () => {
                server.removeListener('error', onError);
                process.env.NEXT_SERVER_PORT = String(port);
                debugLog(`Next.js server started on port ${port}`);
                flushDebugLog();
                resolve(server);
            });
        });
        return tryPort(3000);
    })();

    return Promise.race([serverPromise, timeoutPromise]);
}

const showErrorPage = (window, errorMessage, errorStack) => {
    const safeMsg = (errorMessage || 'Unknown error').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    const safeStack = (errorStack || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Esports Manager - Launch Error</title>
<style>body{background:#1a1a2e;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}
.c{max-width:600px;text-align:center}h1{color:#ff4444;font-size:24px;margin-bottom:8px}h2{color:#999;font-size:16px;font-weight:normal;margin-top:0}
.e{background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;text-align:left;font-family:Consolas,monospace;font-size:12px;color:#ff8888;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;margin:16px 0}
.b{background:#333;color:#fff;border:1px solid #555;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:14px;margin:4px}.b:hover{background:#444}
.h{color:#666;font-size:12px;margin-top:16px}</style></head>
<body><div class="c"><h1>Failed to Launch</h1><h2>The game engine could not start</h2>
<div class="e">${safeMsg}${safeStack ? '\\n\\n' + safeStack : ''}</div>
<div><button class="b" onclick="window.close()">Quit</button></div>
<p class="h">Try verifying game files through Steam (right-click &gt; Properties &gt; Local Files &gt; Verify).</p>
</div></body></html>`;
    window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    window.show();
}


let mainWindow;
let forceQuit = false;
let closeTimeout = null;
let closePending = false;
let store;
let isCreatingWindow = false;

// Below 1024x640 the management UI (tables, roster grids, side panels) wraps
// badly. Enforced via BrowserWindow minWidth/minHeight.
const MIN_WIDTH = 1024;
const MIN_HEIGHT = 640;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

// Validate saved bounds against currently connected displays. If the window's
// center would land outside every display's work area (monitor unplugged,
// resolution changed), fall back to a centered default — prevents the window
// from restoring offscreen.
const resolveInitialBounds = (saved) => {
    const width = Math.max(MIN_WIDTH, Number(saved?.width) || DEFAULT_WIDTH);
    const height = Math.max(MIN_HEIGHT, Number(saved?.height) || DEFAULT_HEIGHT);
    const x = Number.isFinite(saved?.x) ? Math.floor(saved.x) : null;
    const y = Number.isFinite(saved?.y) ? Math.floor(saved.y) : null;

    if (x === null || y === null) {
        return { width, height };
    }

    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const onDisplay = screen.getAllDisplays().some((d) => {
        const { x: dx, y: dy, width: dw, height: dh } = d.workArea;
        return centerX >= dx && centerX < dx + dw && centerY >= dy && centerY < dy + dh;
    });

    if (!onDisplay) {
        return { width, height };
    }
    return { width, height, x, y };
};

const resolveWindowIconPath = () => {
    const candidatePaths = [
        path.join(process.resourcesPath, 'public', 'logo.png'),
        path.join(app.getAppPath(), 'public', 'logo.png'),
        path.join(__dirname, '../public/logo.png'),
    ];

    for (const candidate of candidatePaths) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
};

const initStore = async () => {
    const { default: Store } = await import('electron-store');
    // Pin save storage to app.getPath('userData'). electron-store already
    // defaults to this directory, but stating it explicitly prevents anything
    // from ever writing into the install/Resources folder (which is read-only
    // on macOS Steam installs and gets blown away on Windows upgrades).
    const userDataDir = app.getPath('userData');
    store = new Store({
        cwd: userDataDir,
        defaults: {
            window: {
                width: 1280,
                height: 720,
                x: null,
                y: null,
                fullscreen: false,
                maximized: false
            }
        }
    });
    if (!STABILITY_MODE) {
        console.log('[Electron] Save storage pinned to', userDataDir);
    }
};


// --- GPU / Window ghost prevention ---
// CalculateNativeWinOcclusion creates hidden native windows that appear in Alt-Tab
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,WinRetrieveSuggestionsOnlyOnDemand');
// Required for Steam Overlay to hook into the renderer
if (!STABILITY_MODE) {
    app.commandLine.appendSwitch('in-process-gpu');
}
// NOTE: We intentionally do NOT add '--disable-direct-composition'.
// steamworks.js's electronEnableSteamOverlay() adds it, but on Electron 39+
// it causes DWM to register GPU swap-chain surfaces as separate windows,
// producing ghost copies in Alt-Tab on every focus change.

// Frame invalidator: keeps the renderer painting so the Steam Overlay can draw.
// This replicates what electronEnableSteamOverlay() does internally.
// Pauses when window is minimized to save battery/CPU.
const attachFrameInvalidator = (browserWindow) => {
    const startInvalidator = () => {
        if (browserWindow._steamRepaintInterval) return;
        browserWindow._steamRepaintInterval = setInterval(() => {
            if (browserWindow.isDestroyed()) {
                clearInterval(browserWindow._steamRepaintInterval);
                browserWindow._steamRepaintInterval = null;
            } else if (!browserWindow.webContents.isPainting()) {
                browserWindow.webContents.invalidate();
            }
        }, 1000 / 60);
    };
    const stopInvalidator = () => {
        if (browserWindow._steamRepaintInterval) {
            clearInterval(browserWindow._steamRepaintInterval);
            browserWindow._steamRepaintInterval = null;
        }
    };
    startInvalidator();
    browserWindow.on('minimize', stopInvalidator);
    browserWindow.on('restore', startInvalidator);
    browserWindow.on('closed', stopInvalidator);
};
if (!STABILITY_MODE) {
    app.on('browser-window-created', (_, bw) => attachFrameInvalidator(bw));
}

// Boot Steamworks and register all steam-* IPC handlers. Must run before the
// first BrowserWindow is created so the Steam overlay has a chance to hook.
// getTrustedWebContentsId returns -1 until mainWindow exists, which safely
// rejects all IPC from the renderer during the brief init window.
steam.initializeSteam({
    getTrustedWebContentsId: () => (mainWindow ? mainWindow.webContents.id : -1),
    log: debugLog,
});

// Window Control IPC Handlers
ipcMain.handle('window-set-fullscreen', (event, fullscreen) => {
    if (!mainWindow) return false;
    try {
        mainWindow.setFullScreen(fullscreen);
        if (store) {
            store.set('window.fullscreen', fullscreen);
        }
        return true;
    } catch (e) {
        console.error('[Electron] Error setting fullscreen:', e);
        return false;
    }
});

ipcMain.handle('window-set-size', (event, width, height) => {
    if (!mainWindow) return false;
    try {
        const w = Math.max(MIN_WIDTH, Number(width) || DEFAULT_WIDTH);
        const h = Math.max(MIN_HEIGHT, Number(height) || DEFAULT_HEIGHT);
        mainWindow.setSize(w, h);
        mainWindow.center();
        if (store) {
            const bounds = mainWindow.getBounds();
            store.set('window.width', bounds.width);
            store.set('window.height', bounds.height);
            store.set('window.x', bounds.x);
            store.set('window.y', bounds.y);
        }
        return true;
    } catch (e) {
        console.error('[Electron] Error setting window size:', e);
        return false;
    }
});

ipcMain.handle('window-get-size', (event) => {
    if (!mainWindow) return null;
    try {
        const [width, height] = mainWindow.getSize();
        return { width, height };
    } catch (e) {
        console.error('[Electron] Error getting window size:', e);
        return null;
    }
});

ipcMain.handle('window-is-fullscreen', (event) => {
    if (!mainWindow) return false;
    try {
        return mainWindow.isFullScreen();
    } catch (e) {
        console.error('[Electron] Error checking fullscreen:', e);
        return false;
    }
});

// GPU rendering mode controls
ipcMain.handle('gpu-get-mode', () => {
    return STABILITY_MODE ? 'compatibility' : 'performance';
});

ipcMain.handle('gpu-set-mode', (_event, mode) => {
    try {
        if (mode === 'compatibility') {
            fs.writeFileSync(gpuCrashFlagPath, 'user-requested', 'utf8');
        } else if (mode === 'performance') {
            if (fs.existsSync(gpuCrashFlagPath)) fs.unlinkSync(gpuCrashFlagPath);
        }
        return true;
    } catch (e) {
        console.error('[GPU] Failed to set rendering mode:', e);
        return false;
    }
});

ipcMain.handle('app-close-confirmed', () => {
    if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; }
    closePending = false;
    forceQuit = true;
    if (mainWindow) {
        mainWindow.close();
    }
    return true;
});

ipcMain.handle('app-close-cancelled', () => {
    console.log('[Electron] Close cancelled by user');
    if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; }
    closePending = false;
    return true;
});

// Error logging - write crash/error reports to a log file
ipcMain.handle('log-write-error', (event, report) => {
    try {
        if (!report || typeof report !== 'object') return false;
        const logDir = path.join(app.getPath('userData'), 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, 'error.log');
        // Sanitize message and stack to prevent log injection
        const sanitize = (s) => typeof s === 'string' ? s.replace(/[\r\n]+/g, ' | ').substring(0, 8000) : '';
        const level = typeof report.level === 'string' ? report.level.replace(/[^a-zA-Z]/g, '') : 'error';
        const entry = `[${new Date().toISOString()}] ${level}: ${sanitize(report.message)}\n${sanitize(report.stack)}\n---\n`;
        fs.appendFileSync(logFile, entry, 'utf8');

        // Rotate log if it exceeds 1MB, keep max 5 archived logs
        const stats = fs.statSync(logFile);
        if (stats.size > 1024 * 1024) {
            const archivePath = path.join(logDir, `error-${Date.now()}.log`);
            fs.renameSync(logFile, archivePath);
            // Clean up old archived logs (keep newest 5)
            try {
                const archived = fs.readdirSync(logDir)
                    .filter(f => f.startsWith('error-') && f.endsWith('.log'))
                    .sort()
                    .reverse();
                for (const old of archived.slice(5)) {
                    fs.unlinkSync(path.join(logDir, old));
                }
            } catch (_) { /* best effort cleanup */ }
        }
        return true;
    } catch (e) {
        console.error('[Electron] Error writing to log:', e);
        return false;
    }
});

// Renderer storage bridge - uses electron-store for disk-backed persistence
ipcMain.handle('storage-get-item', (_event, key) => {
    try {
        if (!store || typeof key !== 'string' || !key) return null;
        const value = store.get(key);
        return typeof value === 'string' ? value : null;
    } catch (e) {
        console.error('[Electron] Error reading storage key:', e);
        return null;
    }
});

ipcMain.handle('storage-set-item', (_event, key, value) => {
    try {
        if (!store || typeof key !== 'string' || !key || typeof value !== 'string') return false;
        store.set(key, value);
        return true;
    } catch (e) {
        console.error('[Electron] Error writing storage key:', e);
        return false;
    }
});

ipcMain.handle('storage-remove-item', (_event, key) => {
    try {
        if (!store || typeof key !== 'string' || !key) return false;
        store.delete(key);
        return true;
    } catch (e) {
        console.error('[Electron] Error removing storage key:', e);
        return false;
    }
});

ipcMain.handle('storage-clear', () => {
    try {
        if (!store) return false;
        store.clear();
        return true;
    } catch (e) {
        console.error('[Electron] Error clearing storage:', e);
        return false;
    }
});

ipcMain.handle('storage-get-all-keys', () => {
    try {
        if (!store) return [];
        return Object.keys(store.store ?? {});
    } catch (e) {
        console.error('[Electron] Error listing storage keys:', e);
        return [];
    }
});

// ============================================================
// Community-import (mod) file IPC
// Stores user-supplied fictional-data replacements in userData, outside
// the shipped bundle. The game reads these at snapshot load time when
// present.
// ============================================================
const MOD_DIRNAME = 'mods/community';
function modDir() {
    return path.join(app.getPath('userData'), MOD_DIRNAME);
}
function ensureModDir() {
    const d = modDir();
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    return d;
}
function safeModFilename(name) {
    // Only allow a known set of files to be written — never accept paths.
    const allowed = new Set(['players.json', 'teams.json', 'tournaments.json', 'manifest.json']);
    if (!allowed.has(name)) throw new Error(`Disallowed mod filename: ${name}`);
    return name;
}

ipcMain.handle('mod-exists', () => {
    try {
        const d = modDir();
        if (!fs.existsSync(d)) return false;
        // Any of the three overlays is enough — tournaments-only imports
        // are a valid use case (e.g. a patch that only rebrands events).
        return (
            fs.existsSync(path.join(d, 'teams.json')) ||
            fs.existsSync(path.join(d, 'players.json')) ||
            fs.existsSync(path.join(d, 'tournaments.json'))
        );
    } catch (e) {
        return false;
    }
});

ipcMain.handle('mod-read', (_event, filename) => {
    try {
        const f = safeModFilename(filename);
        const p = path.join(modDir(), f);
        if (!fs.existsSync(p)) return null;
        return fs.readFileSync(p, 'utf8');
    } catch (e) {
        console.error('[Mod] read failed:', e);
        return null;
    }
});

ipcMain.handle('mod-write', (_event, filename, contents) => {
    try {
        const f = safeModFilename(filename);
        if (typeof contents !== 'string') return false;
        const d = ensureModDir();
        fs.writeFileSync(path.join(d, f), contents, 'utf8');
        return true;
    } catch (e) {
        console.error('[Mod] write failed:', e);
        return false;
    }
});

ipcMain.handle('mod-clear', () => {
    try {
        const d = modDir();
        if (!fs.existsSync(d)) return true;
        for (const f of fs.readdirSync(d)) {
            const full = path.join(d, f);
            if (fs.statSync(full).isFile()) fs.unlinkSync(full);
        }
        return true;
    } catch (e) {
        console.error('[Mod] clear failed:', e);
        return false;
    }
});

ipcMain.handle('mod-path', () => {
    try {
        return modDir();
    } catch (e) {
        return null;
    }
});

async function createWindow() {
    if (mainWindow || isCreatingWindow) return;
    isCreatingWindow = true;
    try {
        debugLog(`Creating BrowserWindow. Stability mode: ${STABILITY_MODE}`);
        flushDebugLog();
        await initStore();

        const windowState = store.get('window');
        const iconPath = resolveWindowIconPath();
        const iconImage = iconPath ? nativeImage.createFromPath(iconPath) : null;
        const windowIcon = iconImage && !iconImage.isEmpty() ? iconImage : undefined;

        // Native title bar with menu bar hidden — standard for Steam management
        // sims. A custom title bar would require drag regions, OS-specific
        // traffic-light handling, and complicates Steam overlay / fullscreen
        // toggling; not worth it for the ergonomics gained.
        if (process.platform !== 'darwin') {
            Menu.setApplicationMenu(null);
        }

        const initialBounds = resolveInitialBounds(windowState);

        mainWindow = new BrowserWindow({
            ...initialBounds,
            minWidth: MIN_WIDTH,
            minHeight: MIN_HEIGHT,
            fullscreen: windowState.fullscreen || false,
            icon: windowIcon,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true,
                allowRunningInsecureContent: false,
                experimentalFeatures: false,
                preload: path.join(__dirname, 'preload.js'),
            },
            show: false,
            autoHideMenuBar: true,
            backgroundColor: '#000000',
        });

        // Content Security Policy — the renderer is served from http://localhost:$PORT,
        // so 'self' already matches every legitimate request. No external domains are
        // loaded by the game (verified: no external fetch, img, font, or script targets).
        // 'unsafe-eval' remains because Next.js's production runtime evaluates modules
        // through Function()/eval; removing it breaks the bundle. 'unsafe-inline' for
        // style-src is required by React's inline style prop.
        mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        "default-src 'self'; " +
                        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
                        "style-src 'self' 'unsafe-inline'; " +
                        "img-src 'self' data: blob:; " +
                        "media-src 'self' data: blob:; " +
                        "connect-src 'self'; " +
                        "font-src 'self' data:; " +
                        "object-src 'none'; " +
                        "base-uri 'self'; " +
                        "form-action 'self'; " +
                        "frame-ancestors 'none';"
                    ]
                }
            });
        });

        // Deny every permission request (geolocation, notifications, media, midi,
        // pointerLock, clipboard-read, etc.) — the game does not need any of them.
        mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
            debugLog(`[Security] Denied permission request: ${permission}`);
            callback(false);
        });
        mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
            debugLog(`[Security] Denied permission check: ${permission}`);
            return false;
        });

        // Block any child/popup windows from being created (prevents ghost Alt-Tab entries,
        // also prevents `window.open` from opening an un-isolated child window).
        mainWindow.webContents.setWindowOpenHandler(() => {
            return { action: 'deny' };
        });

        // Block full-page navigation to anything outside the local Next.js server.
        // In-app SPA routing uses history.pushState and does not trigger this event.
        mainWindow.webContents.on('will-navigate', (navEvent, navigationUrl) => {
            let allowed = false;
            try {
                const parsed = new URL(navigationUrl);
                allowed = parsed.protocol === 'http:' &&
                    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
            } catch (_) { /* malformed URL — stays disallowed */ }
            if (!allowed) {
                debugLog(`[Security] Blocked navigation to ${navigationUrl}`);
                navEvent.preventDefault();
            }
        });
        mainWindow.webContents.on('will-redirect', (redirectEvent, redirectUrl) => {
            let allowed = false;
            try {
                const parsed = new URL(redirectUrl);
                allowed = parsed.protocol === 'http:' &&
                    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
            } catch (_) { /* malformed URL — stays disallowed */ }
            if (!allowed) {
                debugLog(`[Security] Blocked redirect to ${redirectUrl}`);
                redirectEvent.preventDefault();
            }
        });
        mainWindow.webContents.on('will-attach-webview', (attachEvent) => {
            // <webview> is disabled via webPreferences (default), but block defensively.
            debugLog('[Security] Blocked <webview> attach');
            attachEvent.preventDefault();
        });

        if (windowState.maximized) {
            mainWindow.maximize();
        }

        if (windowIcon) {
            mainWindow.setIcon(windowIcon);
        }

        // Save window state listener. Only persist size/position when the
        // window is in its normal (non-maximized, non-fullscreen) state —
        // otherwise we'd store the maximized bounds and lose the user's
        // preferred restore size.
        const saveState = () => {
            if (!mainWindow || !store) return;
            try {
                const isMaximized = mainWindow.isMaximized();
                const isFullScreen = mainWindow.isFullScreen();
                const isMinimized = mainWindow.isMinimized();

                store.set('window.maximized', isMaximized);
                store.set('window.fullscreen', isFullScreen);

                if (!isMaximized && !isFullScreen && !isMinimized) {
                    const bounds = mainWindow.getBounds();
                    store.set('window.width', bounds.width);
                    store.set('window.height', bounds.height);
                    store.set('window.x', bounds.x);
                    store.set('window.y', bounds.y);
                }
            } catch (e) {
                console.error('[Electron] Error saving window state:', e);
            }
        };

        // Debounce window state saves to avoid 100+ writes/sec during drag
        let saveStateTimer = null;
        const debouncedSaveState = () => {
            if (saveStateTimer) clearTimeout(saveStateTimer);
            saveStateTimer = setTimeout(saveState, 500);
        };
        mainWindow.on('resize', debouncedSaveState);
        mainWindow.on('move', debouncedSaveState);
        mainWindow.on('enter-full-screen', saveState);
        mainWindow.on('leave-full-screen', saveState);
        mainWindow.on('maximize', saveState);
        mainWindow.on('unmaximize', saveState);


        const BOOT_TIMEOUT_MS = app.isPackaged ? 30000 : 45000;
        const POST_DOM_READY_GRACE_MS = app.isPackaged ? 15000 : 20000;
        const serverPort = process.env.NEXT_SERVER_PORT || '3000';
        const packagedUrl = `http://localhost:${serverPort}/main-menu`;
        const candidateUrls = app.isPackaged
            ? [packagedUrl]
            : [`http://localhost:${serverPort}/main-menu`, 'http://localhost:3001/main-menu'];
        let currentUrlIndex = 0;
        let loadAttempt = 0;
        let bootDeadlineAt = 0;
        let bootWatchdog = null;
        let loadRetryTimer = null;
        let bootCompleted = false;
        let bootFailed = false;
        let lastBootError = '';
        let rendererReachedDomReady = false;

        const clearBootWatchdog = () => {
            if (bootWatchdog) {
                clearTimeout(bootWatchdog);
                bootWatchdog = null;
            }
        };
        const clearLoadRetry = () => {
            if (loadRetryTimer) {
                clearTimeout(loadRetryTimer);
                loadRetryTimer = null;
            }
        };
        const armBootWatchdog = (delayMs) => {
            clearBootWatchdog();
            if (bootCompleted || bootFailed) return;
            bootDeadlineAt = Date.now() + delayMs;
            debugLog(`[Renderer] Boot watchdog armed (${delayMs}ms)`);
            flushDebugLog();
            bootWatchdog = setTimeout(() => {
                if (bootCompleted || bootFailed) return;
                const currentUrl = mainWindow && !mainWindow.isDestroyed()
                    ? mainWindow.webContents.getURL()
                    : '';
                if (rendererReachedDomReady && isSuccessfulRendererUrl(currentUrl)) {
                    debugLog(`[Renderer] Promoting dom-ready renderer to boot success: ${currentUrl}`);
                    flushDebugLog();
                    markBootCompleted(`${currentUrl} (dom-ready fallback)`);
                    return;
                }
                const detail = lastBootError || 'No renderer error captured before timeout.';
                failBoot('Renderer boot timeout', detail);
            }, delayMs);
        };
        const markBootCompleted = (reason) => {
            if (bootCompleted || bootFailed) return;
            bootCompleted = true;
            clearBootWatchdog();
            clearLoadRetry();
            try {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.show();
                    mainWindow.focus();
                    mainWindow.webContents.focus();
                }
            } catch (_) { /* best effort */ }
            debugLog(`[Renderer] Boot success: ${reason}`);
            flushDebugLog();
        };
        const failBoot = (reason, detail) => {
            if (bootCompleted || bootFailed || !mainWindow || mainWindow.isDestroyed()) return;
            bootFailed = true;
            clearBootWatchdog();
            clearLoadRetry();
            const suffix = detail ? ` | ${detail}` : '';
            debugLog(`[Renderer] Boot failure: ${reason}${suffix}`);
            flushDebugLog();
            forceQuit = true;
            showErrorPage(mainWindow, reason, detail || lastBootError);
        };
        const startBootWatchdog = () => {
            if (bootWatchdog || bootCompleted || bootFailed) return;
            rendererReachedDomReady = false;
            armBootWatchdog(BOOT_TIMEOUT_MS);
        };
        const getCurrentUrl = () => candidateUrls[Math.min(currentUrlIndex, candidateUrls.length - 1)];
        const isSuccessfulRendererUrl = (url) => {
            if (typeof url !== 'string' || !url) return false;
            if (url.startsWith('data:text/html')) return false;
            if (app.isPackaged) return url.startsWith(`http://localhost:${serverPort}/`);
            return url.startsWith(`http://localhost:${serverPort}/`) || url.startsWith('http://localhost:3001/');
        };
        const scheduleRetry = (reason) => {
            if (bootCompleted || bootFailed) return;
            if (bootDeadlineAt && Date.now() >= bootDeadlineAt) {
                const detail = lastBootError || 'Retry budget exhausted before successful renderer load.';
                failBoot('Renderer boot timeout', detail);
                return;
            }
            clearLoadRetry();
            debugLog(`[Renderer] Scheduling retry in 1000ms (${reason})`);
            flushDebugLog();
            loadRetryTimer = setTimeout(() => {
                loadApp();
            }, 1000);
        };
        const loadApp = () => {
            if (!mainWindow || mainWindow.isDestroyed() || bootCompleted || bootFailed) return;
            startBootWatchdog();
            const appUrl = getCurrentUrl();
            loadAttempt += 1;
            debugLog(`[Renderer] loadURL attempt ${loadAttempt}: ${appUrl}`);
            flushDebugLog();
            mainWindow.loadURL(appUrl).catch((err) => {
                const errMsg = err instanceof Error ? err.message : String(err);
                lastBootError = `loadURL rejected for ${appUrl}: ${errMsg}`;
                debugLog(`[Renderer] loadURL rejection on attempt ${loadAttempt}: ${errMsg}`);
                flushDebugLog();
                if (!app.isPackaged && currentUrlIndex < candidateUrls.length - 1) {
                    currentUrlIndex += 1;
                    debugLog(`[Renderer] Switching fallback URL to ${getCurrentUrl()}`);
                    flushDebugLog();
                }
                scheduleRetry('loadURL rejection');
            });
        };


        // Show a loading screen immediately so the user sees something
        const loadingHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Esports Manager</title>
<style>
body{background:#080a0e;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;overflow:hidden}
.c{text-align:center;animation:fadeIn 1s ease-out}
.logo{font-size:48px;font-weight:700;letter-spacing:-2px;text-transform:uppercase;margin-bottom:8px;background:linear-gradient(135deg,#06b6d4,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sub{font-size:14px;font-weight:400;color:#555;text-transform:uppercase;letter-spacing:6px;margin-bottom:40px}
.bar{width:200px;height:2px;background:#1a1d24;border-radius:1px;margin:0 auto;overflow:hidden}
.bar-fill{width:30%;height:100%;background:linear-gradient(90deg,#06b6d4,#3b82f6);border-radius:1px;animation:loading 1.5s ease-in-out infinite}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes loading{0%{transform:translateX(-100%)}50%{transform:translateX(200%)}100%{transform:translateX(-100%)}}
</style></head>
<body><div class="c"><div class="logo">Esports Manager</div><div class="sub">FPS</div><div class="bar"><div class="bar-fill"></div></div></div></body></html>`;
        mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHtml));
        mainWindow.show();
        mainWindow.focus();

        if (app.isPackaged) {
            try {
                await startNextJSServer();
            } catch (serverError) {
                debugLog('SERVER STARTUP FAILED: ' + serverError.message);
                debugLog(serverError.stack || '');
                flushDebugLog();

                // Write error to log file
                try {
                    const logDir = path.join(app.getPath('userData'), 'logs');
                    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
                    const logFile = path.join(logDir, 'launch-error.log');
                    const entry = `[${new Date().toISOString()}] LAUNCH FAILURE\n${serverError.message}\n${serverError.stack || ''}\n---\n`;
                    fs.appendFileSync(logFile, entry, 'utf8');
                } catch (logErr) {
                    console.error('[Electron] Failed to write error log:', logErr);
                }

                forceQuit = true; // Allow immediate close from error page
                showErrorPage(mainWindow, serverError.message, serverError.stack);
                return;
            }
        }

        // Capture renderer errors and page load events to debug log
        mainWindow.webContents.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
            debugLog(`[Renderer] did-start-navigation url=${url} inPlace=${isInPlace} mainFrame=${isMainFrame}`);
            flushDebugLog();
        });
        mainWindow.webContents.on('dom-ready', () => {
            debugLog('[Renderer] dom-ready');
            flushDebugLog();
            const url = mainWindow.webContents.getURL();
            if (!bootCompleted && !bootFailed && isSuccessfulRendererUrl(url)) {
                rendererReachedDomReady = true;
                debugLog(`[Renderer] Extending boot grace after dom-ready: ${url}`);
                flushDebugLog();
                armBootWatchdog(POST_DOM_READY_GRACE_MS);
            }
        });
        mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
            // level: 0=verbose, 1=info, 2=warning, 3=error
            if (level >= 2) {
                debugLog(`[Renderer ${level === 3 ? 'ERROR' : 'WARN'}] ${message} (${sourceId}:${line})`);
                flushDebugLog();
            }
        });
        mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
            lastBootError = `did-fail-load ${errorCode} ${errorDescription} at ${validatedURL}`;
            debugLog(`[Renderer] Page load FAILED: ${errorCode} ${errorDescription} at ${validatedURL}`);
            flushDebugLog();
            if (!bootCompleted && !bootFailed && errorCode !== -3) {
                scheduleRetry('did-fail-load');
            }
        });
        mainWindow.webContents.on('did-finish-load', () => {
            const url = mainWindow.webContents.getURL();
            debugLog('[Renderer] Page finished loading: ' + url);
            flushDebugLog();
            if (isSuccessfulRendererUrl(url)) {
                markBootCompleted(url);
            }
        });
        mainWindow.on('unresponsive', () => {
            lastBootError = 'window became unresponsive';
            debugLog('[Renderer] Window became unresponsive');
            flushDebugLog();
        });
        mainWindow.on('responsive', () => {
            debugLog('[Renderer] Window responsive again');
            flushDebugLog();
        });

        loadApp();

        mainWindow.on('close', (e) => {
            if (forceQuit) return;
            e.preventDefault();
            if (closePending) return;
            closePending = true;
            mainWindow.webContents.send('app-close-intent');
            // Safety timeout: force close if renderer doesn't respond within 15s
            closeTimeout = setTimeout(() => {
                debugLog('[Electron] Close handler timed out after 15s, force-closing');
                flushDebugLog();
                forceQuit = true;
                closePending = false;
                if (mainWindow) mainWindow.close();
            }, 15000);
        });

        // Override beforeunload prevention when force-quit has been confirmed
        mainWindow.webContents.on('will-prevent-unload', (event) => {
            if (forceQuit) {
                event.preventDefault();
            }
        });

        // Force close if renderer process crashes while close is pending
        mainWindow.webContents.on('render-process-gone', (_event, details) => {
            const reason = details?.reason || 'unknown';
            const exitCode = Number.isInteger(details?.exitCode) ? details.exitCode : 'n/a';
            lastBootError = `render-process-gone reason=${reason} exitCode=${exitCode}`;
            debugLog(`[Renderer] render-process-gone reason=${reason} exitCode=${exitCode}`);
            flushDebugLog();
            if (!bootCompleted && !bootFailed) {
                failBoot('Renderer process crashed', lastBootError);
                return;
            }
            if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; }
            forceQuit = true;
            closePending = false;
            if (mainWindow) mainWindow.close();
        });

        mainWindow.on('closed', () => {
            clearBootWatchdog();
            clearLoadRetry();
            if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; }
            forceQuit = false;
            closePending = false;
            mainWindow = null;
        });
    } catch (error) {
        console.error('[Electron] Failed to create window:', error);
        const { dialog } = require('electron');
        dialog.showErrorBox('Launch Error', 'Failed to start the game:\n' + (error.message || error));
        app.quit();
    } finally {
        isCreatingWindow = false;
    }
}

// Defense-in-depth: apply the same navigation / popup / webview restrictions to
// any webContents that might be created outside of the main BrowserWindow flow.
app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (navEvent, navigationUrl) => {
        let allowed = false;
        try {
            const parsed = new URL(navigationUrl);
            allowed = parsed.protocol === 'http:' &&
                (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
        } catch (_) { /* malformed URL — stays disallowed */ }
        if (!allowed) navEvent.preventDefault();
    });
    contents.on('will-attach-webview', (attachEvent) => attachEvent.preventDefault());
});

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
