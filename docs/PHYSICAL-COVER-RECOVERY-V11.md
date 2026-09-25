# Cover reassignment and moving recovery checks

Physical matches remain rehearsal-only. These changes do not alter user drawings, original collision references, saves or the authoritative career engine.

## Implementation

Repeatedly failed cover assignments are remembered per player and objective phase. A replacement must have supported floor, body clearance, a complete simulated route and clearance from current teammates and other assigned cover points. Replacements after a failure also reserve living friendly bodies during route planning. If no replacement is reachable, the failed assignment stays visibly blocked; it is not counted as a successful arrival.

Rejected points are bounded to sixteen per player/phase. Replay engine v11 retains reading of v1-v10 recordings and rejects silently resuming older pending simulation work under changed rules.

Failed replacement searches retry at most every two simulated seconds. The first unrestricted probe was stopped after exposing expensive repeated searches; it is not counted as a passing round.

Body-reservation collision worlds are cached per actor by the exact reserved coordinates. The cache is reused only while that complete position list is unchanged, so multiple candidate routes can reuse navigation checks without treating moved bodies as stationary. Earlier unrestricted/cold-reservation campaigns were stopped and superseded by current-source runs.

When bodies are reserved, native shared edges offer additional crossing positions rather than only their midpoint. Each candidate retains surface, stance, footprint, sweep and transition checks. The recorded Overpass CT5 position-to-goal route, formerly rejected with CT1 present, now arrives in 0.46875 seconds while reserving that teammate.

The original crossing is preferred whenever it remains valid. Side crossings are tested only after that crossing fails, avoiding needless route changes and extra searches around distant bodies. A narrow-portal regression still rejects a body-blocked opening.

Retry routes may reserve directly observed opposing bodies from the current sensing tick. These positions are copied by perception, cleared each tick and never supplied by radio reports or stale contacts. A regression checks that an unseen opponent does not become a precise planner obstacle; physical execution still prevents overlap.

The initial hypothesis that a retired player's passing request was lost did not clear the recorded Overpass case; that experimental change was reverted. The retained fix addresses failed cover selection instead.

The movement campaign exposed an Ancient carrier jam behind a support whose shortened follow track had ended. Passing arbitration now treats an exhausted track as stationary even when its teammate-follow goal is farther away. A focused regression failed before this change and now verifies both yielding and the carrier moving beyond the obstruction with body separation intact. The real-map jam additionally needed body-aware routing to passing pockets: when the direct checked path crosses a teammate, try a reserved-body route before rejecting the candidate. The final Ancient case plants and defuses at 69.9375s with no route failures or final blocked actors. Merely accepting retired requesters did not fix the Ancient case and was reverted.

## Reproduction

- Focused cover regression: `npx jest __tests__/spatial-teams.test.ts --runInBand -t 'repeatedly failed cover'`.
- Recorded Overpass B blocked-passage regression against the real mesh: `npx jest __tests__/map-cover-reassignment.test.ts --runInBand`.
- Moving-squad recovery: `npx tsx scripts/launch/check-moving-recovery.ts`.
- Full map campaign: `npx tsx scripts/launch/calibrate-map-pool.ts Overpass --reviewed --trace` (repeat for each active map), then `npx tsx scripts/launch/summarize-map-campaign.ts`.
- Movement-only campaign: add `--movement-only` to the calibration command, then run `npx tsx scripts/launch/summarize-map-campaign.ts --movement-only`. The summary requires one complete current-source case for every active map and rejects stale fixtures.

Moving recovery combines each validated two-attacker/one-defender calibration with seven actors from the existing map-pool rehearsal. It asserts ten actors, actual movement during grenade flight, screening before pickup, one throw, unchanged input and no body overlaps. Gunfire is disabled to isolate coordination; this is not full combat utility certification or a real-game lineup.

Passing cases are saved in `public/map-studio/teams/recovery-squad/`. Team Lab's **Open <map> moving 5v5 recovery** button backs up the existing lab project before loading one. Use Observer view to inspect the smoke and the complete squad movement.

## Validation

Final movement source SHA-256: `a0bab3c41a7c452018276fd982f745969ea2f7529460a294cf01683893aa621a`. The seven-map summary checks all fixture/source hashes: `docs/ui-review/map-pool/spatial-round-v11-movement-summary.json`.

| Map | No-gun outcome | Final blocked actors |
| --- | --- | --- |
| Mirage | Plant/defuse, 60.75s | 0 |
| Inferno | Plant/detonation, 108.9375s | 0 |
| Overpass | Plant/defuse, 76.203125s | 0 |
| Ancient | Plant/defuse, 69.9375s | 0 |
| Vertigo | Plant/detonation, 84.65625s | 3: CT2/T4 route failures, CT4 opposed by T5 |
| Anubis | No plant, 115s timeout | 2: opposing CT5/T2 stand-off |
| Sandstone | Plant/detonation, 94.640625s | 2: CT4 route failure, CT2 opposed by T3 |

Blocked survivors total 7 versus 11 in v10; six maps plant versus five. Minimum swept separation is 32.00087117645798. This is a seven-case movement stress campaign, not full combat certification. Anubis changes from a clear v10 case to an opposing-player stand-off; that unresolved result is retained, not hidden by the aggregate improvement.

Final Overpass A/B combat cases both settle without blocked survivors (87.390625s and 82.3125s), with four and one bomb recoveries respectively. Recorded route failures still exist, including T4 floor support loss, so zero final blocked survivors does not mean every approach is correct. Earlier candidate runs are not final-source evidence.

Anubis A/B combat cases also settle with zero final blocked survivors (63.8125s elimination after a plant; 55.5625s plant/defuse). These four combat cases do not certify the remaining maps or a side-swapped full series.

All seven moving 5v5 recovery fixtures pass on the final source. Smoke bursts at tick 96, screening is confirmed at 97, and pickup occurs at ticks 121-143 depending on map. All seven added actors move during flight, one smoke is consumed, inputs remain unchanged, and minimum separation stays at least 32. Source and saved-fixture hashes were checked for all seven receipts. See `docs/ui-review/recovery-utility/*-spatial-round-v11-moving.json` and `tmp/cover-v11-final-moving-recovery.log`.

Current focused checks: 95 tests in four suites pass (`tmp/cover-v11-final-tests.log`), covering navigation, team behavior, recorded Overpass mesh passage and replay ownership. Full-map and production validation are recorded separately when complete. Parallel checks were stopped when the host reached 100% CPU and under 1 GB free memory; resumed checks run sequentially. No unrelated process or existing port-3210 game server was stopped.

Type-check and targeted engine/UI lint pass (`tmp/cover-v11-final-typecheck.log`, `tmp/cover-v11-final-lint.log`). Production build and week-worker startup pass (`tmp/cover-v11-verified-build.log`), with existing repository lint warnings. The bundled physical-worker request also passes repeat-hash, armor, settlement and source-engine checks (`tmp/cover-v11-physical-worker.log`). Its old hard-coded v3 assertion was replaced with comparison against the current source engine version; a stale bundle still fails. This worker check uses an isolated two-player fixture, not real-map browser or Windows acceptance.

The full-round Jest prototype was stopped and replaced with the exact recorded passage as a focused mesh regression. Full rounds continue to run through the calibration script, with their results and blocked survivors recorded separately; stopping the prototype is not counted as a passing full-round check.

Browser review remains pending: Chrome timed out during navigation and when attaching to the newly created tab. The isolated review server on port 3371 was stopped to release memory; the existing game server on port 3210 was untouched. No browser success is inferred from an HTTP response.

## Remaining work

- Reproduce Vertigo CT2/T4 and Sandstone CT4 failed routes; separate stance/floor constraints from body reservations. Review opposing-player stand-offs on Anubis, Vertigo and Sandstone with combat enabled and additional seeds.
- Validate side-swapped full series and recovery under combat. Four final-source combat cases and seven no-gun cases are not an all-map combat certificate.
- Complete Team Lab browser click-through, worker responsiveness/performance calibration, and packaged Windows/Steam validation. Some full-round calibration runs take minutes on this loaded host; real-time readiness is not established.
- Original Mirage drawing SHA-256 remains `68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8`. No redraw or save migration is required from the user.
