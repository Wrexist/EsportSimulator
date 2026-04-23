# Bundle Analysis Report

Generated from `npm run analyze` (Next.js 14.2.18 + `@next/bundle-analyzer`).
Raw treemaps: `.next/analyze/client.html`, `.next/analyze/nodejs.html`, `.next/analyze/edge.html`.

This report describes **what is currently in the renderer bundle** for the
Electron + Next.js app. **No optimizations were applied** — findings only.

## 1. Headline numbers

| Metric | Value |
|---|---|
| Total renderer JS (parsed, all client chunks) | **~5.86 MB** |
| Total renderer JS (gzipped) | **~1.38 MB** |
| First Load JS shared by all routes | **88.1 kB** |
| Largest single route First Load | **/player/[id] — 680 kB** |
| Largest single chunk (parsed) | `app/match/[id]/live/page` — **1.15 MB** |
| Largest vendor chunk (parsed) | `chunks/1068` (lucide-react) — **611 kB** |

Sources: the webpack-bundle-analyzer data embedded in `.next/analyze/client.html`
and the Next build summary printed by `next build`.

## 2. First Load JS per route

Copied directly from the `next build` output; the route boundary reflects
what must be downloaded before the page is interactive.

| Route | Page size | First Load JS |
|---|---:|---:|
| `/` | 12.6 kB | 339 kB |
| `/academy` | 5.08 kB | 323 kB |
| `/animations` | 8.54 kB | 144 kB |
| `/basecamp` | 5.4 kB | 323 kB |
| `/career` | 15.9 kB | 333 kB |
| `/credits` | 2.08 kB | 129 kB |
| **`/desktop`** | 42.6 kB | **504 kB** |
| `/dev` | 10.4 kB | 286 kB |
| `/equipment` | 7.73 kB | 325 kB |
| `/finances` | 15.9 kB | 329 kB |
| `/fpl` | 15.5 kB | 337 kB |
| `/hall-of-fame` | 8.77 kB | 329 kB |
| `/load-game` | 10.5 kB | 332 kB |
| `/main-menu` | 17.9 kB | 350 kB |
| **`/match/[id]/live`** | 98.7 kB | **419 kB** |
| `/match/[id]/result` | 17.2 kB | 347 kB |
| `/match/[id]/tactics` | 7.96 kB | 333 kB |
| `/match/[id]/veto` | 12.2 kB | 325 kB |
| `/new-game` | 8.87 kB | 334 kB |
| `/new-game/create-team` | 18.9 kB | 374 kB |
| **`/player/[id]`** | 23.4 kB | **680 kB** |
| `/rankings` | 10.1 kB | 327 kB |
| `/schedule` | 22.8 kB | 365 kB |
| `/schedule/staff-meeting` | 6.07 kB | 318 kB |
| **`/scouting`** | 15.2 kB | **457 kB** |
| `/settings` | 14.7 kB | 344 kB |
| `/settings/community-import` | 6.25 kB | 113 kB |
| `/sponsorships` | 8.61 kB | 321 kB |
| `/squad` | 12 kB | 367 kB |
| **`/staff`** | 15.3 kB | **545 kB** |
| **`/stats`** | 23.3 kB | **455 kB** |
| `/tournaments` | 14.2 kB | 327 kB |
| `/tournaments/[id]` | 21 kB | 350 kB |
| `/training` | 11.9 kB | 367 kB |
| `/transfers` | 8.49 kB | 362 kB |
| `/trophies` | 5.12 kB | 313 kB |

The **shared baseline of 88.1 kB** is made up of:

- `chunks/fd9d1056-…js` — **53.6 kB** (Next.js runtime)
- `chunks/2117-…js` — **31.8 kB** (Next.js runtime + SWC helpers)
- other shared chunks — **2.7 kB**

## 3. Main chunk contents (renderer)

Top client chunks by **parsed** size, with a summary of what is inside them.
"Package" numbers come from the analyzer's tree, so they sum child modules
(pre-minification stat size of what the concatenation pulls in).

### Vendor / shared chunks

| Chunk | Parsed | Gzip | Dominant contents |
|---|---:|---:|---|
| `chunks/1068-…js` | 611 kB | 132 kB | **`lucide-react` (1.20 MB stat)** — essentially the whole icon set reached from 131 files importing from `lucide-react`. |
| `chunks/2100-…js` | 516 kB | 150 kB | **App code**: `engine/*` (340 kB stat) + `store/game-store.ts` (131 kB). The entire simulation engine and Zustand store are in one shared chunk. |
| `chunks/6511-…js` | 383 kB | 98 kB | **`recharts` (1.55 MB stat)** + `react-smooth`, `lodash`, `decimal.js-light`, `d3-scale`, `d3-shape`. Loaded wherever a chart is imported directly. |
| `chunks/b1644e8c-…js` | 240 kB | 42 kB | Framework-ish polyfill chunk. |
| `chunks/fd9d1056-…js` | 173 kB | 54 kB | Next.js runtime (in First Load). |
| `chunks/framework-…js` | 140 kB | 45 kB | React + react-dom. |
| `chunks/2117-…js` | 124 kB | 32 kB | Next.js router runtime (in First Load). |
| `chunks/1417-…js` | 120 kB | 39 kB | **`framer-motion` (912 kB stat)** — one per-page dep, split out. |
| `chunks/main-…js` | 113 kB | 33 kB | Next.js app entry. |
| `chunks/polyfills-…js` | 113 kB | — | Browser polyfills (legacy targets). |

### Per-route chunks (top 10)

| Chunk | Parsed | Gzip | Why it's big |
|---|---:|---:|---|
| `app/match/[id]/live/page-…js` | **1.15 MB** | 78 kB | Inlines **`data/radar-nav-data.json` — 910 kB parsed / 4.66 MB on disk** through `lib/radar-nav.ts` → `lib/radar-position-engine.ts` → page. Plus `useLiveMatch.ts` (70 kB) and `components/match/MapRadarPanel.tsx` (39 kB). |
| `app/desktop/page-…js` | 165 kB | 39 kB | `components/desktop-apps/*` concatenated (MailApp, SocialApp, MarketApp, CalendarApp, NewsApp, ShopApp, FacilitiesApp, FinanceApp, AcademyApp) — none code-split. |
| `app/player/[id]/page-…js` | 83 kB | 21 kB | `components/player/player-detail.tsx` (35 kB) + `@radix-ui/react-tabs` (29 kB). `PlayerSpiderChart` (recharts) is imported eagerly → drags in the 383 kB `6511` recharts chunk, which is why First Load balloons to **680 kB**. |
| `app/schedule/page-…js` | 82 kB | 19 kB | `TournamentDetailsModal.tsx`, `TournamentStandings.tsx`. |
| `app/tournaments/[id]/page-…js` | 77 kB | 17 kB | Page component (61 kB) + `TournamentStats.tsx`. |
| `chunks/3496-…js` | 74 kB | 19 kB | Mixed UI primitives. |
| `app/staff/page-…js` | 58 kB | 15 kB | Imports `StaffDetailsModal`, `StaffNegotiationModal`, `@radix-ui/react-alert-dialog`. 545 kB First Load comes mostly from shared vendor chunks. |
| `app/new-game/create-team/page-…js` | 58 kB | 15 kB | `RosterBuilderModal.tsx` (20 kB) concatenated in. |
| `app/scouting/page-…js` | 47 kB | 12 kB | Page concatenation; pulls `PlayerSpiderChart` → recharts chunk on first load. |
| `app/main-menu/page-…js` | 46 kB | 12 kB | — |

### Top packages across the entire client bundle (parsed, deduped)

| Package | Parsed |
|---|---:|
| `lucide-react` | **1.03 MB** |
| `next` (runtime) | 466 kB |
| `recharts` | 338 kB |
| `framer-motion` | 184 kB |
| `react-dom` | 129 kB |
| `zod` | 57 kB |
| `styled-jsx` | 40 kB |
| `lodash` | 31 kB |
| `@radix-ui/react-tabs` | 29 kB |
| `@radix-ui/react-popper` | 27 kB |
| `react-smooth` | 25 kB |
| `tailwind-merge` | 25 kB |
| `date-fns` | 21 kB |
| `@radix-ui/react-select` | 20 kB |
| `zustand` | 20 kB |
| `sonner` | 18 kB |
| `@radix-ui/react-alert-dialog` | 16 kB |

(Smaller Radix primitives, `react-remove-scroll`, `decimal.js-light`, `d3-*`
round out the list.)

## 4. Routes pulling in unexpectedly large deps

1. **`/match/[id]/live` — 4.66 MB JSON imported into the client bundle.**
   `data/radar-nav-data.json` is imported statically by `lib/radar-nav.ts`
   (`import radarNavData from "@/data/radar-nav-data.json"`) and travels via
   `lib/radar-position-engine.ts` into the live match page. That single JSON
   accounts for **910 kB parsed** of the 1.15 MB live-match page chunk. It
   also dominates the on-disk `.js` file (611 kB gzip-equivalent in bytes on
   disk before webpack minification — see `hooks/useLiveMatch.ts` concat tree).
   This file is pure lookup data for radar navigation and only the live-match
   route needs it. It is currently committed into every renderer build.

2. **`/player/[id]` First Load = 680 kB (largest route in the app).**
   `components/player/player-detail.tsx` imports `PlayerSpiderChart`
   statically, and `PlayerSpiderChart` imports from `recharts`. That forces
   the 383 kB shared `recharts` chunk (`chunks/6511`) into First Load for
   this route.

3. **`/stats` = 455 kB, `/scouting` = 457 kB — also recharts-driven.**
   `app/stats/page.tsx` imports from `"recharts"` directly. `app/scouting/page.tsx`
   and `components/ui/player-spider-chart.tsx` also import recharts without a
   dynamic boundary. Any route that touches a chart component eagerly pulls
   the full recharts + d3-scale + d3-shape + react-smooth + lodash + decimal.js-light
   stack.

4. **`/desktop` = 504 kB / page JS = 43 kB.** `app/desktop/page.tsx` imports
   **9 desktop-app components** (Mail, Social, Market, Calendar, News, Shop,
   Facilities, Finance, Academy) up-front at lines 32–40. Only one "window"
   is visible at a time but all nine are bundled into the initial route JS.

5. **`/staff` = 545 kB.** The page itself is only 58 kB; the First Load is
   inflated by the shared `1068` (lucide-react, 611 kB) and `2100`
   (engine + store, 516 kB) chunks. The full simulation engine ships on
   every route that touches the Zustand store.

6. **`lucide-react` — 1.03 MB parsed.** Named imports from `lucide-react`
   are used in **99** different TS/TSX files across 131 files total. Without
   `modularizeImports` or `optimizePackageImports`, the full icon tree is
   reachable from one shared chunk instead of tree-shaken per route.

7. **`framer-motion` — 184 kB parsed, 912 kB stat.** Imported directly by
   **30 route files** (`app/**/page.tsx`), always via `import { motion } from
   "framer-motion"`. Next splits it into its own vendor chunk (`1417`),
   so this is "only" a per-session cost once loaded.

8. **Engine + store in shared vendor (`2100`, 516 kB parsed).** The
   entire `engine/*` (340 kB) and `store/game-store.ts` (131 kB) end up in
   a shared chunk because every page calls `useGameStore`. That's expected,
   but it means the 88 kB "shared by all" line in the build summary
   **understates** true first-load cost — any route that opens the store
   also pulls `2100`.

## 5. Is heavy content code-split?

Scanned `app/` and `components/` for `dynamic(…)` calls:

**Actually split with `dynamic(… { ssr: false })`:**

| Component | Imported in | Notes |
|---|---|---|
| `components/squad/ChemistryMatrix` | `app/squad/page.tsx:15` | Lazy |
| `components/squad/SynergyChart` | `app/squad/page.tsx:23` | Lazy (recharts-free radar drawing) |
| `components/squad/SystemBonuses` | `app/squad/page.tsx:24` | Lazy |
| `components/training/RoleTrainingModal` | `app/squad/page.tsx:22`, `app/training/page.tsx:38` | Lazy |
| `components/training/WeaponTrainingModal` | `app/training/page.tsx:39` | Lazy |
| `components/match/TacticalLoadoutEditor` | `app/training/page.tsx:40` | Lazy |
| `components/tournament/TournamentBracket` | `app/tournaments/page.tsx:41` | Lazy |
| `components/celebration/SeasonRecapModal` | `app/page.tsx:18` | Lazy |
| `components/celebration/HLTVAwardsModal` | `app/page.tsx:19` | Lazy |
| `components/celebration/TournamentWinCelebration` | `components/layout/GameShell.tsx:18` | Lazy |
| `components/celebration/LegendPickModal` | `components/layout/GameShell.tsx:20` | Lazy |
| `components/layout/ExitConfirmDialog` | `GameShell.tsx:16` | Lazy |
| `components/layout/MatchNavigationGuard` | `GameShell.tsx:17` | Lazy |
| `components/ui/ToastNotifications` | `GameShell.tsx:19` | Lazy |
| `components/ui/BugReportButton` | `GameShell.tsx:21` | Lazy |
| `components/debug/DevTools` | `GameShell.tsx:22` | Lazy |
| `components/ui/WeekProcessingOverlay` | `GameShell.tsx:23` | Lazy |
| `components/ui/KeyboardShortcutsModal` | `GameShell.tsx:24` | Lazy |

**Expected to be split but currently eager (show up inline in route chunks):**

| Area | Component | Importer | Evidence |
|---|---|---|---|
| **Match sim** | `components/match/MapRadarPanel` | `app/match/[id]/live/page.tsx` | Concatenated into the live-match page (38 kB in-chunk). |
| **Match sim** | `lib/radar-nav` (+ 4.66 MB JSON) | `lib/radar-position-engine.ts` → live page | Static `import radarNavData from …json` — not split, ships as 910 kB of module bytes in the live-match chunk. |
| **Match sim** | `hooks/useLiveMatch` | live page | 70 kB concatenated in. |
| **Roster / squad** | `components/onboarding/RosterBuilderModal` | `app/new-game/create-team/page.tsx` | 20 kB concatenated in (eager). |
| **Roster / squad** | `components/player/player-detail` | `app/player/[id]/page.tsx` | 35 kB concatenated in (eager). |
| **Charts** | `components/ui/player-spider-chart` | `components/player/player-detail.tsx`, `app/scouting/page.tsx` | Eager — forces `recharts` chunk into First Load of `/player/[id]`, `/scouting`. |
| **Charts** | `components/ui/player-radar-chart` | (referenced but smaller) | Eager import of `recharts`. |
| **Charts** | `components/ui/chart.tsx`, `components/ui/charts.tsx` | used by stats/finances/etc. | Re-exports from `recharts`; used by pages that import them statically. |
| **Stats charts** | `app/stats/page.tsx` | — | Imports `recharts` primitives directly. |
| **Desktop apps** | `components/desktop-apps/*` (9 files) | `app/desktop/page.tsx:32-40` | All 9 apps eagerly imported, adding 91 kB to the desktop route chunk. |
| **Tournament** | `components/tournament/TournamentStandings`, `TournamentStats`, `AdvancementAnimation` | `app/schedule/page.tsx`, `app/tournaments/[id]/page.tsx` | Static imports, land in each route chunk. |

**Heavy modal-style components that are NOT dynamic-imported and probably
should be re-evaluated:** `RosterBuilderModal`, `PlayerDetail` (whole
page body), the desktop "apps" collection, `StaffDetailsModal`,
`StaffNegotiationModal`, `NegotiationModal`, `RenewContractModal`,
`TransferListingModal`, `TournamentDetailsModal` — all sit inside their
parent page chunks today.

## 6. How to reproduce

```bash
npm run analyze          # builds with ANALYZE=true, writes .next/analyze/*.html
# Open in a browser:
#   .next/analyze/client.html   – renderer (what Electron loads)
#   .next/analyze/nodejs.html   – SSR/server chunks (not shipped in Electron runtime)
#   .next/analyze/edge.html     – edge runtime (unused here)
```

The analyzer is wired into `next.config.js` via `@next/bundle-analyzer`;
it is only enabled when `ANALYZE=true`, so normal `npm run build` is
unaffected.

---

*Analysis only — no optimizations applied. Deferred to a follow-up task.*
