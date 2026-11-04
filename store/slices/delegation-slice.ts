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
 *
 *   - playDelegatedMatch — "League matches": when the manager's due fixture
 *     is a regular league round, the assistant plays it (the same instant
 *     sim as Quick sim, with the manager's lineup and tactics) so the week
 *     can move on. Called by advanceWeek, advanceToWeekEnd and Continue.
 */

import type { SliceCreator } from "@/store/types"
import {
    DELEGATION_AREAS, isDelegableMatch, planDrills, planRenewals, RENEW_WITHIN_WEEKS, scoutTargets, SCOUT_BUDGET_MISSIONS,
    type DelegationArea, type DelegationSettings,
} from "@/engine/delegation"
import { DrillManager } from "@/engine/drill-manager"
import { employedScout } from "@/engine/recruitment"
import type { PlayerSaveData } from "@/engine/save-types"
import { formatCurrency } from "@/lib/utils-extended"
import { eventText } from "@/lib/news-ref"
import { JOIN_REF, tRefEn, type TextRef } from "@/lib/i18n"
import { soundManager } from "@/lib/sound-manager"
import { nextDeterministicId } from "@/store/utils/helpers"
import { pendingPlayableMatch } from "@/lib/playable-match"

/** startScoutingMission's fee (scouting-slice). */
const SCOUTING_MISSION_COST = 3000
const DEFAULT_MAX_TRAINING_SLOTS = 10

export interface DelegationActions {
    setDelegation: (area: DelegationArea, on: boolean) => void
    /** Runs the delegated chores for the current week; returns the report lines (empty when nothing was done). */
    runDelegatedChores: () => string[]
    /** Plays the due league round when "League matches" is on; true when a match was played. */
    playDelegatedMatch: () => Promise<boolean>
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
        const lines: TextRef[] = []
        const byId = new Map(start.players.map(p => [p.id, p]))
        // The staff act, not the player: no cues for their renewals or rejected missions.
        soundManager.silently(() => {
            const roster = team.rosterIds.map(id => byId.get(id)).filter((p): p is PlayerSaveData => !!p && !p.isRetired)

            if (d.renewals) {
                const plan = planRenewals(roster, start.contracts, teamId, week)
                for (const p of plan.renew) {
                    const before = get().contracts.find(c => c.playerId === p.id && c.teamId === teamId)?.endWeek ?? 0
                    get().renewContract(p.id)
                    const after = get().contracts.find(c => c.playerId === p.id && c.teamId === teamId)
                    if (after && after.endWeek > before) lines.push({ key: "deleg.l.renewed", params: { name: p.nickname, week: after.endWeek, wage: formatCurrency(after.salaryPerWeek) } })
                    else lines.push({ key: "deleg.l.noRenew", params: { name: p.nickname, weeks: { key: "sl.weeks", count: before - week } } })
                }
                for (const { player, reason } of plan.leave) {
                    const left = (start.contracts.find(c => c.playerId === player.id && c.teamId === teamId)?.endWeek ?? week) - week
                    if (left === RENEW_WITHIN_WEEKS || left <= 2) lines.push({ key: "deleg.l.left", params: { name: player.nickname, weeks: { key: "sl.weeks", count: left }, reason } })
                }
            }

            if (d.drills) {
                const now = get()
                const t = now.teams.find(x => x.id === teamId)!
                const squad = roster.filter(p => !t.activeRoleTraining?.some(r => r.playerId === p.id)).map(p => now.players.find(x => x.id === p.id) ?? p)
                const slotsLeft = Math.max(0, (t.maxTrainingSlots || DEFAULT_MAX_TRAINING_SLOTS) - (t.trainingSlotsUsed || 0))
                // Chores run as the week closes, so this week's match is already played:
                // the drills' fatigue carries into next week's match.
                const matchWeek = now.scheduledMatches.some(m => (m.week === week || m.week === week + 1) && (m.homeTeamId === teamId || m.awayTeamId === teamId) && !now.completedMatches.some(c => c.id === m.id))
                const ran: TextRef[] = []
                for (const drill of planDrills(squad, DrillManager.getDrills(), slotsLeft, matchWeek)) {
                    const res = get().runTeamDrill(drill.id, drill.rewards.map(r => ({ stat: r.stat, amount: r.value })), drill.fatigueCost)
                    if (!res.success) break
                    ran.push({ key: `tr.drill.${drill.id}` })
                }
                if (ran.length) lines.push({ key: matchWeek ? "deleg.l.drillsLight" : "deleg.l.drills", count: ran.length, params: { list: { key: JOIN_REF, params: { ...Object.fromEntries(ran.map((r, i) => [i, r])), sep: ", " } } } })
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
                            lines.push({ key: "deleg.l.scout", params: { scout: scout.name, name: target.nickname, fee: formatCurrency(SCOUTING_MISSION_COST) } })
                            break
                        }
                    }
                }
            }
        })

        set((state) => {
            state.toasts.splice(toastsBefore)
            if (!lines.length) return
            state.eventsLog.push({
                id: nextDeterministicId(state, "evt_staff_report", String(week)),
                type: "STAFF_REPORT",
                week,
                acknowledged: false,
                data: {
                    ...eventText({ key: "deleg.report.t" }, { key: JOIN_REF, params: { ...Object.fromEntries(lines.map((l, i) => [i, l])), sep: " " } }),
                    text: lines.map(l => tRefEn(l)).join("\n"),
                    linesRef: lines,
                },
            })
        })
        return lines.map(l => tRefEn(l))
    },

    playDelegatedMatch: async () => {
        const start = get()
        const teamId = start.playerTeamId
        if (!start.delegation?.matches || !teamId || start.gameOverReason || start.activeMatchId || start.activeMatchState) return false
        const match = pendingPlayableMatch(start, new Set(start.completedMatches.map(m => m.id)), { respectDay: true })
        if (!match || !isDelegableMatch(match)) return false
        const played = await get().simulateInstantMatch(match.id)
        if (!played) return false
        const done = get().completedMatches.find(m => m.id === match.id)
        if (done) {
            const home = match.homeTeamId === teamId
            const opp = get().teams.find(t => t.id === (home ? match.awayTeamId : match.homeTeamId))?.name ?? "the opponent"
            const us = home ? done.result.homeScore : done.result.awayScore
            const them = home ? done.result.awayScore : done.result.homeScore
            const verdict = done.result.winnerId === teamId ? "won" : done.result.winnerId ? "lost" : "drew"
            get().addToast({ message: `Your assistant played ${opp} in the league and ${verdict} ${us}-${them}.`, type: "info" })
        }
        return true
    },
})
