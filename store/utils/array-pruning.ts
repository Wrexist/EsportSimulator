/**
 * Array Pruning Utilities
 * Enforces size caps on growing arrays to keep save files lean
 * and prevent unbounded memory growth during long play sessions.
 */

/** Default caps for game arrays - reduced from engine maximums */
export const ARRAY_CAPS = {
  completedMatches: 2000,
  eventsLog: 500,
  financeLedger: 2000,
  transferHistory: 1000,
  newsFeed: 200,
  academyMatchHistory: 200,
  academyWeeklyReports: 100,
} as const

/**
 * Prune an array to the cap, keeping the most recent entries.
 * Returns the same array reference if already within cap (no allocation).
 */
export function pruneArray<T>(arr: T[], cap: number): T[] {
  if (arr.length <= cap) return arr
  return arr.slice(0, cap)
}

/**
 * Apply all standard pruning to a game state object.
 * Call after each advanceWeek to keep arrays bounded.
 * Mutates the state in place (safe to use inside Immer draft).
 */
export function pruneGameState(state: {
  completedMatches: any[]
  eventsLog: any[]
  financeLedger: any[]
  transferHistory: any[]
  newsFeed: any[]
  academyMatchHistory?: any[]
  academyWeeklyReports?: any[]
}): void {
  if (state.completedMatches.length > ARRAY_CAPS.completedMatches) {
    state.completedMatches = state.completedMatches.slice(-ARRAY_CAPS.completedMatches)
  }
  if (state.eventsLog.length > ARRAY_CAPS.eventsLog) {
    state.eventsLog = state.eventsLog.slice(-ARRAY_CAPS.eventsLog)
  }
  if (state.financeLedger.length > ARRAY_CAPS.financeLedger) {
    state.financeLedger = state.financeLedger.slice(-ARRAY_CAPS.financeLedger)
  }
  if (state.transferHistory.length > ARRAY_CAPS.transferHistory) {
    state.transferHistory = state.transferHistory.slice(-ARRAY_CAPS.transferHistory)
  }
  if (state.newsFeed.length > ARRAY_CAPS.newsFeed) {
    state.newsFeed = state.newsFeed.slice(-ARRAY_CAPS.newsFeed)
  }
  if (state.academyMatchHistory && state.academyMatchHistory.length > ARRAY_CAPS.academyMatchHistory) {
    state.academyMatchHistory = state.academyMatchHistory.slice(-ARRAY_CAPS.academyMatchHistory)
  }
  if (state.academyWeeklyReports && state.academyWeeklyReports.length > ARRAY_CAPS.academyWeeklyReports) {
    state.academyWeeklyReports = state.academyWeeklyReports.slice(-ARRAY_CAPS.academyWeeklyReports)
  }
}
