const { app, BrowserWindow, Menu, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const steam = require('./steam');
const { createCloseHandshake } = require('./close-handshake');
const { isAllowedAppNavigation, isTrustedMainFrame } = require('./app-origin');
const { registerTrustedHandler, storageKey, MAX_MOD_BYTES, MOD_FILES } = require('./ipc-policy');
const { containedPath, readBounded, writeAtomic } = require('./local-files');
const { isAllowedLocalRequest, listenLoopback } = require('./local-server');
const { contentPolicy } = require('./content-policy');
const { secureWebContents } = require('./renderer-security');
const handleApp = (channel, handler) => registerTrustedHandler(ipcMain, channel, isMainWindowSender, handler);

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
const hadGpuCrash = (() => { try { return fs.existsSync(containedPath(app.getPath('userData'), 'gpu-crash-flag', true)); } catch (_) { return false; } })();
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
    const line = `[${new Date().toISOString()}] ${String(msg).slice(0, 16000)}`;
    console.log(line);
    debugLogLines.push(line);
    if (debugLogLines.length > 2000) debugLogLines.shift();
};
const flushDebugLog = () => {
    try {
        writeAtomic(app.getPath('userData'), 'logs/startup-debug.log', debugLogLines.join('\n') + '\n');
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
            writeAtomic(app.getPath('userData'), 'gpu-crash-flag', new Date().toISOString());
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
            if (!isAllowedLocalRequest(req, server.address().port)) { res.writeHead(403); res.end('Forbidden'); return; }
            const parsedUrl = parse(req.url, true);
            // Serve the active mod's images (real logos/portraits) from outside
            // the shipped web root before handing off to Next.
            if (serveModAsset(req, res, parsedUrl.pathname)) return;
            handle(req, res, parsedUrl);
        });

        await listenLoopback(server);
        process.env.NEXT_SERVER_PORT = String(server.address().port);
        debugLog(`Next.js server started on port ${server.address().port}`);
        flushDebugLog();
        return server;
    })();

    return Promise.race([serverPromise, timeoutPromise]);
}

const showErrorPage = (window, errorMessage, errorStack) => {
    const escapeHtml = value => String(value).slice(0, 16000).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const safeMsg = escapeHtml(errorMessage || 'Unknown error');
    const safeStack = escapeHtml(errorStack || '');
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
const closeHandshake = createCloseHandshake(async () => {
    if (!mainWindow || !closePending) return;
    try {
        const { response } = await require('electron').dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Game is not responding',
            message: 'The game has not acknowledged your exit request.',
            detail: 'You can keep playing or close without saving your latest progress.',
            buttons: ['Keep Open', 'Close Without Saving'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
        });
        if (!mainWindow || !closePending) return;
        closePending = false;
        if (response === 1) { forceQuit = true; mainWindow.close(); }
    } catch (error) {
        closePending = false;
        debugLog(`[Electron] Close prompt failed: ${error.message || error}`);
    }
});
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
    const width = Number.isFinite(saved?.width) ? Math.min(16384, Math.max(MIN_WIDTH, Math.floor(saved.width))) : DEFAULT_WIDTH;
    const height = Number.isFinite(saved?.height) ? Math.min(16384, Math.max(MIN_HEIGHT, Math.floor(saved.height))) : DEFAULT_HEIGHT;
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
    containedPath(userDataDir, 'config.json', true);
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
// isMainWindowSender returns false until mainWindow exists, which safely
// rejects all IPC from the renderer during the brief init window.
steam.initializeSteam({
    isTrustedSender: isMainWindowSender,
    log: debugLog,
});

// Window Control IPC Handlers
handleApp('app-get-user-data-path', () => {
    try {
        return app.getPath('userData');
    } catch (e) {
        console.error('[Electron] Error getting userData path:', e);
        return null;
    }
});

handleApp('window-set-fullscreen', (event, fullscreen) => {
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

handleApp('window-set-size', (event, width, height) => {
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

handleApp('window-get-size', (event) => {
    if (!mainWindow) return null;
    try {
        const [width, height] = mainWindow.getSize();
        return { width, height };
    } catch (e) {
        console.error('[Electron] Error getting window size:', e);
        return null;
    }
});

handleApp('window-is-fullscreen', (event) => {
    if (!mainWindow) return false;
    try {
        return mainWindow.isFullScreen();
    } catch (e) {
        console.error('[Electron] Error checking fullscreen:', e);
        return false;
    }
});

// GPU rendering mode controls
handleApp('gpu-get-mode', () => {
    return STABILITY_MODE ? 'compatibility' : 'performance';
});

handleApp('gpu-set-mode', (_event, mode) => {
    try {
        if (mode === 'compatibility') {
            writeAtomic(app.getPath('userData'), 'gpu-crash-flag', 'user-requested');
        } else if (mode === 'performance') {
            containedPath(app.getPath('userData'), 'gpu-crash-flag', true);
            if (fs.existsSync(gpuCrashFlagPath)) fs.unlinkSync(gpuCrashFlagPath);
        }
        return true;
    } catch (e) {
        console.error('[GPU] Failed to set rendering mode:', e);
        return false;
    }
});

function isTrustedAppUrl(url) {
    return isAllowedAppNavigation(url, process.env.NEXT_SERVER_PORT || '3000', app.isPackaged);
}

function isMainWindowSender(event) {
    return isTrustedMainFrame(event, mainWindow?.webContents, isTrustedAppUrl);
}

handleApp('app-close-received', (event) => {
    if (!isMainWindowSender(event) || !closePending) return false;
    closeHandshake.acknowledge();
    return true;
});

handleApp('app-close-confirmed', (event) => {
    if (!isMainWindowSender(event) || !closePending) return false;
    closeHandshake.cancel();
    closePending = false;
    forceQuit = true;
    if (mainWindow) {
        mainWindow.close();
    }
    return true;
});

handleApp('app-close-cancelled', (event) => {
    if (!isMainWindowSender(event) || !closePending) return false;
    console.log('[Electron] Close cancelled by user');
    closeHandshake.cancel();
    closePending = false;
    return true;
});

// Bound renderer-driven disk writes without throttling normal save operations.
let logWindowStart = 0;
let logWindowCount = 0;
// Error logging - write crash/error reports to a log file
handleApp('log-write-error', (event, report) => {
    try {
        if (Date.now() - logWindowStart > 60000) { logWindowStart = Date.now(); logWindowCount = 0; }
        if (++logWindowCount > 60) return false;
        if (!report || typeof report !== 'object') return false;
        const logDir = containedPath(app.getPath('userData'), 'logs', true);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = containedPath(logDir, 'error.log', true);
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
handleApp('storage-get-item', (_event, key) => {
    try {
        if (!store || typeof key !== 'string' || !key) return null;
        // Staging uses a literal .tmp key; dot notation would replace the primary.
        const value = store.store[key];
        return typeof value === 'string' ? value : null;
    } catch (e) {
        console.error('[Electron] Error reading storage key:', e);
        return { error: 'Disk storage could not be read' };
    }
});

// Hard ceiling on a single stored value (~32 MB). A full-season save is well
// under 2 MB; this only stops a runaway or compromised renderer from filling
// the user's disk via electron-store.
const STORAGE_VALUE_MAX_BYTES = 32 * 1024 * 1024;

handleApp('storage-set-item', (_event, key, value) => {
    try {
        if (!store || typeof key !== 'string' || !key || typeof value !== 'string') return false;
        if (Buffer.byteLength(value, 'utf8') > STORAGE_VALUE_MAX_BYTES) {
            console.error('[Electron] Rejected oversized storage write for key:', key);
            return false;
        }
        containedPath(app.getPath('userData'), 'config.json', true);
        store.store = { ...store.store, [key]: value };
        return true;
    } catch (e) {
        console.error('[Electron] Error writing storage key:', e);
        return false;
    }
});

handleApp('storage-remove-item', (_event, key) => {
    try {
        if (!store || typeof key !== 'string' || !key) return false;
        containedPath(app.getPath('userData'), 'config.json', true);
        const next = { ...store.store };
        delete next[key];
        store.store = next;
        return true;
    } catch (e) {
        console.error('[Electron] Error removing storage key:', e);
        return false;
    }
});

handleApp('storage-clear', () => {
    try {
        if (!store) return false;
        containedPath(app.getPath('userData'), 'config.json', true);
        store.store = Object.fromEntries(Object.entries(store.store ?? {}).filter(([key]) => !storageKey(key)));
        return true;
    } catch (e) {
        console.error('[Electron] Error clearing storage:', e);
        return false;
    }
});

handleApp('storage-get-all-keys', () => {
    try {
        if (!store) return [];
        return Object.keys(store.store ?? {}).filter(storageKey);
    } catch (e) {
        console.error('[Electron] Error listing storage keys:', e);
        return { error: 'Disk storage could not be listed' };
    }
});

// ============================================================
// Community-import (mod) file IPC
// Stores user-supplied fictional-data replacements in userData, outside
// the shipped bundle. The game reads these at snapshot load time when
// present.
// ============================================================
const { readDatabase, installDatabase, restoreDatabase, clearDatabase } = require('./mod-storage');
const { pinDatabase, bundleDirectory } = require('./mod-assets');
const MOD_DIRNAME = 'mods/community';
function modDir() {
    return containedPath(app.getPath('userData'), MOD_DIRNAME, true);
}

// The active overlay dir (community import OR a subscribed Workshop item) is
// resolved by the steam module, which owns the Workshop client.
function activeModReadDir() {
    try {
        if (typeof steam.getActiveModDir === 'function') return steam.getActiveModDir();
    } catch (_) { /* fall through */ }
    return modDir();
}

// Content types the /mod-assets route is allowed to serve. Anything else 404s,
// so a hostile mod folder can't get the app to stream arbitrary file types.
const MOD_ASSET_TYPES = {
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
};

/**
 * Serve GET /mod-assets/<relpath> from the active mod folder. Returns true if
 * the request was handled (so the caller skips Next). Path-traversal guarded:
 * the resolved target must stay inside the active mod dir.
 */
function serveModAsset(req, res, pathname) {
    if (!pathname || !pathname.startsWith('/mod-assets/')) return false;
    if (!['GET','HEAD'].includes(req.method)) { res.statusCode = 405; res.end(); return true; }
    try {
        let rel = decodeURIComponent(pathname.slice('/mod-assets/'.length));
        const pinned = /^pinned\/([a-f0-9]{64})\/(.+)$/.exec(rel);
        const baseDir = pinned ? bundleDirectory(app.getPath('userData'), pinned[1]) : activeModReadDir();
        if (pinned) rel = pinned[2];
        const target = containedPath(baseDir, rel);
        const baseWithSep = path.normalize(baseDir) + path.sep;
        if (target !== path.normalize(baseDir) && !target.startsWith(baseWithSep)) {
            res.statusCode = 403; res.end('Forbidden'); return true;
        }
        const ext = path.extname(target).toLowerCase();
        const type = MOD_ASSET_TYPES[ext];
        if (!type) { res.statusCode = 404; res.end('Not found'); return true; }
        if (!fs.existsSync(target) || !fs.statSync(target).isFile() || fs.statSync(target).size > 8 * 1024 * 1024) {
            res.statusCode = 404; res.end('Not found'); return true;
        }
        // The lexical check above doesn't catch a symlink/junction inside the mod
        // dir that points outside it (statSync follows links). Re-check on the
        // real resolved paths before streaming.
        let realTarget, realBase;
        try { realTarget = fs.realpathSync(target); realBase = fs.realpathSync(baseDir); }
        catch (_) { res.statusCode = 404; res.end('Not found'); return true; }
        if (realTarget !== realBase && !realTarget.startsWith(realBase + path.sep)) {
            res.statusCode = 403; res.end('Forbidden'); return true;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        if (req.method === 'HEAD') { res.end(); return true; }
        fs.createReadStream(realTarget).on('error', () => { try { res.destroy(); } catch (_) { /* noop */ } }).pipe(res);
        return true;
    } catch (e) {
        try { res.statusCode = 404; res.end('Not found'); } catch (_) { /* noop */ }
        return true;
    }
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

handleApp('mod-exists', () => {
    try {
        const d = activeModReadDir();
        if (!fs.existsSync(d)) return false;
        const data = readDatabase(d);
        return ['players', 'teams', 'tournaments'].some(key => data[key] !== undefined);
    } catch (e) {
        return false;
    }
});

handleApp('mod-read', async (_event, filename) => {
    try {
        const f = safeModFilename(filename);
        const data = await pinDatabase(activeModReadDir(), app.getPath('userData'));
        const value = data[f.replace('.json', '')];
        return value === undefined ? null : JSON.stringify(value);
    } catch (e) {
        console.error('[Mod] read failed:', e);
        return null;
    }
});

handleApp('mod-write', (_event, filename, contents) => {
    try {
        const f = safeModFilename(filename);
        if (typeof contents !== 'string') return false;
        const d = ensureModDir();
        writeAtomic(d, f, contents);
        return true;
    } catch (e) {
        console.error('[Mod] write failed:', e);
        return false;
    }
});

handleApp('mod-install', (_event, text) => {
    const { parseModContent, validateModReferences } = require('./mod-content');
    const result = parseModContent(text);
    if (!result.ok) return false;
    const merged = ['players', 'teams', 'tournaments'].map(section => {
        const base = JSON.parse(readBounded(path.join(app.getAppPath(), 'public/data/snapshot'), `${section}.json`, MAX_MOD_BYTES));
        const entries = new Map(base.map(entry => [entry.id, entry]));
        for (const entry of result.value[section] || []) entries.set(entry.id, entry);
        return [...entries.values()];
    });
    if (validateModReferences(...merged)) return false;
    return installDatabase(ensureModDir(), text);
});
handleApp('mod-read-folder', async () => {
    const result = await require('electron').dialog.showOpenDialog(mainWindow, { title: 'Choose community database folder', properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length !== 1) return null;
    const database = await pinDatabase(result.filePaths[0], app.getPath('userData'));
    return JSON.stringify(database);
});
handleApp('mod-restore', () => restoreDatabase(ensureModDir()));
handleApp('mod-clear', () => clearDatabase(ensureModDir()));

handleApp('mod-path', () => {
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

        mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
            const headers = Object.fromEntries(Object.entries(details.responseHeaders || {}).filter(([key]) => key.toLowerCase() !== 'content-security-policy'));
            callback({responseHeaders: {...headers, 'Content-Security-Policy': [contentPolicy(details.url, !app.isPackaged)], 'X-Content-Type-Options': ['nosniff']}});
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
            const allowed = isTrustedAppUrl(navigationUrl);
            if (!allowed) {
                debugLog(`[Security] Blocked navigation to ${navigationUrl}`);
                navEvent.preventDefault();
            }
        });
        mainWindow.webContents.on('will-redirect', (redirectEvent, redirectUrl) => {
            const allowed = isTrustedAppUrl(redirectUrl);
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
        const getCurrentUrl = () => `http://localhost:${process.env.NEXT_SERVER_PORT || '3000'}/main-menu`;
        const isSuccessfulRendererUrl = isTrustedAppUrl;
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
            closeHandshake.request();
            mainWindow.webContents.send('app-close-intent');
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
            closeHandshake.cancel();
            forceQuit = true;
            closePending = false;
            if (mainWindow) mainWindow.close();
        });

        mainWindow.on('closed', () => {
            clearBootWatchdog();
            clearLoadRetry();
            closeHandshake.cancel();
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
    secureWebContents(contents, isTrustedAppUrl);
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
