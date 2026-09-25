# Crowd movement and recovery calibration, v10

Physical rounds remain a rehearsal engine. Career results and saves continue to use the existing authoritative simulation. No map drawings or original geometry assets were edited.

## Shared fixes

- A yielding player chooses a pocket outside the requester's near-term route, stays there until the requester passes, and has a bounded six-second hold. Candidate pockets follow the lane direction, including narrower and farther passing spaces. Collision, floor and swept 32-unit separation checks still apply to every executed move.
- Actors approach non-objective stations to within eight units. The former 20-unit stopping margin could occupy another player's otherwise separate destination. A retired route can retry when its known friendly blocker moves eight units, rather than requiring a 40-unit move.
- Explicit body reservations support local detours inside the same navigation polygon. Walls, other floors and an impassably narrow corridor still reject the detour. Enemy truth is not supplied to this planning step.
- Walking routes split at the triangle seams of uneven navigation polygons. Native portal endpoints use the actual selected surfaces; even small height discontinuities are explicit steps. No teleport or floor snap is used to recover a failed movement.
- Route forecasts now check destination body clearance as well as the swept segment, matching the live movement gate. Footprint-validation caches include stance height.
- Replay engine v10 keeps v1-v9 recordings readable and refuses to silently execute pending older-engine rounds under new rules.

## Recovery-smoke examples

All seven active maps have a portable example under `public/map-studio/teams/recovery/`. Open Simulation lab, choose the map, then **Open <map> recovery smoke** and **Run team scenario**. The current lab test downloads as a backup. Use **Observer Â· world truth** to inspect smoke cells and the grenade trajectory; team knowledge views deliberately withhold the full observer overlay.

Each example uses two attackers and one defender against the actual map-reference collision mesh. It records release position, aim, power, bounce targets and landing with a four-unit tolerance. The grenade inventory is finite. A clear threat-to-pickup sight line must become screened by the resolved smoke before the nominated player resumes pickup. These are original simulator calibration fixtures, not imported or certified real-game lineups, and not a full 5v5 utility campaign.

Reproduce with `npx tsx scripts/launch/calibrate-recovery-utility.ts`. Receipts in `docs/ui-review/recovery-utility/*-spatial-round-v10.json` contain map/fixture/source hashes, landing/bounce errors, screening and pickup ticks, and minimum body separation. Tests independently load each saved fixture, run it against the mesh and assert screening order, immutability, separation and one-grenade consumption.

## Verification and limits

Repeat a map's full campaign with `npx tsx scripts/launch/calibrate-map-pool.ts Anubis --reviewed --trace`. There are A/B combat cases and a no-gun movement stress case per map, plus the previous Mirage approach regression. `--movement-only` and `--combat-only` write separately named partial reports. `npx tsx scripts/launch/summarize-map-campaign.ts` rejects stale or incomplete receipts before aggregating them.

A legal round timeout is not a passed navigation check. Remaining blocked actors and their last obstruction remain visible in the receipts; no-gun opposing-body deadlocks are distinguished from friendly congestion. Static reference geometry, low-level capsule approximation and tactical cover selection still limit realism. Full 5v5 smoke/flash coordination, side-swapped series and authoritative career adoption require further validation.

### Recovery calibration evidence

All seven current-source receipts and fixture hashes were verified. Each smoke detonates at 1.500 seconds and screening is confirmed at 1.515625 seconds. Every saved throw has zero measured landing/bounce error against this simulator's deterministic forecast (not against the real game). Pickup follows screening:

| Map | Pickup time |
|---|---:|
| Ancient | 1.890625s |
| Anubis | 1.937500s |
| Inferno | 2.046875s |
| Mirage | 2.234375s |
| Overpass | 1.906250s |
| Sandstone | 1.890625s |
| Vertigo | 1.890625s |

Chrome review: loaded Anubis through the recovery button, ran the browser worker, scrubbed to two seconds and inspected smoke cells, trajectory and actors in Observer view. The event list showed detonation, screening confirmation, then pickup. A cold development worker initially reported a module parse error; a reload after compilation completed ran successfully. This is a local development check, not a packaged Windows validation. Imported ten-second fixture durations now display correctly in the selector.

### Automated checks

- Production build, TypeScript validation and bundled worker startup pass: `tmp/crowd-v10-build-final.log`. Existing unrelated lint warnings remain.
- Targeted engine/UI lint passes. Launch scripts are excluded by the repository lint configuration; they were executed through `tsx` and included in production type validation.
- Full Jest run: 188 suites passed, one failed; 1,790 tests passed, one failed. The failure is the existing week-tick performance ratio (10.054 vs an 8x ceiling) while concurrent map campaigns were running. Log: `tmp/crowd-v10-all-tests-final.log`. The unchanged isolated rerun passes at 1.89x (21.0ms early, 39.6ms late), below the 8x ceiling: `tmp/crowd-v10-perf-isolated.log`. Across the full run and this rerun, all 1,791 tests have passing evidence; the first full run was not wholly green.
- The new tests cover actual map recovery fixtures, same-polygon passing detours, narrow-corridor rejection, nonplanar floor seams, small portal steps, low-ceiling stance clearance, held passing pockets and old replay ownership. Existing route tests now verify arrival rather than an exact waypoint count.

Inferno's no-gun stress case includes an indirect opposing-body jam: T4 waits behind T5, whose latest obstruction is CT4. The carrier is separately stopped by CT5. Neither opposing body can be removed through combat in that diagnostic mode. This remains an unresolved stress case, not a reason to disable collision or expose hidden opponent positions to routing.

Overpass B combat retains one blocked supporting player, CT5, beside CT1's retake/cover position (32.065 units apart). The identical final CT5 route arrives in 0.453 seconds against static geometry, but is rejected with living friendly body reservations; crouching does not resolve it. CT3 can complete the defuse. Diagnostic: `tmp/overpass-v10-ct5-inspection.log`. This is a cover-position/passing conflict requiring further coordination work, not missing user-drawn walls.

The original Mirage v13 drawing remains SHA256 `68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8`.

## Final map campaign

All 22 receipts are complete and match current source and fixture hashes. The 15 combat rounds settle; 14 end with no blocked living actor and Overpass B retains one blocked support. Minimum swept separation is 32.000018310 units (required: 32).

Compared with the v9 campaign, no-gun final blocked survivors decrease from 16 to 11, and no-plant timeouts decrease from three maps to two. Ancient now plants and defuses; Mirage and Anubis have no final blocked actors in their no-gun cases. This is not a uniform improvement: Overpass B has one blocked combat support versus zero in v9.

| Map | A combat (s) | B combat (s) | No-gun (s) | No-gun blocked |
|---|---:|---:|---:|---:|
| Mirage | 61.44 | 72.17 | 47.75 | 0 |
| Inferno | 44.28 | 45.89 | 115.00 | 2 |
| Overpass | 61.83 | 61.00 | 115.00 | 2 |
| Vertigo | 59.48 | 78.50 | 84.64 | 4 |
| Ancient | 46.62 | 40.19 | 66.69 | 1 |
| Anubis | 39.17 | 58.66 | 69.50 | 0 |
| Sandstone | 80.03 | 78.59 | 93.19 | 2 |

The extra Mirage approach seed 4326174 resolves by elimination at 66.515625 seconds with no final blocked actor. Inferno and Overpass no-gun cases still time out at 115 seconds without planting. Summary: `docs/ui-review/map-pool/spatial-round-v10-summary.json`.

Next: resolve the Overpass cover-position conflict and remaining no-gun floor/body cases, then add moving 5v5 recovery utility and side-swapped series. Physical matches remain rehearsal-only; no new user drawing is required.
