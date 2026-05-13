/**
 * Shared Constants
 * Single source of truth for array size caps and other shared configuration.
 * Used by both the engine (atomic-week-processor) and the store (array-pruning).
 */

/** Maximum sizes for growing game arrays.
 * These caps prevent unbounded memory growth during long play sessions
 * and keep save files lean. The engine compacts at these limits,
 * and the store prunes to the same limits after each week tick.
 */
export const ARRAY_CAPS = {
  completedMatches: 2000,
  eventsLog: 500,
  financeLedger: 2000,
  transferHistory: 1000,
  newsFeed: 200,
  tournamentQualifications: 2000,
  academyMatchHistory: 200,
  academyWeeklyReports: 100,
  hallOfFame: 500,
} as const
