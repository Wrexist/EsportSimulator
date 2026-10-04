/**
 * L27: wall-clock compute time of physical (spatial) rounds, one process, one
 * round at a time. Re-runs rows of the recorded v14 acceptance matrix and
 * requires each output hash to match its receipt, so a speed change can never
 * hide a behaviour change.
 *
 *   npx tsx scripts/launch/l27-physical-timing.ts --label=before [--maps=Sandstone,Mirage] [--rows=A:4326170:combat,B:4326171:combat] [--repeat=2]
 *
 * Output: docs/launch-readiness/evidence/L27-physical-<label>.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import { ACTIVE_MAP_POOL } from '../../data/map-pool'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import { runLabTeams } from '../../engine/spatial/lab-teams'
import { parseLabProject } from '../../lib/spatial-lab-project'
import { SPATIAL_ROUND_ENGINE } from '../../engine/spatial/round-replay'
import type { SpatialReference } from '../../engine/spatial/types'

const arg = (key: string, fallback: string) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
const label = arg('label', 'run')
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid label')
const maps = arg('maps', ACTIVE_MAP_POOL.join(',')).split(',')
const rowsWanted = arg('rows', 'A:4326170:combat,B:4326171:combat').split(',').map(r => { const [objective, seed, kind] = r.split(':'); return { objective, seed: Number(seed), guns: kind === 'combat' } })
const repeat = Number(arg('repeat', '1'))
const hash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')

const out: unknown[] = []
for (const mapId of maps) {
    if (!ACTIVE_MAP_POOL.some(m => m === mapId)) throw Error(`Not an active map: ${mapId}`)
    const reference = JSON.parse(readFileSync(`public/map-studio/spatial/${mapId}.json`, 'utf8')) as SpatialReference
    const bytes = readFileSync(`public/map-studio/spatial/${mapId}.mesh`)
    if (hash(bytes) !== reference.meshSha256) throw Error('Mesh changed')
    const loadStart = performance.now()
    const nav = new NavigationMesh(reference)
    const scene = CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    const loadMs = performance.now() - loadStart
    const file = mapId === 'Mirage' ? 'docs/ui-review/physical-career/mirage-5v5-review.lab.json' : `public/map-studio/teams/map-pool/${mapId.toLowerCase()}.lab.json`
    const source = readFileSync(file, 'utf8')
    const receiptFile = (kind: string) => `docs/ui-review/map-pool/${mapId.toLowerCase()}-spatial-round-v14-acceptance-${kind}.json`
    const receipts = ['combat', 'movement'].flatMap(kind => { try { return JSON.parse(readFileSync(receiptFile(kind), 'utf8')).rows } catch { return [] } }) as Array<{ seed: number; objective: string; guns: boolean; outputSha256: string; elapsedMs: number }>
    for (const config of rowsWanted) {
        const receipt = receipts.find(r => r.seed === config.seed && r.objective === config.objective && r.guns === config.guns)
        const samples: number[] = []
        let outputSha256 = '', seconds = 0, outcome = ''
        for (let i = 0; i < repeat; i++) {
            const project = parseLabProject(source, reference)
            Object.assign(project.teams!, config, { seconds: 160, roundSeconds: 115, bombSeconds: 40, plantSeconds: 3.2, defuseSeconds: 10 })
            const start = performance.now()
            const result = runLabTeams(project, nav, scene, true).result
            samples.push(Math.round(performance.now() - start))
            outputSha256 = hash(JSON.stringify(result))
            seconds = result.frames.at(-1)!.tick / 64
            outcome = String(result.outcome)
        }
        const row = { mapId, ...config, simulatedSeconds: seconds, outcome, elapsedMs: samples, realtimeFactor: +(seconds * 1000 / Math.min(...samples)).toFixed(3),
            outputSha256, receiptSha256: receipt?.outputSha256 ?? null, matchesReceipt: receipt ? receipt.outputSha256 === outputSha256 : null, receiptElapsedMs: receipt?.elapsedMs ?? null, mapLoadMs: Math.round(loadMs) }
        out.push(row)
        console.log(JSON.stringify(row))
        if (receipt && !row.matchesReceipt) throw Error(`${mapId} ${config.objective} ${config.seed}: output differs from v14 receipt`)
    }
}
mkdirSync('docs/launch-readiness/evidence', { recursive: true })
writeFileSync(`docs/launch-readiness/evidence/L27-physical-${label}.json`, JSON.stringify({
    label, engine: SPATIAL_ROUND_ENGINE, recordedAt: new Date().toISOString(),
    host: { cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, ramBytes: os.totalmem(), node: process.version, platform: process.platform },
    method: 'Node (tsx) direct runLabTeams per row, one process, sequential; elapsed excludes mesh/nav load (reported separately). Output hash must equal the v14 acceptance receipt.',
    rows: out,
}, null, 2) + '\n')
