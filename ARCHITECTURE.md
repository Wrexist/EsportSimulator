# Architecture Documentation

## Overview

The Esports Manager Simulator is built as an offline-first mobile application using React Native and Expo. The architecture prioritizes determinism, immutability, and offline functionality.

## Core Principles

### 1. Deterministic Simulation
All randomness uses seeded random number generation, ensuring:
- Same inputs always produce same outputs
- Time-travel debugging without state desyncs
- Reproducible bugs and testing

### 2. Immutable State
Using Zustand with Immer middleware:
- All state updates create new objects
- Previous states can be restored via snapshots
- Predictable state changes

### 3. Offline-First
No network dependency:
- All data stored locally in AsyncStorage
- Simulation runs entirely on device
- No server calls or API dependencies

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   UI Layer (React Native)            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Screens │  │Components│  │Navigation│          │
│  └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│            State Management (Zustand + Immer)        │
│  ┌──────────────────────────────────────────────┐  │
│  │           GameStore (game-store.ts)          │  │
│  │  • Game state (teams, players, matches)      │  │
│  │  • Actions (simulate, advance, save/load)    │  │
│  │  • Computed values                           │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
┌────────────────────┐  ┌────────────────────┐
│  Simulation Engine │  │  Snapshot Manager  │
│                    │  │                    │
│ • Player ratings   │  │ • Create snapshots │
│ • Team chemistry   │  │ • Restore states   │
│ • Match simulation │  │ • Time travel      │
│ • Time progression │  │                    │
└────────────────────┘  └────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│         Persistence Layer (AsyncStorage)             │
│  • Current game save                                 │
│  • Snapshot history (max 50)                         │
│  • User settings                                     │
└─────────────────────────────────────────────────────┘
```

## Module Details

### Simulation Engine (`engine/simulation-engine.ts`)

**Responsibilities:**
- Calculate player and team ratings
- Simulate matches deterministically
- Handle time progression and player development
- Apply modifiers (form, morale, fatigue)

**Key Methods:**
```typescript
calculatePlayerRating(stats: PlayerStats): number
  → Returns 1-20 rating from weighted stats

calculateTeamChemistry(players: Player[]): number
  → Returns 0-1 chemistry multiplier

simulateMatch(home: Team, away: Team, comp: string): MatchResult
  → Deterministic match simulation with maps and stats

advanceWeek(players: Player[]): Player[]
  → Updates player form, fatigue, development
```

**Determinism:**
- Seeded PRNG using Math.sin transformation
- Seed increments on each random() call
- Same seed + same state = same results

### Snapshot Manager (`engine/snapshot-manager.ts`)

**Responsibilities:**
- Create deep copies of game state
- Store snapshots in AsyncStorage
- Restore previous game states
- Manage snapshot limits (max 50)

**Snapshot Structure:**
```typescript
interface Snapshot {
  id: string              // Unique identifier
  timestamp: Date         // When snapshot was created
  gameDate: Date          // In-game date
  state: GameState        // Deep cloned game state
  description: string     // User-provided description
}
```

**Usage Pattern:**
```typescript
// Before risky action
await createSnapshot("Before signing player")

// If regret
await restoreSnapshot(snapshotId)

// Auto-snapshot before time advance
set((draft) => {
  await createSnapshot(`Before advancing ${weeks} weeks`)
  // ... time advance logic
})
```

### Data Generator (`engine/data-generator.ts`)

**Responsibilities:**
- Generate initial game data
- Create realistic player stats
- Build team rosters
- Generate competition schedules

**Generation Logic:**
```typescript
generatePlayer(game, position, quality)
  → Creates player with stats based on quality tier
  → Potential determines peak rating (5-20 scale)
  → Age affects current vs potential rating

generateTeam(game, name, quality, region)
  → Creates full roster based on game's positions
  → Sets facilities and budget by quality tier
  → Assigns region and reputation

generateMatches(competition, startDate)
  → Round-robin schedule
  → 3-day spacing between matches
```

### Game Store (`store/game-store.ts`)

**State Structure:**
```typescript
interface GameStore {
  // Core state
  currentDate: Date
  playerTeam: Team
  allTeams: Team[]
  competitions: Competition[]
  upcomingMatches: Match[]
  news: NewsItem[]
  notifications: Notification[]
  
  // Engine instances
  engine: SimulationEngine
  isLoading: boolean
  
  // Actions
  initializeGame(settings)
  advanceTime(weeks)
  simulateMatch(match)
  saveGame()
  loadGame()
  createSnapshot(description)
  restoreSnapshot(snapshotId)
}
```

**Action Patterns:**

1. **Initialize Game**
```typescript
initializeGame: (settings) => {
  const data = DataGenerator.generateInitialGameState(...)
  set((draft) => {
    draft.playerTeam = data.playerTeam
    draft.allTeams = data.allTeams
    // ... initialize state
  })
}
```

2. **Advance Time**
```typescript
advanceTime: async (weeks) => {
  await createSnapshot(`Before advancing ${weeks} weeks`)
  set((draft) => {
    // Update date
    draft.currentDate = addWeeks(draft.currentDate, weeks)
    
    // Update all players
    const allPlayers = draft.allTeams.flatMap(t => t.roster)
    const updated = engine.advanceWeek(allPlayers)
    
    // Reassign to teams
    draft.allTeams.forEach(team => {
      team.roster = team.roster.map(p => 
        updated.find(u => u.id === p.id) || p
      )
    })
  })
}
```

3. **Simulate Match**
```typescript
simulateMatch: (match) => {
  const result = engine.simulateMatch(...)
  set((draft) => {
    const matchIndex = draft.upcomingMatches.findIndex(...)
    draft.upcomingMatches[matchIndex].result = result
    
    // Add news
    draft.news.unshift({
      title: `${home} ${result.homeScore} - ${result.awayScore} ${away}`,
      ...
    })
  })
}
```

## Data Flow

### Match Simulation Flow

```
User taps match
      │
      ▼
matches.tsx calls handleSimulateMatch()
      │
      ▼
Calls store.simulateMatch(match)
      │
      ▼
Store calls engine.simulateMatch(home, away, comp)
      │
      ├─→ Calculate team strengths
      │   ├─→ Player ratings
      │   ├─→ Team chemistry
      │   ├─→ Coaching bonus
      │   └─→ Facilities bonus
      │
      ├─→ Determine winner probability
      │
      ├─→ Simulate BO3 maps
      │   ├─→ Map 1
      │   ├─→ Map 2
      │   └─→ Map 3 (if needed)
      │
      ├─→ Generate player stats
      │
      └─→ Determine MVP
      │
      ▼
Return MatchResult
      │
      ▼
Store updates state (immutably)
      │
      ├─→ Update match with result
      └─→ Add news item
      │
      ▼
UI re-renders with new result
```

### Time Progression Flow

```
User taps "Advance 1 Week"
      │
      ▼
matches.tsx calls handleAdvanceWeek()
      │
      ▼
Store calls advanceTime(1)
      │
      ├─→ Create auto-snapshot
      │
      ▼
Update game date (+7 days)
      │
      ▼
Get all players from all teams
      │
      ▼
Engine.advanceWeek(players)
      │
      ├─→ For each player:
      │   ├─→ Update age (+1/52 years)
      │   ├─→ Random form change (±5)
      │   ├─→ Reduce fatigue (-10)
      │   └─→ Apply development
      │       ├─→ Calculate dev rate
      │       │   ├─→ Growing: +rate
      │       │   ├─→ Peak: 0
      │       │   └─→ Declining: -rate
      │       └─→ Update each stat
      │
      ▼
Return updated players array
      │
      ▼
Reassign updated players to teams
      │
      ▼
UI re-renders with updated state
```

## Performance Considerations

### Optimization Strategies

1. **Immutable Updates**
   - Immer drafts prevent accidental mutations
   - Only changed branches trigger re-renders

2. **Selector Optimization**
   - Use specific selectors to avoid unnecessary re-renders
   ```typescript
   const roster = useGameStore(s => s.playerTeam.roster)
   // Not: const { playerTeam } = useGameStore()
   ```

3. **Lazy Computation**
   - Rating calculations only when needed
   - Chemistry computed on-demand

4. **Efficient Storage**
   - JSON serialization for AsyncStorage
   - Snapshots use deep clone, not references

### Memory Management

- Maximum 50 snapshots prevents unbounded growth
- Old snapshots auto-deleted when limit reached
- State deep cloned for snapshots, not shared

## Testing Strategy

### Unit Tests
- Simulation engine determinism
- Player rating calculations
- Match result generation
- Time progression logic

### Integration Tests
- Store actions update state correctly
- Snapshots restore accurately
- AsyncStorage persistence works

### Property-Based Tests
- Same seed → same result (determinism)
- Player stats always 1-20 bounds
- Chemistry always 0-1 range

## Future Enhancements

### Scalability Improvements
- Web Workers for heavy simulation
- Indexed DB for web version
- Compression for snapshot storage

### Feature Additions
- Network multiplayer (requires server)
- Historical stat tracking (time-series data)
- AI opponent strategies (ML models)

### Architecture Evolution
- Plugin system for game modules
- Event sourcing for full history
- GraphQL for future API layer
