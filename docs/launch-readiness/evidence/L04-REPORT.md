# L04 — Deterministic simulation and worker ownership

Status: **partial; implementation and isolated replay checks pass, release acceptance remains open**. Dependencies L02 and L03 remain partial.

## Changes and ownership

The existing compute-only worker and synchronous fallback remain in place. The application coordinator owns detached pre-tick work, worker computation, reconciliation, academy/progression updates and one final durable save. No second engine or competing writer was introduced.

- Seed zero is valid throughout the coordinator and seed-using academy, staff, finance, standings, AI, job-offer and transfer paths. Truthiness defaults previously replaced zero with another seed; the initial coordinator regression reproduced that divergence.
- Mulberry32 now bounds its accumulator to uint32 on every draw. Previously an uninterrupted stream eventually exceeded exact JavaScript integer precision, while reconstructing the generator truncated its state. A 5,000,100-draw regression compares uninterrupted and periodically reconstructed streams. Normal short sequences retain their values; old invalid/zero-seed behavior is intentionally corrected.
- Training recovery reads the UTC career year, avoiding local New Year boundaries changing prestige calculations. The regression forces a differing local calendar and verifies the year passed into player lifecycle processing.
- The bridge still captures input/config/seed before its first await, correlates request IDs, rejects concurrent requests, terminates timed-out workers and falls back once from captured input. Matching results must also carry the expected career/week and a valid uint32 RNG state. Handled worker errors suppress their default bubbling after initiating fallback.
- Loading, creating or deleting a career invalidates old work. The coordinator checks its career generation after yields and after worker completion, so a late result cannot replace a newly loaded career. Its seed is taken from the same detached snapshot being processed. Final save failure leaves the completed week in memory for manual retry without re-simulation.
- `engine/worker/week-replay.ts` defines replay format 1 with detached save, seed and serializable training configuration. Canonical comparison sorts object keys by code point and preserves array order and gameplay fields. Only root `updatedAt`, `lastPlayedAt` and their `integrityHash` are excluded. Nested dates, amounts, IDs, matches, progression and RNG remain significant. This is a test/debug artifact format, not a new player-facing import feature.

The simulation sources do not consume `Math.random`; the coordinator regression varies ambient `Math.random` between runs while requiring identical game state. Procedural audio detuning/noise uses its own cosmetic randomness in `lib/sound-manager.ts`. New-career identity creation and storage/migration timestamps remain outside week equality; they are part of the captured starting save when replay begins.

## Real execution evidence

`scripts/launch/week-replay-browser.ts` bundles the actual store coordinator, SaveManager and bridge into an isolated Electron Chromium fixture. The native runner serves the actual Next production worker and shared chunks. The fixture creates a versioned strong-club career with seed zero and an additional AI opponent/match. It executes two consecutive weeks in five modes: real worker, repeated real worker, unavailable-worker fallback, a worker that signals READY then crashes on the request, and a saved career reloaded between weeks. Every step checks canonical state, expected transport, exactly one week advance and one authoritative save, including repeated simultaneous advance requests.

The initial native probe incorrectly allowed a nominal worker case to fall back. An explicit transport assertion caught the mismatch against an older compiled worker's unbounded RNG state. Final evidence requires the updated compiled worker and reports `workerUsed: true` for both worker cases. The test was strengthened, not relaxed.

This fixture uses actual application logic and persistent browser storage, but substitutes transport construction to select failure modes. It is not a packaged game journey, a multi-season proof, or a full played live-match replay. The reload is the real save/load path in one Chromium process; L03 separately records fresh-process storage recovery.

Existing compute-only tests reject writes through the application adapter/SaveManager. The production worker build check boots its actual chunk without window/document and rejects IndexedDB opens during startup. These complement the actual Chromium worker runs; a startup test alone is not presented as proof of every compute branch.

## Migration and rollback

Save schema remains 7. Existing numeric seeds are normalized by the generator's uint32 constructor as before; new saves retain bounded states. No owner career or map data was rewritten by these probes. Historical zero-seed and overflowed runs cannot be promised to reproduce the previous bug. Retain an export and its build identity before binary rollback; replay format 1 should be paired with the recorded source/build hashes.

## Remaining acceptance

1. Finish L02/L03 fixture, historical-save and packaged recovery prerequisites.
2. Run the same comparisons on the releasable Windows candidate, across longer careers, season boundaries and representative player-authored saves. Add actual live-match continuation and force-kill around the final commit.
3. Extend canonical outcome coverage to live spatial combat as L09–L14 become integrated. This pass proves the current weekly engine, not wall-aware shooting or grenade physics.
4. Supply the real Steam App ID and resolve L08 content distribution holds before producing a releasable package. No gate was bypassed.

Acceptance boxes remain unchecked. Next execution package after this pass is **L05**, followed by **L09 — map annotation registration, spawns and plant zones**.

## Final verification

- Full regression: **1347 tests / 141 suites pass**. Fresh TypeScript: **0 errors**. Production build, lint/types and actual compiled worker startup: **pass**; existing lint warnings remain.
- Real Chromium coordinator: **10 comparisons pass** across five transport/reload modes and two weeks, with exactly one final write per week.
- Native close/cancel/autosave/17-second-save sequence and separate-process device preference reload: **pass**.
- Build ID: `hMUQghgW8R_3VLc9MvSG5`. [Source/build receipt](L04-L05-checks.json), [regression log](L04-L05-regression.txt), [production build log](L04-L05-build.txt), [native replay](L04-native-replay.json), [versioned input](L04-replay-input.json), [native lifecycle](L05-native-lifecycle.json), [fresh-process preferences](L05-native-preferences-read.json).
