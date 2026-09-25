# Simulation performance baseline

Measured by `scripts/perf-baseline.ts`, which:

1. Loads the shipped snapshot from `public/data/snapshot/` into an in-memory save.
2. Directly calls `matchEngine.simulateMatch` for 100 matches between random team pairs from the snapshot (BO3).
3. Runs a single `atomicWeekProcessor.processWeek` tick.
4. Runs 52 sequential `processWeek` calls as a full-season proxy.

Enable the lightweight engine tracer any time with `ESM_PERF_TRACE=1` —
it emits per-call lines and an aggregate summary on `perfTrace.flush()`.

## Environment

| | |
|---|---|
| Node | `v22.18.0` |
| Platform | `win32 x64` |
| CPU | 12th Gen Intel(R) Core(TM) i5-12600K |
| RAM | 31.7 GB |
| Matches sampled | 100 (plus 10 warm-up) |
| Weeks simulated | 52 |

## Targets vs. measured

Targets from the perf task (management sim budget). "Daily tick" target is
500 ms. This harness measures weekly processing; HYBRID_DAILY pacing exists but is not benchmarked here. We compare the weekly
tick against a derived budget of 500 ms × 7 = **3500 ms/week**.

| Metric | Target | Measured | Status |
|---|---:|---:|:---:|
| Single match (avg) | 100.0 ms | **2.23 ms** | PASS |
| Single match (p95) | 100.0 ms | **3.87 ms** | PASS |
| Full season (52 weeks) | 10.00 s | **17.23 s** | OVER |
| Weekly tick (single) | 3.50 s derived | **68.6 ms** | PASS |

**Status legend:** `PASS` ≤ target · `OVER` ≤ 3× target · `RED` > 3× target (flagged).

_No metric exceeded 3× its target._


## Detailed numbers

### 1. Single-match sim (`matchEngine.simulateMatch`, BO3)

| Stat | Value |
|---|---:|
| Count | 100 |
| Total | 223.3 ms |
| Min | 0.97 ms |
| Median (p50) | 2.07 ms |
| Mean | 2.23 ms |
| p95 | 3.87 ms |
| p99 | 4.12 ms |
| Max | 4.12 ms |

Call chain: `matchEngine.simulateMatch` → `SimulationEngineV2.simulateMatch`
(engine/match-simulation.ts:146). BO3 mean implies a per-map cost of ~1.06 ms
(BO3s average ~2.1 maps before someone clinches 2–0).

### 2. Weekly tick (`atomicWeekProcessor.processWeek`, single call)

| Stat | Value |
|---|---:|
| Total | 68.6 ms |
| Matches simulated by tick | 0 |
| Implied per-match cost inside tick | n/a |
| Derived daily-equivalent budget (500.0 ms × 7) | 3.50 s |

`processWeek` covers training, fatigue, injuries, finance, tournament
processing, match simulation, standings, events, AI, retirements, rest
days, narrative, career-stats rollups, and save persistence (engine/atomic-week-processor.ts:108).

### 3. Full-season sim (52 weeks of `processWeek`)

| Stat | Value |
|---|---:|
| Total wall-clock | **17.23 s** |
| Sum of per-week durations | 17.17 s |
| Matches simulated | 1546 |
| Avg per-match cost (season / matches) | 11.1 ms |
| Avg per-week cost | 330.1 ms |
| Median week | 334.5 ms |
| p95 week | 498.5 ms |
| Max week | 562.2 ms |

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

## Notes

- The `matchesPlayed` figure reported by `processWeek` only counts league
  matches processed via `processMatches`. Tournament-bracket matches
  simulated inside `processTournaments` (via `TournamentManager.simulateConcurrentMatches`
  and `simulateAllPendingBracketMatches`) are additional work not reflected
  in that counter, so the true per-match cost during a tick is likely
  **lower** than the naive `weekMs / matchesPlayed` division above.
- The "full season" column uses wall-clock (includes awaited save persistence),
  not just sum-of-work; they should be within a few percent on the in-memory
  storage adapter.
- All measurements come from the dev build running under `tsx` (ts-node-style).
  A production (`next build`) environment may be faster due to AOT compile
  and deoptimisation avoidance — worth re-running there before optimising.

---

*Baseline only — no optimisations applied.*
