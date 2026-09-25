// Release identity is explicit; steam_appid.txt is a development-only SDK hint.
const RELEASE_APP_ID = 4326170;
function resolveAppId(environment = process.env) {
    const supplied = environment.SteamAppId;
    if (supplied !== undefined && supplied !== String(RELEASE_APP_ID)) return null;
    return RELEASE_APP_ID;
}
module.exports = { RELEASE_APP_ID, resolveAppId };
