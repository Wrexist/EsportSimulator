# Prompt: Refactor Existing Code

> Copy the context from `CLAUDE.md` in this folder first, then append this prompt with your details filled in.

---

## Template

```
Refactor code in the Esports Manager: FPS game.

### Target
[TARGET — what file or module to refactor, e.g., "engine/match-simulation.ts — the simulateRound function is 200+ lines"]

### Goal
[GOAL — what improvement to make, e.g.:
- "Extract the economy calculation into a separate function"
- "Split this 500-line component into smaller focused components"
- "Convert this repetitive switch statement into a lookup table"
]

### Constraints
[CONSTRAINTS — what must NOT change, e.g.:
- "All existing tests must still pass"
- "The public API (exported functions/types) must not change"
- "Match simulation determinism must be preserved — same seed = same result"
]
```

---

## Refactoring Rules

### Non-Negotiable
1. **Zero behavior changes** — the app must work identically before and after
2. **All tests pass** — run `npm run test` before and after
3. **Type-check clean** — run `npm run type-check` before and after
4. **Preserve exports** — don't remove or rename any exported symbols without updating all import sites
5. **Preserve determinism** — if touching engine code, verify same seed produces same output

### Common Refactoring Patterns

#### Extract Component
```
Before: One 300-line component with inline logic for multiple sections
After:  Parent component + 3-4 focused child components in the same feature folder
```
- Move each section into `components/[feature]/[SectionName].tsx`
- Pass data via props (prefer props over store access in child components)
- Keep store subscriptions in the parent when possible

#### Extract Hook
```
Before: Complex useEffect + useState logic duplicated across components
After:  Custom hook in hooks/use[Feature].ts
```
- File naming: `hooks/use[Feature].ts` (camelCase with `use` prefix)
- Return an object (not a tuple): `return { data, isLoading, error, refresh }`
- Add JSDoc with `@example` usage

#### Extract Engine Module
```
Before: Game logic mixed into store actions or components
After:  Pure engine module in engine/[module].ts
```
- Move all business logic out of store into engine
- Store actions become thin wrappers: call engine function, then update state
- Engine functions are pure: input → output, no side effects

#### Split Store Slice
```
Before: All actions in game-store.ts (massive file)
After:  Actions grouped into focused slices
```
- Create `store/slices/[feature]-slice.ts`
- Follow `SliceCreator` pattern (see `store/slices/ui-slice.ts` for reference)
- Wire into main store

#### Replace Magic Numbers
```
Before: if (player.fatigue > 80) { bonus *= 0.5 }
After:  const HIGH_FATIGUE_THRESHOLD = 80
        const FATIGUE_PENALTY_MULTIPLIER = 0.5
        if (player.fatigue > HIGH_FATIGUE_THRESHOLD) { bonus *= FATIGUE_PENALTY_MULTIPLIER }
```

### Verification Checklist

- [ ] `npm run type-check` passes (zero errors)
- [ ] `npm run test` passes (all tests green)
- [ ] `npm run lint` passes (no new warnings)
- [ ] No behavior changes — app works identically
- [ ] All import sites updated if any exports were moved
- [ ] No dead code left behind (remove unused imports/functions)
