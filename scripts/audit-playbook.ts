/**
 * G1 audit: what a fixed playbook call does to round and map win rates.
 *
 * Two even 70-rated teams play paired BO1 maps (same seeds, same maps) on the
 * managed path. HOME runs one arm per call: the same call in every situation
 * on every map (or no playbook for "auto"). Reported per arm: HOME's round
 * win rate on its T and CT full-buy rounds, how often the CT read the plan,
 * and the map win rate.
 *
 *   npx tsx scripts/audit-playbook.ts [--maps 96] [--seed 20261024] [--only T|CT|auto] [--set PLAYBOOK_READ_PER_REPEAT=0.05 ...]
 */
import { seriesRunnerFor } from '../engine/match/calibration/run'
import { buildSide, even } from '../engine/match/calibration/fixtures'
import { ACTIVE_MAP_POOL } from '../data/map-pool'
import { deriveSeed } from '../engine/rng'
import { CT_SETUPS, PLAY_SITUATIONS, T_CALL_STRATEGIES, type MapPlaybook, type Playbook, type TCall } from '../engine/match/playbook'
import type { CtSetup } from '../engine/match/round-script-types'
import type { RoundResult } from '../types'
import { TUNING } from '../engine/match/round-sim/tuning'

const arg = (name: string, fallback: number) => {
    const i = process.argv.indexOf(`--${name}`)
    return i >= 0 ? Number(process.argv[i + 1]) : fallback
}

interface Arm { label: string; t?: TCall; ct?: CtSetup; book?: MapPlaybook }

const arms: Arm[] = [{ label: 'auto' }]
for (const strategy of T_CALL_STRATEGIES) {
    arms.push({ label: `T ${strategy} (site any)`, t: { strategy } })
    arms.push({ label: `T ${strategy} A`, t: { strategy, site: 'A' } })
}
for (const setup of CT_SETUPS) arms.push({ label: `CT ${setup}`, ct: setup })
// A playbook that varies the call by buy (fewer repeats per call).
arms.push({ label: 'mixed by buy', book: { t: { pistol: { strategy: 'rush' }, force: { strategy: 'rush' }, full: { strategy: 'execute' } }, ct: { pistol: '2-1-2', force: 'aggressive', full: 'aggressive' } } })

function playbookFor(arm: Arm): Playbook | undefined {
    if (arm.book) return Object.fromEntries(ACTIVE_MAP_POOL.map(m => [m, arm.book!]))
    if (!arm.t && !arm.ct) return undefined
    const book: MapPlaybook = {}
    for (const sit of PLAY_SITUATIONS) {
        if (arm.t) book.t = { ...book.t, [sit]: arm.t }
        if (arm.ct) book.ct = { ...book.ct, [sit]: arm.ct }
    }
    return Object.fromEntries(ACTIVE_MAP_POOL.map(m => [m, book]))
}

const pct = (n: number, d: number) => d ? (100 * n / d).toFixed(1).padStart(5) : '    -'

function main(): void {
    for (let i = 0; i < process.argv.length; i++) {
        if (process.argv[i] !== '--set') continue
        const [k, v] = process.argv[i + 1].split('=')
        if (!(k in TUNING)) throw new Error(`unknown tuning key ${k}`)
        ;(TUNING as Record<string, unknown>)[k] = Number(v)
    }
    const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined
    const maps = arg('maps', 96)
    const seed = arg('seed', 20261024)
    const runner = seriesRunnerFor('script-v1')
    if (!runner) throw new Error('script-v1 is not runnable')
    const away = buildSide({ id: 'AWAY', skills: even(70) })
    console.log(`${maps} paired maps per arm, HOME vs AWAY both 70. Full-buy rounds only for the side rates.`)
    console.log('arm                      T full win%  CT read%(on T)  T win% read/not | CT full win%  CT read right% | map win%  (n T / n CT)')
    for (const arm of arms) {
        const isAuto = !arm.t && !arm.ct && !arm.book
        if (only && !(isAuto || (only === 'T' && arm.t) || (only === 'CT' && arm.ct) || (only === 'mixed' && arm.book))) continue
        const base = buildSide({ id: 'HOME', skills: even(70) })
        const book = playbookFor(arm)
        const home = { ...base, team: { ...base.team, ...(book ? { playbook: book } : {}) } }
        let tN = 0, tW = 0, tRead = 0, tReadW = 0, ctN = 0, ctW = 0, ctRight = 0, mapsWon = 0
        for (let i = 0; i < maps; i++) {
            const map = ACTIVE_MAP_POOL[i % ACTIVE_MAP_POOL.length]
            const res = runner.managed({ id: `pb-${i}`, seed: deriveSeed(seed, 'playbook', i), map, home, away, managedTeamId: 'HOME' })
            if (res.winnerId === 'HOME') mapsWon++
            for (const m of res.maps) for (const r of m.rounds as RoundResult[]) {
                const homeT = r.tTeam === 'HOME'
                const buy = r.buys?.home
                if (buy !== 'FULL' && buy !== 'DOUBLE AWP') continue
                const won = r.winningTeamId === 'HOME'
                if (homeT) { tN++; if (won) tW++; if (r.plan?.read === 'right') { tRead++; if (won) tReadW++ } }
                else { ctN++; if (won) ctW++; if (r.plan?.read === 'right') ctRight++ }
            }
        }
        console.log(`${arm.label.padEnd(24)} ${pct(tW, tN)}        ${pct(tRead, tN)}       ${pct(tReadW, tRead)} / ${pct(tW - tReadW, tN - tRead)}  |    ${pct(ctW, ctN)}        ${pct(ctRight, ctN)}     |  ${pct(mapsWon, maps)}   (${tN} / ${ctN})`)
    }
}

main()
