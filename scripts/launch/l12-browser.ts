import { parseLabProject } from '../../lib/spatial-lab-project'
import { discreteUtilityReplay } from './l12-discrete'

const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), n => n.toString(16).padStart(2, '0')).join('')
async function run() {
    const worker = new Worker('/compiled-spatial.js'); let serial = 0
    const ask = (type: string, payload = {}) => new Promise<any>((resolve, reject) => {
        const id = ++serial, timer = setTimeout(() => { cleanup(); reject(Error(`Timeout ${type}`)) }, 30000)
        const cleanup = () => { clearTimeout(timer); worker.removeEventListener('message', receive); worker.removeEventListener('error', fail) }
        const receive = (event: MessageEvent) => { if (event.data.id === id || type === 'load' && event.data.type === 'ready') { cleanup(); resolve(event.data) } }
        const fail = (event: ErrorEvent) => { cleanup(); reject(Error(event.message)) }
        worker.addEventListener('message', receive); worker.addEventListener('error', fail); worker.postMessage({ type, id, ...payload })
    })
    const ready = await ask('load', { mapId: 'Mirage' }); assert(ready.type === 'ready', 'Worker reference load failed')
    const manifest = await (await fetch('/map-studio/encounters/l12/index.json')).json(), reports = []
    assert(manifest.meshSha256 === ready.reference.meshSha256 && manifest.release === 'held', 'Reference/gate identity mismatch')
    for (const entry of manifest.scenarios) {
        const raw = await (await fetch(entry.lab)).text(); assert(await hash(raw) === entry.projectSha256, `Fixture bytes changed: ${entry.id}`)
        const project = parseLabProject(raw, ready.reference)
        localStorage.setItem('l12-lab-roundtrip', JSON.stringify(project))
        assert(JSON.stringify(parseLabProject(localStorage.getItem('l12-lab-roundtrip')!, ready.reference)) === JSON.stringify(project), 'Utility settings did not persist')
        const first = await ask('encounter', { project }), repeat = await ask('encounter', { project })
        assert(first.type === 'encounter-result' && repeat.type === 'encounter-result', `Utility failed: ${entry.id}: ${first.message}`)
        const fullSha256 = await hash(JSON.stringify(first.result)), discreteSha256 = await hash(JSON.stringify(discreteUtilityReplay(first.result)))
        assert(fullSha256 === await hash(JSON.stringify(repeat.result)), `Native repetition mismatch: ${entry.id}`)
        assert(discreteSha256 === entry.discreteSha256, `Node/native authoritative replay mismatch: ${entry.id}`)
        assert(first.result.events.some((e: { type: string }) => e.type === entry.expected), `Missing effect: ${entry.id}`)
        reports.push({ id: entry.id, outcome: first.result.outcome, frames: first.result.frames.length, events: first.result.events.length, checks: first.result.utility.checks, fullSha256, fullMatchesNode: fullSha256 === entry.fullSha256, discreteSha256 })
    }
    const project = parseLabProject(await (await fetch(manifest.scenarios[0].lab)).text(), ready.reference)
    project.utility!.throws[0].power = 200
    const invalid = await ask('encounter', { project }); assert(invalid.type === 'error', 'Invalid utility accepted')
    worker.terminate()
    return { passed: true, scenarios: reports, checks: ['real compiled worker transport', 'five utility types repeat in Chromium', 'Node/native authoritative events, timings, damage, inventory and knowledge match', 'isolated serializer round-trip', 'invalid throw rejected'], limits: ['original uncalibrated diagnostic throws', 'not packaged Windows acceptance', 'all-map reviewed utility coverage remains open', 'dynamic entities and material penetration held'], sourceVersion: ready.reference.sourceVersion, meshSha256: ready.reference.meshSha256 }
}
run().then(report => fetch('/report', { method: 'POST', body: JSON.stringify(report) })).catch(error => fetch('/report', { method: 'POST', body: JSON.stringify({ passed: false, error: String(error) }) }))
