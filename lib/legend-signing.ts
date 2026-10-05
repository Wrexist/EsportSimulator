/**
 * Cost and affordability of the Major-win legend reward.
 *
 * The reward signs a two-year contract at roughly $90-100k a week. The pick
 * modal used to be mandatory and hid the wage, so a club that won two Majors
 * without sponsors went from -$14k to -$205k a week and was dissolved at
 * week 98 (L27 packaged early-career run). The pick now shows the wage and
 * runway, can be declined, and refuses a signing that would leave less than
 * LEGEND_MIN_RUNWAY_WEEKS of cash at the new recurring rate.
 */
import { quotePlayerSigning } from "@/engine/finance-forecast"
import type { ContractSaveData, PlayerSaveData, StaffSaveData, TeamSaveData } from "@/engine/save-types"

/** Two insolvency windows (8 weeks each) of cover at the new weekly rate. */
export const LEGEND_MIN_RUNWAY_WEEKS = 16
export const LEGEND_CONTRACT_WEEKS = 104

/** $50k floor + $500/skill; about $99.5k a week for a 99-skill legend. */
export function legendSalary(skill: number): number {
    return Math.round(50000 + (Number.isFinite(skill) ? skill : 0) * 500)
}

export interface LegendQuote {
    salary: number
    weeklyNet: number
    runwayWeeks: number
    affordable: boolean
}

export function quoteLegendSigning(
    state: { teams: TeamSaveData[]; players: PlayerSaveData[]; contracts: ContractSaveData[]; staff: StaffSaveData[]; currentWeek: number; playerTeamId: string | null; academyPlayers?: unknown[] },
    legendId: string,
): LegendQuote | null {
    const team = state.teams.find(t => t.id === state.playerTeamId)
    const legend = state.players.find(p => p.id === legendId)
    if (!team || !legend) return null
    const salary = legendSalary(legend.skill)
    const quote = quotePlayerSigning(team, state.players, state.contracts ?? [], state.staff ?? [],state.currentWeek, legendId, 0, salary, LEGEND_CONTRACT_WEEKS, state.academyPlayers?.length ?? 0)
    return {
        salary,
        weeklyNet: quote.weeklyNet,
        runwayWeeks: quote.runwayWeeks,
        affordable: quote.weeklyNet >= 0 || quote.runwayWeeks >= LEGEND_MIN_RUNWAY_WEEKS,
    }
}
