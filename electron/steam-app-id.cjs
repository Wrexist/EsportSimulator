// Release identity is explicit; steam_appid.txt is a development-only SDK hint.
// The free demo is its own Steam app; its ID is stamped into the demo package
// (electron/edition.cjs). A demo package without a valid ID keeps Steam off.
const { EDITION, DEMO_APP_ID } = require('./edition.cjs');
const RELEASE_APP_ID = 4326170;
function resolveAppId(environment = process.env, edition = EDITION, demoAppId = DEMO_APP_ID) {
    const expected = edition === 'demo' ? demoAppId : RELEASE_APP_ID;
    if (!expected) return null;
    const supplied = environment.SteamAppId;
    if (supplied !== undefined && supplied !== String(expected)) return null;
    return expected;
}
module.exports = { RELEASE_APP_ID, resolveAppId };
