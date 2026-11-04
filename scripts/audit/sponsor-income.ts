/**
 * Sponsor income check (MARKET-03): for every club in a fresh career world,
 * the weekly sponsor income it earns once it fills each tier it may sign
 * (STANDARD always, PREMIUM in the top 30, ELITE in the top 10) with the best
 * offer of that tier, the way AI clubs pick (engine/ai/infrastructure.ts).
 * Reports the median by club band, averaged over several offer weeks, plus
 * how far apart the offers of one week are.
 *
 *   npx tsx scripts/audit/sponsor-income.ts [weeks=8] [--shares 0.25,0.3,0.35] [--spread 0.1] [--betting 1.3]
 */
import path from 'node:path'
import { enableMapSet } from 'immer'
import { SnapshotLoader } from '../../data/snapshot-loader'
import { AIManager } from '../../engine/ai-manager'
import { SponsorGenerator } from '../../engine/economy-manager'
import { EconomyEngine } from '../../engine/economy-engine'
import { SeededRNG } from '../../engine/rng'
import { SPONSOR_TUNING } from '../../lib/balance-tuning'
import type { SponsorSaveData, TeamSaveData } from '../../engine/save-types'

enableMapSet()
const weeks = Number(process.argv[2] || 8)
// Optional what-if: --shares S,P,E overrides SPONSOR_TUNING.TIER_SHARE_OF_WAGE_BILL for this run.
const sharesArg = process.argv.indexOf('--shares')
if (sharesArg > 0) {
    const [S, P, E] = process.argv[sharesArg + 1].split(',').map(Number)
    Object.assign(SPONSOR_TUNING.TIER_SHARE_OF_WAGE_BILL as Record<string, number>, { STANDARD: S, PREMIUM: P, ELITE: E })
}
const tuneArg = (name: string, key: string) => { const i = process.argv.indexOf(name); if (i > 0) (SPONSOR_TUNING as unknown as Record<string, number>)[key] = Number(process.argv[i + 1]) }
tuneArg('--spread', 'OFFER_CAP_SPREAD')
tuneArg('--betting', 'BETTING_CAP_PREMIUM')
const q = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))] : NaN }

async function main() {
    const loader = new SnapshotLoader(path.join(process.cwd(), 'public/data/snapshot'))
    const loaded = await loader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)
    const snap = loader.getSnapshot()!
    const save = loader.createCareerFromSnapshot('sponsor', snap.teams[60].id, 1)!
    AIManager.initializeTeamData(save)
    const bands = { low: [] as number[], mid: [] as number[], top: [] as number[] }
    const spread = { low: [] as number[], mid: [] as number[], top: [] as number[] }
    const floors = { low: [] as number[], mid: [] as number[], top: [] as number[] }
    const tierPay: Record<string, number[]> = { STANDARD: [], PREMIUM: [], ELITE: [] }
    for (const team of save.teams) {
        const rank = team.worldRanking || 999
        const band = rank <= 10 ? 'top' : rank <= 30 ? 'mid' : 'low'
        const open = new Set(['STANDARD', ...(rank <= 30 ? ['PREMIUM'] : []), ...(rank <= 10 ? ['ELITE'] : [])])
        const costBase = EconomyEngine.sponsorCostBase(team, save.contracts, save.staff || [], 2)
        let sum = 0
        for (let w = 1; w <= weeks; w++) {
            const rng = new SeededRNG(1000 + w * 7919 + team.id.length)
            const offers = SponsorGenerator.generateVariedOffers(team, w, rng, costBase)
            const best = new Map<string, SponsorSaveData>()
            for (const o of offers) {
                tierPay[o.tier].push(o.weeklyPayout)
                if (!open.has(o.tier)) continue
                const cur = best.get(o.tier)
                if (!cur || o.weeklyPayout > cur.weeklyPayout) best.set(o.tier, o)
            }
            const pays = offers.map(o => o.weeklyPayout)
            spread[band].push(Math.max(...pays) / Math.max(1, Math.min(...pays)))
            const t: TeamSaveData = { ...team, sponsors: [...best.values()] }
            sum += EconomyEngine.calculateSponsorIncome(t)
        }
        bands[band].push(sum / weeks)
        floors[band].push(EconomyEngine.calculateSponsorIncome({ ...team, sponsors: [] }))
    }
    for (const b of ['low', 'mid', 'top'] as const) {
        console.log(`${b.padEnd(4)} clubs=${String(bands[b].length).padStart(3)}  median weekly sponsor income=${Math.round(q(bands[b], 0.5)).toLocaleString('en-US').padStart(8)}  p25=${Math.round(q(bands[b], 0.25)).toLocaleString('en-US')}  p75=${Math.round(q(bands[b], 0.75)).toLocaleString('en-US')}  (no-deal floor ${Math.round(q(floors[b], 0.5)).toLocaleString('en-US')})  mean=${Math.round(bands[b].reduce((a, v) => a + v, 0) / bands[b].length).toLocaleString('en-US')}  offer max/min (median)=${q(spread[b], 0.5).toFixed(2)}`)
    }
    for (const tier of Object.keys(tierPay)) console.log(`${tier.padEnd(8)} median offer payout=${Math.round(q(tierPay[tier], 0.5)).toLocaleString('en-US')}`)
}
main().catch(e => { console.error(e); process.exit(1) })
