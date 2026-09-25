# Recovery route ownership — 2026-09-23

Physical rehearsals now use `spatial-round-v7`. Normal career results remain `legacy-v2`, and physical career rewards remain disabled.

## Diagnosis and fix

Mirage seed 4326172 did not stall because the recovery player was under fire. The saved v6 trace shows T4 with no contacts and a full magazine, stopped about 85 units from the dropped bomb. Its existing following destination was only about 10 units from the bomb. The destination-change threshold was 24 units, so recovery reused a following path deliberately shortened by 72 path units. That exhausted path remained nonempty, preventing a fresh route.

Routes now track their task: following a specific teammate, recovering, defusing, engaging, or the current movement intent. A change of task invalidates the previous route even when its destination barely changes. Purpose is computed before a retired route's temporary `blocked` display state, so safe-hold retry limits are preserved. All world, body, speed and airborne checks remain unchanged.

Implementation: `engine/spatial/team-simulation.ts`, `engine/spatial/round-replay.ts`, `__tests__/spatial-teams.test.ts`, and `__tests__/physical-career-loadouts.test.ts`.

## Regression evidence

- A controlled test holds an entry at its angle while the follower completes a shortened path. Physical grenade damage then drops the bomb at the former following destination. A wall prevents an unrelated trade reaction from masking the route bug.
- That test fails on the preserved v6 implementation at the pickup assertion (`tmp/recovery-v6-regression-proof.log`) and passes on v7. The follower keeps physical body separation while recovering.
- The original Mirage seed now recovers twice, then ends by CT elimination at **64.67 seconds**. v6 timed out at 115 seconds without any recovery. The recovering players can still be killed; the fix does not force successful plants or attacker wins.
- v1–v6 recordings remain readable. Tests cover v6 saved cursors and rejection of pending work using old engine rules.

The verified current-engine recovery recording is available to the local development viewer. Its receipt is `docs/ui-review/physical-career/recovery-spatial-round-v7.json`, with SHA256 `c2e0c9b196c1f409c0544b4336ef08cf822676e9500452346d855723f65e8adb`. It is a labelled rehearsal fixture, not a user's career result. The original v6 trace is preserved locally in `tmp/recovery-trace-v6.json`.

## Validation

- **186 suites / 1,761 tests passed** (`tmp/recovery-v7-all-tests.log`).
- Targeted engine lint, production type validation, production build and bundled worker startup passed. Existing unrelated build lint warnings remain.
- Production rehearsal route returns 404; isolated development viewer returns 200; the production manifest survives development compilation. No new browser click-through or packaged Windows/Steam test was performed.
- Latest user drawing remains unchanged: SHA256 `68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8`.

Full-duration calibration uses the existing provisional Mirage fixture, not a certification of the latest user drawing or every map. All four cases resolve before the round/observation horizon:

| Scenario | Outcome | Recoveries | Plants / defuses | Resolution |
|---|---|---:|---:|---:|
| Combat 4326170 | T elimination win | 2 | 0 / 0 | 61.30 s |
| Combat 4326171 | CT defuse win | 0 | 1 / 1 | 106.09 s |
| Combat 4326172 | CT elimination win | 2 | 0 / 0 | 64.67 s |
| No-gun 4326170 | CT defuse win | 0 | 1 / 1 | 53.50 s |

Minimum swept body separation across the campaign is 32.03523 units. The recorded simulator source hash matches the final source files. Report: `docs/ui-review/physical-career/mirage-spatial-round-v7-full-rounds.json`; command: `npx tsx scripts/launch/calibrate-mirage-teams.ts --full`. Three combat seeds do not establish tactical or economic balance.

## Next

Calibrate covering fire, disengagement and authored utility support around recovery attempts, then extend the regression campaign to other maps. Real-time performance, all-map geometry review, career UI recovery, Windows/Steam installation checks and authoritative physical settlement remain unfinished. No new drawing is needed from the user for the next engineering step.
