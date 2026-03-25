# Prompt: Steam / Electron Integration

> Copy the context from `CLAUDE.md` in this folder first, then append this prompt with your details filled in.

---

## Template

```
Add a Steam/Electron feature to the Esports Manager: FPS game.

### Feature
[FEATURE — what Steam or Electron feature to implement, e.g., "Add Steam achievement unlocking for the new 'Comeback King' achievement"]

### Steam API Calls
[API — which Steamworks APIs are needed, e.g.:
- steamworks.achievement.activate("COMEBACK_KING")
- steamworks.stats.setInt("stat_comeback_wins", count)
]

### Trigger Point
[TRIGGER — when/where this should fire, e.g., "After a match simulation where the player wins after trailing 3-12 or worse"]

### UI Integration
[UI — any UI feedback needed, e.g., "Show a toast notification with the achievement name and icon when unlocked"]
```

---

## Architecture Overview

### Electron Main Process
- File: `electron/main.js`
- Handles: Window management, Steam SDK initialization, IPC listeners
- Steam App ID: `4326170`

### Steam Integration Layer
- File: `engine/steam-service.ts`
- Provides: `checkAchievements()`, `steamService` singleton
- Pattern: Game logic calls `checkAchievements(state)` after state changes, which checks all achievement conditions and unlocks via Steamworks.js

### Communication Flow
```
Game Logic (engine/) → Store Action (store/) → Steam Service (engine/steam-service.ts)
                                                       ↓
                                               Steamworks.js API
                                                       ↓
                                               Steam Client Overlay
```

### Steamworks.js Usage

```typescript
// Importing (only works in Electron context)
import steamworks from "steamworks.js"

// Initialize (done once in electron/main.js)
const client = steamworks.init(4326170)

// Achievements
client.achievement.activate("ACHIEVEMENT_API_NAME")
client.achievement.isActivated("ACHIEVEMENT_API_NAME")  // returns boolean
client.achievement.clear("ACHIEVEMENT_API_NAME")        // for testing

// Stats
client.stats.setInt("stat_name", value)
client.stats.getInt("stat_name")

// Leaderboards
client.leaderboard.findOrCreateLeaderboard("leaderboard_name", sortMethod, displayType)
client.leaderboard.uploadScore("leaderboard_name", score, "KeepBest")
```

### Achievement Pattern

To add a new achievement:

1. **Register in Steamworks Dashboard** — add API name, display name, description, icons

2. **Add Condition Check** in `engine/steam-service.ts`:
   ```typescript
   // Inside checkAchievements function
   if (!isActivated("NEW_ACHIEVEMENT")) {
     if (conditionMet(state)) {
       activate("NEW_ACHIEVEMENT")
     }
   }
   ```

3. **Trigger Check** — call `checkAchievements(state)` from the store action where the condition can change (match completion, weekly tick, etc.)

4. **UI Toast** — achievement unlocks already show via the Steam overlay, but you can also trigger an in-game toast:
   ```typescript
   state.toasts.push({
     id: crypto.randomUUID(),
     title: "Achievement Unlocked!",
     description: "Comeback King — Win after trailing 3-12",
     variant: "success",
   })
   ```

### Leaderboard Pattern

```typescript
// Push leaderboard data (typically during weekly tick)
const pushLeaderboards = (state: GameState) => {
  const team = state.teams.find(t => t.id === state.playerTeamId)
  if (!team) return

  uploadScore("lead_world_ranking", team.ranking)
  uploadScore("lead_major_wins", team.majorWins)
  uploadScore("lead_tournaments_won", team.tournamentsWon)
}
```

### Stat Tracking Pattern

```typescript
// Increment stats after events
const updateStats = (state: GameState) => {
  setInt("stat_total_wins", state.totalWins)
  setInt("stat_tournaments_won", state.tournamentsWon)
  setInt("stat_majors_won", state.majorsWon)
}
```

### Desktop-Only Guards

Some features only work in Electron (not web):

```typescript
// Check if running in Electron
const isElectron = typeof window !== "undefined" && window.process?.type === "renderer"

// Guard Steam API calls
if (isElectron) {
  try {
    steamService.activate("ACHIEVEMENT_NAME")
  } catch (error) {
    console.error("Steam API error:", error)
  }
}
```

### Existing Achievement API Names
```
FIRST_WIN, WIN_10, WIN_25, WIN_50, WIN_100, WIN_250, WIN_500
FIRST_TOURNAMENT, WIN_B_TIER, WIN_A_TIER, WIN_MAJOR, GRAND_SLAM, DYNASTY, PERFECT_TOURNAMENT
REACH_S_TIER, TOP_10_RANKING, NUMBER_ONE, COMEBACK_KING, UNDERDOG
FIRST_MILLION, BUDGET_10M, DEVELOP_STAR, HALL_OF_FAME_INDUCTION, LOYAL_TEAM, PROFIT_MASTER, ZERO_TO_HERO
TOURNAMENT_WIN, SEASON_COMPLETE, FIRST_TRANSFER
UNLUCKY, REDEMPTION
```

### Existing Leaderboard API Names
```
lead_world_ranking, lead_major_wins, lead_fastest_stier
lead_total_earnings, lead_win_streak, lead_tournaments_won
```

### Existing Stat API Names
```
stat_total_kills, stat_total_hs, stat_total_wins, stat_total_matches
stat_max_budget, stat_tournaments_won, stat_majors_won
stat_matches_lost, stat_peak_ranking, stat_players_developed, stat_prize_money
```
