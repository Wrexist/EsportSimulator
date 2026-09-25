"use client"

/**
 * Scouting slice.
 *
 * Owns mission lifecycle and watchlist actions. Extracted from
 * game-store.ts. All team lookups inside set() go through
 * state.teams.find() — see ARCHITECTURE.md on why _teamIndex.get()
 * mutations don't propagate to state.teams[i] under Immer.
 */

import type { ScoutingActions, SliceCreator } from "@/store/types"
import { getSpecializationMultiplier } from "@/engine/staff-specialization"
import { nextDeterministicId } from "@/store/utils/helpers"

import { employedScout } from "@/engine/recruitment"
import { scoutTierFromAccuracy } from "@/engine/scouting-system"

const SCOUTING_COST_BASIC = 3000

export const createScoutingSlice: SliceCreator<ScoutingActions> = (set, get) => ({
    startScoutingMission: (playerId: string) => {
        const currentState = get()
        if (currentState.activeScoutingMission) {
            get().addToast({
                message: "Already scouting a player! Wait for the current mission to finish.",
                type: "warning",
            })
            return
        }
        const team = currentState.teams.find(t => t.id === currentState.playerTeamId)
        const target = currentState.players.find(p => p.id === playerId)
        const scout = employedScout(currentState.staff, team, currentState.currentWeek)
        const reject = (message: string) => currentState.addToast({ message, type: "warning" })
        if (!target || target.isRetired) return reject("This player is no longer available to scout.")
        if (team?.rosterIds.includes(playerId) || currentState.academyPlayers?.some(p => p.playerId === playerId))
            return reject("Your own players are already fully known.")
        if (!scout) return reject("Hire an active scout on your staff before starting a mission.")
        if (!team || team.budget < SCOUTING_COST_BASIC) return reject("A scouting mission costs $3,000. Your club has insufficient cash.")
        const report = currentState.scoutedPlayers.find(s => s.playerId === playerId)
        const ranks = ["BASIC", "ADVANCED", "EXPERT", "ELITE"]
        const tier = scoutTierFromAccuracy((scout.stats?.accuracy ?? 50) * getSpecializationMultiplier(scout))
        if (report && ranks.indexOf(report.scoutLevel) >= ranks.indexOf(tier))
            return reject("Your current report is at least as detailed as this scout can provide. Hire a more accurate scout to improve it.")
        set((state) => {
            const scoutStaff = state.staff.find(s => s.id === scout.id)!
            const scoutId = scoutStaff.id
            const team = state.teams.find(t => t.id === state.playerTeamId)!

            // Scout level sets the base duration (L1=4wk … L4+=1wk); a high
            // scoutingSpeed stat (× specialist bonus) shaves up to 2 more weeks.
            // L1=4wk, L2=3wk, L3=2wk, L4+=1wk
            const scoutLevel = scoutStaff?.level ?? 1
            const scoutSpeed = scoutStaff
                ? (scoutStaff.stats?.scoutingSpeed ?? 0) * getSpecializationMultiplier(scoutStaff)
                : 0
            const speedBonus = Math.floor(scoutSpeed / 50) // 0–2 weeks faster
            const duration = Math.max(1, 5 - scoutLevel - speedBonus)

            state.activeScoutingMission = {
                playerId,
                startWeek: state.currentWeek,
                completionWeek: state.currentWeek + duration,
                scoutId,
            }

            team.budget -= SCOUTING_COST_BASIC
            // Economy invariant #5: the $3000 scouting fee must hit the ledger
            // (it silently vanished from the books before). One-time player
            // action, so a deterministic id is enough — no replay dedup needed.
            state.financeLedger.push({
                id: nextDeterministicId(state, "fin_scouting", playerId),
                week: state.currentWeek,
                teamId: team.id,
                type: "EXPENSE",
                category: "OTHER",
                amount: SCOUTING_COST_BASIC,
                description: "Scouting Mission",
                balance: team.budget,
            })
        })
    },

    cancelScoutingMission: () => {
        if (!get().activeScoutingMission) return
        set({ activeScoutingMission: undefined })
        get().addToast({ message: "Scouting cancelled. The mission fee paid for work already commissioned and is not refunded.", type: "info" })
    },

    getScoutingLevel: (playerId: string) => {
        const state = get()
        // Own team players are always fully scouted.
        const team = state.teams.find(t => t.id === state.playerTeamId)
        if (team?.rosterIds.includes(playerId) || state.academyPlayers?.some(p => p.playerId === playerId)) return "ELITE"

        const entry = state.scoutedPlayers.find(s => s.playerId === playerId)
        return entry?.scoutLevel || "NONE"
    },

    isPlayerScouted: (playerId: string) => {
        const state = get()
        const team = state.teams.find(t => t.id === state.playerTeamId)
        if (team?.rosterIds.includes(playerId) || state.academyPlayers?.some(p => p.playerId === playerId)) return true
        return state.scoutedPlayers.some(s => s.playerId === playerId)
    },

    toggleWatchlistPlayer: (playerId: string) => {
        const state = get()
        const current = state.watchlistedPlayerIds || []
        if (current.includes(playerId)) {
            set({ watchlistedPlayerIds: current.filter(id => id !== playerId) })
        } else if (state.players.some(p => p.id === playerId && !p.isRetired) && current.length < 100) {
            set({ watchlistedPlayerIds: [...current, playerId] })
        }
    },

    isPlayerWatchlisted: (playerId: string) => {
        const state = get()
        return (state.watchlistedPlayerIds || []).includes(playerId)
    },
})
