// electron/steam.js
//
// Steamworks integration. Kept in its own module so electron/main.js is not
// buried in Steam-specific code, and so a non-Steam build (offline / dev
// without steamworks.js installed) still boots cleanly.
//
// Timing: initializeSteam() must be called BEFORE the first BrowserWindow is
// created, so the Steam overlay has a chance to hook into the renderer.
// Everything after that is IPC, safe to run any time.

const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let steamworks;
try {
    steamworks = require('steamworks.js');
} catch (e) {
    // Module can legitimately be missing in two cases: a CI / dev machine
    // without native module build tools, and a future non-Steam distribution
    // (itch, direct download). Both must still boot.
    steamworks = null;
}

// ---- mutation throttle ---------------------------------------------------
// Prevent a compromised or runaway renderer from spamming Steam write APIs
// (stats, achievements, cloud saves) and getting us VAC-flagged or
// rate-limited.
const STEAM_MUTATION_WINDOW_MS = 1000;
const STEAM_MUTATION_LIMIT = 30;
const mutationTimestamps = new Map();

// ---- write-target allowlists --------------------------------------------
// A compromised renderer must not be able to unlock arbitrary achievements,
// set unknown stats, or submit to unknown leaderboards. The main process
// only accepts the fixed set of IDs the game actually ships with. These
// MUST stay in sync with engine/steam-service.ts (ACHIEVEMENTS / setBatchStats
// / pushLeaderboardStats) — adding an achievement there means adding it here.
const ALLOWED_ACHIEVEMENTS = new Set([
    'FIRST_WIN', 'WIN_10', 'WIN_25', 'WIN_50', 'WIN_100', 'WIN_250', 'WIN_500',
    'FIRST_TOURNAMENT', 'WIN_B_TIER', 'WIN_A_TIER', 'WIN_MAJOR', 'GRAND_SLAM',
    'DYNASTY', 'PERFECT_TOURNAMENT', 'REACH_S_TIER', 'TOP_10_RANKING',
    'NUMBER_ONE', 'COMEBACK_KING', 'UNDERDOG', 'FIRST_MILLION', 'BUDGET_10M',
    'DEVELOP_STAR', 'HALL_OF_FAME_INDUCTION', 'LOYAL_TEAM', 'PROFIT_MASTER',
    'ZERO_TO_HERO', 'TOURNAMENT_WIN', 'SEASON_COMPLETE', 'FIRST_TRANSFER',
    'UNLUCKY', 'REDEMPTION',
]);
const ALLOWED_STATS = new Set([
    'stat_total_kills', 'stat_total_hs', 'stat_total_wins', 'stat_total_matches',
    'stat_max_budget', 'stat_tournaments_won', 'stat_majors_won',
    'stat_matches_lost', 'stat_peak_ranking', 'stat_players_developed',
    'stat_prize_money',
]);
const ALLOWED_LEADERBOARDS = new Set([
    'lead_world_ranking', 'lead_major_wins', 'lead_fastest_stier',
    'lead_total_earnings', 'lead_win_streak', 'lead_tournaments_won',
]);

// Spacewar, Valve's public test App ID. Used only when steam_appid.txt is
// absent — production builds ship the real ID in steam_appid.txt (asarUnpack).
const SPACEWAR_APP_ID = 480;

let steamClient = null;
let steamAppId = SPACEWAR_APP_ID;
let trustedWebContentsIdGetter = () => -1;
let logFn = (msg) => console.log(msg);

// Steam's API does not expose a "read my own rich presence" call. Cache what
// the renderer set so getRichPresence() can round-trip locally.
const richPresenceCache = new Map();

function loadAppId() {
    const candidatePaths = [
        path.join(process.resourcesPath || '', 'steam_appid.txt'),
        path.join(app.getAppPath(), 'steam_appid.txt'),
        path.join(__dirname, '..', 'steam_appid.txt'),
    ];
    for (const p of candidatePaths) {
        try {
            if (p && fs.existsSync(p)) {
                const raw = fs.readFileSync(p, 'utf8').trim();
                const parsed = parseInt(raw, 10);
                if (Number.isFinite(parsed) && parsed > 0) {
                    logFn(`[Steam] Loaded App ID ${parsed} from ${p}`);
                    return parsed;
                }
            }
        } catch (_) { /* try next candidate */ }
    }
    logFn(`[Steam] steam_appid.txt not found; falling back to Spacewar test ID ${SPACEWAR_APP_ID}`);
    return SPACEWAR_APP_ID;
}

function isTrustedSender(event) {
    const trusted = trustedWebContentsIdGetter();
    return trusted !== -1 && event.sender.id === trusted;
}

function canRunMutation(event, key) {
    if (!isTrustedSender(event)) return false;
    const now = Date.now();
    const k = `${event.sender.id}:${key}`;
    const history = (mutationTimestamps.get(k) || []).filter(ts => now - ts < STEAM_MUTATION_WINDOW_MS);
    if (history.length >= STEAM_MUTATION_LIMIT) return false;
    history.push(now);
    mutationTimestamps.set(k, history);
    return true;
}

function isValidCloudFilename(filename) {
    if (typeof filename !== 'string' || filename.length === 0 || filename.length > 255) return false;
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return false;
    if (path.basename(filename) !== filename) return false;
    return true;
}

function coerceSteamId(id) {
    if (id == null) return null;
    if (typeof id === 'bigint') return id.toString();
    if (typeof id === 'string') return id;
    if (typeof id === 'number') return String(id);
    // steamworks.js wraps the 64-bit Steam ID in an object; try a few shapes.
    if (typeof id.steamId64 === 'bigint') return id.steamId64.toString();
    if (typeof id.steamId64 === 'string') return id.steamId64;
    if (typeof id.getSteamId64 === 'function') {
        try { return String(id.getSteamId64()); } catch (_) { /* fall through */ }
    }
    if (typeof id.getRawSteamId === 'function') {
        try { return String(id.getRawSteamId()); } catch (_) { /* fall through */ }
    }
    return null;
}

// ============================================================
// Community mods + Steam Workshop
// The shipped game is fully fictional; a player who wants real names/logos/
// portraits installs a community overlay — either a hand-imported JSON db
// (userData/mods/community) or a subscribed Steam Workshop item. `active.json`
// selects which one is live. getActiveModDir() is consumed by the main
// process (mod-read IPC + the /mod-assets HTTP route) to read the overlay's
// JSON and serve its images.
// ============================================================
const EITEM_STATE_INSTALLED = 4;
const EITEM_STATE_NEEDS_UPDATE = 8;

function modsRoot() {
    return path.join(app.getPath('userData'), 'mods');
}
function communityModDir() {
    return path.join(modsRoot(), 'community');
}
function activePointerPath() {
    return path.join(modsRoot(), 'active.json');
}

function readActiveMod() {
    try {
        const p = activePointerPath();
        if (fs.existsSync(p)) {
            const j = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (j && (j.source === 'community' || j.source === 'workshop')) return j;
        }
    } catch (_) { /* fall through to default */ }
    return { source: 'community' };
}
function writeActiveMod(obj) {
    try {
        fs.mkdirSync(modsRoot(), { recursive: true });
        fs.writeFileSync(activePointerPath(), JSON.stringify(obj, null, 2), 'utf8');
        return true;
    } catch (e) {
        logFn(`[Mod] Failed to write active pointer: ${e.message}`);
        return false;
    }
}

function workshopInstallFolder(idStr) {
    if (!steamClient || !steamClient.workshop) return null;
    try {
        const info = steamClient.workshop.installInfo(BigInt(idStr));
        return info && info.folder ? info.folder : null;
    } catch (_) { return null; }
}

/**
 * Resolve the directory the active overlay is read/served from. A subscribed
 * Workshop item wins when selected AND installed on disk; otherwise we fall
 * back to the hand-imported community dir. Never throws.
 */
function getActiveModDir() {
    try {
        const active = readActiveMod();
        if (active.source === 'workshop' && active.workshopId) {
            const folder = workshopInstallFolder(active.workshopId);
            if (folder && fs.existsSync(folder)) return folder;
        }
    } catch (_) { /* fall through */ }
    return communityModDir();
}

function readModManifest(dir) {
    try {
        const p = path.join(dir, 'manifest.json');
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) { /* ignore */ }
    return null;
}

/** Enumerate subscribed Workshop items, annotated with our manifest metadata. */
function listWorkshopMods() {
    if (!steamClient || !steamClient.workshop || typeof steamClient.workshop.getSubscribedItems !== 'function') {
        return [];
    }
    let ids = [];
    try { ids = steamClient.workshop.getSubscribedItems() || []; } catch (_) { return []; }
    const out = [];
    for (const id of ids) {
        try {
            const idStr = id.toString();
            let state = 0;
            try { state = Number(steamClient.workshop.state(id)) || 0; } catch (_) { /* leave 0 */ }
            const installed = (state & EITEM_STATE_INSTALLED) === EITEM_STATE_INSTALLED;
            const needsUpdate = (state & EITEM_STATE_NEEDS_UPDATE) === EITEM_STATE_NEEDS_UPDATE;
            const info = installed ? (() => { try { return steamClient.workshop.installInfo(id); } catch (_) { return null; } })() : null;
            const folder = info && info.folder ? info.folder : null;
            const manifest = folder ? readModManifest(folder) : null;
            // manifest is untrusted (any subscribed item can supply object-valued
            // fields). Normalize to IPC-safe primitives so a crafted manifest
            // can't crash the React settings page with an invalid child.
            const str = (v) => (typeof v === 'string' ? v : null);
            const manifestTitle = str(manifest && manifest.title) || str(manifest && manifest.name);
            const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
            out.push({
                id: idStr,
                installed,
                needsUpdate,
                folder,
                sizeOnDisk: info ? Number(info.sizeOnDisk) : 0,
                title: (manifestTitle || `Workshop item ${idStr}`).slice(0, 200),
                author: (str(manifest && manifest.author) || '').slice(0, 120),
                teams: count(manifest && manifest.teams),
                players: count(manifest && manifest.players),
                // Distinguishes our real-data overlays from unrelated subscriptions.
                isEmMod: !!(manifest && (manifest.game === 'Esports Manager' || typeof manifest.schema === 'number')),
            });
        } catch (_) { /* skip malformed item */ }
    }
    return out;
}

function registerHandlers() {
    // ---- identity -------------------------------------------------------
    ipcMain.handle('steam-get-id', (event) => {
        if (!isTrustedSender(event)) return null;
        if (!steamClient) return null;
        try {
            const raw = steamClient.localplayer?.getSteamId?.();
            return coerceSteamId(raw);
        } catch (e) {
            logFn(`[Steam] getSteamId error: ${e.message}`);
            return null;
        }
    });

    ipcMain.handle('steam-get-persona-name', (event) => {
        if (!isTrustedSender(event)) return null;
        if (!steamClient) return null;
        try {
            return steamClient.localplayer?.getName?.() ?? null;
        } catch (e) {
            logFn(`[Steam] getPersonaName error: ${e.message}`);
            return null;
        }
    });

    // ---- stats ----------------------------------------------------------
    ipcMain.handle('steam-get-stat', (event, name) => {
        if (!isTrustedSender(event)) return null;
        if (!steamClient) return null;
        try {
            return steamClient.stats.getInt(name) || steamClient.stats.getFloat(name);
        } catch (e) {
            logFn(`[Steam] Error getting stat ${name}: ${e.message}`);
            return null;
        }
    });

    ipcMain.handle('steam-set-stat', (event, name, value) => {
        if (!steamClient) return false;
        if (!canRunMutation(event, 'steam-set-stat')) return false;
        if (typeof name !== 'string' || !ALLOWED_STATS.has(name)) {
            logFn(`[Steam] Rejected set-stat for unknown stat: ${name}`);
            return false;
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            logFn(`[Steam] Rejected set-stat with non-finite value for ${name}`);
            return false;
        }
        try {
            if (Number.isInteger(value)) {
                steamClient.stats.setInt(name, value);
            } else {
                steamClient.stats.setFloat(name, value);
            }
            return true;
        } catch (e) {
            logFn(`[Steam] Error setting stat ${name}: ${e.message}`);
            return false;
        }
    });

    ipcMain.handle('steam-store-stats', (event) => {
        if (!steamClient) return false;
        if (!canRunMutation(event, 'steam-store-stats')) return false;
        try {
            if (!steamClient.stats?.store) return false;
            steamClient.stats.store();
            return true;
        } catch (e) {
            logFn(`[Steam] Error storing stats: ${e.message}`);
            return false;
        }
    });

    // ---- achievements ---------------------------------------------------
    ipcMain.handle('steam-set-achievement', (event, name) => {
        if (!steamClient) return false;
        if (!canRunMutation(event, 'steam-set-achievement')) return false;
        if (typeof name !== 'string' || !ALLOWED_ACHIEVEMENTS.has(name)) {
            logFn(`[Steam] Rejected set-achievement for unknown achievement: ${name}`);
            return false;
        }
        try {
            if (!steamClient.achievements?.activate || !steamClient.stats?.store) return false;
            steamClient.achievements.activate(name);
            steamClient.stats.store();
            return true;
        } catch (e) {
            logFn(`[Steam] Error setting achievement ${name}: ${e.message}`);
            return false;
        }
    });

    ipcMain.handle('steam-is-achievement-unlocked', (event, name) => {
        if (!isTrustedSender(event)) return false;
        if (!steamClient) return false;
        try {
            if (!steamClient.achievements?.isActivated) return false;
            return !!steamClient.achievements.isActivated(name);
        } catch (e) {
            logFn(`[Steam] Error reading achievement ${name}: ${e.message}`);
            return false;
        }
    });

    // ---- leaderboards ---------------------------------------------------
    ipcMain.handle('steam-set-leaderboard-score', async (event, name, score) => {
        if (!steamClient) return false;
        if (!canRunMutation(event, 'steam-set-leaderboard-score')) return false;
        if (typeof name !== 'string' || !ALLOWED_LEADERBOARDS.has(name)) {
            logFn(`[Steam] Rejected leaderboard score for unknown leaderboard: ${name}`);
            return false;
        }
        if (typeof score !== 'number' || !Number.isFinite(score)) {
            logFn(`[Steam] Rejected non-finite leaderboard score for ${name}`);
            return false;
        }
        try {
            if (!steamClient.leaderboards?.find) return false;
            const leaderboard = await steamClient.leaderboards.find(name);
            await leaderboard.submitScore(score);
            return true;
        } catch (e) {
            logFn(`[Steam] Error setting leaderboard ${name}: ${e.message}`);
            return false;
        }
    });

    // ---- rich presence --------------------------------------------------
    ipcMain.handle('steam-set-rich-presence', async (event, key, value) => {
        if (!canRunMutation(event, 'steam-set-rich-presence')) return false;
        if (typeof key !== 'string' || !key) return false;
        // Always update the cache, even when Steam isn't running, so the
        // renderer's getRichPresence() sees a consistent view.
        if (value == null) {
            richPresenceCache.delete(key);
        } else {
            richPresenceCache.set(key, String(value));
        }
        if (!steamClient) return false;
        try {
            if (steamClient.localplayer?.setRichPresence) {
                steamClient.localplayer.setRichPresence(key, value);
                return true;
            }
            return false;
        } catch (e) {
            logFn(`[Steam] Error setting rich presence ${key}: ${e.message}`);
            return false;
        }
    });

    ipcMain.handle('steam-get-rich-presence', (event, key) => {
        if (!isTrustedSender(event)) return null;
        if (typeof key !== 'string' || !key) return null;
        return richPresenceCache.get(key) ?? null;
    });

    // ---- cloud saves ----------------------------------------------------
    ipcMain.handle('steam-cloud-write', async (event, filename, contents) => {
        if (!steamClient) return false;
        if (!canRunMutation(event, 'steam-cloud-write')) return false;
        if (!isValidCloudFilename(filename)) {
            logFn(`[Steam] Rejected invalid cloud filename: ${String(filename).substring(0, 50)}`);
            return false;
        }
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
            logFn(`[Steam] Error writing cloud file ${filename}: ${e.message}`);
            return false;
        }
    });

    ipcMain.handle('steam-cloud-read', async (event, filename) => {
        if (!steamClient) return null;
        if (!canRunMutation(event, 'steam-cloud-read')) return null;
        if (!isValidCloudFilename(filename)) {
            logFn(`[Steam] Rejected invalid cloud filename: ${String(filename).substring(0, 50)}`);
            return null;
        }
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
            logFn(`[Steam] Error reading cloud file ${filename}: ${e.message}`);
            return null;
        }
    });

    ipcMain.handle('steam-cloud-delete', async (event, filename) => {
        if (!steamClient) return false;
        if (!canRunMutation(event, 'steam-cloud-delete')) return false;
        if (!isValidCloudFilename(filename)) {
            logFn(`[Steam] Rejected invalid cloud filename: ${String(filename).substring(0, 50)}`);
            return false;
        }
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
            logFn(`[Steam] Error deleting cloud file ${filename}: ${e.message}`);
            return false;
        }
    });

    // ---- Steam Workshop / community mods ----
    ipcMain.handle('workshop-available', () => {
        return !!(steamClient && steamClient.workshop && typeof steamClient.workshop.getSubscribedItems === 'function');
    });

    ipcMain.handle('workshop-list', () => {
        try { return listWorkshopMods(); } catch (e) { logFn(`[Mod] list failed: ${e.message}`); return []; }
    });

    ipcMain.handle('workshop-get-active', () => {
        try { return readActiveMod(); } catch (_) { return { source: 'community' }; }
    });

    ipcMain.handle('workshop-set-active', (event, payload) => {
        if (!isTrustedSender(event)) return false;
        if (!payload || (payload.source !== 'community' && payload.source !== 'workshop')) return false;
        if (payload.source === 'workshop' && typeof payload.workshopId !== 'string') return false;
        return writeActiveMod(
            payload.source === 'community'
                ? { source: 'community' }
                : { source: 'workshop', workshopId: payload.workshopId }
        );
    });

    ipcMain.handle('workshop-subscribe', async (event, idStr) => {
        if (!isTrustedSender(event) || !steamClient || !steamClient.workshop) return false;
        try {
            await steamClient.workshop.subscribe(BigInt(idStr));
            if (typeof steamClient.workshop.download === 'function') {
                try { steamClient.workshop.download(BigInt(idStr), true); } catch (_) { /* download is best-effort */ }
            }
            return true;
        } catch (e) { logFn(`[Mod] subscribe failed: ${e.message}`); return false; }
    });

    ipcMain.handle('workshop-unsubscribe', async (event, idStr) => {
        if (!isTrustedSender(event) || !steamClient || !steamClient.workshop) return false;
        try { await steamClient.workshop.unsubscribe(BigInt(idStr)); return true; }
        catch (e) { logFn(`[Mod] unsubscribe failed: ${e.message}`); return false; }
    });

    ipcMain.handle('workshop-open', (event, idStr) => {
        if (!isTrustedSender(event)) return false;
        try {
            const { shell } = require('electron');
            const safeId = String(idStr).replace(/[^0-9]/g, '');
            const url = safeId
                ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${safeId}`
                : `https://steamcommunity.com/app/${steamAppId}/workshop/`;
            shell.openExternal(url);
            return true;
        } catch (e) { logFn(`[Mod] open failed: ${e.message}`); return false; }
    });
}

function initializeSteam({ getTrustedWebContentsId, log } = {}) {
    if (typeof getTrustedWebContentsId === 'function') {
        trustedWebContentsIdGetter = getTrustedWebContentsId;
    }
    if (typeof log === 'function') {
        logFn = log;
    }

    steamAppId = loadAppId();

    if (!steamworks) {
        logFn('[Steam] steamworks.js not available — running in offline mode');
        registerHandlers();
        return { client: null, appId: steamAppId };
    }

    try {
        steamClient = steamworks.init(steamAppId);
        logFn(`[Steam] Initialized as ${steamClient.localplayer.getName()} (appId ${steamAppId})`);
    } catch (e) {
        // Happens when Steam isn't running, or when the App ID isn't owned
        // by the logged-in account. Neither should prevent the game from
        // booting — the renderer will see null / false from every call.
        logFn(`[Steam] init failed, continuing in offline mode: ${e.message}`);
        steamClient = null;
    }

    registerHandlers();
    return { client: steamClient, appId: steamAppId };
}

function isAvailable() {
    return !!steamClient;
}

function getAppId() {
    return steamAppId;
}

module.exports = {
    initializeSteam,
    isAvailable,
    getAppId,
    // Consumed by electron/main.js for the mod-read IPC and /mod-assets route.
    getActiveModDir,
    communityModDir,
};
