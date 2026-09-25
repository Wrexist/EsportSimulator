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
const crypto = require('node:crypto');
const cloudBaselines = new Map();
const cloudWrites = new Set();
const cloudDigest = value => crypto.createHash('sha256').update(value).digest('hex');
function rememberCloud(key, value) {
    if (cloudBaselines.size >= 1000 && !cloudBaselines.has(key)) cloudBaselines.delete(cloudBaselines.keys().next().value);
    cloudBaselines.set(key, cloudDigest(value));
}
const { registerTrustedHandler, cloudName, workshopId, MAX_VALUE_BYTES } = require('./ipc-policy');
const { containedPath, readBounded, writeAtomic } = require('./local-files');
const handleSteam = (channel, handler) => registerTrustedHandler(ipcMain, channel, isTrustedSender, handler);

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
// (stats, achievements, cloud saves) and exhausting API rate limits.
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

const { resolveAppId } = require('./steam-app-id.cjs');

let steamClient = null;
let steamAppId = null;
let trustedSenderCheck = () => false;
let logFn = (msg) => console.log(msg);

// Steam's API does not expose a "read my own rich presence" call. Cache what
// the renderer set so getRichPresence() can round-trip locally.
const richPresenceCache = new Map();

function loadAppId() {
    const id = resolveAppId();
    logFn(id ? `[Steam] Configured release App ID ${id}` : '[Steam] Unexpected launch App ID; Steam integration stays disabled');
    return id;
}

function isTrustedSender(event) {
    return trustedSenderCheck(event) === true;
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

// A local career previously synced by another Steam user cannot upload into this account.
// Legacy careers without a receipt bind on their first successful local sync attempt.
function cloudOwnerAllows(filename, claim = false) {
    try {
        const id = coerceSteamId(steamClient?.localplayer?.getSteamId?.());
        if (!id || !/^[1-9][0-9]{0,19}$/.test(id)) return false;
        const root = app.getPath('userData');
        const receipt = 'steam-cloud-owners.json';
        const target = containedPath(root, receipt, true);
        const owners = fs.existsSync(target) ? JSON.parse(readBounded(root, receipt, 256 * 1024)) : {};
        if (!owners || typeof owners !== 'object' || Array.isArray(owners)) return false;
        if (owners[filename] && owners[filename] !== id) return false;
        if (claim && !owners[filename]) {
            if (Object.keys(owners).length >= 1000) return false;
            owners[filename] = id;
            writeAtomic(root, receipt, JSON.stringify(owners));
        }
        return true;
    } catch (_) { return false; }
}

function isValidCloudFilename(filename) {
    return cloudName(filename);
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
    return containedPath(app.getPath('userData'), 'mods', true);
}
function communityModDir() {
    return containedPath(app.getPath('userData'), 'mods/community', true);
}
function activePointerPath() {
    return path.join(modsRoot(), 'active.json');
}

function readActiveMod() {
    try {
        const p = activePointerPath();
        if (fs.existsSync(p)) {
            const j = JSON.parse(readBounded(modsRoot(), 'active.json', 4096));
            if (j?.source === 'none') return { source: 'none' };
            if (j?.source === 'community') return { source: 'community' };
            if (j?.source === 'workshop' && workshopId(j.workshopId)) return {source:'workshop', workshopId:j.workshopId, ...(/^[a-f0-9]{64}$/.test(j.bundleId || '') ? {bundleId:j.bundleId} : {})};
            return { source: 'none' };
        }
    } catch (_) { return { source: 'none' }; }
    return { source: 'community' };
}
function writeActiveMod(obj) {
    try {
        fs.mkdirSync(modsRoot(), { recursive: true });
        writeAtomic(modsRoot(), 'active.json', JSON.stringify(obj, null, 2));
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
 * back to the base game. Never silently activate a different database.
 */
function getActiveModDir() {
    try {
        const active = readActiveMod();
        if (active.source === 'none') return null;
        if (active.source === 'workshop' && active.workshopId) {
            if (active.bundleId) return require('./mod-assets').bundleDirectory(app.getPath('userData'), active.bundleId);
            const folder = workshopInstallFolder(active.workshopId);
            if (folder && fs.existsSync(folder)) return folder;
            return null; // Missing Workshop content must never activate a different database.
        }
    } catch (_) { return null; }
    return communityModDir();
}

function readModManifest(dir) {
    try {
        const p = path.join(dir, 'manifest.json');
        if (fs.existsSync(p)) return JSON.parse(readBounded(dir, 'manifest.json', 256 * 1024));
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
    for (const id of ids.slice(0, 1000)) {
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
                isEmMod: !!(manifest && (manifest.game === 'Esports Manager' && manifest.schema === 1)),
            });
        } catch (_) { /* skip malformed item */ }
    }
    return out;
}

function registerHandlers() {
    // ---- identity -------------------------------------------------------
    handleSteam('steam-get-id', (event) => {
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

    handleSteam('steam-get-persona-name', (event) => {
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
    handleSteam('steam-get-stat', (event, name) => {
        if (!ALLOWED_STATS.has(name)) return null;
        if (!isTrustedSender(event)) return null;
        if (!steamClient) return null;
        try {
            return steamClient.stats.getInt(name);
        } catch (e) {
            logFn(`[Steam] Error getting stat ${name}: ${e.message}`);
            return null;
        }
    });

    handleSteam('steam-set-stat', (event, name, value) => {
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
            if (!Number.isInteger(value) || value < 0 || value > 2147483647) return false;
            const previous = steamClient.stats.getInt(name);
            // Stats are best-career milestones; a new career must not erase an account's record.
            const next = name === 'stat_peak_ranking'
                ? (value > 0 && previous > 0 ? Math.min(previous, value) : Math.max(previous || 0, value))
                : Math.max(previous || 0, value);
            return steamClient.stats.setInt(name, next) === true;
        } catch (e) {
            logFn(`[Steam] Error setting stat ${name}: ${e.message}`);
            return false;
        }
    });

    handleSteam('steam-store-stats', (event) => {
        if (!steamClient) return false;
        if (!canRunMutation(event, 'steam-store-stats')) return false;
        try {
            if (!steamClient.stats?.store) return false;
            return steamClient.stats.store() === true;
        } catch (e) {
            logFn(`[Steam] Error storing stats: ${e.message}`);
            return false;
        }
    });

    // ---- achievements ---------------------------------------------------
    handleSteam('steam-set-achievement', (event, name) => {
        if (!steamClient) return false;
        if (!canRunMutation(event, 'steam-set-achievement')) return false;
        if (typeof name !== 'string' || !ALLOWED_ACHIEVEMENTS.has(name)) {
            logFn(`[Steam] Rejected set-achievement for unknown achievement: ${name}`);
            return false;
        }
        try {
            if (!steamClient.achievement?.activate || !steamClient.stats?.store) return false;
            if (steamClient.achievement.activate(name) !== true) return false;
            return steamClient.stats.store() === true;
        } catch (e) {
            logFn(`[Steam] Error setting achievement ${name}: ${e.message}`);
            return false;
        }
    });

    handleSteam('steam-is-achievement-unlocked', (event, name) => {
        if (!ALLOWED_ACHIEVEMENTS.has(name)) return false;
        if (!isTrustedSender(event)) return false;
        if (!steamClient) return false;
        try {
            if (!steamClient.achievement?.isActivated) return false;
            return !!steamClient.achievement.isActivated(name);
        } catch (e) {
            logFn(`[Steam] Error reading achievement ${name}: ${e.message}`);
            return false;
        }
    });

    // ---- leaderboards ---------------------------------------------------
    handleSteam('steam-set-leaderboard-score', async (event, name, score) => {
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
    handleSteam('steam-set-rich-presence', async (event, key, value) => {
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

    handleSteam('steam-get-rich-presence', (event, key) => {
        if (!isTrustedSender(event)) return null;
        if (typeof key !== 'string' || !key) return null;
        return richPresenceCache.get(key) ?? null;
    });

    handleSteam('steam-cloud-list', () => {
        try {
            const cloud = steamClient?.cloud;
            if (!cloud?.listFiles || cloud.isEnabledForAccount?.() === false || cloud.isEnabledForApp?.() === false) return [];
            return cloud.listFiles().slice(0, 1000).filter(file => cloudName(file.name) && Number(file.size) <= MAX_VALUE_BYTES && cloudOwnerAllows(file.name)).map(file => file.name);
        } catch (_) { return []; }
    });

    // ---- cloud saves ----------------------------------------------------
    handleSteam('steam-cloud-write', async (event, filename, contents) => {
        if (!steamClient) return false;
        if (!canRunMutation(event, 'steam-cloud-write')) return false;
        if (!isValidCloudFilename(filename)) {
            logFn(`[Steam] Rejected invalid cloud filename: ${String(filename).substring(0, 50)}`);
            return false;
        }
        const account = coerceSteamId(steamClient.localplayer?.getSteamId?.());
        const key = account + '\0' + filename;
        if (cloudWrites.has(key)) return false;
        cloudWrites.add(key);
        try {
            const cloud = steamClient.cloud;
            if (!cloud || cloud.isEnabledForAccount?.() === false || cloud.isEnabledForApp?.() === false) return false;
            if (!cloudOwnerAllows(filename, true) || typeof cloud.fileExists !== 'function') return false;
            // Refuse a blind replacement. Steam has no atomic compare-and-swap;
            // this guards the current SDK view, not a second machine's unsynced writes.
            if (await cloud.fileExists(filename)) {
                if (typeof cloud.readFile !== 'function') return false;
                const remote = await cloud.readFile(filename);
                if (typeof remote !== 'string' || Buffer.byteLength(remote, 'utf8') > MAX_VALUE_BYTES) return false;
                if (remote !== contents && cloudBaselines.get(key) !== cloudDigest(remote)) return false;
                if (remote !== contents) {
                    const recovery = containedPath(app.getPath('userData'), `steam-cloud-recovery/${account}`, true);
                    fs.mkdirSync(recovery, {recursive:true});
                    writeAtomic(recovery, filename, remote);
                }
            }
            if (coerceSteamId(steamClient.localplayer?.getSteamId?.()) !== account) return false;
            const accepted = typeof cloud.writeFile === 'function' && (await cloud.writeFile(filename, contents)) === true;
            if (accepted) rememberCloud(key, contents);
            return accepted;
        } catch (e) {
            logFn(`[Steam] Error writing cloud file ${filename}: ${e.message}`);
            return false;
        } finally { cloudWrites.delete(key); }
    });

    handleSteam('steam-cloud-read', async (event, filename) => {
        if (!steamClient) return null;
        if (!canRunMutation(event, 'steam-cloud-read')) return null;
        if (!isValidCloudFilename(filename)) {
            logFn(`[Steam] Rejected invalid cloud filename: ${String(filename).substring(0, 50)}`);
            return null;
        }
        const account = coerceSteamId(steamClient.localplayer?.getSteamId?.());
        try {
            const cloud = steamClient.cloud;
            if (!cloud || cloud.isEnabledForAccount?.() === false || cloud.isEnabledForApp?.() === false) return null;
            if (!cloudOwnerAllows(filename)) return null;
            if (typeof cloud.readFile === 'function') {
                const value = await cloud.readFile(filename);
                if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) return null;
                if (coerceSteamId(steamClient.localplayer?.getSteamId?.()) !== account) return null;
                rememberCloud(account + '\0' + filename, value);
                return value;
            }
            if (typeof cloud.readFileAsync === 'function') {
                const value = await cloud.readFileAsync(filename);
                if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) return null;
                if (coerceSteamId(steamClient.localplayer?.getSteamId?.()) !== account) return null;
                rememberCloud(account + '\0' + filename, value);
                return value;
            }
            return null;
        } catch (e) {
            logFn(`[Steam] Error reading cloud file ${filename}: ${e.message}`);
            return null;
        }
    });

    handleSteam('steam-cloud-delete', async (event, filename) => {
        if (!steamClient) return false;
        if (!canRunMutation(event, 'steam-cloud-delete')) return false;
        if (!isValidCloudFilename(filename)) {
            logFn(`[Steam] Rejected invalid cloud filename: ${String(filename).substring(0, 50)}`);
            return false;
        }
        try {
            const cloud = steamClient.cloud;
            if (!cloud || cloud.isEnabledForAccount?.() === false || cloud.isEnabledForApp?.() === false) return false;
            if (!cloudOwnerAllows(filename)) return false;
            if (typeof cloud.deleteFile === 'function') {
                return (await cloud.deleteFile(filename)) === true;
            }
            if (typeof cloud.deleteFileAsync === 'function') {
                return (await cloud.deleteFileAsync(filename)) === true;
            }
            return false;
        } catch (e) {
            logFn(`[Steam] Error deleting cloud file ${filename}: ${e.message}`);
            return false;
        }
    });

    // ---- Steam Workshop / community mods ----
    handleSteam('workshop-available', () => {
        return !!(steamClient && steamClient.workshop && typeof steamClient.workshop.getSubscribedItems === 'function');
    });

    handleSteam('workshop-list', () => {
        try { return listWorkshopMods(); } catch (e) { logFn(`[Mod] list failed: ${e.message}`); return []; }
    });

    handleSteam('workshop-get-active', () => {
        try { return readActiveMod(); } catch (_) { return { source: 'community' }; }
    });

    handleSteam('workshop-set-active', async (event, payload) => {
        if (!canRunMutation(event, 'workshop-set-active')) return false;
        if (!payload || !['none', 'community', 'workshop'].includes(payload.source)) return false;
        if (payload.source === 'workshop') {
            const folder = workshopInstallFolder(payload.workshopId);
            const manifest = folder && readModManifest(folder);
            if (!manifest || manifest.game !== 'Esports Manager' || manifest.schema !== 1) return false;
            const { readDatabase } = require('./mod-storage');
            const { validateModContent } = require('./mod-content');
            if (!validateModContent(readDatabase(folder)).ok) return false;
            const pinned = await require('./mod-assets').pinDatabase(folder, app.getPath('userData'));
            return writeActiveMod({ source: 'workshop', workshopId: payload.workshopId, ...(pinned.assetBundleId ? {bundleId:pinned.assetBundleId} : {}) });
        }
        return writeActiveMod({ source: payload.source });
    });

    handleSteam('workshop-subscribe', async (event, idStr) => {
        if (!canRunMutation(event, 'workshop-subscribe') || !steamClient || !steamClient.workshop) return false;
        try {
            await steamClient.workshop.subscribe(BigInt(idStr));
            if (typeof steamClient.workshop.download === 'function') {
                try { steamClient.workshop.download(BigInt(idStr), true); } catch (_) { /* download is best-effort */ }
            }
            return true;
        } catch (e) { logFn(`[Mod] subscribe failed: ${e.message}`); return false; }
    });

    handleSteam('workshop-unsubscribe', async (event, idStr) => {
        if (!canRunMutation(event, 'workshop-unsubscribe') || !steamClient || !steamClient.workshop) return false;
        try { await steamClient.workshop.unsubscribe(BigInt(idStr)); return true; }
        catch (e) { logFn(`[Mod] unsubscribe failed: ${e.message}`); return false; }
    });

    handleSteam('workshop-open', async (event, idStr) => {
        if (!canRunMutation(event, 'workshop-open')) return false;
        try {
            const { shell } = require('electron');
            const safeId = idStr || '';
            const url = safeId
                ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${safeId}`
                : `https://steamcommunity.com/app/${steamAppId}/workshop/`;
            await shell.openExternal(url);
            return true;
        } catch (e) { logFn(`[Mod] open failed: ${e.message}`); return false; }
    });
}

function initializeSteam({ isTrustedSender: senderCheck, log } = {}) {
    if (typeof senderCheck === 'function') trustedSenderCheck = senderCheck;
    if (typeof log === 'function') {
        logFn = log;
    }

    steamAppId = loadAppId();

    if (fs.existsSync(path.join(process.resourcesPath || '', 'LOCAL-QA-ONLY'))) {
        steamAppId = 0;
        logFn('[Steam] Local QA package: Steam initialization and account writes disabled');
        registerHandlers();
        return { client: null, appId: 0 };
    }

    if (!steamworks || !steamAppId) {
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
