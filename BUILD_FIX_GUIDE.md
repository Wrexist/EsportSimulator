# Electron-Builder Build Error - Solutions

## Problem
The build fails with:
```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

This occurs when `electron-builder` tries to extract code signing tools that contain symbolic links (for macOS libraries), which requires special privileges on Windows.

## ✅ **RECOMMENDED SOLUTION: Enable Windows Developer Mode**

This is the **best long-term solution** as it allows symbolic link creation without admin privileges.

### Steps:
1. **Right-click** on `enable-dev-mode.ps1` in the project root
2. Select **"Run with PowerShell as Administrator"**
3. Approve the UAC prompt
4. The script will enable Developer Mode
5. Run `npm run dist` again (no admin required)

### Manual Alternative:
1. Open Windows Settings
2. Go to **Settings > Update & Security > For Developers**
3. Enable **"Developer Mode"**
4. Wait for the feature to install
5. Run `npm run dist` again

---

## Alternative Solutions

### Option 2: Run Build as Administrator
```powershell
# Right-click PowerShell/Terminal and select "Run as Administrator"
cd "C:\Users\IsacC\Downloads\esports-simulator-game (1)"
npm run dist
```

### Option 3: Use Portable Build (No Installer)
Modify `package.json` to build a portable executable instead:
```json
"win": {
  "target": "portable"
}
```

Then run: `npm run dist`

---

## What Was Fixed

1. **Added `forceCodeSigning: false`** to `package.json` build configuration
2. **Removed invalid signing properties** that caused validation errors
3. **Cleared electron-builder cache** to force fresh extraction
4. **Created enable-dev-mode script** for easy one-time setup

---

## Current Build Configuration

The `package.json` now has:
```json
"build": {
  "win": {
    "target":  "nsis"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true
  },
  "forceCodeSigning": false
}
```

This configuration:
- ✅ Disables code signing completely
- ✅ Creates an NSIS installer
- ✅ Allows users to choose installation directory
- ✅ Works without a code signing certificate

---

## After Enabling Developer Mode

Once Developer Mode is enabled, you can simply run:
```bash
npm run dist
```

The build should complete successfully and create:
- `dist/win-unpacked/` - Unpacked application
- `dist/Esports Manager Simulator Setup <version>.exe` - Windows installer

---

## Notes

- **Developer Mode is safe** - it's designed for app development on Windows
- **No restart required** - changes take effect immediately
- **This is a one-time setup** - you won't need to do this again
- The symbolic link issue only affects Windows builds; macOS/Linux builds work fine
