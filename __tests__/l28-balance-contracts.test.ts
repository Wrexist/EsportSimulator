import { AIManager } from '@/engine/ai-manager'
import { SeededRNG } from '@/engine/rng'
import { createLaunchFixture } from '../scripts/launch/fixtures'
import { recruitmentSalary } from '@/engine/recruitment'
import { EconomyEngine } from '@/engine/economy-engine'
import { balanceIssues, distribution } from '../scripts/launch/balance-metrics'
import { nonfinitePaths } from '../scripts/launch/balance-metrics'
import { generateAnnualTop20 } from '@/engine/pro-awards-engine'
import { FinanceProcessor } from '@/engine/processors/finance-processor'

function scout(budget = 5_000_000) {
    const save = createLaunchFixture('first-week', 28001), team = save.teams[1]
    team.budget = budget
    const before = save.players.length
    // Fixed independent seeds until the existing 5% roll succeeds.
    for (let seed = 1; seed <= 2000 && save.players.length === before; seed++) AIManager.processAcademyScouting(save, team, new SeededRNG(seed))
    return { save, team, before }
}

test('scouted senior players receive a real fixed-term wage charged by normal finance', () => {
    const { save, team, before } = scout()
    expect(save.players).toHaveLength(before + 1)
    const player = save.players.at(-1)!, contract = save.contracts.find(c => c.playerId === player.id)!
    expect(contract).toEqual({ playerId: player.id, teamId: team.id, salaryPerWeek: recruitmentSalary(player, save.currentWeek), startWeek: save.currentWeek, endWeek: save.currentWeek + 104, buyout: 0 })
    const withPlayer = EconomyEngine.processWeeklyFinances(team, save.players, save.contracts, save.staff, save.currentWeek + 1)
    const without = EconomyEngine.processWeeklyFinances(team, save.players, save.contracts.filter(c => c !== contract), save.staff, save.currentWeek + 1)
    expect(withPlayer.expenses.total - without.expenses.total).toBe(contract.salaryPerWeek)
    expect(balanceIssues(save)).toEqual([])
})

test('insolvent scouting cannot create a free player or orphan contract', () => {
    const { save, team, before } = scout(-5_000_000)
    expect(save.players).toHaveLength(before)
    expect(team.rosterIds).toHaveLength(5)
    expect(save.contracts).toHaveLength(15)
})

test('balance audit catches free seniors, duplicate ownership and nonfinite cash', () => {
    const save = createLaunchFixture('first-week', 28001)
    save.contracts = save.contracts.filter(c => c.playerId !== save.teams[0].rosterIds[0])
    save.teams[1].rosterIds.push(save.teams[0].rosterIds[0])
    save.teams[0].budget = NaN
    const issues = balanceIssues(save)
    expect(issues.some(i => i.startsWith('uncontracted-senior:'))).toBe(true)
    expect(issues.some(i => i.startsWith('duplicate-ownership:'))).toBe(true)
    expect(issues.some(i => i.startsWith('nonfinite-budget:'))).toBe(true)
    expect(distribution([1, 3, 7, 9]).median).toBe(5)
    expect(distribution([1, NaN]).finite).toBe(1)
})

test('annual awards remain finite and reproducible for short player IDs', () => {
    const save = createLaunchFixture('first-week', 28001)
    save.players[0].id = 'x'
    const awards = generateAnnualTop20(save, save.playerTeamId)
    expect(nonfinitePaths(awards)).toEqual([])
    expect(generateAnnualTop20(save, save.playerTeamId)).toEqual(awards)
})

test('recorded awards KPR divides kills by rounds, including series and overtime', () => {
    const save = createLaunchFixture('first-week', 28001), player = save.players[0]
    save.completedMatches = Array.from({ length: 10 }, (_, i) => ({ ...save.scheduledMatches[0], id: `award_${i}`, week: 1,
        result: { playerStats: { [player.id]: { kills: 30, rating: 1.2, adr: 80, kast: 70, mapsPlayed: 2 } },
            maps: [{ homeScore: 13, awayScore: 7 }, { finalScore: { team1: 16, team2: 14 } }] }
    } as never))
    const entry = generateAnnualTop20(save, save.playerTeamId).top20.find(p => p.playerId === player.id)!
    expect(entry.kpr).toBe(.6)
})

test('AI season-end retirement terminates wages and records the retirement week', () => {
    const save = createLaunchFixture('first-week', 28001), team = save.teams[1]
    const player = { ...save.players[0], id: 'l28_retiree', age: 35, skill: 30 }
    save.currentWeek = 52
    save.players.push(player); team.rosterIds.push(player.id)
    save.contracts.push({ playerId: player.id, teamId: team.id, salaryPerWeek: 2000, startWeek: 1, endWeek: 200, buyout: 0 })
    AIManager.processSeasonEnd(save)
    expect(player.isRetired).toBe(true)
    expect(player.retirementWeek).toBe(52)
    expect(team.rosterIds).not.toContain(player.id)
    expect(save.contracts.some(c => c.playerId === player.id)).toBe(false)
    expect(balanceIssues(save)).toEqual([])
})

test('late weekly prize income prevents provisional bankruptcy without rewriting money', () => {
    const save = createLaunchFixture('first-week', 28001), team = save.teams[0]
    save.currentWeek = 33
    team.budget = 300117; team.weeklyNet = -20212
    team.financeSettlement = { week: 33, income: 40838, expenses: 61050 }
    team.financialState = 'INSOLVENT'; team.consecutiveInsolventWeeks = 8
    save.gameOverReason = 'BANKRUPTCY'; save.gameOverWeek = 33
    FinanceProcessor.reconcileWeeklySolvency(save, team.id)
    expect(save.gameOverReason).toBeUndefined()
    expect(team.budget).toBe(300117)
    expect(team.consecutiveInsolventWeeks).toBe(0)
    expect(team.financialState).toBe('STABLE')
    const first = structuredClone(save)
    FinanceProcessor.reconcileWeeklySolvency(save, team.id)
    expect(save).toEqual(first)
})

test('solvency reconciliation preserves debt, past terminal careers and board dismissals', () => {
    for (const reason of ['BANKRUPTCY', 'SACKED']) {
        const save = createLaunchFixture('first-week', 28001), team = save.teams[0]
        team.financeSettlement = { week: save.currentWeek, income: 0, expenses: 0 }
        save.gameOverReason = reason; save.gameOverWeek = save.currentWeek - 1
        FinanceProcessor.reconcileWeeklySolvency(save, team.id)
        expect(save.gameOverReason).toBe(reason)
    }
    const save = createLaunchFixture('first-week', 28001), team = save.teams[0]
    team.budget = -1; team.consecutiveInsolventWeeks = 8
    team.financeSettlement = { week: save.currentWeek, income: 0, expenses: 1 }
    save.gameOverReason = 'BANKRUPTCY'; save.gameOverWeek = save.currentWeek
    FinanceProcessor.reconcileWeeklySolvency(save, team.id)
    expect(save.gameOverReason).toBe('BANKRUPTCY')
    expect(team.consecutiveInsolventWeeks).toBe(8)
})
