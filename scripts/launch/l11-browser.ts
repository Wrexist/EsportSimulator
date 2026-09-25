import { parseLabProject } from '../../lib/spatial-lab-project'
import type { EncounterResult } from '../../engine/spatial/encounter'

const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), n => n.toString(16).padStart(2, '0')).join('')
const discrete = (r: EncounterResult) => ({ outcome: r.outcome, events: r.events.map(({ from, to, ...e }) => e), frames: r.frames.map(f => ({ tick: f.tick, actors: f.actors.map(a => ({ id: a.id, health: a.health, armor: a.armor, ammo: a.ammo, reserve: a.reserve, state: a.state, visible: a.knowledge?.visible ?? false, seenTick: a.knowledge?.seenTick ?? null })) })) })
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
    const manifest = await (await fetch('/map-studio/encounters/l11/index.json')).json(), reports = []
    assert(manifest.meshSha256 === ready.reference.meshSha256 && manifest.release === 'held', 'Reference/gate identity mismatch')
    for (const entry of manifest.scenarios) {
        const raw = await (await fetch(entry.lab)).text(); assert(await hash(raw) === entry.projectSha256, `Fixture bytes changed: ${entry.id}`)
        const project = parseLabProject(raw, ready.reference)
        localStorage.setItem('l11-lab-roundtrip', JSON.stringify(project))
        assert(JSON.stringify(parseLabProject(localStorage.getItem('l11-lab-roundtrip')!, ready.reference)) === JSON.stringify(project), 'Encounter settings did not persist')
        const first = await ask('encounter', { project }), repeat = await ask('encounter', { project })
        assert(first.type === 'encounter-result' && repeat.type === 'encounter-result', `Encounter failed: ${entry.id}: ${first.message}`)
        const fullSha256 = await hash(JSON.stringify(first.result))
        assert(fullSha256 === await hash(JSON.stringify(repeat.result)), `Native repetition mismatch: ${entry.id}`)
        const discreteSha256 = await hash(JSON.stringify(discrete(first.result)))
        assert(discreteSha256 === entry.discreteSha256, `Node/native event or outcome mismatch: ${entry.id}`)
        reports.push({ id: entry.id, outcome: first.result.outcome, events: first.result.events.length, frames: first.result.frames.length, fullSha256, fullMatchesNode: fullSha256 === entry.fullSha256, discreteSha256 })
    }
    const duel = parseLabProject(await (await fetch(manifest.scenarios[0].lab)).text(), ready.reference), seedBatch = []
    for (const seed of [0, 1, 2, 3, 7, 11, 42, 99, 1024, 65535, 0x7fffffff, 0xffffffff]) {
        const project = { ...duel, encounter: { ...duel.encounter!, seed } }
        const a = await ask('encounter', { project }), b = await ask('encounter', { project })
        assert(a.type === 'encounter-result' && b.type === 'encounter-result', `Seed ${seed} failed`)
        const sha256 = await hash(JSON.stringify(a.result))
        assert(sha256 === await hash(JSON.stringify(b.result)), `Seed ${seed} replay differs`)
        seedBatch.push({ seed, outcome: a.result.outcome, sha256 })
    }
    const invalid = await ask('encounter', { project: { format: 'esim-spatial-lab', version: 1, mapId: 'Mirage', sourceVersion: ready.reference.sourceVersion, encounter: { seconds: 1e10 } } })
    assert(invalid.type === 'error', 'Invalid encounter input was accepted')
    worker.terminate()
    return { passed: true, scenarios: reports, seedBatch, checks: ['real compiled worker transport', 'all scenario full replays repeat in Chromium', '12 additional seed replays including zero and uint32 max', 'Node/native discrete event, damage, ammo and outcome equality', 'isolated storage serializer round-trip', 'invalid input rejected'], limits: ['not a packaged Windows release', 'ray/angle cross-runtime full equality separately reported', 'provisional weapon tuning; live match integration remains future work'], sourceVersion: ready.reference.sourceVersion, meshSha256: ready.reference.meshSha256 }
}
run().then(report => fetch('/report', { method: 'POST', body: JSON.stringify(report) })).catch(error => fetch('/report', { method: 'POST', body: JSON.stringify({ passed: false, error: String(error) }) }))
