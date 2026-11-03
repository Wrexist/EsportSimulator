/**
 * Tracks whether the loaded career has changed since it was last written to
 * disk, without serializing anything.
 *
 * The store replaces a slice's reference whenever it changes (immutable
 * updates), so remembering the references of the durable slices at the last
 * successful save or load is enough: any slice whose reference differs now
 * holds progress that is only in memory. A failed save records nothing, so
 * the career stays "unsaved" until a save succeeds.
 */

/**
 * Every store field the save snapshot writes (store/utils/build-save-snapshot.ts),
 * so any change a save would keep counts as unsaved. A test keeps the two in step.
 */
export const DURABLE_CAREER_KEYS = [
    "currentWeek", "currentDay", "teams", "players", "contracts", "tournaments", "staff",
    "scheduledMatches", "completedMatches", "customTactics", "autoTactics", "delegation",
    "transferHistory", "financeLedger", "academyPlayers", "academyRoster", "scoutedPlayers",
    "activeScoutingMission", "sponsorOffers", "boardState", "league", "proCareer", "draftCup",
    "selectedWeeklyActivity", "scheduledActivities", "storylines", "watchlistedPlayerIds",
    "eventsLog", "acknowledgedEventIds", "managerDetails", "newsFeed", "momentQueue", "saveName",
    "timeMode", "gameOverReason", "mapRecords", "recordBook",
    "academyMatchHistory", "academyPendingProspects", "academyScoutingMissions",
    "academyTrainingSchedule", "academyWeeklyReports", "activeMatchId", "activeMatchState",
    "activelyPlayingLegendIds", "careerStats", "circuitPoints", "declinedSponsorOfferIds",
    "difficulty", "firstSession", "gameOverWeek", "gameStartDate", "hallOfFame",
    "lastCommittedWeekTick", "lastRngSeed", "legendaryPlayers", "mapRotation", "marketStaff",
    "nextMarketRefreshWeek", "pendingCelebration", "pendingLegendPick", "physicalMatchPreview",
    "playerTeamId", "randomWorld", "sandbox", "savedSearches", "seenMomentKeys", "signedLegendIds", "socialFeed",
    "tournamentQualifications", "weekReports",
] as const

type DurableKey = typeof DURABLE_CAREER_KEYS[number]
type CareerState = { saveId?: string | null } & Partial<Record<DurableKey, unknown>>

let baseline: { saveId: string; refs: unknown[] } | null = null

/** Call after a successful save (with the state the save was built from) or a load. */
export function markCareerSaved(state: CareerState): void {
    if (!state.saveId) { baseline = null; return }
    baseline = { saveId: state.saveId, refs: DURABLE_CAREER_KEYS.map(key => state[key]) }
}

/** Forget the baseline (no career loaded). */
export function clearCareerBaseline(): void {
    baseline = null
}

/** True when a loaded career holds progress that is not on disk yet. */
export function hasUnsavedChanges(state: CareerState): boolean {
    if (!state.saveId) return false
    if (!baseline || baseline.saveId !== state.saveId) return true
    return DURABLE_CAREER_KEYS.some((key, index) => state[key] !== baseline!.refs[index])
}
