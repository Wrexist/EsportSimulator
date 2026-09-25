import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { produce, enableMapSet } from 'immer'
import { createLaunchFixture, FixtureStorage } from './fixtures'
import { computeWeek } from '../../engine/worker/compute-week'
import { JobOfferGenerator } from '../../engine/job-offer-generator'
import { createEventsSlice } from '../../store/slices/events-slice'
import { createTransferContractSlice } from '../../store/slices/transfer-contract-slice'
import { academyHeldPlayerIds, recruitmentSalary } from '../../engine/recruitment'
import { SaveManager } from '../../engine/save-manager'
import { buildSaveSnapshot, type SaveSnapshotState } from '../../store/utils/build-save-snapshot'
import { canonicalWeekState } from '../../engine/worker/week-replay'
import { TrainingFocus } from '../../types'
import type { StoreState } from '../../store/types'

enableMapSet()
async function run() {
    let state = createLaunchFixture('first-week', 3820) as unknown as StoreState
    const manager = new SaveManager(new FixtureStorage())
    const set = (fn: any) => { state = produce(state, fn) }
    const actions = createEventsSlice(set, () => state), transfers = createTransferContractSlice(set, () => state)
    const seasons: object[] = [], moves: object[] = [], shortages: object[] = []
    let ticks = 0, maxEvents = 0, decisions = 0
    for (; ticks < 520 && !state.gameOverReason; ticks++) {
        const computed = await computeWeek(buildSaveSnapshot(state as unknown as SaveSnapshotState), { playerTeamId: state.playerTeamId!, trainingFocus: new Map([[state.playerTeamId!, { focus: TrainingFocus.TACTICS, intensity: 3 }]]) }, state.lastRngSeed)
        assert.ok(computed.result.success, computed.result.error)
        state = { ...computed.save, lastRngSeed: computed.rngState } as unknown as StoreState
        if (state.gameOverReason) break
        for (const event of [...state.eventsLog]) {
            if (event.id.startsWith('career_decision_') && !event.selectedChoiceId && !event.data.isWithdrawn) {
                actions.resolveEventChoice(event.id, event.choices?.[0].id || '')
                if (state.eventsLog.find(e => e.id === event.id)?.selectedChoiceId) decisions++
            }
        }
        if ([105, 261].includes(state.currentWeek)) {
            // Exercise the real generated-offer/action boundary at controlled career milestones.
            JobOfferGenerator.forceJobOffer(state as any)
            const event = state.eventsLog.find(e => e.type === 'JOB_OFFER' && e.week === state.currentWeek && !e.selectedChoiceId && !e.data.isWithdrawn)!
            const previous = state.playerTeamId
            const result = actions.acceptJobOffer(event.id)
            assert.ok(result.success, result.message)
            moves.push({ week: state.currentWeek, from: previous, to: state.playerTeamId })
        }
        // Keep the human team eligible through actual market actions, never injected players/cash.
        const held = academyHeldPlayerIds(state)
        const free = state.players.filter(p => !p.isRetired && !held.has(p.id) && !state.teams.some(t => t.rosterIds.includes(p.id)) && !state.contracts.some(c => c.playerId === p.id && c.endWeek > state.currentWeek))
            .sort((a,b) => recruitmentSalary(a, state.currentWeek) - recruitmentSalary(b, state.currentWeek) || a.id.localeCompare(b.id))
        for (const player of free) {
            if (state.teams.find(t => t.id === state.playerTeamId)!.rosterIds.length >= 5) break
            transfers.transferPlayer(player.id, null, state.playerTeamId!, 0, { salaryPerWeek: recruitmentSalary(player, state.currentWeek), startWeek: state.currentWeek, endWeek: state.currentWeek + 104, buyout: 0 })
        }
        const owners = state.teams.flatMap(t => [...t.rosterIds, ...(t.youthAcademyIds || []), ...(t.managementState?.academyPlayers || []).map(p => p.playerId)]).concat(state.academyPlayers.map(p => p.playerId))
        assert.equal(owners.length, new Set(owners).size, 'Duplicate club ownership')
        assert.ok(state.teams.every(t => Number.isFinite(t.budget)), 'Nonfinite cash')
        const ledger = state.financeLedger.map(e => e.id)
        assert.equal(ledger.length, new Set(ledger).size, 'Duplicate ledger')
        const stints = state.careerStats?.seasons || []
        const keys = stints.map(s => `${s.seasonNumber}:${s.teamId}:${s.startWeek}`)
        assert.equal(keys.length, new Set(keys).size, 'Duplicate history stint')
        if (state.teams.some(t => t.rosterIds.length < 5)) shortages.push({ week: state.currentWeek, rosters: state.teams.map(t => t.rosterIds.length) })
        maxEvents = Math.max(maxEvents, state.eventsLog.length)
        if (state.currentWeek % 52 === 0) {
            seasons.push({ week: state.currentWeek, managedClub: state.playerTeamId, confidence: state.boardState?.confidence, budgets: state.teams.map(t => t.budget), historyStints: stints.length })
            console.log(JSON.stringify(seasons.at(-1)))
        }
        const snapshot = buildSaveSnapshot(state as unknown as SaveSnapshotState)
        assert.ok((await manager.saveGame(snapshot)).success)
        state = (await manager.loadGame(snapshot.saveId)).save! as unknown as StoreState
    }
    return { ticks, finalWeek: state.currentWeek, terminal: state.gameOverReason || null, seasons, moves, decisions, shortages, maxEvents,
        sha256: createHash('sha256').update(canonicalWeekState(buildSaveSnapshot(state as unknown as SaveSnapshotState))).digest('hex') }
}
async function main() {
    const first = await run(), repeat = await run()
    assert.deepEqual(first, repeat)
    fs.writeFileSync('docs/launch-readiness/evidence/L20-career-runtime.json', JSON.stringify({ passed: true, repeatedExactly: true, tenSeasonsCompleted: first.ticks === 520,
        scope: 'Three-club real computeWeek career; canonical actions and weekly save/load; generated job offers forced at two milestones. Stops at game-over rather than continuing an ended career. Not full-world or UI/package acceptance.', ...first }, null, 2))
    console.log(JSON.stringify({ passed: true, ticks: first.ticks, moves: first.moves.length, terminal: first.terminal, shortages: first.shortages.length }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
