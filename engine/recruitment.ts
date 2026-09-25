import type { GameSave, PlayerSaveData, StaffSaveData, TeamSaveData } from "./save-types"
import { evaluatePlayer } from "./player-evaluation"
import { EconomyEngine } from "./economy-engine"

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

/** Opening wage expectation, shared by human and AI negotiations. */
export function recruitmentSalary(player: PlayerSaveData, currentWeek: number): number {
    return Math.max(200, Math.round(evaluatePlayer(player, undefined, undefined, currentWeek).transferValue / 100))
}

export function employedScout(staff: StaffSaveData[], team: TeamSaveData | undefined, week: number): StaffSaveData | undefined {
    return staff.find(s => s.role === "scout" && s.teamId === team?.id && team?.staffIds?.includes(s.id)
        && (s.contractEndWeek == null || s.contractEndWeek > week))
}

/** Reserve against the whole recurring deficit, including dated staff and upkeep. No speculative prize money. */
export function recruitmentBudget(save: Pick<GameSave, "players" | "contracts" | "staff" | "currentWeek" | "academyPlayers"> & { playerTeamId: string | null }, team: TeamSaveData) {
    const academyCount = team.id === save.playerTeamId ? (save.academyPlayers || []).length : (team.youthAcademyIds || []).length + (team.managementState?.academyPlayers || []).length
    const report = EconomyEngine.processWeeklyFinances(team, save.players, save.contracts, save.staff || [], save.currentWeek + 1, academyCount)
    return (salary: number, fee = 0): boolean => Number.isSafeInteger(salary) && salary > 0 && Number.isSafeInteger(fee) && fee >= 0
        && Number.isFinite(team.budget) && team.budget - fee >= Math.max(0, salary - report.net) * 26
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
