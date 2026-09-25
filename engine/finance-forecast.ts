import { EconomyEngine } from "./economy-engine"
import type { ContractSaveData, PlayerSaveData, StaffSaveData, TeamSaveData } from "./save-types"

/** Scenario at today's reputation/followers/upkeep. No unearned prizes, goals or speculative sales. */
export function forecastFinances(team: TeamSaveData, players: PlayerSaveData[], contracts: ContractSaveData[], staff: StaffSaveData[], currentWeek: number, weeks = 12, academyProspectCount = 0) {
    let projected = { ...team, sponsors: (team.sponsors ?? []).map(s => ({ ...s })) }
    return Array.from({ length: Math.max(0, Math.min(104, Math.floor(weeks))) }, (_, i) => {
        const week = currentWeek + i + 1
        const report = EconomyEngine.processWeeklyFinances(projected, players, contracts, staff, week, academyProspectCount)
        projected = { ...projected, budget: report.newBalance, sponsors: projected.sponsors
            .map(s => ({ ...s, remainingWeeks: s.remainingWeeks - 1 })).filter(s => s.remainingWeeks > 0) }
        return { week, budget: report.newBalance, isNegative: report.newBalance < 0, income: report.income.total, expenses: report.expenses.total, net: report.net }
    })
}

/** Runway at the current recurring rate; debt is never displayed as unlimited runway. */
export function cashRunway(balance: number, weeklyNet: number): number {
    if (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(weeklyNet)) return 0
    return weeklyNet < 0 ? Math.max(0, Math.floor(balance / -weeklyNet)) : 999
}

/** Read-only preview of the same roster, fee and salary that the transfer action commits. */
export function quotePlayerSigning(team: TeamSaveData, players: PlayerSaveData[], contracts: ContractSaveData[], staff: StaffSaveData[], currentWeek: number, playerId: string, fee: number, salary: number, duration: number, academyProspectCount = 0) {
    const cashAfterSigning = team.budget - fee
    const projectedTeam = { ...team, budget: cashAfterSigning, rosterIds: [...new Set([...team.rosterIds, playerId])] }
    const projectedContracts = [...contracts.filter(c => c.playerId !== playerId),
        { playerId, teamId: team.id, salaryPerWeek: salary, startWeek: currentWeek, endWeek: currentWeek + duration, buyout: 0 }]
    const report = EconomyEngine.processWeeklyFinances(projectedTeam, players, projectedContracts, staff, currentWeek + 1, academyProspectCount)
    return { cashAfterSigning, weeklyNet: report.net, runwayWeeks: cashRunway(cashAfterSigning, report.net) }
}
