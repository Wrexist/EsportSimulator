# Physical approach recovery and series validation

Physical matches remain rehearsal-only. User drawings, career saves and active map selection are unchanged.

## Fix

The v11 Vertigo CT2/T4 and Sandstone CT4 recordings have supported world routes. Whole-route body reservations can reject those routes because a reserved player closes an intermediate polygon, portal or polygon center. Previously that planning rejection discarded the approach before local passing arbitration could help.

When an occupied-body route cannot be found, the main movement planner now falls back to a fully validated world route. This does not relax body resolution: every executed step still checks all live swept bodies, wall collision, speed and floor support. Passing and cover validation retain their stronger end-to-end body-clear checks. Static world-route failures still remain failures.

A regression forces reservation-only rejection, verifies the valid approach is not reported as a geometry failure, and confirms the actor still cannot pass through a live opponent. The team suite passes 35 tests. Engine v12 keeps v1-v11 recordings readable and does not allow old pending work to silently adopt new rules.

## Final-source scenario evidence

- Sandstone no-gun case: plant/defuse at 78.921875 seconds, zero route failures and zero blocked survivors (v11 had two).
- Vertigo no-gun case: zero route failures, but three players remain directly blocked by opponents. This is not counted as a clear case.
- Anubis no-gun case: plant/defuse at 71 seconds, zero route failures and zero blocked survivors (v11 had two and no plant).
- Vertigo combat A: elimination at 41.640625 seconds; B: plant/defuse at 77.765625 seconds. Both have zero route failures and zero blocked survivors. Minimum separation stays above 32 units.
- These are three movement cases and two combat cases, not a fresh all-map full-round campaign. Four of the seven recorded v11 blocked actors clear; three no-gun Vertigo opponent stand-offs remain.
- All seven active maps pass their seeded 10-second 5v5 combat-recovery fixture: actual shots and damage, smoke burst before pickup, one grenade consumed, seven additional players moving during flight, and no body overlap. Gunfire can end before pickup; this does not prove continuous incoming fire throughout recovery.
- Two mirrored synthetic BO3 series pass all 150 physical rounds, including overtime, halftime, purchase policy, JSON journal resume, duplicate result delivery, map progression and finalization. Swapped team ownership reverses winners while identical mirrored rosters produce identical physical replay hashes. Results remain career-ineligible.
- 122 focused tests in seven suites pass. Final `npm run type-check` and focused lint pass; focused lint reports no warnings. Logs: `tmp/v12-tests.log`, `tmp/v12-final-typecheck.log`, `tmp/v12-final-lint.log`.
- Production build and its week-worker startup check pass, with existing repository lint warnings. The actual bundled physical worker passes repeat-hash and settlement checks on an isolated two-player fixture under v12. Logs: `tmp/v12-build.log`, `tmp/v12-worker.log`; receipt: `tmp/spatial-round-v12-worker-check.json`. This is not packaged or browser acceptance.

Engine source fingerprint (eight simulator files): `bdbfb200f3dfd91746deb33a88de972b0006fdd56b625a2a77580ea803f2a203`.

Receipts: `docs/ui-review/map-pool/*-spatial-round-v12-reviewed-*.json`, `docs/ui-review/recovery-utility/*-spatial-round-v12-combat.json`, and `docs/ui-review/physical-career/spatial-round-v12-series-integration.json`. Full Vertigo combat traces are in `tmp/vertigo-spatial-round-v12-*-combat-trace.json`.

## Replay examples and remaining work

Team Lab now offers **Open [map] combat recovery** for each active map. It downloads the current lab setup before loading the fixture from `public/map-studio/teams/recovery-combat/`. Drawings and career data are separate.

Chrome tab discovery works, but selecting the dedicated map-review tab timed out again. Browser click-through/visual validation is not claimed. Real-map full-series campaigns, additional seeds/sites, performance and packaged Windows/Steam validation remain open. Physical matches remain rehearsal-only.

Original Mirage drawing SHA256 remains `68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8`; no user redraw is needed.

`scripts/launch/check-physical-series.ts` exercises two mirrored full BO3 series through real purchases, physical simulation, sealed replay ownership, pending-journal JSON resume, duplicate delivery, halftime resets, map progression and idempotent final settlement. Its arena and players are explicit synthetic fixtures, not real-map acceptance.

`scripts/launch/check-moving-recovery.ts --combat` retains gunfire-disabled receipts separately, requires actual gunfire and a successful screened pickup, and writes failures with traces. A death or unscreened scenario is not relabelled as a passing calibration.
