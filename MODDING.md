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

## Publishing to the Steam Workshop

The subscribe → activate → play loop is fully wired in-game. To publish the item:

1. Build the mod folder (above). That folder is your Workshop **content**.
2. Add a `preview.png` (thumbnail) alongside it.
3. Create + upload the item via the Steamworks UGC API — `steamworks.js` exposes
   it (`workshop.createItem`, `workshop.updateItem`), or use Steam's Workshop
   uploader / SteamPipe. Suggested `UgcUpdate`:

   ```js
   const { itemId } = await client.workshop.createItem()
   await client.workshop.updateItem(itemId, {
     title: "Real Teams & Players 2026",
     description: "Real names, logos and portraits. Community overlay — not affiliated with any org or player.",
     contentPath: "<abs path to dist-mod/real-teams-2026>",
     previewPath: "<abs path to preview.png>",
     tags: ["real-data", "roster"],
     visibility: 0, // Public
   })
   ```

   > Uploading requires Steam running and the game's real App ID in
   > `steam_appid.txt`. It can't be done from CI/headless.

4. Players then click **Browse** in the in-game Workshop panel, subscribe, hit
   **Refresh**, **Activate**, and start a new career.

---

## Legal note

Real team names/logos and player names/likenesses are the property of their
owners. These overlays are **user-generated and user-installed**; the shipped
game contains none of it. Do not commit built mods (`dist-mod/`) or real assets
into the game repo or build.
