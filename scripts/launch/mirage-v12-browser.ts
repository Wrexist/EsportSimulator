import { parseProject } from '../../lib/map-annotations'
import { DEFAULT_ROUTE_OPTIONS } from '../../engine/spatial/navigation'
import { parseLabProject } from '../../lib/spatial-lab-project'
import type { SpatialReference } from '../../engine/spatial/types'

const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('')
async function run() {
    const worker = new Worker('/compiled-spatial.js'); let serial = 0
    const ask = (type: string, payload = {}) => new Promise<any>((resolve, reject) => {
        const id = ++serial, timeout = setTimeout(() => { cleanup(); reject(Error(`Timeout: ${type}`)) }, 60000)
        const cleanup = () => { clearTimeout(timeout); worker.removeEventListener('message', receive); worker.removeEventListener('error', fail) }
        const fail = (e: ErrorEvent) => { cleanup(); reject(Error(e.message)) }
        const receive = (e: MessageEvent) => { if (e.data.id === id || type === 'load' && e.data.type === 'ready') { cleanup(); resolve(e.data) } }
        worker.addEventListener('message', receive); worker.addEventListener('error', fail); worker.postMessage({ type, id, ...payload })
    })
    const ready = await ask('load', { mapId: 'Mirage' }); assert(ready.type === 'ready', 'Worker failed to load')
    const reference = ready.reference as SpatialReference
    const raw = await (await fetch('/map-studio/drafts/mirage-user-v12-2026-09-13.json')).text()
    assert(await hash(raw) === 'efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2', 'Upload bytes changed')
    const project = parseProject(raw), review = parseProject(await (await fetch('/map-studio/drafts/mirage-v12-with-reference-routes.json')).text())
    assert(JSON.stringify(review.marks.slice(0, 169)) === JSON.stringify(project.marks), 'Owner markings changed')
    const checked = await ask('validate', { project })
    assert(checked.type === 'validation' && checked.report.receipt.errors === 20, 'Unexpected updated geometry check')
    assert(checked.report.issues.filter((i: { code: string }) => i.code === 'opening-overlap').length === 4, 'Opening conflicts missing')
    const bundle = await (await fetch('/map-studio/reviews/mirage-v12/routes.json')).json(), replay = []
    assert(bundle.routes.length === 10 && bundle.release === 'held', 'Route coverage / release state differs')
    for (const entry of bundle.routes) {
        const raw = await (await fetch(entry.lab)).text(), lab = parseLabProject(raw, reference)
        localStorage.setItem('v12-lab-roundtrip', JSON.stringify(lab))
        assert(JSON.stringify(parseLabProject(localStorage.getItem('v12-lab-roundtrip')!, reference)) === JSON.stringify(lab), 'Lab save did not round-trip')
        const result = await ask('query', { a: lab.a, b: lab.b, annotations: lab.annotations, speed: 220, options: DEFAULT_ROUTE_OPTIONS })
        assert(result.type === 'result' && result.frames.at(-1)?.state === 'arrived', `Movement failed: ${entry.id}`)
        const sha256 = await hash(JSON.stringify(result.frames))
        assert(JSON.stringify(result.route) === JSON.stringify(entry.route), `Native route differs: ${entry.id}`)
        const motionSha256 = await hash(JSON.stringify(result.frames.map((frame: { heading?: number }) => ({ ...frame, heading: undefined }))))
        assert(motionSha256 === entry.motionSha256, `Native movement state differs: ${entry.id}`)
        const repeat = await ask('query', { a: lab.a, b: lab.b, annotations: lab.annotations, speed: 220, options: DEFAULT_ROUTE_OPTIONS })
        assert(repeat.type === 'result' && await hash(JSON.stringify(repeat.frames)) === sha256, `Native repeat is not deterministic: ${entry.id}`)
        replay.push({ id: entry.id, frames: result.frames.length, seconds: result.frames.at(-1).time, sha256, motionSha256, nodeReplaySha256: entry.replaySha256, wholeReplayMatchesNode: sha256 === entry.replaySha256 })
    }
    worker.terminate()
    return { passed: true, sourceSha256: await hash(raw), markings: project.marks.length, reviewMarkings: review.marks.length, validation: checked.report.receipt, replay, crossRuntimeWholeReplayMatch: replay.every(r => r.wholeReplayMatchesNode), limitations: ['Whole-frame bitwise parity across Node and Chromium remains unverified; display heading drift was observed.'], checks: ['immutable v12 upload', 'all 169 owner markings preserved', 'opening conflicts visible to production worker', '10 native routes arrive and repeat with identical full hashes', 'route and movement state exactly match Node; visual heading excluded from cross-runtime motion hash', 'all lab files round-trip in isolated browser storage', 'release remains held'] }
}
run().then(r => fetch('/report', { method: 'POST', body: JSON.stringify(r) })).catch(e => fetch('/report', { method: 'POST', body: JSON.stringify({ passed: false, error: String(e) }) }))
