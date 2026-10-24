"use client"

/**
 * Delegation slice (G6): per-area switches for chores the staff can run,
 * and the pre-week pass that runs them.
 *
 *   - setDelegation — turn one area on or off.
 *   - runDelegatedChores — called by advanceWeek before the week is built:
 *     renewals, drills and a scouting mission through the same actions the
 *     screens use (their toasts are dropped), then one STAFF_REPORT in the
 *     inbox listing what was done and what was left for the manager.
 *
 * The veto switch is read by match prep, which runs the quick veto.
 */

import type { SliceCreator } from "@/store/types"
import {
    DELEGATION_AREAS, planDrills, planRenewals, RENEW_WITHIN_WEEKS, scoutTargets, SCOUT_BUDGET_MISSIONS,
    type DelegationArea, type DelegationSettings,
} from "@/engine/delegation"
import { DrillManager } from "@/engine/drill-manager"
import { employedScout } from "@/engine/recruitment"
import type { PlayerSaveData } from "@/engine/save-types"
import { formatCurrency } from "@/lib/utils-extended"
import { nextDeterministicId } from "@/store/utils/helpers"

/** startScoutingMission's fee (scouting-slice). */
const SCOUTING_MISSION_COST = 3000
const DEFAULT_MAX_TRAINING_SLOTS = 10

export interface DelegationActions {
    setDelegation: (area: DelegationArea, on: boolean) => void
    /** Runs the delegated chores for the current week; returns the report lines (empty when nothing was done). */
    runDelegatedChores: () => string[]
}

export const createDelegationSlice: SliceCreator<DelegationActions> = (set, get) => ({
    setDelegation: (area, on) => {
        if (!DELEGATION_AREAS.includes(area)) return
        set((state) => {
            const next: DelegationSettings = { ...state.delegation }
            if (on) next[area] = true
            else delete next[area]
            state.delegation = next
        })
    },

    runDelegatedChores: () => {
        const start = get()
        const d = start.delegation ?? {}
        const teamId = start.playerTeamId
        if (!teamId || start.gameOverReason || start.activeMatchId || !(d.drills || d.renewals || d.scouting)) return []
        const team = start.teams.find(t => t.id === teamId)
        if (!team) return []
        const week = start.currentWeek
        const toastsBefore = start.toasts.length
        const lines: string[] = []
        const byId = new Map(start.players.map(p => [p.id, p]))
        const roster = team.rosterIds.map(id => byId.get(id)).filter((p): p is PlayerSaveData => !!p && !p.isRetired)

        if (d.renewals) {
            const plan = planRenewals(roster, start.contracts, teamId, week)
            for (const p of plan.renew) {
                const before = get().contracts.find(c => c.playerId === p.id && c.teamId === teamId)?.endWeek ?? 0
                get().renewContract(p.id)
                const after = get().contracts.find(c => c.playerId === p.id && c.teamId === teamId)
                if (after && after.endWeek > before) lines.push(`Renewed ${p.nickname} until week ${after.endWeek} at ${formatCurrency(after.salaryPerWeek)} a week.`)
                else lines.push(`Could not renew ${p.nickname}: the budget does not cover the raise. His contract ends in ${before - week} weeks.`)
            }
            for (const { player, reason } of plan.leave) {
                const left = (start.contracts.find(c => c.playerId === player.id && c.teamId === teamId)?.endWeek ?? week) - week
                if (left === RENEW_WITHIN_WEEKS || left <= 2) lines.push(`${player.nickname}'s contract ends in ${left} week${left === 1 ? "" : "s"}. Left for you: ${reason}.`)
            }
        }

        if (d.drills) {
            const now = get()
            const t = now.teams.find(x => x.id === teamId)!
            const squad = roster.filter(p => !t.activeRoleTraining?.some(r => r.playerId === p.id)).map(p => now.players.find(x => x.id === p.id) ?? p)
            const slotsLeft = Math.max(0, (t.maxTrainingSlots || DEFAULT_MAX_TRAINING_SLOTS) - (t.trainingSlotsUsed || 0))
            const matchWeek = now.scheduledMatches.some(m => m.week === week && (m.homeTeamId === teamId || m.awayTeamId === teamId))
            const ran: string[] = []
            for (const drill of planDrills(squad, DrillManager.getDrills(), slotsLeft, matchWeek)) {
                const res = get().runTeamDrill(drill.id, drill.rewards.map(r => ({ stat: r.stat, amount: r.value })), drill.fatigueCost)
                if (!res.success) break
                ran.push(drill.name)
            }
            if (ran.length) lines.push(`Ran ${ran.length} team drill${ran.length === 1 ? "" : "s"}${matchWeek ? " (light: match week)" : ""}: ${ran.join(", ")}.`)
        }

        if (d.scouting && !get().activeScoutingMission) {
            const now = get()
            const t = now.teams.find(x => x.id === teamId)!
            const scout = employedScout(now.staff, t, week)
            if (scout && t.budget >= SCOUTING_MISSION_COST * SCOUT_BUDGET_MISSIONS) {
                const targets = scoutTargets(now.watchlistedPlayerIds ?? [], new Map(now.players.map(p => [p.id, p])), new Set(t.rosterIds))
                for (const target of targets) {
                    get().startScoutingMission(target.id)
                    if (get().activeScoutingMission?.playerId === target.id) {
                        lines.push(`Sent ${scout.name} to watch ${target.nickname} (${formatCurrency(SCOUTING_MISSION_COST)}).`)
                        break
                    }
                }
            }
        }

        set((state) => {
            state.toasts.splice(toastsBefore)
            if (!lines.length) return
            state.eventsLog.push({
                id: nextDeterministicId(state, "evt_staff_report", String(week)),
                type: "STAFF_REPORT",
                week,
                acknowledged: false,
                data: { title: "Staff report: what your staff handled this week", message: lines.join(" "), text: lines.join("\n") },
            })
        })
        return lines
    },
})
