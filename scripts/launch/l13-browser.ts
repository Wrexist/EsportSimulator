import { parseLabProject } from '../../lib/spatial-lab-project'
import { discreteTeamReplay } from './l13-discrete'
import { teamView } from '../../engine/spatial/team-view'

const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), n => n.toString(16).padStart(2, '0')).join('')
async function run() {
    const worker = new Worker('/compiled-spatial.js'); let serial = 0
    const ask = (type: string, payload = {}) => new Promise<any>((resolve, reject) => {
        const id = ++serial, timer = setTimeout(() => { cleanup(); reject(Error(`Timeout ${type}`)) }, 60000)
        const cleanup = () => { clearTimeout(timer); worker.removeEventListener('message', receive); worker.removeEventListener('error', fail) }
        const receive = (event: MessageEvent) => { if (event.data.id === id || type === 'load' && event.data.type === 'ready') { cleanup(); resolve(event.data) } }
        const fail = (event: ErrorEvent) => { cleanup(); reject(Error(event.message)) }
        worker.addEventListener('message', receive); worker.addEventListener('error', fail); worker.postMessage({ type, id, ...payload })
    })
    const ready = await ask('load', { mapId: 'Mirage' }); assert(ready.type === 'ready', 'Worker reference load failed')
    const manifest = await (await fetch('/map-studio/teams/l13/index.json')).json(), reports = []
    assert(manifest.meshSha256 === ready.reference.meshSha256 && manifest.release === 'held', 'Reference/gate identity mismatch')
    for (const entry of manifest.scenarios) {
        const raw = await (await fetch(entry.lab)).text(); assert(await hash(raw) === entry.projectSha256, `Fixture bytes changed: ${entry.id}`)
        const project = parseLabProject(raw, ready.reference)
        localStorage.setItem('l13-lab-roundtrip', JSON.stringify(project))
        assert(JSON.stringify(parseLabProject(localStorage.getItem('l13-lab-roundtrip')!, ready.reference)) === JSON.stringify(project), 'Team settings did not persist')
        const first = await ask('teams', { project }), repeat = await ask('teams', { project })
        assert(first.type === 'teams-result' && repeat.type === 'teams-result', `Teams failed: ${entry.id}: ${first.message}`)
        const fullSha256 = await hash(JSON.stringify(first.result)), discreteSha256 = await hash(JSON.stringify(discreteTeamReplay(first.result)))
        assert(fullSha256 === await hash(JSON.stringify(repeat.result)), `Native repetition mismatch: ${entry.id}`)
        assert(discreteSha256 === entry.discreteSha256, `Node/native authoritative replay mismatch: ${entry.id}`)
        assert(first.result.events.some((e: { type: string }) => e.type === entry.expected), `Missing expected behavior: ${entry.id}`)
        assert(first.result.metrics.minSeparation >= 32, 'Actor overlap')
        const view = teamView(first.result.frames[0], first.result.events, 'CT')
        assert(view.actors.every(a => a.side === 'CT') && view.contacts.length === 0 && view.actors.every(a => !a.contacts.length), 'Knowledge view leaked a private live contact')
        if (project.teams!.initialBomb === 'carried') assert(view.bomb === null, 'Enemy bomb carrier leaked')
        reports.push({ id: entry.id, outcome: first.result.outcome, frames: first.result.frames.length, events: first.result.events.length, metrics: first.result.metrics, fullSha256, fullMatchesNode: fullSha256 === entry.fullSha256, discreteSha256 })
    }
    const project = parseLabProject(await (await fetch(manifest.scenarios[0].lab)).text(), ready.reference)
    project.teams!.actors[0].id = 'unknown'
    assert((await ask('teams', { project })).type === 'error', 'Invalid team identity accepted')
    worker.terminate()
    return { passed: true, scenarios: reports, checks: ['real compiled worker transport', 'six team scenarios repeat in Chromium', 'Node/native authoritative decisions, events, timings and resources match', 'isolated serializer round-trip', 'team view withholds hidden enemy positions and carried bomb', 'invalid team input rejected'], limits: ['original uncalibrated diagnostic points', 'not packaged Windows acceptance', 'not live career integration', 'all-map tactics and full cross-runtime floating-point parity remain open'], sourceVersion: ready.reference.sourceVersion, meshSha256: ready.reference.meshSha256 }
}
run().then(report => fetch('/report', { method: 'POST', body: JSON.stringify(report) })).catch(error => fetch('/report', { method: 'POST', body: JSON.stringify({ passed: false, error: String(error) }) }))
