import { produce, enableMapSet } from 'immer'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { createAcademySlice } from '@/store/slices/academy-slice'
import { createTournamentSlice } from '@/store/slices/tournament-slice'
import { AcademyEngine, academyFocusWeights, visibleAcademyPotential } from '@/engine/academy-engine'
import { createTeamDrillsSlice } from '@/store/slices/team-drills-slice'
import { TrainingManager } from '@/engine/training-manager'
import { TrainingProcessor } from '@/engine/processors/training-processor'
import { affordableInvestment, seniorRosterEligibility } from '@/engine/recruitment'
import { FULL_TOURNAMENT_CALENDAR } from '@/data/tournament-calendar'
import { TrainingFocus } from '@/types'
import type { StoreState } from '@/store/types'

enableMapSet()
function harness() {
    const save = createLaunchFixture('first-week', 3417)
    const team = save.teams[0]
    team.academyFacility = { level: 3, builtWeek: 1 }
    const player = save.players.find(p => p.id === 'qa_free_agent')!
    save.academyPlayers = [{ id: 'prospect', playerId: player.id, enrolledWeek: 1, energy: 20, totalXpGained: 0, developmentProgress: 0, potentialRevealed: false } as never]
    save.academyRoster = { IGL: 'prospect' } as never
    save.academyTrainingSchedule = {} as never
    save.academyWeeklyReports = []
    save.academyScoutingMissions = []
    let state = save as unknown as StoreState
    const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === 'function' ? produce(state, fn) : { ...state, ...fn } }
    return { read: () => state, set, academy: createAcademySlice(set, () => state), tournament: createTournamentSlice(set, () => state) }
}

test('academy day/level validation rejects locked and unbounded training slots', () => {
    const h = harness()
    h.set(s => { s.teams[0].academyFacility!.level = 1 })
    for (const day of [-1, 7, 1.5, NaN]) h.academy.updateAcademySchedule(day, 'aim_intensive')
    h.academy.updateAcademySchedule(0, 'scrim_high')
    h.academy.updateAcademySchedule(1, 'unknown')
    expect(h.read().academyTrainingSchedule).toEqual({})
    h.academy.updateAcademySchedule(0, 'aim_intensive')
    expect(h.read().academyTrainingSchedule[0]).toBe('aim_intensive')
})

test('academy fatigue applies between drills; recovery order changes the outcome; one receipt per week', () => {
    const run = (drills: string[]) => {
        const h = harness()
        drills.forEach((drill, day) => h.academy.updateAcademySchedule(day, drill))
        h.academy.processAcademyWeek()
        const before = JSON.stringify(h.read())
        h.academy.processAcademyWeek()
        expect(JSON.stringify(h.read())).toBe(before)
        return h.read().academyWeeklyReports[0].prospectReports[0]
    }
    const intensive = run(['aim_intensive', 'aim_intensive', 'aim_intensive'])
    const recoveryFirst = run(['zen_rest', 'aim_intensive', 'aim_intensive'])
    const recoveryLast = run(['aim_intensive', 'aim_intensive', 'zen_rest'])
    expect(intensive.xpGained).toBe(61)
    expect(recoveryFirst.xpGained).toBeGreaterThan(recoveryLast.xpGained)
    expect(recoveryFirst.energyChange).toBeGreaterThan(intensive.energyChange)
})

test('discarding a non-pending or subsequently owned prospect cannot delete a player', () => {
    const h = harness(), id = h.read().teams[0].rosterIds[0]
    h.academy.discardPendingProspect(id)
    expect(h.read().players.some(p => p.id === id)).toBe(true)
    h.set(s => { s.academyPendingProspects = [id] })
    h.academy.discardPendingProspect(id)
    expect(h.read().players.some(p => p.id === id)).toBe(true)
})

test('role training refuses foreign, retired and unknown-role assignments', () => {
    const save = createLaunchFixture('first-week', 3417), team = save.teams[0]
    expect(TrainingManager.startRoleTraining(save, team.id, save.teams[1].rosterIds[0], 'awper').success).toBe(false)
    expect(TrainingManager.startRoleTraining(save, team.id, team.rosterIds[0], 'bogus' as never).success).toBe(false)
    save.players.find(p => p.id === team.rosterIds[0])!.isRetired = true
    expect(TrainingManager.startRoleTraining(save, team.id, team.rosterIds[0], 'awper').success).toBe(false)
    expect(team.activeRoleTraining || []).toHaveLength(0)
})

test('weekly training never reduces an existing specialist stat to a lower potential', () => {
    const save = createLaunchFixture('first-week', 3417), player = save.players[0]
    player.rifle = 90; player.potential = 60
    TrainingProcessor.processTraining(save, new Map([[save.teams[0].id, { focus: TrainingFocus.AIM, intensity: 1 }]]))
    expect(player.rifle).toBe(90)
})

test('optional investments require ongoing affordability, including role-training costs', () => {
    const save = createLaunchFixture('first-week', 3417), team = save.teams[0]
    team.budget = 1_000_000
    expect(affordableInvestment(save, team, 10000)).toBe(true)
    expect(affordableInvestment(save, team, 10000, 1_000_000)).toBe(false)
    team.activeRoleTraining = [{ weeklyCost: 1_000_000 } as never]
    expect(affordableInvestment(save, team, 10000)).toBe(false)
})

test('registration enforces senior ownership, contracts and actual entry requirements', () => {
    const h = harness(), open = FULL_TOURNAMENT_CALENDAR.find(t => t.entryType === 'OPEN')!
    expect(h.tournament.registerForTournament(open.id).success).toBe(true)
    const invalid = harness()
    invalid.set(s => { s.teams[0].rosterIds[4] = s.teams[0].rosterIds[0] })
    expect(invalid.tournament.registerForTournament(open.id).success).toBe(false)
    expect(invalid.read().tournamentQualifications).toHaveLength(0)
    const expired = harness()
    expired.set(s => { s.contracts[0].endWeek = s.currentWeek })
    expect(seniorRosterEligibility(expired.read(), expired.read().teams[0]).eligible).toBe(false)
    const invite = FULL_TOURNAMENT_CALENDAR.find(t => t.entryType === 'INVITE' && t.requiredRanking)!
    const unranked = harness()
    unranked.set(s => { s.teams[0].worldRanking = 999 })
    expect(unranked.tournament.registerForTournament(invite.id).success).toBe(false)
})


test('fractional academy gains accumulate while above-potential specialist stats are preserved', () => {
    const player = { rifle: 60, tactic: 90, potential: 80 }
    for (let i = 0; i < 20; i++) Object.assign(player, AcademyEngine.applyStatImprovements(player as never, { rifle: 0.01, tactic: 0.01 }))
    expect(player.rifle).toBeCloseTo(60.2)
    expect(player.tactic).toBe(90)
})

test('recovery drills work when exhausted; active-match drills cannot change player state', () => {
    const h = harness()
    h.set(s => { for (const p of s.players) p.fatigue = 95 })
    const drills = createTeamDrillsSlice(h.set, h.read)
    expect(drills.runTeamDrill('sleep_protocol', [], -20).success).toBe(true)
    expect(h.read().players[0].fatigue).toBe(75)
    h.set(s => { s.activeMatchId = 'active' })
    const before = JSON.stringify(h.read())
    expect(drills.runTeamDrill('sleep_protocol', [], -20).success).toBe(false)
    expect(JSON.stringify(h.read())).toBe(before)
})


test('individual academy focus redistributes a fixed development budget', () => {
    const mechanical = academyFocusWeights('MECHANICAL', ['rifle', 'reaction'])
    const physical = academyFocusWeights('PHYSICAL', ['rifle', 'reaction'])
    expect(mechanical[0]).toBeGreaterThan(mechanical[1])
    expect(physical[1]).toBeGreaterThan(physical[0])
    expect(mechanical.reduce((a, b) => a + b, 0)).toBe(2)
    expect(academyFocusWeights('BALANCED', ['rifle', 'reaction'])).toEqual([1, 1])
})

test('academy level bonus affects XP and invalid individual focus is rejected', () => {
    const low = harness(), high = harness()
    low.set(s => { s.teams[0].academyFacility!.level = 1 })
    for (const h of [low, high]) {
        h.academy.setProspectTraining('prospect', 'MECHANICAL')
        h.academy.setProspectTraining('prospect', 'bogus' as never)
        expect(h.read().academyPlayers[0].trainingFocus).toBe('MECHANICAL')
        h.academy.updateAcademySchedule(0, 'aim_intensive')
        h.academy.processAcademyWeek()
    }
    expect(high.read().academyPlayers[0].totalXpGained / low.read().academyPlayers[0].totalXpGained).toBeCloseTo(1.3 / 1.05)
})

test('Iron Lung never reduces recovery and expired academy scouts produce no prospect', () => {
    const h = harness()
    h.set(s => { s.players[0].fatigue = 80; s.players[0].unlockedTalentIds = ['player_fit_2']; s.academyScoutingMissions = [{ id: 'missing', scoutId: 'gone', weeksRemaining: 1 } as never] })
    const drills = createTeamDrillsSlice(h.set, h.read)
    drills.runTeamDrill('sleep_protocol', [], -20)
    expect(h.read().players[0].fatigue).toBe(60)
    h.academy.processAcademyWeek()
    expect(h.read().academyScoutingMissions).toHaveLength(0)
    expect(h.read().academyPendingProspects).toHaveLength(0)
    expect(h.read().newsFeed.some(n => n.title === 'Academy scouting cancelled')).toBe(true)
})


test('drill effects come from the catalog; leadership and wellness effects reach the correct attributes', () => {
    const h = harness(), drills = createTeamDrillsSlice(h.set, h.read)
    h.set(s => { s.players[0].potential = 50; s.players[0].morale = 80; s.players[0].leader = 40 })
    const age = h.read().players[0].age
    expect(drills.runTeamDrill('unknown', [{ stat: 'age', amount: 50 }], -100).success).toBe(false)
    expect(drills.runTeamDrill('igl_drill', [{ stat: 'age', amount: 50 }], -100).success).toBe(true)
    expect(h.read().players[0].leader).toBe(44)
    expect(h.read().players[0].age).toBe(age)
    drills.runTeamDrill('sleep_protocol', [], 100)
    expect(h.read().players[0].morale).toBe(84)
})


test('unrevealed academy potential does not affect display or sorting', () => {
    const hidden = { potentialRevealed: false }, revealed = { potentialRevealed: true }
    expect(visibleAcademyPotential(hidden, { potential: 99 })).toBeNull()
    expect(visibleAcademyPotential(hidden, { potential: 40 })).toBeNull()
    expect(visibleAcademyPotential(revealed, { potential: 0 })).toBe(0)
    expect(visibleAcademyPotential(revealed, { potential: 85 })).toBe(85)
})


test('one enrolled prospect can occupy only one valid academy lineup slot', () => {
    const h = harness()
    h.academy.updateAcademyRoster('AWPer', 'prospect')
    expect(h.read().academyRoster.IGL).toBeNull()
    expect(h.read().academyRoster.AWPer).toBe('prospect')
    h.academy.updateAcademyRoster('Support', 'missing')
    h.academy.updateAcademyRoster('not-a-role' as never, 'prospect')
    expect(Object.values(h.read().academyRoster).filter(Boolean)).toEqual(['prospect'])
})
