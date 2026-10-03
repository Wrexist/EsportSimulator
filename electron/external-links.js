// External links leave the app only through the OS browser, only over HTTPS,
// and only to hosts the shipped UI actually links to. Everything else is
// silently dropped; the renderer never gets a second BrowserWindow.
const EXTERNAL_HOSTS = [
    'store.steampowered.com',
    'help.steampowered.com',
    'steamcommunity.com',
    // Map Studio credits/source links (see TODO owner decision on CS2Nades).
    'cs2nades.gg',
];
const MAX_EXTERNAL_URL_LENGTH = 2048;

function isAllowedExternalUrl(value) {
    if (typeof value !== 'string' || !value || value.length > MAX_EXTERNAL_URL_LENGTH) return false;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
        const host = url.hostname.toLowerCase();
        return EXTERNAL_HOSTS.some(allowed => host === allowed || host === `www.${allowed}`);
    } catch (_) {
        return false;
    }
}

// A compromised or buggy renderer must not be able to spam browser tabs.
function createExternalOpener(openExternal, { minIntervalMs = 1000, now = Date.now, log = () => {} } = {}) {
    let lastOpened = -Infinity;
    return function openAllowedExternal(value) {
        if (!isAllowedExternalUrl(value)) { log(`[Security] Blocked external URL ${String(value).slice(0, 200)}`); return false; }
        const at = now();
        if (at - lastOpened < minIntervalMs) { log('[Security] Throttled external URL'); return false; }
        lastOpened = at;
        // Re-serialise so the OS handler receives the parsed, normalised URL.
        Promise.resolve().then(() => openExternal(new URL(value).href)).catch(error => log(`[Security] openExternal failed: ${error?.message || error}`));
        return true;
    };
}

module.exports = { EXTERNAL_HOSTS, isAllowedExternalUrl, createExternalOpener };
