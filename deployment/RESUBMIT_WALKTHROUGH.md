# Re-submit walkthrough — game build + store + Workshop

Follow top to bottom. Everything here is on **your Windows build machine** and the
**Steamworks website** (partner.steamgames.com). App ID **4326170**, depot **4326171**.

---

## A. Store screenshots — shot list (fixes the screenshot rejection)

Capture each at **1920×1080, fullscreen**, during normal play. **Hide** the bug-report
button and any dev/debug overlay. **No** marketing text, URLs, awards, logos, borders,
menus, or loading screens — just the game. Aim for 6–8:

| # | In-game screen (route) | What to show |
|---|---|---|
| 1 | **Live match** `/match/<id>/live` | A round in progress — scoreboard, round timeline. *(hero shot)* |
| 2 | **Map veto** `/match/<id>/veto` | The pick/ban sequence mid-veto. |
| 3 | **Tactics** `/match/<id>/tactics` | Lineup + strategy set before a match. |
| 4 | **Squad** `/squad` | Roster with player ratings/roles. |
| 5 | **Tournament bracket** `/tournaments/<id>` | A live bracket / group stage. |
| 6 | **Transfers** `/transfers` | A transfer/negotiation in progress. |
| 7 | **Scouting** `/scouting` | Scouting the talent pool. |
| 8 | **Training** `/training` *(or `/finances`)* | Training plan / or the finances screen for depth. |

Tips: play a few weeks first so screens show real data (full brackets, signed
players, populated tables). Windows screenshot: **Win+Shift+S** or Steam's **F12**
(F12 saves to the app's screenshot library you can upload straight from).

Then: **Steamworks → your app → Store page → Edit → Screenshots** → delete the old
ones → upload these → **Save** → **Publish** the store-page change.

---

## B. Rebuild + re-upload the game build

### B1. Build the packaged game (terminal, repo root)
```bash
echo 4326170 > steam_appid.txt        # real App ID; file is git-ignored
npm ci
npm run dist
```
**Verify before continuing:** open `dist\win-unpacked\` and confirm
**`EsportsManager.exe`** is there. If it is, the build is correct.

### B2. Confirm the upload config (no edits needed)
Open `deployment\config\app_build_4326170.vdf` and check:
```
"contentroot" "..\..\dist\win-unpacked"
"depots" { "4326171" "depot_build_4326171.vdf" }
```

### B3. Upload with SteamPipe (terminal)
```powershell
cd C:\SteamPipe\sdk\tools\ContentBuilder\builder
.\steamcmd.exe +login YOUR_STEAM_USERNAME ^
  +run_app_build C:\path\to\repo\deployment\config\app_build_4326170.vdf +quit
```
Enter your password / Steam Guard when prompted. Wait for **"Successfully finished
AppBuild"**.

### B4. Point the build at your review branch (Steamworks website)
- **SteamPipe → Builds**: find the new BuildID → set it live on the branch you submit
  for review (usually **default**) → **Publish**.

### B5. Set the launch option (Steamworks website)
- **App Admin → Installation → General Installation → Launch Options**
  - Executable: **`EsportsManager.exe`**
  - Launch type: **Launch**, OS: **Windows**
- **Save** → **Publish**.

---

## C. Fix the Early Access text (Steamworks website)
- **Store page → Early Access tab → "What is the current state of the Early Access
  version?"** → paste the copy from `deployment/RELEASE.md` §4 → **Save** → **Publish**.

---

## D. Submit for review
Once B (build live on branch), the launch option, and C + the screenshots are all
**Published**:
- Go to the app's landing page → **Prepare for review / Submit for review** and confirm.
- Steam re-tests the branch build. All four earlier failures are addressed.

**Order that matters:** build (B1) → verify exe → upload (B3) → build live on branch
(B4) → launch option (B5) → store screenshots (A) + EA text (C) → **Publish all store
edits** → submit (D).

---

## E. Workshop — publish the first item (separate from the game review)

Workshop only needs **one public item** to finish setup. Do this any time.

### E1. Enable Workshop (one-time, website)
- **App Admin → Workshop** → enable **"Ready-To-Use Items"** → **Publish**.

### E2. Build a mod folder (terminal, Steam running, you own the app)
```bash
# Clean example (no real IP) — enough to satisfy "upload 1 public item":
npm run build:example-mod

# OR the real pack (ONLY once your licence is signed):
npm run build:mod -- --author="Your Studio"
```

### E3. Upload it
```bash
# example / template:
npm run workshop:upload -- --content=examples/mod-template \
  --title="Example / Mod Template" --preview=examples/mod-template/preview.png

# real pack (licensed): from your OWN account
npm run workshop:upload -- --title="Real Teams & Players 2026" --preview=<your 512x512 png>
```
Save the printed **item id** (reuse it later with `--item=<id>` to update).

### E4. Verify in-game
- Launch → **Settings → Community & Workshop → Refresh → Activate** → **New Career**.

Full detail: `MODDING.md`. The public instructions page (for the Workshop
"Link to instructions" field) deploys from `site/` — enable
**repo Settings → Pages → Source: GitHub Actions** → `https://wrexist.github.io/EsportSimulator/`.
