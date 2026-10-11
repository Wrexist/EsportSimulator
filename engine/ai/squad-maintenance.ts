/**
 * AI squad maintenance (AI_SQUAD_TUNING) — the two things a competent human
 * manager does that AI clubs never did:
 *
 *   1. Renew expiring contracts of players worth keeping, under the SAME rule
 *      as the human Renew button (+10% wage, +52 weeks, 26 weeks of runway
 *      against the wage increase). Before tuning every AI contract simply
 *      expired, so the snapshot's best players drained into free agency
 *      within three seasons and AI rosters fell below five.
 *   2. During transfer windows, sign a clearly better free agent than the
 *      weakest starter when the normal recruitment budget allows it. Before
 *      tuning only the managed club ever upgraded, so it collected every
 *      released star (world #1 after season 1 in 28/30 careers).
 *
 * Deterministic: no RNG; upgrade attempts are spread across weeks by a hash
 * of the team id.
 */

import type { GameSave, PlayerSaveData, TeamSaveData } from "../save-types"
import { academyHeldPlayerIds, recruitmentSalary } from "../recruitment"
import { commitFreeAgentSigning } from "./roster-management"
import { aiCanCommit, aiClubBudget, releaseAIPlayer } from "./club-budget"
import { recalculateTeamSynergy } from "../processors/team-synergy-recalc"
import { AI_SQUAD_TUNING } from "@/lib/balance-tuning"
import { renewalSalary } from "../personality"

/** Same value ordering the AI uses to pick who to release. */
function keepValue(p: PlayerSaveData): number {
    const skill = p.skill ?? 50
    const potential = p.potential ?? skill
    return skill + Math.max(0, potential - skill) * 0.5 - Math.max(0, (p.age ?? 22) - 28) * 2
}

/**
 * Renewal judgement (Phase 4.6). The raise must fit the club's budget, with
 * one exception: a starter whose renewed wage is still at or below what he
 * would ask on the open market is renewed anyway, because replacing him
 * costs more. Before, a club in deficit could not renew even a $330/week
 * starter, let him walk and paid a free agent ~$2,000 instead (campaign
 * 2026-10-11: median AI signing $2,094 vs $330 for lapsed snapshot deals),
 * which turned a small deficit into a spiral.
 */
export function renewExpiringContracts(team: TeamSaveData, save: GameSave, players: Map<string, PlayerSaveData>): number {
    const week = save.currentWeek
    const roster = team.rosterIds.map(id => players.get(id)).filter((p): p is PlayerSaveData => !!p && !p.isRetired)
    const ranked = [...roster].sort((a, b) => keepValue(b) - keepValue(a) || a.id.localeCompare(b.id))
    const keep = new Set(ranked.slice(0, AI_SQUAD_TUNING.RENEW_TOP_N).map(p => p.id))
    const starters = new Set(ranked.slice(0, 5).map(p => p.id))
    let renewed = 0
    let budget: ReturnType<typeof aiClubBudget> | undefined
    for (const contract of save.contracts) {
        if (contract.teamId !== team.id || !keep.has(contract.playerId)) continue
        const weeksLeft = contract.endWeek - week
        if (weeksLeft <= 0 || weeksLeft > AI_SQUAD_TUNING.RENEW_WINDOW_WEEKS) continue
        const p = players.get(contract.playerId)
        if (!p || (p.age ?? 22) >= AI_SQUAD_TUNING.RENEW_MAX_AGE) continue
        // Phase 5.2: the raise follows his archetype (Loyal half, Mercenary double).
        const newSalary = renewalSalary(p, contract.salaryPerWeek)
        if (!Number.isSafeInteger(newSalary) || newSalary < 1) continue
        if (!Number.isFinite(team.budget) || team.budget < (newSalary - contract.salaryPerWeek) * AI_SQUAD_TUNING.RENEWAL_RUNWAY_WEEKS) continue
        budget ??= aiClubBudget(save, team)
        const raise = newSalary - contract.salaryPerWeek
        const bargain = starters.has(p.id) && newSalary <= recruitmentSalary(p, week, team)
        if (!aiCanCommit(team, budget, raise) && !bargain) continue
        contract.salaryPerWeek = newSalary
        contract.endWeek += AI_SQUAD_TUNING.RENEWAL_EXTENSION_WEEKS
        budget = { ...budget, net: budget.net - raise, headroom: budget.headroom - raise }
        renewed++
    }
    return renewed
}

/** Free agents sorted strongest first (one shared list per week). */
export function freeAgentsBySkill(save: GameSave): PlayerSaveData[] {
    const rostered = new Set(save.teams.flatMap(t => t.rosterIds))
    const held = academyHeldPlayerIds(save)
    const contracted = new Set(save.contracts.filter(c => c.endWeek > save.currentWeek).map(c => c.playerId))
    return save.players.filter(p => !p.isRetired && !rostered.has(p.id) && !held.has(p.id) && !contracted.has(p.id))
        .sort((a, b) => (b.skill ?? 0) - (a.skill ?? 0) || a.id.localeCompare(b.id))
}

function teamHash(id: string): number {
    let h = 0
    for (let i = 0; i < id.length; i++) h = ((h * 31) + id.charCodeAt(i)) | 0
    return h >>> 0
}

export function upgradeFromFreeAgency(team: TeamSaveData, save: GameSave, pool: PlayerSaveData[], players: Map<string, PlayerSaveData>): PlayerSaveData | null {
    if ((save.currentWeek + teamHash(team.id)) % AI_SQUAD_TUNING.UPGRADE_EVERY_WEEKS !== 0) return null
    if (team.rosterIds.length < 5 || team.rosterIds.length >= AI_SQUAD_TUNING.MAX_ROSTER) return null
    if (team.financialState === "RISK" || team.financialState === "CRISIS" || team.financialState === "INSOLVENT") return null
    // Starters are the first five roster slots (match lineups use roster order).
    const starters = team.rosterIds.slice(0, 5).map(id => players.get(id)).filter((p): p is PlayerSaveData => !!p)
    if (starters.length < 5) return null
    const weakest = Math.min(...starters.map(p => p.skill ?? 0))
    const weakestPlayer = starters.filter(p => (p.skill ?? 0) === weakest).sort((a, b) => a.id.localeCompare(b.id))[0]
    const weakestWage = save.contracts.find(c => c.playerId === weakestPlayer.id && c.teamId === team.id && c.endWeek > save.currentWeek)?.salaryPerWeek ?? 0
    const budget = aiClubBudget(save, team)
    let checked = 0
    for (const p of pool) {
        if ((p.skill ?? 0) < weakest + AI_SQUAD_TUNING.UPGRADE_MIN_SKILL_GAIN) break
        if (team.rosterIds.includes(p.id) || save.teams.some(t => t.rosterIds.includes(p.id))) continue
        if (++checked > AI_SQUAD_TUNING.UPGRADE_MAX_QUOTES) break
        const salary = recruitmentSalary(p, save.currentWeek, team)
        // Phase 4.6: the club's budget keeps its surplus after the new wage.
        // If it only fits once the weakest starter's wage goes, he is
        // released rather than benched (a like-for-like budget upgrade).
        const asDepth = aiCanCommit(team, budget, salary)
        if (!asDepth && !aiCanCommit(team, budget, Math.max(0, salary - weakestWage))) continue
        commitFreeAgentSigning(team, save, p, salary)
        if (!team.rosterIds.includes(p.id)) return null
        // Starters are the first five roster slots: the signing takes the
        // weakest starter's slot and that player moves to the bench.
        const slot = team.rosterIds.indexOf(weakestPlayer.id)
        const at = team.rosterIds.indexOf(p.id)
        if (slot >= 0 && slot < 5 && at > slot) [team.rosterIds[slot], team.rosterIds[at]] = [team.rosterIds[at], team.rosterIds[slot]]
        if (!asDepth) {
            releaseAIPlayer(team, save, weakestPlayer, "")
            recalculateTeamSynergy(team, save.players)
        }
        return p
    }
    return null
}
