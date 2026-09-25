# Recovery support â€” 2026-09-23

Physical rehearsals use `spatial-round-v8`. Career outcomes remain `legacy-v2`; this does not enable physical career rewards or change saved careers and map drawings.

## Behavior

- Supporting attackers watch a recent reported threat near a dropped bomb. Players withdrawing under an existing save decision can also watch a recent nearby report. Turning waits for reaction time and uses the existing bounded yaw/pitch speed. Reports expire and do not become live enemy tracks.
- Turning toward a report never authorizes a shot. The player must acquire direct sight, finish the firing reaction and aim checks, and resolve the shot against geometry and the first body in its path.
- Authored smoke/flash throws can opt into `trigger: "recovery"`. They require explicit `origin` and `target` world coordinates. Existing plans retain the execute trigger by default.
- A recovery throw waits for a dropped bomb, a nominated reachable recoverer, a different living supporting attacker, and a credible observation at most two seconds old. The thrower must be stationary, grounded, unblinded, not reloading and within eight world units of the authored origin.
- Preflight simulates the same collision-tested grenade model with copied inventory. Landing and authored bounce targets must match. Smoke must intersect the reported threat-to-pickup sightline. Flash must reach the reported threat area without significant exposure to living allies at their current positions.
- Only the live flight consumes equipment. A release reserves its player for that tick; another authored grenade and gunfire wait through a 32-tick utility interval. Failed support checks preserve inventory and leave a reason in `utility-held`.
- Team Lab exposes each existing throw's trigger and marker A/B bindings for release/landing. Angles, power and bounce targets remain in the exported scenario. No unverified lineups are generated or silently assigned.
- v1â€“v7 recordings remain readable; pending old-engine rounds cannot silently resolve under v8 rules. Private cover-angle events stay private to that team.

## Implementation

`engine/spatial/recovery-support.ts` contains the evidence selector and bounded trajectory preflight. `team-simulation.ts` handles reaction, integration and equipment timing. `utility.ts` validates and preserves optional authored fields; `team-view.ts` filters the new event; `round-replay.ts` versions the behavior. `components/maps/TeamLab.tsx` provides the authoring controls.

Regression tests cover radio-before-turn-before-sight-before-shot order, deterministic actor ordering, smoke screening, landing mismatch, wrong release point, blocked release, empty stock, friendly flash exposure, trigger/coordinate validation, scenario round trips, exactly one smoke consumed, held utility outside recovery, separate grenade release ticks, and old replay ownership/version safety.

## Limits and next work

This is evidence-aware covering aim and authored utility support, not suppression, tactical intelligence equivalent to CS2, or verified real-world lineups. Guard positions are still reachable perimeter samples; they are not ranked for protection from enemy angles. Withdrawal uses the existing save route rather than a new cover-to-cover retreat planner. Flash safety uses current friendly positions, not predicted future facing or movement. The recoverer does not wait for a smoke's detonation, and support players do not automatically travel to remote lineup origins.

Next: coordinate smoke arrival with the pickup, score collision-checked cover/withdrawal positions, and build reviewed utility/recovery scenarios on additional maps. Wider geometry validation, performance measurement, career UI/resume checks, and packaged Windows/Steam testing remain open. No new drawing or user input is required for the next engineering step.

## Validation

- Typecheck, targeted lint, production build and bundled worker startup passed. Existing unrelated build warnings remain.
- Final full suite: 1,769 tests passed and one wall-time test failed at 8.09Ã— while build/campaign work overlapped. That unchanged test passed separately at 1.54Ã— against the 8Ã— limit. Total coverage: 187 suites / 1,770 tests, with the timing rerun recorded separately in `tmp/recovery-v8-performance-recheck.log`.
- The latest user drawing is unchanged: SHA256 `68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8`.
- No new browser click-through, packaged Windows or Steam installation test was performed.

The completed full-round campaign report is `docs/ui-review/physical-career/mirage-spatial-round-v8-full-rounds-extended.json`. Its recorded simulator-source hash matches the final source files. Its Mirage fixture contains no authored grenade plans; trajectory gates are covered by controlled regression scenarios, not claimed as calibrated map lineups. Full-round fixtures are provisional and are not geometry or balance certification.


| Scenario | Outcome | Recoveries | Plants / defuses | Resolution |
|---|---|---:|---:|---:|
| Combat 4326170 | T elimination | 2 | 0 / 0 | 61.30 s |
| Combat 4326171 | CT defuse | 0 | 1 / 1 | 106.09 s |
| Combat 4326172 | CT elimination | 2 | 0 / 0 | 64.67 s |
| Combat 4326173 | CT defuse | 2 | 1 / 1 | 105.16 s |
| Combat 4326174 | CT timeout | 0 | 0 / 0 | 115.00 s |
| Combat 4326175 | T explosion | 0 | 1 / 0 | 87.36 s |
| No-gun 4326170 | CT defuse | 0 | 1 / 1 | 53.50 s |

Minimum swept separation across all seven cases: **32.03524 world units**, against the 32-unit body separation requirement. The original three combat cases and no-gun case preserve their v7 outcomes. Two cover-angle events occurred across the six combat seeds; no authored utility was present in this campaign.

The expanded campaign exposed an additional unresolved movement case: seed **4326174** times out with T1 and carrier T2 marked `blocked` near world positions (-882, 203, -167) and (-895, 173, -168). T4 remains nearby in support. The report records endpoint-clearance failures; it does not yet establish whether world clearance, body occupancy, or retry ownership is the cause. Trace that case before changing collision rules. This is the next priority ahead of broader map certification.

Reproduce: `npx tsx scripts/launch/calibrate-mirage-teams.ts --full --extended`. The report includes fixture, mesh, simulator-source and per-result hashes. Build log: `tmp/recovery-v8-build.log`; full test log: `tmp/recovery-v8-all-tests-final.log`; timing rerun: `tmp/recovery-v8-performance-recheck.log`.
