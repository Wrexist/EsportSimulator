/**
 * Array Pruning Utilities
 * Enforces size caps on growing arrays to keep save files lean
 * and prevent unbounded memory growth during long play sessions.
 */

import { ARRAY_CAPS } from "@/engine/constants"
export { ARRAY_CAPS }

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
  // Academy arrays are newest-FIRST (populated via unshift), so keep the head,
  // not the tail — slice(-cap) here would discard the most recent entries.
  if (state.academyMatchHistory && state.academyMatchHistory.length > ARRAY_CAPS.academyMatchHistory) {
    state.academyMatchHistory = state.academyMatchHistory.slice(0, ARRAY_CAPS.academyMatchHistory)
  }
  if (state.academyWeeklyReports && state.academyWeeklyReports.length > ARRAY_CAPS.academyWeeklyReports) {
    state.academyWeeklyReports = state.academyWeeklyReports.slice(0, ARRAY_CAPS.academyWeeklyReports)
  }
}
