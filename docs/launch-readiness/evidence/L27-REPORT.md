# L27 — performance measurement and long-career fixes (TODO E8)

4 October 2026, branch `claude/performance-l27` (base `0adb090b`). **Partial; release still NO-GO.** One development machine measured. Long careers had a save-breaking size problem and multi-second main-thread stalls. Both are fixed here without changing simulation results. Minimum-spec hardware, live-match frame pacing and a packaged rerun of the fixed build are still open.

## Machine (the only machine measured)

| | |
|---|---|
| CPU | Intel Core i5-12600K (10 cores / 16 threads, 3.7 GHz base) |
| RAM | 31.7 GB |
| GPU / display | NVIDIA GeForce RTX 3060, 1920×1080 at 143 Hz |
| Storage | Measured paths on C: (NVMe SSD) |
| OS | Windows 11 Pro 10.0.26200 |
| Runtime | Node 22.18.0 (harness); packaged app Electron 44.3.0 / Chrome 152 |

This is a mid/high-end desktop. No number below is a minimum-spec result.

## Method

- **Career harness:** `scripts/launch/l27-career-performance.ts`. It drives the real `useGameStore.advanceWeek` path: snapshot, pre-tick, FPL, bridge, `computeWeek`, commit, post-week work and `saveGame`. Own fixtures are played first with `simulateInstantMatch`. It records per-phase timings (`ESM_PERF_TRACE_STEPS`), forced-GC heap, and per-week state/RNG hashes. Node has no Web Worker, so the bridge runs its synchronous fallback. `coord.04_compute` is the work the app does in its worker thread. Every other `coord.*`/`save.*` phase runs on the renderer main thread ("main thread" below). Storage is in memory. Disk cost is measured separately with the packaged writer, `electron/game-storage.js` (temp file + fsync + rename).
- **Inputs:**
  - early: a new career (frozen once in `tmp/l27/early-w1.json.gz`), 2 warm-up weeks, then 52 measured weeks.
  - mid: long-career seed 1 at week 160.
  - late: seeds 1 and 2 at week 521 (season 10, about 4,200 players), from the 30-seed campaign (`final-3258d16a`).
  - Late inputs exceed the 32 MiB load guard, so they are injected with `setState`. This is identical in both runs.
  - Mid/late: 2 warm-up weeks, then 12 measured weeks (late2: 8).
  - Save and load: 4 samples each. Harness reproducibility was checked by two baseline runs: RNG and full state matched byte for byte.
- **Before/after:** identical inputs, machine, flags and sequential runs. "Before" is the original code plus the timing hooks only.
- **Packaged app:** `scripts/launch/l27-packaged.cjs` drives a **copy** of `dist/win-unpacked` (built from `0adb090b`) over CDP. It uses an isolated `--user-data-dir` under `tmp/`, and the copy has `resources/LOCAL-QA-ONLY`, which disables Steam. Profiles are seeded by `scripts/launch/l27-seed-profile.ts` with the app's own disk layout and signing.
  - Startup: 1 first launch on a new profile plus 6 repeat launches, timed to "New Career" rendered and the save list loaded. OS file-cache state is not controlled.
  - Route latency: number-key shortcut, then `data-route` changes, then 2 animation frames.
  - Weeks: CONTINUE clicked, then controls re-enabled, with Long Tasks API entries.
  - Memory: forced-GC CDP metrics every 13 weeks.
- **Physical rounds:** `scripts/launch/l27-physical-timing.ts`. Each run is one process with rows in sequence. Every output hash must equal its v14 acceptance receipt. The first two Mirage rows overlapped short harness runs.

## Before / after (career harness, medians, ± = standard deviation)

| Scenario (n weeks) | Week wall ms | Main-thread ms | Save ms (n=4) | Load ms (n=4) | Save size MiB (gzip) | Heap after GC MB |
|---|---:|---:|---:|---:|---:|---:|
| early, season 1 (52) | 1,147 ± 334 → **594 ± 129** | 785 ± 281 → **369 ± 117** | 324 ± 17 → **263 ± 27** | 715 → **595 ± 10** | 13.2 (1.7) → **11.6 (1.5)** | 190 → 169 |
| mid, week 160 (12) | 2,232 ± 122 → **954 ± 74** | 1,641 ± 122 → **614 ± 69** | 562 ± 40 → **295 ± 17** | 1,252 → **797 ± 98** | 22.7 (2.9) → **15.7 (2.0)** | 351 → 241 |
| late, week 521, seed 1 (12) | 4,067 ± 158 → **1,148 ± 94** | 3,107 ± 98 → **698 ± 43** | 1,116 ± 77 → **345 ± 34** | **refused** (42.7 MiB > 32 MiB) → **1,060 ± 72** | 42.7 (5.5) → **19.5 (2.4)** | 575 → 309 |
| late, week 521, seed 2 (8) | 4,358 ± 213 → **1,181 ± 85** | 3,263 ± 176 → **701 ± 48** | 1,172 ± 57 → **369 ± 17** | **refused** (43.1 MiB) → **1,090 ± 118** | 43.1 (5.5) → **19.9 (2.4)** | 583 → 312 |

Worker-thread compute (`coord.04_compute`, which included the removed bridge clone before): early 302 → 179, mid 570 → 299, late 941 → 416 ms. Late main-thread phases before → after:

| Phase | Before | After |
|---|---:|---:|
| Commit | 1,490 | 12 |
| Bridge input clone | 500 | 0 |
| Snapshot clone | 508 | 194 |
| Save clone | 476 | 198 |
| Integrity hash | 287 | 153 |
| Second stringify | 222 | 0 |

Instant match (store `simulateInstantMatch`): early median 54 → 52 ms (n=40), mid 93 → 70 ms (n=8). Disk (packaged writer, one fsync'd write): late 62 → 38 ms, read 63 → 35 ms. A full commit does up to 5 writes and 5 reads (3 backups, staging, primary, 2 verifications), plus IPC.

**Determinism:** [comparison](L27-career-comparison.json) covers 92 compared weeks over 4 scenarios, warm-up weeks included.
- RNG state is identical every week.
- All save state except `fplData.matchHistory` is byte-identical.
- The newest 200 FPL records are identical.
- With the FPL cap temporarily disabled, the full canonical state is byte-identical to the baseline for 32 early and 8 late weeks ([no-cap comparison](L27-career-comparison-nocap.json)). The other optimizations therefore change nothing.

Physical v14 receipt hashes also match (14/14).

## Findings and fixes

1. **Long careers outgrew storage (correctness).** `fplData.matchHistory` gained about 28 records a week and nothing reads it. By week 521 it was 24.5 MB of a 44.6 MB save. Crossing 32 MiB (around week 340, season 7 on seed 1) has two effects:
   - The Electron IPC rejects the write, so every post-week save fails ("Disk save failed").
   - `SaveManager` refuses to load anything that large.

   **Fix:** `compactPersistentState` keeps the newest 500 records (`ARRAY_CAPS.fplMatchHistory`). Season-10 saves go from 42.7 to 19.5 MiB. Projected growth is about 0.6 MiB a season, so the limit is reached around season 30.
2. **Commit froze the UI.** `Object.assign(draft, processedSave)` inside an Immer producer made Immer walk and deep-freeze the whole save every tick: 0.35 s in season 1 and 1.5 s at season 10. The worker result is now finished in place and committed as a plain partial. Values are identical. The state is unfrozen, as it already is after `loadGame`.
3. **Double clone.** The coordinator's private snapshot was structured-cloned again by the bridge. `processWeek(..., { inputOwned: true })` skips that clone. The default still captures a copy.
4. **Double serialization on save.** The integrity payload is reused for the stored text (`serializeSignedSave`). Output equals `JSON.stringify(save)`, checked by test, and the code falls back when key order differs.
5. **AI recruitment scan.** Clubs at 5–6 players missing an IGL/AWPer re-quoted every free agent (about 3,000 by season 10) every week. Only role-eligible candidates are quoted now. The pick and state are unchanged, checked by test and the hash comparison.
6. **Renderer memory.** Steam's achievement callback was created inside `loadGame`, which kept a full copy of the loaded save alive all session. It is now built outside that scope.
7. **Truthful progress (L27.A2).** The week overlay used to loop five decorative stages. It now shows the real stage from the store: preparing → simulating → applying → saving. Long careers sit in "simulating" and "saving" for seconds.

## Packaged app (`0adb090b` copy, Steam disabled, before fixes only)

| Measure | Result |
|---|---|
| Startup to interactive menu | First launch on a new profile: 1,885 ms. Repeat launches: median 1,861 ms, sd 118, max 1,922 (n=6). With Steam running and enabled: first launch 5,989 ms, repeat median 1,995 ms (n=6). |
| Continue career to dashboard | Season 1: 259 ms. Week 160 (22.6 MB save): 938 ms. |
| Route change (8 main routes) | Season 1: median 92 ms, p90 159, max 212 (n=56). Week 160: median 126 ms, max 275 (n=24). Dashboard `/` is slowest (median 235 ms at week 160). |
| Week advance to controls re-enabled | Season 1: median 1,455 ms, p90 1,893 (n=52). Week 160: median 2,932 ms, max 3,385 (n=8). |
| Longest renderer long task per week | Season 1: median 322 ms, max 552. Week 160: median 682 ms, max 774. |
| Own-fixture flow (tactics → instant sim → result → dashboard) | Median 340 ms (n=23) |
| 52-week session, after forced GC | JS heap 12 → 216 MB. DOM nodes 888 → 23,676. Listeners 363 → 2,521. Intervals stay at 0 and pending timeouts at 1, so no timer leak. |

**Memory:** a fresh load of the same week-53 career uses about 29 MB of heap, so roughly 185 MB is session retention. Heap snapshots over 8 weeks ([summary](L27-packaged-heap.json)) show three sources:
- One retained serialized save string (`SaveManager.lastVerifiedPrimary`, about 2× the save size).
- The Steam-callback scope, fixed in item 6.
- Up to about 20 holders pinning older state copies: React fiber memoized selectors and V8 allocation-site feedback. Every tick replaces every object, so each stale holder pins a whole state.

The DOM growth is bounded by the dashboard rendering the full capped news feed (200 items) and to-do list. This is not certified leak-free.

Live-match frame pacing: **NOT RUN.**

## Physical rounds (v14, combat, A 4326170 / B 4326171; ms; ×real time)

Mirage 32,941 (2.28×) / 47,752 (1.54×); Inferno 29,031 (1.55×) / 33,342 (1.30×); Overpass 20,743 (3.09×) / **105,018 (0.62×)**; Vertigo 10,751 / 20,453; Ancient 10,729 / 7,356; Anubis 30,209 (2.08×) / 43,904 (1.16×); **Sandstone 31,977 (2.87×) / 18,049 (3.33×)**, against the recorded 51 s / 31 s. Mesh/nav load: 0.25–2.8 s per map.

Profile (Sandstone A): `CollisionScene.raycast` is 76% of self time, mostly via `bodyHit` sweeps and route checks. The BVH is already iterative. Faster traversal (flattened nodes, nearest-child-first) risks changing triangle tie-breaking, so it was not attempted under the byte-identical rule. Physical play stays rehearsal-only.

## Proposed budgets (PROPOSED, not accepted)

| Metric | Proposed budget | Now on this machine |
|---|---|---|
| Startup to interactive menu | ≤ 3 s repeat, ≤ 6 s first launch | 1.9 s / 1.9–6.0 s |
| Route change | ≤ 250 ms p90 | 159–275 ms (before fixes) |
| Main-thread work per week | ≤ 400 ms season 1, ≤ 1 s season 10; no single task > 250 ms | 369 / 698 ms total. The largest single block is now the snapshot clone (about 194 ms late). |
| Week advance end to end | ≤ 2 s season 1, ≤ 4 s season 10, with truthful stage display | Harness 0.6 / 1.2 s; packaged before: 1.5 / 2.9 s (week 160) |
| Save | ≤ 500 ms p95 including disk; size ≤ 24 MiB at season 10 | 345 ms + disk; 19.5 MiB |
| Load | ≤ 1.5 s at season 10 | 1.06 s (harness) |
| Session memory | No growth beyond 2× fresh-load heap after 52 weeks | About 7× (before fixes) |
| Physical round compute | ≥ 1× real time on minimum spec before any live adoption | 0.62–5.5× here |

## Needs minimum-spec hardware

Every row above, especially:
- Packaged week advance and long tasks (single-thread speed).
- Save with fsync on HDD/SATA SSD (5+ full-size writes per week).
- Startup and first launch on cold storage.
- Physical rounds (Overpass B already runs below real time here).
- Session memory on 8 GB machines.
- 60 Hz live-match playback (not yet measured at all).

## Remaining risks

- The fixed build was **not** re-measured as a packaged app. The electron-builder package from this worktree (node_modules is a junction) dropped transitive modules. A hybrid repack hung at startup, so both were discarded. The Node harness is the evidence for the fixes.
- Renderer retention (serialized primary string, stale state copies) and the dashboard's full-list DOM are unfixed.
- Packaged week 168 on the mid career: "Play match" was offered, but quick sim led to "MATCH NOT FOUND" ([mid run](L27-packaged-before-mid.json); the session stopped at week 168). Needs triage as a possible gameplay defect.
- **Account side effect during measurement:** early smoke runs of the unmodified release exe initialized Steam as the logged-in user. They wrote two test careers to Steam Cloud for app 4326170 (`save_save_l27_early.json`, `save_save_1791065661079_vakrwi_82ecrz.json` in `Steam/userdata/66795290/4326170/remote`). They may also have set achievements, stats or Rich Presence. The owner should delete these files and reset test achievements. The packaged driver now refuses builds without `LOCAL-QA-ONLY`.
- Save over 32 MiB is still possible after about 30 seasons. Browser/IndexedDB saves already over 32 MiB still cannot load.

## Evidence

- Career runs: `L27-career-{before,after}-{early,mid,late,late2}.json`, [comparison](L27-career-comparison.json), [no-cap comparison](L27-career-comparison-nocap.json), `L27-career-nocap-*.json`.
- Packaged runs: `L27-packaged-before-{startup,early,mid}.json`, `L27-packaged-steam-startup.json`, `L27-packaged-heap.json`.
- Physical: `L27-physical-before.json`.
- Tools: `scripts/launch/l27-*.{ts,cjs}`.
- Tests: `__tests__/l27-tick-performance.test.ts`, `__tests__/l27-week-progress.test.ts`.

The 14 September increment (recruitment quote reuse, [budgets](L27-BUDGETS.md), compute soak, asset census) still stands. Its files are unchanged; see git history for the earlier text of this report.
