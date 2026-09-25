// Main-process contracts. Preload checks cannot substitute for these checks.
const MAX_VALUE_BYTES = 32 * 1024 * 1024;
const MAX_MOD_BYTES = 16 * 1024 * 1024;
const MOD_FILES = ['players.json', 'teams.json', 'tournaments.json', 'manifest.json'];
const text = (v, max) => typeof v === 'string' && v.length <= max && Buffer.byteLength(v, 'utf8') <= max;
const storageKey = v => typeof v === 'string' && (v === 'cs2_manager_career_profile' || v === 'esports-sim-storage' || /^esports_[a-zA-Z0-9_-]{1,230}$/.test(v) || /^esports_save_[a-zA-Z0-9_-]{1,220}\.tmp$/.test(v));
const cloudName = v => typeof v === 'string' && /^save_[a-zA-Z0-9_-]{1,230}\.json$/.test(v);
const workshopId = v => typeof v === 'string' && /^[1-9][0-9]{0,19}$/.test(v) && BigInt(v) <= 18446744073709551615n;
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const name = v => typeof v === 'string' && /^[a-zA-Z0-9_]{1,128}$/.test(v);
const int32 = v => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
function modContent(file, value) {
    if (!text(value, MAX_MOD_BYTES)) return false;
    try {
        const json = JSON.parse(value, (key, entry) => {
            if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe JSON key');
            return entry;
        });
        return file === 'manifest.json' ? record(json) : Array.isArray(json);
    } catch (_) { return false; }
}
const contracts = {};
function add(channels, fallback, check, schema, authority) {
    for (const channel of channels.split(' ')) contracts[channel] = { fallback, check, schema, authority };
}
const none = args => args.length === 0;
const one = check => args => args.length === 1 && check(args[0]);
add('app-get-user-data-path mod-path', null, none, 'no arguments → string|null', 'User-data path disclosure');
add('window-get-size', null, none, 'no arguments → {width,height}|null', 'Window read');
add('window-is-fullscreen', false, none, 'no arguments → boolean', 'Window read');
add('window-set-fullscreen', false, one(v=>typeof v==='boolean'), 'boolean → boolean', 'Window and private window settings');
add('window-set-size', false, a=>a.length===2 && a.every(v=>Number.isInteger(v)&&v>=1&&v<=16384), 'two integers 1..16384 → boolean; clamped to UI minimum', 'Window and private window settings');
add('gpu-get-mode', null, none, 'no arguments → mode|null', 'GPU flag read');
add('gpu-set-mode', false, one(v=>['compatibility','performance'].includes(v)), 'compatibility|performance → boolean', 'Fixed GPU flag file');
add('app-close-received app-close-confirmed app-close-cancelled', false, none, 'no arguments → boolean', 'Pending native close handshake');
add('log-write-error', false, one(v=>record(v)&&text(v.message,8000)&&(v.stack===undefined||text(v.stack,8000))&&(v.level===undefined||['error','warn','info','debug'].includes(v.level))), 'message/stack ≤8000 UTF-8 bytes; fixed level enum → boolean', 'Rotated error logs only');
add('storage-get-item', null, one(storageKey), 'allowed storage key → string|null', 'Game storage namespace');
add('storage-set-item', false, a=>a.length===2&&storageKey(a[0])&&text(a[1],MAX_VALUE_BYTES), 'allowed key + string ≤32 MiB UTF-8 → boolean', 'Game storage namespace');
add('storage-remove-item', false, one(storageKey), 'allowed storage key → boolean', 'Game storage namespace');
add('storage-clear', false, none, 'no arguments → boolean', 'Game keys only; preserves private window settings');
add('storage-get-all-keys', [], none, 'no arguments → string[]', 'Game keys only');
add('mod-read-folder', null, none, 'native folder chooser to validated pinned database JSON', 'Read selected mod media; retain local image bundle for preview');
add('mod-exists', false, none, 'no arguments → boolean', 'Active mod metadata');
add('mod-read', null, one(v=>MOD_FILES.includes(v)), 'four fixed JSON filenames → bounded string|null', 'Contained active mod files');
add('mod-write', false, a=>a.length===2&&MOD_FILES.includes(a[0])&&modContent(a[0],a[1]), 'fixed filename + JSON array/manifest object ≤16 MiB → boolean', 'Community mod JSON only');
add('mod-install', false, one(v=>text(v,MAX_MOD_BYTES)&&require('./mod-content').parseModContent(v).ok), 'complete database JSON up to 16 MiB', 'Atomic community database replacement with backup');
add('mod-restore', false, none, 'no arguments', 'Restore previous community database');
add('mod-clear', false, none, 'no arguments → boolean', 'Four community JSON files only');
add('steam-get-id steam-get-persona-name', null, none, 'no arguments → string|null', 'Steam identity read');
add('steam-get-stat', null, one(name), 'bounded stat identifier → number|null', 'Steam stat allowlist');
add('steam-set-stat', false, a=>a.length===2&&name(a[0])&&typeof a[1]==='number'&&Number.isFinite(a[1])&&Math.abs(a[1])<=2147483647, 'allowlisted name + finite 32-bit range value → boolean', 'Steam stats; throttled');
add('steam-store-stats', false, none, 'no arguments → boolean', 'Steam stats; throttled');
add('steam-set-achievement steam-is-achievement-unlocked', false, one(name), 'allowlisted identifier → boolean', 'Steam achievements');
add('steam-set-leaderboard-score', false, a=>a.length===2&&name(a[0])&&int32(a[1]), 'allowlisted name + int32 → boolean', 'Steam leaderboard; throttled');
const presenceKey = v=>['status','steam_display'].includes(v);
add('steam-set-rich-presence', false, a=>a.length===2&&presenceKey(a[0])&&(a[1]===null||text(a[1],255)), 'status|steam_display + string ≤255 bytes|null → boolean', 'Bounded presence cache and Steam');
add('steam-get-rich-presence', null, one(presenceKey), 'status|steam_display → string|null', 'Presence cache');
add('steam-cloud-list', [], none, 'no arguments to bounded save filenames', 'Current Steam account cloud namespace, receipt filtered');
add('steam-cloud-write', false, a=>a.length===2&&cloudName(a[0])&&text(a[1],MAX_VALUE_BYTES), 'save_*.json + string ≤32 MiB UTF-8 → boolean', 'Steam cloud namespace; throttled');
add('steam-cloud-read', null, one(cloudName), 'save_*.json → bounded string|null', 'Steam cloud namespace; throttled');
add('steam-cloud-delete', false, one(cloudName), 'save_*.json → boolean', 'Steam cloud namespace; throttled');
add('workshop-available', false, none, 'no arguments → boolean', 'Workshop status');
add('workshop-list', [], none, 'no arguments → bounded item list', 'Subscribed Workshop manifest reads');
add('workshop-get-active', null, none, 'no arguments → active pointer|null', 'Fixed active pointer JSON');
add('workshop-set-active', false, one(v=>record(v)&&(v.source==='none'||v.source==='community'||(v.source==='workshop'&&workshopId(v.workshopId)))), 'community or workshop + uint64 decimal ID → boolean', 'Fixed active pointer JSON');
add('workshop-subscribe workshop-unsubscribe', false, one(workshopId), 'uint64 decimal ID → boolean', 'Steam Workshop subscription');
add('workshop-open', false, a=>a.length<=1&&(a.length===0||a[0]===undefined||a[0]===null||a[0]===''||workshopId(a[0])), 'optional uint64 ID → boolean', 'Fixed HTTPS steamcommunity.com URL');

function registerTrustedHandler(ipcMain, channel, isTrusted, handler) {
    const contract = contracts[channel];
    if (!contract) throw new Error(`Missing IPC contract: ${channel}`);
    ipcMain.handle(channel, async (event, ...args) => {
        try {
            if (isTrusted(event) && contract.check(args)) return await handler(event, ...args);
        } catch (_) { /* Invalid/destroyed senders and handler failures fail closed. */ }
        return Array.isArray(contract.fallback) ? [] : contract.fallback;
    });
}
module.exports = { contracts, registerTrustedHandler, storageKey, cloudName, workshopId, MAX_VALUE_BYTES, MAX_MOD_BYTES, MOD_FILES };
