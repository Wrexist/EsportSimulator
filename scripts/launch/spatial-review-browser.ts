import { parseProject } from '../../lib/map-annotations'
import { emptyLabProject, parseLabProject } from '../../lib/spatial-lab-project'
import { DEFAULT_ROUTE_OPTIONS } from '../../engine/spatial/navigation'
import type { AnnotationReport } from '../../engine/spatial/annotations'
import type { SpatialReference } from '../../engine/spatial/types'

const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('')
async function run() {
    const worker = new Worker('/compiled-spatial.js')
    let serial = 0
    const ask = (type: string, payload = {}) => new Promise<any>((resolve, reject) => {
        const id = ++serial, timer = setTimeout(() => { cleanup(); reject(Error(`Timeout: ${type}`)) }, 60000)
        const cleanup = () => { clearTimeout(timer); worker.removeEventListener('message', receive); worker.removeEventListener('error', error) }
        const error = (event: ErrorEvent) => { cleanup(); reject(Error(event.message)) }
        const receive = (event: MessageEvent) => { if (event.data.id === id || type === 'load' && event.data.type === 'ready') { cleanup(); resolve(event.data) } }
        worker.addEventListener('message', receive); worker.addEventListener('error', error); worker.postMessage({ type, id, ...payload })
    })
    const ready = await ask('load', { mapId: 'Mirage' }); assert(ready.type === 'ready', 'Worker did not load')
    const reference = ready.reference as SpatialReference
    const raw = await (await fetch('/map-studio/drafts/mirage-user-areas-2026-09-13.json')).text()
    assert(await digest(raw) === '46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65', 'Owner draft hash changed')
    const original = parseProject(raw), project = parseProject(await (await fetch('/map-studio/drafts/mirage-registered-review.json')).text())
    assert(JSON.stringify(original.marks.map(m => [m.id, m.points])) === JSON.stringify(project.marks.map(m => [m.id, m.points])), 'Review copy changed vertices')
    const initial = await ask('validate', { project: original })
    assert(initial.report.issues.some((i: { code: string }) => i.code === 'registration'), 'Unregistered input accepted')
    const result = await ask('validate', { project }); assert(result.type === 'validation', result.message)
    const report = result.report as AnnotationReport
    assert(report.routes.length === 4 && report.routes.every(r => r.reachable), 'Spawn-to-site movement failed')
    assert(report.receipt.errors > 0, 'Unreviewed geometry was incorrectly certified')
    const a = report.zones.find(z => z.kind === 'ctspawn')!.point!, b = report.zones.find(z => z.label === 'A plant zone')!.point!
    const query = { a, b, annotations: project, speed: 220, options: DEFAULT_ROUTE_OPTIONS }
    const first = await ask('query', query), second = await ask('query', query)
    assert(first.frames?.at(-1)?.state === 'arrived', first.message || 'Movement failed')
    assert(JSON.stringify(first.frames) === JSON.stringify(second.frames), 'Playback is not deterministic')
    const occupied = await ask('query', { ...query, occupied: [a] }); assert(occupied.route?.points.length === 0, 'Overlapping teammate accepted')
    const changed = structuredClone(project); changed.registration!.targetSha256 = 'f'.repeat(64)
    const stale = await ask('validate', { project: changed }); assert(stale.type === 'error' && stale.message.includes('Radar image changed'), 'Changed radar accepted')
    const lab = { ...emptyLabProject(reference), a, b, annotations: { ...project, marks: project.marks.filter(m => ['wall', 'ctspawn', 'tspawn', 'bombsite'].includes(m.kind)), validation: undefined } }
    localStorage.setItem('l09-lab-roundtrip', JSON.stringify(lab))
    const reloaded = parseLabProject(localStorage.getItem('l09-lab-roundtrip')!, reference)
    assert(JSON.stringify(reloaded.annotations) === JSON.stringify(lab.annotations), 'Lab geometry did not round-trip')
    worker.terminate()
    return { passed: true, referenceVersion: reference.sourceVersion, triangles: ready.triangles, report, replay: { frames: first.frames.length, seconds: first.frames.at(-1).time, sha256: await digest(JSON.stringify(first.frames)) }, checks: ['original bytes and all vertices preserved', 'unregistered drawings rejected', 'four full spawn/site movements complete', 'draft issues remain open', 'deterministic native worker playback', 'teammate overlap rejected', 'stale radar hash rejected', 'embedded lab geometry round-trip'] }
}
run().then(report => fetch('/report', { method: 'POST', body: JSON.stringify(report) })).catch(error => fetch('/report', { method: 'POST', body: JSON.stringify({ passed: false, error: String(error) }) }))
