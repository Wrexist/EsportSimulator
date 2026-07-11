# Releasing Esports Manager: FPS to Steam

**Read this before every submission.** It exists because a build was rejected
for the reasons below — this is the one correct path.

---

## Why the last build (BuildID 23989573) was rejected

1. **"doesn't launch … downloaded executable is `game\node_modules\7zip-bin\win\arm64\7za.exe`"**
   The depot was filled with the **source tree** (a "portable"/`SteamBuild` copy
   that includes `node_modules`), not the packaged app. There was no
   `EsportsManager.exe`, so Steam grabbed the first `.exe` it found — 7-Zip's
   `7za.exe`. The portable build scripts that caused this have been **removed**.
2. **Screenshots contain non-gameplay overlays / menus / concept art.** Store-page
   fix — see below.
3. **Early Access "current state" is empty.** Store-page fix — draft below.

---

## 1. Build the game (correct, packaged)

```bash
# One-time on the build machine: your real Steam App ID (NOT 480/Spacewar)
echo 4326170 > steam_appid.txt

npm ci
npm run dist          # runs check-steam-appid, next build, electron-builder
```

Output: **`dist/win-unpacked/`** — this folder contains **`EsportsManager.exe`**
(set via `build.executableName`). That is the folder Steam must receive.

> Do **not** upload the repo, a `SteamBuild` copy, or anything with `node_modules`.
> The old `create_steam_build*.ps1` / `build_portable.bat` / `build_release.bat`
> paths were the trap and are gone.

## 2. Upload the correct content

`deployment/config/app_build_4326170.vdf` already points `contentroot` at
`..\..\dist\win-unpacked`, and `depot_build_4326171.vdf` now excludes
`node_modules` as a safety net.

```powershell
cd C:\SteamPipe\sdk\tools\ContentBuilder\builder
.\steamcmd.exe +login YOUR_STEAM_USERNAME ^
  +run_app_build C:\path\to\repo\deployment\config\app_build_4326170.vdf +quit
```

## 3. Set the launch option (App Admin)

Installation → **General Installation → Launch Options**:

| Field | Value |
|---|---|
| Executable | `EsportsManager.exe` |
| Launch type | Launch |
| Operating System | Windows |

This must match the exe in `dist/win-unpacked` exactly. It does — `EsportsManager.exe`.

## 4. Store-page fixes (required before re-submit)

**Screenshots** — replace all of them with **actual in-game gameplay** captures at
1920×1080. No overlays, no marketing text/URLs/awards, no concept art, and avoid
menus/loading screens. Show the match view, roster/tactics, tournament bracket,
transfer/scouting screens in normal play. (Capture in-app; hide dev/debug UI.)

**Early Access → "What is the current state of the Early Access version?"** —
paste something like this (trim to match your actual About This section):

> Esports Manager: FPS is fully playable today. Everything listed in the "About
> This Game" section is implemented — please refer to it for the full feature
> list. In the current version you can: scout and sign players from a global
> talent pool, negotiate contracts and transfers, set tactics and map vetoes,
> play through matches round-by-round, run full seasons and tournaments, manage
> team finances, sponsors, training and facilities, and develop academy talent.
> Early Access is focused on balancing, UI polish, and adding more tournaments,
> events and quality-of-life features based on player feedback.

Then **re-submit the build for review**.

---

## Quick checklist

- [ ] `steam_appid.txt` = real App ID (4326170), gitignored
- [ ] `npm run dist` succeeded → `dist/win-unpacked/EsportsManager.exe` exists
- [ ] Uploaded via `app_build_4326170.vdf` (contentroot = dist\win-unpacked)
- [ ] Launch option = `EsportsManager.exe`
- [ ] Store screenshots are gameplay-only (no overlays/menus)
- [ ] Early Access "current state" filled in
- [ ] Re-submitted for review
