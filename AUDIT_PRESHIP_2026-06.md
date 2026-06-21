# AUDIT_PRESHIP_2026-06 — Pre-Steam ship audit

Six parallel subsystem audits run before the first playable Steam upload, each
re-verified against current code (this repo has a history of "open" items that
had already changed state). Baseline ship gate (`npm run release:verify`) was
**green** before and after: 0 merge conflicts · tsc 0 · hardening pass (tamper,
crash-resume, 500-week fuzz, 2002 images) · Steam compliance 0/0/0 · build 38/38.

Gates after fixes: **tsc 0 · jest 1068 passed (98 suites, +8 regressions) · lint 0 errors.**

## Headline

The codebase is in strong shape. Determinism (0 `Math.random` in `engine/`),
the save-builder field-drop class (test-guarded), tournament progression, and
Electron security are all solid. The audits surfaced one money exploit, one
silent-data-loss path, two crash/softlock vectors, and the long-career
save-growth drivers — all fixed below — plus a short list of build-machine /
design decisions that are yours to make.

## Fixed (with regression tests)

| # | Sev | Area | Bug | Fix |
|---|-----|------|-----|-----|
| 1 | HIGH | Economy | Role-training **start→cancel minted ~$20k/click** (refund used *remaining* weeks though training is pay-as-you-go) | Refund 50% of weeks **paid** (`weeksCompleted`) → always a net loss. `engine/training-manager.ts` |
| 2 | HIGH | Save | **Silent data loss on full storage**: quota errors were swallowed into a volatile in-memory map; read-back verification passed, "save" reported success, progress vanished on close — and the latch then hid existing saves | Quota errors now propagate → `saveGame` returns failure + UI warns. `engine/storage-adapter.ts` |
| 3 | HIGH | Match | Interactive quick-sim / live match **crashed** (`pickWeighted` throw) vs an understrength AI opponent | Guard both rosters `<5` → refuse with a clear message (week tick forfeits properly). `match-simulation-slice.ts`, `useLiveMatch.ts` |
| 4 | MED | Growth | `save.tournaments[]` grew ~40 heavy objects/season forever → toward the 32 MiB **unloadable** wall | Compactor keeps active + last-2-seasons completed; outcomes already live in careerStats/trophies. `save-compactor.ts` |
| 5 | MED | Economy | Equipment purchase **debited budget with no ledger entry** (invariant #5) | Ledger the spend in the store wrapper. `team-facilities-slice.ts` |
| 6 | MED | UI/Electron | Create-team **Back button silently dead** in sandboxed Electron (`window.confirm` suppressed) on a hideChrome page (only exit) | Replaced with in-app `AlertDialog`. `app/new-game/create-team/page.tsx` |
| 7 | MED | UI | `StaffNegotiationModal` could throw `TypeError` (`myTeam?.budget.toLocaleString()`) | `myTeam?.budget?.toLocaleString() ?? "0"` |
| 8 | LOW | Engine | Contract-expiry event push not dedup-guarded (replay defense-in-depth) | Guard with `existingEventIds`. `finance-processor.ts` |
| 9 | LOW | Save | Academy history pruned from the wrong end (newest-first arrays sliced as tail) → lost recent entries | `.slice(0, cap)`. `array-pruning.ts` |
| 10 | LOW | Engine | Hall of Fame **double-induction** (two paths used `player.id` vs `hof_${id}` keys) | Standardize on `player.id`, dedup against both. `event-processor.ts` |

## Round 2 — flagged items now fixed (with tests)

| Sev | Item | Fix |
|-----|------|-----|
| HIGH | `save.players[]` never GC'd (monotonic growth → 32 MiB wall + slows every tick) | Season-end GC removes retired, non-legendary players unreferenced by rosters/contracts/legends/HoF/scouting/transfers/career-MVPs/recent-match playerStats. Deterministic, replay-safe. `engine/processors/player-gc.ts` + `player-gc.test.ts` (5 cases) |
| HIGH | `steam_appid.txt` could silently fall back to Spacewar 480 | `scripts/check-steam-appid.js` fails `dist`/`electron:build` if the file is missing, non-numeric, or 480 |
| MED | League same-week double-booking (up to 4 BO1s/team/week) | One round per week **when all rounds fit the season** (extends the window safely); falls back to compression otherwise so nothing overruns into the next instance. `league-schedule.ts` + `league-schedule.test.ts` |
| LOW | STREAMING advertised `+$2,500` the processor never granted | Grant `effects.money` as ledgered INCOME (bounded — one weekly activity → non-farmable). `weekly-activity-processor.ts` + test updated |

## Deliberately NOT changed (would risk breakage / needs its own effort)

- **`output: 'export'`** — every dynamic route (`/player/[id]`, `/match/[id]/*`,
  `/tournaments/[id]`) is a `"use client"` page using runtime-generated ids with
  no `generateStaticParams`. Static export must enumerate those ids at build time
  (impossible), so forcing it breaks the build / 404s the core match flow. Needs
  a query-param routing refactor + full packaged-build smoke test — out of scope
  for a safe pre-ship pass. Current bundled-server boot works (cost: a few-second
  cold start).
- **`trophies[]` cap** — `manager-career-profile.ts:93` derives the career
  major-trophy count from `trophies.filter(...).length`, so capping the array
  would *corrupt that stat*. Left uncapped (it grows only ~2–5/season). Player
  `achievements[]` and `hallOfFame` grow negligibly and dedup by id.
- **`release:verify` packaging** — adding `electron-builder` to the gate would
  slow it and depends on build-machine/native setup; full packaging stays in
  `dist` (now guarded by the steam-appid check). Run `npm run dist` on the build
  machine for the real packaging smoke test.

See per-area detail in the session notes; every "Fixed" item is re-verified to a
current `file:line` and covered by jest where the harness allows (UI/Electron
items are node-env-uncovered → manual click-through in the Electron build).
