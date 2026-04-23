# Steam Cloud — configuration & testing

Steam Cloud gives players save-sync across PCs for free. This doc covers how
this game is wired to it, what to set in the Steamworks partner portal, and
how to verify syncing works.

## Which API the game uses

**ISteamRemoteStorage (the "manual" API), via `steamworks.js`.**

The renderer calls `window.electron.steam.writeToCloud / readFromCloud /
deleteFromCloud`. Those are defined in `electron/preload.js` and land in
`electron/steam.js`, which calls `client.cloud.writeFile / readFile /
deleteFile`. Each save is one file in Steam Cloud, named
`save_<saveId>.json`.

This is the manual path, not Auto-Cloud. Consequences:

- The partner portal pattern list is effectively ignored for actual sync —
  Steam uses the quota / file-count limits but doesn't auto-watch a
  directory. Configuring Auto-Cloud alongside the manual API **would cause
  duplicate/conflicting uploads**, so don't.
- The game decides what goes to the cloud. `engine/save-manager.ts` writes
  every save to the cloud immediately after the local write (non-blocking —
  a cloud failure does not fail the local save).
- On load, `SaveManager.loadGame` pulls the cloud copy, compares
  `updatedAtMs`, and picks whichever is newer. Handles the "saved on PC A,
  came home to PC B" case automatically.

Local saves still live in `app.getPath('userData')` (via `electron-store`
at `<userData>/config.json`) and are the source of truth when Steam isn't
running.

## Partner portal configuration

On <https://partner.steamgames.com>, go to **Your App → Cloud**. Set:

| Field | Value |
|---|---|
| Enable Steam Cloud for this application | ✅ |
| Force Type | **API (via ISteamRemoteStorage)** |
| Cloud Quota – Bytes per User | **100 MB** (a full career save is well under 1 MB; 100 MB is plenty of headroom for 50+ slots + backups) |
| Cloud Quota – Files per User | **1000** |
| Dynamic Cloud Sync for Steam Deck | ✅ Enabled (lets Deck ↔ desktop sync mid-session) |

Leave the "Root Paths" / "Path Overrides" table **empty**. Those drive
Auto-Cloud, which we don't use. Populating them would cause the
`<userData>/config.json` electron-store file to be synced in parallel
with the manual per-save uploads, producing overwrites.

Save the settings, then **publish** to SteamPipe. Cloud config changes
only take effect on clients after a build is pushed live.

## Local save locations (for debugging only — Steam does not watch these)

Electron's `app.getPath('userData')`:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\<appName>\config.json` |
| macOS | `~/Library/Application Support/<appName>/config.json` |
| Linux | `~/.config/<appName>/config.json` |

`<appName>` resolves to `productName` from `package.json` when set, so
currently `Esports Manager: FPS`. The colon renders fine on macOS and
Linux; Windows replaces it with an empty string when creating the
directory, so the real Windows folder is `Esports Manager FPS`. If you
rename productName, the userData directory moves and existing players
look like they've lost their careers — keep this stable or ship a
migration.

Cloud-side, per-user Steam Cloud storage lives at:

| OS | Path |
|---|---|
| Windows | `<Steam>\userdata\<SteamID3>\<AppID>\remote\` |
| macOS | `~/Library/Application Support/Steam/userdata/<SteamID3>/<AppID>/remote/` |
| Linux | `~/.local/share/Steam/userdata/<SteamID3>/<AppID>/remote/` |

Individual files look like `save_1731782940000_a7x.json`.

## Two-machine sync test

Minimum repro to confirm the sync actually works end-to-end:

1. On **machine A**, log into Steam, launch the game through Steam (not
   `npm run electron:dev` — Steam Cloud requires launch via Steam).
2. Start a new career, play through Week 1, save. Quit normally (let the
   window close — this flushes `steamClient.stats.store()` and lets
   Steam's background uploader push the file).
3. Wait ~30s, then hover the game in the Steam library → **Properties →
   Updates**. Cloud status should read "up to date" with a recent
   timestamp. If it says "conflict", resolve by keeping local.
4. On **machine B**, log into the same Steam account, install the game,
   launch. Before Main Menu renders, Steam will show a "syncing cloud
   saves" toast. Wait for it to finish.
5. Open the Load Game screen. The save from machine A must appear with
   the same Week 1 state. Loading it must restore roster, tactics, and
   finances identically.
6. Play through Week 2 on machine B, save, quit. Return to machine A,
   launch — the Week 2 save should now be the newest slot.

Use a throwaway career on both machines. Steam Cloud in Beta branches
can get confused; test on `default` or a dedicated `cloudtest` beta
branch.

## Troubleshooting

**"Saves appear locally but never upload."**
Steam Cloud writes only happen when the game is launched via Steam
(so steamworks.js can init) AND the logged-in account owns the
AppID. During dev the fallback AppID is `480` (Spacewar) — you can
technically test cloud with Spacewar but the files won't migrate to
the real appid later. Use the real appid via `steam_appid.txt` once
it's registered.

**"I see `[Steam] init failed` in the debug log."**
Steam client isn't running, or the appid in `steam_appid.txt` isn't
owned by the signed-in account. Cloud calls will silently return
`false`; local saves keep working. Normal in dev without Steam.

**"Quota exceeded."**
The file count / byte quota per user is checked by Steam, not the
game. `SaveManager.deleteSave` calls `steamService.deleteCloudFile`
for the same saveId, so deleting a career from the UI frees its
cloud slot. If a player accumulates thousands of autosaves, bump
the portal quota rather than refusing writes.

**"Save loaded on machine B is older than the one I just wrote on A."**
`SaveManager.loadGame` compares `updatedAtMs` between local and
cloud copies. If the clock on machine B is wrong by more than ~1s,
the comparison can pick the older file. Confirm both machines have
accurate system time (NTP) before escalating.
