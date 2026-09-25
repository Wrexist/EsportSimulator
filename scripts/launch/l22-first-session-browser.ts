import { useGameStore, waitForPendingGameSave } from '../../store/game-store'
import { saveManager } from '../../engine'
import { createLaunchFixture } from './fixtures'
import { newFirstSession } from '../../lib/first-session'
import { WeeklyActivityType } from '../../types/activities'
import { debouncedStorage } from '../../engine/storage-adapter'

const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
async function run() {
    const fixture = createLaunchFixture('first-week', 4022)
    fixture.firstSession = newFirstSession(); fixture.currentDay = 6
    assert((await saveManager.saveGame(fixture)).success, 'Fixture save failed')
    await useGameStore.getState().loadGame(fixture.saveId)
    assert(useGameStore.getState().firstSession?.status === 'active', 'Fresh guide missing')
    useGameStore.getState().reviewGuideStep('squad')
    useGameStore.getState().reviewGuideStep('budget')
    useGameStore.getState().setWeeklyActivity(WeeklyActivityType.TRAINING_ONLY)
    await waitForPendingGameSave()
    await useGameStore.getState().loadGame(fixture.saveId)
    assert(useGameStore.getState().firstSession?.reviewed.join(',') === 'squad,budget,plan', 'Guide progress lost at real store reload')
    assert(useGameStore.getState().selectedWeeklyActivity === WeeklyActivityType.TRAINING_ONLY, 'Plan lost at reload')
    useGameStore.getState().completeTutorial(); await waitForPendingGameSave()
    await useGameStore.getState().loadGame(fixture.saveId)
    assert(useGameStore.getState().firstSession?.status === 'dismissed', 'Skip lost on reload')
    const world = () => { const s = useGameStore.getState(); return JSON.stringify([s.teams, s.players, s.contracts, s.currentWeek, s.currentDay, s.completedMatches, s.financeLedger]) }
    const before = world()
    useGameStore.getState().triggerTutorial(); await waitForPendingGameSave()
    assert(world() === before, 'Replay changed career state')
    const legacy = createLaunchFixture('first-week', 4023)
    delete legacy.firstSession; delete legacy.selectedWeeklyActivity
    assert((await saveManager.saveGame(legacy)).success, 'Legacy fixture save failed')
    await useGameStore.getState().loadGame(legacy.saveId)
    assert(useGameStore.getState().firstSession?.status === 'dismissed', 'Legacy career inherited guide')
    assert(useGameStore.getState().selectedWeeklyActivity === null, 'Legacy career inherited plan')
    await useGameStore.getState().loadGame(fixture.saveId)
    useGameStore.getState().reviewGuideStep('squad'); useGameStore.getState().reviewGuideStep('budget')
    useGameStore.getState().setWeeklyActivity(WeeklyActivityType.TRAINING_ONLY)
    const matchId = useGameStore.getState().scheduledMatches.find(m => m.homeTeamId === fixture.playerTeamId || m.awayTeamId === fixture.playerTeamId)!.id
    await useGameStore.getState().simulateInstantMatch(matchId)
    assert(useGameStore.getState().completedMatches.some(m => m.id === matchId), 'First match not committed')
    useGameStore.getState().reviewGuideStep('match'); await waitForPendingGameSave()
    await useGameStore.getState().loadGame(fixture.saveId)
    assert(useGameStore.getState().firstSession?.status === 'complete', 'Completion lost at reload')
    await debouncedStorage.flush()
    return { passed: true, fixtureId: fixture.saveId, legacyFixtureId: legacy.saveId, realStoreLoadSave: true, skipReload: true, replayWorldUnchanged: true, crossCareerIsolation: true,
        weeklyFocusReload: true, firstMatchId: matchId, firstResultSaved: true, finalGuide: useGameStore.getState().firstSession,
        limitation: 'Programmatic real-store acceptance in isolated Electron; no UI interaction or fresh-player testing.' }
}
run().then(report => fetch('/report', { method: 'POST', body: JSON.stringify(report) }))
    .catch(error => fetch('/report', { method: 'POST', body: JSON.stringify({ passed: false, error: String(error) }) }))
