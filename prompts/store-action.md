# Prompt: Add Store Actions / State

> Copy the context from `CLAUDE.md` in this folder first, then append this prompt with your details filled in.

---

## Template

```
Add new store functionality to the Esports Manager: FPS game.

### What It Does
[DESCRIPTION — what this store addition enables, e.g., "Track and manage player injuries with state for active injuries and recovery timelines"]

### New State Shape
[STATE — describe the new state fields, e.g.:
- injuries: Injury[] — list of active injuries with playerId, severity, weeksRemaining
- injuryHistory: InjuryRecord[] — historical injury log (capped at 500 entries)
]

### Actions Needed
[ACTIONS — list the store actions, e.g.:
- addInjury(injury: Injury) — add a new injury to the active list
- healInjury(playerId: string) — remove healed injury, move to history
- tickInjuries() — called weekly, decrement weeksRemaining on all injuries
]

### Persistence
[PERSISTENCE — should this be saved?
- "Yes — add to save-types.ts and include in save/load cycle"
- "No — transient UI state only, reset on reload"
]

### Integration
[INTEGRATION — how does this connect to existing systems, e.g.:
- "Called from atomic-week-processor during weekly tick"
- "Used by match simulation to exclude injured players"
- "Read by squad page to show injury indicators"
]
```

---

## Store Action Patterns

### Adding State to an Existing Slice

If the feature fits an existing slice (UI, tournament, academy, etc.), add to that slice:

```typescript
// store/slices/existing-slice.ts
export const existingInitialState: ExistingState = {
  // ... existing state
  newField: [],           // ADD new field with default value
}

export const createExistingSlice: SliceCreator<ExistingActions> = (set, get) => ({
  // ... existing actions

  // ADD new action
  newAction: (param: ParamType) =>
    set((state) => {
      state.newField.push(param)
    }),
})
```

### Creating a New Slice

For entirely new feature areas:

```typescript
// store/slices/[feature]-slice.ts
"use client"

import type { FeatureState, FeatureActions, SliceCreator } from "@/store/types"

export const featureInitialState: FeatureState = {
  items: [],
  selectedId: null,
}

export const createFeatureSlice: SliceCreator<FeatureActions> = (set, get) => ({
  addItem: (item) =>
    set((state) => {
      state.items.push(item)
    }),

  removeItem: (id) =>
    set((state) => {
      state.items = state.items.filter(i => i.id !== id)
    }),

  selectItem: (id) => set({ selectedId: id }),

  getSelectedItem: () => {
    const state = get()
    return state.items.find(i => i.id === state.selectedId) ?? null
  },
})
```

Then wire it into the main store:
1. Add types to `store/types.ts`
2. Import and spread slice in `store/game-store.ts`
3. Add initial state to the store's initial state

### Key Patterns

**Immer Mutations** — mutate the draft directly inside `set()`:
```typescript
// Adding to an array
set((state) => { state.items.push(newItem) })

// Removing from an array
set((state) => { state.items = state.items.filter(i => i.id !== id) })

// Updating a nested property
set((state) => {
  const player = state.players.find(p => p.id === playerId)
  if (player) player.morale = Math.min(100, player.morale + 10)
})

// Setting a simple value (no Immer needed for top-level)
set({ selectedId: id })
```

**Deterministic IDs** — use the store RNG helpers:
```typescript
set((state) => {
  const id = nextDeterministicId(state, "injury", playerId)
  state.injuries.push({ id, playerId, severity, weeksRemaining })
})
```

**Array Caps** — prevent unbounded growth for persisted arrays:
```typescript
set((state) => {
  state.injuryHistory.push(record)
  if (state.injuryHistory.length > 500) {
    state.injuryHistory = state.injuryHistory.slice(-500)
  }
})
```

**Accessing Other State** — use `get()` for reads:
```typescript
someAction: () => {
  const state = get()
  const team = state.teams.find(t => t.id === state.playerTeamId)
  if (!team) return
  set((draft) => { /* use team data */ })
}
```

### Persistence Checklist

If the new state needs to survive save/load:

1. **`engine/save-types.ts`**: Add new fields to `GameSave` interface
2. **`engine/save-manager.ts`**: Include new fields in save serialization and load deserialization
3. **Migration**: If modifying existing saves, add migration logic for the new version
4. **Array caps**: Define maximum sizes for arrays to prevent save bloat (see `store/utils/array-pruning.ts`)

### Consuming in Components

```typescript
// Single action
const addInjury = useGameStore(s => s.addInjury)

// Single state value
const injuries = useGameStore(s => s.injuries)

// Multiple values — MUST use useShallow
const { injuries, players } = useGameStore(useShallow(s => ({
  injuries: s.injuries,
  players: s.players,
})))
```
