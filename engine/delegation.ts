/**
 * G6: delegate chores to staff. Per-area switches; before each week the
 * assistant does what the manager would otherwise click through, and the
 * inbox gets one staff report saying what was done and what was left alone.
 *
 * This module only plans (pure). The store runs the plan through the same
 * actions the screens use (runTeamDrill, renewContract, startScoutingMission),
 * so every rule and cost those apply still holds.
 */

import type { ActiveDrill } from "./drill-manager"
import type { ContractSaveData, PlayerSaveData } from "./save-types"
import { evaluatePlayer } from "./player-evaluation"

export type DelegationArea = "drills" | "renewals" | "scouting" | "veto"
export type DelegationSettings = Partial<Record<DelegationArea, boolean>>

export const DELEGATION_AREAS: readonly DelegationArea[] = ["drills", "renewals", "scouting", "veto"]
export const DELEGATION_LABEL: Record<DelegationArea, string> = {
    drills: "Team drills",
    renewals: "Contract renewals",
    scouting: "Scouting missions",
    veto: "Map veto",
}
/** Highest fatigue the assistant lets a drill push anyone to (lower in a match week). */
export const DRILL_FATIGUE_CAP = 65
export const DRILL_FATIGUE_CAP_MATCH_WEEK = 45
/** Renewals: weeks left at which the assistant renews, and the oldest player he renews. */
export const RENEW_WITHIN_WEEKS = 8
export const RENEW_MAX_AGE = 32
/** A rotation player within this many overall points of the weakest starter counts as a regular. */
export const RENEW_ROTATION_MARGIN = 3
/** Scouting: the scout only goes while funds stay above this many mission fees. */
export const SCOUT_BUDGET_MISSIONS = 10

export const DELEGATION_HINT: Record<DelegationArea, string> = {
    drills: "Runs drills on the squad's weakest areas each week and stops before anyone gets tired. Lighter in match weeks.",
    renewals: `Renews starters and regular rotation players aged ${RENEW_MAX_AGE} or under when ${RENEW_WITHIN_WEEKS} weeks or less are left, if the budget allows. Others are left for you.`,
    scouting: "When the scout is free, sends him to watch the next player on your shortlist.",
    veto: "Your coach runs the map veto for you when you open match prep.",
}

/** Drill reward names → the player stat they raise (team-drills-slice STAT_MAPPING). */
const DRILL_STAT: Record<string, keyof PlayerSaveData> = {
    rifle: "rifle", skill: "skill", agility: "reaction", focus: "stressResistance", entry: "rifle", tactic: "tactic",
    reaction: "reaction", pistol: "pistol", grenades: "grenades", teamwork: "teamwork", leadership: "leader", clutch: "clutch",
    stressresistance: "stressResistance",
}
/** Weapon drills only help one player (AWP) or are left to the manager. */
const SKIP_DRILL_STATS = new Set(["awp"])

const statOf = (p: PlayerSaveData, key: keyof PlayerSaveData): number => {
    const v = p[key]
    return typeof v === "number" ? v : 50
}

/**
 * Drills for this week, in order. Each pick is the drill whose stats have the
 * most room left under the squad's potential (a drill already picked this
 * week counts half), skipping any that would push someone over the fatigue
 * cap. A tired squad gets one recovery drill first.
 */
export function planDrills(squad: PlayerSaveData[], drills: ActiveDrill[], slotsLeft: number, matchWeek: boolean): ActiveDrill[] {
    if (!squad.length || slotsLeft <= 0) return []
    const cap = matchWeek ? DRILL_FATIGUE_CAP_MATCH_WEEK : DRILL_FATIGUE_CAP
    let maxFatigue = Math.max(...squad.map(p => p.fatigue || 0))
    const picks: ActiveDrill[] = []
    const used = new Map<string, number>()
    const recovery = [...drills].filter(d => d.fatigueCost < 0).sort((a, b) => a.fatigueCost - b.fatigueCost)[0]
    if (recovery && maxFatigue > cap - 10) {
        picks.push(recovery)
        maxFatigue = Math.max(0, maxFatigue + recovery.fatigueCost)
    }
    const room = (key: keyof PlayerSaveData) => squad.reduce((s, p) => s + Math.max(0, Math.min(100, p.potential || 75) - statOf(p, key)), 0) / squad.length
    const work = drills.filter(d => d.fatigueCost > 0 && d.rewards.every(r => !SKIP_DRILL_STATS.has(r.stat.toLowerCase())) && d.rewards.some(r => DRILL_STAT[r.stat.toLowerCase()]))
    while (picks.length < slotsLeft) {
        let best: ActiveDrill | undefined
        let bestScore = 0
        for (const d of work) {
            if (maxFatigue + d.fatigueCost > cap) continue
            const gain = d.rewards.reduce((s, r) => { const key = DRILL_STAT[r.stat.toLowerCase()]; return s + (key ? r.value * room(key) : 0) }, 0)
            const score = gain / Math.pow(2, used.get(d.id) ?? 0) / Math.max(1, d.fatigueCost)
            if (score > bestScore) { best = d; bestScore = score }
        }
        if (!best) break
        picks.push(best)
        used.set(best.id, (used.get(best.id) ?? 0) + 1)
        maxFatigue += best.fatigueCost
    }
    return picks
}

export interface RenewalPlan { renew: PlayerSaveData[]; leave: { player: PlayerSaveData; reason: string }[] }

/** Contracts the assistant renews this week, and the expiring ones he leaves for the manager (with why). */
export function planRenewals(roster: PlayerSaveData[], contracts: ContractSaveData[], teamId: string, week: number): RenewalPlan {
    const plan: RenewalPlan = { renew: [], leave: [] }
    const ovr = new Map(roster.map(p => [p.id, evaluatePlayer(p, undefined, undefined, week).overallRating]))
    const starters = roster.slice(0, 5)
    const weakestStarter = starters.length ? Math.min(...starters.map(p => ovr.get(p.id) ?? 0)) : 0
    for (const p of roster) {
        const c = contracts.find(x => x.playerId === p.id && x.teamId === teamId)
        if (!c || c.endWeek <= week || c.endWeek - week > RENEW_WITHIN_WEEKS) continue
        const starter = starters.includes(p)
        const regular = starter || (ovr.get(p.id) ?? 0) >= weakestStarter - RENEW_ROTATION_MARGIN
        if ((p.age ?? 0) > RENEW_MAX_AGE) plan.leave.push({ player: p, reason: `${p.age} years old` })
        else if (!regular) plan.leave.push({ player: p, reason: "not a regular in the five" })
        else plan.renew.push(p)
    }
    return plan
}

/** Shortlisted players the scout could watch, in shortlist order (not your own, not retired). */
export function scoutTargets(watchlist: string[], players: Map<string, PlayerSaveData>, ownRoster: Set<string>): PlayerSaveData[] {
    return watchlist.map(id => players.get(id)).filter((p): p is PlayerSaveData => !!p && !p.isRetired && !ownRoster.has(p.id))
}
