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
import { academyHeldPlayerIds, affordableInvestment, recruitmentBudget, recruitmentSalary } from "../recruitment"
import { commitFreeAgentSigning } from "./roster-management"
import { AI_SQUAD_TUNING } from "@/lib/balance-tuning"

/** Same value ordering the AI uses to pick who to release. */
function keepValue(p: PlayerSaveData): number {
    const skill = p.skill ?? 50
    const potential = p.potential ?? skill
    return skill + Math.max(0, potential - skill) * 0.5 - Math.max(0, (p.age ?? 22) - 28) * 2
}

export function renewExpiringContracts(team: TeamSaveData, save: GameSave, players: Map<string, PlayerSaveData>): number {
    const week = save.currentWeek
    const roster = team.rosterIds.map(id => players.get(id)).filter((p): p is PlayerSaveData => !!p && !p.isRetired)
    const keep = new Set([...roster].sort((a, b) => keepValue(b) - keepValue(a) || a.id.localeCompare(b.id))
        .slice(0, AI_SQUAD_TUNING.RENEW_TOP_N).map(p => p.id))
    let renewed = 0
    for (const contract of save.contracts) {
        if (contract.teamId !== team.id || !keep.has(contract.playerId)) continue
        const weeksLeft = contract.endWeek - week
        if (weeksLeft <= 0 || weeksLeft > AI_SQUAD_TUNING.RENEW_WINDOW_WEEKS) continue
        const p = players.get(contract.playerId)
        if (!p || (p.age ?? 22) >= AI_SQUAD_TUNING.RENEW_MAX_AGE) continue
        const newSalary = Math.round(contract.salaryPerWeek * AI_SQUAD_TUNING.RENEWAL_SALARY_MULTIPLIER)
        if (!Number.isSafeInteger(newSalary) || newSalary < 1) continue
        if (!Number.isFinite(team.budget) || team.budget < (newSalary - contract.salaryPerWeek) * AI_SQUAD_TUNING.RENEWAL_RUNWAY_WEEKS) continue
        // AI judgement on top of the human terms: never renew into a structural deficit.
        if (!affordableInvestment(save, team, 0, newSalary - contract.salaryPerWeek)) continue
        contract.salaryPerWeek = newSalary
        contract.endWeek += AI_SQUAD_TUNING.RENEWAL_EXTENSION_WEEKS
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
    const canAfford = recruitmentBudget(save, team)
    let checked = 0
    for (const p of pool) {
        if ((p.skill ?? 0) < weakest + AI_SQUAD_TUNING.UPGRADE_MIN_SKILL_GAIN) break
        if (team.rosterIds.includes(p.id) || save.teams.some(t => t.rosterIds.includes(p.id))) continue
        if (++checked > AI_SQUAD_TUNING.UPGRADE_MAX_QUOTES) break
        const salary = recruitmentSalary(p, save.currentWeek, team)
        // Optional depth must also be sustainable: weekly net stays >= 0 with the new wage.
        if (!canAfford(salary) || !affordableInvestment(save, team, 0, salary)) continue
        commitFreeAgentSigning(team, save, p, salary)
        if (!team.rosterIds.includes(p.id)) return null
        // Starters are the first five roster slots: the signing takes the
        // weakest starter's slot and that player moves to the bench.
        const slot = team.rosterIds.slice(0, 5).findIndex(id => (players.get(id)?.skill ?? 0) === weakest)
        const at = team.rosterIds.indexOf(p.id)
        if (slot >= 0 && at > slot) [team.rosterIds[slot], team.rosterIds[at]] = [team.rosterIds[at], team.rosterIds[slot]]
        return p
    }
    return null
}
