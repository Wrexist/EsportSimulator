# Prompt: Diagnose and Fix a Bug

> Copy the context from `CLAUDE.md` in this folder first, then append this prompt with your details filled in.

---

## Template

```
Fix a bug in the Esports Manager: FPS game.

### Bug Description
[DESCRIPTION — what is going wrong, e.g., "Player morale drops to 0 after every match regardless of result"]

### Steps to Reproduce
[STEPS — how to trigger the bug, e.g.:
1. Start a new game
2. Play a match and win
3. Check player morale on the squad page — it shows 0 for all players
]

### Expected Behavior
[EXPECTED — what should happen, e.g., "Winning a match should increase morale by 5-15 points, not reset it to 0"]

### Actual Behavior
[ACTUAL — what happens instead, e.g., "All player morale values are 0 after any match simulation"]

### Relevant Files (if known)
[FILES — e.g., "Probably in engine/match-simulation.ts or the morale update in atomic-week-processor.ts"]

### Error Messages (if any)
[ERRORS — paste any console errors, TypeScript errors, or stack traces]
```

---

## Debugging Guide for This Project

### Common Bug Sources

1. **State Mutation Outside Immer**
   - Symptom: State seems to update but UI doesn't reflect it, or state resets unexpectedly
   - Cause: Mutating objects directly instead of inside `set((state) => { ... })`
   - Fix: Ensure ALL mutations go through Zustand's `set()` with Immer

2. **Missing `useShallow`**
   - Symptom: Excessive re-renders, UI feels sluggish, unrelated components update
   - Cause: Selecting multiple store properties without `useShallow`, causing reference inequality
   - Fix: Wrap multi-property selectors in `useShallow`

3. **RNG Determinism Broken**
   - Symptom: Match replays produce different results, or test outcomes are inconsistent
   - Cause: Using `Math.random()` somewhere, or not passing `SeededRNG` correctly
   - Fix: Search for `Math.random` — replace with `rng.next()`. Ensure RNG state is properly threaded

4. **Save/Load Data Loss**
   - Symptom: Data missing after loading a save, or game crashes on load
   - Cause: New state fields not included in save-types.ts, or missing migration for existing saves
   - Fix: Add field to `GameSave` in `engine/save-types.ts`, provide default value for migration

5. **Off-by-One in Week Processing**
   - Symptom: Events happen a week early/late, matches scheduled on wrong day
   - Cause: Week/day comparison using `<` vs `<=`, or 0-indexed vs 1-indexed confusion
   - Fix: Check `currentWeek` and `currentDay` usage — weeks are 1-based, days are 1-7

6. **Entity Index Stale**
   - Symptom: O(1) lookups return undefined even though entity exists
   - Cause: Entity indexes (`_playerIndex`, `_teamIndex`) not rebuilt after state change
   - Fix: Ensure `buildEntityIndexes()` runs after bulk mutations

7. **Null Reference on Uninitialized State**
   - Symptom: Crash on page load with "Cannot read property of undefined"
   - Cause: Accessing store data before game is initialized or hydrated
   - Fix: Add `if (!isInitialized) return null` guard at top of component

### Diagnostic Approach

1. **Read the error** — check browser console, TypeScript errors, build output
2. **Trace the data flow** — from store → component → render, or engine → store → UI
3. **Check types** — run `npm run type-check` to catch type mismatches
4. **Search for patterns** — use grep to find where the buggy value is set/read
5. **Test in isolation** — write a focused test in `__tests__/` reproducing the bug
6. **Verify fix** — run `npm run test` and `npm run type-check` after fixing

### After Fixing

- [ ] Run `npm run type-check` — must pass with zero errors
- [ ] Run `npm run test` — all existing tests must pass
- [ ] Consider adding a regression test for the bug
- [ ] Test the fix manually in the game if possible
