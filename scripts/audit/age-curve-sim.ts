/**
 * Age-curve check (C7), fast: replays only player development on a real
 * career world for many seasons and reports how OVR changes with age.
 *
 * Starts from a campaign final save (or any exported save), then each week
 * runs the same training step every club gets (AI regimen for all clubs),
 * fatigue recovery with natural growth and age decline, and at each season
 * end the birthday and the retirement check. No matches, transfers or youth
 * intake: it isolates the development curve the career runs on.
 *
 *   npx tsx scripts/audit/age-curve-sim.ts <save.json.gz> [seasons=10]
 *
 * Prints, per age: players measured, mean OVR, mean OVR change over the
 * following season, and the share who retired at that age. Targets from
 * the pro scene: peak around 24–27, a slow decline after, IGLs and AWPers
 * lasting into their 30s.
 */
import fs from 'node:fs'
import zlib from 'node:zlib'
import type { GameSave } from '../../engine/save-types'
import { TrainingProcessor } from '../../engine/processors/training-processor'
import { evaluatePlayer } from '../../engine/player-evaluation'
import { retirementChance } from '../../engine/retirement-chance'
import { SeededRNG } from '../../engine/rng'
import { AI_SQUAD_TUNING } from '../../lib/balance-tuning'
import { TrainingFocus } from '../../types'

const file = process.argv[2]
const seasons = Number(process.argv[3] ?? 10)
if (!file) throw Error('usage: age-curve-sim.ts <save.json.gz> [seasons]')
const raw = fs.readFileSync(file)
const save = JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString()) as GameSave
const rng = new SeededRNG(20261026)
const rostered = new Set(save.teams.flatMap(t => t.rosterIds))
const tracked = save.players.filter(p => !p.isRetired && rostered.has(p.id))
const year0 = 2025 + Math.floor(save.currentWeek / 52)

const ovr = (week: number) => new Map(tracked.filter(p => !p.isRetired).map(p => [p.id, evaluatePlayer(p, undefined, year0 + Math.floor((week - save.currentWeek) / 52), week).overallRating]))
interface Row { n: number; ovr: number; delta: number; deltaN: number; retired: number; tacticN: number; tactic: number }
const rows = new Map<number, Row>()
const row = (age: number) => { let r = rows.get(age); if (!r) { r = { n: 0, ovr: 0, delta: 0, deltaN: 0, retired: 0, tacticN: 0, tactic: 0 }; rows.set(age, r) } return r }
const byRole: Record<string, Map<number, { n: number; delta: number }>> = {}

let before = ovr(save.currentWeek)
const ageAt = new Map(tracked.map(p => [p.id, p.age]))
const training = new Map(save.teams.map(t => [t.id, { focus: AI_SQUAD_TUNING.TRAINING_FOCUS as TrainingFocus, intensity: AI_SQUAD_TUNING.TRAINING_INTENSITY }]))
for (let s = 0; s < seasons; s++) {
    for (let w = 0; w < 52; w++) {
        save.currentWeek++
        TrainingProcessor.processTraining(save, training)
        TrainingProcessor.processFatigueRecovery(save, rng)
    }
    const after = ovr(save.currentWeek)
    for (const p of tracked) {
        if (p.isRetired) continue
        const age = ageAt.get(p.id)!
        const r = row(age)
        const b = before.get(p.id), a = after.get(p.id)
        if (b !== undefined && a !== undefined) {
            r.n++; r.ovr += b; r.delta += a - b; r.deltaN++
            const role = /IGL/i.test(String(p.role)) ? 'IGL' : /AWP/i.test(String(p.role)) ? 'AWPer' : 'Other'
            const m = (byRole[role] ??= new Map())
            const e = m.get(age) ?? { n: 0, delta: 0 }
            e.n++; e.delta += a - b; m.set(age, e)
        }
        // Season end: birthday, then the retirement check (as EventProcessor does at week 52).
        p.age++
        ageAt.set(p.id, p.age)
        const chance = p.age >= 38 ? 1 : retirementChance(p, save.currentWeek)
        if (rng.next() < chance) { p.isRetired = true; row(p.age).retired++ }
    }
    before = ovr(save.currentWeek)
}

console.log(`${tracked.length} rostered players, ${seasons} seasons of development (no matches, transfers or intake)`)
console.log('age  measured  meanOVR  ΔOVR/season  retired')
for (const age of [...rows.keys()].sort((a, b) => a - b)) {
    const r = rows.get(age)!
    if (r.n + r.retired < 8) continue
    console.log(`${String(age).padStart(3)}  ${String(r.n).padStart(8)}  ${(r.ovr / Math.max(1, r.n)).toFixed(1).padStart(7)}  ${(r.delta / Math.max(1, r.deltaN)).toFixed(2).padStart(11)}  ${String(r.retired).padStart(7)}`)
}
console.log('\nΔOVR/season by role at 27–35')
for (const [role, m] of Object.entries(byRole)) {
    console.log(role.padEnd(6), [27, 29, 31, 33, 35].map(a => { const e = m.get(a); return e && e.n >= 5 ? `${a}: ${(e.delta / e.n).toFixed(2)}` : `${a}: —` }).join('  '))
}
