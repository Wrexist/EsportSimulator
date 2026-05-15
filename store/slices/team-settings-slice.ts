"use client"

/**
 * Team-settings slice.
 *
 * Six small actions that toggle team-scoped settings without touching
 * the broader match/transfer/contract systems:
 *   - setPlaystyle / setEconomyStyle — strategic loadout flags. Both
 *     validate the input against the canonical set of allowed values
 *     so a malformed call from the UI can't poison the simulation.
 *   - setTargetPlayer — "antistrat" flag pointing at an opponent
 *     roster's star. Cleared when set to falsy; otherwise must
 *     reference a real non-own-team player.
 *   - swapRosterPositions — swap two roster indexes (used by the UI
 *     drag-and-drop). Bounds-checked.
 *   - updateTeamBudget — adjust budget by a bounded delta. Refuses
 *     to drop the budget below 0.
 *   - treatInjury — costly ($5k) injury treatment that shaves 2 weeks
 *     off the player's remaining injury time. Logs the expense.
 *
 * All four player-team-scoped actions refuse silently when the caller
 * passes the wrong team ID (server actions should never mutate AI teams
 * through these surfaces).
 */

import type { SliceCreator } from "@/store/types"
import {
    nextDeterministicId,
    parseBoundedInt,
    MAX_TRANSFER_FEE,
    VALID_PLAYSTYLES,
    VALID_ECONOMY_STYLES,
} from "@/store/utils/helpers"
import type { TeamSaveData } from "@/engine/save-types"

const INJURY_TREATMENT_COST = 5000
const INJURY_TREATMENT_WEEKS_OFF = 2

export interface TeamSettingsActions {
    setPlaystyle: (teamId: string, playstyle: TeamSaveData["playstyle"]) => void
    setEconomyStyle: (teamId: string, economyStyle: TeamSaveData["economyStyle"]) => void
    setTargetPlayer: (teamId: string, targetPlayerId: string | undefined) => void
    swapRosterPositions: (teamId: string, index1: number, index2: number) => void
    updateTeamBudget: (teamId: string, amount: number) => void
    treatInjury: (playerId: string) => void
}

export const createTeamSettingsSlice: SliceCreator<TeamSettingsActions> = (set) => ({
    setPlaystyle: (teamId, playstyle) => {
        set((state) => {
            // Only the player's own team can be mutated through this API.
            if (!state.playerTeamId || teamId !== state.playerTeamId) return
            if (!VALID_PLAYSTYLES.has(playstyle)) return
            const team = state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId)
            if (team) team.playstyle = playstyle
        })
    },

    setEconomyStyle: (teamId, economyStyle) => {
        set((state) => {
            if (!state.playerTeamId || teamId !== state.playerTeamId) return
            if (!VALID_ECONOMY_STYLES.has(economyStyle)) return
            const team = state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId)
            if (team) team.economyStyle = economyStyle
        })
    },

    setTargetPlayer: (teamId, targetPlayerId) => {
        set((state) => {
            if (!state.playerTeamId || teamId !== state.playerTeamId) return
            const team = state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId)
            if (!team) return

            if (!targetPlayerId) {
                team.targetPlayerId = undefined
                return
            }

            // Target must reference a real player who isn't on our own roster.
            const isOwnPlayer = team.rosterIds.includes(targetPlayerId)
            const targetExists = state.players.some(p => p.id === targetPlayerId)
            if (!isOwnPlayer && targetExists) {
                team.targetPlayerId = targetPlayerId
            }
        })
    },

    swapRosterPositions: (teamId, index1, index2) => {
        set((state) => {
            const team = state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId)
            if (!team) return
            const len = team.rosterIds.length
            // Bounds check both indexes — UI can pass stale values during
            // a re-render race.
            if (index1 < 0 || index1 >= len || index2 < 0 || index2 >= len) return
            const temp = team.rosterIds[index1]
            team.rosterIds[index1] = team.rosterIds[index2]
            team.rosterIds[index2] = temp
        })
    },

    updateTeamBudget: (teamId, amount) => {
        set((state) => {
            if (!state.playerTeamId || teamId !== state.playerTeamId) return

            const amountValidation = parseBoundedInt(
                amount, "Budget adjustment", -MAX_TRANSFER_FEE, MAX_TRANSFER_FEE,
            )
            if (!amountValidation.ok) return

            const team = state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId)
            if (!team) return

            // Never let the budget go below 0 from this API — that path
            // should always go through a proper expense flow that handles
            // bankruptcy detection.
            const nextBudget = (team.budget || 0) + amountValidation.value
            if (nextBudget < 0) return
            team.budget = nextBudget
        })
    },

    treatInjury: (playerId) => {
        set((state) => {
            const player = state._playerIndex?.get(playerId)
                ?? state.players.find(p => p.id === playerId)
            const team = state._teamIndex?.get(state.playerTeamId!)
                ?? state.teams.find(t => t.id === state.playerTeamId)
            if (!player || !player.injury || !team) return

            if (team.budget < INJURY_TREATMENT_COST) {
                state.toasts.push({
                    id: nextDeterministicId(state, "toast_treatment_error"),
                    message: "Insufficient funds ($5k required)",
                    type: "info",
                })
                return
            }

            team.budget -= INJURY_TREATMENT_COST
            player.injury.weeksRemaining = Math.max(0, player.injury.weeksRemaining - INJURY_TREATMENT_WEEKS_OFF)

            state.financeLedger.push({
                id: nextDeterministicId(state, "fin_treat", player.id),
                week: state.currentWeek,
                teamId: team.id,
                type: "EXPENSE",
                category: "FACILITIES",
                amount: INJURY_TREATMENT_COST,
                description: `Specialist treatment for ${player.nickname}`,
                balance: team.budget,
            })

            state.eventsLog.unshift({
                id: nextDeterministicId(state, "evt_treat_injury", player.id),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: "INJURY" as any,
                week: state.currentWeek,
                acknowledged: true,
                data: {
                    playerId: player.id,
                    title: "Medical Specialist Hired",
                    message: `Expert treatment provided for ${player.nickname}. Recovery expedited by ${INJURY_TREATMENT_WEEKS_OFF} weeks.`,
                    severity: "success",
                },
            })

            state.toasts.push({
                id: nextDeterministicId(state, "toast_treatment_success"),
                message: "Treatment successful!",
                type: "info",
            })
        })
    },
})
