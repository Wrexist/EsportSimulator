const { resolveAppId } = require('../electron/steam-app-id.cjs')
const { validReleaseIdentity, excludesDevelopmentAppId } = require('../scripts/launch/steam-identity-audit.cjs')

test('release initializes its own App ID without a development text file', () => {
    expect(resolveAppId({})).toBe(4326170)
    expect(resolveAppId({ SteamAppId: '4326170' })).toBe(4326170)
})

test('a mismatched or malformed Steam launch cannot target another app', () => {
    for (const SteamAppId of ['480', '0', '', '4326170junk', '1234']) {
        expect(resolveAppId({ SteamAppId })).toBeNull()
    }
})

test('release audit accepts the explicit resolver but rejects fallback and mismatched identities', () => {
    expect(validReleaseIdentity(require('../electron/steam-app-id.cjs'))).toBe(true)
    expect(validReleaseIdentity(null)).toBe(false)
    expect(validReleaseIdentity({ RELEASE_APP_ID: 480, resolveAppId: () => 480 })).toBe(false)
    expect(validReleaseIdentity({ RELEASE_APP_ID: 4326170, resolveAppId: () => 4326170 })).toBe(false)
})

test('release audit requires development App ID exclusion at every directory depth', () => {
    expect(excludesDevelopmentAppId(['**/*', '!**/steam_appid.txt'])).toBe(true)
    expect(excludesDevelopmentAppId(['steam_appid.txt'])).toBe(false)
    expect(excludesDevelopmentAppId(['**/*', '!steam_appid.txt'])).toBe(false)
    expect(excludesDevelopmentAppId(['**/*', '!*/steam_appid.txt'])).toBe(false)
    expect(excludesDevelopmentAppId([{}])).toBe(false)
})
