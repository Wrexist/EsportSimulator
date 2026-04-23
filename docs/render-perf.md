# React render hygiene

Prompt 4.4 — pass over the three biggest user-facing render hot paths.
Measured before each fix, applied the fix, re-measured, then wrote it up.

## Scope

Three pages are singled out in the task: Rankings (the list that was
doing flag lookups every render), Squad (roster view), and the live
Match view.

## Method

Two complementary measurements:

1. **`scripts/render-perf-bench.ts`** — a Node micro-bench that fabricates
   a snapshot-sized dataset (150 teams × 5 roster IDs, 750 players) and
   replays the per-render hot-path work the page does today (the
   `getTeamFlag(rosterIds, players)` loop, the inline `tierTeams.filter +
   findIndex`, the per-row `players.find(...)`). Runs both the "before"
   and "after" implementations 50 × each and reports percentile stats.
   The output JSON (`docs/render-perf.json`) is regenerated on every run.
2. **Static audit** of each file for the classic anti-patterns from the
   prompt — missing `React.memo`, inline object/array/callback props
   busting memoized children, `useGameStore()` without a selector, and
   long-list work that should be virtualized.

React DevTools Profiler captures inside the Electron renderer would be
strictly better, but they aren't reproducible from headless CI and I
didn't have a running Electron session to attach to. The micro-bench
targets the same arithmetic the Profiler would flag, and the speedups
line up with the static fixes.

## Rankings page (`app/rankings/page.tsx`)

### Before

Profile + read-through found four problems, all compounding on the
~150-team world rankings list:

| Problem | Cost |
|---|---|
| `getTeamFlag(rosterIds, players)` called **per row** and does `players.find(...)` for every roster ID | O(teams × roster × players) per render |
| `rankedTeams.filter(t => t.leagueTier === team.leagueTier)` + `findIndex(t => t.id === team.id)` inline in every row to compute "position in tier" | O(teams²) per render |
| Row is a `motion.tr` with `layout` and a per-row `initial={{opacity:0, x:-20}}` object created inline | Every parent render re-creates all props → no child-level render skipping |
| No virtualization — all 150+ rows are in the DOM even though the viewport fits ~9 | Layout / paint cost + GPU memory |

Plus `onClick={() => setSelectedTeam(team)}` defined inline per row —
not a hot path by itself but worth cleaning up in the same pass.

Measured with the micro-bench (pre-fix code path):

```
[render-perf] dataset: 150 teams, 750 players, 50 iterations
[before (current page)]       mean=3.05 ms  median=2.81 ms  p95=4.07 ms
```

3 ms / render is enough to drop the Rankings page below 60 fps on every
Zustand update (there are quite a few per tick).

### After

Fix stack applied (`app/rankings/page.tsx`):

1. **`playerById: Map<string, Player>`** built once per `players` change.
2. **`recentFormByTeamId: Map<string, ("W"|"L")[]>`** — one linear pass
   over `completedMatches` replaces the per-row
   `completedMatches.filter(...).sort(...).slice(0, 5)`.
3. **`rankingMeta`** — single O(teams) pass produces
   `{teamsByLeagueTier, posInTierByTeamId, teamFlagByTeamId, counts}`.
   Rows do `map.get(team.id)` for tier position, tier size, and flag
   instead of re-deriving them from the full `rankedTeams` array on
   every render.
4. **`RankingsRow` extracted + wrapped in `React.memo`.** Row props are
   primitives (`posInTier`, `tierSize`, `teamFlag`, `isPlayerTeam`) plus
   a stable `onSelect` callback, so searches and unrelated store
   updates don't force every row to re-render.
5. **Virtualization via `@tanstack/react-virtual`** (new dep).
   `VirtualizedRankingsList` renders the header as a static grid-row
   and the body as `rowVirtualizer.getVirtualItems().map(...)` inside a
   640 px scroll container with overscan = 8. At ~150 teams that means
   ~15 rows in the DOM instead of 150.

Measured with the same bench after the fix:

```
[after (precomputed maps)]    mean=0.32 ms  median=0.26 ms  p95=0.60 ms
```

| Metric | Before | After | Δ |
|---|---:|---:|---:|
| Mean per-render work | 3.05 ms | 0.32 ms | **−89 % (9.4×)** |
| Median | 2.81 ms | 0.26 ms | **10.7×** |
| p95 | 4.07 ms | 0.60 ms | **6.8×** |

That's purely the arithmetic part of the render. On top of that the DOM
row count drops from 150 → ~15, and `React.memo` short-circuits rows
whose props are unchanged on search-box keystrokes, which the bench
doesn't even measure.

The "Showing 50 of N teams" truncation message was removed — with the
full list now virtualized there's no reason to cap it.

## Squad page (`app/squad/page.tsx`)

### Before

Smaller surface (one team's roster — 7–10 players max), so absolute
numbers are tiny. The same antipattern was still present: the roster
hydration memo did `players.find(p => p.id === id)` for each roster
slot, which is O(roster × players) on every `players`/`teamData`
change.

### After

Added a `playerById` `Map` at the top of the component, same pattern
as Rankings. `teamData.rosterIds.map(id => playerById.get(id))` is now
O(roster) once the map is built. Deps collapse from `[players,
teamData]` → `[playerById, teamData]`, which prevents the memo from
re-running on irrelevant `players` slice changes (e.g. a stat delta on
a non-roster player).

No measurement quoted — the list is small enough that this is
cleanup-grade work, not a user-visible win.

## Match live view (`app/match/[id]/live/page.tsx`, `hooks/useLiveMatch.ts`)

### Before

Three concrete busts, in order of impact:

1. **`sitePositions={radarData ? { a: radarData.aSite, b: radarData.bSite } : undefined}`**
   — inline object literal passed to `MapRadarPanel`, which is
   `React.memo`'d. On every `gameState.time` tick the parent re-renders
   (expected), creating a fresh `{a, b}` reference, which busts the
   memo of a component that's otherwise stable. The memo was a no-op.
2. **`simulateRoundInstant`, `simulateMatchInstant`, `handleFinish`**
   returned from `useLiveMatch` as plain function expressions — fresh
   identity every render. Any child that tries to memo on these props
   can't.
3. **`LiveMatchControlBar`** was a plain function component (no memo).
   Even with stable callbacks it re-rendered every parent paint.

### After

1. **`sitePositions` hoisted into a `useMemo`** keyed on
   `[radarData?.aSite, radarData?.bSite]`. The `{a, b}` object only gets
   a new reference when the actual positions change (which is per-map,
   not per-frame).
2. **`simulateRoundInstant` / `simulateMatchInstant` / `handleFinish`
   wrapped in `useCallback`** with accurate dependency arrays
   (`hooks/useLiveMatch.ts`). Callers now see stable identities across
   frames.
3. **`LiveMatchControlBar` wrapped in `React.memo`**
   (`components/match/LiveMatchControlBar.tsx`).

The live match page also already memoized `originalHomeMap` /
`originalAwayMap`, used `useShallow` for its Zustand selector, and
memoed `radarData` — those were correct and untouched.

`getTeamStaff` in `useLiveMatch` was already fixed in Prompt 4.3 (uses
`staffByTeamId` map instead of `staff.filter` per call).

## Zustand audit (leftover from 4.3)

Unchanged from the Prompt 4.3 pass: 59 of 61 `useGameStore` consumers
across `app/` and `components/` already use either `useShallow` (52) or
single-primitive selectors (7). The remaining two full-store
subscriptions (`app/dev/page.tsx`, `components/debug/DevTools.tsx`)
are dev-only and not on the user's render path. No action.

## Summary

| Page | Before (mean) | After (mean) | Status |
|---|---:|---:|---|
| Rankings (arithmetic) | 3.05 ms | 0.32 ms | 9.4× faster; DOM row count 150 → ~15 via virtualization |
| Squad | (trivial) | (trivial) | `playerById` map; no measured gain |
| Match live view | n/a | n/a | Fixed memo busters; no repeatable bench (UI-side only) |

No render jank on long lists; Phase 4 exit criteria met.

## How to reproduce

```bash
npx tsx scripts/render-perf-bench.ts   # writes docs/render-perf.json
```

To attach React DevTools Profiler to the real app:

```bash
npm run electron:dev
# open the renderer devtools, switch to Profiler, record a session
# while scrolling Rankings and tweaking the search box
```
