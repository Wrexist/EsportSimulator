# L27 — measured performance increment

14 September 2026. **Partial; release NO-GO.** Measured recruitment work was reduced without changing the four frozen scenarios' simulation state or RNG output. Real UI, target-hardware and packaged acceptance remain open.

## Changes and measured results

The CPU profile identified repeated player valuations during AI recruitment as the main expired-contract stress bottleneck. `engine/ai/roster-management.ts` now reuses candidate wage quotes within one synchronous team vacancy-fill operation. It still rebuilds ownership, role needs and affordability for each hire, retains candidate ordering and discards quotes before another team/week. The selected candidate reuses its existing quote. `engine/player-evaluation.ts` reuses static, ordered role-weight entries instead of allocating them for every evaluation. No global or persisted cache was added.

Same development host, fixed inputs, lockfile and sampling method for each paired comparison. Direct compute: one warmup and eight samples; milliseconds below are medians. These are local compute timings, not total click-to-ready latency.

| Direct compute scenario | Before ms | After ms | Change |
|---|---:|---:|---:|
| small | 1.03 | 1.17 | +13.8% |
| full-world | 144.52 | 111.22 | -23.0% |
| late-history | 1658.30 | 654.20 | -60.5% |
| late-active | 114.51 | 98.59 | -13.9% |

The production worker bundle was also executed in Node vm, with one warmup and six samples. This runs compiled production code but excludes actual browser worker scheduling, transport, rendering and Electron. Compare within this table only, not against direct-source timings.

| Bundled worker in Node vm | Before ms | After ms | Change |
|---|---:|---:|---:|
| small | 0.98 | 1.10 | +12.7% |
| full-world | 211.95 | 195.86 | -7.6% |
| late-history | 6048.44 | 2088.33 | -65.5% |
| late-active | 231.28 | 208.75 | -9.7% |

**All eight paired state/RNG hashes match.** The mass roster-rebuilding case improved substantially in both harnesses. It still takes 2.09 seconds in the bundled VM, above the proposed one-second stress target. Small-case deltas are sub-millisecond noise; the full-world initial baseline was 117.15 ms versus 144.52 ms on its repeat, showing run variability. Do not interpret these samples as a universal game speedup or reliable population p95.

`full-world` is 198 teams / 1,368 initial players with 98 AI matches and one deferred player match. `late-history` has week 521, 5,000 synthetic events and expired original contracts, intentionally provoking mass recruitment. `late-active` shifts contract dates too. Neither proves ten seasons of balanced play. Career creation metadata was frozen once; measured simulation seed is 27001. No owner's career was used.

## Evidence and verification

- [Comparison](L27-comparison.json), [direct baseline](L27-baseline-2.json), [direct candidate](L27-candidate.json), [worker baseline](L27-worker-baseline-2.json), [worker candidate](L27-worker-candidate.json). Each retains raw samples and fixture/output hashes. The initial worker baseline overlapped tests and is excluded from claims; baseline-2 was isolated.
- [CPU profile summary](L27-profile-summary.json) identifies recruitment/evaluation work; profile-inclusive timing is diagnostic only. TSX profile line numbers refer to transpiled source.
- [Frozen fixtures](L27-fixtures.zip), [raw profile](L27-cpu-profile.zip), [baseline worker bundle](L27-worker-baseline-bundle.zip) preserve review inputs and the superseded compiled artifact. Source/lock hashes are in direct measurement records. The final harness additionally prepares the fourth fixture on fresh setup; recorded runs already used those same four frozen inputs and measurement loops. Medians were corrected from retained raw samples to average the two middle observations; original logs/source hashes retain the original upper-middle summary. No timing sample changed. [Artifact manifest](L27-artifact-manifest.json) records final tooling and archive hashes.
- **1,610 tests / 167 suites pass**, including two new recruitment cache lifetime/state-equivalence regressions. [Test log](L27-tests.log), [structured results](L27-tests.json), [type-check log](L27-types.log) and [build log](L27-build.log). TypeScript exits 0. Production build and compiled-worker startup verifier pass, retaining its no-durable-open assertion.
- Baseline build `2GX-oYzTzbaGEiXjb0G1r`; candidate `cAVrB5l32x2qQWbl99c0j`, worker `3816.4d88bc92ad6a093e.js`. Exact worker SHA-256 is in its measurement JSON. Preview restarted on port 3210, PID 322816. [HTTP smoke](L27-http-smoke.json) establishes route availability only. Next's reported server-ready time is not usable-menu startup.
- [Preserved data hashes](L27-preserved-data.json) verify the user's Mirage drawings, spawn/bombsite areas and team snapshot. No owner career was loaded or advanced.

## Memory, storage and assets

The [52-tick compute soak](L27-compute-soak.json) completed using the actual compute core. Forced-GC JS heap grew from 30.3 MB at week 2 to 40.4 MB at week 53 while players grew from 1,403 to 1,665 and completed matches from 98 to 1,645. Events stabilized at their 500 cap and finance ledger at 2,000. This is growing career data, not evidence of leak-free renderer/native operation. It excludes the application post-week coordinator and durable storage.

Direct benchmark clone timings and fresh memory-backed SaveManager timings are retained separately. They do not measure IndexedDB, disk, backup rotation or the complete application save path, and no save-performance improvement is claimed.

[Asset census](L27-asset-cost.json): 4,451 public files, 298,587,618 bytes (284.8 MiB); all built JS chunks total 7,056,434 bytes raw / 1,788,233 bytes individually gzipped. PNG accounts for 194,272,463 bytes; spatial mesh files total 37,849,424 bytes. These are on-disk totals, not per-route transfer, decoded memory or final package inclusion. No asset was deleted or recompressed based solely on this census.

## Reproduction, scope and rollback

Use the commands and fixture descriptions in [L27 budgets](L27-BUDGETS.md). New tooling: `scripts/launch/measure-performance.ts`, `measure-built-worker.cjs`, `measure-sustained-compute.ts`, `measure-asset-cost.cjs`, `compare-performance.cjs`; the existing worker verifier now exports its harness while retaining its CLI checks. Regression file: `__tests__/l27-recruitment-performance.test.ts`.

The two production optimizations need no schema migration or replay-version bump: order, state and RNG outputs are preserved in measured cases. Roll back only this increment's quote reuse and precomputed weight entries if needed; preserve earlier recruitment fixes and unrelated workspace changes. Historical `scripts/perf-baseline.ts` includes different work and cannot serve as a comparable baseline for these figures.

## Open acceptance and next step

All **12 [real performance cases](L27-acceptance-cases.csv) remain NOT_RUN**. Browser inventory/selection returned no available browser, so no UI frame, input, navigation or actual Chromium-worker trace was captured. Minimum/recommended hardware, GPU, supported display load and accepted budgets are unconfirmed. Cold/warm usable-menu startup, long-task responsiveness, 60 Hz playback, real durable saves, 60-minute play and 50 map/route switches still need measurement. L14/L23 dependencies also prevent acceptance. Local fixes satisfy L27.3; L27.1/.2/.4 and all acceptance boxes stay open.

Steam App ID 4326170 is configured and its check passes. Content clearance remains held at 4,988 unresolved/changed inventory items. Earlier player/UI testing, remaining team identities, full 5v5 integration/calibration and packaged Windows testing remain open.

**Next: L28 — management and simulation balance campaign**, alongside the outstanding L27 real-environment measurements. Begin with seeded distributions and invariants; do not mark balance accepted without the extended campaign and human playtests.
