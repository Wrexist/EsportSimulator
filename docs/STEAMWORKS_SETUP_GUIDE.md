# Steamworks Configuration Guide for Esports Manager: FPS

This guide walks you through setting up all achievements, statistics, and leaderboards in the Steamworks console to match the game code.

---

## Table of Contents
1. [Accessing Steamworks](#1-accessing-steamworks)
2. [Statistics Setup](#2-statistics-setup)
3. [Achievements Setup](#3-achievements-setup)
4. [Leaderboards Setup](#4-leaderboards-setup)
5. [Localization](#5-localization)
6. [Publishing Changes](#6-publishing-changes)
7. [Testing](#7-testing)

---

## 1. Accessing Steamworks

1. Go to https://partner.steamgames.com
2. Log in with your Steam developer account
3. Navigate to **App Admin** > **Esports Manager: FPS (4326170)**
4. Click on **Statistik & prestationer** (Stats & Achievements) tab

---

## 2. Statistics Setup

Navigate to **Statistikkonfiguration** (Statistics Configuration).

### Required Statistics (11 total)

Click **"Ny statistik"** (New Statistic) for each entry:

| # | API Name | Display Name | Type | Set By | Increment Only |
|---|----------|--------------|------|--------|----------------|
| 1 | `stat_total_kills` | Total Kills | INT | Klient | Ja |
| 2 | `stat_total_hs` | Total Headshots | INT | Klient | Ja |
| 3 | `stat_total_wins` | Total Wins | INT | Klient | Ja |
| 4 | `stat_total_matches` | Total Matches | INT | Klient | Ja |
| 5 | `stat_max_budget` | Most Money | INT | Klient | Nej |
| 6 | `stat_tournaments_won` | Tournaments Won | INT | Klient | Ja |
| 7 | `stat_majors_won` | Majors Won | INT | Klient | Ja |
| 8 | `stat_matches_lost` | Matches Lost | INT | Klient | Ja |
| 9 | `stat_peak_ranking` | Best Ranking | INT | Klient | Nej |
| 10 | `stat_players_developed` | Stars Developed | INT | Klient | Ja |
| 11 | `stat_prize_money` | Total Earnings | INT | Klient | Ja |

### How to Add Each Statistic:

1. Click **"Ny statistik"**
2. Fill in:
   - **API-namn**: The exact API name from the table (case-sensitive!)
   - **Typ**: INT
   - **Fastställd av**: Klient (Client)
   - **Endast inkrement?**: Ja (Yes) for cumulative stats, Nej (No) for stats that can decrease
3. Click **Spara** (Save)

---

## 3. Achievements Setup

Navigate to **Prestationskonfigurering** (Achievement Configuration).

### Required Achievements (31 total)

Click **"Ny prestation"** (New Achievement) for each entry.

#### Win Progression Achievements (7)

| API Name | Display Name | Description | Hidden |
|----------|--------------|-------------|--------|
| `FIRST_WIN` | First Blood | Win your first match | No |
| `WIN_10` | Getting Started | Win 10 matches | No |
| `WIN_25` | Consistent | Win 25 matches | No |
| `WIN_50` | Halfway There | Win 50 matches | No |
| `WIN_100` | Veteran Manager | Win 100 matches | No |
| `WIN_250` | Dedicated | Win 250 matches | No |
| `WIN_500` | Legendary Manager | Win 500 matches | No |

#### Tournament Achievements (7)

| API Name | Display Name | Description | Hidden |
|----------|--------------|-------------|--------|
| `FIRST_TOURNAMENT` | Tournament Debut | Participate in your first tournament | No |
| `WIN_B_TIER` | Rising Star | Win a B-Tier tournament | No |
| `WIN_A_TIER` | Premier Champion | Win an A-Tier tournament | No |
| `WIN_MAJOR` | Major Champion | Win a CS2 Major | No |
| `GRAND_SLAM` | Grand Slam | Win all 3 Majors in a single year | **Yes** |
| `DYNASTY` | Dynasty Builder | Win 3 Major championships | No |
| `PERFECT_TOURNAMENT` | Flawless Victory | Win a tournament without losing a single map | No |

#### Competitive Achievements (5)

| API Name | Display Name | Description | Hidden |
|----------|--------------|-------------|--------|
| `REACH_S_TIER` | Elite Status | Reach S-Tier league ranking | No |
| `TOP_10_RANKING` | World Class | Reach Top 10 in world rankings | No |
| `NUMBER_ONE` | Number One | Become the #1 team in the world | No |
| `COMEBACK_KING` | Comeback King | Win a match after being down 12-3 or worse | No |
| `UNDERDOG` | Giant Slayer | Beat a team ranked 20+ positions higher than you | No |

#### Management Achievements (7)

| API Name | Display Name | Description | Hidden |
|----------|--------------|-------------|--------|
| `FIRST_MILLION` | Millionaire Club | Accumulate $1,000,000 in budget | No |
| `BUDGET_10M` | Ten Million Club | Reach $10,000,000 in budget | No |
| `DEVELOP_STAR` | Star Maker | Develop a player from potential 60 to 90+ skill | No |
| `HALL_OF_FAME_INDUCTION` | Legend Creator | Have one of your players inducted into the Hall of Fame | No |
| `LOYAL_TEAM` | The Core | Keep the same 5 players for 3+ years | No |
| `PROFIT_MASTER` | Smart Business | Sell a player for more than you paid for them | No |
| `ZERO_TO_HERO` | Rise to Glory | Take a C-Tier team to S-Tier | No |

#### Milestone Achievements (3)

| API Name | Display Name | Description | Hidden |
|----------|--------------|-------------|--------|
| `TOURNAMENT_WIN` | Champion | Win any tournament for the first time | No |
| `SEASON_COMPLETE` | Full Cycle | Complete an entire 52-week season | No |
| `FIRST_TRANSFER` | Dealmaker | Complete your first player transfer | No |

#### Hidden Achievements (2)

| API Name | Display Name | Description | Hidden |
|----------|--------------|-------------|--------|
| `UNLUCKY` | So Close | Lose a Grand Final 16-14 | **Yes** |
| `REDEMPTION` | Redemption Arc | Win a Major after losing one the previous year | **Yes** |

### How to Add Each Achievement:

1. Click **"Ny prestation"** (New Achievement)
2. Fill in:
   - **API-namn**: The exact API name from the table (CASE-SENSITIVE!)
   - **Visningsnamn**: The Display Name
   - **Beskrivning**: The Description
   - **Fastställd efter**: Klient (Client)
   - **Gömd?**: Check this box ONLY for hidden achievements (GRAND_SLAM, UNLUCKY, REDEMPTION)
3. Upload icons:
   - **Uppnådd ikon**: The unlocked/colored icon (256x256 PNG recommended)
   - **Ouppnådd ikon**: The locked/grayed-out icon (256x256 PNG)
4. Click **Spara** (Save)

### Achievement Icon Guidelines:
- Size: 256x256 pixels (can be 64x64 minimum, 256x256 preferred)
- Format: JPG or PNG
- Style: Use glassmorphism style to match the game's aesthetic
- Locked icons should be grayscale versions of the unlocked icons

---

## 4. Leaderboards Setup

Navigate to **Topplistekonfigurering** (Leaderboard Configuration).

### Required Leaderboards (6 total)

Click **"Lägg till topplista"** (Add Leaderboard) for each:

| API Name | Display Name | Sort Method | Display Type |
|----------|--------------|-------------|--------------|
| `lead_world_ranking` | World Ranking | Fallande (Descending) | Numerisk (Numeric) |
| `lead_major_wins` | Major Wins | Fallande (Descending) | Numerisk (Numeric) |
| `lead_fastest_stier` | Fastest S-Tier Run | **Stigande (Ascending)** | Numerisk (Numeric) |
| `lead_total_earnings` | Career Earnings | Fallande (Descending) | Numerisk (Numeric) |
| `lead_win_streak` | Longest Win Streak | Fallande (Descending) | Numerisk (Numeric) |
| `lead_tournaments_won` | Tournament Victories | Fallande (Descending) | Numerisk (Numeric) |

### How to Add Each Leaderboard:

1. Click **"Lägg till topplista"** (Add Leaderboard)
2. Fill in:
   - **Namn**: The exact API name (case-sensitive!)
   - **Gemenskapsnamn**: The Display Name
   - **Sorteringsmetod**:
     - `Fallande` (Descending) = Higher is better
     - `Stigande` (Ascending) = Lower is better (only for `lead_fastest_stier`)
   - **Visningstyp**: Numerisk (Numeric)
3. Click **Skapa** (Create)

**IMPORTANT:** `lead_fastest_stier` must use **Stigande (Ascending)** because fewer weeks to reach S-Tier is better!

---

## 5. Localization

Navigate to **Lokaliseringsalternativ** (Localization Options).

### Recommended Languages to Enable:

Check the boxes for these languages:
- [x] Engelska (English) - Already enabled
- [ ] Tyska (German)
- [ ] Ryska (Russian)
- [ ] Portugisiska - Brasilien (Portuguese - Brazil)
- [ ] Spanska - Spanien (Spanish - Spain)
- [ ] Franska (French)
- [ ] Polska (Polish)
- [ ] Turkiska (Turkish)
- [ ] Kinesiska (förenklad) (Chinese Simplified)
- [ ] Koreanska (Korean)
- [ ] Japanska (Japanese)

### Adding Translations:

1. Click **Spara** (Save) after selecting languages
2. Click **Ladda ned lokaliseringsdata** (Download Localization Data)
3. Edit the downloaded file with translations
4. Upload the translated file back

---

## 6. Publishing Changes

**CRITICAL:** Changes don't go live until you publish them!

1. After making all changes, go to the **Publicera** tab
2. Review all pending changes
3. Click **Förbereda för publicering** (Prepare for Publishing)
4. Click **Publicera till Steam** (Publish to Steam)
5. Wait for confirmation that changes are live

---

## 7. Testing

### Test in Development Mode:

1. Create a file named `steam_appid.txt` in your game's root folder
2. Add only the number `4326170` to this file
3. Run your game - it will connect to Steam in development mode

### Verify Achievements:

1. Play through the game normally
2. Check Steam overlay (Shift+Tab) to see achievement popups
3. Go to Steam > Library > Esports Manager: FPS > Achievements to verify

### Verify Statistics:

1. In Steam, go to View > Players > [Your Name]
2. Click "View all games"
3. Find Esports Manager: FPS
4. Click "View Stats" to see all tracked statistics

### Verify Leaderboards:

1. In the game, trigger a leaderboard submission (e.g., reach S-Tier)
2. Check Steam > Community > Esports Manager: FPS > Leaderboards

### Reset for Testing (Development Only):

In the Steamworks console:
1. Go to your app's Stats & Achievements page
2. Look for "Clear Stats" option in the testing tools
3. This resets all achievements and stats for your account only

---

## Quick Reference: API Names

### Statistics (11)
```
stat_total_kills
stat_total_hs
stat_total_wins
stat_total_matches
stat_max_budget
stat_tournaments_won
stat_majors_won
stat_matches_lost
stat_peak_ranking
stat_players_developed
stat_prize_money
```

### Achievements (28)
```
FIRST_WIN, WIN_10, WIN_25, WIN_50, WIN_100, WIN_250, WIN_500
FIRST_TOURNAMENT, WIN_B_TIER, WIN_A_TIER, WIN_MAJOR, GRAND_SLAM, DYNASTY, PERFECT_TOURNAMENT
REACH_S_TIER, TOP_10_RANKING, NUMBER_ONE, COMEBACK_KING, UNDERDOG
FIRST_MILLION, BUDGET_10M, DEVELOP_STAR, HALL_OF_FAME_INDUCTION, LOYAL_TEAM, PROFIT_MASTER, ZERO_TO_HERO
UNLUCKY, REDEMPTION
```

### Leaderboards (6)
```
lead_world_ranking (Descending)
lead_major_wins (Descending)
lead_fastest_stier (Ascending!)
lead_total_earnings (Descending)
lead_win_streak (Descending)
lead_tournaments_won (Descending)
```

---

## Troubleshooting

### Achievement not unlocking:
1. Verify API name matches EXACTLY (case-sensitive)
2. Check that achievement is published (not just saved)
3. Ensure Steam client is running
4. Check game logs for `[Steam]` messages

### Statistics not updating:
1. Verify stat type matches (INT vs FLOAT)
2. Check if "Increment Only" is blocking decreases
3. Call `storeStats()` after setting values

### Leaderboard not showing scores:
1. Verify leaderboard API name matches exactly
2. Check sort method is correct
3. Ensure score was actually submitted (check logs)

---

## Code Reference

All Steam integration code is in:
- `engine/steam-service.ts` - Achievement definitions and Steam API calls
- `store/game-store.ts` - Achievement trigger calls (lines 2191, 2670, 2853)
- `electron/main.js` - Electron IPC handlers for Steam SDK
- `electron/preload.js` - Bridge between renderer and main process

---

*Last updated: February 2026*
*Game Version: Esports Manager: FPS*
*Steam App ID: 4326170*
