import { produce } from 'immer'
import { createLaunchFixture, FixtureStorage } from '@/scripts/launch/fixtures'
import {
    FIRST_SESSION_STEPS, newFirstSession, restoreFirstSession, firstSessionGuidance, restoreWeeklyPlan,
} from '@/lib/first-session'
import { boardStartTargets, customClubStartingCash, describeClubChallenge } from '@/lib/club-expectations'
import { ensureBoardState } from '@/engine/board-expectations'
import { normalizeCareerDraft, loadCareerDraft, saveCareerDraft, clearCareerDraft } from '@/lib/new-career-draft'
import { createSettingsSlice } from '@/store/slices/settings-slice'
import { createUISlice } from '@/store/slices/ui-slice'
import { createPlayerDevelopmentSlice } from '@/store/slices/player-development-slice'
import { buildSaveSnapshot, type SaveSnapshotState } from '@/store/utils/build-save-snapshot'
import { SaveManager } from '@/engine/save-manager'
import { WeeklyActivityType } from '@/types/activities'
import type { StoreState } from '@/store/types'
import type { GameSave } from '@/engine/save-types'

function harness(guide = newFirstSession()) {
    let state = { ...createLaunchFixture('first-week', 4022), isInitialized: true, selectedWeeklyActivity: null, firstSession: guide, saveGame: jest.fn() } as unknown as StoreState
    const set = (patch: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof patch === 'function' ? produce(state, patch) : { ...state, ...patch } }
    const get = () => state
    const settings = createSettingsSlice(set, get), ui = createUISlice(set, get), dev = createPlayerDevelopmentSlice(set, get)
    const team = () => state.teams.find(t => t.id === state.playerTeamId)!
    const ctx = () => ({ team: team(), players: state.players, matches: state.scheduledMatches, completed: state.completedMatches, currentWeek: state.currentWeek, activeMatchId: state.activeMatchId })
    const next = () => firstSessionGuidance(restoreFirstSession(state.firstSession), ctx())
    const reviewed = () => restoreFirstSession(state.firstSession).reviewed
    return { read: () => state, set, settings, ui, dev, next, reviewed, team }
}
const playedResult = (id: string, home: string, away: string) => ({ id, homeTeamId: home, awayTeamId: away, week: 1, result: { winnerId: home, homeScore: 1, awayScore: 0, maps: [{ mapName: 'm' }] } })

describe('first-session checklist completes from real actions', () => {
    test('links and explicit calls for action-driven steps never complete; squad/budget need the on-page confirmation', () => {
        const h = harness()
        h.settings.syncFirstSession()
        expect(h.next()!.action.href).toBe('/squad'); expect(h.reviewed()).toEqual([])
        h.settings.reviewGuideStep('decision'); h.settings.reviewGuideStep('match'); h.settings.reviewGuideStep('week')
        expect(h.reviewed()).toEqual([])
        h.settings.reviewGuideStep('squad'); expect(h.next()!.action.href).toBe('/finances')
        h.settings.reviewGuideStep('budget'); expect(h.next()!.step).toBe('decision')
        expect(h.read().saveGame).toHaveBeenCalled()
    })

    test('weekly focus choice records the decision without charging cash', () => {
        const h = harness()
        const cash = h.team().budget
        h.ui.setWeeklyActivity(WeeklyActivityType.TRAINING_ONLY)
        expect(h.reviewed()).toEqual(['decision'])
        expect(h.team().budget).toBe(cash)
    })

    test('training focus counts only for your own players', () => {
        const h = harness()
        const outsider = h.read().players.find(p => !h.team().rosterIds.includes(p.id))
        if (outsider) { h.dev.setPlayerTrainingFocus(outsider.id, 'AIM'); expect(h.reviewed()).toEqual([]) }
        h.dev.setPlayerTrainingFocus(h.team().rosterIds[0], 'AIM')
        expect(h.reviewed()).toEqual(['decision'])
        expect(h.read().saveGame).toHaveBeenCalled()
    })

    test('signing a player after the guide starts counts as the decision', () => {
        const h = harness()
        h.settings.syncFirstSession() // captures the baseline roster
        expect(restoreFirstSession(h.read().firstSession).baseline?.rosterIds).toEqual(h.team().rosterIds)
        h.settings.syncFirstSession(); expect(h.reviewed()).toEqual([])
        h.set(s => { s.teams.find(t => t.id === s.playerTeamId)!.rosterIds.push('new_signing') })
        h.settings.syncFirstSession()
        expect(h.reviewed()).toEqual(['decision'])
    })

    test('only a played own-team result completes the match step (not opponents, not forfeits)', () => {
        const h = harness()
        h.settings.syncFirstSession()
        const me = h.read().playerTeamId!
        h.set(s => { s.completedMatches.push(playedResult('foreign', 'x1', 'x2') as never) })
        h.settings.syncFirstSession(); expect(h.reviewed()).toEqual([])
        h.set(s => { s.completedMatches.push({ ...playedResult('forfeit', me, 'opp'), result: { winnerId: 'opp', homeScore: 0, awayScore: 1, maps: [] } } as never) })
        h.settings.syncFirstSession(); expect(h.reviewed()).toEqual([])
        h.set(s => { s.completedMatches.push(playedResult('own', me, 'opp') as never) })
        h.settings.syncFirstSession(); expect(h.reviewed()).toEqual(['match'])
    })

    test('advancing the week completes the chain, sets completion flags and removes the guide', () => {
        const h = harness()
        h.settings.syncFirstSession()
        h.settings.reviewGuideStep('squad'); h.settings.reviewGuideStep('budget')
        h.ui.setWeeklyActivity(WeeklyActivityType.TRAINING_ONLY)
        h.set(s => { s.completedMatches.push(playedResult('own', s.playerTeamId!, 'opp') as never) })
        h.settings.syncFirstSession()
        expect(h.next()!.step).toBe('week')
        expect(h.next()!.alternatives).toEqual([{ href: '/match/own/result', label: 'Review your result' }])
        h.set(s => { s.currentWeek += 1 })
        h.settings.syncFirstSession()
        expect(h.reviewed()).toEqual([...FIRST_SESSION_STEPS])
        expect(restoreFirstSession(h.read().firstSession).status).toBe('complete')
        expect(h.read().onboardingCompleted).toBe(true)
        expect(h.next()).toBeNull()
    })

    test('sync never runs during an active match or for an ended career', () => {
        const h = harness()
        h.set({ activeMatchId: 'live' } as Partial<StoreState>)
        h.settings.syncFirstSession(); expect(restoreFirstSession(h.read().firstSession).baseline).toBeUndefined()
        h.set({ activeMatchId: null, gameOverReason: 'SACKED' } as Partial<StoreState>)
        h.settings.syncFirstSession(); expect(restoreFirstSession(h.read().firstSession).baseline).toBeUndefined()
    })
})

describe('skip and replay', () => {
    test('skip and replay change only guide state and preserve cash, rosters, plan, dates and the new-game preference', () => {
        const h = harness()
        h.set(s => { s.showTutorialOnNewGame = false })
        h.ui.setWeeklyActivity(WeeklyActivityType.TRAINING_ONLY)
        const world = () => JSON.stringify([h.read().teams, h.read().players, h.read().contracts, h.read().currentWeek, h.read().completedMatches, h.read().selectedWeeklyActivity])
        const before = world()
        h.settings.completeTutorial(); expect(restoreFirstSession(h.read().firstSession).status).toBe('dismissed')
        h.settings.syncFirstSession(); expect(restoreFirstSession(h.read().firstSession).status).toBe('dismissed')
        h.settings.triggerTutorial()
        const replay = restoreFirstSession(h.read().firstSession)
        expect(replay.status).toBe('active'); expect(replay.reviewed).toEqual([])
        expect(h.read().showTutorialOnNewGame).toBe(false); expect(world()).toBe(before)
        h.set(s => { s.isInitialized = false }); h.settings.completeTutorial(); h.settings.triggerTutorial()
        expect(restoreFirstSession(h.read().firstSession).status).toBe('dismissed')
    })

    test('replay on an older career needs new actions instead of completing from history', () => {
        const h = harness({ ...newFirstSession(), status: 'dismissed' })
        h.set(s => { s.completedMatches.push(playedResult('old', s.playerTeamId!, 'opp') as never); s.currentWeek += 3 })
        h.settings.triggerTutorial()
        expect(restoreFirstSession(h.read().firstSession).baseline).toEqual({ week: h.read().currentWeek, lastResultId: 'old', rosterIds: h.team().rosterIds })
        h.settings.syncFirstSession()
        expect(h.reviewed()).toEqual([])
        h.set(s => { s.currentWeek += 1 })
        h.settings.syncFirstSession()
        expect(h.reviewed()).toEqual(['week'])
    })
})

describe('persistence and old saves', () => {
    test('canonical save/load keeps guide progress, baseline and weekly focus', async () => {
        const h = harness(), manager = new SaveManager(new FixtureStorage())
        h.settings.syncFirstSession(); h.settings.reviewGuideStep('squad'); h.ui.setWeeklyActivity(WeeklyActivityType.TEAM_BONDING)
        const snapshot = buildSaveSnapshot(h.read() as unknown as SaveSnapshotState)
        expect((await manager.saveGame(snapshot)).success).toBe(true)
        const loaded = (await manager.loadGame(snapshot.saveId)).save!
        expect(restoreFirstSession(loaded.firstSession)).toEqual(h.read().firstSession)
        expect(restoreFirstSession(loaded.firstSession).baseline?.week).toBe(h.read().currentWeek)
        expect(restoreWeeklyPlan(loaded.selectedWeeklyActivity)).toBe(WeeklyActivityType.TEAM_BONDING)
    })

    test('a save written before the guide existed loads with the guide dismissed (no inherited progress)', async () => {
        const h = harness(), manager = new SaveManager(new FixtureStorage())
        const snapshot = buildSaveSnapshot(h.read() as unknown as SaveSnapshotState) as GameSave
        delete (snapshot as Partial<GameSave>).firstSession; delete (snapshot as Partial<GameSave>).selectedWeeklyActivity
        expect((await manager.saveGame(snapshot)).success).toBe(true)
        const loaded = (await manager.loadGame(snapshot.saveId)).save!
        expect(restoreFirstSession(loaded.firstSession)).toEqual({ version: 2, status: 'dismissed', reviewed: [] })
        expect(restoreWeeklyPlan(loaded.selectedWeeklyActivity)).toBeNull()
    })

    test('version 1 guides migrate: plan becomes decision, status is kept, baseline is captured on first sync', () => {
        const migrated = restoreFirstSession({ version: 1, status: 'active', reviewed: ['squad', 'plan', 'match', 'plan', 'fake'] })
        expect(migrated).toEqual({ version: 2, status: 'active', reviewed: ['squad', 'decision', 'match'] })
        expect(restoreFirstSession({ version: 1, status: 'complete', reviewed: ['squad', 'budget', 'plan', 'match'] }).status).toBe('complete')
        const h = harness(migrated)
        h.settings.syncFirstSession()
        expect(restoreFirstSession(h.read().firstSession).baseline).toBeDefined()
        expect(h.reviewed()).toEqual(['squad', 'decision', 'match'])
    })

    test('malformed or unknown guide data is rejected safely', () => {
        expect(restoreFirstSession({ version: 99, status: 'active' }).status).toBe('dismissed')
        expect(restoreFirstSession({ version: 2, status: 'weird' }).status).toBe('dismissed')
        expect(restoreFirstSession({ version: 2, status: 'active', reviewed: ['budget', 'budget', 'fake'] }).reviewed).toEqual(['budget'])
        expect(restoreFirstSession({ version: 2, status: 'active', reviewed: [], baseline: { week: 'x', rosterIds: [] } }).baseline).toBeUndefined()
        expect(restoreWeeklyPlan('bad-plan')).toBeNull()
    })
})

describe('guidance stays actionable', () => {
    test('unaffordable and invalid plans cannot count; free training remains available in debt', () => {
        const h = harness(); h.set(s => { s.teams.find(t => t.id === s.playerTeamId)!.budget = -1 })
        h.ui.setWeeklyActivity(WeeklyActivityType.BOOTCAMP); h.ui.setWeeklyActivity('INVALID' as WeeklyActivityType)
        expect(h.read().selectedWeeklyActivity).toBeNull(); expect(h.reviewed()).toEqual([])
        h.ui.setWeeklyActivity(WeeklyActivityType.TRAINING_ONLY)
        expect(h.reviewed()).toEqual(['decision'])
    })

    test('shortage points to recruitment; active match resumes; empty calendar stays actionable', () => {
        const h = harness({ ...newFirstSession(), reviewed: ['squad', 'budget'] })
        h.set(s => { s.teams.find(t => t.id === s.playerTeamId)!.rosterIds.pop() })
        expect(h.next()!.action.href).toBe('/transfers')
        h.set(s => { s.firstSession = { ...newFirstSession(), reviewed: ['squad', 'budget', 'decision'] } })
        expect(h.next()!.action.href).toBe('/transfers')
        h.set(s => { s.activeMatchId = 'recover' }); expect(h.next()!.action.href).toBe('/match/recover/live')
        h.set(s => { s.activeMatchId = null; s.teams.find(t => t.id === s.playerTeamId)!.rosterIds.push('p_back'); s.players.push({ id: 'p_back' } as never); s.scheduledMatches = [] })
        expect(h.next()!.detail).toContain('arrange a friendly')
    })
})

describe('club choice explanations', () => {
    test.each([[1, 90], [8, 60], [18, 50], [45, 30], [150, 10]])('board target shown at rank %i / rep %i matches the board the career starts with', (worldRanking, reputation) => {
        const save = { playerTeamId: 't', currentWeek: 1, teams: [{ id: 't', worldRanking, reputation }] } as unknown as GameSave
        const board = ensureBoardState(save)
        const shown = boardStartTargets(worldRanking, reputation)
        expect(shown.tier).toBe(board.seasonExpectation)
        expect(shown.rankTarget).toBe(board.rankTarget)
    })

    test('explanations name the real constraints', () => {
        const short = describeClubChallenge({ worldRanking: 60, reputation: 20, starters: 3, budget: 250_000 })
        expect(short.notes.join(' ')).toContain('sign 2')
        expect(short.notes.join(' ')).toContain('Small budget')
        const top = describeClubChallenge({ worldRanking: 2, reputation: 90, starters: 5, budget: 2_000_000 })
        expect(top.level).toBe('Very demanding')
        const custom = describeClubChallenge({ worldRanking: 150, reputation: 25, starters: 0, budget: customClubStartingCash(250_000), custom: true })
        expect(custom.notes.join(' ')).toContain('starts with no players')
        expect(customClubStartingCash(250_000)).toBe(325_000)
    })
})

test('setup draft recovers only bounded supported fields and handles denied storage without touching careers', () => {
    const original = (globalThis as Record<string, unknown>).window, data = new Map<string, string>([['career', 'unchanged']])
    ;(globalThis as Record<string, unknown>).window = { localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) } }
    try {
        expect(saveCareerDraft({ managerName: 'QA Manager', teamId: 'team_player', sandbox: true })).toBe(true)
        expect(loadCareerDraft()?.managerName).toBe('QA Manager')
        saveCareerDraft({ custom: { name: 'QA Club', shortName: 'QAC', region: 'EU', difficulty: 'normal', logoIndex: 0, primaryColor: '#123456', secondaryColor: '#ABCDEF' } })
        expect(loadCareerDraft()?.teamId).toBe('team_player'); expect(loadCareerDraft()?.custom?.name).toBe('QA Club')
        clearCareerDraft(); expect(loadCareerDraft()).toBeNull(); expect(data.get('career')).toBe('unchanged')
        ;((globalThis as Record<string, unknown>).window as { localStorage: { setItem: unknown } }).localStorage.setItem = () => { throw Error('quota') }
        expect(saveCareerDraft({ managerName: 'Still editing' })).toBe(false)
        expect(normalizeCareerDraft({ version: 99, managerName: 'bad' })).toBeNull()
        expect(normalizeCareerDraft({ version: 1, managerName: 'x'.repeat(100), custom: { difficulty: 'bad' } })?.managerName).toHaveLength(40)
    } finally { (globalThis as Record<string, unknown>).window = original }
})
