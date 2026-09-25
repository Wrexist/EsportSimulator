"use client"

/**
 * Build a fresh GameSave snapshot from the live store state.
 *
 * Used at the top of advanceWeek to ship a clean, serialization-safe
 * snapshot off to the week processor (which structured-clones it on
 * the way into the worker thread). We explicitly construct the object
 * instead of spread-copying so:
 *   1. We never accidentally include transient store fields (toasts,
 *      _teamIndex, hydration flags, etc.) — anything not in the
 *      GameSave shape stays in the store.
 *   2. Optional fields are normalized to safe defaults at the boundary
 *      so the worker can assume they exist.
 *   3. Required save fields are checked against GameSave. Optional durable
 *      fields need explicit round-trip coverage when the schema changes.
 *
 * `structuredClone` is applied at the call site so the worker receives
 * a fully detached copy.
 */

import type { GameSave } from "@/engine/save-types"
import { CURRENT_SAVE_VERSION } from "@/engine/save-types"
import { generateSeed } from "@/engine/rng"
import { FOUNDING_LEGENDS } from "@/engine/hall-of-fame-data"
import type { GameStoreState } from "@/store/game-store"

export type SaveSnapshotState = GameStoreState & { createdAt?: string }

/**
 * Build a plain (un-cloned) snapshot. Callers should pass the result
 * through `structuredClone()` before mutating it to keep store state
 * detached from the snapshot's lifetime.
 */
export function buildSaveSnapshot(state: SaveSnapshotState): GameSave {
    return {
        saveVersion: CURRENT_SAVE_VERSION,
        saveId: state.saveId || `save_recovery_${Date.now()}`,
        saveName: state.saveName || "Unknown",
        createdAt: state.createdAt || state.gameStartDate || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek: state.currentWeek,
        currentDay: state.currentDay,
        timeMode: state.timeMode,
        gameStartDate: state.gameStartDate,
        playerTeamId: state.playerTeamId || "unknown",
        managerDetails: state.managerDetails,
        teams: state.teams,
        players: state.players,
        contracts: state.contracts,
        tournaments: state.tournaments,
        staff: state.staff,
        marketStaff: state.marketStaff || [],
        nextMarketRefreshWeek: state.nextMarketRefreshWeek,
        scheduledMatches: state.scheduledMatches,
        completedMatches: state.completedMatches,
        firstSession: state.firstSession,
        selectedWeeklyActivity: state.selectedWeeklyActivity ?? null,
        customTactics: state.customTactics,
        watchlistedPlayerIds: state.watchlistedPlayerIds ?? [],
        activeMatchId: state.activeMatchId ?? null,
        activeMatchState: state.activeMatchState ?? null,
        physicalMatchPreview: state.physicalMatchPreview ? structuredClone(state.physicalMatchPreview) : null,
        scheduledActivities: state.scheduledActivities || [],
        financeLedger: state.financeLedger,
        eventsLog: state.eventsLog,
        acknowledgedEventIds: state.acknowledgedEventIds,
        lastRngSeed: state.lastRngSeed ?? generateSeed(),
        lastCommittedWeekTick: state.lastCommittedWeekTick,
        legendaryPlayers: state.legendaryPlayers || [],
        weekTickState: null,
        scoutedPlayers: state.scoutedPlayers || [],
        activeScoutingMission: state.activeScoutingMission,
        circuitPoints: state.circuitPoints || [],
        tournamentQualifications: state.tournamentQualifications || [],
        newsFeed: state.newsFeed || [],
        transferHistory: state.transferHistory || [],
        hallOfFame: state.hallOfFame || FOUNDING_LEGENDS,
        academyPlayers: state.academyPlayers || [],
        academyRoster: state.academyRoster || { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null },
        academyMatchHistory: state.academyMatchHistory || [],
        academyTrainingSchedule: state.academyTrainingSchedule || {},
        academyWeeklyReports: state.academyWeeklyReports || [],
        academyScoutingMissions: state.academyScoutingMissions || [],
        academyPendingProspects: state.academyPendingProspects || [],
        sponsorOffers: state.sponsorOffers || [],
        declinedSponsorOfferIds: state.declinedSponsorOfferIds || [],
        fplData: state.fplData,
        boardState: state.boardState,
        socialFeed: state.socialFeed,
        careerStats: state.careerStats,
        difficulty: state.difficulty,
        lastPlayedAt: new Date().toISOString(),
        pendingCelebration: state.pendingCelebration,
        pendingSeasonRecap: state.pendingSeasonRecap,
        pendingLegendPick: state.pendingLegendPick,
        signedLegendIds: state.signedLegendIds || [],
        activelyPlayingLegendIds: state.activelyPlayingLegendIds || [],
        gameOverReason: state.gameOverReason ?? undefined,
        gameOverWeek: state.gameOverWeek ?? undefined,
    }
}
