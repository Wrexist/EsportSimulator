# Steamworks Partner Portal — Ready-to-Paste Copy

This document exists to make the Steam resubmission paste-only, not editorial.
Open the Steamworks partner portal side-by-side with this file and copy each
section into its matching field. Save each field (Steamworks does **not**
auto-save). Publish at the end.

Portal location for most fields: **App Admin → Store Presence → Basic Info**.
Early Access Q&A lives under **App Admin → Store Presence → Early Access →
Early Access Content**.

---

## 1. Short Description

*(Steamworks field: "Short Description" — single paragraph, visible under the
trailer on the store page. 300-character cap.)*

```
Take control of your own professional esports organization in Esports Manager: FPS. Scout prodigies, negotiate contracts, design winning tactics, and upgrade your facilities as you climb from the amateur leagues to the Major stage. Can you build the next dynasty?
```

---

## 2. About This Game

*(Steamworks field: "About This Game" — long description. Supports BBCode but
Markdown-ish formatting works as plain text.)*

```
Esports Manager: FPS offers a deep, immersive simulation of the professional esports scene. You aren't just a coach; you are the architect of your team's destiny.

Key Features:

• Deep Tactical Simulation — Watch matches unfold in real-time with a detailed 2D match engine. Adjust strategies on the fly: call for a "Rush B", set up a "Double AWP" defense, or manage your economy to break the opponent's bank.

• Global Scouting Network — Access a massive database of players across hundreds of teams. Filter by role (AWPer, IGL, Entry Fragger, Support, Rifler), age, and market value to find the perfect fit.

• Build Your Legacy — Induct your greatest players into the Hall of Fame. Track history with precision: view past Major champions, legendary line-ups, and retired icons who defined eras.

• Comprehensive Transfer Market — The world is full of talent. Scout for the next superstar, negotiate complex contracts, and manage player egos. Buy a proven veteran or nurture a young prodigy.

• Facility Management — Success starts at home. Upgrade your gaming house, training facilities, and analysis rooms to give your players the edge they need at their peak.

• Dynamic Leagues & Tournaments — Compete in a living world with promotion and relegation. Qualify for prestigious tournaments and fight for the ultimate prize — the Major trophy.

• In-Depth Match Analysis — Dive into post-game statistics. Review detailed Combat Statistics, ADR (Average Damage per Round), K/D differences, and server logs to understand exactly why you won or lost.

• Detailed Player Statistics — Analyze every kill, death, and assist. Use data to make informed decisions about your roster and identify weaknesses.

• Community Database Import — Players can optionally import custom roster JSONs on their own machine. The base game ships with an original fictional world; the import feature is opt-in and never ships with third-party content.
```

---

## 3. Early Access Q&A

Steamworks presents these as five labelled fields under **Early Access Content
→ Discussion Questions**. Paste each block below into its matching field.

### 3a. "Why Early Access?"

```
The core gameplay loop — manager career, roster management, contracts, weekly scheduling, tactical match simulation, tournament progression, and the Hall of Fame — is implemented and playable end-to-end. Early Access lets us release this foundation now and iterate on balance, systems depth, and community-requested features alongside our players, rather than behind closed doors. The simulation reacts to real management decisions already; Early Access is about sharpening that feedback with real managers playing real careers.
```

### 3b. "Approximately how long will this game be in Early Access for?"

```
We expect Early Access to last six to twelve months. That window covers balance passes, a second content drop with expanded youth academy progression and scouting regions, and polish on the live match presentation layer based on player feedback. We will exit Early Access once the roadmap listed in this page's update log is shipped and community feedback has settled.
```

### 3c. "How is the full version planned to differ from the Early Access version?"

```
The full version will add: (1) deeper youth academy progression with coach-driven development arcs, (2) an expanded scouting minigame for regional talent hunts, (3) richer live-match presentation including caster commentary and broadcast overlays, (4) extended end-game content — manager retirement, franchise legacies, and dynasty records, (5) additional tournament formats beyond the current Swiss and double-elimination brackets, and (6) polish on UI, accessibility, and localization. The core simulation, management loop, and data model are already in place and will not change shape during Early Access.
```

### 3d. "What is the current state of the Early Access version?"

*(This is the field Steam flagged on the last submission. The copy below
explicitly matches what a reviewer sees in each uploaded screenshot.)*

```
The current Early Access build includes the full core gameplay loop and is playable end-to-end.

Implemented and available in this build:

• Create and run a professional esports organization. Choose from hundreds of fictional teams across every major region; each one has a full roster, stats history, and starting budget.
• Recruit, train, and manage a 5-player roster with role-specific skills (AWPer, IGL, Entry Fragger, Support, Rifler), chemistry, morale, form, and contract terms.
• Weekly scheduling system — plan training blocks, scrims, and match prep across the season.
• Full finance ledger with wages, facility upkeep, sponsorship income, and tournament prize pools.
• Scouting system with regional filters, role filters, and prestige-based targeting.
• Transfer market with contract negotiation, buyout clauses, and rival-team bidding.
• Tournament system with Swiss groups, double-elimination brackets, seasonal Major cycles, and regional qualifiers.
• Map veto and pre-match tactical setup (economy plans, map-specific strategies, starting side).
• Live 2D match simulation with round-by-round visualization, mid-match tactical adjustments, and real-time economy tracking.
• Post-match analytics — combat statistics, ADR, first-kill conversion, clutch success, and per-round timeline.
• Hall of Fame with retired legendary players and their era-defining achievements.
• Facility upgrades (gaming house, training room, analysis room).
• Optional community-database import — users can supply their own JSON roster files on their local machine; the base game ships with an original fictional world.

All features listed in the About This Game section above are implemented in the current build. The screenshots on this page are captured directly from the Early Access build.
```

### 3e. "Will the game be priced differently during and after Early Access?"

```
We expect the price to rise modestly when the game exits Early Access, reflecting the additional content and polish shipped during that window. Early supporters who purchase during Early Access keep the game at the initial price forever.
```

### 3f. "How are you planning on involving the Community in your development process?"

```
Community input shapes every post-launch update. We read the Steam community forum daily, run recurring balance-feedback threads, and ship patch notes that call out which changes came from which community thread. The game also ships with a built-in Community Database import feature — any player can supply a custom JSON roster on their own machine without modding the installation, which means community-authored datasets can circulate openly without affecting our shipped build.
```

---

## 4. System Requirements

*(Steamworks field: "System Requirements" — Windows section. Already correct
in the repo's `STEAM_STORE_LISTING.md`. Reproduced here verbatim.)*

```
Minimum:
  OS: Windows 10 (64-bit)
  Processor: Intel Core i3-4xxx / AMD Ryzen 3 1200 or equivalent
  Memory: 4 GB RAM
  Graphics: Intel HD Graphics 4000 or better (DirectX 11 compatible)
  DirectX: Version 11
  Network: Broadband Internet connection
  Storage: 1 GB available space
  Additional Notes: 1080p display recommended.

Recommended:
  OS: Windows 10/11 (64-bit)
  Processor: Intel Core i5-8xxx / AMD Ryzen 5 2600 or better
  Memory: 8 GB RAM
  Graphics: NVIDIA GeForce GTX 1050 / AMD Radeon RX 560 or better
  Network: Broadband Internet connection
  Storage: 2 GB available space (SSD recommended)
```

---

## 5. Controller Support

*(Steamworks field: "Controller Support" — pick one from the dropdown.)*

Set to: **No controller support**.

Rationale: the game is designed primarily for mouse and keyboard to provide
precision in management interfaces and tactical adjustments. The Steam review
email mentioned a Developer's Recommended Configuration as an optional feature
— declining it keeps the "Not Supported" badge honest rather than promising a
partial mapping. Revisit only if controller support becomes a product goal.

---

## 6. Screenshots & Trailer Upload

*(Steamworks location: **Store Presence → Graphical Assets → Screenshots**.)*

Before resubmitting the build:

1. On a workstation with the repo checked out:
   ```
   npm install         # if not already
   npm run sanitize:snapshot
   npm run screenshots:capture
   ```
   PNGs land in `tmp/steam-screenshots/`. Every asset shown comes from the
   sanitized build — no FaZe, NAVI, IEM Katowice, or real player photos.
2. In Steamworks, **delete every existing screenshot** that was captured from
   the pre-sanitize build. None of them can remain on the store page.
3. Upload the new PNGs in numeric order (they are pre-sorted
   `01_main_menu.png` through `19_community_import.png`). Steam requires at
   least five screenshots to publish; we ship nineteen.
4. **Trailer.** Existing trailer footage is blocked for the same reason the
   screenshots were. Either:
   - Re-render the trailer by re-recording from a run of the sanitized build,
     or
   - Temporarily remove the trailer from the store page until a sanitized
     version is available. Screenshots alone will pass review; the trailer is
     optional for Early Access approval.

---

## 7. After You Paste — Submission Checklist

- [ ] Section 1: Short Description saved.
- [ ] Section 2: About This Game saved.
- [ ] Section 3 (a–f): all six Early Access Q&A fields saved.
- [ ] Section 4: System Requirements saved.
- [ ] Section 5: Controller Support set to "No controller support".
- [ ] Section 6: every pre-sanitize screenshot deleted; all new screenshots
      uploaded in order.
- [ ] Trailer: either re-rendered from the sanitized build, or removed from
      the store page for now.
- [ ] **Push changes to store page live** (Store Presence → Publish).
- [ ] **Request app review** from the App Landing Page → "Request Review".
- [ ] In the review request notes, mention: "Build sanitized — all real-world
      team, player, and tournament identifiers replaced with original
      fictional content. Store media re-captured from the sanitized build.
      Community-import feature allows users to supply their own roster data
      locally without shipping third-party content."

---

## 8. Build-side Verification (already green)

Run these before resubmitting to confirm nothing regressed:

```
npm run compliance:steam:strict     # expect: High: 0 | Medium: 0 | Low: 0
npm run type-check                   # expect: pass
npm run build                        # expect: succeeds
```

If all three pass and sections 1–7 above are checked, the build is ready for
Steam's re-review.
