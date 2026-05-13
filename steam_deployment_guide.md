# Steam Deployment Guide - Complete Walkthrough

## Prerequisites

✅ You have: Steamworks Partner account with an App ID
✅ Location: Your project folder (e.g., `C:\Projects\esports-simulator-game`)

---

## Part 1: Build Your Installer (After Restart)

### Step 1: Restart Your Computer
Close everything and restart to clear file locks.

### Step 2: Build the Installer
```bash
cd "C:\Projects\esports-simulator-game"
npm run dist
```

**Build time:** ~2-3 minutes

**Result:** `dist/Esports Manager Simulator Setup 1.0.0.exe` (ready for Steam)

---

## Part 2: Configure Steam App ID

### Your Steam App ID
Find it at: https://partner.steamgames.com/apps/yourgames

Replace `480` with your actual App ID in these files:

#### File 1: `electron/main.js`
```javascript
// Line ~42 - Update Steam initialization
const STEAM_APP_ID = YOUR_APP_ID_HERE; // Replace with your Steam App ID

if (!app.isPackaged || process.env.NODE_ENV === 'production') {
  try {
    steamworks.electronEnableSteamOverlay();
    const client = steamworks.init(STEAM_APP_ID);
    console.log('Steam initialized:', client.localplayer.getName());
  } catch (e) {
    console.error("Failed to enable Steam:", e);
  }
}
```

#### File 2: Create `steam_appid.txt` (root folder)
```
YOUR_APP_ID_HERE
```

**Then rebuild:** `npm run dist`

### Configure Steam Cloud (Steamworks Website)
While you are setting up the App ID, you should also configure the Steam Cloud quotas to ensure save files work correctly.

1. Go to **Cloud -> Quotas** (or "Steam Cloud-inställningar") in the Steamworks dashboard.
2. Enter these values:
   - **Byte quota per user:** `500000000` (500MB)
   - **Number of allowed files per user:** `1000`
3. Click "Save" or "Publicera".

---

## Part 3: Prepare for Steam Upload

### Create Build Folders

1. **Create depot folder:**
   ```
   C:\SteamBuilds\YourGame\
   ```

2. **Copy your game files:**
   - Copy `dist/win-unpacked/*` → `C:\SteamBuilds\YourGame\`
   - Include `steam_appid.txt` in the root

### File Structure
```
C:\SteamBuilds\YourGame\
├── Esports Manager Simulator.exe
├── resources\
├── steam_appid.txt
└── (all other files from win-unpacked)
```

---

## Part 4: Upload to Steam via SteamPipe

### Download SteamPipe SDK
1. Go to: https://partner.steamgames.com/downloads/list
2. Download **Steamworks SDK**
3. Extract to `C:\SteamPipe\`

### Create VDF Scripts

#### `app_build_YOUR_APP_ID.vdf`
```vdf
"AppBuild"
{
    "AppID" "YOUR_APP_ID"
    "Desc" "Esports Manager Simulator Build"
    "BuildOutput" "C:\SteamBuilds\Output\"
    "ContentRoot" "C:\SteamBuilds\"
    "SetLive" "default"
    
    "Depots"
    {
        "YOUR_DEPOT_ID"
        {
            "FileMapping"
            {
                "LocalPath" "YourGame\*"
                "DepotPath" "."
                "Recursive" "1"
            }
        }
    }
}
```

#### `depot_build_YOUR_DEPOT_ID.vdf`
```vdf
"DepotBuild"
{
    "DepotID" "YOUR_DEPOT_ID"
    "ContentRoot" "C:\SteamBuilds\YourGame\"
    "FileMapping"
    {
        "LocalPath" "*"
        "DepotPath" "."
        "Recursive" "1"
    }
}
```

### Upload Command
```powershell
# Go to the folder where steamcmd.exe is actually located
cd C:\SteamPipe\sdk\tools\ContentBuilder\builder

# Run the upload command
.\steamcmd.exe +login YOUR_STEAM_USERNAME +run_app_build C:\path\to\app_build_YOUR_APP_ID.vdf +quit
```

cd C:\SteamPipe\sdk\tools\ContentBuilder\builder
>> .\steamcmd.exe +login YOUR_STEAM_USERNAME +run_app_build C:\SteamPipe\4326170.vdf +quit
**Enter password when prompted**

---

## Part 5: Set Live on Steam

1. Go to Steamworks Partner dashboard
2. Navigate to: **Your App → Builds**
3. Find your uploaded build
4. Click **Set Build Live on Branch**
5. Select branch (usually "default")
6. Confirm

---

## Testing Your Steam Build

### Local Test (Without Upload)
1. Install Steam client
2. Add `steam_appid.txt` to your game folder
3. Run `Esports Manager Simulator.exe`
4. Steam overlay should appear (Shift+Tab)

### After Upload
1. Open Steam client
2. Go to Library → Your Game
3. Install and launch
4. Test:
   - ✅ Steam overlay works (Shift+Tab)
   - ✅ Achievements trigger
   - ✅ Cloud saves work
   - ✅ No black screen

---

## Quick Reference

| Action | Command |
|--------|---------|
| Build installer | `npm run dist` |
| Dev mode (testing) | `npm run dev:all` |
| Upload to Steam | Use SteamPipe + VDF scripts |
| Test locally | Run with `steam_appid.txt` |

---

## Troubleshooting

**Black screen after Steam upload?**
- Verify `out` folder exists before building
- Check `out/_next/static` has CSS files
- Rebuild with clean: `npm run dist`

**Steam overlay not showing?**
- Verify `steam_appid.txt` is in game root
- Check Steam client is running
- Try as admin

**Upload fails?**
- Check VDF syntax (no smart quotes)
- Verify depot IDs match Steamworks
- Ensure you're logged into correct Steam account

---

## Next Steps After Upload

1. ✅ Set build live on default branch
2. ✅ Create store page assets
3. ✅ Configure pricing
4. ✅ Submit for review
5. ✅ Launch! 🚀

Good luck with your Steam launch! 🎮
