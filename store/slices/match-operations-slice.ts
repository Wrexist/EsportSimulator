"use client"

/**
 * Match-operations slice.
 *
 * Three self-contained match operations:
 *   - updateScheduledMatch — sanitized veto/map state writeback used by
 *     the veto UI when the user confirms map selections.
 *   - performVODReview — buys a +25 tactical-prep boost for an upcoming
 *     match by deducting VOD_REVIEW_COST (one-shot per match).
 *   - performMentalReset — boosts roster morale by +15 (clamped to 100)
 *     and optionally flags one match's mentalPrep. Deducts
 *     MENTAL_RESET_COST.
 *
 * All three log a FinanceLedger entry. None call other store actions.
 * Entity lookups inside set() go through state.teams.find() — see
 * ARCHITECTURE.md on the index-vs-array draft propagation bug.
 */

import type { SliceCreator, StoreState } from "@/store/types"
import type { MatchSaveData } from "@/engine/save-types"
import {
    nextDeterministicId,
    ALLOWED_MAP_IDS,
    MAX_MAPS_PER_SERIES,
    VOD_REVIEW_COST,
    MENTAL_RESET_COST,
} from "@/store/utils/helpers"

export interface MatchOperationsActions {
    updateScheduledMatch: (matchId: string, updates: Partial<MatchSaveData>) => void
    performVODReview: (matchId: string) => void
    performMentalReset: (matchId?: string) => void
}

function canPrepare(state: StoreState, match: MatchSaveData): boolean {
    return [match.homeTeamId, match.awayTeamId].includes(state.playerTeamId || '')
        && !match.result && !state.completedMatches?.some(m => m.id === match.id)
        && state.activeMatchId !== match.id && state.activeMatchState?.matchId !== match.id
        && match.week >= state.currentWeek
        && !(state.timeMode === 'HYBRID_DAILY' && match.week === state.currentWeek && (match.day ?? 6) < state.currentDay)
}

export const createMatchOperationsSlice: SliceCreator<MatchOperationsActions> = (set) => ({
    updateScheduledMatch: (matchId, updates) => {
        set((state) => {
            const match = state.scheduledMatches.find(m => m.id === matchId)
            if (!match || !canPrepare(state, match)) return

            if (state.activeMatchId === matchId || state.activeMatchState?.matchId === matchId) return
            const sanitizedUpdates: Partial<MatchSaveData> = {}

            if (typeof updates.vetoComplete === "boolean") {
                sanitizedUpdates.vetoComplete = updates.vetoComplete
            }

            // Map array: cap to format max, dedupe, only allow known map IDs.
            if (Array.isArray(updates.maps)) {
                const maxMapsForFormat = match.format === "BO1" ? 1 : match.format === "BO5" ? 5 : 3
                const uniqueMaps = [...new Set(
                    updates.maps
                        .filter((map): map is string => typeof map === "string" && ALLOWED_MAP_IDS.has(map))
                        .slice(0, Math.min(MAX_MAPS_PER_SERIES, maxMapsForFormat))
                )]
                sanitizedUpdates.maps = uniqueMaps
            }

            // Starting-sides map: only allow team IDs that are actually
            // playing this match, only allow maps in the resolved pool.
            if (updates.mapStartingSides && typeof updates.mapStartingSides === "object") {
                const sanitizedSides: Record<string, string> = {}
                const validTeamIds = new Set([match.homeTeamId, match.awayTeamId])
                const candidateMaps = Array.isArray(sanitizedUpdates.maps)
                    ? sanitizedUpdates.maps
                    : (Array.isArray(match.maps) ? match.maps : [])
                const allowedSeriesMaps = new Set(
                    candidateMaps.filter((map): map is string => typeof map === "string" && ALLOWED_MAP_IDS.has(map))
                )
                Object.entries(updates.mapStartingSides).forEach(([mapId, ctTeamId]) => {
                    const isAllowedMap = ALLOWED_MAP_IDS.has(mapId)
                        && (allowedSeriesMaps.size === 0 || allowedSeriesMaps.has(mapId))
                    if (isAllowedMap && typeof ctTeamId === "string" && validTeamIds.has(ctTeamId)) {
                        sanitizedSides[mapId] = ctTeamId
                    }
                })
                sanitizedUpdates.mapStartingSides = sanitizedSides
            }

            // Paid preparation flags are owned exclusively by purchase actions.
            // Changing a sealed pool must also preserve the full BO1/3/5 contract.
            if (sanitizedUpdates.vetoComplete || match.vetoComplete) {
                const mapsForVeto = Array.isArray(sanitizedUpdates.maps)
                    ? sanitizedUpdates.maps
                    : (Array.isArray(match.maps) ? match.maps : [])
                const required = match.format === 'BO1' ? 1 : match.format === 'BO5' ? 5 : 3
                if (mapsForVeto.length !== required) {
                    sanitizedUpdates.vetoComplete = false
                }
            }
            if (sanitizedUpdates.maps) {
                sanitizedUpdates.mapStartingSides = Object.fromEntries(Object.entries(sanitizedUpdates.mapStartingSides ?? match.mapStartingSides ?? {})
                    .filter(([map, team]) => sanitizedUpdates.maps!.includes(map) && [match.homeTeamId, match.awayTeamId].includes(team)))
            }

            if (Object.keys(sanitizedUpdates).length > 0) {
                Object.assign(match, sanitizedUpdates)
            }
        })
    },

    performVODReview: (matchId) => {
        set((state) => {
            const match = state.scheduledMatches.find(m => m.id === matchId)
            if (!match || !canPrepare(state, match)) return
            if (match.vodReviewed) return
            if (state.playerTeamId !== match.homeTeamId && state.playerTeamId !== match.awayTeamId) return
            if (match.week < state.currentWeek) return

            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team) return
            if (team.budget < VOD_REVIEW_COST) return

            team.tacticalPrep = Math.min(100, (team.tacticalPrep || 0) + 25)
            team.budget -= VOD_REVIEW_COST
            match.vodReviewed = true
            state.financeLedger.push({
                id: nextDeterministicId(state, "fin_vod_review", matchId),
                week: state.currentWeek,
                teamId: team.id,
                type: "EXPENSE",
                category: "FACILITIES",
                amount: VOD_REVIEW_COST,
                description: "VOD Review Session",
                balance: team.budget,
            })
        })
    },

    performMentalReset: (matchId?: string) => {
        set((state) => {
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team || team.budget < MENTAL_RESET_COST) return

            if (matchId) {
                const match = state.scheduledMatches.find(m => m.id === matchId)
                if (!match || !canPrepare(state, match)) return
                if (state.playerTeamId !== match.homeTeamId && state.playerTeamId !== match.awayTeamId) return
                if (match.week < state.currentWeek || match.mentalPrep) return
                match.mentalPrep = true
                match.mentalPrepTeamId = state.playerTeamId!
            } else if (state.financeLedger.some(e => e.teamId === team.id && e.week === state.currentWeek && e.description === 'Mental Reset Session')) {
                return
            }

            team.budget -= MENTAL_RESET_COST

            state.financeLedger.push({
                id: nextDeterministicId(state, "fin_mental_reset", matchId || "weekly"),
                week: state.currentWeek,
                teamId: team.id,
                type: "EXPENSE",
                category: "WAGES_STAFF",
                amount: MENTAL_RESET_COST,
                description: "Mental Reset Session",
                balance: team.budget,
            })

            // Boost morale across the entire roster (capped at 100).
            team.rosterIds.forEach(pid => {
                const player = state.players.find(p => p.id === pid)
                if (player) {
                    player.morale = Math.min(100, (player.morale ?? 70) + 15)
                }
            })
        })
    },
})
