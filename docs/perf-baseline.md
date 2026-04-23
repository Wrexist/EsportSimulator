# Simulation performance baseline

Measured by `scripts/perf-baseline.ts`, which:

1. Loads the shipped snapshot from `public/data/snapshot/` into an in-memory save.
2. Directly calls `matchEngine.simulateMatch` for 200 matches between random team pairs from the snapshot (BO3).
3. Runs a single `atomicWeekProcessor.processWeek` tick.
4. Runs 12 sequential `processWeek` calls as a full-season proxy.

Enable the lightweight engine tracer any time with `ESM_PERF_TRACE=1` —
it emits per-call lines and an aggregate summary on `perfTrace.flush()`.

## Environment

| | |
|---|---|
| Node | `v22.22.2` |
| Platform | `linux x64` |
| CPU | unknown (sandbox; 16 logical cores) |
| RAM | 21.0 GB |
| Matches sampled | 200 (plus 10 warm-up) |
| Weeks simulated | 12 |

## Targets vs. measured

Targets from the perf task (management sim budget). "Daily tick" target is
500 ms; this codebase uses **weekly** ticks only, so we compare the weekly
tick against a derived budget of 500 ms × 7 = **3500 ms/week**.

| Metric | Target | Measured | Status |
|---|---:|---:|:---:|
| Single match (avg) | 100.0 ms | **3.64 ms** | PASS |
| Single match (p95) | 100.0 ms | **6.04 ms** | PASS |
| Full season (12 weeks) | 10.00 s | **148.71 s** | RED |
| Weekly tick (single) | 3.50 s derived | **653.8 ms** | PASS |

**Status legend:** `PASS` ≤ target · `OVER` ≤ 3× target · `RED` > 3× target (flagged).

### Flags (>3× target)

- **Full-season sim exceeds 3× target by a wide margin.** A 12-week run took
  **148.7 s** (~15× the full-season budget of 10 s) and cost per week is
  **super-linear** (see §3): wk 10 = 21.0 s, wk 12 = 24.7 s. An earlier
  partial run out to 20 weeks showed wk 10 = 19.9 s, wk 20 = 32.2 s before it
  was killed.
- **Extrapolated 52-week season:** linearly from the 12-week run ≈ **645 s
  (10.8 min)**. Because per-week cost is still growing at week 12, the real
  number is likely **worse** — the earlier run was on track for **15+
  minutes** before it was stopped. Either way the full-season budget is
  exceeded by **60× or more**.
- **Per-week cost growth pattern (both runs):**
  - Run A (aborted at wk 20): wk 10 = 19858 ms, wk 20 = 32159 ms — ~62% slower
    over 10 weeks.
  - Run B (12 weeks, completed): wk 10 = 21023 ms, wk 12 = 24688 ms — ~17%
    slower over 2 more weeks.
  - Process RSS grew from ~1 GB (start) to 2.7 GB (wk 20).

## Detailed numbers

### 1. Single-match sim (`matchEngine.simulateMatch`, BO3)

| Stat | Value |
|---|---:|
| Count | 200 |
| Total | 728.9 ms |
| Min | 1.71 ms |
| Median (p50) | 3.41 ms |
| Mean | 3.64 ms |
| p95 | 6.04 ms |
| p99 | 7.75 ms |
| Max | 8.81 ms |

Call chain: `matchEngine.simulateMatch` → `SimulationEngineV2.simulateMatch`
(engine/match-simulation.ts:146). BO3 mean implies a per-map cost of ~1.74 ms
(BO3s average ~2.1 maps before someone clinches 2–0).

### 2. Weekly tick (`atomicWeekProcessor.processWeek`, single call)

| Stat | Value |
|---|---:|
| Total | 653.8 ms |
| Matches simulated by tick | 0 |
| Implied per-match cost inside tick | n/a |
| Derived daily-equivalent budget (500.0 ms × 7) | 3.50 s |

`processWeek` covers training, fatigue, injuries, finance, tournament
processing, match simulation, standings, events, AI, retirements, rest
days, narrative, career-stats rollups, and save persistence (engine/atomic-week-processor.ts:108).

### 3. Full-season sim (12 weeks of `processWeek`)

| Stat | Value |
|---|---:|
| Total wall-clock | **148.71 s** |
| Sum of per-week durations | 148.69 s |
| Matches simulated (by tick counter) | 550 |
| Avg per-match cost (season / matches) | 270.4 ms |
| Avg per-week cost | 12.39 s |
| Median week | 12.82 s |
| p95 week | 24.69 s |
| Max week | 24.69 s |

Observed per-week durations from the two runs:

| Week | Run A (52-week, aborted) | Run B (12-week, completed) |
|---:|---:|---:|
|  1 | — | ~2 s (from sum) |
| 10 | 19858 ms | 21023 ms |
| 12 | — | 24688 ms |
| 20 | 32159 ms | — |

Why the per-match average looks much higher than the direct single-match
number (270 ms vs 3.6 ms): the **270 ms includes everything `processWeek`
does per match** — AI decisions, tournament progression, transfer / job /
sponsor logic, save serialisation after each step, event generation,
narrative, etc. Very little of the ~12 s/week cost is actual match sim
— direct sim time for 550 matches is only ~2 s at the measured single-match
rate.

## How to reproduce

```bash
# Baseline run:
npx tsx scripts/perf-baseline.ts

# Live trace while the game or tests run:
ESM_PERF_TRACE=1 npm test
ESM_PERF_TRACE=1 npx tsx scripts/perf-baseline.ts
```

The engine instrumentation lives in `engine/perf-trace.ts` and is a no-op
unless `ESM_PERF_TRACE=1`. Hooked into:

- `SimulationEngineV2.simulateMatch` — engine/match-simulation.ts
- `AtomicWeekProcessor.processWeek` — engine/atomic-week-processor.ts

## Summary against targets

| Target | Ship budget | Current | Verdict |
|---|---|---|---|
| Single match | < 100 ms | ~3.6 ms avg / 6 ms p95 | **PASS** (~27× headroom). The match sim itself is not the problem. |
| Weekly tick (single call, early game) | < 3500 ms (= 500 ms × 7 derived) | ~650 ms | **PASS** on a single, early-season tick. |
| Full season (52 weeks) | < 10 s | ≥ 10 min (extrapolated ≥ 645 s from 12 weeks, realistically worse) | **RED — exceeds 3× target by ~60–90×.** |
| Weekly tick (late season) | < 3500 ms derived | ~21–32 s and rising | **RED** once the save has accumulated a few weeks of state. |

The headline problem is not the match engine — it's `processWeek` itself,
and specifically the fact that **per-week cost keeps growing as the save
ages**. Likely suspects (to investigate in the optimisation pass, not now):

- `SaveManager.saveGame(save)` is awaited **between most of the 9+ steps**
  inside `processWeek`. Each save call serialises the entire `GameSave`
  (teams, players, completed matches, events log, finance ledger, news,
  transfer history…). As those arrays grow, serialisation cost grows too.
- `buildSaveIndexes(save)` is called at the start of the tick and again
  inside `TournamentManager.simulateAllPendingBracketMatches` and
  `simulateConcurrentMatches`, rebuilding indexes over a growing save.
- `save.scheduledMatches.filter(...)` and similar linear scans happen
  per-week, per-tournament-stage.
- `save.completedMatches` is appended to on every sim; log/ledger arrays
  also grow. `compactPersistentState` is called at end of tick but may not
  trim everything.
- RSS grew from ~1 GB to 2.7 GB across 20 weeks, suggesting material
  unbounded accumulation, not just JIT warmup.

## Notes

- The `matchesPlayed` figure reported by `processWeek` only counts league
  matches processed via `processMatches`. Tournament-bracket matches
  simulated inside `processTournaments` (via `TournamentManager.simulateConcurrentMatches`
  and `simulateAllPendingBracketMatches`) are additional work not reflected
  in that counter, so the true per-match cost during a tick is actually
  **lower** than the naive `weekMs / matchesPlayed` division above.
- All measurements come from the dev build running under `tsx` (ts-node-style).
  A production (`next build`) environment may be faster due to AOT compile
  and deoptimisation avoidance — worth re-running there before optimising.
- The single-week measurement was taken on a fresh save (week 1–2). On a
  "mid-season" save the cost will look like one of the per-week samples in
  §3, **not** the 650 ms number above.

---

*Baseline only — no optimisations applied. Root-cause and fixes deferred.*
