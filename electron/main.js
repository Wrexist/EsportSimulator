const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

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

let steamworks;
try {
    steamworks = require('steamworks.js');
} catch (e) {
    console.error('[Steam] Failed to load steamworks.js native module:', e);
    steamworks = null;
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
let steamClient;
let store;
let isCreatingWindow = false;
const steamMutationTimestamps = new Map();

const STEAM_MUTATION_WINDOW_MS = 1000;
const STEAM_MUTATION_LIMIT = 30;

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

const isTrustedSteamSender = (event) => {
    if (!mainWindow) return false;
    return event.sender.id === mainWindow.webContents.id;
};

const canRunSteamMutation = (event, key) => {
    if (!isTrustedSteamSender(event)) return false;
    const now = Date.now();
    const windowKey = `${event.sender.id}:${key}`;
    const history = steamMutationTimestamps.get(windowKey) || [];
    const recent = history.filter((ts) => now - ts < STEAM_MUTATION_WINDOW_MS);
    if (recent.length >= STEAM_MUTATION_LIMIT) return false;
    recent.push(now);
    steamMutationTimestamps.set(windowKey, recent);
    return true;
};

const initStore = async () => {
    const { default: Store } = await import('electron-store');
    store = new Store({
        defaults: {
            window: {
                width: 1280,
                height: 720,
                fullscreen: false,
                maximized: false
            }
        }
    });
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

// Enable Steam Overlay — manual setup instead of electronEnableSteamOverlay()
// so we avoid the --disable-direct-composition flag it adds.
// Read Steam App ID from steam_appid.txt to stay in sync with Steam SDK expectations.
let STEAM_APP_ID = 4326170; // Fallback
try {
    const appIdPaths = [
        path.join(process.resourcesPath, 'steam_appid.txt'),
        path.join(app.getAppPath(), 'steam_appid.txt'),
        path.join(__dirname, '../steam_appid.txt'),
    ];
    for (const p of appIdPaths) {
        if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, 'utf8').trim();
            const parsed = parseInt(raw, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                STEAM_APP_ID = parsed;
                debugLog(`[Steam] Loaded App ID ${STEAM_APP_ID} from ${p}`);
                break;
            }
        }
    }
} catch (e) {
    debugLog(`[Steam] Could not read steam_appid.txt, using fallback ID ${STEAM_APP_ID}`);
}

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

try {
    if (steamworks) {
        steamClient = steamworks.init(STEAM_APP_ID);
        console.log('[Steam] Initialized:', steamClient.localplayer.getName());
    } else {
        console.warn('[Steam] steamworks.js module not available, running without Steam integration');
    }
} catch (e) {
    console.error("[Steam] Failed to initialize:", e);
}

// Steam IPC Handlers
ipcMain.handle('steam-get-stat', (event, name) => {
    if (!steamClient) return null;
    try {
        return steamClient.stats.getInt(name) || steamClient.stats.getFloat(name);
    } catch (e) {
        console.error(`[Steam] Error getting stat ${name}:`, e);
        return null;
    }
});

ipcMain.handle('steam-set-stat', (event, name, value) => {
    if (!steamClient) return false;
    if (!canRunSteamMutation(event, 'steam-set-stat')) return false;
    try {
        if (Number.isInteger(value)) {
            steamClient.stats.setInt(name, value);
        } else {
            steamClient.stats.setFloat(name, value);
        }
        return true;
    } catch (e) {
        console.error(`[Steam] Error setting stat ${name}:`, e);
        return false;
    }
});

ipcMain.handle('steam-store-stats', (event) => {
    if (!steamClient) return false;
    if (!canRunSteamMutation(event, 'steam-store-stats')) return false;
    try {
        if (!steamClient.stats?.store) return false;
        steamClient.stats.store();
        return true;
    } catch (e) {
        console.error('[Steam] Error storing stats:', e);
        return false;
    }
});

ipcMain.handle('steam-set-achievement', (event, name) => {
    if (!steamClient) return false;
    if (!canRunSteamMutation(event, 'steam-set-achievement')) return false;
    try {
        if (!steamClient.achievements?.activate || !steamClient.stats?.store) return false;
        steamClient.achievements.activate(name);
        steamClient.stats.store();
        return true;
    } catch (e) {
        console.error(`[Steam] Error setting achievement ${name}:`, e);
        return false;
    }
});

ipcMain.handle('steam-set-leaderboard-score', async (event, name, score) => {
    if (!steamClient) return false;
    if (!canRunSteamMutation(event, 'steam-set-leaderboard-score')) return false;
    try {
        if (!steamClient.leaderboards?.find) return false;
        const leaderboard = await steamClient.leaderboards.find(name);
        await leaderboard.submitScore(score);
        return true;
    } catch (e) {
        console.error(`[Steam] Error setting leaderboard ${name}:`, e);
        return false;
    }
});

ipcMain.handle('steam-set-rich-presence', async (event, key, value) => {
    if (!steamClient) return false;
    if (!canRunSteamMutation(event, 'steam-set-rich-presence')) return false;
    try {
        if (steamClient.localplayer?.setRichPresence) {
            steamClient.localplayer.setRichPresence(key, value);
            return true;
        }
        return false;
    } catch (e) {
        console.error(`[Steam] Error setting rich presence ${key}:`, e);
        return false;
    }
});

ipcMain.handle('steam-is-achievement-unlocked', (event, name) => {
    if (!steamClient) return false;
    if (!isTrustedSteamSender(event)) return false;
    try {
        if (!steamClient.achievements?.isActivated) return false;
        return !!steamClient.achievements.isActivated(name);
    } catch (e) {
        console.error(`[Steam] Error reading achievement ${name}:`, e);
        return false;
    }
});

// Validate Steam Cloud filenames to prevent path traversal attacks
function isValidCloudFilename(filename) {
    if (typeof filename !== 'string' || filename.length === 0 || filename.length > 255) return false;
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return false;
    if (path.basename(filename) !== filename) return false;
    return true;
}

ipcMain.handle('steam-cloud-write', async (event, filename, contents) => {
    if (!steamClient) return false;
    if (!canRunSteamMutation(event, 'steam-cloud-write')) return false;
    if (!isValidCloudFilename(filename)) { console.error(`[Steam] Rejected invalid cloud filename: ${String(filename).substring(0, 50)}`); return false; }
    try {
        const cloud = steamClient.cloud;
        if (!cloud) return false;
        if (typeof cloud.writeFile === 'function') {
            await cloud.writeFile(filename, contents);
            return true;
        }
        if (typeof cloud.writeFileAsync === 'function') {
            await cloud.writeFileAsync(filename, contents);
            return true;
        }
        return false;
    } catch (e) {
        console.error(`[Steam] Error writing cloud file ${filename}:`, e);
        return false;
    }
});

ipcMain.handle('steam-cloud-read', async (event, filename) => {
    if (!steamClient) return null;
    if (!canRunSteamMutation(event, 'steam-cloud-read')) return null;
    if (!isValidCloudFilename(filename)) { console.error(`[Steam] Rejected invalid cloud filename: ${String(filename).substring(0, 50)}`); return null; }
    try {
        const cloud = steamClient.cloud;
        if (!cloud) return null;
        if (typeof cloud.readFile === 'function') {
            return await cloud.readFile(filename);
        }
        if (typeof cloud.readFileAsync === 'function') {
            return await cloud.readFileAsync(filename);
        }
        return null;
    } catch (e) {
        console.error(`[Steam] Error reading cloud file ${filename}:`, e);
        return null;
    }
});

ipcMain.handle('steam-cloud-delete', async (event, filename) => {
    if (!steamClient) return false;
    if (!canRunSteamMutation(event, 'steam-cloud-delete')) return false;
    if (!isValidCloudFilename(filename)) { console.error(`[Steam] Rejected invalid cloud filename: ${String(filename).substring(0, 50)}`); return false; }
    try {
        const cloud = steamClient.cloud;
        if (!cloud) return false;
        if (typeof cloud.deleteFile === 'function') {
            await cloud.deleteFile(filename);
            return true;
        }
        if (typeof cloud.deleteFileAsync === 'function') {
            await cloud.deleteFileAsync(filename);
            return true;
        }
        return false;
    } catch (e) {
        console.error(`[Steam] Error deleting cloud file ${filename}:`, e);
        return false;
    }
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
        mainWindow.setSize(width, height);
        mainWindow.center();
        if (store) {
            store.set('window.width', width);
            store.set('window.height', height);
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

        mainWindow = new BrowserWindow({
            width: windowState.width || 1280,
            height: windowState.height || 720,
            fullscreen: windowState.fullscreen || false,
            icon: windowIcon,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
            },
            show: false,
            autoHideMenuBar: true,
            backgroundColor: '#000000',
        });

        // Content Security Policy — restrict renderer to localhost only
        mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        "default-src 'self' http://localhost:*; " +
                        "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; " +
                        "style-src 'self' 'unsafe-inline' http://localhost:*; " +
                        "img-src 'self' data: blob: http://localhost:*; " +
                        "media-src 'self' data: blob: http://localhost:*; " +
                        "connect-src 'self' http://localhost:* ws://localhost:*; " +
                        "font-src 'self' data: http://localhost:*;"
                    ]
                }
            });
        });

        // Block any child/popup windows from being created (prevents ghost Alt-Tab entries)
        mainWindow.webContents.setWindowOpenHandler(() => {
            return { action: 'deny' };
        });

        if (windowState.maximized) {
            mainWindow.maximize();
        }

        if (windowIcon) {
            mainWindow.setIcon(windowIcon);
        }

        // Save window state listener
        const saveState = () => {
            if (!mainWindow || !store) return;
            try {
                const isMaximized = mainWindow.isMaximized();
                const isFullScreen = mainWindow.isFullScreen();
                const [width, height] = mainWindow.getSize();

                store.set('window.maximized', isMaximized);
                store.set('window.fullscreen', isFullScreen);

                if (!isMaximized && !isFullScreen) {
                    store.set('window.width', width);
                    store.set('window.height', height);
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
