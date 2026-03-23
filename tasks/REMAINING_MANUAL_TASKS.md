# Remaining Manual Tasks for Steam Release

Everything below requires manual action (Steamworks dashboard, asset tools, external platforms). Code changes are done.

---

## 1. STEAMWORKS DASHBOARD (Required Before Ship)

### 1a. Register Achievements + Generate Icons

Go to **Steamworks > App Admin > Stats & Achievements > Achievements**

Each achievement needs a **256x256 icon** (unlocked) and a **256x256 grayscale icon** (locked).

**Global style prefix for ALL prompts:** `Glassmorphism achievement icon, 256x256px, dark background #0e1217, frosted translucent glass surface with subtle gradient border, Apple Liquid Glass aesthetic, soft inner glow, clean minimal composition, premium AAA game feel, no text, no letters`

#### Win Progression

| API Name | Display Name | Description | Icon Element to Add to Global Prompt |
|----------|-------------|-------------|--------------------------------------|
| `FIRST_WIN` | First Victory | Secure your first match win | `Golden trophy silhouette centered on glass, warm emerald-gold glow radiating outward` |
| `WIN_10` | Momentum | Win 10 matches | `Single five-pointed star in cyan-white gradient, soft luminous halo` |
| `WIN_25` | Consistent | Win 25 matches | `Two overlapping stars with blue-cyan glow, light refracting through glass layers` |
| `WIN_50` | Force of Nature | Win 50 matches | `Stylized flame silhouette in orange-amber gradient, warm fire glow behind glass` |
| `WIN_100` | Centurion | Win 100 matches | `Golden medal with minimalist laurel wreath, warm amber glow, prestige feel` |
| `WIN_250` | Relentless | Win 250 matches | `Cluster of light particles and sparkles in white-cyan, ethereal constellation glow` |
| `WIN_500` | Immortal | Win 500 matches | `Ornate golden crown with small diamond accent, royal purple-gold glow, ultimate prestige` |

#### Tournaments

| API Name | Display Name | Description | Icon Element |
|----------|-------------|-------------|--------------|
| `FIRST_TOURNAMENT` | Into the Arena | Enter your first tournament | `Precision crosshair reticle in cyan, focused targeting glow, sharp and clean` |
| `WIN_B_TIER` | Proving Grounds | Win a B-Tier tournament | `Bronze-copper award ribbon badge, warm metallic glow` |
| `WIN_A_TIER` | Premier Champion | Win an A-Tier tournament | `Silver award star badge, cool white-blue metallic shimmer` |
| `WIN_MAJOR` | Major Champion | Lift the trophy at a CS2 Major | `Ornate golden crown with emerald centerpiece gem, intense warm prestige glow` |
| `GRAND_SLAM` | Grand Slam | Win all 3 Majors in one year | `Luminous faceted diamond radiating prismatic rainbow light rays, ultra premium` |
| `DYNASTY` | Dynasty | Win 3 Majors across career | `Triple stacked crowns with golden interconnected glow, dynasty legacy energy` |
| `PERFECT_TOURNAMENT` | Flawless | Win tournament without dropping a map | `Glowing shield with centered checkmark, emerald-cyan gradient, pristine perfection` |

#### Competitive

| API Name | Display Name | Description | Icon Element |
|----------|-------------|-------------|--------------|
| `REACH_S_TIER` | Elite Circuit | Reach S-Tier league status | `Faceted diamond gem in cyan-purple gradient, brilliant light refraction through glass` |
| `TOP_10_RANKING` | World Class | Break into Top 10 world rankings | `Minimalist globe with glowing cyan latitude/longitude grid lines, world-class prestige` |
| `NUMBER_ONE` | Apex Predator | Become #1 ranked team in world | `Radiant crown floating above stylized number one, golden-white intense glow, ultimate` |
| `COMEBACK_KING` | Comeback King | Win after trailing 3-12 or worse | `Rising phoenix flame shape in orange-red gradient, dramatic upward energy burst` |
| `UNDERDOG` | Giant Slayer | Defeat team ranked 20+ above you | `Two crossed swords with cyan energy aura, battle-ready dramatic spark glow` |

#### Management

| API Name | Display Name | Description | Icon Element |
|----------|-------------|-------------|--------------|
| `FIRST_MILLION` | Seven Figures | Accumulate $1M budget | `Elegant dollar sign with emerald-green glow, wealth and prosperity shimmer` |
| `BUDGET_10M` | Empire Builder | Reach $10M budget | `Large diamond with golden dollar symbol overlay, ultra-wealth radiance` |
| `DEVELOP_STAR` | Star Maker | Develop academy grad to 90+ skill | `Upward trending arrow reaching a star at its peak, cyan-emerald growth gradient` |
| `HALL_OF_FAME_INDUCTION` | Immortalized | Player inducted into Hall of Fame | `Classical column monument silhouette with golden halo above, legacy heritage glow` |
| `LOYAL_TEAM` | The Brotherhood | Same 5 players for 3+ years | `Heart shape with five connected luminous nodes, warm rose-pink bond glow` |
| `PROFIT_MASTER` | Smart Money | Sell player for profit | `Three ascending bar chart columns with emerald-green tips, analytical precision glow` |
| `ZERO_TO_HERO` | From Nothing | Rise from C-Tier to S-Tier | `Rocket launching upward with cyan-orange vapor trail, dramatic vertical ascent` |

#### Milestones

| API Name | Display Name | Description | Icon Element |
|----------|-------------|-------------|--------------|
| `TOURNAMENT_WIN` | Champion | Win any tournament | `Gleaming trophy cup with warm amber-gold glow, celebratory light rays` |
| `SEASON_COMPLETE` | Full Cycle | Complete a 52-week season | `Circular clock/calendar ring icon with cyan glow, completeness and cycle` |
| `FIRST_TRANSFER` | Dealmaker | Complete first player transfer | `Two hands in handshake silhouette with blue-white professional glow` |

#### Hidden

| API Name | Display Name | Description | Icon Element |
|----------|-------------|-------------|--------------|
| `UNLUCKY` | Heartbreaker | Lose Grand Final 14-16 | `Cracked broken heart in deep red-purple, melancholic fading glow, bittersweet` |
| `REDEMPTION` | Redemption Arc | Win Major after losing one prior year | `Circular refresh arrow forming rising phoenix wings, emerald-gold gradient, rebirth` |

#### How to Generate

1. Copy the **global style prefix** + the **icon element** column together into your AI image generator
2. Example full prompt: `Glassmorphism achievement icon, 256x256px, dark background #0e1217, frosted translucent glass surface with subtle gradient border, Apple Liquid Glass aesthetic, soft inner glow, clean minimal composition, premium AAA game feel, no text, no letters, golden trophy silhouette centered on glass, warm emerald-gold glow radiating outward`
3. Generate at 512x512+ and resize down to 256x256 for sharpness
4. For each **locked icon**: desaturate the unlocked version to grayscale, reduce opacity to 60%
5. Save as `achievement_APINAME.png` and `achievement_APINAME_locked.png`
6. Upload both per achievement in Steamworks

### 1b. Create Leaderboards
Go to **Steamworks > App Admin > Stats & Achievements > Leaderboards**

| API Name | Display Name | Sort Method | Type |
|----------|-------------|-------------|------|
| `lead_world_ranking` | World Ranking | Ascending (lower = better) | Numeric |
| `lead_major_wins` | Major Wins | Descending | Numeric |
| `lead_fastest_stier` | Fastest to S-Tier (weeks) | Ascending | Numeric |
| `lead_total_earnings` | Total Earnings | Descending | Numeric |
| `lead_win_streak` | Longest Win Streak | Descending | Numeric |
| `lead_tournaments_won` | Tournaments Won | Descending | Numeric |

### 1c. Register Stats
Go to **Steamworks > App Admin > Stats & Achievements > Stats**

Create these 11 stats (all type: INT):

| API Name | Display Name |
|----------|-------------|
| `stat_total_kills` | Total Kills |
| `stat_total_hs` | Total Headshots |
| `stat_total_wins` | Total Wins |
| `stat_total_matches` | Total Matches |
| `stat_max_budget` | Peak Budget |
| `stat_tournaments_won` | Tournaments Won |
| `stat_majors_won` | Majors Won |
| `stat_matches_lost` | Matches Lost |
| `stat_peak_ranking` | Best World Ranking |
| `stat_players_developed` | Players Developed |
| `stat_prize_money` | Prize Money Earned |

### 1d. Publish Changes
After creating all of the above: **Steamworks > Publish > Prepare for Publishing > Publish**

---

## 2. APP ICON (Required)

The Windows installer needs a `.ico` file (current `public/logo.png` works at runtime but looks blurry in taskbar/installer).

**Steps:**
1. Open `public/logo.png` in an icon converter tool:
   - Online: https://convertio.co/png-ico/ or https://icoconvert.com/
   - Or use ImageMagick: `magick convert public/logo.png -define icon:auto-resize=256,128,64,48,32,16 public/logo.ico`
2. Save as `public/logo.ico`
3. Update `package.json` line 140: change `"icon": "public/logo.png"` to `"icon": "public/logo.ico"`

---

## 3. CONTENT RATING (Required for Steam)

**Steps:**
1. Go to **Steamworks > App Admin > Store Page > Content Survey**
2. Complete the IARC questionnaire honestly:
   - **Violence:** Simulated/abstract (CS2 team management, no graphic violence shown)
   - **Language:** Mild (player nicknames, commentary)
   - **Gambling:** None (sponsorships exist but no real money)
   - **In-app purchases:** None
3. Submit and wait for rating assignment
4. The rating will auto-populate on your store page

---

## 4. TOURNAMENT LOGO AUDIT (Quick Check)

You already have a script for this:

```bash
node audit-assets.js
```

This checks if all tournament logos referenced in `data/tournament-calendar.ts` exist in `public/assets/tournaments/`. Fix any missing ones by adding placeholder images.

---

## 5. BUILD TESTING

### 5a. Windows (Primary)
```bash
npm run dist
```
- Verify installer runs
- Verify game launches from Start Menu shortcut
- Verify Steam overlay works (Shift+Tab)
- Verify achievements unlock (use debug tools)
- Verify save/load works
- Verify settings persist after restart

### 5b. Linux (If targeting)
```bash
# On a Linux machine or VM:
npm run clean:all && cross-env NODE_OPTIONS=--max-old-space-size=4096 next build && electron-builder --linux
```
- Test the AppImage launches
- Test Steam integration works

### 5c. Mac (If targeting)
```bash
# On a Mac:
npm run clean:all && cross-env NODE_OPTIONS=--max-old-space-size=4096 next build && electron-builder --mac
```
- Test the .dmg installs and launches

> **Note:** If you're only shipping on Windows, you can skip Linux/Mac for now and add "Windows only" to the Steam store listing.

---

## 6. STEAM STORE PAGE (Before Launch)

### Required Assets
- [ ] **Header capsule** (460x215 px)
- [ ] **Small capsule** (231x87 px)
- [ ] **Main capsule** (616x353 px)
- [ ] **Hero graphic** (3840x1240 px)
- [ ] **Logo** (for hero graphic overlay)
- [ ] **Screenshots** (minimum 5, 1920x1080 recommended)
- [ ] **Trailer video** (you have `Final_Trailer.mp4` -- upload to Steam)

### Store Description
- [ ] Verify `STEAM_STORE_LISTING.md` content is up to date
- [ ] Copy to Steamworks store page editor
- [ ] Add system requirements (Electron apps: Windows 10+, 4GB RAM, 500MB disk)
- [ ] Set supported languages: English

---

## 7. OPTIONAL (Post-Launch Polish)

These are nice-to-have but NOT blockers:

- [ ] **Steam Trading Cards** -- Design 5+ card art pieces, submit to Steam for review
- [ ] **Translations** -- The `lib/i18n.ts` framework is ready, just needs string files for other languages
- [ ] **Real Audio Files** -- Replace procedural Web Audio sounds with .mp3/.ogg files in `public/sounds/`
- [ ] **Controller Support** -- Add "Controller not supported" to Steam store features, or implement basic gamepad navigation later

---

## Quick Reference: What's Already Done (Code)

| Feature | Status |
|---------|--------|
| Game over / bankruptcy mechanic | Done (8 weeks insolvent = dissolved) |
| Achievement triggers (LOYAL_TEAM, PROFIT_MASTER, UNLUCKY, REDEMPTION) | Done |
| Achievement UI glassmorphism redesign | Done (liquid glass cards, complete icon mapping) |
| Leaderboard stat pushing | Done (weekly) |
| mentalPrep match effect | Done (+3% team strength) |
| Skill points badge on squad page | Done (pulsing amber indicator) |
| Fire staff confirmation dialog | Done |
| Splash screen redesign | Done (gradient title + loading bar) |
| Staff market auto-refresh | Done (every 4 weeks) |
| Offline session recovery toast | Done (24h+ away) |
| Save size monitoring | Done (warns at >4MB) |
| .gitignore cleanup | Done |
| TypeScript compilation | Clean (0 errors) |
