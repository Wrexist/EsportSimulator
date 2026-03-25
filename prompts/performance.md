# Prompt: Optimize Performance

> Copy the context from `CLAUDE.md` in this folder first, then append this prompt with your details filled in.

---

## Template

```
Optimize performance in the Esports Manager: FPS game.

### Problem Area
[AREA — what's slow, e.g., "The squad page takes 2-3 seconds to render when there are 500+ players in the game"]

### Current Behavior
[CURRENT — describe what happens, e.g., "Every player card re-renders when any store property changes. The full player list is mapped and rendered on every state update."]

### Target
[TARGET — what improvement you want, e.g., "Squad page should render in <500ms with 500 players. Only visible player cards should render."]
```

---

## Performance Optimization Patterns

### 1. React Rendering Optimization

**Granular Store Selectors** — avoid selecting more state than needed:
```typescript
// BAD — re-renders on ANY store change
const store = useGameStore()

// BAD — re-renders when any of the many properties change
const { teams, players, matches, currentWeek, ... } = useGameStore(s => s)

// GOOD — only re-renders when currentWeek changes
const currentWeek = useGameStore(s => s.currentWeek)

// GOOD — re-renders only when teams or players change (useShallow compares by reference)
const { teams, players } = useGameStore(useShallow(s => ({
  teams: s.teams,
  players: s.players,
})))
```

**React.memo** — prevent re-renders when props haven't changed:
```typescript
export const PlayerCard = React.memo(function PlayerCard({ player }: Props) {
  return <div>{/* ... */}</div>
})
```

**useMemo** — cache expensive computations:
```typescript
// Expensive filtering/sorting — memoize it
const sortedPlayers = useMemo(
  () => players.filter(p => p.teamId === teamId).sort((a, b) => b.skill - a.skill),
  [players, teamId]
)

// Expensive derived data
const teamStats = useMemo(() => calculateTeamStats(players, matches), [players, matches])
```

**useCallback** — stable function references for child components:
```typescript
const handleSelect = useCallback((id: string) => {
  setSelectedId(id)
}, [])
```

### 2. List Virtualization

For lists with 50+ items, only render visible items:
```typescript
// Use a virtualization library or render a windowed subset
const VISIBLE_COUNT = 20
const [visibleRange, setVisibleRange] = useState({ start: 0, end: VISIBLE_COUNT })

const visibleItems = useMemo(
  () => items.slice(visibleRange.start, visibleRange.end),
  [items, visibleRange]
)
```

### 3. Store Optimization

**Entity Indexes** — O(1) lookups instead of O(n) array scans:
```typescript
// The store already has these — use them:
// state._playerIndex: Map<string, PlayerSaveData>
// state._teamIndex: Map<string, TeamSaveData>
// state._staffIndex: Map<string, StaffSaveData>

// Use the index for lookups
const player = state._playerIndex?.get(playerId)
// Instead of
const player = state.players.find(p => p.id === playerId)  // O(n)
```

**Set for Membership Checks** — O(1) instead of Array.includes:
```typescript
// For repeated membership checks
const rosterSet = new Set(team.rosterIds)
const isOnTeam = rosterSet.has(playerId)  // O(1)
// Instead of
const isOnTeam = team.rosterIds.includes(playerId)  // O(n)
```

**Array Caps** — prevent unbounded growth:
```typescript
// Cap arrays to prevent memory/performance degradation
if (state.completedMatches.length > 2000) {
  state.completedMatches = state.completedMatches.slice(-2000)
}
```

### 4. Code Splitting

**Lazy-load heavy pages**:
```typescript
import dynamic from "next/dynamic"

const HeavyComponent = dynamic(() => import("@/components/heavy/HeavyComponent"), {
  loading: () => <LoadingSkeleton />,
})
```

### 5. Engine Optimization

**Batch Operations** — process multiple items in one pass:
```typescript
// BAD — multiple iterations
const injured = players.filter(p => p.isInjured)
const healthy = players.filter(p => !p.isInjured)
const available = healthy.filter(p => p.fatigue < 80)

// GOOD — single pass
const injured: Player[] = []
const available: Player[] = []
const fatigued: Player[] = []
for (const p of players) {
  if (p.isInjured) injured.push(p)
  else if (p.fatigue >= 80) fatigued.push(p)
  else available.push(p)
}
```

**Pre-compute During Weekly Tick** — expensive calculations that don't need to run on every render should run once during the weekly tick and store the result.

### Verification
- Profile with React DevTools Profiler to confirm fewer re-renders
- Measure render time with `performance.now()` before and after
- Run `npm run type-check` and `npm run test` to ensure no regressions
