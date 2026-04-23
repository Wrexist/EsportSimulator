# Release Audit — Phase 1

_Branch:_ `claude/full-codebase-audit-GczWy`
_Date:_ 2026-04-23
_Scope:_ Observe-only baseline. No fixes applied.

Tooling used: `npx tsc --noEmit`, `npm run lint`, `npm test`, `grep`, `npm outdated`,
`npm audit`, `npm run build`, manual inspection.

---

## 1. TypeScript — `tsc --noEmit`

| Metric | Value |
| --- | --- |
| Exit code | 0 |
| Errors | **0** |
| Files in error | 0 |

Config: `tsconfig.json` (strict mode enabled per repo conventions).
Clean — no type errors today.

---

## 2. Lint — `npm run lint` (Next.js / ESLint 8.57.1)

| Metric | Value |
| --- | --- |
| Exit code | 0 |
| Errors | **0** |
| Warnings | **109** |

Breakdown by rule:

| Count | Rule |
| --- | --- |
| 39 | `@next/next/no-img-element` (`<img>` instead of `next/image`) |
| 17 | `react/no-unescaped-entities` (`'`) |
| 16 | `no-console` |
| 6  | `react/no-unescaped-entities` (`"`) |
| 5  | `jsx-a11y/alt-text` (missing `alt` on `<img>`) |
| ~14 | `react-hooks/exhaustive-deps` (missing/unstable deps) |
| ~3 | `prefer-const` |
| rest | misc (LCP, alt, etc.) |

Representative hot files: `lib/logger.ts`, `lib/debug-logger.ts`,
`components/ui/tutorial.tsx`, `components/ui/BugReportButton.tsx`,
`components/ui/SocialFeed.tsx`, `components/ui/Taskbar.tsx`,
`components/ui/TeamLogoDisplay.tsx`, `lib/performance.ts`,
`lib/social-generator.ts`.

---

## 3. Tests — `npm test` (Jest 29.7)

Exist? **Yes** — 7 suites under `__tests__/`.

| Suite | Result |
| --- | --- |
| `chemistry.test.ts` | PASS |
| `critical-path.test.ts` | PASS |
| `engine.test.ts` | PASS |
| `live-match-utils.test.ts` | PASS |
| `radar-level-selector.test.ts` | PASS |
| `radar-nav.test.ts` | PASS |
| `radar-position-engine.test.ts` | PASS (18.9 s) |

Totals: **7/7 suites**, **133/133 tests**, 0 snapshots. Wall time ≈ 20 s.

Coverage of gameplay: chemistry, match engine, critical save/load path,
live-match utilities, radar nav + positioning. No React component tests,
no Playwright/E2E runs (Playwright is installed but no `e2e/` directory and
no script wires it in).

---

## 4. Console noise (src directories only)

Scanned: `app/`, `components/`, `lib/`, `engine/`, `store/`, `hooks/`,
`electron/`, `scripts/`.

| Kind | Count |
| --- | --- |
| `console.log` | 70 |
| `console.warn` | 30 |
| `console.error` | 48 |
| `console.info` | 1 |
| `console.debug` | 1 |
| `debugger` | 0 |

Files touched (28 total):

```
app/api/console-log/route.ts            lib/analytics.ts
app/error.tsx                           lib/debug-logger.ts
components/console-to-terminal.tsx      lib/error-tracking.ts
components/layout/GameShell.tsx         lib/logger.ts
components/ui/bulk-actions.tsx          lib/settings-store.ts
components/ui/error-boundary.tsx        scripts/check-conflict-markers.ts
engine/atomic-week-processor.ts         scripts/circuit-calendar-validate.ts
engine/match-engine.ts                  scripts/generate-radar-nav-data.ts
engine/match-simulation.ts              scripts/release-hardening-check.ts
engine/mod-loader.ts                    scripts/resolve-merge-conflicts.ts
engine/save-types.ts                    scripts/sanitize-snapshot.ts
engine/storage-adapter.ts               scripts/session-simulation-audit.ts
engine/worker/week-processor-bridge.ts  scripts/steam-compliance-audit.ts
hooks/use-local-storage.ts              store/game-store.ts
```

Note: `scripts/*` are dev-only; lib/logger + lib/debug-logger are intentional
loggers. The engine / store / components occurrences ship to production.

---

## 5. Code markers

Searched `*.ts`, `*.tsx`, `*.js` across the repo (excluding `node_modules`,
`.next`, `dist`).

| Marker | Count |
| --- | --- |
| `TODO` | **0** |
| `FIXME` | **0** |
| `HACK` | **0** |
| `@ts-ignore` | **0** |
| `@ts-expect-error` | **0** |
| `@ts-nocheck` | **0** |
| `any` (as type: `: any`, `<any>`, `as any`, `any[]`) | **586** |

`any` hot spots (occurrences per file):

```
142  store/game-store.ts
 36  hooks/useLiveMatch.ts
 36  app/tournaments/[id]/page.tsx
 31  app/desktop/page.tsx
 29  components/desktop-apps/AcademyApp.tsx
 24  components/player/player-detail.tsx
 17  app/stats/page.tsx
 16  app/match/[id]/result/page.tsx
 15  app/scouting/page.tsx
 13  app/schedule/page.tsx
 11  lib/settings-store.ts
 10  components/desktop-apps/MarketApp.tsx
 10  app/match/[id]/tactics/page.tsx
 10  app/dev/page.tsx
  9  store/slices/academy-slice.ts
  9  data/snapshot-loader.ts
  9  app/squad/page.tsx
```

---

## 6. Dependencies

### `npm outdated` — 33 packages behind

Majors pending:

| Package | Current | Latest |
| --- | --- | --- |
| next | 14.2.18 | 16.2.4 |
| react / react-dom | 18.2.0 | 19.2.5 |
| @types/react / @types/react-dom | 18.2.x | 19.x |
| typescript | 5.3.3 | 6.0.3 |
| eslint | 8.57.1 | 10.2.1 |
| eslint-config-next | 14.2.35 | 16.2.4 |
| tailwindcss | 3.4.19 | 4.2.4 |
| lucide-react | 0.562.0 | 1.8.0 |
| zod | 3.25.76 | 4.3.6 |
| electron | 39.4.0 | 41.3.0 |
| jest | 29.7.0 | 30.3.0 |
| recharts | 2.15.4 | 3.8.1 |
| sonner | 1.7.4 | 2.0.7 |
| immer | 10.1.1 | 11.1.4 |
| cross-env | 7.0.3 | 10.1.0 |
| @hookform/resolvers | 3.10.0 | 5.2.2 |
| node-fetch | 2.7.0 | 3.3.2 |

Many have in-range patch bumps available (`npm update` will take
`framer-motion`, `electron`, `fs-extra`, `ts-jest`, `postcss`,
`react-hook-form`, `react-resizable-panels`, `react-day-picker`,
`wait-on`, `zustand`).

### `npm audit` — 15 vulnerabilities (3 moderate, 10 high, 2 critical)

| Severity | Package | Notes |
| --- | --- | --- |
| **critical** | `next` 14.2.18 | ~14 CVEs incl. SSRF, cache poisoning, DoS, middleware auth bypass. Fix via `next@14.2.35` (semver-compatible). |
| **critical** | `handlebars` | Transitively via `electron-builder-notarize` → old `electron-notarize`. Needs dep replacement (package deprecated in favor of `@electron/notarize`). |
| high | `electron` 39.4.0 | 18 CVEs. Latest patch `39.8.9`. |
| high | `axios`, `xmldom`, `tar`, `lodash`, `minimatch`, `glob`, `@next/eslint-plugin-next`, `eslint-config-next` | Transitive. |
| high | `xlsx` | **No fix available upstream.** Used only in `devDependencies`; not shipped to runtime, but still a supply-chain risk for CI. |
| moderate | `ajv`, `brace-expansion`, `follow-redirects` | Transitive. |

Prod deps: 198. Dev: 957. Total tree: 1 163 packages.

---

## 7. Bundle size — production build

`npm run build` completed successfully (exit 0). Static pages generated:
36 static + 6 dynamic (ƒ). Shared first-load JS: **88.1 kB**.

Page-by-page `First Load JS` — largest offenders:

| Route | Page JS | First Load JS |
| --- | --- | --- |
| `/player/[id]` | 22.9 kB | **666 kB** |
| `/staff` | 15.6 kB | **532 kB** |
| `/desktop` | 42.5 kB | **490 kB** |
| `/scouting` | 16.3 kB | 442 kB |
| `/stats` | 25.3 kB | 440 kB |
| `/match/[id]/live` | 100 kB | 404 kB |
| `/new-game/create-team` | 18.9 kB | 360 kB |
| `/training` | 11.9 kB | 353 kB |
| `/schedule` | 22.8 kB | 351 kB |
| `/squad` | 12.6 kB | 351 kB |

Everything else: 299–345 kB first-load.

`.next/` directory sizes:

| Path | Size |
| --- | --- |
| `.next/` total | 555 MB |
| `.next/cache/` | 537 MB |
| `.next/static/` | 6.3 MB |
| `.next/server/` | 8.2 MB |
| `.next/static/chunks/` | 6.0 MB |

The cache is not shipped; shippable asset size is ~14.5 MB.

Build warnings pass through (the 109 lint warnings). No build errors.

---

## 8. Electron packaging

`electron-builder` is configured inline in `package.json` under `build:`.

| Field | Value |
| --- | --- |
| `appId` | `com.esportssim.game` ✓ |
| `productName` | `Esports Manager` ✓ |
| `executableName` | `EsportsManager` ✓ |
| `asar` | `true` ✓ |
| `asarUnpack` | `.next`, `next.config.js`, `package.json`, `postcss.config.mjs`, `public`, `steam_appid.txt` ✓ |
| `files` excludes | strips `@types`, `typescript`, `eslint*`, `jest`, `ts-jest`, `playwright*`, `puppeteer*`, `xlsx`, `prettier`, `@babel` — good |
| `compression` | `maximum` |
| `forceCodeSigning` | `false` |
| `afterSign` | `electron-builder-notarize` (package deprecated — use `@electron/notarize`) |

### Steam triple-target coverage

| OS | Target | Icon | Notes |
| --- | --- | --- | --- |
| Windows | `nsis` | `public/logo.png` (512×512 PNG) | **Wrong format** — `nsis` wants `.ico`. Repo has `public/logo.ico` (1 icon, 32×32) but it's not wired into the config. electron-builder will attempt to transcode, producing a low-res multi-size icon. Recommend shipping a proper `.ico` with 16/32/48/64/128/256 sizes. |
| Linux | `AppImage` | **not set** | Defaults to `public/logo.png`. Acceptable for AppImage (needs ≥512). |
| macOS | `dmg` | **not set** | No `.icns` is provided. electron-builder will transcode `public/logo.png` → `.icns`, which works but is suboptimal. Also no code-signing identity configured (`forceCodeSigning:false`) and notarization is wired through a deprecated package — macOS Steam builds will need both signing + notarization credentials. |

`steam_appid.txt` = `4326170` (present; will be unpacked from asar).
`steamworks.js@0.4.0` is a runtime dependency and is loaded with a
try/catch in `electron/main.js:26`, so non-Steam dev runs don't crash.

NSIS config: `oneClick:false`, `allowToChangeInstallationDirectory:true` —
standard, Steam-friendly.

`electron/` contains two files: `main.js`, `preload.js`. Context-isolated
preload exposes `electron.steam`, `electron.window`, `electron.gpu`,
`electron.log`, `electron.storage` bridges.

### Gaps before a Steam ship

1. Provide multi-size `win.icon` `.ico` (or regenerate from 512px master).
2. Provide `mac.icon` `.icns` and enable code signing with `CSC_LINK` / Apple ID env vars; replace deprecated `electron-builder-notarize` with `@electron/notarize` or the newer hook.
3. Provide `linux.icon` explicitly (even if identical to default).
4. Decide whether `steam_appid.txt`'s 4326170 is the real Steamworks app ID.
5. `scripts/run-dist-builder.js` used by `npm run dist` — confirm it sets the per-OS build flags (not audited here).

---

## 9. Route inventory (Next.js App Router)

Pages under `app/`:

| Route | Kind | File | Purpose |
| --- | --- | --- | --- |
| `/` | static | `app/page.tsx` | Splash → routes to `/main-menu` based on save state |
| `/main-menu` | static | `app/main-menu/page.tsx` | Save slot list + entry to new/load game |
| `/new-game` | static | `app/new-game/page.tsx` | Choose existing team |
| `/new-game/create-team` | static | `app/new-game/create-team/page.tsx` | Custom team creator |
| `/load-game` | static | `app/load-game/page.tsx` | Save browser |
| `/credits` | static | `app/credits/page.tsx` | Credits |
| `/settings` | static | `app/settings/page.tsx` | Resolution, volumes, difficulty, etc. |
| `/settings/community-import` | static | `app/settings/community-import/page.tsx` | Community data import |
| `/desktop` | static | `app/desktop/page.tsx` | Main "desktop" UI with windowed apps |
| `/basecamp` | static | `app/basecamp/page.tsx` | Home / team HQ view |
| `/career` | static | `app/career/page.tsx` | Manager career screen |
| `/schedule` | static | `app/schedule/page.tsx` | Week schedule |
| `/schedule/staff-meeting` | static | `app/schedule/staff-meeting/page.tsx` | Staff meeting flow |
| `/squad` | static | `app/squad/page.tsx` | Roster management |
| `/staff` | static | `app/staff/page.tsx` | Staff hiring + management |
| `/training` | static | `app/training/page.tsx` | Training scheduling |
| `/academy` | static | `app/academy/page.tsx` | Youth academy |
| `/transfers` | static | `app/transfers/page.tsx` | Transfer market |
| `/scouting` | static | `app/scouting/page.tsx` | Scouting missions |
| `/finances` | static | `app/finances/page.tsx` | Finances / ledger |
| `/sponsorships` | static | `app/sponsorships/page.tsx` | Sponsor offers |
| `/equipment` | static | `app/equipment/page.tsx` | Equipment / loadouts |
| `/tournaments` | static | `app/tournaments/page.tsx` | Tournament list |
| `/tournaments/[id]` | **dynamic** | `app/tournaments/[id]/page.tsx` | Tournament detail |
| `/stats` | static | `app/stats/page.tsx` | Statistics |
| `/rankings` | static | `app/rankings/page.tsx` | Global rankings |
| `/trophies` | static | `app/trophies/page.tsx` | Trophies won |
| `/hall-of-fame` | static | `app/hall-of-fame/page.tsx` | HoF view |
| `/fpl` | static | `app/fpl/page.tsx` | FPL-style meta layer |
| `/player/[id]` | **dynamic** | `app/player/[id]/page.tsx` | Player detail |
| `/match/[id]/veto` | **dynamic** | `app/match/[id]/veto/page.tsx` | Map veto phase |
| `/match/[id]/tactics` | **dynamic** | `app/match/[id]/tactics/page.tsx` | Pre-match tactics |
| `/match/[id]/live` | **dynamic** | `app/match/[id]/live/page.tsx` | Live match (100 kB JS) |
| `/match/[id]/result` | **dynamic** | `app/match/[id]/result/page.tsx` | Post-match result |
| `/animations` | static | `app/animations/page.tsx` | Animations showcase / dev |
| `/dev` | static | `app/dev/page.tsx` | Developer tools page |
| `/manifest.webmanifest` | static | (route handler) | PWA manifest |
| `/api/console-log` | **dynamic** | `app/api/console-log/route.ts` | Receives client console output |

Layouts: `app/layout.tsx` (root), `app/animations/layout.tsx`,
`app/dev/layout.tsx`.

---

## 10. State management

**Library:** Zustand `5.0.9` with `zustand/middleware` (`persist`) and
`zustand/middleware/immer`. `enableMapSet()` from `immer` is called for
Map/Set support. No Redux, no React Context as app state.

### Stores

| Store | File | Notes |
| --- | --- | --- |
| `useGameStore` | `store/game-store.ts` (6 194 lines) | Main monolith. Persisted. |
| `useNotifications` | `store/notifications.ts` | Transient notifications. Not persisted. |
| `useSettingsStore` (?) | `lib/settings-store.ts` | Settings helpers; separate from main store. |
| Save-slot UI state | `store/save-slots.tsx` | React-level. |
| Theme provider | `store/theme.tsx` | React-level. |

### Main store — top-level state shape

Defined in `store/types.ts` as 10 slice interfaces composed into
`GameStoreState`:

```
CoreGameState      saveId, saveName, currentWeek, currentDay, timeMode,
                   gameStartDate, lastRngSeed, playerTeamId, managerDetails,
                   gameOverReason, gameOverWeek, isLoading, error,
                   isInitialized, _hasHydrated
EntitiesState      teams, players, contracts, staff, marketStaff,
                   nextMarketRefreshWeek
MatchState         scheduledMatches, completedMatches, scheduledActivities,
                   activeMatchId, activeMatchState, customTactics
TournamentState    tournaments, selectedRegions, circuitPoints,
                   tournamentQualifications
EventsState        eventsLog, acknowledgedEventIds, newsFeed, financeLedger,
                   transferHistory
SponsorshipState   sponsorOffers, declinedSponsorOfferIds
ScoutingState      scoutedPlayers, activeScoutingMission,
                   watchlistedPlayerIds
AcademyState       academyPlayers, academyMatchHistory, academyRoster,
                   academyTrainingSchedule, academyWeeklyReports,
                   academyScoutingMissions, academyPendingProspects
UIState            theme, availableEquipment, toasts, pendingCelebration,
                   pendingSeasonRecap, pendingLegendPick, legendaryPlayers,
                   hallOfFame, signedLegendIds, activelyPlayingLegendIds,
                   selectedWeeklyActivity, fplData
SettingsState      onboardingCompleted, tutorialCompleted,
                   showTutorialOnNewGame, manualTutorialTrigger,
                   soundEnabled, resolution, masterVolume, musicVolume,
                   gameSpeed, difficulty, autoSave, notifications,
                   showBugReportButton
IndexesState       _teamIndex, _playerIndex, _contractByPlayerIndex,
                   _staffIndex, _completedMatchIds  (transient, rebuilt)
```

Sliced action interfaces live alongside state. Slice creators are in
`store/slices/`: `academy-slice`, `debug-slice`, `events-slice`,
`scouting-slice`, `settings-slice`, `tournament-slice`, `ui-slice`.

Observation: the legacy inline `GameStoreState` interface at
`store/game-store.ts:301` largely duplicates the shape in `store/types.ts`.
Two sources of truth for the store shape.

---

## 11. Summary — highest-impact findings

1. **Security (deps).** 2 critical + 10 high CVEs. The easy wins are
   `next@14.2.35` (semver-compatible) and `electron@39.8.9` (semver-compatible).
   `handlebars` is pulled in via `electron-builder-notarize`; replace with
   `@electron/notarize`. `xlsx` has no fix — keep it in devDeps only
   (already is), and confirm it never ships.
2. **Steam packaging.** Win icon is a PNG referenced by NSIS; macOS has no
   `.icns` and no signing/notarization identity; Linux icon not set.
   Notarization helper is deprecated.
3. **Bundle weight.** `/player/[id]` ships 666 kB of first-load JS,
   `/staff` ships 532 kB, `/desktop` 490 kB, `/match/[id]/live` 404 kB
   with a 100 kB page chunk. Investigate `recharts`, `framer-motion`,
   `xlsx` import surface, and heavy inline logic in these pages.
4. **Type hygiene.** 586 `any` occurrences, 142 in the main store alone.
   No `@ts-ignore` — the escape hatch is `any`, not suppression.
5. **Console noise in runtime code.** ~120 calls across engine / store /
   components (excluding scripts). Lib/logger + lib/debug-logger should
   be the only intentional sinks; engine + component call sites should
   route through the logger or be stripped.
6. **Lint warnings.** 109 warnings, dominated by `<img>` vs `next/image`
   (39) and unescaped entities (23). Plus 14+ `react-hooks/exhaustive-deps`
   which are real correctness risks.
7. **Tests exist and pass (133/133).** Coverage is engine-focused; no
   component/E2E tests. Playwright is installed but unwired.
8. **Store monolith.** `store/game-store.ts` is 6 194 lines. Slices are
   defined in `store/slices/` but the legacy interface on line 301 duplicates
   `store/types.ts`; consolidate.

_No fixes applied in this phase._
