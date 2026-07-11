# Modding & Steam Workshop — Real-Data Overlays

The shipped game is **100% fictional** — premium generated team names, procedural
crest logos, and AI-generated player portraits — so it carries **no real-world
IP**. Players who want the real scene (real team names, real logos, real player
names & faces) install a **community overlay**: either a hand-imported JSON
database or a **Steam Workshop** mod.

This is the same legally-clean model Football Manager's "real-name fix" and the
competitor's EMDB / Workshop "REAL NAMES MOD" use: the base game ships clean, the
player supplies the real data on their own machine.

Because overlays are keyed on the shipped **ids**, every team/player keeps its
simulation stats, roster links, tier and colours — only the display **name**,
**nickname**, **logo** and **portrait** change. The merge happens by id at
new-career time (`engine/mod-loader.ts` → `mergeSnapshot`).

---

## How it fits together

| Piece | File | Role |
|---|---|---|
| Overlay loader | `engine/mod-loader.ts` | Reads + validates the overlay, rewrites asset paths to `/mod-assets/…` |
| Active-mod resolver | `electron/steam.js` (`getActiveModDir`) | Chooses the live source: community import **or** a subscribed Workshop item |
| Asset server | `electron/main.js` (`serveModAsset`) | Serves the overlay's images from `/mod-assets/*` (path-traversal guarded) |
| Workshop IPC | `electron/steam.js` | `getSubscribedItems` / `installInfo` / `subscribe` / activate |
| Import & Workshop UI | `app/settings/community-import/page.tsx` | Subscribe → Activate, or paste/upload JSON |
| Packager | `scripts/build-mod.ts` | Turns local `raw-data/` into a ready-to-upload mod folder |

---

## Mod format

A mod is a folder:

```
<mod>/
  manifest.json                 # { name, title, author, version, game:"Esports Manager", schema:1, teams, players }
  teams.json                    # SnapshotTeam[]  (ids MUST match the shipped snapshot)
  players.json                  # SnapshotPlayer[] (ids MUST match the shipped snapshot)
  assets/teams/<slug>/logo.png                 # real logos
  assets/teams/<slug>/players/<nick>.png       # real portraits
```

- `logoPath` / `portraitPath` in the JSON are **relative** (e.g.
  `assets/teams/vitality/logo.png`). The loader rewrites them to
  `/mod-assets/…` at runtime and the Electron main process serves them from the
  active mod folder. Absolute (`/assets/…`), `http:`, `data:` and `..` paths are
  rejected by `validateModPayload`.
- Every player entry must carry the full numeric stat set (the packager copies it
  straight from the shipped snapshot, so this is automatic).

---

## Building the real-data mod

The repo already contains the real scraped data under `raw-data/`. Package it:

```bash
npm run build:mod -- --author="Your Name"
# → dist-mod/real-teams-2026/  (manifest + teams.json + players.json + assets/)
```

`dist-mod/` is **git-ignored** — it contains real IP. Build it locally, upload it
to the Workshop, but never commit or bundle it into the game build.

Options: `--name=<folder>`, `--author="…"`, `--dry-run`.

---

## Testing a mod locally (no Steam required)

Copy the built folder's **contents** into the game's community-mod dir, then start
a new career:

- Windows: `%APPDATA%/Esports Manager/mods/community/`
- macOS: `~/Library/Application Support/Esports Manager/mods/community/`
- Linux: `~/.config/Esports Manager/mods/community/`

```
mods/community/
  manifest.json
  teams.json
  players.json
  assets/…
```

Launch → **Settings → Import Community Database** shows it as active → **New
Career** applies it. (The in-app "Upload JSON" flow imports data only; to test
with images, copy the whole folder including `assets/` as above.)

---

## Enabling the Workshop for your app (one-time, Steamworks partner site)

The in-game code is done; enabling Workshop is a partner-site + App ID setup:

1. **Get your App ID.** In the [Steamworks partner site](https://partner.steamgames.com)
   your app has a numeric App ID. Put it in `steam_appid.txt` at the repo root:
   ```
   echo 2749950 > steam_appid.txt      # ← your real App ID, not 480
   ```
   `steam_appid.txt` is git-ignored and the `dist` / `electron:build` scripts
   refuse to package without it (see `scripts/check-steam-appid.js`).
2. **Turn on Workshop.** App Admin → **Workshop** → enable it (choose
   "Ready-To-Use Items" for data mods). Publish the change (it goes through the
   normal Steamworks publish step).
3. **Accept the Workshop Legal Agreement** once (the uploader prints the link the
   first time if you haven't).

## Publishing a Workshop item

The subscribe → activate → play loop is wired in-game. To publish/update the
item itself, use the included uploader (runs on YOUR Steam machine — Steam must
be running and you must own the app; it can't run in CI/headless):

```bash
npm run build:mod                     # produce dist-mod/real-teams-2026/

# FIRST time — creates a new item and prints its id (SAVE the id):
npm run workshop:upload -- \
  --title="Real Teams & Players 2026" \
  --description="Real names, logos and portraits. Community overlay." \
  --preview=preview.png

# LATER — update the SAME item (reuse the id):
npm run workshop:upload -- --item=123456789 --changenote="Roster update"
```

Flags: `--content=<dir>` (default `dist-mod/real-teams-2026`), `--item=<id>`,
`--title`, `--description`, `--changenote`, `--preview=<png>`, `--tags=a,b`,
`--visibility=public|friends|private`, `--appid=<n>`. Under the hood it calls
`steamworks.js` `workshop.createItem` / `updateItem` (`scripts/upload-workshop-mod.ts`).

> Steam requires a preview thumbnail (~512×512, ≤1 MB). Pass `--preview`, or add
> one on the item's page afterward.

Players then click **Browse** in the in-game Workshop panel, **Subscribe**, hit
**Refresh**, **Activate**, and start a new career.

---

## Legal note

Real team names/logos and player names/likenesses are the property of their
owners. These overlays are **user-generated and user-installed**; the shipped
game contains none of it. Do not commit built mods (`dist-mod/`) or real assets
into the game repo or build.
