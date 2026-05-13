# Steam Release Hardening Plan

## Phase 0 - Freeze and Guardrails (Day 0-1)
- Freeze feature scope for release branch.
- Require green checks for typecheck/build/smoke before merge.
- Enable deterministic simulation mode by default for progression-critical systems.
- Add branch protection for `main` and release tags.

Definition of done:
- No direct pushes to release branch.
- CI blocks failing type/build checks.

## Phase 1 - Save/Load and Transaction Safety (Day 1-3)
- Enforce strict week-transaction schema validation on resume.
- Keep atomic week-step flags authoritative and resumable.
- Compact persistent logs with hard caps.
- Validate acknowledged IDs against existing event IDs.
- Ensure "New Game" only deletes save-domain keys, never global storage.

Definition of done:
- Crash/reload during weekly tick never duplicates rewards or skips steps.
- Invalid/incompatible week transactions are safely discarded.

## Phase 2 - Determinism and Anti-Reroll (Day 2-5)
- Remove `Math.random`/`Date.now` from progression-critical code paths.
- Route academy, scouting, aging, bracket progression, and match continuation through persisted seeded RNG.
- Replace time-based IDs in core flows with deterministic RNG-backed IDs.
- Ensure missing match seeds are repaired deterministically.

Definition of done:
- Reloading the same save state reproduces identical weekly outcomes.
- Tournament/match continuation does not diverge after save/load.

## Phase 3 - Economy and Exploit Controls (Day 4-7)
- Add double-entry ledger assertions (`sum(income-expense) == budget delta`).
- Add one-time grant guards for sponsor bonuses and event payouts.
- Add hard validation for transfer fee bounds, contract bounds, and negative budgets.
- Add bankruptcy recovery lane (emergency sponsor/loan + constrained operations).

Definition of done:
- No money duplication by reload/timing/alt+F4.
- No save-softlock from unrecoverable debt.

## Phase 4 - Tournament and AI Integrity (Day 6-9)
- Validate bracket transitions for every format (BO1/BO3/BO5, swiss, double-elim).
- Add invariant checks: no missing teams, no duplicate advancement, no orphan matches.
- Add AI sanity constraints for roster size, wage viability, and transfer offers.

Definition of done:
- 0 broken brackets in 10,000 simulated seasons.
- AI teams remain valid and solvent under long-run simulation.

## Phase 5 - Steam and Anti-Cheat (Day 8-11)
- Lock achievement unlocks to validated in-sim conditions only.
- Add save integrity checks to achievement-critical milestones.
- Add tamper flags and opt-out from leaderboard/achievement writes when integrity fails.
- Handle Steam Cloud conflicts deterministically (newest valid save + backup preservation).

Definition of done:
- No achievement unlock from raw save edits.
- Cloud conflicts never destroy both versions.

## Phase 6 - Performance and Long-Run Stability (Day 10-13)
- Add 100+ hour soak tests with periodic autosave/load.
- Track memory growth, tick duration, save size growth, and UI render cost.
- Add late-game data virtualization for large tables/lists.

Definition of done:
- Stable memory profile over long sessions.
- Week advancement time remains within target on Steam Deck-tier hardware.

## Phase 7 - Release Gate (Day 13-14)
- Run full pre-release destructive test matrix.
- Verify save migration across at least 2 prior versions.
- Lock release candidate and produce rollback build.

Definition of done:
- All critical/high tests pass.
- RC build signed and reproducible.

## Mandatory Test Matrix
- Crash mid-week at each transaction step -> reload -> exact-once outcomes.
- Alt+F4 during transfer/contract/economy actions -> no duplication/loss.
- Save-edit attempts on money/ratings/achievements -> integrity handling works.
- 500-week simulation fuzz -> no NaN, no orphan matches, no negative impossible states.
- Steam Deck perf pass -> acceptable frame/tick/save-load budgets.

## Current Status (Applied)
- Deterministic RNG hardening across core store/academy/scouting/player-lifecycle/tournament paths.
- Date-based seed fallbacks removed from progression-critical match/tournament flows.
- Additional save and transaction safeguards from prior hardening pass remain in place.
