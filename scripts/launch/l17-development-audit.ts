import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { produce, enableMapSet } from 'immer'
import { createLaunchFixture } from './fixtures'
import { createAcademySlice } from '../../store/slices/academy-slice'
import { SaveManager } from '../../engine/save-manager'
import { FixtureStorage } from './fixtures'
import { buildSaveSnapshot, type SaveSnapshotState } from '../../store/utils/build-save-snapshot'
import type { StoreState } from '../../store/types'

enableMapSet()
const manager = new SaveManager(new FixtureStorage())
const plans = {
    aim: ['aim_intensive', 'aim_intensive', 'aim_intensive', 'aim_intensive', 'aim_intensive', 'aim_intensive', 'aim_intensive'],
    tactical: ['demo_vod', 'util_expert', 'demo_vod', 'util_expert', 'demo_vod', 'util_expert', 'demo_vod'],
    recovery: ['zen_rest', 'aim_intensive', 'zen_rest', 'util_expert', 'zen_rest', 'demo_vod', 'zen_rest'],
}
function run(plan: string[], age = 18, potential = 85, focus: 'BALANCED' | 'MECHANICAL' | 'TACTICAL' = 'BALANCED') {
    const save = createLaunchFixture('first-week', 3417)
    save.saveId = 'qa_l17_development_3417'; save.saveName = 'L17 Development QA'
    save.teams[0].name = 'L17 Academy QA'
    save.teams[0].academyFacility = { level: 3, builtWeek: 1 }
    const source = save.players.find(p => p.id === 'qa_free_agent')!
    source.age = age; source.potential = potential
    save.academyPlayers = [{ id: 'l17_prospect', playerId: source.id, enrolledWeek: 1, energy: 100, totalXpGained: 0, developmentProgress: 0, potentialRevealed: false, readyForPromotion: false, trainingFocus: focus, scoutNotes: '' } as never]
    save.academyRoster = { IGL: 'l17_prospect', Entry: null, AWPer: null, Support: null, Rifler: null } as never
    save.academyTrainingSchedule = {} as never; save.academyWeeklyReports = []; save.academyScoutingMissions = []
    let state = save as unknown as StoreState
    const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === 'function' ? produce(state, fn) : { ...state, ...fn } }
    const academy = createAcademySlice(set, () => state)
    plan.forEach((id, day) => academy.updateAcademySchedule(day, id))
    const initial = manager.exportSave(buildSaveSnapshot(state as unknown as SaveSnapshotState))
    assert.ok(manager.importSave(initial).save)
    const trajectory: object[] = []
    for (let week = 0; week < 52; week++) {
        set(s => { s.currentWeek++ })
        academy.processAcademyWeek()
        const once = JSON.stringify(state)
        academy.processAcademyWeek()
        assert.equal(JSON.stringify(state), once)
        const p = state.players.find(p => p.id === source.id)!, prospect = state.academyPlayers[0]
        for (const value of [p.rifle, p.tactic, p.grenades, prospect.energy, prospect.developmentProgress]) assert.ok(Number.isFinite(value) && value >= 0 && value <= 100)
        trajectory.push({ week: state.currentWeek, rifle: p.rifle, tactic: p.tactic, grenades: p.grenades, energy: prospect.energy, xp: prospect.totalXpGained })
        const loaded = manager.importSave(manager.exportSave(buildSaveSnapshot(state as unknown as SaveSnapshotState))).save
        assert.ok(loaded)
        state = loaded as unknown as StoreState
    }
    const promoted = academy.promoteProspect('l17_prospect', { salaryPerWeek: 500, lengthWeeks: 104 })
    assert.equal(promoted.success, true, promoted.message)
    assert.equal(state.academyPlayers.length, 0)
    assert.equal(state.teams[0].rosterIds.filter(id => id === source.id).length, 1)
    assert.equal(state.players.filter(p => p.id === source.id).length, 1)
    assert.equal(state.contracts.filter(c => c.playerId === source.id).length, 1)
    return { initial, trajectory, final: trajectory.at(-1), promoted: promoted.success, hash: createHash('sha256').update(JSON.stringify(trajectory)).digest('hex') }
}
const results = Object.fromEntries(Object.entries(plans).map(([name, plan]) => {
    const result = run(plan)
    const repeat = run(plan)
    // Initial exports contain the serializer wall-clock updatedAt; compare the complete measured gameplay trajectory.
    assert.deepEqual({ ...repeat, initial: undefined }, { ...result, initial: undefined })
    return [name, result]
}))
const final = (name: string) => results[name].final as { rifle: number; tactic: number; grenades: number; energy: number }
assert.ok(final('aim').rifle > final('tactical').rifle)
assert.ok(final('tactical').tactic > final('aim').tactic)
assert.ok(final('recovery').energy > final('aim').energy)
fs.mkdirSync('tmp/l17', { recursive: true })
fs.writeFileSync('tmp/l17/academy-ui.json', results.recovery.initial)
fs.writeFileSync('docs/launch-readiness/evidence/L17-cohort.json', JSON.stringify({ passed: true, seed: 3417, scope: '52 academy weeks per plan, repeated; canonical save/import each week and final promotion. Not ten full seasons, aging, retirement or financial acceptance.', plans: Object.fromEntries(Object.entries(results).map(([name, { initial, ...result }]) => [name, result])) }, null, 2))
console.log(JSON.stringify({ passed: true, final: Object.fromEntries(Object.entries(results).map(([name, result]) => [name, result.final])) }))

const expanded = [
    { age: 17, potential: 75 }, { age: 19, potential: 85 }, { age: 21, potential: 95 },
].map(person => {
    const outcomes = Object.fromEntries(Object.entries(plans).map(([name, plan]) => {
        const focus = name === 'aim' ? 'MECHANICAL' : name === 'tactical' ? 'TACTICAL' : 'BALANCED'
        const first = run(plan, person.age, person.potential, focus), repeat = run(plan, person.age, person.potential, focus)
        assert.deepEqual({ ...first, initial: undefined }, { ...repeat, initial: undefined })
        return [name, { final: first.final, hash: first.hash, promoted: first.promoted }]
    }))
    const aim = outcomes.aim.final as any, tactical = outcomes.tactical.final as any, recovery = outcomes.recovery.final as any
    assert.ok(aim.rifle > tactical.rifle)
    assert.ok(tactical.tactic > aim.tactic)
    assert.ok(recovery.energy > aim.energy)
    return { ...person, outcomes }
})
fs.writeFileSync('docs/launch-readiness/evidence/L17-expanded-cohort.json', JSON.stringify({ passed: true, scope: 'Three age/potential profiles, three plans, 52 academy weeks, exact repeat, weekly save/import and final promotion. Annual lifecycle is tested separately by the ten-season processor soak.', expanded }, null, 2))
