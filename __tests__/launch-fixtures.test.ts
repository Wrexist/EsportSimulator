import { createLaunchFixture, SCENARIOS, FixtureStorage } from '../scripts/launch/fixtures'
import { SaveManager } from '@/engine/save-manager'
import { validateSaveSchema } from '@/engine/save-schema'
import { STORAGE_KEYS } from '@/engine/save-types'
import { computeWeek } from '@/engine/worker/compute-week'

describe('launch QA careers', () => {
  test.each(SCENARIOS)('%s is deterministic, independent and importable', scenario => {
    const a = createLaunchFixture(scenario)
    const b = createLaunchFixture(scenario)
    expect(a).toEqual(b)
    expect(validateSaveSchema(a).ok).toBe(true)
    const manager = new SaveManager(new FixtureStorage())
    expect(manager.importSave(manager.exportSave(a)).save).not.toBeNull()
    a.teams[0].budget = -1
    expect(b.teams[0].budget).toBeGreaterThan(0)
  })
  test('scenario constraints are observable in the actual entities', () => {
    const poor = createLaunchFixture('cash-crisis')
    const wages = poor.contracts.filter(c=>c.teamId===poor.playerTeamId).reduce((n,c)=>n+c.salaryPerWeek,0)
    expect(poor.teams[0].budget).toBeLessThan(wages)
    expect(createLaunchFixture('roster-shortage').teams[0].rosterIds).toHaveLength(4)
    expect(createLaunchFixture('strong-club').players[0].rifle).toBeGreaterThan(createLaunchFixture('weak-club').players[0].rifle)
    expect(createLaunchFixture('season-boundary').currentWeek).toBe(52)
    expect(createLaunchFixture('late-career').eventsLog).toHaveLength(520)
  })
  test('failed primary write retains last-good save through the production save manager', async () => {
    const storage = new FixtureStorage()
    const manager = new SaveManager(storage)
    const save = createLaunchFixture('first-week')
    expect((await manager.saveGame(save)).success).toBe(true)
    const primary = STORAGE_KEYS.SAVE_PREFIX + save.saveId
    const good = storage.data.get(primary)
    storage.failWrite = key => key === primary
    const next = structuredClone(save); next.currentWeek++
    expect((await manager.saveGame(next)).success).toBe(false)
    expect(storage.data.get(primary)).toBe(good)
    storage.failWrite = null
    const loaded = await manager.loadGame(save.saveId)
    expect(loaded.save?.currentWeek).toBe(1)
  })
  test('fixture uses the production computation boundary reproducibly', async () => {
    const input = createLaunchFixture('first-week')
    // Player match acceptance is a UI journey; isolate next-week computation here.
    input.scheduledMatches = []
    const config = {playerTeamId:input.playerTeamId, trainingFocus:new Map()}
    const first = await computeWeek(structuredClone(input),config,input.lastRngSeed)
    const second = await computeWeek(structuredClone(input),config,input.lastRngSeed)
    expect(first.result.success).toBe(true)
    expect(first.save.currentWeek).toBe(2)
    expect(first.save).toEqual(second.save)
  })
})
