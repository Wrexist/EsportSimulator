/**
 * Club finances (Phase 4.4): starting cash, runway, and the AI side of the
 * insolvency rule.
 *
 *  - Starting cash is CLUB_ECONOMY_TUNING.STARTING_RUNWAY_WEEKS of the club's
 *    own weekly running costs (wages, staff, upkeep, operations), so every
 *    tier starts with the same runway in weeks rather than a flat sum that
 *    made small clubs rich and gave nobody a reason to budget.
 *  - AI cost control: an AI club losing money with a short runway lets its
 *    highest-paid staff member go each week.
 *  - AI administration: an AI club that stays insolvent for as many weeks as
 *    it takes the managed club to go bankrupt is put into administration. It
 *    sheds its bench and staff, closes its academy, lists its top earner and
 *    loses reputation; new owners then clear the debt to a few weeks of its
 *    cut costs so the club keeps fielding a team.
 */

import type { GameSave, PlayerSaveData, TeamSaveData } from "../save-types"
import { CLUB_ECONOMY_TUNING } from "@/lib/balance-tuning"
import { EconomyEngine } from "../economy-engine"
import { applyRosterChangePenalty } from "../chemistry-engine"
import { recalculateTeamSynergy } from "../processors/team-synergy-recalc"

/** Weekly running costs at the next settlement (the runway denominator). */
export function weeklyCosts(save: Pick<GameSave, "players" | "contracts" | "staff" | "currentWeek"> & { playerTeamId?: string }, team: TeamSaveData): number {
    return EconomyEngine.processWeeklyFinances(team, save.players || [], save.contracts || [], save.staff || [], save.currentWeek + 1, 0, { implicitGear: !!save.playerTeamId && team.id !== save.playerTeamId }).expenses.total
}

/** Starting cash for a club: a fixed number of weeks of its own running costs. */
export function startingBudgetFor(save: Pick<GameSave, "players" | "contracts" | "staff" | "currentWeek"> & { playerTeamId?: string }, team: TeamSaveData): number {
    const costs = weeklyCosts(save, team)
    const raw = costs * CLUB_ECONOMY_TUNING.STARTING_RUNWAY_WEEKS
    const step = CLUB_ECONOMY_TUNING.STARTING_BUDGET_ROUND
    return Math.max(CLUB_ECONOMY_TUNING.STARTING_BUDGET_MIN, Math.round(raw / step) * step)
}

/**
 * Opening cash at career creation: the runway formula, plus the missing
 * starters' wages for the same number of weeks when a club has fewer than
 * five players (it has to sign them before its first match).
 */
export function initialClubBudget(save: Pick<GameSave, "players" | "contracts" | "staff" | "currentWeek"> & { playerTeamId?: string }, team: TeamSaveData): number {
    const base = startingBudgetFor(save, team)
    const missing = Math.max(0, 5 - team.rosterIds.length)
    if (!missing) return base
    const roster = new Set(team.rosterIds)
    const wages = save.contracts.filter(c => c.teamId === team.id && roster.has(c.playerId)).map(c => c.salaryPerWeek)
    const avg = wages.length ? wages.reduce((a, b) => a + b, 0) / wages.length : 500
    const step = CLUB_ECONOMY_TUNING.STARTING_BUDGET_ROUND
    return base + Math.round((missing * Math.max(500, avg) * CLUB_ECONOMY_TUNING.STARTING_RUNWAY_WEEKS) / step) * step
}

export interface RunwaySummary {
    cash: number
    weeklyCosts: number
    weeklyIncome: number
    weeklyNet: number
    /** Cash / weekly costs: weeks the club survives with no income at all. */
    grossRunwayWeeks: number
    /** Cash / weekly deficit (Infinity when the club makes money). */
    netRunwayWeeks: number
}

export function runwaySummary(save: Pick<GameSave, "players" | "contracts" | "staff" | "currentWeek"> & { playerTeamId?: string }, team: TeamSaveData): RunwaySummary {
    const report = EconomyEngine.processWeeklyFinances(team, save.players, save.contracts, save.staff || [], save.currentWeek + 1, 0, { implicitGear: !!save.playerTeamId && team.id !== save.playerTeamId })
    const cash = team.budget
    return {
        cash,
        weeklyCosts: report.expenses.total,
        weeklyIncome: report.income.total,
        weeklyNet: report.net,
        grossRunwayWeeks: report.expenses.total > 0 ? cash / report.expenses.total : Infinity,
        netRunwayWeeks: report.net < 0 ? cash / -report.net : Infinity,
    }
}

function releaseToFreeAgency(team: TeamSaveData, save: GameSave, player: PlayerSaveData, reason: string): void {
    team.rosterIds = team.rosterIds.filter(id => id !== player.id)
    applyRosterChangePenalty(team, save.currentWeek, 1)
    if (team.activeRoleTraining) {
        team.activeRoleTraining = team.activeRoleTraining.filter(t => t.playerId !== player.id)
        team.trainingSlotsUsed = team.activeRoleTraining.length
    }
    player.forSale = false
    player.transferListingPrice = undefined
    player.weeksOnTransferList = undefined
    save.contracts = save.contracts.filter(c => !(c.playerId === player.id && c.teamId === team.id))
    save.transferHistory?.push({
        id: `release_admin_${save.currentWeek}_${player.id}`,
        week: save.currentWeek, type: "RELEASE", playerId: player.id, playerName: player.nickname,
        fromTeamId: team.id, fromTeamName: team.name, toTeamId: null, toTeamName: `Free Agent (${reason})`, fee: 0,
    })
}

/** AI clubs insolvent for ADMINISTRATION_WEEKS go into administration. Returns the clubs affected. */
export function processAIAdministration(save: GameSave, playerTeamId: string): string[] {
    const affected: string[] = []
    const players = new Map(save.players.map(p => [p.id, p]))
    for (const team of save.teams) {
        if (team.id === playerTeamId) continue
        // Cost control before it gets that far: an AI club losing money with
        // a short runway lets its highest-paid staff member go (one a week),
        // as a manager cutting overheads would.
        if ((team.weeklyNet ?? 0) < 0 && (team.runwayWeeks ?? 999) < CLUB_ECONOMY_TUNING.COST_CONTROL_RUNWAY_WEEKS && team.staffIds.length) {
            const staffById = new Map(save.staff.map(s => [s.id, s]))
            const priciest = [...team.staffIds].sort((a, b) => (staffById.get(b)?.salaryPerWeek ?? 0) - (staffById.get(a)?.salaryPerWeek ?? 0) || a.localeCompare(b))[0]
            team.staffIds = team.staffIds.filter(id => id !== priciest)
            save.staff = save.staff.filter(s => !(s.id === priciest && s.teamId === team.id))
        }
        if ((team.consecutiveInsolventWeeks ?? 0) < CLUB_ECONOMY_TUNING.ADMINISTRATION_WEEKS) continue
        const wage = (id: string) => save.contracts.find(c => c.playerId === id && c.teamId === team.id)?.salaryPerWeek ?? 0
        // 1. Bench beyond five, highest earners first.
        const bench = team.rosterIds.slice(5).sort((a, b) => wage(b) - wage(a) || a.localeCompare(b))
        for (const id of bench) {
            const p = players.get(id)
            if (p) releaseToFreeAgency(team, save, p, "administration")
        }
        // 2. Staff contracts end; 3. the academy closes.
        if (team.staffIds.length) {
            const released = new Set(team.staffIds)
            save.staff = save.staff.filter(s => !(released.has(s.id) && s.teamId === team.id))
            team.staffIds = []
        }
        if (team.academyFacility?.level) team.academyFacility = { ...team.academyFacility, level: 0, lastUpgradeWeek: save.currentWeek }
        // 4. The highest earner is put on the transfer list (sold in a window).
        const top = [...team.rosterIds].sort((a, b) => wage(b) - wage(a) || a.localeCompare(b))[0]
        const topPlayer = top ? players.get(top) : undefined
        if (topPlayer && !topPlayer.forSale) {
            topPlayer.forSale = true
            topPlayer.transferListingPrice = (topPlayer.prestigeScore || 50) * 1000
            topPlayer.weeksOnTransferList = 0
        }
        recalculateTeamSynergy(team, save.players)
        team.reputation = Math.max(0, (team.reputation ?? 0) - CLUB_ECONOMY_TUNING.ADMINISTRATION_REPUTATION_PENALTY)
        // 5. New owners recapitalise the club to a few weeks of its cut costs.
        const floor = CLUB_ECONOMY_TUNING.ADMINISTRATION_RECAPITALISE_WEEKS
            * EconomyEngine.processWeeklyFinances(team, save.players, save.contracts, save.staff, save.currentWeek + 1, 0, { implicitGear: true }).expenses.total
        if (team.budget < floor) team.budget = Math.round(floor)
        team.consecutiveInsolventWeeks = 0
        team.administrations = (team.administrations ?? 0) + 1
        save.newsFeed.unshift({
            id: `news_admin_${save.currentWeek}_${team.id}`,
            title: `${team.name} enter administration`,
            content: `After ${CLUB_ECONOMY_TUNING.ADMINISTRATION_WEEKS} weeks below zero, ${team.name} have released their bench and staff, closed the academy and listed their top earner. New owners have cleared the debt.`,
            week: save.currentWeek, category: "FINANCE", teamId: team.id,
        })
        affected.push(team.id)
    }
    return affected
}
