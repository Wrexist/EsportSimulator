import { produce } from 'immer'
import { createLaunchFixture, FixtureStorage } from '@/scripts/launch/fixtures'
import { newFirstSession, restoreFirstSession, reviewFirstSession, firstSessionNext, restoreWeeklyPlan } from '@/lib/first-session'
import { normalizeCareerDraft, loadCareerDraft, saveCareerDraft, clearCareerDraft } from '@/lib/new-career-draft'
import { createSettingsSlice } from '@/store/slices/settings-slice'
import { createUISlice } from '@/store/slices/ui-slice'
import { buildSaveSnapshot, type SaveSnapshotState } from '@/store/utils/build-save-snapshot'
import { SaveManager } from '@/engine/save-manager'
import { WeeklyActivityType } from '@/types/activities'
import type { StoreState } from '@/store/types'

function harness() {
    let state = { ...createLaunchFixture('first-week', 4022), isInitialized: true, selectedWeeklyActivity: null, firstSession: newFirstSession(), saveGame: jest.fn() } as unknown as StoreState
    const set = (patch: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof patch === 'function' ? produce(state, patch) : { ...state, ...patch } }
    const settings = createSettingsSlice(set, () => state), ui = createUISlice(set, () => state)
    const next = () => firstSessionNext(restoreFirstSession(state.firstSession), state.teams[0], state.players, state.scheduledMatches, state.completedMatches, state.activeMatchId)
    return { read: () => state, set, settings, ui, next }
}

test('guide link resolution cannot mark progress; actual free focus choice does, and missing results cannot complete', () => {
    const h = harness()
    expect(h.next().href).toBe('/squad'); expect(h.read().firstSession!.reviewed).toEqual([])
    h.settings.reviewGuideStep('plan'); h.settings.reviewGuideStep('match')
    expect(h.read().firstSession!.reviewed).toEqual([])
    h.settings.reviewGuideStep('squad'); expect(h.next().href).toBe('/finances')
    h.settings.reviewGuideStep('budget'); expect(h.next().href).toBe('/#weekly-focus')
    const cash = h.read().teams[0].budget
    h.ui.setWeeklyActivity(WeeklyActivityType.TRAINING_ONLY)
    expect(h.read().firstSession!.reviewed).toEqual(['squad', 'budget', 'plan'])
    expect(h.read().teams[0].budget).toBe(cash)
    expect(h.read().saveGame).toHaveBeenCalled()
    expect(h.next().href).toBe('/schedule')
})

test('own result required, opponent-only results cannot satisfy the guide; completion stays dismissed', () => {
    const h = harness()
    h.set(s => { s.firstSession!.reviewed = ['squad', 'budget', 'plan']; s.completedMatches = [{ id: 'foreign', homeTeamId: 'foreign1', awayTeamId: 'foreign2' }] as any })
    h.settings.reviewGuideStep('match'); expect(h.read().firstSession!.status).toBe('active')
    h.set(s => { s.completedMatches.push({ id: 'own', homeTeamId: s.playerTeamId!, awayTeamId: 'opp' } as any) })
    expect(h.next().href).toBe('/match/own/result')
    h.settings.reviewGuideStep('match'); expect(h.read().firstSession!.status).toBe('complete')
    expect(h.read().onboardingCompleted).toBe(true)
})

test('skip and replay alter only guide state and preserve cash, rosters, plan, dates and new-game preference', () => {
    const h = harness()
    h.set(s => { s.showTutorialOnNewGame = false })
    h.ui.setWeeklyActivity(WeeklyActivityType.TRAINING_ONLY)
    const world = () => JSON.stringify([h.read().teams, h.read().players, h.read().contracts, h.read().currentWeek, h.read().completedMatches, h.read().selectedWeeklyActivity])
    const before = world()
    h.settings.completeTutorial(); expect(h.read().firstSession!.status).toBe('dismissed')
    h.settings.triggerTutorial(); expect(h.read().firstSession).toEqual(newFirstSession())
    expect(h.read().showTutorialOnNewGame).toBe(false); expect(world()).toBe(before)
    h.set(s => { s.isInitialized = false }); h.settings.completeTutorial(); h.settings.triggerTutorial()
    expect(h.read().firstSession!.status).toBe('dismissed')
})

test('canonical save/load preserves guide and weekly focus; legacy/malformed career cannot inherit another guide', async () => {
    const h = harness(), manager = new SaveManager(new FixtureStorage())
    h.settings.reviewGuideStep('squad'); h.ui.setWeeklyActivity(WeeklyActivityType.TEAM_BONDING)
    const snapshot = buildSaveSnapshot(h.read() as unknown as SaveSnapshotState)
    expect((await manager.saveGame(snapshot)).success).toBe(true)
    const loaded = (await manager.loadGame(snapshot.saveId)).save!
    expect(restoreFirstSession(loaded.firstSession)).toEqual(h.read().firstSession)
    expect(restoreWeeklyPlan(loaded.selectedWeeklyActivity)).toBe(WeeklyActivityType.TEAM_BONDING)
    expect(restoreFirstSession(undefined).status).toBe('dismissed')
    expect(restoreFirstSession({ version: 99, status: 'active' }).status).toBe('dismissed')
    expect(restoreWeeklyPlan('bad-plan')).toBeNull()
    expect(restoreFirstSession({ version: 1, status: 'active', reviewed: ['budget', 'budget', 'fake'] }).reviewed).toEqual(['budget'])
})

test('unaffordable and invalid plans cannot count as decisions; free training remains available in debt', () => {
    const h = harness(); h.set(s => { s.teams[0].budget = -1 })
    h.ui.setWeeklyActivity(WeeklyActivityType.BOOTCAMP); h.ui.setWeeklyActivity('INVALID' as any)
    expect(h.read().selectedWeeklyActivity).toBeNull(); expect(h.read().firstSession!.reviewed).toEqual([])
    h.ui.setWeeklyActivity(WeeklyActivityType.TRAINING_ONLY)
    expect(h.read().firstSession!.reviewed).toEqual(['plan'])
})

test('shortage leads to recruitment; active match resumes; empty calendar stays actionable', () => {
    const h = harness(); h.set(s => { s.firstSession!.reviewed = ['squad', 'budget', 'plan']; s.teams[0].rosterIds.pop() })
    expect(h.next().href).toBe('/transfers')
    h.set(s => { s.activeMatchId = 'recover' }); expect(h.next().href).toBe('/match/recover/live')
    h.set(s => { s.activeMatchId = null; s.teams[0].rosterIds.push('p_a5'); s.scheduledMatches = [] })
    expect(h.next().detail).toContain('arrange a friendly')
})

test('setup draft recovers only bounded supported fields and handles denied storage without touching careers', () => {
    const original = (globalThis as any).window, data = new Map<string, string>([['career', 'unchanged']])
    ;(globalThis as any).window = { localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) } }
    try {
        expect(saveCareerDraft({ managerName: 'QA Manager', teamId: 'team_player', sandbox: true })).toBe(true)
        expect(loadCareerDraft()?.managerName).toBe('QA Manager')
        saveCareerDraft({ custom: { name: 'QA Club', shortName: 'QAC', region: 'EU', difficulty: 'normal', logoIndex: 0, primaryColor: '#123456', secondaryColor: '#ABCDEF' } })
        expect(loadCareerDraft()?.teamId).toBe('team_player'); expect(loadCareerDraft()?.custom?.name).toBe('QA Club')
        clearCareerDraft(); expect(loadCareerDraft()).toBeNull(); expect(data.get('career')).toBe('unchanged')
        ;(globalThis as any).window.localStorage.setItem = () => { throw Error('quota') }
        expect(saveCareerDraft({ managerName: 'Still editing' })).toBe(false)
        expect(normalizeCareerDraft({ version: 99, managerName: 'bad' })).toBeNull()
        expect(normalizeCareerDraft({ version: 1, managerName: 'x'.repeat(100), custom: { difficulty: 'bad' } })?.managerName).toHaveLength(40)
    } finally { (globalThis as any).window = original }
})
