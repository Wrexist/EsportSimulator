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

## Flagged — your call (not changed)

These are either risky to change blind pre-ship, build-machine config, or
design decisions:

- **`save.players[]` never GC'd** (HIGH growth): retired AI players are never
  removed and youth intake adds players every season → monotonic growth toward
  the 32 MiB wall on very long careers, and it slows every per-tick full-pool
  scan. *Not fixed* because safe removal needs a complete reference sweep
  (rosters, contracts, HoF, legendaryPlayers, careerStats, match history) or it
  risks dangling references; wants a dedicated test + a multi-season playtest.
  Highest-value long-career follow-up.
- **`steam_appid.txt`** is `.gitignore`d; if absent at build time, Steam features
  silently bind to Spacewar test AppID 480. Ensure the real AppID file exists on
  the build machine (and assert it in the dist script).
- **`output: 'export'`**: the packaged app boots a full Next.js *server* (multi-
  second cold start; ships the `next` runtime). The sim is 100% client-side, so a
  static export would remove the server + cold-start. Worth doing, but it's a
  build-architecture change that needs a full packaged-build test.
- **League same-week double-booking** (MED): round-robin schedule compression can
  put up to 4 BO1s for one team in a single week (only the first is playable;
  the rest auto-sim). Fixing it (one round/week) needs the league `duration`s in
  `data/tournaments.json` widened, which changes season pacing — a balance pass.
- **STREAMING weekly activity** advertises `+$2,500` in the UI that the processor
  never grants. Decide: implement the (capped, one-per-week) income, or remove
  the chip. Currently neither income nor a crash — just a broken promise.
- `trophies[]` / player `achievements[]` grow slowly and uncapped; `ARRAY_CAPS.hallOfFame`
  is defined but unenforced. Low risk; cap if you want belt-and-suspenders.
- `release:verify` runs `next build` but never `electron-builder`, so packaging
  failures (asar globs, native unpack) aren't caught by the named gate.

See per-area detail in the session notes; every "Fixed" item is re-verified to a
current `file:line` and covered by jest where the harness allows (UI/Electron
items are node-env-uncovered → manual click-through in the Electron build).
