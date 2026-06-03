# Esports Simulator — Deep Audit Report

_Generated from a multi-area audit pass (engine, store, save system, tournaments, pages, components)._

This report consolidates findings from a sweep across the major subsystems. Each
finding cites `file:line`, a severity, the impact, and a concrete fix. Items
marked **✅ FIXED** were addressed in this pass; everything else is **OUTSTANDING**
and prioritized at the end.

---

## 0. Tooling baseline (all green before & after this pass)

| Check | Result |
|-------|--------|
| `tsc --noEmit` | **0 errors** |
| `jest` | **901 passed / 74 suites** |
| `next lint` | **0 errors** (166 warnings — mostly unused vars / `no-console` / unescaped entities) |

The codebase is genuinely well-maintained: the simulation core has solid NaN
guards, length checks, deterministic seeding, and the live-match React layer has
proper timer/mounted-ref cleanup. The bugs below are almost all **semantic** (logic,
determinism, persistence ordering) — the kind tooling can't catch — plus a set of
**half-wired / dead features**.

---

## 1. Fixed in this pass ✅

| # | Severity | Area | What | File |
|---|----------|------|------|------|
| 1 | **HIGH** | Determinism | Toast IDs were drawn from the deterministic game RNG (`nextDeterministicId` → advances `lastRngSeed`), so the number of cosmetic toasts a player triggered between week-ticks shifted the next week's match/transfer results. Now uses a non-RNG monotonic counter. | `store/slices/ui-slice.ts` |
| 2 | **MEDIUM** | Incomplete feature | Equipment page computed `bonuses`, `completeness`, `avgTier` but **rendered none of them**. Added a "Loadout Performance Summary" panel (completeness bar, average tier, active stat bonuses). | `app/equipment/page.tsx` |
| 3 | **LOW** | Perf | `markAllEventsAsRead` did `O(events × acknowledged)` `.includes` in a loop. Now uses a `Set`. | `store/slices/events-slice.ts` |
| 4 | **LOW** | Correctness | `signSponsor` removed the signed offer by the original (possibly-undefined) `sponsor.id`. Now falls back to name+tier when id is absent. | `store/slices/team-facilities-slice.ts` |
| 5 | **LOW** | Cleanup | Removed orphaned `equipmentStatus` memo (computed, never used). | `app/equipment/page.tsx` |

---

## 2. Tournament / Circuit / League (OUTSTANDING)

### [HIGH — edge case] Circuit points can be awarded twice for a tournament completed inside `processTournaments`
- **Files:** `engine/atomic-week-processor.ts:1312-1328` (award path A) and `engine/processors/standings-processor.ts:205-232` (award path B); `engine/processors/circuit-points-awarder.ts` never sets `rewardsGranted`.
- **What:** Two independent code paths award circuit points. Path B (`updateStandings`) is the single source of truth — it's gated by `!rewardsGranted` and sets it at `:272`. Path A (the loop in `processTournaments`) is gated by `!rewardsGranted` but **does not set it**.
- **Nuance (verified):** The week-tick order is `processTournaments` (step 5) → `processMatches` (step 6) → `updateStandings` (step 7). In the *normal* path the final is played in step 6, so when Path A runs (step 5) the tournament isn't `isCompleted` yet → Path A is skipped, and only Path B awards. The double-award only fires when a tournament is marked complete **inside** `processTournaments` itself (via the `repairTournamentProgression` pass at `:1288`, which can set `isCompleted` at `tournament-manager.ts:190`) — then Path A and Path B both run in the same tick.
- **Why it matters:** When it does trigger, that tournament's circuit points are doubled for every placed team, corrupting the circuit-points leaderboard and POINTS-gated tournament eligibility. Prizes/trophies are separately deduped and are safe.
- **Fix:** Delete the duplicate award loop in `atomic-week-processor.ts:1312-1328` and let `standings-processor` be the sole awarder (it already covers a superset — every `isCompleted` tournament, league/swiss/bracket alike — and is idempotent via `rewardsGranted`). Add a regression test that ticks a tournament to completion and asserts points are awarded exactly once.

### [HIGH] `double_elim` tournaments run as single-elimination
- **File:** `engine/tournament-manager.ts:259-262` routes both `"double_elim"` and `"bracket"` to `setupGenericBracket`.
- **What:** The real double-elim machinery (`createDoubleElimGroup`, `engine/tournament/double-elim-handlers.ts`, `checkAndStartPlayoffs`/`generatePlayoffs`) is **dead code** — `tournament.groups` is never populated, so a team that loses one match is eliminated with no lower bracket. `data/tournaments.json:246` defines a `"double_elim"` event, and the Lower-Bracket UI panel (`app/tournaments/[id]/page.tsx:1346-1368`) always renders empty.
- **Fix:** Either implement a real double-elim entry that builds the bracket and sets `tournament.groups`, then route `"double_elim"` to it; or (smaller) reclassify the calendar entry to `"bracket"` and delete the dead handlers so the format isn't falsely advertised.

### [HIGH] Per-tick standings recompute clobbers Swiss standings (BYE wins erased)
- **Files:** `engine/processors/standings-processor.ts:74-124` vs `engine/tournament/swiss-handlers.ts:130-192`.
- **What:** `recomputeStandings` runs every tick and rebuilds `wins/losses/mapDiff/roundDiff` purely from `save.completedMatches`. Swiss maintains these incrementally and awards BYE wins that have **no** completed match (`swiss-handlers.ts:131-140`). The recompute sets `wins = teamMatches.filter(win).length`, erasing the BYE win on the next tick.
- **Why it matters:** Swiss advance/elim thresholds are `wins === 3` / `losses >= 3`; a team that advanced via a BYE can have its win silently removed, corrupting who qualifies.
- **Fix:** Skip Swiss-format tournaments in `recomputeStandings` (they have a single owner in `handleSwissResult`), or record BYEs as synthetic completed matches so the recompute stays consistent.

### [HIGH] Circuit points never decay across seasons
- **File:** `engine/tournament-qualification.ts:124-130` — `applySeasonalDecay` has **zero callers**.
- **What:** Points accumulate unbounded; season rollover (`atomic-week-processor.ts:320-323` / `LeagueEngine.processSeasonEnd`) never resets or decays them.
- **Fix:** Call `save.circuitPoints = CircuitPointsManager.applySeasonalDecay(save.circuitPoints)` in the season-end branch. (Add a test — this path is currently untested.)

### [HIGH] Self-match can deadlock a bracket slot
- **Files:** `engine/tournament/bracket-scheduling.ts:59-63`; progression `engine/tournament-manager.ts:922-936`.
- **What:** `scheduleBracketMatch` silently returns (warn only) when `homeTeamId === awayTeamId`. If progression ever assigns the same team to both slots, the match is never scheduled/completed and the bracket stalls — never marking the tournament complete through the bracket path.
- **Fix:** On a self-match, auto-complete it (award the lone team the win + call progression), mirroring the repair logic at `tournament-manager.ts:169-177`.

### [MEDIUM] UI standings/placements diverge from the engine's authoritative ordering
- **Files:** `app/tournaments/[id]/page.tsx:871-886` (duplicate "3rd"/"5th" placements), `:1226`/`:745`/`:896` (sort by points/wins only, ignoring head-to-head & map/round diff); `app/rankings/page.tsx:360-364` & `app/tournaments/page.tsx:107-111` (rank by Elo only, no tiebreaker).
- **What:** The UI recomputes its own standings/placements instead of rendering `tournament.standings` (sorted by the engine's `compareStandings`) / `team.worldRanking`. Result: the "Final Standings" table can show two teams both labeled 3rd and prize shares that disagree with the actual ledger.
- **Fix:** Render from the engine-sorted `displayTournament.standings` and `TournamentManager.calculatePlacements(...)`; reuse `team.worldRanking` for rank.

### [MEDIUM] `refreshWorldRankings` re-sorts all teams after **every** Elo update
- **File:** `engine/league-engine.ts:268` (inside `updateEloAfterMatch`).
- **What:** Full `O(n log n)` re-sort per match — hundreds of times per simulated week.
- **Fix:** Refresh once per tick after all matches.

### [LOW] Hardcoded "Season 1" in the tournaments hub header
- **File:** `app/tournaments/page.tsx:552` — prints `Season 1` regardless of `currentWeek`. Use `LeagueEngine.getCurrentSeason(currentWeek)`.

### [MEDIUM] Dead duplicate AI-registration path
- **File:** `engine/tournament-manager.ts:1236-1312` (`simulateWeeklyRegistrations` V1) is dead; only V2 (`:1385`) is called. Delete V1. Optionally filter V2 candidates to teams with ≥5 players so AI can't register only to forfeit.

---

## 3. Save System & Week Processing (OUTSTANDING)

### [HIGH] Worker `SaveManager` overrides methods that don't exist → the atomic/resume state machine is dead, and the worker writes to a different store
- **File:** `engine/worker/week-processor.worker.ts:21-42`.
- **What:** `WorkerSaveManager` overrides `saveTransaction`/`clearTransaction`/`saveCheckpoint` — none of which exist on `SaveManager` — so the real `beginWeekTick`/`markStepComplete`/`recordMatchComplete`/`saveGame` all run inside the worker. In a Worker `typeof window === "undefined"`, so the storage adapter picks `IndexedDBAdapter`: the worker opens its **own** `EsportsSimDB` and (in Electron) bypasses the disk-backed `electron-store` the main thread uses. The resume ladder is write-only (never read, since `getIncompleteTransaction` → null).
- **Fix:** Make the worker compute-only (in-memory/no-op storage), delete the phantom overrides, and let the **main thread** own the single durable `saveGame`.

### [HIGH] Post-tick main-thread mutations are never persisted
- **File:** `store/game-store.ts:2073-2208`.
- **What:** After the worker returns, the main thread runs `pruneGameState`, `recalculateAllSynergy`, `processAcademyWeek` (which deducts `team.budget` and pushes academy match history), index rebuild, and achievements — but there is **no** `saveGame` afterward. The only durable write of the new week is the one **inside** the worker, which predates all of these. A crash/quit before the next 60s autosave loses them, and the on-disk save is internally inconsistent (e.g., academy budget spent on-screen, intact on disk). The persisted `lastRngSeed` can also lag the in-memory one → determinism break on reload.
- **Fix:** Don't save inside the worker; add one authoritative `await saveManager.saveGame(get())` after the post-tick block.

### [HIGH] `scheduledActivities` grows unbounded
- **Files:** `engine/processors/training-processor.ts:151-204` (`processRestDays` pushes up to 7 REST entries/week); not pruned by `array-pruning.ts` or `save-compactor.ts`; no `ARRAY_CAPS.scheduledActivities`.
- **What:** ~364 dead activity entries/year accumulate; `fpl-week-processor` and `fanbase-growth` scan the whole array each tick.
- **Fix:** Add `scheduledActivities` to `compactPersistentState` (drop `week < currentWeek - N`) and/or stop persisting auto-generated REST days (they're recomputable). Add `ARRAY_CAPS.scheduledActivities`.

### [MEDIUM] `processFinance` is not dedup-guarded (latent double-charge)
- **File:** `engine/processors/finance-processor.ts:54-197`.
- **What:** Pushes deterministic-ID ledger entries (`exp_wage_…`, `inc_spon_…`, …) with **no** existence check, unlike every other processor (which take a `ledgerIdSet`). Harmless only because resume is currently disabled; the moment any replay feeds a week twice, wages are charged twice and balance reconciliation (`integrity-checker.ts:123-142`) breaks.
- **Fix:** Thread `ledgerIdSet` into `processFinance` and guard each push.

### [MEDIUM] `nextDeterministicId` embeds an RNG draw — not idempotent, perturbs the week RNG stream
- **Files:** `store/utils/helpers.ts:33-47` (duplicated at `store/game-store.ts:123-137`).
- **What:** Despite the name, the ID = `${prefix}_${week}_${rngToken}`; generating one advances `lastRngSeed`. Used by pre-tick mutations (level-up events, weekly/scheduled activities, auto-registration) which run on the snapshot before the worker derives the week's `rng` from `preTickRng.getState()`. Adding/removing one pre-tick event shifts the entire week's RNG stream, and re-running a phase yields different IDs (dedup-by-ID can't catch a re-applied event). _(The cosmetic-toast instance of this was fixed in §1.)_
- **Fix:** Make these IDs content-addressed (`${prefix}_${week}_${stableKey}`, no RNG draw). De-duplicate the two helper copies.

### [MEDIUM] Dead/loaded-gun save paths
- `saveGameCheckpoint` (`save-manager.ts:413-431`) rewrites `updatedAt` without recomputing the integrity hash → would fail `verifyIntegrityHash` on load. Harmless **only** because it has zero callers. Its doc comment is also false. **Delete it** (and the stale comment), or recompute the hash.
- `rollback`/`rollbackTransaction` (`save-manager.ts:999-1017`) restores from the legacy non-numbered backup key that `saveGame` no longer writes (it writes `_1/_2/_3`). Dead. Delete or fix.

### [LOW] Cloud-conflict promotion isn't atomic
- **File:** `engine/save-manager.ts:575-581` — writes backup then primary as two unstaged writes (doesn't use the tmp-stage+verify protocol the rest of the file uses). Route through the same atomic path.

### ✅ Verified-good (no action)
Migration chain v0→v7 is complete and gap-free (`CURRENT_SAVE_VERSION = 7`); forward-version saves are rejected pre-migration; no `Date`/`Map`/`Set`/`undefined` round-trip loss in the save envelope; RNG seed is persisted; autosave correctly skips during the tick (`useAutoSave.ts:48`) and `advanceWeek` rolls back cleanly on worker failure (operates on a detached `structuredClone`).

---

## 4. Store / State (OUTSTANDING)

### [HIGH] Dead entity-index subsystem built every tick, read nowhere
- **Files:** `store/game-store.ts` (7 `buildEntityIndexes` sites: `:1218, 1565, 1779, 2103-2104, 2206, 2426` + init `:992-996`); `store/indexes.ts:86-141`.
- **What:** The original Immer draft-propagation fix (commit 44633bc) removed all **reads** of `_teamIndex/_playerIndex/_contractByPlayerIndex/_staffIndex` but kept all **builds**. A repo-wide grep finds zero readers; the `get*ById(index, …)` helpers have no importers. Each build allocates 4 Maps over the full teams/players/contracts/staff arrays on every hydrate/load/new-game **and every week tick** — pure overhead. `ARCHITECTURE.md:432-437` still claims they're live, which will mislead the next maintainer.
- **Fix:** Delete the 4 Maps from the store + the 7 build calls + the unused `buildEntityIndexes`/`get*ById` helpers; update `ARCHITECTURE.md`. (`_completedMatchIds` has one real reader — keep or fold into the guard.)

### [MEDIUM] `_completedMatchIds` goes stale
- **Files:** push sites `store/game-store.ts:242` & `store/slices/match-simulation-slice.ts:279` don't update the Set; only hydrate/load/tick rebuild it. The `|| new Set(...)` fallback at `game-store.ts:1976` is unreachable (the Set is initialized non-falsy). Currently masked because the played match is also spliced out of `scheduledMatches`, but it's a latent false-negative for any future reader of `isMatchCompleted`.
- **Fix:** `.add(match.id)` at both push sites, or drop the Set with the other dead indexes and compute the guard from `completedMatches`.

### ✅ Verified-good (no action)
The original Immer write-through-Map class is **fully eradicated** in the slices (every mutator routes through `state.teams.find()/players.find()/…`). No infinite-re-render selectors (every object-literal selector pairs with `useShallow`). Serialization is clean (`partialize` strips all Maps/Sets/transient UI). Week-tick race & async ordering are handled.

---

## 5. Gameplay engines (assessed — mostly solid)

- **Match simulation** (`engine/match-simulation.ts`): MR12 regulation + MR3 overtime logic, side swaps, economy resets, half-time resets, tilt/momentum/clutch all verified correct. Good guards: `strengthSum === 0 → 0.5`, win-prob clamp `[0.1, 0.9]`, drawn-map seeded coin-flip, 100-round safety break. No determinism violations found (round RNG re-seeded per round). **No action.**
- **Economy engine** (`engine/economy-engine.ts`): robust `Number.isFinite` guards on balance/runway; corrupt data → `INSOLVENT` rather than silently `STABLE`. **No action.**
- **Live match** (`hooks/useLiveMatch.ts`, `lib/live-match-utils.ts`): `isMountedRef` + tracked `pendingTimers` Set cleaned on unmount; cash clamped; map/seed normalized. **No action.**

---

## 6. Incomplete / dead features (the "needs completing" list)

| Area | Finding | File |
|------|---------|------|
| Equipment summary | **✅ Completed** — bonuses/completeness/avgTier now rendered | `app/equipment/page.tsx` |
| Double elimination | Format declared in data + UI but never actually runs (see §2) | `engine/tournament-manager.ts:259` |
| Circuit-points decay | `applySeasonalDecay` implemented but never called (see §3) | `engine/tournament-qualification.ts:124` |
| Career page | `managedMatches`, `totalMatches` computed but not displayed; `hallOfFame` store value pulled but unused (only the locally-computed `hallOfFameProgress` is shown) | `app/career/page.tsx:78-94` |
| Rankings | `selectedTier`/`setSelectedTier` state declared but no filter UI wired to it (page filters via `activeTab` instead) | `app/rankings/page.tsx:324` |
| Staff page | `handleFire` (with its "released" toast) is dead — the Fire button calls `fireStaff` directly via `ConfirmDialog`, so firing never shows a toast | `app/staff/page.tsx:106-109` |
| Various pages | ~99 `assigned-but-never-used` lint warnings — several are computed values that were meant to be surfaced (e.g. `MarketApp` `startScoutingMission`/`activeScoutingMission`) | see `next lint` |

---

## 7. Recommended next steps (prioritized)

1. **Circuit points:** remove the duplicate award loop (`atomic-week-processor.ts:1312-1328`) + add a "awarded exactly once" test. *(§2, HIGH)*
2. **Worker persistence:** make the worker compute-only and add one authoritative main-thread `saveGame` after the post-tick block. *(§3, two HIGH findings — biggest correctness risk in the codebase)*
3. **Swiss standings:** exclude Swiss tournaments from `recomputeStandings` so BYE wins survive. *(§2, HIGH)*
4. **`scheduledActivities` growth:** cap it in `compactPersistentState`. *(§3, HIGH — save bloat)*
5. **Decide `double_elim`:** implement it or reclassify the calendar entry. *(§2, HIGH)*
6. **Dead-index cleanup:** delete the 4 store index Maps + 7 build sites (perf on the hot path). *(§4, HIGH)*
7. **`nextDeterministicId`:** make pre-tick game-event IDs content-addressed. *(§3, MEDIUM — determinism)*
8. **UI standings parity:** render from engine-sorted standings everywhere. *(§2, MEDIUM)*

> Items 2, 3, and 5 touch core progression/persistence and should land behind a
> focused test each before shipping — they were intentionally **not** auto-fixed in
> this pass to avoid changing game behavior without coverage.
