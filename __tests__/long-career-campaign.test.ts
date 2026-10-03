/**
 * Regressions for defects surfaced by the long-career campaign
 * (scripts/launch/long-career-campaign.ts) plus coverage of its invariant
 * helpers, so a broken check cannot silently pass a campaign.
 */
import { produce, enableMapSet } from 'immer'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { createMatchSimulationSlice } from '@/store/slices/match-simulation-slice'
import { reconcileCash, structuralFailures, tournamentFailures } from '@/scripts/launch/long-career-campaign'
import type { StoreState } from '@/store/types'
import type { GameSave, BracketMatchSaveData, CompletedMatchSaveData } from '@/engine/save-types'
import { tournamentFixture } from '@/scripts/launch/l19-tournament-audit'
import { TournamentManager } from '@/engine/tournament-manager'
import { SeededRNG } from '@/engine/rng'
import { updateStandings } from '@/engine/processors/standings-processor'

enableMapSet()

function matchHarness() {
    const save = createLaunchFixture('first-week')
    save.scheduledMatches[0].maps = ['Nuke']
    let state = { ...save, saveId: save.id, managerDetails: save.managerDetails, newsFeed: [] } as unknown as StoreState
    const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === 'function' ? produce(state, fn) : { ...state, ...fn } }
    const slice = createMatchSimulationSlice(set, () => state)
    const match = state.scheduledMatches[0]
    const result = { homeScore: 1, awayScore: 0, maps: [{ map: 'Nuke', homeScore: 13, awayScore: 8, rounds: [] }], playerStats: Object.fromEntries(state.players.map(p => [p.id, { kills: 10, deaths: 5, assists: 2, rating: 1.1 }])), mvpPlayerId: state.teams[0].rosterIds[0] }
    return { read: () => state, set, slice, match, result }
}

test('instant/live result commit keeps the weekly auto-sim numeric AWP mastery shape instead of crashing', () => {
    // Weekly auto-sim (WeaponMasteryManager) stores AWP as a plain XP number;
    // the commit path used to write `.kills` onto that number and threw,
    // aborting the player's own match commit.
    const h = matchHarness()
    const awperId = h.read().teams[0].rosterIds[0]
    h.set(s => {
        const p = s.players.find(p => p.id === awperId)!
        ;(p as { role: string }).role = 'AWPER'
        p.weaponMastery = { AWP: 20, RIFLE: 7 }
    })
    expect(() => h.slice.saveMatchResult(h.match.id, h.result)).not.toThrow()
    expect(h.read().completedMatches).toHaveLength(1)
    const mastery = h.read().players.find(p => p.id === awperId)!.weaponMastery!
    expect(mastery.AWP).toBe(20 + 10 * 4)
    expect(mastery.RIFLE).toBe(7)
})

function worldSave(): GameSave {
    const save = createLaunchFixture('first-week') as unknown as GameSave
    save.financeLedger = []
    return save
}

test('campaign invariants accept a clean fixture and flag duplicated ownership, nonfinite cash and retired contracts', () => {
    const clean = worldSave()
    expect(structuralFailures(clean).filter(f => f.kind !== 'state:uncontracted-senior')).toEqual([])
    const broken = structuredClone(clean)
    broken.teams[1].rosterIds.push(broken.teams[0].rosterIds[0])
    broken.teams[2].budget = NaN
    const retired = broken.contracts.find(c => c.teamId === broken.teams[0].id)!
    broken.players.find(p => p.id === retired.playerId)!.isRetired = true
    retired.endWeek = broken.currentWeek + 10
    const kinds = new Set(structuralFailures(broken).map(f => f.kind))
    for (const k of ['state:duplicate-ownership', 'nonfinite', 'impossible-budget', 'retired-under-contract']) expect(kinds.has(k)).toBe(true)
})

test('tournament invariants flag a team entered twice, duplicate prizes and an unterminated bracket', () => {
    const save = worldSave()
    const [a, b] = save.teams
    save.currentWeek = 40
    save.tournaments = [{ id: 'cup_s1', name: 'Cup', shortName: 'C', tier: 'B_TIER', region: 'EU', teamIds: [a.id, b.id, a.id], format: 'SE', currentStage: 'FINAL', standings: [], prizePool: 1000, startWeek: 10, duration: 2, endWeek: 12 }] as never
    save.financeLedger = [1, 2].map(p => ({ id: `prize_cup_s1_${a.id}_p${p}`, week: 12, teamId: a.id, type: 'INCOME', category: 'PRIZE', amount: 10, description: '', balance: 0 })) as never
    const kinds = tournamentFailures(save).map(f => f.kind)
    expect(kinds).toEqual(expect.arrayContaining(['tournament-team-twice', 'duplicate-prize', 'tournament-not-terminated']))
})

test('cash reconciliation requires every managed-club cash delta to be a new ledger row', () => {
    const save = worldSave()
    const team = save.teams[0]
    const before = { budget: team.budget, ledgerIds: new Set<string>() }
    team.budget += 500
    expect(reconcileCash(before, save, team.id, 'x').map(f => f.kind)).toEqual(['cash-ledger-mismatch'])
    save.financeLedger.push({ id: 'inc_1', week: 1, teamId: team.id, type: 'INCOME', category: 'OTHER', amount: 500, description: '', balance: team.budget })
    expect(reconcileCash(before, save, team.id, 'x')).toEqual([])
})

test('a league created in-career (empty standings, as the week processor creates it) crowns a champion and pays prizes once', () => {
    const save = tournamentFixture('league', 4) as unknown as GameSave
    const tournament = save.tournaments[0]
    tournament.standings = []
    TournamentManager.initializeTournament(save, tournament.id, tournament.teamIds, new SeededRNG(28))
    for (const scheduled of [...save.scheduledMatches]) {
        const row = tournament.playoffBracket!.find(m => m.id === scheduled.id) as BracketMatchSaveData
        save.completedMatches.push({ ...row, homeTeamId: row.homeTeamId!, awayTeamId: row.awayTeamId!, day: 5,
            result: { winnerId: row.homeTeamId, homeScore: 1, awayScore: 0, maps: [] } } as unknown as CompletedMatchSaveData)
        save.scheduledMatches = save.scheduledMatches.filter(m => m.id !== row.id)
        TournamentManager.processMatchResult(save, row.id, row.homeTeamId!, row.awayTeamId!)
    }
    updateStandings(save)
    expect(tournament.standings.map(s => s.teamId).sort()).toEqual([...tournament.teamIds].sort())
    expect(tournament.isCompleted).toBe(true)
    expect(tournament.winnerId).toBe(tournament.standings[0].teamId)
    const prizes = save.financeLedger.filter(e => e.category === 'PRIZE').length
    expect(prizes).toBeGreaterThan(0)
    updateStandings(save)
    expect(save.financeLedger.filter(e => e.category === 'PRIZE')).toHaveLength(prizes)
    expect(tournamentFailures(save)).toEqual([])
})

test('ledger compaction keeps a full season of the managed club history despite weekly AI training rows', async () => {
    const { compactPersistentState } = await import('@/engine/processors/save-compactor')
    const save = worldSave()
    save.playerTeamId = 'mine'
    const ledger: GameSave['financeLedger'] = []
    for (let week = 1; week <= 52; week++) {
        for (let i = 0; i < 6; i++) ledger.push({ id: `inc_${week}_${i}`, week, teamId: 'mine', type: 'INCOME', category: 'SPONSOR', amount: 100, description: '', balance: 0 })
        for (let i = 0; i < 200; i++) ledger.push({ id: `exp_train_${week}_ai${i}`, week, teamId: `ai${i}`, type: 'EXPENSE', category: 'TRAINING', amount: 5, description: '', balance: 0 })
    }
    save.financeLedger = ledger
    compactPersistentState(save)
    expect(save.financeLedger).toHaveLength(2000)
    expect(save.financeLedger.filter(e => e.teamId === 'mine')).toHaveLength(52 * 6)
    // Newest AI rows fill the rest, original order preserved.
    expect(save.financeLedger.at(-1)!.id).toBe('exp_train_52_ai199')
    const weeks = save.financeLedger.map(e => e.week)
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b))
})

test('week tick levels every player but only the managed club level-ups reach the inbox', async () => {
    const { computeWeek } = await import('@/engine/worker/compute-week')
    const { TrainingFocus } = await import('@/types')
    const save = createLaunchFixture('first-week') as unknown as GameSave
    const [mine, rival] = save.teams
    save.tournaments = [{ id: 'qa_cup_s1', name: 'QA Cup', shortName: 'QA', tier: 'B_TIER', region: 'EU', teamIds: [mine.id, rival.id], format: 'bracket',
        currentStage: 'Bracket', standings: [], prizePool: 0, startWeek: 1, duration: 3, endWeek: 3, playoffBracket: [] }] as never
    save.scheduledMatches[0].tournamentId = 'qa_cup_s1'
    save.scheduledMatches[0].stage = 'Group Stage'
    for (const p of save.players) p.xp = 5000
    const out = await computeWeek(save, { playerTeamId: mine.id, trainingFocus: new Map([[mine.id, { focus: TrainingFocus.AIM, intensity: 1 }]]) }, 28)
    expect(out.result.success).toBe(true)
    const levelled = out.save.eventsLog.filter(e => e.type === 'PLAYER_LEVEL_UP' && e.id.endsWith('_t'))
    expect(levelled.length).toBeGreaterThan(0)
    expect(levelled.every(e => mine.rosterIds.some(id => e.id.includes(id)))).toBe(true)
    expect(out.save.players.filter(p => rival.rosterIds.includes(p.id)).every(p => (p.level ?? 1) >= 2)).toBe(true)
})

test('an indebted AI club with positive cash flow can still fill its fifth seat from free agency, but never by inventing cash', async () => {
    const { manageRoster } = await import('@/engine/ai/roster-management')
    const build = (reputation: number, wage: number) => {
        const save = createLaunchFixture('first-week') as unknown as GameSave
        const ai = save.teams[1]
        const dropped = ai.rosterIds.pop()!
        save.contracts = save.contracts.filter(c => c.playerId !== dropped)
        save.contracts.filter(c => c.teamId === ai.id).forEach(c => { c.salaryPerWeek = wage })
        ai.budget = -100_000
        ai.reputation = reputation
        ai.financialState = 'INSOLVENT' as never
        return { save, ai }
    }
    const healthy = build(100, 1000)
    manageRoster(healthy.ai, healthy.save)
    expect(healthy.ai.rosterIds).toHaveLength(5)
    expect(healthy.save.contracts.filter(c => c.teamId === healthy.ai.id && c.endWeek > healthy.save.currentWeek)).toHaveLength(5)
    expect(healthy.ai.budget).toBe(-100_000)
    const bleeding = build(0, 20_000)
    manageRoster(bleeding.ai, bleeding.save)
    expect(bleeding.ai.rosterIds).toHaveLength(4)
})
