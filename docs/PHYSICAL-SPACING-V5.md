# Squad spacing and doorway movement — 2026-09-23

Physical rehearsals now use `spatial-round-v5`. Normal career matches remain on `legacy-v2`; this change does not activate physical career settlement or rewards.

## Implementation

- Support players use the entry player's upcoming checked path direction when deciding whether they are ahead or behind. A straight vector toward the distant bombsite was misleading around bends and could send support players back into the approaching entry.
- A support already ahead clears the approach toward the objective, or uses an existing collision-checked side yield when space permits. A support behind follows a world-validated path that stops at least 72 path units before the entry's position.
- Following-route retries no longer treat their own occupied destination (the entry player) as an unreachable solid endpoint. The complete world route must pass navigation and movement checks before it is shortened. Every executed step still uses swept body, wall, flight-corridor and speed checks.
- Shortened paths do not stop midway through a jump or ladder segment. This is conservative following, not general-purpose crowd pathfinding or permission to walk through teammates.
- Existing engine-version guards require a fresh rehearsal for v5. v1–v4 recordings remain readable; compatibility tests explicitly cover v3/v4 recordings, saved cursors and rejected old pending work.

Files: `engine/spatial/team-simulation.ts`, `engine/spatial/round-replay.ts`, `__tests__/spatial-teams.test.ts`, `__tests__/physical-career-loadouts.test.ts`, and `scripts/launch/calibrate-mirage-teams.ts`.

## Evidence

The new doorway regression has two rooms joined by a 48-unit-wide navigation passage, physical walls, a support ahead of entry and another behind. All three attackers pass the doorway. No sampled body intersects a wall; swept separation stays at least 32 units. Repeating the scenario produces identical output.

Same short Mirage fixture and seed 4326170:

| Metric | v4 | v5 |
|---|---:|---:|
| Blocked movement ticks | 866 | 395 |
| Damage | 442 | 666 |
| Shots | 86 | 132 |

These are simulation counters, not frame rate or guaranteed win-rate improvements.

Full-duration campaign: 115-second round clock, 40-second bomb timer, 3.2-second plant, 10-second defuse, and a 160-second observation horizon. Three combat seeds all resolve by elimination before the clock expires:

| Seed | Winner | Eliminations | Resolution time | Blocked movement ticks |
|---|---|---:|---:|---:|
| 4326170 | T | 8 | 60.64 s | 395 |
| 4326171 | CT | 6 | 71.78 s | 538 |
| 4326172 | CT | 8 | 64.17 s | 525 |

None of these three combat runs plants the bomb. A preserved v4 comparison on seed 4326170 instead planted and ended in a CT defuse. Changing movement changes engagements and outcomes; this campaign does not prove economy, map or weapon balance.

Reports: `docs/ui-review/physical-career/mirage-spatial-round-v5-full-rounds.json`, `mirage-spatial-round-v4-baseline-full-rounds.json`, and `5v5-integration-spatial-round-v5.json`. Run the current campaign with `npx tsx scripts/launch/calibrate-mirage-teams.ts --full`.

## Verification and limits

- **186 suites / 1,755 tests passed** (`tmp/spacing-v5-all-tests.log`).
- Typecheck and targeted engine lint passed. A temporary baseline source copy initially entered the TypeScript program with invalid relative imports; it was renamed to a text backup and typecheck rerun successfully.
- Clean production build and bundled worker startup passed (`tmp/spacing-v5-build.log`). The first build failed on a missing generated chunk; after stopping the preview server, the clean retry passed. Existing unrelated lint warnings remain.
- No new browser click-through, packaged Windows or Steam installation test in this pass.
- Latest Mirage drawing remains unchanged (SHA256 `68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8`). The campaign uses the existing provisional lab fixture; it is not certification of that drawing.

Endpoint-clearance failures still occur. The no-gun stress run timed out without a plant, with T1/T2/T4 held near the B approach, while live defenders remained physical obstacles and the tactical planner still reacted to sightings. This is an unresolved objective-congestion case, not a passing plant/defuse test. All four runs maintained at least 32.01265 units of swept body separation. Head-on passing, bomb recovery, post-plant positioning and all-map calibration remain open. No new drawing is needed from the user for this engineering work.
