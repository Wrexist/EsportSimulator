/** Local Node measurements of real compute/save code; never renderer or packaged acceptance. */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { SnapshotLoader } from '../../data/snapshot-loader'
import { AIManager } from '../../engine/ai-manager'
import { computeWeek } from '../../engine/worker/compute-week'
import { canonicalWeekState } from '../../engine/worker/week-replay'
import { perfTrace } from '../../engine/perf-trace'
import { SaveManager } from '../../engine/save-manager'
import { FixtureStorage, createLaunchFixture } from './fixtures'
import type { GameSave } from '../../engine/save-types'

const root = process.cwd()
const evidence = path.join(root, 'docs/launch-readiness/evidence')
const fixturesDir = path.join(root, 'tmp/l27-fixtures')
const label = process.argv.find(a => a.startsWith('--label='))?.split('=')[1] || 'baseline'
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid measurement label')
const samples = 8
const seed = 27001
const hash = (bytes: string | Buffer) => crypto.createHash('sha256').update(bytes).digest('hex')
const stat = (values: number[]) => {
    const sorted = [...values].sort((a,b) => a-b)
    return { samples: values, median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2, p95: sorted[Math.ceil(sorted.length * .95) - 1], min: sorted[0], max: sorted.at(-1) }
}
async function prepare() {
    fs.mkdirSync(fixturesDir, {recursive: true})
    if (fs.existsSync(path.join(fixturesDir, 'manifest.json'))) return
    const loader = new SnapshotLoader(path.join(root, 'public/data/snapshot'))
    const loaded = await loader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)
    const first = loader.getSnapshot()!.teams[0]
    const full = loader.createCareerFromSnapshot('L27 isolated measurement', first.id, 1)!
    AIManager.initializeTeamData(full)
    full.lastRngSeed = seed
    // A declared stress input: one BO1 per pair, using the real launch roster.
    full.scheduledMatches = full.teams.filter((_, i) => i % 2 === 0 && full.teams[i+1]).map((team, i) => ({id: `l27_match_${i}`, homeTeamId: team.id, awayTeamId: full.teams[i*2+1].id, week: 2, format: 'BO1', seed: seed+i, tournamentId: null, stage: 'Friendly'} as any))
    const late = structuredClone(full)
    late.currentWeek = 521
    late.scheduledMatches.forEach(match => { match.week = 522 })
    late.eventsLog = Array.from({length: 5000}, (_,i) => ({id:`l27_history_${i}`, week: i % 520 + 1, type:'INFO', acknowledged:true, data:{title:'Synthetic history', description:'History stress fixture; not ten simulated seasons'}} as any))
    const active = structuredClone(late)
    active.contracts.forEach(contract => { contract.startWeek += 520; contract.endWeek += 520 })
    active.staff.forEach(person => { if (person.contractEndWeek != null) person.contractEndWeek += 520 })
    const small = createLaunchFixture('first-week', seed)
    small.scheduledMatches.forEach(match => { match.week = small.currentWeek + 1 })
    const entries = Object.entries({small, 'full-world': full, 'late-history': late, 'late-active': active}).map(([name, save]) => {
        const bytes = JSON.stringify(save)
        fs.writeFileSync(path.join(fixturesDir, `${name}.json`), bytes)
        return {name, bytes: Buffer.byteLength(bytes), sha256: hash(bytes), teams:save.teams.length, players:save.players.length, week:save.currentWeek, scheduled:save.scheduledMatches.length, events:save.eventsLog.length}
    })
    fs.writeFileSync(path.join(fixturesDir, 'manifest.json'), JSON.stringify({seed, entries, limitation:'Frozen isolated inputs. Full world has a synthetic 99-match schedule; late-history leaves expired contracts and causes mass recruitment, while late-active shifts contract dates. Neither is ten simulated seasons.'}, null, 2))
}
async function main() {
    await prepare()
    const manifest = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'manifest.json'), 'utf8'))
    const measurements: any[] = []
    for (const entry of manifest.entries) {
        const bytes = fs.readFileSync(path.join(fixturesDir, `${entry.name}.json`), 'utf8')
        if (hash(bytes) !== entry.sha256) throw Error('Fixture changed')
        const original: GameSave = JSON.parse(bytes)
        const config = {playerTeamId:original.playerTeamId, trainingFocus:new Map()}
        await computeWeek(structuredClone(original), config, seed) // same warmup for each scenario
        perfTrace.reset()
        const compute: number[] = [], clone: number[] = [], saveTimes: number[] = [], retained: number[] = []
        const outputs: string[] = []
        let matches = 0, savedBytes = 0
        for (let i=0; i<samples; i++) {
            let start = performance.now()
            const input = structuredClone(original)
            clone.push(performance.now()-start)
            start = performance.now()
            const output = await computeWeek(input, config, seed)
            compute.push(performance.now()-start)
            if (!output.result.success) throw Error(`${entry.name}: ${output.result.error}`)
            matches = output.result.matchesPlayed
            outputs.push(hash(canonicalWeekState(output.save) + ':' + output.rngState))
            const storage = new FixtureStorage()
            const manager = new SaveManager(storage)
            start = performance.now()
            const saved = await manager.saveGame(output.save)
            saveTimes.push(performance.now()-start)
            if (!saved.success) throw Error(saved.error)
            savedBytes = [...storage.data.values()].reduce((n,v) => n+Buffer.byteLength(v),0)
            retained.push(process.memoryUsage().heapUsed)
        }
        if (new Set(outputs).size !== 1) throw Error(`${entry.name}: nondeterministic output`)
        const measurement = {scenario:entry.name,input:entry,computeMs:stat(compute),cloneMs:stat(clone),saveToMemoryMs:stat(saveTimes),heapSamplesBytes:retained,outputHash:outputs[0],matches,savedBytes,steps:perfTrace.snapshot()}
        measurements.push(measurement)
        console.log(JSON.stringify({scenario:entry.name, computeMedian:measurement.computeMs.median, saveMedian:measurement.saveToMemoryMs.median, matches}))
    }
    const sourceFiles = ['engine/atomic-week-processor.ts','engine/worker/compute-week.ts','engine/save-manager.ts','engine/ai-manager.ts','engine/ai/roster-management.ts','engine/player-evaluation.ts','engine/recruitment.ts','scripts/launch/measure-performance.ts']
    fs.mkdirSync(evidence,{recursive:true})
    const result = {version:1,label,recordedAt:new Date().toISOString(),host:{cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,ramBytes:os.totalmem(),node:process.version,platform:process.platform,arch:process.arch},method:{samples,warmup:1,seed,steps:perfTrace.stepsEnabled,transport:'Node direct call to production computeWeek; no browser worker transport',storage:'SaveManager with in-memory adapter; not IndexedDB/disk',heap:'Unforced-GC samples; allocation observation, not retained-heap/leak proof'},sourceHashes:Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),lockHash:hash(fs.readFileSync(path.join(root,'package-lock.json'))),measurements,limitations:manifest.limitation}
    fs.writeFileSync(path.join(evidence,`L27-${label}.json`),JSON.stringify(result,null,2)+'\n')
}
main().catch(error=>{console.error(error);process.exitCode=1})
