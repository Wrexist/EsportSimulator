# AUDIT_WAVE4.md — Whole-game step-by-step audit (six subsystems)

> 2026-06-09. Six parallel deep audits over the ground waves 1–3 didn't reach: save/persistence/
> migration · tournament/circuit/qualification/calendar · academy/scouting · AI systems ·
> data-integrity/type-safety/incomplete-code · week-tick orchestration & remaining systems.
> **Every load-bearing claim re-verified against current code before classification.** As in prior
> waves, roughly half the raw agent findings were rejected on verification — recorded here so they
> aren't re-raised.
>
> Gates after this wave: `tsc` 0 · `jest` 990 passed / 85 suites · `next lint` 0 errors.

---

## ✅ FIXED THIS WAVE (each verified + behind a test where node-testable)

| # | Finding | Subsystem | Where |
|---|---------|-----------|-------|
| 1 | **AI/free-agent talent never developed** — weekly training only ran for the player's team; young AI players stagnated and the player trivially dominated by season 3. Added bounded youth growth toward potential for all players. | AI / lifecycle | `engine/player-lifecycle.ts` `processNaturalGrowth` (+4 tests) |
| 2 | **Save builders had diverged** (violates invariant #1): `buildSaveSnapshot` missing `difficulty`/`lastPlayedAt`/`careerStats`; `saveGame` action missing `nextMarketRefreshWeek`/`careerStats`. A manual save dropped market-refresh timing + cross-season stats. Reconciled both + plumbed `careerStats` through store state. | Save | `build-save-snapshot.ts`, `game-store.ts`, `store/types.ts` (+test) |
| 3 | **Academy scouting charged up front but discarded the prospect if the review desk was full at completion** — money for nothing. Now refuses the mission before charging when the desk (max 5) is full. | Academy | `academy-slice.ts` `scoutProspect` |
| 4 | **`releaseProspect` left stale `academyRoster` slots** pointing at the released prospect (dev-match would resolve a missing starter). Now cleared. | Academy | `academy-slice.ts` `releaseProspect` |
| 5 | **`circuitPoints[].results` grew unbounded** — one row per placement forever (array is per-team-bounded, the inner log wasn't). Compactor trims to recent 60 per team; running `points` total untouched. | Tournament/save | `save-compactor.ts`, `lib/constants.ts` |

## ❌ REJECTED ON VERIFICATION (do not re-report)

- **"Season-end aging double-runs on tick resume" / a whole class of "not idempotent on resume"
  findings (sponsor decrement, finance-ledger collisions, upcoming-match notif).** The week-tick is
  **one authoritative save at the end** (invariant #4): a crashed tick persists nothing, so the next
  run re-executes from the last *completed* save. The whole tick is atomic; nothing runs twice on the
  same persisted state. The agent misread the model (it even self-concluded aging was "SAFE").
- **"FPL is a dormant 932-line system, unbounded growth."** FPL IS wired — `applyFplWeek(saveState, rng)`
  runs each advanceWeek (`game-store.ts:2158`). Not dormant.
- **"`socialFeed` uncapped."** Capped at 60 in the slice on every sync/publish (`SOCIAL_FEED_CAP`).
  The agent only checked the compactor.
- **"`careerStats` orphaned / never persisted."** The tick sets `save.careerStats` and persists the
  full save directly; it's also rebuildable from match history. (Still added to both builders for
  invariant-#1 consistency — finding #2.)
- **"`legendaryPlayers` dedup insufficient."** Both push sites guard by id (`atomic-week-processor.ts:382,392`).
- **Tournament calendar "runs dry" after season 1.** It REGENERATES — week 53 re-creates startWeek-1
  events with an `_s2` suffix (`atomic-week-processor.ts` season loop). Game does not run out of events.
- **Data integrity:** all `data/*.json` parse; tournament calendar IDs/weeks/asset paths consistent. PASS.
- **Type-safety / incomplete code:** 0 `@ts-ignore`, no real TODO/FIXME in shipping code (the 136
  markers are docs/comments-about-fixes), no unguarded production `console.log`. The flagged `as any`
  casts have defensive fallbacks (e.g. `team-strength.ts` already `Array.isArray`-guards). PASS.
- **Most of the tournament audit's "P0s"** — each was self-rejected as "Safe" after tracing (player-team
  bracket re-insertion, circuit-points completion gate, self-match repair pass, qualifier dedup). The
  tournament subsystem is robust.

## 📋 OPEN — real, deferred (with reasons)

| Priority | Item | Why deferred / recommendation |
|----------|------|-------------------------------|
| P1 | **AI economy uses absolute budget thresholds, not runway** (`ai-manager.ts:144/228/260` gate on $50k/$100k/$150k). A team with $120k budget but negative cashflow still behaves as "rich." | Replace with `runwayWeeks` gates. Balance change — wants a tuning pass + sim, not a blind edit. |
| P1 | **AI youth-transfer valuation undervalues mid-tier prospects** — `aiMarketValuation` potential multipliers only kick in >80/>70, but most AI-scouted youth are 60–75, so the overpay buffer rarely fires. | Recalibrate thresholds (≈>75/>65). Balance; pair with #1 in an economy-tuning pass. |
| P2 | **Academy arrays uncapped** (`academyPlayers`, `academyScoutingMissions`, `academyPendingProspects`). Practically bounded by enrollment limits, but no hard cap/prune. | Add to `ARRAY_CAPS` + prune. Defense-in-depth; low urgency (the pending pool is gated at 5). |
| P2 | **Multiple concurrent academy scouting missions allowed** (no single-instance guard like `activeScoutingMission`). | Decide: intended (parallel scouts) or cap to 1–2. UX/design call. |
| P2 | **`enrollProspect` doesn't remove from `academyPendingProspects`** (the live UI path `enrollPendingProspect` does). If `enrollProspect` is ever called directly, a duplicate reference results. | Add the filter for safety; verify which path the UI actually uses first. |
| P2 | **AI infrastructure spends check budget before, not after, deduction** — fragile if step order ever changes (currently safe: finance runs after). | Transactional deduct helper. Hygiene. |
| P2 | **`generateSeed()` falls back to `Date.now()`** if Web Crypto is missing — a determinism footgun only if `new SeededRNG()` is ever called without a seed mid-sim (it isn't today). | Warn on no-seed instantiation in the tick path. |
| P2 | **Tournament winner tie-break sorts by week only** (`standings-processor.ts`) — unstable if two terminal matches share a week. | Add `|| a.id.localeCompare(b.id)` secondary sort for determinism. Cheap; fold in next time touching it. |
| P3 | **AI salary formula always pays full market rate** — AI rosters cost more than equivalent player rosters (no rookie/loyalty discounts). | Align with the player path or document the asymmetry. Balance. |
| P3 | **Academy "potential reveal" + "ready for promotion" have no toast/news** — player must check the screen. | Add a notification. Polish. |

## Systemic patterns (four waves, consistent)

1. **Written-but-never-read / asymmetric state remains the dominant defect class** — this wave: the
   empty AI training map (growth ran for nobody but the player), diverged save builders, stale academy
   roster slots, the inner circuit-points log.
2. **Resume safety is solid by construction** — one-save-per-tick makes the tick atomic; the agents'
   resume-panic was unfounded. Don't add intra-tick saves.
3. **The core engine is robust** — tournament, match-sim, data, and type-safety subsystems all came
   back clean across waves. The rot concentrates at *edges*: lifecycle transitions, AI parity,
   purchase→effect wiring, and cross-store plumbing.
4. **Verify before listing** — ~50% of raw agent findings are wrong or self-rejecting every wave.
   The verified-and-rejected ledger is as valuable as the fix list.
