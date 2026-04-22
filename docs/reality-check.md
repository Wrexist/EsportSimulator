# Reality Check — Phase 0 Audit

**Branch:** `claude/fix-critical-bugs-FMPxJ`
**Date:** 2026-04-22
**Scope:** Audit only — no fixes applied.

## 1. Framework Stack (confirmed from `package.json`)

| Layer             | Version        | Source                                    |
|-------------------|----------------|-------------------------------------------|
| Next.js           | `14.2.18`      | `package.json` dep `next`                 |
| React / ReactDOM  | `18.2.0`       | `package.json` deps `react`, `react-dom`  |
| Electron          | `^39.2.7`      | `package.json` devDep `electron`          |
| TypeScript        | `~5.3.0`       | `package.json` devDep `typescript`        |
| Zustand           | `5.0.9`        | `package.json` dep `zustand`              |
| Immer             | `10.1.1`       | `package.json` dep `immer`                |
| State mgmt        | Zustand + Immer middleware + `persist` middleware | `store/game-store.ts:3-6, 626-628` |
| UI                | Tailwind 3.4 + Radix UI + Framer Motion   | `package.json`                |
| Testing           | Jest 29 + ts-jest                         | `package.json`, `jest.config.js` |

- Next.js App Router (`app/` directory, not `pages/`).
- Electron entrypoint: `electron/main.js` (plain JS, not TS), preload at `electron/preload.js`.
- No `src/` directory — top-level folders are `app/`, `components/`, `engine/`, `store/`, `hooks/`, `lib/`, `data/`, `types/`, `electron/`, `public/`, `scripts/`, `__tests__/`.

## 2. Content Security Policy

**Configured in exactly one place:** `electron/main.js:769-784`, via `mainWindow.webContents.session.webRequest.onHeadersReceived`.

Current policy string (reformatted for readability):

```
default-src 'self' http://localhost:*;
script-src  'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*;
style-src   'self' 'unsafe-inline' http://localhost:*;
img-src     'self' data: blob: http://localhost:*;
media-src   'self' data: blob: http://localhost:*;
connect-src 'self' http://localhost:* ws://localhost:*;
font-src    'self' data: http://localhost:*;
```

- **No** `<meta http-equiv="Content-Security-Policy">` tags found anywhere under `app/`.
- **No** `headers()` function in `next.config.js` — CSP is renderer-side via Electron only.
- The policy permits `unsafe-inline` and `unsafe-eval` in `script-src` (required because Next.js dev emits inline bootstrap scripts). It does not distinguish dev vs. prod (`next start` vs. packaged `file://` — note below).
- **Risk flag:** the policy is keyed to `http://localhost:*`. In a packaged Electron build the renderer may load from `file://`, `app://`, or a custom protocol. If the app is currently packaged via `next build` + static export (or similar), the `connect-src` / `default-src` may be blocking requests served by the local HTTP server. Verify load origin in `electron/main.js` before editing CSP.

## 3. Save / Load Code

**Canonical module:** `engine/save-manager.ts`.

| Symbol                         | Location                                        |
|--------------------------------|-------------------------------------------------|
| `SaveManager.saveGame(save)`   | `engine/save-manager.ts:279`                    |
| `SaveManager.loadGame(saveId)` | `engine/save-manager.ts:366`                    |
| `saveManager` singleton export | Imported from `@/engine` in `store/game-store.ts:12` |
| Store action `saveGame`        | `store/game-store.ts:2298` (wraps `saveManager.saveGame`) |
| Store action `loadGame`        | `store/game-store.ts:2099` (wraps `saveManager.loadGame`) |
| Call sites (write)             | `store/game-store.ts:1710, 2051, 2372`          |

Related:
- `engine/save-types.ts` — type definitions
- `engine/storage-adapter.ts` — persistence backend
- `hooks/useAutoSave.ts` — periodic auto-save (every 2 min, per README)
- `store/save-slots.tsx` — slot metadata UI state
- Auto-save on app close is wired through Electron IPC (per README); see `electron/main.js` and `electron/preload.js`.
- Versioned saves v1–v4 with SHA-256 integrity, validation, and auto-repair (per README; confirm in `save-manager.ts`).

## 4. Roster Code (`rosterIds`)

`rosterIds: string[]` lives on `TeamSaveData`. Hot paths:

| File                                    | Role                                             |
|-----------------------------------------|--------------------------------------------------|
| `store/game-store.ts`                   | ~40 references — match setup, transfers, legend signing, load/migrate fixups, tournament/match result processing |
| `engine/ai-manager.ts`                  | AI roster moves: sign, drop, retire, sell, rival scouting |
| `engine/atomic-week-processor.ts`       | Weekly progression: active-player selection, post-match legend/retirement updates |
| `engine/pre-season-transfers.ts`, `engine/role-reconciler.ts`, `engine/team-creator.ts`, `engine/scouting-system.ts` | Supporting systems |
| `components/**` and `app/**/page.tsx`   | Read-only consumers for UI (squad, transfers, stats, match pages) |

Notable patterns worth flagging for the upcoming fix:
- `game-store.ts:880, 291 (ai-manager), 585-586, 650` — mutations use `team.rosterIds = team.rosterIds.filter(...)` (new array) **and** `team.rosterIds.push(...)` (in-place). Under Immer both are fine, but mixing styles in the same draft can mask bugs if the code ever runs outside a draft.
- `game-store.ts:3250` uses `[...new Set([...homeTeam.rosterIds, ...awayTeam.rosterIds])]` — dedup of combined rosters. If a player appears on both rosters (data corruption), this silently collapses rather than surfacing.
- `game-store.ts:2124` comment explicitly notes "no index for roster membership" — lookups are O(teams × rosterSize).

## 5. Zustand + Immer

**Yes**, Immer middleware is enabled.

- `store/game-store.ts:3` — `import { enableMapSet } from "immer"` (Map/Set support enabled).
- `store/game-store.ts:5` — `import { immer } from "zustand/middleware/immer"`.
- `store/game-store.ts:6` — `persist` middleware also wraps the store.
- `store/game-store.ts:626-628` — composition order: `create<...>()(persist(immer((set, get) => ({ ... }))))`.
- `store/game-store.ts:4873` — comment flags known Immer proxy type-cast issue inside one action.

Other stores:
- `store/theme.tsx`, `store/save-slots.tsx`, `store/notifications.ts` — use `zustand` but not necessarily Immer (not audited in depth).

## 6. Target Platform — Steam / Desktop vs Web

**Steam/Desktop is the primary target.** Evidence:

- `package.json` dep `steamworks.js ^0.4.0`.
- `package.json` `"build"` block configured for `electron-builder` (Windows NSIS, macOS DMG, Linux AppImage) with `appId: com.esportssim.game`, `productName: "Esports Manager"`.
- `steam_appid.txt` at repo root (contents: 4 bytes — Steam App ID).
- `engine/steam-service.ts` exists (Steam integration layer).
- Root-level `SHIP_GAME.bat`, `PLAY_DEV.bat`, `steam_deployment_guide.md`, `STEAM_STORE_LISTING.md`.
- Scripts: `compliance:steam`, `compliance:steam:strict`, `release:verify` (all steam-gated).
- README line 5: `**Steam App ID:** 4326170`.

Web build also exists as a byproduct (Next.js `next build` / `next start`), but is not the shipping target.

## 7. Routes (every `page.tsx` under `app/`)

| Path                                     | File                                             |
|------------------------------------------|--------------------------------------------------|
| `/`                                      | `app/page.tsx` (dashboard)                       |
| `/academy`                               | `app/academy/page.tsx`                           |
| `/animations`                            | `app/animations/page.tsx`                        |
| `/basecamp`                              | `app/basecamp/page.tsx`                          |
| `/career`                                | `app/career/page.tsx`                            |
| `/credits`                               | `app/credits/page.tsx`                           |
| `/desktop`                               | `app/desktop/page.tsx`                           |
| `/dev`                                   | `app/dev/page.tsx`                               |
| `/equipment`                             | `app/equipment/page.tsx`                         |
| `/finances`                              | `app/finances/page.tsx`                          |
| `/fpl`                                   | `app/fpl/page.tsx`                               |
| `/hall-of-fame`                          | `app/hall-of-fame/page.tsx`                      |
| `/load-game`                             | `app/load-game/page.tsx`                         |
| `/main-menu`                             | `app/main-menu/page.tsx` (Electron boots here)   |
| `/match/[id]/live`                       | `app/match/[id]/live/page.tsx`                   |
| `/match/[id]/result`                     | `app/match/[id]/result/page.tsx`                 |
| `/match/[id]/tactics`                    | `app/match/[id]/tactics/page.tsx`                |
| `/match/[id]/veto`                       | `app/match/[id]/veto/page.tsx`                   |
| `/new-game`                              | `app/new-game/page.tsx`                          |
| `/new-game/create-team`                  | `app/new-game/create-team/page.tsx`              |
| `/player/[id]`                           | `app/player/[id]/page.tsx`                       |
| `/rankings`                              | `app/rankings/page.tsx`                          |
| `/schedule`                              | `app/schedule/page.tsx`                          |
| `/schedule/staff-meeting`                | `app/schedule/staff-meeting/page.tsx`            |
| `/scouting`                              | `app/scouting/page.tsx`                          |
| `/settings`                              | `app/settings/page.tsx`                          |
| `/settings/community-import`             | `app/settings/community-import/page.tsx`         |
| `/sponsorships`                          | `app/sponsorships/page.tsx`                      |
| `/squad`                                 | `app/squad/page.tsx`                             |
| `/staff`                                 | `app/staff/page.tsx`                             |
| `/stats`                                 | `app/stats/page.tsx`                             |
| `/tournaments`                           | `app/tournaments/page.tsx`                       |
| `/tournaments/[id]`                      | `app/tournaments/[id]/page.tsx`                  |
| `/training`                              | `app/training/page.tsx`                          |
| `/transfers`                             | `app/transfers/page.tsx`                         |
| `/trophies`                              | `app/trophies/page.tsx`                          |

Other route-adjacent files (not counted above):
- `app/layout.tsx` — root layout
- `app/error.tsx`, `app/not-found.tsx` — error boundaries
- `app/manifest.ts` — PWA manifest
- `app/api/` — API routes (exists; not enumerated this pass)
- `app/globals.css`, `app/favicon.ico`

## Summary — Known-good baseline for Phase 0

- Stack: Next 14 App Router + Electron 39 + React 18 + Zustand 5 with Immer middleware.
- CSP: single source in `electron/main.js:769-784`, keyed to `http://localhost:*`. Verify packaged load origin before modifying.
- Save/load: `engine/save-manager.ts` (`saveGame:279`, `loadGame:366`); store wrappers in `store/game-store.ts:2298, 2099`.
- Roster: `rosterIds` mutated in store + `ai-manager.ts` + `atomic-week-processor.ts`; dedup happens only at match-setup time.
- Steam target confirmed (steamworks.js, electron-builder config, steam_appid.txt, SHIP_GAME.bat).
- 37 route pages under `app/`.

**No fixes applied this turn.** Stop here.
