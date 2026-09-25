import expected from '../../docs/launch-readiness/evidence/L14-replays.json'
import { parseLabProject } from '../../lib/spatial-lab-project'
import { projectRoundReplay, captureRoundPosition, restoreRoundPosition, verifyRoundReplay } from '../../engine/spatial/round-replay'

const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
async function run() {
    const worker = new Worker('/compiled-spatial.js'); let serial = 0
    const ask = (type: string, payload = {}) => new Promise<any>((resolve, reject) => {
        const id = ++serial, timer = setTimeout(() => { cleanup(); reject(Error(`Timeout ${type}`)) }, 60000)
        const cleanup = () => { clearTimeout(timer); worker.removeEventListener('message', receive); worker.removeEventListener('error', fail) }
        const receive = (event: MessageEvent) => { if (event.data.id === id || type === 'load' && event.data.type === 'ready') { cleanup(); resolve(event.data) } }
        const fail = (event: ErrorEvent) => { cleanup(); reject(Error(event.message)) }
        worker.addEventListener('message', receive); worker.addEventListener('error', fail); worker.postMessage({ type, id, ...payload })
    })
    const ready = await ask('load', { mapId: 'Mirage' }); assert(ready.type === 'ready', 'Reference load failed')
    const reports = []
    for (const entry of expected.scenarios) {
        const project = parseLabProject(await (await fetch(entry.lab)).text(), ready.reference)
        const first = await ask('teams', { project, replay: true }), repeat = await ask('teams', { project, replay: true })
        assert(first.type === 'teams-result' && repeat.type === 'teams-result', `Worker replay failed: ${first.message}`)
        const replay = first.replay, end = replay.result.frames.at(-1).tick, instant = projectRoundReplay(replay, end)
        assert(await verifyRoundReplay(replay), 'Replay digest invalid')
        assert(replay.sha256 === repeat.replay.sha256 && replay.sha256 === entry.sha256, `Node/native/repeat mismatch: ${entry.id}`)
        let live = projectRoundReplay(replay, 0)
        for (const frame of replay.result.frames) live = projectRoundReplay(replay, frame.tick)
        localStorage.setItem('l14-isolated-position', JSON.stringify(captureRoundPosition(replay, Math.floor(end / 2))))
        const resumed = restoreRoundPosition(replay, JSON.parse(localStorage.getItem('l14-isolated-position')!))
        assert(resumed.tick === Math.floor(end / 2), 'Position did not round-trip')
        assert(JSON.stringify(live) === JSON.stringify(instant) && JSON.stringify(projectRoundReplay(replay, end + 999)) === JSON.stringify(instant), 'Playback mode divergence')
        let rejected = false
        try { restoreRoundPosition(replay, { ...captureRoundPosition(replay, 0), sha256: 'other-round' }) } catch { rejected = true }
        assert(rejected, 'Foreign checkpoint accepted')
        reports.push({ id: entry.id, sha256: replay.sha256, outcome: instant.outcome, players: instant.players, frames: replay.result.frames.length, events: replay.result.events.length })
    }
    worker.terminate()
    return { passed: true, scenarios: reports, checks: ['compiled production worker', 'six SHA-256 input/output envelopes match Node and repeat', 'live/instant/skipped projections agree', 'isolated localStorage position restore', 'foreign checkpoint rejected'], limits: ['lab rounds, not career live/instant parity', 'not packaged Windows acceptance', '8 Hz recorded positions and 64 Hz event ticks', 'purchases/season economy not included'] }
}
run().then(report => fetch('/report', { method: 'POST', body: JSON.stringify(report) })).catch(error => fetch('/report', { method: 'POST', body: JSON.stringify({ passed: false, error: String(error) }) }))
