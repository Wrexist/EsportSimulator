/**
 * Is the Draft Cup fair on each difficulty, and do its prices follow OVR?
 *
 *   npx tsx scripts/ratings/draft-cup-balance.ts prices
 *   npx tsx scripts/ratings/draft-cup-balance.ts cups --runs 60 --seed 1 [--shard 0 --of 4] --out tmp/draft-cup/cups-0.jsonl
 *   npx tsx scripts/ratings/draft-cup-balance.ts report tmp/draft-cup/cups-*.jsonl
 *
 * prices  the draft's price against each player's shown OVR: correlation,
 *         price paid per OVR band, and how far two players with the same OVR
 *         can differ in price.
 * cups    deals real drafts (field from the difficulty band, pool, then three
 *         ways to spend the budget: best OVR inside it, the test's greedy
 *         pick, cheapest five) and plays the whole 8-team bracket on the
 *         AI match path (BO3, BO3, BO5) with the drafted side built exactly as
 *         the game builds it (setupDraftCup: chemistry, facilities). One row per
 *         cup: drafted five's OVR, field OVR, how far the side went.
 * report  per difficulty and draft style: titles, finals, quarter-final exits
 *         and the OVR gap to the field.
 */
import fs from 'node:fs'
import path from 'node:path'
import { SnapshotLoader } from '../../data/snapshot-loader'
import { reconcileAllRoles } from '../../engine'
import { AIManager } from '../../engine/ai-manager'
import { prepareLegacySeries } from '../../engine/match/legacy-prepare'
import { finalizeLegacySeries, runLegacySeries } from '../../engine/match/legacy-series'
import { ACTIVE_MAP_POOL } from '../../data/map-pool'
import { SeededRNG } from '../../engine/rng'
import { evaluatePlayer } from '../../engine/player-evaluation'
import {
    buildDraftPool, clubStrength, draftPrice, pickCupField,
    DRAFT_BUDGET, DRAFT_CUP_DIFFICULTIES, DRAFT_CUP_DIFFICULTY, DRAFT_ROLES, type DraftCupDifficulty, type DraftOption, type DraftPick, type DraftPool,
} from '../../engine/draft-cup'
import { setupDraftCup } from '../../engine/draft-cup-setup'
import type { GameSave, PlayerSaveData, TeamSaveData } from '../../engine/save-types'

type Style = 'bestOvr' | 'greedy' | 'cheap'
const STYLES: Style[] = ['bestOvr', 'greedy', 'cheap']

interface Row { difficulty: DraftCupDifficulty; style: Style; run: number; spent: number; draftOvr: number; fieldOvr: number; fieldOvrMax: number; finish: 'champion' | 'final' | 'semi' | 'quarter'; mapsWon: number; mapsLost: number }

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`)
    return i >= 0 ? process.argv[i + 1] : fallback
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const ovrOf = (p: unknown) => evaluatePlayer(p as never, undefined, undefined, 1).overallRating

async function world(): Promise<GameSave> {
    const loader = new SnapshotLoader(path.join(process.cwd(), 'public/data/snapshot'))
    const loaded = await loader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)
    const snap = loader.getSnapshot()!
    // As lib/draft-cup-world.ts builds it.
    const placeholder = [...snap.teams].sort((a, b) => (a.reputation ?? 0) - (b.reputation ?? 0) || a.id.localeCompare(b.id))[0]
    const save = loader.createCareerFromSnapshot('Draft Cup', placeholder.id, 1)!
    reconcileAllRoles(save.teams as never, save.players as never)
    return save
}

/** Best five under the budget by a score per option (6^5 combinations). */
function bestDraft(pool: DraftPool, score: (o: DraftOption) => number, budget = DRAFT_BUDGET): DraftPick[] {
    let best: DraftOption[] = [], bestScore = -Infinity, bestPrice = Infinity
    const walk = (i: number, chosen: DraftOption[], price: number, s: number) => {
        if (price > budget) return
        if (i === DRAFT_ROLES.length) {
            if (s > bestScore || (s === bestScore && price < bestPrice)) { best = [...chosen]; bestScore = s; bestPrice = price }
            return
        }
        for (const o of pool[DRAFT_ROLES[i]]) { chosen.push(o); walk(i + 1, chosen, price + o.price, s + score(o)); chosen.pop() }
    }
    walk(0, [], 0, 0)
    return best.map(o => ({ playerId: o.playerId, role: o.role, price: o.price }))
}

/** The test's greedy draft: the dearest pick per role that leaves the cheapest for the rest. */
function greedyDraft(pool: DraftPool, budget = DRAFT_BUDGET): DraftPick[] {
    const picks: DraftPick[] = []
    let left = budget
    DRAFT_ROLES.forEach((role, i) => {
        const reserve = DRAFT_ROLES.slice(i + 1).reduce((s, r) => s + Math.min(...pool[r].map(o => o.price)), 0)
        const option = pool[role].filter(o => o.price <= left - reserve).sort((a, b) => b.price - a.price)[0]
        picks.push({ playerId: option.playerId, role, price: option.price })
        left -= option.price
    })
    return picks
}

function draftFor(style: Style, pool: DraftPool): DraftPick[] {
    switch (style) {
        case 'bestOvr': return bestDraft(pool, o => o.overall)
        case 'greedy': return greedyDraft(pool)
        case 'cheap': return bestDraft(pool, o => -o.price)
    }
}

function series(save: GameSave, home: TeamSaveData, away: TeamSaveData, bestOf: 3 | 5, rng: SeededRNG, id: string) {
    const roster = (t: TeamSaveData) => t.rosterIds.map(pid => save.players.find(p => p.id === pid)!).filter(Boolean).slice(0, 5) as PlayerSaveData[]
    const maps = [...ACTIVE_MAP_POOL].sort(() => rng.next() - 0.5).slice(0, bestOf)
    const ctx = prepareLegacySeries({
        match: { id, seed: rng.int(1, 0x7ffffffe), format: `BO${bestOf}`, maps, engineVersion: 'script-v1' },
        homeTeam: home as never, awayTeam: away as never,
        homePlayers: roster(home), awayPlayers: roster(away),
        staff: save.staff as never,
    })
    const result = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
    let homeMaps = 0, awayMaps = 0
    for (const m of result.maps) { if ((m.homeScore ?? 0) > (m.awayScore ?? 0)) homeMaps++; else awayMaps++ }
    return { winner: result.winnerId === home.id ? home : away, homeMaps, awayMaps }
}

/** Plays the bracket; returns how far `mine` went and its maps. */
function playCup(save: GameSave, mine: TeamSaveData, field: TeamSaveData[], rng: SeededRNG, tag: string) {
    let alive = [mine, ...field].sort(() => rng.next() - 0.5)
    let mapsWon = 0, mapsLost = 0
    const stages = ['quarter', 'semi', 'final'] as const
    for (let s = 0; s < 3; s++) {
        const next: TeamSaveData[] = []
        for (let i = 0; i < alive.length; i += 2) {
            const r = series(save, alive[i], alive[i + 1], s === 2 ? 5 : 3, rng, `${tag}_${s}_${i}`)
            if (alive[i] === mine) { mapsWon += r.homeMaps; mapsLost += r.awayMaps }
            if (alive[i + 1] === mine) { mapsWon += r.awayMaps; mapsLost += r.homeMaps }
            next.push(r.winner)
        }
        if (!next.includes(mine)) return { finish: stages[s], mapsWon, mapsLost }
        alive = next
    }
    return { finish: 'champion' as const, mapsWon, mapsLost }
}

async function cups(): Promise<void> {
    const runs = Number(arg('runs', '40'))
    const baseSeed = Number(arg('seed', '1'))
    const shard = Number(arg('shard', '0')), of = Number(arg('of', '1'))
    const out = arg('out')!
    const base = await world()
    const byId = new Map(base.players.map(p => [p.id, p]))
    fs.mkdirSync(path.dirname(out), { recursive: true })
    const rows: string[] = []
    for (let run = shard; run < runs; run += of) {
        for (const difficulty of DRAFT_CUP_DIFFICULTIES) {
            const seed = baseSeed * 100_003 + run * 7 + DRAFT_CUP_DIFFICULTIES.indexOf(difficulty)
            const opponentIds = pickCupField(base.teams, byId as never, difficulty, seed)
            const pool = buildDraftPool(base.players, base.teams, opponentIds, seed + 1)
            for (const style of STYLES) {
                const picks = draftFor(style, pool)
                const save = structuredClone(base)
                save.saveId = `dcb_${run}_${difficulty}_${style}`
                AIManager.initializeTeamData(save)
                const teamId = setupDraftCup(save, { teamName: 'Draft', shortName: 'DRF', primaryColor: '#000', secondaryColor: '#fff', difficulty, budget: DRAFT_BUDGET, picks, opponentIds })
                const mine = save.teams.find(t => t.id === teamId)!
                const field = opponentIds.map(id => save.teams.find(t => t.id === id)!)
                const teamOvr = (t: TeamSaveData) => mean(t.rosterIds.slice(0, 5).map(id => ovrOf(save.players.find(p => p.id === id))))
                const r = playCup(save, mine, field, new SeededRNG(seed ^ 0x5eed), save.saveId)
                const fieldOvrs = field.map(teamOvr)
                const row: Row = {
                    difficulty, style, run, spent: picks.reduce((s, p) => s + p.price, 0),
                    draftOvr: +teamOvr(mine).toFixed(2), fieldOvr: +mean(fieldOvrs).toFixed(2), fieldOvrMax: +Math.max(...fieldOvrs).toFixed(2), ...r,
                }
                rows.push(JSON.stringify(row))
            }
        }
        fs.writeFileSync(out, rows.join('\n') + '\n')
        process.stderr.write(`shard ${shard}: run ${run} done (${rows.length} cups)\n`)
    }
}

function report(files: string[]): void {
    const rows = files.flatMap(f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Row))
    const pct = (n: number, d: number) => +(100 * n / Math.max(1, d)).toFixed(1)
    const out: Record<string, unknown>[] = []
    for (const difficulty of DRAFT_CUP_DIFFICULTIES) for (const style of STYLES) {
        const rs = rows.filter(r => r.difficulty === difficulty && r.style === style)
        if (!rs.length) continue
        out.push({
            difficulty, style, cups: rs.length,
            spent: +mean(rs.map(r => r.spent)).toFixed(1),
            draftOvr: +mean(rs.map(r => r.draftOvr)).toFixed(1),
            fieldOvr: +mean(rs.map(r => r.fieldOvr)).toFixed(1),
            titlesPct: pct(rs.filter(r => r.finish === 'champion').length, rs.length),
            finalOrBetterPct: pct(rs.filter(r => r.finish === 'champion' || r.finish === 'final').length, rs.length),
            outInQuarterPct: pct(rs.filter(r => r.finish === 'quarter').length, rs.length),
            mapWinPct: pct(rs.reduce((s, r) => s + r.mapsWon, 0), rs.reduce((s, r) => s + r.mapsWon + r.mapsLost, 0)),
        })
    }
    console.table(out)
}

function corr(xs: number[], ys: number[]): number {
    const mx = mean(xs), my = mean(ys)
    let sxy = 0, sxx = 0, syy = 0
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2 }
    return sxy / Math.sqrt(sxx * syy)
}

async function prices(): Promise<void> {
    const save = await world()
    const byId = new Map(save.players.map(p => [p.id, p]))
    const ps = save.players.filter(p => !p.isRetired && (DRAFT_ROLES as readonly string[]).includes(p.role ?? ''))
        .map(p => ({ p, ovr: ovrOf(p), price: draftPrice(ovrOf(p)) }))
        .filter(x => x.price <= 60)
    console.log(JSON.stringify({ draftable: ps.length, corrPriceVsOvr: +corr(ps.map(x => x.ovr), ps.map(x => x.price)).toFixed(3) }))
    const byOvr = new Map<number, number[]>()
    for (const x of ps) { const k = Math.floor(x.ovr / 4) * 4; byOvr.set(k, [...(byOvr.get(k) ?? []), x.price]) }
    console.table([...byOvr.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ ovr: `${k}-${k + 3}`, players: v.length, minPrice: Math.min(...v), meanPrice: +mean(v).toFixed(1), maxPrice: Math.max(...v) })))
    // Same OVR, different price: the widest spreads.
    const sameOvr = new Map<number, typeof ps>()
    for (const x of ps) sameOvr.set(x.ovr, [...(sameOvr.get(x.ovr) ?? []), x])
    const spreads = [...sameOvr.entries()].map(([ovr, xs]) => ({ ovr, players: xs.length, priceSpread: Math.max(...xs.map(x => x.price)) - Math.min(...xs.map(x => x.price)) })).filter(s => s.players >= 5).sort((a, b) => a.ovr - b.ovr)
    console.table(spreads)
    // The bands by team OVR and by duel.
    const ranked = save.teams.map(t => ({ t, s: clubStrength(t, byId as never) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)
    for (const d of DRAFT_CUP_DIFFICULTIES) {
        const band = ranked.slice(...DRAFT_CUP_DIFFICULTY[d].band)
        console.log(d, { clubs: band.length, meanOvr: +mean(band.map(x => x.s)).toFixed(1), ovrRange: [Math.min(...band.map(x => x.s)).toFixed(1), Math.max(...band.map(x => x.s)).toFixed(1)] })
    }
}

const cmd = process.argv[2]
if (cmd === 'prices') prices()
else if (cmd === 'cups') cups()
else if (cmd === 'report') report(process.argv.slice(3).filter(a => !a.startsWith('--')))
else console.error('usage: prices | cups | report <files>')
