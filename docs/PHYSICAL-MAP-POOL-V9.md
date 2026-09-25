# Physical map pool and recovery timing - 2026-09-23

Status: rehearsal only. The shared engine is `spatial-round-v9`; authoritative careers remain `legacy-v2`. Existing drawings, save migrations, career rewards and the active seven-map pool are preserved. Nuke remains excluded from that pool (historical editor access is retained).

## Implemented

- Mutual corner waits have deterministic objective priority and a collision-tested yielding route. Stationary teammates can also make passing space. Each executed step still checks world collision, body separation and speed; no teleport or overlap recovery was added.
- Teammate path reservations now use the same circular footprint as movement, avoiding false diagonal endpoint failures from square corners. Reservations do not count as floor support.
- Route planning checks full foot support, with a conservative planning margin on uneven surfaces. Static body sweeps are cached per immutable world and body height; new crowd-reservation worlds have separate caches.
- A nominated bomb recoverer waits for a committed recovery smoke to **actually** screen the recorded threat angle. A queued throw or detonation alone is insufficient. The wait is cancelled on changed objective/nomination, recoverer death, failed flight or its six-second bound. An airborne recoverer finishes the committed movement segment before holding. Events expose wait, ready and cancellation to that team only.
- Native CT/T starts and multipart bombsite volumes are converted into portable lab fixtures for Inferno, Overpass, Vertigo, Ancient, Anubis and Sandstone. Convex pieces remain separate; gaps and floor ranges are preserved. Native spawn height is grounded only within a bounded downward query at the same XY position. Each CT station has a collision-tested approach and separate placement. Inferno native spawn candidates 39/40 were excluded from these fixtures because their approaches failed; other enabled native starts were used.
- The existing authored Mirage fixture is retained. No user markings are overwritten. Plant volumes are provisional XY-piece/Z-range projections, not a claim of complete native trigger semantics.
- Team Lab offers **Open <map> 5v5 review**, downloads the previous lab test as a backup, displays plant polygons, and selects upper/lower radar floors. Players, contacts, bomb, shots and utility are filtered by floor. Long runs have a five-minute UI deadline instead of a false one-minute failure.
- Older v1-v8 recordings remain readable. Pending older-engine rounds cannot silently execute under v9 rules.

## Files and reproduction

- Engine: `engine/spatial/{team-simulation,navigation,geometry,map-scenarios,objective-zones,team-model,team-view,round-replay}.ts`.
- UI: `components/maps/{TeamLab,UtilityReplay}.tsx`; catalogue: `data/physical-map-scenarios.json`.
- Fixtures: `public/map-studio/teams/map-pool/*.lab.json`.
- Build fixtures: `npx tsx scripts/launch/build-map-scenarios.ts`. Receipt: `docs/ui-review/map-pool/scenario-build.json` (60 grounded starts, 24 spawn/site routes, native exclusions and hashes).
- Repeat a map campaign: `npx tsx scripts/launch/calibrate-map-pool.ts Anubis --reviewed`. Replace Anubis with another active map. The reviewed receipts record the exact fixture, simulator and mesh hashes, output hashes, route rejections and final blocked actors.
- Each map campaign tests A combat, B combat and A without gunfire; Mirage also repeats the previously blocked seed 4326174. These are reproducible regression cases, not exhaustive geometry or balance certification.

## Verification

- Final full suite: **188 suites / 1,779 tests passed** (`tmp/maps-v9-all-tests-final.log`). Final targeted regressions also passed: **4 suites / 87 tests** (`tmp/maps-v9-reviewed-regressions.log`), including immutable-world cache isolation and disconnected-spawn exclusion.
- The three Vertigo rounds after the cache-only change exactly matched their pre-cache result hashes (`vertigo-spatial-round-v9-cached.json`). The later reviewed fixtures use different CT assignments and are reported separately.
- Chrome: loaded Anubis via its new review button, ran an eight-second worker replay, scrubbed to five seconds and visually inspected ten actors with plant polygons. Vertigo review button and upper/lower selector were inspected; detailed floor playback verification is recorded separately if completed.
- Latest user Mirage drawing SHA256 is unchanged: `68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8`.

- Final production build, lint/type validation and bundled worker startup passed (`tmp/maps-v9-release-build.log`). Existing unrelated warnings remain.
- Later Chrome automation lost its tab and timed out while reconnecting; Anubis playback is visually checked, but the detailed Vertigo floor playback check remains open.

## Remaining work

The shared improvements are available across the pool, but these maps are not certified perfect or ready for authoritative physical careers. Follow the reviewed campaign receipts for unresolved crowd/path cases; a safely resolved timeout does not prove good navigation. Ambiguous native portals are still rejected. Guard positions are reachable samples, not cover-ranked tactical choices. Map-specific utility plans are not automatically authored or certified: smoke/pickup timing is exercised by controlled regression fixtures, while the map campaign fixtures contain no authored grenades. Smoke, flash, damage and movement remain this game's approximations.

Next: resolve the remaining reviewed crowd/uneven-surface failures, add reviewed recovery-smoke cases on each map, then extend to side-swapped multi-round series and career resume/settlement UI checks. Packaged Windows/Steam validation is not part of this run. No new drawing or user input is required for those engineering steps.

## Final campaign

All 22 reviewed runs finished and their source/fixture hashes match the current files. The 15 combat rounds resolved with **zero final blocked survivors**. All cases maintained swept separation (minimum **32.0014488374** vs required 32). Seven no-gun cases remain diagnostic stress cases: some players safely hold after rejected routes; Ancient, Inferno and Overpass time out without a plant. Do not treat those timeouts as passed navigation.

| Map | A combat | B combat | A without gunfire | Final blocked in no-gun case |
|---|---|---|---|---:|
| Ancient | CT elimination, 31.92s | CT defuse, 70.66s | CT timeout, 115.00s | 2 |
| Anubis | T elimination, 65.56s | T elimination, 45.12s | CT defuse, 57.02s | 1 |
| Inferno | T elimination, 43.33s | T elimination, 46.47s | CT timeout, 115.00s | 3 |
| Mirage | T elimination, 42.64s | T explosion, 74.03s | CT defuse, 53.50s | 2 |
| Overpass | CT elimination, 64.30s | T explosion, 64.62s | CT timeout, 115.00s | 2 |
| Sandstone | T explosion, 82.41s | T explosion, 149.20s | T explosion, 94.22s | 1 |
| Vertigo | CT elimination, 50.33s | CT elimination, 64.97s | T explosion, 84.64s | 5 |

The extra Mirage seed 4326174 resolves by explosion at 86.328125 seconds with one plant and zero blocked survivors. It previously timed out at 115 seconds with entry/carrier blocked. Summary: `docs/ui-review/map-pool/v9-campaign-summary.json`.
