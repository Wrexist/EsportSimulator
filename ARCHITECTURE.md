# Architecture Documentation

## Overview

The Esports Manager Simulator is built as an offline-first desktop application using Next.js 14 and Electron. The architecture prioritizes determinism, immutability, and offline functionality.

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
- All data stored locally via Electron's file system adapter (`storage-adapter.ts`)
- Simulation runs entirely on device
- No server calls or API dependencies

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   UI Layer (Next.js 14 + React)      │
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
│     Persistence Layer (Electron / storage-adapter)   │
│  • Current game save (versioned, SHA-256 integrity)  │
│  • Multiple save slots                               │
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
  → Returns 0-100 rating from weighted stats

calculateTeamChemistry(players: Player[]): number
  → Returns 0-1 chemistry multiplier

simulateMatch(home: Team, away: Team, comp: string): MatchResult
  → Deterministic match simulation with maps and stats

advanceWeek(players: Player[]): Player[]
  → Updates player form, fatigue, development
```

**Determinism:**
- Seeded PRNG using Mulberry32 algorithm (`engine/rng.ts`)
- Seed increments on each random() call
- Same seed + same state = same results

### Save Manager (`engine/save-manager.ts`)

**Responsibilities:**
- Atomic week ticks with rollback/resume on crash
- Versioned save files with SHA-256 integrity hashing
- Migration support for saves from version 1 onwards
- Multiple named save slots
- Auto-save on close and every 2 minutes

**Save Versioning:**
```typescript
CURRENT_SAVE_VERSION = 6   // Increment on schema changes
MIN_SUPPORTED_VERSION = 1  // Oldest save the migration system can upgrade
```

**Atomic Week Tick:**
```typescript
// 11-step week tick with checkpoint saves
// If interrupted, resumes from last completed step
// Prevents double-processing and save corruption
await AtomicWeekProcessor.processWeek(save, saveManager)
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
   - JSON serialization via Electron IPC to file system
   - Atomic writes with backup prevent mid-write corruption

### Memory Management

- Save index rebuilt once per week tick for O(1) entity lookups
- Indexes are ephemeral — not persisted, rebuilt from arrays on demand
- State mutations use Immer drafts to prevent accidental reference sharing

## Testing Strategy

### Unit Tests
- Simulation engine determinism
- Player rating calculations
- Match result generation
- Time progression logic

### Integration Tests
- Store actions update state correctly
- Save/load round-trip preserves data integrity
- Week tick atomic rollback works on simulated crash

### Property-Based Tests
- Same seed → same result (determinism)
- Player stats always 0-100 bounds
- Chemistry always 0-100 range

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

---

## Recent Refactor: Slice + Processor Architecture (Phases B–D)

The codebase went through a sustained slicing pass that broke up two
multi-thousand-line files into focused modules. The patterns below are
load-bearing — read these before touching `game-store.ts`,
`engine/processors/`, `engine/tournament/`, or `engine/ai-manager.ts`.

### Store: SliceCreator pattern

`store/game-store.ts` is now an orchestrator (~2.3k lines) that composes
**19 slice modules** under `store/slices/*`. Each slice exports a
`createXxxSlice` function typed against the full `StoreState`:

```typescript
export const createTransferContractSlice: SliceCreator<TransferActions> =
  (set, get) => ({
    transferPlayer: (...) => { set(state => { /* immer mutations */ }) },
    acceptTransferOffer: (eventId) => { /* ... */ },
  })
```

Slices live in `store/slices/`. The 19 are: settings, scouting, debug,
tournament, events, ui, sponsorship, match-ui, match-operations,
match-scheduling, match-simulation, team-drills, training, team-settings,
player-development, staff-management, team-facilities, transfer-contract,
academy.

What stays in `game-store.ts`: persist middleware lifecycle, save/load
lifecycle (`initializeNewGame`, `loadGame`, `saveGame`, `listSaves`,
`switchSave`, `deleteSaveInSlot`, `attemptSaveRecovery`), `advanceWeek`
(now 162 lines, was ~700), `advanceDay`, `advanceToWeekEnd`,
`partialize`, `onRehydrateStorage`.

### Cross-slice action calls

Slice actions may call other slice actions via `get()`:

```typescript
get().scheduleMatchForTeam(...)
get().applyTrainingResult(...)
```

This is safe because Zustand's `set()` is synchronous — immer mutations
land before `set()` returns, so the next `get()` reads the post-mutation
state. **Do not** `await` between cross-slice calls expecting a state
read in between; everything happens in a single tick.

### Indexed entity lookups

The store maintains `_teamIndex`, `_playerIndex`, `_contractIndex` maps
that are rebuilt on hydrate and on every mutation that adds/removes
entities. The canonical lookup pattern is:

```typescript
const team = state._teamIndex?.get(teamId)
  ?? state.teams.find(t => t.id === teamId)
```

The fallback is there because the index is transient (not persisted)
and may be momentarily stale during certain mutations. Always include
both branches.

### Engine: Processor pattern

`engine/atomic-week-processor.ts` was a 2,359-line monolith. It is now a
thin coordinator (~1,520 lines, with `advanceWeek` at 162 lines) that
delegates to **17 processor modules** under `engine/processors/*`.

Each processor exports a pure function with the signature:

```typescript
export function processXxx(save: GameSave, ctx: WeekTickContext): void {
    // mutate save in place
}
```

Processors mutate `save` directly because the caller already owns an
immer draft. The `ctx` carries any cross-cutting data (the RNG seed for
this tick, the player team id, week boundaries, etc.).

The 17 processors: ai-world-processor, auto-registration-processor,
event-processor, fanbase-growth, finance-processor, narrative-news,
post-tick-achievements, pre-tick-mutations, save-compactor,
scheduled-activities-processor, scouting-mission-processor,
sponsor-goals-processor, standings-processor, team-synergy-recalc,
tournament-completion, training-processor, weekly-activity-processor,
fpl-week-processor.

### Tournament: Module split

`engine/tournament-manager.ts` was 1,760 lines; now 1,358. Five modules
were extracted under `engine/tournament/`:

- **seeding-helpers.ts** — stable team-id hashing for deterministic
  tiebreakers
- **bracket-scheduling.ts** — `addBracketMatch`, `scheduleBracketMatch`,
  `assignMatchDay` (day-of-week conflict avoidance)
- **double-elim-handlers.ts** — winner/loser bracket progression
- **swiss-handlers.ts** — Swiss-format lifecycle (setup, round
  generation, result handling, playoff seeding)
- **league-schedule.ts** — round-robin via the circle method

Swiss handlers receive `SwissHandlerDeps` for the few callbacks that
need to reach back into `TournamentManager` (avoids circular imports).

### Determinism: SeededRNG derivation

Every RNG used in the engine is a `SeededRNG` (Mulberry32). To avoid
correlation across subsystems, derived RNGs use bitwise XOR with a
constant salt:

```typescript
const academyRng = new SeededRNG(baseSeed ^ 0xACADE)
const fplRng = new SeededRNG(rng.int(1, 999999))
const playoffSeed = (save.lastRngSeed ^ (save.currentWeek * 2654435761)) >>> 0
```

The Knuth multiplier (`2654435761`) is the standard hash mixer; the
`>>> 0` forces unsigned 32-bit.

### Immer draft type casting

When passing the store draft to engine functions typed against
`GameSave`, cast through `unknown`:

```typescript
processWeeklyAI(state as unknown as GameSave, playerTeamId, rng)
```

The immer draft is structurally compatible with `GameSave` but
TypeScript can't see through the proxy type. The cast is correct;
suppress the lint locally if needed.

### AI gameplay parity (Phase D5–D8)

AI teams now mirror player infrastructure paths in
`AIManager.processWeeklyAI`:

| Phase | Method            | Rate     | Gate                          |
|-------|-------------------|----------|-------------------------------|
| D5    | `manageStaff`     | 3%/week  | max 3 staff                   |
| D6    | `manageSponsors`  | 5%/week  | tier-gated by rank + history  |
| D7    | `manageFacilities`| 4%/week  | STABLE only                   |
| D8    | `manageAcademy`   | 3%/week  | STABLE only, same costs as UI |

Each method is a 50–80 line static on `AIManager` with no external
dependencies. They read `team.financialState`, `team.budget`, and the
relevant subsystem arrays, and mutate the save in place. All log to
`save.financeLedger` with category `FACILITIES` (or `WAGES_STAFF` /
`SPONSOR` as appropriate) for visibility.

### Match simulation module layout (Phase I refactor)

`engine/match-simulation.ts` was 2,020 lines as a single class. Phase I
broke it up into four focused modules while preserving the public API:

```
engine/
├── match-simulation.ts            (1,306 lines — SimulationEngineV2 facade)
└── match/
    ├── map-veto.ts                (147 lines)
    │   ├── calculateMapStrengths  skill+tactic weighting per map type
    │   ├── selectMapForVeto       noise-modulated top pick
    │   └── simulateMapVeto        full BO3 ban/ban/pick/pick/decider ladder
    ├── match-stats.ts             (193 lines)
    │   ├── determineMapMVP        most-kills MVP per map
    │   ├── generateMatchStats     K/D/A + ADR + KAST + HLTV rating aggregator
    │   └── determineMVP           highest-rating MVP on winning side
    └── round-outcome.ts           (493 lines)
        ├── determineWinType       round flavor (elim / defuse / explode / time)
        ├── pickWeighted           skill-weighted player selection
        ├── addKillEvent           event log + tally helper
        ├── generateRoundStats     full round event generation (clutch, plant,
        │                          defuse, save, headshot, trade, assist)
        └── PlayerSimulationState  per-player live state during a map
```

`SimulationEngineV2` keeps thin facade methods for every external
caller — `useLiveMatch.ts` and `match-simulation-slice.ts` hit the
singleton directly for `calculateMapStrengths` / `selectMapForVeto` /
`performBuyPhase` / `calculateTeamStrength` / `simulateRound` /
`generateMatchStats`. The facades preserve those import paths.

What stayed in match-simulation.ts: the orchestrator (`simulateMatch`),
the heavyweight `simulateMap` (round loop, side swaps, half-time
reset, overtime), `simulateRound` itself (265 lines of momentum/tilt/
stress/manAdvantage modifiers), `calculateTeamStrength`, and
`performBuyPhase`. Those weren't extracted because either their
cross-coupling to `simulateMap` is too tight (simulateRound) or
they're cohesive single-responsibility methods (calculateTeamStrength).

### Test coverage map

| Surface                          | Test file                                 |
|----------------------------------|-------------------------------------------|
| Save migration ladder            | `__tests__/save-manager.test.ts`          |
| Round-robin + Swiss tournaments  | `__tests__/tournament-modules.test.ts`    |
| Match engine adapter             | `__tests__/match-engine.test.ts`          |
| Map veto + map strengths         | `__tests__/map-veto.test.ts`              |
| Match stats aggregation          | `__tests__/match-stats.test.ts`           |
| Round outcome (integration)      | `__tests__/round-outcome.test.ts`         |
| Finance processor                | `__tests__/finance-processor.test.ts`     |
| Standings processor              | `__tests__/standings-processor.test.ts`   |
| Training processor               | `__tests__/training-processor.test.ts`    |
| Academy engine                   | `__tests__/academy-engine.test.ts`        |
| AI manager orchestration         | `__tests__/ai-manager.test.ts`            |
| Scouting tier unlock             | `__tests__/scouting-tier-unlock.test.ts`  |
| Chemistry/synergy                | `__tests__/chemistry.test.ts`             |
| Simulation engine determinism    | `__tests__/engine.test.ts`                |
| Critical user paths              | `__tests__/critical-path.test.ts`         |

Run with `npm test`. Current coverage: 234 tests across 19 suites.
