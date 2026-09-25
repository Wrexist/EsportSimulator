# L27 performance budgets and measurement scope

These are **proposed engineering targets, not accepted minimum hardware or Steam promises**. The current host is a development machine: Intel Core i5-12600K, Windows 11 Pro (10.0.26200), Node 22.18.0. Exact RAM/logical CPU count is in each measurement JSON. Minimum/recommended hardware and GPU remain unconfirmed; no purchase or platform recommendation is implied.

| Metric | Proposed target | Required measurement | Current evidence |
|---|---|---|---|
| Cold start to usable menu | 3 seconds | Packaged Electron, 10 cold/warm starts on each target machine | NOT_RUN; VM worker startup is not app startup |
| Input acknowledgement | Under 100 ms | Production browser/Electron input timing with visible response | NOT_RUN |
| Navigation | Under 250 ms warm; honest loading feedback on slower loads | Repeated route transitions on small and late careers | NOT_RUN |
| Match/map playback | 60 Hz target; no sustained frame overruns | Frame-time distribution at supported resolution and scale | NOT_RUN; match computation is not playback |
| Ordinary week compute | p95 under 500 ms | Real production worker on target hardware; same save/RNG | Local Node and bundled-worker VM only |
| Mass roster rebuilding | Under 1 second compute where feasible | Expired-contract stress input, separated from normal late history | Local comparison; cannot claim UI remains responsive |
| Durable save | p95 under 250 ms with progress for slower writes | IndexedDB and packaged disk paths, backup rotation enabled | Memory-backed SaveManager only |
| Memory stability | No unexplained retained growth after warmed cycles | 60-minute play session plus 50 map/route switches; heap/listener/timer snapshots | Direct compute soak only; renderer/native NOT_RUN |
| Asset cost | Set after target storage/RAM and delivery review | On-disk census plus actual transferred/decoded resources | Local byte inventory only; final package pending L08 |

## Repeatable local measurements

1. Restore `L27-fixtures.zip` into `tmp/l27-fixtures` to use the exact reviewed bytes. The manifest hashes must match. The inputs are synthetic QA careers; never import them into the owner's career origin.
2. Run `npx tsx --tsconfig tsconfig.test.json scripts/launch/measure-performance.ts --label=<label>` with `ESM_PERF_TRACE_STEPS=1`. Use one process at a time; do not overlap builds, profiling or tests. Each scenario gets one warmup, then eight samples of direct compute, structured clone and a fresh memory-backed save. Raw samples and output/RNG hashes are retained. Medians average the two middle observations. Eight-sample p95 is effectively the maximum and is not a reliable population tail estimate.
3. For the actual compiled worker, run `node scripts/launch/measure-built-worker.cjs --label=<label>` against the corresponding production build. This reuses the worker startup verifier, checks successful requests and zero durable opens, then records six samples after one warmup. It executes the bundle in Node vm, not a Chromium worker; cross-realm/JIT costs differ.
4. Run `node --expose-gc --import tsx scripts/launch/measure-sustained-compute.ts` with `TSX_TSCONFIG_PATH=tsconfig.test.json` for a 52-tick isolated compute soak. Forced-GC JS heap samples exclude renderer/native/GPU memory and are not leak certification.
5. Compare like-for-like host, fixture hashes, seed, flags, sample methods and lockfile. Output state/RNG hashes must remain identical for this optimization. CPU-profile timings are diagnostic and excluded from baseline/candidate speed claims.

## Fixture interpretation

- `small`: three-team first-week fixture. The player's scheduled match is deferred by the production core, so this sample has zero AI matches. It is not a match-playback benchmark.
- `full-world`: 198-team/1,368-player launch world with a synthetic one-match-per-pair BO1 schedule. The player's match is deferred; 98 AI matches are processed.
- `late-history`: same world moved to week 521 with 5,000 synthetic event records and original contract dates. Expired contracts trigger mass roster rebuilding. It is deliberately a recovery/stress case, not representative steady-state late play.
- `late-active`: shifts contract dates too, retaining an active roster while testing synthetic late history. Neither late scenario proves ten seasons of career simulation or economic balance.

The historical `scripts/perf-baseline.ts` report is retained for context. Its derived weekly budget and direct engine/memory-save figures are not release acceptance evidence for daily interaction or Electron responsiveness.
