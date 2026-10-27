/**
 * R3 audit: what club habits and the manager's anti-strat counters do.
 *
 * Two even 70-rated teams play paired BO1 maps (same seeds, same maps) on the
 * managed path, HOME managed. Arms: habits off (the engine before R3), AWAY's
 * habits on, and habits with HOME's counters (CT, T, both) on every map.
 * Reported per arm: HOME's round win rate overall and on its CT / T full buys,
 * how often the CTs read the plan right on those, and the map win rate.
 *
 *   npx tsx scripts/audit-anti-strat.ts [--maps 192] [--seed 20261027] [--set HABIT_RATE_CT=0.4 ...]
 */
import { seriesRunnerFor } from '../engine/match/calibration/run'
import { buildSide, even } from '../engine/match/calibration/fixtures'
import { ACTIVE_MAP_POOL } from '../data/map-pool'
import { deriveSeed } from '../engine/rng'
import { forceHabits } from '../engine/match/round-sim'
import type { RoundResult } from '../types'
import { TUNING } from '../engine/match/round-sim/tuning'

const arg = (name: string, fallback: number) => {
    const i = process.argv.indexOf(`--${name}`)
    return i >= 0 ? Number(process.argv[i + 1]) : fallback
}

interface Arm { label: string; habits: boolean; ct?: boolean; t?: boolean }
const arms: Arm[] = [
    { label: 'habits off', habits: false },
    { label: 'habits on', habits: true },
    { label: 'CT counter', habits: true, ct: true },
    { label: 'T counter', habits: true, t: true },
    { label: 'both counters', habits: true, ct: true, t: true },
]

const pct = (n: number, d: number) => d ? (100 * n / d).toFixed(1).padStart(5) : '    -'

function main(): void {
    for (let i = 0; i < process.argv.length; i++) {
        if (process.argv[i] !== '--set') continue
        const [k, v] = process.argv[i + 1].split('=')
        if (!(k in TUNING)) throw new Error(`unknown tuning key ${k}`)
        ;(TUNING as Record<string, unknown>)[k] = Number(v)
    }
    const maps = arg('maps', 192)
    const seed = arg('seed', 20261027)
    const runner = seriesRunnerFor('script-v1')
    if (!runner) throw new Error('script-v1 is not runnable')
    const home = buildSide({ id: 'HOME', skills: even(70) })
    const away = buildSide({ id: 'AWAY', skills: even(70) })
    console.log(`${maps} paired maps per arm, HOME (managed) vs AWAY, both 70.`)
    console.log('arm             round win% | CT full win%  read right% | T full win%  CT read right% | habit T% CT% | counter rounds won% | map win%')
    for (const arm of arms) {
        forceHabits(arm.habits ? null : false)
        let n = 0, w = 0, ctN = 0, ctW = 0, ctRight = 0, tN = 0, tW = 0, tRight = 0, tHab = 0, tHabN = 0, ctHab = 0, ctHabN = 0, cN = 0, cW = 0, mapsWon = 0
        for (let i = 0; i < maps; i++) {
            const map = ACTIVE_MAP_POOL[i % ACTIVE_MAP_POOL.length]
            const counters = arm.ct || arm.t ? { [map]: { ...(arm.ct ? { ct: true } : {}), ...(arm.t ? { t: true } : {}) } } : undefined
            const res = runner.managed({ id: `as-${i}`, seed: deriveSeed(seed, 'anti-strat', i), map, home, away, managedTeamId: 'HOME', counters })
            if (res.winnerId === 'HOME') mapsWon++
            for (const m of res.maps) for (const r of m.rounds as RoundResult[]) {
                const won = r.winningTeamId === 'HOME'
                n++; if (won) w++
                if (r.plan?.counter) { cN++; if (won) cW++ }
                const homeCT = r.tTeam !== 'HOME'
                const homeBuy = r.buys?.home, awayBuy = r.buys?.away
                const full = (b?: string) => b === 'FULL' || b === 'DOUBLE AWP'
                if (full(awayBuy)) {
                    if (homeCT) { tHabN++; if (r.plan?.tHabit) tHab++ } else { ctHabN++; if (r.plan?.ctHabit) ctHab++ }
                }
                if (!full(homeBuy)) continue
                if (homeCT) { ctN++; if (won) ctW++; if (r.plan?.read === 'right') ctRight++ }
                else { tN++; if (won) tW++; if (r.plan?.read === 'right') tRight++ }
            }
            process.stderr.write(`\r${arm.label} ${i + 1}/${maps}`)
        }
        process.stderr.write('\n')
        console.log(`${arm.label.padEnd(15)} ${pct(w, n)}      | ${pct(ctW, ctN)}        ${pct(ctRight, ctN)}  | ${pct(tW, tN)}        ${pct(tRight, tN)}    | ${pct(tHab, tHabN)} ${pct(ctHab, ctHabN)} | ${String(cN).padStart(5)} ${pct(cW, cN)}      | ${pct(mapsWon, maps)}`)
    }
    forceHabits(null)
}

main()
