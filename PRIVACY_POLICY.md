# Privacy Policy

**Esports Manager: FPS**
Last Updated: October 27, 2026

## Overview

Esports Manager: FPS ("the Game") is a single-player offline game. We are committed to protecting your privacy.

## Data We Collect

**We do not collect any personal data.** The Game runs entirely on your local computer.

### Local Data
- **Save Files**: Game progress is stored locally on your device via IndexedDB in the Electron app data directory.
- **Settings**: Audio, display, and gameplay preferences are stored locally.
- **Error Logs**: Crash reports are written to local log files in your app data directory for troubleshooting. These are never uploaded automatically.

### Steam Platform Data
If you purchased the Game through Steam:
- **Steam Achievements**: Achievement unlock status is synced with Steam's servers via the Steam SDK.
- **Steam Cloud**: Save files may be synced via Steam Cloud if enabled in your Steam settings. This is governed by [Steam's Privacy Policy](https://store.steampowered.com/privacy_agreement/).
- **Steam Leaderboards**: Aggregate game statistics (e.g., total wins, peak ranking) may be submitted to Steam leaderboards.
- **Steam Rich Presence**: Your current in-game status (e.g., "Week 15 | Rank #3") is shared with your Steam friends list.

All Steam-related data processing is handled by Valve Corporation under their terms.

### Community Discord Sharing (optional)
When you win a Major, the title screen offers an **Announce in Discord** button. Nothing is sent unless you press it. When you do, the Game sends your manager name, club name, the tournament, the final's opponent and score, and the season to our community relay, together with a one-time Steam sign-in ticket. The relay asks Steam to confirm the ticket (so only owners of the Game can post) and then publishes one message in the #major-winners channel of the community Discord server. Your Steam ID is used only for that check and to limit how often one account can post; it is not published or stored. Posted messages are public on the Discord server and are subject to [Discord's Privacy Policy](https://discord.com/privacy). Ask in the server, or contact us below, to have a post removed.

## Data We Do NOT Collect
- No personal information (name, email, address)
- No device identifiers or hardware fingerprints
- No analytics, telemetry, or usage tracking
- No advertising data
- No cookies or web tracking

## Third-Party Services
The Game does not integrate with any third-party analytics, advertising, or tracking services. The only third-party integration is the Steam SDK (steamworks.js) for platform features, plus the optional, player-initiated Discord share described above.

## Children's Privacy
The Game does not knowingly collect data from children under 13 (or the applicable age in your jurisdiction). Since we collect no personal data, no special provisions are required.

## Data Deletion
- **Save files** can be deleted from the in-game load screen or by clearing the app data directory.
- **Steam Cloud saves** can be managed through Steam's settings.
- **Local logs** can be deleted from the app data `logs/` directory.

## Changes to This Policy
We may update this policy in future versions of the Game. Changes will be noted in the changelog.

## Contact
For privacy-related questions, please open an issue at: https://github.com/IsacC/esports-manager/issues

---
*This game is developed by IsacC.*
