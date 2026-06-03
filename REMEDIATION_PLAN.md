# Esports Simulator — Phased Remediation Plan

A complete, prioritized list of every issue found across two deep audit passes
(engine, store, save system, tournaments, economy/transfers/AI, player
progression, pages, FPL, ~159 UI components, data files, lib utilities), plus
the **improvements / incomplete features** to implement.

Each item: **Problem → Files → Steps → Verify**. Severity in brackets.
Phases are ordered by priority/risk. **Phase 0 is already done** (this audit's
15 fixes). See `AUDIT_REPORT.md` for the narrative pass-1 write-up.

Baseline (held green throughout): `tsc` 0 errors · `jest` 901 passing · `next lint` 0 errors.

---

## Phase 0 — DONE ✅ (committed in this audit)

**Pass 1**
1. Toast IDs no longer consume the deterministic RNG (`ui-slice.ts`) — clicking UI no longer alters match results.
2. Equipment summary panel completed — renders computed `bonuses`/`completeness`/`avgTier` (`app/equipment/page.tsx`).
3. `markAllEventsAsRead` O(n²)→O(n) via Set (`events-slice.ts`).
4. `signSponsor` removes offers robustly (id → name+tier fallback) (`team-facilities-slice.ts`).
5. Removed orphaned `equipmentStatus` memo.

**Pass 2**
6. `/player/[id]` hydration guard — no longer 404s a valid profile on refresh/deep-link (`app/player/[id]/page.tsx`).
7. `renewContract` no longer double-charges 26× the salary delta as a hidden fee (`transfer-contract-slice.ts`).
8. `promotePlayer` writes a real `startWeek`/`endWeek` contract (was `weeksRemaining` → never-expiring) (`transfer-contract-slice.ts`).
9. AI `processAcademyScouting` now skips the player team — no more un-consented ghost prospects on your roster (`ai-manager.ts`).
10. FPL `lastProcessedWeek` advanced on season-end weeks too (idempotency marker) (`fpl-engine.ts`).
11. Sidebar manager initials no longer render "NUNDEFINED" on trailing-space names (`Sidebar.tsx`).
12. `new-game` ranks teams on a copy (`[...teams].sort`) instead of mutating state in render (`app/new-game/page.tsx`).
13. "All Stats" talents now boost the full attribute set (was 7 of ~17; missed reaction/pistol/grenades/entry/trading/…) (`player-development-slice.ts`).
14. Academy dev-match energy clamped at 0 (`academy-slice.ts`).
15. Academy promotion now recomputes synergy + applies the roster-change chemistry penalty, matching transfers (`academy-slice.ts`).

**Pass 3** (each behind a new regression test; 908/908 tests, 0 type errors)
16. **[Phase 3.1]** AI transfer valuation fixed — `potential` is 0-100, but the multiplier/overpay thresholds were 0-20 leftovers so every listed player hit the max boost (sell-any-bench-player-for-a-fortune). Extracted a pure, tested `aiMarketValuation` with correct 0-100 thresholds (`engine/ai/transfer-market.ts`, `__tests__/ai-market-valuation.test.ts`).
17. **[Phase 1.1]** Worker is now compute-only (no-op storage adapter + no-op `saveGame`) so it no longer writes a divergent full save to a worker-local IndexedDB; the main thread now performs the single authoritative `saveGame()` after post-tick steps so academy budget/history, pruning, synergy, and the correct `lastRngSeed` are actually persisted (`engine/worker/week-processor.worker.ts`, `store/game-store.ts`, `__tests__/worker-compute-only.test.ts`).

**Pass 4** — tournament-integrity cluster (each behind a new test in `__tests__/tournament-integrity.test.ts`)
18. **[Phase 2.1]** `recomputeStandings` now preserves Swiss standings (incl. BYE wins, which have no completed match) instead of rebuilding wins from scratch each tick — Swiss qualification (advance at 3 wins) is no longer corrupted; non-Swiss recompute is unchanged (`engine/processors/standings-processor.ts`).
19. **[Phase 2.2]** Removed the duplicate circuit-points award loop from the week processor (it never set `rewardsGranted`, so a tournament completed within that step got points twice). `updateStandings` is now the single idempotent owner; deleted the now-dead `awardPoints` + unused imports (`engine/atomic-week-processor.ts`).
20. **[Phase 2.3]** Wired `CircuitPointsManager.applySeasonalDecay` (25% reduction, drop-to-zero) into the season-end branch — circuit points no longer accumulate unbounded across seasons (`engine/atomic-week-processor.ts`).

**Pass 5** — bracket-deadlock hardening + save bloat
21. **[Phase 2.4]** `handlePlayoffProgression` now auto-advances a degenerate self-match (both bracket slots resolved to the same team) instead of letting `scheduleBracketMatch` silently drop it, and `standings-processor` only flips a tournament to `isCompleted` once a concrete `winnerId` is resolvable — so a stalled bracket can't lock with no champion (`engine/tournament-manager.ts`, `engine/processors/standings-processor.ts`).
22. **[Phase 4.2]** `compactPersistentState` now prunes `scheduledActivities` whose window ended before last week — the ~7 auto-generated REST days/week no longer accumulate unbounded (700+/career → recent ~14). 4.3 (`acknowledgedEventIds`) was already handled by the same compactor (`engine/processors/save-compactor.ts`).

**Pass 6** — UI correctness + scouting integrity
23. **[Phase 6.1]** `AdvancementAnimation` now holds `onComplete` in a ref and drops it from the effect deps — the result screen passed an inline arrow, so every re-render restarted the animation and RE-FIRED the confetti + victory sound. (`components/tournament/AdvancementAnimation.tsx`)
24. **[Phase 5.1]** Scouting's unscouted-rating band now uses the (previously dead) `fuzzyBand` — an offset, deterministic-per-player band — instead of `[ovr-15, ovr+15]` whose midpoint leaked the exact OVR. Revived + exported `fuzzyBand`; the page imports it (`engine/scouting-system.ts`, `app/scouting/page.tsx`). _(Scout-level band-narrowing was left out — no scout-level signal is in scope on that page; the leak closure is the key fix.)_

**Pass 12** — UI standings parity
35. **[Phase 2.6]** The tournament detail page now renders standings/placements from engine-authoritative data: the bracket "Final Standings" use **sequential** placements (3rd-place-decider-aware for 3rd/4th, sequential 5th–8th — no more two teams labelled "3rd" / four labelled "5th"), and the league final-standings prize table, the live "League Standings" table, and the league podium all render from the engine-sorted `displayTournament.standings` (`compareStandings`: points → wins → head-to-head → map/round diff) instead of points-only re-sorts (`app/tournaments/[id]/page.tsx`). _(The rankings-page Elo-only rank tiebreaker remains as a separate, lower-priority spot.)_

**Pass 11** — dead-code cleanup + a dead-component landmine
33. **[Phase 7.2 / 6.4]** Deleted three zero-importer dead components — `virtualized-list.tsx`, `SocialFeed.tsx`, `player-stat-meter.tsx` (verified no references anywhere, incl. docs). This also resolves 6.4 (the `player-stat-meter` NaN/`.toFixed` hazard) and the `SocialFeed` a11y gap by removal.
34. **[Phase 6.3]** `search-filter` (kept — referenced by a `docs/` example) had its parent-callback fired from a `useMemo` (render phase); converted to `useEffect` so it can't trigger React's "update while rendering" warning / an infinite loop if adopted (`components/ui/search-filter.tsx`).

**Pass 10** — perf + UI defensive polish
30. **[Phase 2.7]** `refreshWorldRankings` no longer re-sorts all teams after *every* Elo change (was O(n log n) × hundreds of matches/week). The week tick already refreshes once via the AI world processor; the live-match path refreshes explicitly so the player's post-match rankingChange stays correct (`engine/league-engine.ts`, `store/slices/match-simulation-slice.ts`).
31. **[Phase 6.2]** `Player3DPortrait` now disposes its 10 `useMemo`'d Three.js materials on unmount/recompute — they were passed via the `material` prop, which R3F doesn't auto-dispose, leaking WebGL memory while browsing portraits (`components/ui/Player3DPortrait.tsx`).
32. **[Phase 6.x]** `SynergyChart` guards missing stats (`Number()||0`) so a missing field can't produce `NaN` SVG coords; the result screen's BO1 score block guards `result.maps[0]`; the stats page memoizes `teamPlayers` so dependent memos don't recompute every render (`components/squad/SynergyChart.tsx`, `app/match/[id]/result/page.tsx`, `app/stats/page.tsx`).

**Pass 9** — real double-elimination
29. **[Phase 2.5]** Implemented real double-elim (was silently single-elim). `setupDoubleElim` splits the 16-team field into two 8-team GSL groups; **fixed the structurally-incomplete lower bracket** (added the orphaned lower-R2 round so both lower-semi winners feed the lower final; the lower-final loser is the group's 3rd seed and now *advances* to the playoff QF instead of being eliminated); the playoff bridge starts the week after the group stage resolves; bumped the event's `duration` so the full bracket fits. End-to-end test drives a 16-team event to a single champion with no stall (`engine/tournament-manager.ts`, `engine/tournament/double-elim-handlers.ts`, `data/tournaments.json`, `__tests__/double-elim.test.ts`).

**Pass 8** — AI transfer fairness + season label
26. **[Phase 3.3]** AI free-agent signings now charge a `salary * 4` signing fee (parity with the human path, which pays a 4-week bonus), waived in emergency sub-quorum signings (`engine/ai/roster-management.ts`).
27. **[Phase 3.4]** AI↔AI transfer fees now honor the seller's contract `buyout` (was a flat `skill * 2000` that ignored buyout clauses), and the hard roster cap is re-asserted before the push (`engine/ai/transfer-market.ts`).
28. **[Phase 2.8]** Tournament Hub header now shows the real season via `getSeasonFromWeek(currentWeek)` instead of a hardcoded "Season 1" (`app/tournaments/page.tsx`).

**Pass 7** — manager signing bonus
25. **[Phase 3.2]** `acceptJobOffer` now actually pays the advertised signing bonus — credits `salaryOffer * 4` to the new club's budget (ledgered, one-time), derived from the *current* salaryOffer so a successful negotiation pays off. _Design call:_ the **weekly** manager salary is kept as personal flavor — there is no manager-wallet concept (only team budget), and crediting it to the club budget every week would compound into a balance-breaking, farmable income stream. Accepting an offer is a one-off career move, so only the bonus lands. (`store/slices/events-slice.ts`)

---

## Phase 1 — Save & persistence integrity (CRITICAL — data-loss risk)

> Biggest correctness risk in the codebase. Do this first, behind tests.

### 1.1 Worker self-saves to a divergent store; post-tick mutations never persisted — ✅ DONE (Pass 3)
- **Problem:** `WorkerSaveManager` (`engine/worker/week-processor.worker.ts:31-41`) overrides `saveTransaction`/`clearTransaction`/`saveCheckpoint` — **methods that don't exist** on `SaveManager` — so the real `saveGame`/`beginWeekTick`/`recordMatchComplete`/`completeWeekTick` run **inside the worker**. A Worker has no `window`, so `storage-adapter` picks `IndexedDBAdapter`: the worker writes the full save to a worker-local IndexedDB (in Electron, bypassing the disk-backed `electron-store`). Meanwhile the main thread runs post-tick steps (`store/game-store.ts:2073-2208`: `pruneGameState`, `recalculateAllSynergy`, `processAcademyWeek` budget deduction + match history, achievements) and then **never saves** — the only durable write predates them. Persisted `lastRngSeed` can also lag the in-memory one → determinism break on reload.
- **Files:** `engine/worker/week-processor.worker.ts`, `store/game-store.ts:2073-2208`, `engine/worker/week-processor-bridge.ts`.
- **Steps:**
  1. Make the worker **compute-only**: override `saveGame`, `beginWeekTick`, `markStepComplete`, `recordMatchComplete`, `completeWeekTick`, `markTransactionFailed` to no-ops (and delete the 3 phantom overrides). The worker should mutate + return state, never persist.
  2. In `game-store.ts`, after the post-tick block completes on `result.success`, add a single authoritative `await get_saveManager().saveGame(get() as GameSave)` (use the same manager the rest of the app uses).
  3. Confirm `lastRngSeed` written to disk equals the post-tick in-memory value.
- **Verify:** Advance a week in browser + Electron; quit immediately; reload → academy budget/match-history/pruning/synergy persisted and on-disk `lastRngSeed` matches. Add a test that asserts `saveGame` is called exactly once per tick from the main thread and zero times from the worker.

### 1.2 `processFinance` is not dedup-guarded (latent double-charge) [MEDIUM]
- **Problem:** `finance-processor.ts:54-197` pushes deterministic-ID ledger entries with **no** existence check (unlike every other processor, which take a `ledgerIdSet`). Harmless only while resume is disabled; any replay re-charges wages and duplicates ledger IDs, breaking `integrity-checker.ts:123-142`.
- **Steps:** Thread `ledgerIdSet` into `processFinance(save, playerTeamId, ledgerIdSet)`; guard each `push` with `if (ledgerIdSet.has(id)) continue; …; ledgerIdSet.add(id)`. Do the same for the unguarded event pushes in `event-processor.ts` (budget warnings, injury/recovery/retirement).
- **Verify:** Unit test: run `processFinance` twice on the same week → ledger length and `team.budget` unchanged on the second call.

### 1.3 Delete loaded-gun dead save paths [LOW]
- **Problem:** `saveGameCheckpoint` (`save-manager.ts:413-431`) rewrites `updatedAt` without recomputing the integrity hash (would fail `verifyIntegrityHash`); `rollback`/`rollbackTransaction` (`:999-1017`) restores from a legacy backup key `saveGame` no longer writes. Both have **zero callers**.
- **Steps:** Delete both (and the stale doc comments), or fix the hash/backup-key if you intend to keep them.
- **Verify:** `tsc` + grep confirms no callers; full save/load round-trip test still passes.

---

## Phase 2 — Tournament / competition correctness (HIGH)

### 2.1 Per-tick recompute clobbers Swiss standings (BYE wins erased) — ✅ DONE (Pass 4) [HIGH]
- **Problem:** `recomputeStandings` (`standings-processor.ts:74-124`) rebuilds `wins/losses/mapDiff/roundDiff` from `completedMatches` every tick, erasing Swiss BYE wins (which have no match — `swiss-handlers.ts:131-140`). Swiss advance/elim thresholds are `wins === 3`/`losses >= 3`, so a BYE-advanced team can be silently un-qualified.
- **Steps:** In `recomputeStandings`, early-return for Swiss tournaments (`if (tournament.format === "swiss" || tournament.currentStage === "Swiss Stage") return`). Swiss owns its standings via `handleSwissResult`. (Alt: record BYEs as synthetic completed matches.)
- **Verify:** Test: simulate a Swiss stage with a BYE, tick twice, assert the BYE team's `wins` and ELIMINATED/ADVANCED status are stable.

### 2.2 Circuit points can double-award on a repair-completed tournament — ✅ DONE (Pass 4) [HIGH]
- **Problem:** Two award paths — `atomic-week-processor.ts:1312-1328` (Path A, gated on `!rewardsGranted` but never sets it) and `standings-processor.ts:205-232` (Path B, gated and sets `rewardsGranted`). Tick order is A → matches → B, so normally A is skipped (tournament not yet complete). But when `repairTournamentProgression` (`:1288`) completes a tournament **inside** `processTournaments`, both A and B fire in the same tick → doubled points.
- **Steps:** Delete the duplicate loop at `atomic-week-processor.ts:1312-1328`; let `standings-processor` be the sole awarder (it already covers every `isCompleted` tournament and is idempotent via `rewardsGranted`). Keep the trophy logic that already lives in `standings-processor`.
- **Verify:** Test: tick a bracket tournament to completion (incl. a repair-completed final) and assert each team's circuit points increase exactly once.

### 2.3 Circuit points never decay across seasons — ✅ DONE (Pass 4) [HIGH]
- **Problem:** `CircuitPointsManager.applySeasonalDecay` (`tournament-qualification.ts:124`) has **zero callers**; points accumulate forever, trivializing POINTS-gated eligibility and never resetting the leaderboard.
- **Steps:** In the season-end branch (`atomic-week-processor.ts:320-323`), add `save.circuitPoints = CircuitPointsManager.applySeasonalDecay(save.circuitPoints)`.
- **Verify:** Test: cross a season boundary, assert points are reduced by the documented decay (and a regression test on `applySeasonalDecay` itself, which is currently untested).

### 2.4 Self-match can deadlock a bracket — ✅ DONE (Pass 5) [HIGH]
- **Problem:** `scheduleBracketMatch` (`bracket-scheduling.ts:59-63`) silently returns (warn only) on `homeTeamId === awayTeamId`; if progression ever assigns one team to both slots, the match never completes and the bracket stalls.
- **Steps:** On a self-match, auto-complete it (award the lone team the win, call `handlePlayoffProgression`), mirroring the repair logic at `tournament-manager.ts:169-177`. Also gate `standings-processor.ts:128-135`'s `isCompleted = true` on a resolvable `winnerId` so a stalled bracket can't lock as "complete, no champion".
- **Verify:** Test: feed a bracket where a slot resolves to a duplicate team; assert it auto-advances and the tournament completes with a winner.

### 2.5 `double_elim` runs as single-elimination — ✅ DONE (Pass 9) [HIGH — incomplete feature]
- **Problem:** `tournament-manager.ts:259` routes `"double_elim"` to `setupGenericBracket`; the real machinery (`createDoubleElimGroup:300`, `tournament/double-elim-handlers.ts`, `checkAndStartPlayoffs`/`generatePlayoffs`) is **dead** (`tournament.groups` never populated). `data/tournaments.json` has 1 such event; the Lower-Bracket UI (`app/tournaments/[id]/page.tsx:1346-1368`) is always empty.
- **Steps (choose one):**
  - **Implement:** add a `setupDoubleElim` entry that builds the opening/upper/lower bracket via `createDoubleElimGroup`, populates `tournament.groups`, routes `"double_elim"` to it, and wires `handleOpeningResult`/`handleUpperSemiResult`/`handleLowerResult` into match completion.
  - **Reclassify (smaller):** change the 1 calendar entry to `"bracket"` and delete the dead handlers so the format isn't falsely advertised.
- **Verify:** If implemented: test a full double-elim run (a team loses once, drops to lower bracket, can still win). If reclassified: UI no longer shows an empty lower bracket.

### 2.6 UI standings/placements diverge from engine — ✅ DONE (Pass 12, tournament detail page; rankings-page rank tiebreaker still open) [MEDIUM]
- **Problem:** UI recomputes its own ordering instead of using engine-sorted data: duplicate "3rd"/"5th" placements (`app/tournaments/[id]/page.tsx:871-886`), points-only sorts ignoring head-to-head & map/round diff (`:1226,:745,:896`), Elo-only rank with no tiebreaker (`app/rankings/page.tsx:360-364`, `app/tournaments/page.tsx:107-111`).
- **Steps:** Render from `displayTournament.standings` (already sorted by `compareStandings`) and `TournamentManager.calculatePlacements(...)`; reuse `team.worldRanking` for rank.
- **Verify:** Final-standings table shows unique sequential placements and matches the prize ledger.

### 2.7 `refreshWorldRankings` re-sorts all teams after every Elo update — ✅ DONE (Pass 10) [MEDIUM — perf]
- **Problem:** Called inside `updateEloAfterMatch` (`league-engine.ts:268`) → O(n log n) per match, hundreds/week.
- **Steps:** Move the refresh to once per tick after all matches.
- **Verify:** Week-tick perf profile improves; rankings identical at end of tick.

### 2.8 Hardcoded "Season 1" (✅ DONE Pass 8) + dead V1 registration (still open) [LOW]
- **Problem:** `app/tournaments/page.tsx:552` always prints "Season 1"; `simulateWeeklyRegistrations` V1 (`tournament-manager.ts:1236`) is dead (only V2 is called).
- **Steps:** Use `LeagueEngine.getCurrentSeason(currentWeek)`; delete V1.

---

## Phase 3 — Economy / transfer integrity & AI fairness (HIGH)

### 3.1 AI valuations use a 0-20 potential scale but potential is 0-100 — ✅ DONE (Pass 3) [HIGH — exploit]
- **Problem:** `transfer-market.ts:133-159` reads `player.potential` as 0-20 (`potential*150`, `potential > 16/17` tiers), but potential is 0-100. Every listed player hits max multipliers → AI offers balloon to absurd amounts; sell any benched player for a fortune.
- **Steps:** Normalize to the 0-100 scale: rescale the `potential*150` base term and rewrite thresholds (`> 85`, `> 70`) — or divide potential by 5 before comparisons.
- **Verify:** Test valuations for low/mid/high-potential players land in sane ranges; the multiplier tiers are no longer always-max.

### 3.2 Manager salary / signing bonus / negotiation are never applied — ✅ DONE (Pass 7, signing bonus paid; weekly salary kept as flavor by design) [HIGH — incomplete feature]
- **Problem:** Job offers advertise `salaryOffer` + `signingBonus` (`job-offer-generator.ts:202-204`) and render them (`app/desktop/page.tsx:571-573`), but `acceptJobOffer` (`events-slice.ts:188`) only flips `playerTeamId` — no bonus credited, no recurring manager wage anywhere, and `negotiateJobOffer`'s result is discarded.
- **Steps (choose one):**
  - **Implement:** on accept, credit `signingBonus` to the new team (or a manager wallet) and add a recurring `MANAGER_SALARY` income line in `finance-processor.ts`; make `negotiateJobOffer` actually change the accepted salary.
  - **Remove:** drop the salary/bonus/negotiation UI so it doesn't advertise a non-existent mechanic.
- **Verify:** Accepting an offer changes budget as advertised (or the UI no longer shows phantom numbers).

### 3.3 AI free-agent signings pay no fee; player pays 4× — ✅ DONE (Pass 8) [MEDIUM — fairness]
- **Problem:** `roster-management.ts:135-150` adds an FA with no budget debit, while the player pays `salary * 4` (`MarketApp.tsx:175-180`). AI even charges itself a fee for staff (`infrastructure.ts:58-61`), so it's internally inconsistent.
- **Steps:** Charge AI a comparable signing bonus (`salary * 4` or 2-week fee) and ledger it.
- **Verify:** AI budgets decrease on FA signings; season-long AI wealth no longer structurally outpaces the player.

### 3.4 AI-to-AI transfers ignore buyout + roster cap — ✅ DONE (Pass 8) [MEDIUM]
- **Problem:** `transfer-market.ts:236-278` fees are `skill*2000` (real `buyout` never consulted), and the `<= 5` cap is only checked at filter time, not before `push` (`:257`).
- **Steps:** Base fee on the seller's contract `buyout`; re-assert `buyer.rosterIds.length < MAX_ROSTER_SIZE` immediately before the push.
- **Verify:** AI↔AI fees track buyouts; no AI roster exceeds the cap.

### 3.5 Non-deterministic fallback RNGs [MEDIUM — determinism]
- **Problem:** `aiRoll`/`AIManager.fallbackRng`/`nextRandom` fall back to `new SeededRNG(generateSeed())` (wall-clock seed) when no rng is threaded (`rng-helpers.ts:18`, `ai-manager.ts:39`, `helpers.ts:23`). Save-replay/rollback can diverge.
- **Steps:** Make the `rng` param required, or derive the fallback deterministically from `save.lastRngSeed + save.currentWeek`; dev-assert when the fallback path is hit.
- **Verify:** Two identical saves processed twice produce identical results.

### 3.6 Transfers page fee mismatch + dead `weeksOnTransferList` [LOW]
- **Problem:** Transfers table gates BUY on `ovr*1000*(1+potential/100)` but the NegotiationModal demands `evaluatePlayer().transferValue` (`app/transfers/page.tsx:141-155` vs `NegotiationModal.tsx:170-175`) — button can be enabled yet every offer rejected. `weeksOnTransferList` (`transfer-market.ts:81,265`) is set but never read (implied listing-decay never wired).
- **Steps:** Drive the table's fee/affordability from `evaluatePlayer(player).transferValue`. Implement listing aging/price-decay or remove the field.

---

## Phase 4 — Determinism & save hygiene (MEDIUM)

### 4.1 `nextDeterministicId` perturbs the week RNG stream [MEDIUM]
- **Problem:** The "deterministic" ID embeds an RNG draw (`helpers.ts:33-47`, duplicated at `game-store.ts:123-137`), advancing `lastRngSeed`. Used by pre-tick mutations (level-ups, weekly/scheduled activities, auto-registration). Adding/removing one pre-tick event shifts the whole week's RNG; IDs aren't idempotent. _(The cosmetic-toast offender was fixed in Phase 0.)_
- **Steps:** Make these IDs content-addressed (`${prefix}_${week}_${stableKey}`, no RNG draw); de-duplicate the two helper copies.
- **Verify:** Re-running a pre-tick phase yields identical IDs; adding an event doesn't change downstream match outcomes.

### 4.2 `scheduledActivities` grows unbounded — ✅ DONE (Pass 5) [HIGH — save bloat]
- **Problem:** `processRestDays` (`training-processor.ts:151-204`) pushes up to 7 REST entries/week; not in `ARRAY_CAPS`, `array-pruning`, or `save-compactor` (~364 dead entries/year; scanned every tick by FPL + fanbase processors).
- **Steps:** Add `scheduledActivities` to `compactPersistentState` (drop `week < currentWeek - N`, keep ~8 weeks) and/or stop persisting auto-generated REST days (recomputable). Add `ARRAY_CAPS.scheduledActivities`.
- **Verify:** Save size stays flat over many simulated seasons; rest-day energy bonuses still apply.

### 4.3 `acknowledgedEventIds` grows unbounded — ✅ ALREADY HANDLED [LOW]
_The compactor (`engine/processors/save-compactor.ts:67-70`) already filters `acknowledgedEventIds` down to IDs still present in `eventsLog` every tick, so it's bounded. No further action needed._
- **Problem:** Not capped anywhere (`array-pruning.ts`, `ARRAY_CAPS`).
- **Steps:** Prune to event IDs still present in `eventsLog` (or cap to a multiple of the `eventsLog` cap) — carefully, so acknowledged events don't reappear.
- **Verify:** Long-campaign save size bounded; previously-read events stay read.

---

## Phase 5 — Player progression completeness (MEDIUM)

### 5.1 Scouting fuzzing is dead / leaks true OVR — ✅ DONE (Pass 6) [HIGH]
- **Problem:** `engine/scouting-system.ts` (tiered ±accuracy fuzzing) is imported by **no** non-test file. The live UI fuzzes inline at `app/scouting/page.tsx:803-808` with `min = ovr-15; max = ovr+15` — band centered on the true value (midpoint reveals true OVR) and ignores scout level.
- **Steps:** Wire `getVisibleStats`/`fuzzyBand` from `scouting-system.ts` (offset band that scales with `getScoutingLevel()`) into the scouting page; or delete the dead module and fix the inline fuzz to be offset + level-scaled.
- **Verify:** Unscouted OVR can't be reverse-engineered from the midpoint; higher scout level narrows the band.

### 5.2 Dead progression features — implement or remove [MEDIUM]
- **`unlockSkill`/`perks`/`availableSkillPoints`** (`player-development-slice.ts:102-114`): currency accumulated, never spent or read by the sim. → Wire a perks UI + have the match engine read `perks`, or remove.
- **Coach `coach_master` "The Visionary"** (`talent-trees.ts:51-55`): "+2 random stat weekly" never implemented. → Add a weekly pass for teams whose coach holds it, or remove.
- **`AcademyEngine.processWeeklyDevelopment`** (`academy-engine.ts:150-202`) + `TRAINING_FOCUS_STATS`/`_XP_MULTIPLIER`: dead; logic reimplemented (and drifted) in `processAcademyWeek`. → Delete or unify.
- **`analyst_demo`/`xp_gain`** (`talent-trees.ts:66-69`): wired to **manager** XP, not player/post-match XP as described. → Reword or also apply to player XP.
- **`AcademyApp.tsx:165-166`** auto-enroll branch: unreachable (scouting is async now). → Remove the `&& result.player` branch.

---

## Phase 6 — UI correctness & leaks (MEDIUM/LOW)

### 6.1 `AdvancementAnimation` re-fires confetti + victory sound — ✅ DONE (Pass 6) [HIGH on the result screen]
- **Problem:** Effect deps include `onComplete` (`AdvancementAnimation.tsx:74`), and the caller passes an inline arrow (`app/match/[id]/result/page.tsx:1002`) with fresh identity each render. Any re-render while `show` is true tears down + recreates the timers, resetting `phase` and re-triggering `fireConfetti`/`soundManager.play("victory")`.
- **Steps:** `useCallback` the caller's `onComplete`, or store it in a ref inside the component and drop it from the dep array (`[show, isChampionship]`).
- **Verify:** Confetti/sound fire once; animation doesn't restart on store ticks/hover.

### 6.2 `Player3DPortrait` Three.js materials never disposed — ✅ DONE (Pass 10) [MEDIUM — GPU leak]
- **Problem:** ~11 `new THREE.MeshStandardMaterial` built in `useMemo` and passed via `material={...}` (`Player3DPortrait.tsx:37-76`) — R3F doesn't auto-dispose manually-constructed materials. Rendered in `PlayerCard`/player lists; leaks WebGL memory over a browsing session.
- **Steps:** Add a cleanup effect disposing each material on unmount/recompute, or switch to declarative `<meshStandardMaterial>` children.
- **Verify:** WebGL memory stable after mounting/unmounting many portraits.

### 6.3–6.7 Lower-severity UI [MEDIUM/LOW]
- **`search-filter.tsx:75`** — `onFilter` called in `useMemo` (render phase) → potential infinite loop if adopted. Convert to `useEffect` (or delete — it's a dead component). [MEDIUM]
- **`player-stat-meter.tsx:15,21`** — `value/max` with no `max>0` guard and `value.toFixed` on possibly-undefined → NaN/crash. Guard both (dead component today). [MEDIUM]
- **`SynergyChart.tsx:22-27`** — `getAvg` sums `p[k]` with no nullish guard → `NaN` SVG coords if a stat is missing. Use `Number(p[k]) || 0`. [LOW]
- **`AcademyApp.tsx:1045,1057`** — index-as-key on a reversed/sliced list → animation/state attaches to wrong row. Key by `report.week`/id. [LOW]
- **`LiveMatchControlBar.tsx:131-142`** — speed is increment-only (stuck at 5×). Add a decrement / cycle. [LOW]
- **`result/page.tsx:446`** — BO1 reads `result.maps[0].finalScore` with no empty guard. Add `&& result.maps.length > 0`. [LOW]
- **`stats/page.tsx:79`** — unmemoized `teamPlayers` filter feeds dependent memos → recompute every render. `useMemo` it. [LOW]

---

## Phase 7 — Dead-code & perf cleanup (LOW — reduces future risk)

### 7.1 Dead store index subsystem [HIGH value as perf, LOW risk]
- **Problem:** `_teamIndex`/`_playerIndex`/`_contractByPlayerIndex`/`_staffIndex` are rebuilt at 7 sites (hydrate/load/new-game/**every tick**) but the only `.get()` references are in **comments** — zero real readers (the 44633bc fix removed reads, kept builds). `ARCHITECTURE.md:432-437` falsely claims they're live.
- **Steps:** Delete the 4 Maps from `GameStoreState`/`indexes.ts`, drop the 7 `buildEntityIndexes` calls + the unused `get*ById` helpers, update `ARCHITECTURE.md`. Keep `_completedMatchIds` (1 real reader at `game-store.ts:1976`) — and `.add(match.id)` at its two push sites (`game-store.ts:242`, `match-simulation-slice.ts:279`) so it doesn't go stale.
- **Verify:** `tsc` + full tests pass; week-tick allocates 4 fewer full-array Maps.

### 7.2 Dead modules / components [LOW]
- Engine: `scouting-system.ts` (if not wired per 5.1), `processWeeklyDevelopment`, `simulateWeeklyRegistrations` V1, `EconomyManager.getPlayerBuy` V1, `saveGameCheckpoint`/`rollback`.
- Components (zero importers): `virtualized-list.tsx`, `search-filter.tsx`, `SocialFeed.tsx`, `player-radar-chart.tsx` (only re-exported), `player-stat-meter.tsx`.
- **Steps:** Delete, or wire up the ones that represent intended features (see 5.x, 7.3).
- **Verify:** `tsc` + grep confirm no importers; bundle shrinks.

### 7.3 `MarketApp` incomplete [LOW — incomplete feature]
- **Problem:** `startScoutingMission`/`activeScoutingMission` destructured but unused (`MarketApp.tsx:67-68`); `activeTab` type includes `"watchlist"` but there's no watchlist tab UI; `MailApp.tsx:165` computes `selectedEvent` but never renders a detail pane.
- **Steps:** Implement the watchlist tab + scouting-from-market action and the mail detail pane, or remove the dead state.

### 7.4 Keyboard remapping placeholder [LOW — incomplete feature]
- **Problem:** `app/settings/page.tsx:726` — "Shortcut remapping is planned… rebind via Steam Input." Controls card is read-only.
- **Steps:** Implement remapping persisted to settings (the in-app shortcut system already exists in `lib/keyboard-shortcuts.ts`), or leave as documented-future.

---

## Phase 8 — Lock it in with tests

Add regression tests for each Phase 0 fix and before each Phase 1–3 change:
- Toast IDs don't change `lastRngSeed`; renew/promote contract math; AI never touches the player roster; FPL marker advances on rollover; circuit points awarded once; Swiss BYE survives a tick; circuit decay at season end; AI valuation sanity; worker saves zero times.
- Run order each phase: `npx tsc --noEmit` → `npx jest` → targeted manual check in `npm run dev`.

---

## Suggested execution order (by ROI / risk)

1. **Phase 1.1** (worker persistence) — highest data-loss risk.
2. **Phase 2.1–2.3** (Swiss clobber, circuit double-award, decay) — competition integrity.
3. **Phase 3.1–3.2** (AI valuation exploit, manager wages) — economy integrity + a headline feature.
4. **Phase 4.2** (scheduledActivities bloat) + **Phase 7.1** (dead indexes) — save/perf hygiene.
5. **Phase 5.1** (scouting leak) + **Phase 6.1** (confetti re-fire) — visible correctness.
6. Remaining MEDIUM/LOW as polish, each behind a test.
