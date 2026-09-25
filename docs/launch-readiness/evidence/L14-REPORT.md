# L14 - Versioned replay and match integration boundaries

Status: **partial; career activation held**. Windows 1.0 remains NO-GO. This pass adds a working spatial round replay and fixes reproduced compatibility-path map, seed, recovery and commit problems. It does not replace the career match engine with the lab.

## Implemented

- `engine/spatial/round-replay.ts` seals a `spatial-round-v1` record containing the portable scenario, map/source/mesh identity, seed, actors, starting heights, tactical settings and physical output. SHA-256 binds the input and output; the digest is a consistency check, not a signature proving trustworthy imported content.
- One read-only projection supplies recorded radar frames, bomb state, effective health damage, kills/deaths, round outcome and diagnostic reward deltas. Seeking, speed changes, repeated calls and skipped frames do not run gameplay or apply rewards again. Health disagreement between damage events and the final physical frame rejects the replay.
- The production spatial worker can return the sealed replay. Team lab adds save/resume position, skip to result and JSON export. Saved positions require the same complete replay digest and version. Observer shot lines use the actual collision-tested origin and endpoint; team views still withhold hidden enemy truth.
- `legacy-v2` is explicit on newly computed/committed career results and new playback checkpoints. Missing engine tags select the compatibility path. Unknown tags are rejected; the career commit action rejects lab spatial results.
- Saved veto maps take precedence over URL query maps. Instant/weekly simulation preserves saved map order and per-map starting CT team. Partial valid map lists receive deterministic filling; invalid saved map IDs fail. Seed zero is preserved rather than silently replaced, and the weekly adapter uses the recorded match seed while preserving its existing global RNG draw count.
- Live checkpoints now include the pending round event queue, processed cursor, map list, seed, ordered rosters and owning career. Older checkpoints recover their original queue from the recorded current round. Missing queues produce a recovery message rather than a newly invented round. Restored visible deaths/inventories are retained instead of reset from already resolved round economy.
- A fixed 500 ms in-memory checkpoint cadence replaces a cancellable debounce that fast playback could starve. The store rejects writes for another career, another active match, a missing scheduled match or a completed match. Durable saves still use the canonical serializer and the user's manual/autosave policy; this is not a guarantee of a disk write every 500 ms.
- Veto edits are frozen while active/recoverable. Contradictory result map IDs are rejected rather than relabelled. Repeated completed IDs cannot repeat XP, weapon mastery, standings, news or results, even if a stale scheduled copy exists. The finish handler checks that the result actually committed before clearing recovery state.

## Verification

- Full Jest: **1,447 tests / 150 suites pass**. [Machine result](L14-jest.json), [log](L14-jest.txt). The initial full run found an obsolete expectation that seed zero should be replaced; it now explicitly tests that recorded zero does not consume global RNG. No validation or audit allowlist was weakened.
- New behavioral coverage: old/new checkpoint serialization and event cursor; fractional event bucketing; duplicate result with real XP/standings mutation; wrong-map and unknown-engine rejection; active veto freeze; stale career checkpoint rejection; Nuke/Sandstone weekly adapter map/side/seed; physical spatial replay projections, changed-setup rejection and event/health contradiction.
- Type check and focused lint pass: [types](L14-types.txt), [lint](L14-lint.txt). Production build and worker verification: [build log](L14-build.txt).
- Six actual Mirage team scenarios seal and replay in Node: [identities, results and timing](L14-replays.json). Simulation costs were **53-327 ms per diagnostic round** on this host; complete recorded-frame projection cost **2-5 ms per scenario**. These are small original 2v2 scenarios, not a spatial season benchmark.
- Existing career engine benchmark: **100 BO3 matches, mean 2.23 ms / p95 3.87 ms**; a **52-week proxy simulated 1,546 matches in 17.23 seconds**, above the harness's 10-second target. [Report](L14-season-profile.md), [log](L14-season-profile.txt). The isolated in-memory benchmark is not a packaged responsiveness, ten-season balance or spatial-season acceptance test. Its single-week sample contained zero matches.

Final production build: **`c6WiZjNWoq-AbKYiUY1zh`**, spatial worker **`2063.fe9aa03c49056d77.js`**, week worker **`3444.91c0a551fdd2ab70.js`**. [Source/input hashes](L14-source.json) identify the scoped implementation; this is not a complete shipping manifest.

### Real-environment replay checks

- **Electron 44.3.0, real compiled production worker:** all six replay envelopes repeat and match Node SHA-256 exactly. Live/instant/skipped projections, localStorage saved-position round-trip and foreign-position rejection pass. Isolated native profile `tmp/l09-native/run-qPm6Lr`; [native report](L14-native.json). This runs sandboxed Electron with Node integration disabled, not the packaged game/depot.
- **Visible Chrome production UI:** ran the persisted support-smoke setup, saved tick 192 (3.000 seconds), reloaded, reran the same setup and resumed exactly at tick 192. Skipping showed CT defuse with diagnostic CT +$3,500 / T +$2,700 deltas. Changing seed 13 to 14 rejected the original saved position; restoring 13 allowed it again. Original seed/project restored, observer replay left paused at 3.000 seconds. No browser error logs were recorded.
- **Actual UI download:** `mirage-round-replay.json` was exported through the button and independently rerun in Node. Input, events, physical frames and result reproduce exactly: SHA `7c94e64ce6b0?`. [Export check](L14-browser-export.json), [visible UI state](L14-browser-ui.txt), [replay controls screenshot](L14-replay-controls.png).
- Final focused regression: **74 tests / 8 suites pass**. [Log](L14-focused.txt). Production browser review found and corrected a text-encoding regression in team labels before the final build. No owner draft or career slot was edited during browser review.

Reproduction commands: `npx tsx scripts/launch/l14-replays.ts`; `node scripts/launch/build-spatial-review-probe.cjs l14` followed by `scripts/launch/spatial-review-native.cjs` under isolated Electron; `npx tsx scripts/launch/l14-check-replay.ts <export.json>`; `npx tsx scripts/perf-baseline.ts --matches=100 --weeks=52 --warmup=10`; `npx tsx scripts/launch/l12-mirage-review.ts l14`; `npm run type-check`; targeted ESLint; `npx jest --runInBand`; `npm run build`.

## Mirage and calibration

[Read-only review](L14-mirage-review.json): both owner uploads are byte-identical, including V12 SHA `efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2`. All **169 marks** remain. Review still reports **20 errors / 87 notes**, with **0 of 17 authored walls admitted** because their height bindings need review. The pinned static mesh is used by the lab; it does not imply acceptance of the owner's red marks.

Remaining manual review: seven default windows, two blue/green overlaps, corridor-edge blue marking, named heights, CT/T spawn and A/B floor extents, and explicit window/underpass/ladder transitions. The 123 authored utility marks and smoke/flash/HE/fire parameters remain uncalibrated. No wall heights, polygons or lineup positions were guessed or altered in this pass.

## Compatibility and rollback

No career was converted to the spatial engine. Existing completed results remain stored history. The optional playback field round-trips through the existing save serializer, without a save schema bump; missing tags/queues use the documented legacy fallback. New replay files are separate diagnostic artifacts and cannot be committed as career results. A saved position is useful only after rerunning the identical lab scenario.

Keep pre-update recovery saves and this source/build identity when diagnosing old careers. Restoring an older binary will not provide the new checkpoint fixes. Legacy seed-zero interpretation and saved-map/side handling changed deliberately; recomputing a pre-update legacy input is not promised to reproduce the older binary. Do not overwrite recorded history by recomputing it. Missing mid-round events require an intact pre-match recovery save.

## Remaining acceptance and next work

All L14 acceptance criteria remain unchecked:

1. Build and validate complete spatial 5v5 matches: buys, real roster/equipment adapters, per-round tactics, halves/overtime, map/floor transitions and series completion. The current spatial path is a bounded lab round; unresolved rounds remain unresolved.
2. Make career live, instant, skipped and resumed modes consume that same approved stream, then run production UI journeys across veto, result and history for Nuke/Sandstone. The legacy live/instant round policies still differ; this pass does not claim career-mode parity.
3. Prove real durable mid-match recovery and duplicate-commit behavior in the packaged Windows app, including save failures, closure, career switching and stale callbacks. Unit/serializer tests do not replace those checks.
4. Economy projection currently reports deltas from zero cash/zero loss streak using existing round rules. Lab weapons are not purchased; assists, full-match ratings, career payouts, complete equipment carryover and season resource constraints are not implemented by this adapter. Position/bomb frames are recorded at 8 Hz; damage events retain 64 Hz ticks. It is not a continuous 64 Hz authoritative position stream or a portable simulator/RNG checkpoint.
5. Complete L03/L04/L13 dependency evidence, full-team congestion/tactical work, Mirage geometry and utility calibration, all-map review and spatial season profiling/optimization before activation.

**Next development package: L15 - finances, budgets and contract consequences**, while finishing the above L14 vertical-slice acceptance. Windows packaged testing, the real Steam App ID and content clearance remain launch requirements. The transfer signing portrait, compact match results and Hall of Fame/fictional aliases remain queued UI requests.
