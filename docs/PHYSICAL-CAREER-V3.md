# Physical career rehearsal and traversal — 21 September 2026

## Scope

The physical engine executes Spatial Lab's authored links and movement settings. A career-linked round rehearsal can be reserved, saved, resolved in the geometry worker, verified and committed to its own preview journal. **Production career matches still use the existing engine.** The rehearsal awards no career money, XP, wins or standings.

## Movement and armor

- Team routing receives authored links, blocked surfaces, ladder/jump/drop toggles, stance and pace from the existing project. Crouching uses a 54-unit body and 85-unit speed; vision, muzzle origin, hit volumes and utility exposure use the same stance. This is whole-scenario stance, not automatic per-player ducking.
- Committed airborne/climbing segments finish before tactical goal changes. Jump/drop execution no longer uses a walking-only vertical speed cap. Drops clear the ledge footprint before gravity starts; unsupported/obstructed transitions fail.
- Jump takeoff checks the remaining flight corridor; grounded actors yield to committed flight corridors. This is conservative reservation, not a full crowd solver. Body sweeps remain sampled rather than a full capsule solver.
- New replays use `spatial-round-v3`; v1/v2 readers remain available. Old rounds are not silently resimulated.
- Physical economy stores exact `armorPoints`. A survivor with 37 armor begins the next bound preview with 37; death clears it. Older previews retain their boolean interpretation. Contradictory armor records fail. Automatic rebuy/repair across a full match remains open.

## Career ownership and recovery

`career-round-journal.ts` binds an immutable request SHA-256 to career/session/request IDs and a revision, and pins the prepared physical project and collision mesh. Main-thread verification recomputes settlement from those inputs; worker-provided score/money totals are not trusted.

`physical-preview-slice.ts` compares the live journal again inside the final store mutation after asynchronous verification. Changed careers, cancelled/replaced requests, changed maps and completed matches reject old results. Identical concurrent replies commit once.

The optional `physicalMatchPreview` field is carried through the canonical save schema, snapshot, migration and hydration. Missing fields clear to null; new slots cannot inherit another career's session. Only the pending request and latest replay are retained.

`CareerRoundRehearsal.tsx` is mounted in TeamLab. It saves the reservation before dispatch and the committed rehearsal afterward through the existing serialized save path. Errors are surfaced; a pending request can be retried after reload. `career-rehearsal-input.ts` copies a full 5v5 buy-phase checkpoint with actual roster IDs, current side assignment, attributes and purchased inventory. Mid-round legacy results cannot be copied into a new physical settlement.

## Exercise the flow

1. Use a separate test career; pause at a buy-phase decision and save it.
2. Open `/map-editor/lab` for that match's map. Load a full five-per-side scenario with clear spawns and objectives.
3. Expand **Career round rehearsal**, then **Copy career round and run**. It copies the loadouts at that checkpoint; it does not invent purchases.
4. Inspect the replay. After reload use **View saved physical replay**, or **Retry saved round** if interrupted.
5. **Clear rehearsal** removes only this experimental checkpoint, preserving the normal match.

The UI has type/build checks but no visual/click-through acceptance: dedicated Chrome tab creation timed out. This is an available test flow, not a claim that a human end-to-end test passed.

## Evidence

- Full Jest: **180 suites / 1,701 tests**, `tmp/physical-v3-full-tests.log`.
- Final focused run after buy-phase/new-slot checks: **18 tests**, `tmp/physical-v3-final-focused.log`.
- TypeScript passed, `tmp/physical-v3-types.log`.
- Initial and final builds passed, including type checking, lint checks and bundled week-worker startup. Final log: `tmp/physical-v3-build-final.log`. Existing lint warnings remain; none are reported for the new rehearsal modules.
- `node scripts/launch/verify-physical-worker.cjs` booted the actual bundled geometry worker (bootstrap `2063.7e540b3ae0b8cb87.js`) and ran the career preview request twice on an isolated two-player floor. Both returned replay hash `59ad629acaf27881526c97a1acfed0bc9cc6ddee853b8316ea7c30e276b733c5`, valid integrity, retained 37-point input armor and one scored round. This validates bundled transport/compute, not browser UI or a complete 5v5 career. Report: `docs/ui-review/physical-career/physical-v3-worker-check.json`.
- Traversal tests cover jump execution, lower-floor drops, crouched passage and occupied landing refusal. Store tests cover duplicate replies, switching careers during verification, changed inputs/mesh, cancellation, JSON recovery, snapshot preservation and new-slot isolation.
- Actual Mirage fixture: CT/TIME, 361 frames, 875 events, 300 shots, 100 health removed, minimum separation 32.04035. Replay SHA-256 `0006838fe1c847064195354efa7211c00ad86c8bc5ef554656f8bf62924157b3`. Report: `docs/ui-review/physical-career/5v5-integration-spatial-round-v3.json`. This remains a provisional lab-rifle test, not a balanced career match. The 30.6-second runtime was measured alongside other work, not as a controlled benchmark.
- Mirage source hash remains `efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2`.

## Next

Implement the complete rehearsal match lifecycle: between-round purchases/armor repair, side swaps, halftime/overtime resets, map progression and final-result ownership. Then calibrate full-team combat and connect accepted physical replays to the live career UI. Do not activate the engine by changing its version string alone.

The map author should finish the flagged Mirage CT spawn/A/B boundaries and wall/opening descriptions, then export the latest JSON. Unknown heights can remain Draft with notes. Portraits/drawings were not edited. Windows/Steam testing and release content reconciliation remain open.
