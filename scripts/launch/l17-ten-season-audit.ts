import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { produce, enableMapSet } from 'immer'
import { createLaunchFixture, FixtureStorage } from './fixtures'
import { computeWeek } from '../../engine/worker/compute-week'
import { createAcademySlice } from '../../store/slices/academy-slice'
import { createTransferContractSlice } from '../../store/slices/transfer-contract-slice'
import { SaveManager } from '../../engine/save-manager'
import { buildSaveSnapshot, type SaveSnapshotState } from '../../store/utils/build-save-snapshot'
import { academyHeldPlayerIds, recruitmentSalary } from '../../engine/recruitment'
import { canonicalWeekState } from '../../engine/worker/week-replay'
import { TrainingFocus } from '../../types'
import type { StoreState } from '../../store/types'

enableMapSet()
const manager = new SaveManager(new FixtureStorage())
async function run(seed: number, name: string) {
    const initial = createLaunchFixture('first-week', seed)
    initial.teams[0].academyFacility = { level: 1, builtWeek: 1 }
    initial.staff = [{ id: 'l17_scout', name: 'Lifecycle QA Scout', role: 'scout', teamId: initial.playerTeamId, level: 1, salaryPerWeek: 1000, contractEndWeek: 600, specialization: 'General', yearsRemaining: 12, stats: { accuracy: 60 }, unlockedTalentIds: [] } as never]
    initial.teams[0].staffIds = ['l17_scout']
    initial.players.forEach((p, i) => { p.age = [18, 23, 29, 34, 38][i % 5] })
    initial.players.find(p => p.id === 'qa_free_agent')!.age = 18
    let state = initial as unknown as StoreState
    const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === 'function' ? produce(state, fn) : { ...state, ...fn } }
    const academy = createAcademySlice(set, () => ({ ...state, ...academy })), transfers = createTransferContractSlice(set, () => state)
    assert.ok(academy.enrollProspect('qa_free_agent').success)
    academy.updateAcademyRoster('IGL', state.academyPlayers[0].id)
    academy.updateAcademySchedule(0, 'aim_intensive')
    academy.updateAcademySchedule(2, 'util_expert')
    let matches = 0, promotions = 0, intakes = 1, retirements = 0, maxPlayers = state.players.length
    const seasons: object[] = [], shortages: object[] = []
    for (let tick = 0; tick < 520; tick++) {
        const computed = await computeWeek(JSON.parse(JSON.stringify(buildSaveSnapshot(state as unknown as SaveSnapshotState))), { playerTeamId: state.playerTeamId!, trainingFocus: new Map([[state.playerTeamId!, { focus: TrainingFocus.TACTICS, intensity: 3 }]]) }, state.lastRngSeed)
        assert.ok(computed.result.success, computed.result.error)
        state = { ...computed.save, lastRngSeed: computed.rngState } as unknown as StoreState
        matches += computed.result.matchesPlayed
        academy.processAcademyWeek()
        for (const id of [...state.academyPendingProspects]) {
            if (academy.enrollPendingProspect(id).success) intakes++
            else academy.discardPendingProspect(id)
        }
        for (const prospect of [...state.academyPlayers]) {
            const player = state.players.find(p => p.id === prospect.playerId)!
            if (prospect.readyForPromotion || player.age >= 21) {
                if (state.teams[0].rosterIds.length < 7 && academy.promoteProspect(prospect.id, { salaryPerWeek: recruitmentSalary(player, state.currentWeek), lengthWeeks: 104 }).success) promotions++
                else if (player.age >= 21) academy.releaseProspect(prospect.id)
            }
        }
        const roles = ['IGL', 'Entry', 'AWPer', 'Support', 'Rifler'] as const
        roles.forEach((role, i) => academy.updateAcademyRoster(role, state.academyPlayers[i]?.id ?? null))
        if (state.currentWeek % 13 === 0 && state.academyPlayers.length < 3) academy.scoutProspect('LOCAL')
        // A deterministic manager policy fills vacancies through the human contract action.
        const held = academyHeldPlayerIds(state)
        const free = state.players.filter(p => !p.isRetired && !held.has(p.id) && !state.teams.some(t => t.rosterIds.includes(p.id)) && !state.contracts.some(c => c.playerId === p.id && c.endWeek > state.currentWeek))
            .sort((a, b) => recruitmentSalary(a, state.currentWeek) - recruitmentSalary(b, state.currentWeek) || a.id.localeCompare(b.id))
        for (const p of free) {
            if (state.teams[0].rosterIds.length >= 5) break
            transfers.transferPlayer(p.id, null, state.playerTeamId!, 0, { salaryPerWeek: recruitmentSalary(p, state.currentWeek), startWeek: state.currentWeek, endWeek: state.currentWeek + 104, buyout: 0 })
        }
        const ids = state.players.map(p => p.id), owners = state.teams.flatMap(t => [...t.rosterIds, ...(t.youthAcademyIds || [])]).concat(state.academyPlayers.map(p => p.playerId))
        assert.equal(new Set(ids).size, ids.length, 'Duplicate player records')
        assert.equal(new Set(owners).size, owners.length, 'Duplicate senior/academy ownership')
        for (const id of owners) assert.ok(state.players.some(p => p.id === id && !p.isRetired), 'Owned player missing or retired')
        for (const p of state.players) for (const stat of ['rifle', 'tactic', 'skill', 'potential', 'fatigue', 'morale'] as const) assert.ok(Number.isFinite(p[stat]) && p[stat] >= 0 && p[stat] <= 100, `${p.id} invalid ${stat}: ${p[stat]}`)
        if (state.teams.some(t => t.rosterIds.length < 5)) shortages.push({ week: state.currentWeek, rosters: state.teams.map(t => t.rosterIds.length) })
        maxPlayers = Math.max(maxPlayers, state.players.length)
        retirements += state.eventsLog.filter(e => e.type === 'RETIREMENT' && e.week === state.currentWeek).length
        if (state.currentWeek % 52 === 0) {
            seasons.push({ week: state.currentWeek, players: state.players.length, budgets: state.teams.map(t => t.budget), ages: state.players.slice(0, 5).map(p => p.age), retired: retirements, promotions, intakes, gameOverReason: state.gameOverReason || null })
            console.log(JSON.stringify({ seed, season: seasons.at(-1) }))
        }
        const snapshot = buildSaveSnapshot(state as unknown as SaveSnapshotState)
        const persisted = await manager.saveGame(snapshot)
        assert.ok(persisted.success, JSON.stringify(persisted))
        const loaded = await manager.loadGame(snapshot.saveId)
        assert.ok(loaded.save, JSON.stringify(loaded))
        assert.equal(loaded.save.saveId, snapshot.saveId)
        state = loaded.save as unknown as StoreState
    }
    fs.writeFileSync(`tmp/l17-ten-season-${name}.json`, canonicalWeekState(buildSaveSnapshot(state as unknown as SaveSnapshotState)))
    return { seed, weeks: 520, matches, promotions, intakes, retirements, maxPlayers, seasons, shortages, terminalCareer: state.gameOverReason || null, canonicalSha256: createHash('sha256').update(canonicalWeekState(buildSaveSnapshot(state as unknown as SaveSnapshotState))).digest('hex') }
}
async function main() {
    const first = await run(3517, 'first'), repeat = await run(3517, 'repeat')
    assert.deepEqual(repeat, first)
    const report = { passed: true, repeatedExactly: true, scope: '520 real computeWeek ticks with academy post-processing, scripted human recruitment, actual generated matches/annual aging/retirement/intake, weekly normal save/load. Three-club fixture and one paid fixed-term scout; terminal careers are recorded and continued only as a lifecycle soak, not playable-career acceptance.', ...first }
    fs.writeFileSync('docs/launch-readiness/evidence/L17-ten-season.json', JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ passed: true, matches: first.matches, retirements: first.retirements, promotions: first.promotions, terminalCareer: first.terminalCareer }))
}
main().catch(error => { fs.writeFileSync('docs/launch-readiness/evidence/L17-ten-season-failure.txt', String(error.stack || error)); console.error(error); process.exitCode = 1 })
