import type { GameSave, PlayerSaveData, StaffSaveData, TeamSaveData } from "./save-types"
import { evaluatePlayer } from "./player-evaluation"
import { EconomyEngine } from "./economy-engine"
import { FREE_AGENT_TUNING } from "@/lib/balance-tuning"

export function recruitmentRole(role?: string): string {
    const key = (role || "RIFLER").toUpperCase()
    return ({ ENTRY: "ENTRY_FRAGGER", AWP: "AWPER", LURK: "LURKER" } as Record<string, string>)[key] || key
}

export function academyHeldPlayerIds(save: Pick<GameSave, "teams" | "academyPlayers" | "academyPendingProspects">): Set<string> {
    return new Set([
        ...(save.academyPlayers || []).map(p => p.playerId),
        ...(save.academyPendingProspects || []),
        ...save.teams.flatMap(t => [...(t.youthAcademyIds || []), ...(t.managementState?.academyPlayers || []).map(p => p.playerId), ...(t.managementState?.academyPendingProspects || [])]),
    ])
}

/** Minimum weekly wage any player asks for. */
export const MIN_ASKING_WAGE = 200

/**
 * Share of the full ask a free agent still demands after `weeksUnsigned`
 * weeks without a club (FREE_AGENT_TUNING). 1 for contracted players.
 */
export function freeAgentWageFactor(player: Pick<PlayerSaveData, "freeAgentSinceWeek">, currentWeek: number): number {
    if (player.freeAgentSinceWeek === undefined) return 1
    const weeksUnsigned = Math.max(0, currentWeek - player.freeAgentSinceWeek)
    return Math.max(FREE_AGENT_TUNING.WAGE_DECAY_FLOOR, 1 - FREE_AGENT_TUNING.WAGE_DECAY_PER_WEEK * weeksUnsigned)
}

/** Buyer-tier factor: smaller clubs get proportionately smaller asks (same rule for every club). */
export function buyerReputationFactor(buyer?: Pick<TeamSaveData, "reputation">): number {
    if (!buyer) return 1
    const rep = Math.max(0, Math.min(100, Number.isFinite(buyer.reputation) ? buyer.reputation : 50))
    const min = FREE_AGENT_TUNING.BUYER_REPUTATION_MIN_FACTOR
    return min + (1 - min) * rep / 100
}

/**
 * Opening wage expectation, shared by human and AI negotiations. Decays the
 * longer a free agent stays unsigned and scales with the buyer's reputation
 * when the buyer is known.
 */
export function recruitmentSalary(player: PlayerSaveData, currentWeek: number, buyer?: Pick<TeamSaveData, "reputation">): number {
    const base = evaluatePlayer(player, undefined, undefined, currentWeek).transferValue / 100
    return Math.max(MIN_ASKING_WAGE, Math.round(base * freeAgentWageFactor(player, currentWeek) * buyerReputationFactor(buyer)))
}

export function employedScout(staff: StaffSaveData[], team: TeamSaveData | undefined, week: number): StaffSaveData | undefined {
    return staff.find(s => s.role === "scout" && s.teamId === team?.id && team?.staffIds?.includes(s.id)
        && (s.contractEndWeek == null || s.contractEndWeek > week))
}

/** Reserve against the whole recurring deficit, including dated staff and upkeep. No speculative prize money. */
/**
 * `quorum`: filling a vacancy below five senior players. A club in debt whose
 * weekly cash flow already covers the wage may still sign a free agent (no
 * fee); otherwise an indebted but recovering club could never field a team
 * and forfeited every match while it paid the debt down.
 */
export function recruitmentBudget(save: Pick<GameSave, "players" | "contracts" | "staff" | "currentWeek" | "academyPlayers"> & { playerTeamId: string | null }, team: TeamSaveData, options: { quorum?: boolean } = {}) {
    const academyCount = team.id === save.playerTeamId ? (save.academyPlayers || []).length : (team.youthAcademyIds || []).length + (team.managementState?.academyPlayers || []).length
    const report = EconomyEngine.processWeeklyFinances(team, save.players, save.contracts, save.staff || [], save.currentWeek + 1, academyCount)
    return (salary: number, fee = 0): boolean => Number.isSafeInteger(salary) && salary > 0 && Number.isSafeInteger(fee) && fee >= 0
        && Number.isFinite(team.budget) && (team.budget - fee >= Math.max(0, salary - report.net) * 26
            || (!!options.quorum && fee === 0 && salary <= Math.max(report.net, FREE_AGENT_TUNING.QUORUM_WAGE_ALLOWANCE)))
}

/** Optional infrastructure must pay its ongoing costs without speculative future winnings. */
export function affordableInvestment(save: GameSave, projectedTeam: TeamSaveData, fee: number, addedWeeklyCost = 0): boolean {
    const academyCount = projectedTeam.id === save.playerTeamId ? (save.academyPlayers || []).length : (projectedTeam.youthAcademyIds || []).length + (projectedTeam.managementState?.academyPlayers || []).length
    const report = EconomyEngine.processWeeklyFinances(projectedTeam, save.players, save.contracts, save.staff || [], save.currentWeek + 1, academyCount)
    const trainingCost = (projectedTeam.activeRoleTraining || []).reduce((sum, session) => sum + session.weeklyCost, 0)
    return Number.isSafeInteger(fee) && fee >= 0 && Number.isFinite(addedWeeklyCost) && addedWeeklyCost >= 0
        && projectedTeam.budget >= fee && report.net - trainingCost - addedWeeklyCost >= 0
}

/** Registration checks current senior ownership; future match-day expiry is checked separately. */
export function seniorRosterEligibility(save: Pick<GameSave, "teams" | "players" | "contracts" | "currentWeek" | "academyPlayers" | "academyPendingProspects">, team: TeamSaveData): { eligible: boolean; reason: string } {
    const held = academyHeldPlayerIds(save)
    const seen = new Set<string>()
    for (const id of team.rosterIds) {
        const player = save.players.find(p => p.id === id)
        if (seen.has(id)) return { eligible: false, reason: "Remove duplicate players from the squad" }
        seen.add(id)
        if (!player || player.isRetired || held.has(id)) return { eligible: false, reason: "Every squad member must be an active senior player" }
        if (save.teams.some(t => t.id !== team.id && t.rosterIds.includes(id))) return { eligible: false, reason: "A squad member is registered to another club" }
        if (!save.contracts.some(c => c.playerId === id && c.teamId === team.id && c.startWeek <= save.currentWeek && c.endWeek > save.currentWeek)) return { eligible: false, reason: "Every squad member needs an active contract with this club" }
    }
    return seen.size >= 5 ? { eligible: true, reason: "Senior squad ready" } : { eligible: false, reason: `Need ${5 - seen.size} more senior players to compete` }
}
