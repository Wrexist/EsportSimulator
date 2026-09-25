# Physical combat and route recovery — 2026-09-23

The physical rehearsal now uses `spatial-round-v4`. Normal career results remain on `legacy-v2`; physical career rewards are not enabled.

## Changes

- Recoil recovers every live tick, including reload, blindness and lost sight. Bursts wait for the accumulated recoil to settle before firing again. The previous model accumulated enough pitch to send late-magazine shots roughly 12–13.5 degrees above the observed target. Aim, spread, ammo and collision resolution still determine hits.
- A route retired after a teammate blockage can retry when that teammate moves 40 units away or dies. Successful movement clears the tracked obstruction. Static world collisions still use the original bounded retries and safe hold.
- Movement waits identify the blocking body, reserved flight corridor or world-clearance failure. Captured diagnostics include the attempted segment.
- New pending rounds pin the engine version. Old recordings remain readable; old pending rounds/series require a fresh rehearsal rather than silently continuing with new rules. Career ownership, replay checksums and project checks remain enforced.

Primary implementation: `engine/spatial/fire-control.ts`, `team-simulation.ts`, `encounter.ts`, `round-replay.ts`, `career-round-journal.ts`, `store/slices/physical-preview-slice.ts`, and `components/maps/CareerRoundRehearsal.tsx`.

## Measured results

Same provisional Mirage fixture and seed 4326170, 45-second round:

| Metric | Preserved v3 baseline | v4 |
|---|---:|---:|
| Shots | 300 | 86 |
| Damage | 100 | 442 |
| Eliminations | 1 | 4 |
| Plants | 0 | 0 |

The preserved v3 recording was verified before reconstructing its baseline report; its SHA is `0006838fe1c847064195354efa7211c00ad86c8bc5ef554656f8bf62924157b3`. It was not rerun under changed rules.

Three combat seeds produced 4, 2 and 5 eliminations respectively. Two ended on time; one ended by elimination. A separate 115-second movement-only run completed a plant and defuse. All four runs maintained at least 32.04035 units of body separation. These checks do not certify every collision or map.

The 200 controlled, mirrored weapon-duel cases all resolved without a timeout. They still show substantial weapon/range disparities and do not establish balanced gameplay. The coefficients are provisional original tuning.

Reproducible reports:

- `docs/ui-review/physical-career/5v5-integration-spatial-round-v3.json`
- `docs/ui-review/physical-career/5v5-integration-spatial-round-v4.json`
- `docs/ui-review/physical-career/mirage-spatial-round-v4-calibration.json`
- `docs/ui-review/physical-career/combat-spatial-round-v4-calibration.json`

Commands: `npx tsx scripts/launch/check-physical-career.ts`, `npx tsx scripts/launch/calibrate-mirage-teams.ts`, `npx tsx scripts/launch/calibrate-physical-combat.ts`. The first command also refreshes the local replay-viewer fixture.

## Validation and remaining work

- Full Jest suite: **186 suites / 1,753 tests passed** (`tmp/physical-v4-full-tests.log`). Regressions cover sustained burst recovery, moving-blocker retry, v3 replay readability and rejection of mixed-engine pending work.
- Typecheck passed. Targeted lint passed without warnings/errors; the Next lint command emits its existing deprecation notice.
- Production build and bundled worker startup passed (`tmp/physical-v4-build.log`). Existing unrelated lint warnings remain.
- Latest Mirage user drawing is unchanged: SHA256 `68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8`.
- No new browser click-through, Windows package or Steam installation test was performed in this calibration pass. The previous viewer screenshot documents v3, not v4.

The next bottleneck is squad spacing around entry/support players and endpoint clearance: the combat runs still report teammate obstructions and 3–5 endpoint-clearance failures. Broader crowd-yield experiments were discarded because they worsened the real-map fixture. The retained recovery has a controlled regression test but is not a full formation solution.

Next: collision-validated support positions and local passing/queueing at narrow entrances, followed by full-duration multi-seed combat/objective tests. Then review other maps, utility and timing calibration before authoritative physical career settlement. The user does not need to redraw Mirage for this step.
