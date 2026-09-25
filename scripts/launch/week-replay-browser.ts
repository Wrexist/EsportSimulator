import { useGameStore } from '../../store/game-store'
import { saveManager } from '../../engine'
import { createLaunchFixture } from './fixtures'
import { WeekProcessorBridge } from '../../engine/worker/week-processor-client'
import { weekProcessorBridge } from '../../engine/worker/week-processor-bridge'
import { buildSaveSnapshot } from '../../store/utils/build-save-snapshot'
import { canonicalWeekState, captureWeekReplay } from '../../engine/worker/week-replay'
import { debouncedStorage } from '../../engine/storage-adapter'
import { TrainingFocus } from '../../types'

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
async function run() {
    await new Promise(resolve => setTimeout(resolve, 50))
    const initial = useGameStore.getState()
    const fixture = createLaunchFixture('strong-club')
    fixture.lastRngSeed = 0
    const ai = structuredClone(fixture.teams[1])
    const originalIds = [...ai.rosterIds]
    ai.id += '_replay_opponent'; ai.name = 'QA Replay Opponent'
    ai.rosterIds = originalIds.map(id => `${id}_replay`)
    fixture.players.push(...fixture.players.filter(p => originalIds.includes(p.id)).map(p => ({ ...structuredClone(p), id: `${p.id}_replay` })))
    fixture.contracts.push(...fixture.contracts.filter(c => c.teamId === fixture.teams[1].id).map(c => ({ ...c, playerId: `${c.playerId}_replay`, teamId: ai.id })))
    fixture.teams.push(ai)
    fixture.scheduledMatches = [{ ...fixture.scheduledMatches[0], id: 'qa_replay_ai_match', homeTeamId: fixture.teams[1].id, awayTeamId: ai.id, week: fixture.currentWeek + 1 }]
    const input = captureWeekReplay(fixture, { playerTeamId: fixture.playerTeamId, trainingFocus: new Map([[fixture.playerTeamId!, { focus: TrainingFocus.AIM, intensity: 5 }]]) }, 0)
    const baseline: string[] = []
    const results = []
    const write = saveManager.saveGame.bind(saveManager)
    let writes = 0
    saveManager.saveGame = async save => { writes++; return write(save) }
    for (const mode of ['worker', 'worker-repeat', 'fallback', 'worker-error', 'reload']) {
        const bridge = new WeekProcessorBridge(() => {
            if (mode === 'fallback' || mode === 'reload') throw new Error('Injected worker unavailability')
            return new Worker(mode === 'worker-error' ? '/broken-worker.js' : '/compiled-worker.js')
        })
        weekProcessorBridge.processWeek = bridge.processWeek.bind(bridge)
        useGameStore.setState({ ...initial, ...structuredClone(fixture), isInitialized: true, isLoading: false, _completedMatchIds: new Set() })
        assert((await write(fixture)).success, 'input save failed')
        // Normalize the same input through the actual load path for every transport.
        await useGameStore.getState().loadGame(fixture.saveId)
        for (let tick = 1; tick <= 2; tick++) {
        if (mode === 'reload' && tick === 2) await useGameStore.getState().loadGame(fixture.saveId)
        writes = 0
        const pending = useGameStore.getState().advanceWeek()
        await useGameStore.getState().advanceWeek() // Repeated input must not queue another week.
        await pending
        const snapshot = buildSaveSnapshot(useGameStore.getState())
        assert(snapshot.currentWeek === fixture.currentWeek + tick, `${mode}: week did not advance exactly once`)
        assert(writes === 1, `${mode}: ${writes} authoritative writes`)
        assert(bridge.isWorkerAvailable() === (mode === 'worker' || mode === 'worker-repeat'), `${mode}: unexpected transport fallback`)
        const canonical = canonicalWeekState(snapshot)
        if (!baseline[tick - 1]) baseline[tick - 1] = canonical
        if (canonical !== baseline[tick - 1]) {
            const a=JSON.parse(baseline[tick - 1]),b=JSON.parse(canonical)
            throw new Error(`${mode} diverged: ${Object.keys(a).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).join(', ')}`)
        }
        results.push({ mode, tick, passed: true, workerUsed: bridge.isWorkerAvailable(), writes, completedMatches: snapshot.completedMatches.length, rngState: snapshot.lastRngSeed })
        }
        bridge.terminate()
    }
    await debouncedStorage.flush()
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(baseline)))
    return { passed:true, input, canonicalSha256:Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join(''), results }
}
run().then(report=>fetch('/report',{method:'POST',body:JSON.stringify(report)}))
    .catch(error=>fetch('/report',{method:'POST',body:JSON.stringify({passed:false,error:String(error)})}))
