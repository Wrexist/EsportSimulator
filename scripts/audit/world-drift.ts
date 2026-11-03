/**
 * World drift check: runs the real week processor over a fresh career world
 * (the managed club passive, training like every AI club) and reports how the
 * world moves season to season: player OVR, the top clubs, market values,
 * wages against what players ask, club cash, the talent pool.
 *
 * A healthy world stays near where it starts: the stars of season one are
 * still stars in season three, OVR still separates the top clubs, prices stay
 * payable, and the pool does not thin out.
 *
 *   npx tsx scripts/audit/world-drift.ts [weeks=105] [--team 60] [--seed 4242] [--jsonl out.jsonl] [--save world.json.gz]
 *
 * About 4 s per week. Prints a row every half season (weeks 1, 27, 53, ...).
 */
import fs from 'node:fs'
import zlib from 'node:zlib'
import path from 'node:path'
import { enableMapSet } from 'immer'
import { computeWeek } from '../../engine/worker/compute-week'
import { buildSaveSnapshot, type SaveSnapshotState } from '../../store/utils/build-save-snapshot'
import { SnapshotLoader } from '../../data/snapshot-loader'
import { AIManager } from '../../engine/ai-manager'
import { TrainingFocus } from '../../types'
import { evaluatePlayer } from '../../engine/player-evaluation'
import { recruitmentSalary } from '../../engine/recruitment'
import type { GameSave } from '../../engine/save-types'

enableMapSet()
const argv = process.argv.slice(2)
const opt = (name: string, fallback: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback }
const weeks = Number(argv[0] && !argv[0].startsWith('--') ? argv[0] : 105)
const jsonl = opt('jsonl', '')
const q = (v: number[], p: number) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))] : NaN }
const mean = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN

async function freshWorld(): Promise<GameSave> {
    const loader = new SnapshotLoader(path.join(process.cwd(), 'public/data/snapshot'))
    const loaded = await loader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)
    const snap = loader.getSnapshot()!
    const save = loader.createCareerFromSnapshot('drift', snap.teams[Number(opt('team', '60'))].id, 1)!
    AIManager.initializeTeamData(save)
    save.lastRngSeed = Number(opt('seed', '4242'))
    return save
}

function measure(s: GameSave) {
    const alive = s.players.filter(p => !p.isRetired)
    const rostered = new Set(s.teams.flatMap(t => t.rosterIds))
    const byId = new Map(s.players.map(p => [p.id, p]))
    const ev = new Map(alive.map(p => [p.id, evaluatePlayer(p, undefined, undefined, s.currentWeek)]))
    const rost = alive.filter(p => rostered.has(p.id))
    const ovr = rost.map(p => ev.get(p.id)!.overallRating)
    const teamOvr = s.teams.map(t => mean(t.rosterIds.map(id => byId.get(id)).filter(Boolean).map(p => ev.get(p!.id)?.overallRating ?? NaN).filter(Number.isFinite).sort((a, b) => b - a).slice(0, 5)))
    const top10 = mean([...teamOvr].filter(Number.isFinite).sort((a, b) => b - a).slice(0, 10))
    const active = s.contracts.filter(c => c.endWeek > s.currentWeek)
    const wageOf = new Map(active.map(c => [c.playerId, c.salaryPerWeek]))
    const askRatio = rost.map(p => { const w = wageOf.get(p.id); return w ? recruitmentSalary(p, s.currentWeek) / Math.max(1, w) : NaN })
    const values = rost.map(p => ev.get(p.id)!.transferValue)
    const best = s.teams.map(t => Math.max(0, ...t.rosterIds.map(id => ev.get(id)?.transferValue ?? 0)))
    return {
        week: s.currentWeek,
        ovrP50: q(ovr, .5), ovrP90: q(ovr, .9), top10,
        valueSumM: values.reduce((a, b) => a + b, 0) / 1e6,
        clubBestPlayerP50: q(best, .5), clubCashP50: q(s.teams.map(t => t.budget), .5),
        wageP50: q(active.map(c => c.salaryPerWeek), .5), askOverWageP50: q(askRatio, .5), askOverWageP90: q(askRatio, .9),
        active: alive.length, freeAgents: alive.filter(p => !rostered.has(p.id)).length,
        shortClubs: s.teams.filter(t => t.rosterIds.length < 5).length,
        transfers: (s.transferHistory || []).length,
    }
}

const COLS = ['week', 'ovrP50', 'ovrP90', 'top10', 'valueSumM', 'clubBestPlayerP50', 'clubCashP50', 'wageP50', 'askOverWageP50', 'askOverWageP90', 'active', 'freeAgents', 'shortClubs', 'transfers'] as const
const fmt = (v: number) => !Number.isFinite(v) ? '-' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : (Math.round(v * 10) / 10).toString()

function report(row: ReturnType<typeof measure>): void {
    console.log(COLS.map(c => fmt(row[c]).padStart(c.length)).join('  '))
    if (jsonl) fs.appendFileSync(jsonl, JSON.stringify(row) + '\n')
}

async function main(): Promise<void> {
    let save = await freshWorld()
    console.log(COLS.join('  '))
    report(measure(save))
    const t0 = Date.now()
    for (let i = 0; i < weeks; i++) {
        const snap = JSON.parse(JSON.stringify(buildSaveSnapshot(save as unknown as SaveSnapshotState)))
        const r = await computeWeek(snap, { playerTeamId: save.playerTeamId!, trainingFocus: new Map([[save.playerTeamId!, { focus: TrainingFocus.AIM, intensity: 5 }]]) }, save.lastRngSeed)
        if (!r.result.success) { console.log('week failed:', r.result.error); break }
        save = { ...r.save, lastRngSeed: r.rngState } as GameSave
        // A passive manager gets sacked; the world goes on for the measurement.
        if (save.gameOverReason) { delete (save as Partial<GameSave>).gameOverReason; delete (save as Partial<GameSave>).gameOverWeek }
        if (save.currentWeek % 26 === 1 || i === weeks - 1) report(measure(save))
    }
    console.log(`${weeks} weeks in ${Math.round((Date.now() - t0) / 1000)} s`)
    const out = opt('save', '')
    if (out) fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(save)))
}
main().catch(e => { console.error(e); process.exitCode = 1 })
