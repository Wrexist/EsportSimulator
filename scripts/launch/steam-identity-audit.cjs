const { minimatch } = require('minimatch');

// Inspect the explicit release resolver without loading Electron or the native SDK.
function validReleaseIdentity(identity) {
    try {
        const id = identity.RELEASE_APP_ID;
        return Number.isSafeInteger(id) && id > 0 && id !== 480 &&
            identity.resolveAppId({}) === id &&
            identity.resolveAppId({ SteamAppId: String(id) }) === id &&
            ['480', '0', '', `${id}junk`].every(SteamAppId => identity.resolveAppId({ SteamAppId }) === null);
    } catch { return false; }
}

function excludesDevelopmentAppId(patterns) {
    if (!Array.isArray(patterns) || !patterns.every(p => typeof p === 'string')) return false;
    const exclusions = patterns.filter(p => p.startsWith('!')).map(p => p.slice(1));
    return ['steam_appid.txt', 'electron/steam_appid.txt', 'nested/tools/steam_appid.txt']
        .every(file => exclusions.some(pattern => minimatch(file, pattern, { dot: true })));
}

module.exports = { validReleaseIdentity, excludesDevelopmentAppId };
