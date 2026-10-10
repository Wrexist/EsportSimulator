/**
 * Metric accumulators for the calibration harness. They read only the
 * public MatchResult shape (rounds, events, buys, playerStats), so they
 * measure any engine that fills it in.
 *
 * Definitions follow the 2026-10-09 audit harness
 * (tmp/audit-2026-10-09/sim/run-realism.ts, run-players.ts) so numbers stay
 * comparable with the audit and Phase 0 tables.
 */

import type { MatchEvent, MatchResult, RoundResult } from '@/types'
import type { BuiltSide } from './fixtures'
import type { EffectStats } from './targets'

// ─── Small statistics helpers ──────────────────────────────────────────────

class Ratio {
    hit = 0
    n = 0
    add(hit: boolean): void { this.n++; if (hit) this.hit++ }
    pct(): number | null { return this.n ? (100 * this.hit) / this.n : null }
}

export const mean = (values: readonly number[]): number | null => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null)

/** Mean and 95% confidence half-width (normal approximation). */
export function meanCi(values: readonly number[]): { mean: number; ci: number } {
    const n = values.length
    if (!n) return { mean: NaN, ci: NaN }
    const m = values.reduce((s, v) => s + v, 0) / n
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, n - 1))
    return { mean: m, ci: (1.96 * sd) / Math.sqrt(n) }
}

const killEvents = (r: RoundResult): MatchEvent[] => (r.events ?? []).filter(e => e.type === 'KILL').sort((a, b) => a.time - b.time)

// ─── Integrity ─────────────────────────────────────────────────────────────

const ROUND_CLOCK = 115
const BOMB_TIMER = 40

/**
 * Every CS rule a round breaks, as readable strings. Port of the audit's
 * checkRound and __tests__/round-timeline-consistency.test.ts.
 */
export function roundViolations(r: RoundResult, homeIds: Set<string>, homeId: string): string[] {
    const out: string[] = []
    const ev = r.events ?? []
    const endEv = ev.find(e => e.type === 'ROUND_END')
    const plant = ev.find(e => e.type === 'PLANT')
    const defuse = ev.find(e => e.type === 'DEFUSE')
    const explode = ev.find(e => e.type === 'EXPLODE')
    const kills = ev.filter(e => e.type === 'KILL')
    if (!endEv || ev[ev.length - 1] !== endEv) out.push('ROUND_END is not the last event')
    for (let i = 1; i < ev.length; i++) if (ev[i].time < ev[i - 1].time) { out.push('events out of time order'); break }
    if (ev.filter(e => e.type === 'PLANT').length > 1) out.push('more than one plant')
    const dead = new Set<string>()
    let homeKills = 0, awayKills = 0
    for (const e of ev) {
        if (!Number.isFinite(e.time)) out.push('NaN event time')
        if (e.type !== 'KILL') continue
        if (!e.playerId || !e.victimId) { out.push('kill without killer or victim'); continue }
        if (dead.has(e.playerId)) out.push('dead player got a kill')
        if (dead.has(e.victimId)) out.push('dead player killed again')
        dead.add(e.victimId)
        if (homeIds.has(e.playerId) === homeIds.has(e.victimId)) out.push('same-side kill')
        if (homeIds.has(e.playerId)) homeKills++; else awayKills++
        if ((!plant || e.time < plant.time) && e.time > ROUND_CLOCK) out.push('pre-plant kill after the 1:55 round clock')
        if (plant && e.time >= plant.time + BOMB_TIMER) out.push('kill at/after the bomb exploded')
        if (defuse && e.time > defuse.time) out.push('kill after the defuse')
    }
    if (homeKills > 5 || awayKills > 5) out.push('more than 5 kills by one team')
    const winnerHome = r.winningTeamId === homeId
    const winnersDead = kills.filter(e => homeIds.has(e.victimId!) === winnerHome).length
    const losersDead = kills.length - winnersDead
    const ctWon = r.winner === 'ct'
    const tDead = ctWon ? losersDead : winnersDead
    const ctDead = ctWon ? winnersDead : losersDead
    if (winnersDead >= 5) out.push('round winner fully eliminated')
    if (r.winType === 'ELIMINATION' && losersDead < 5) out.push('ELIMINATION win with loser survivors')
    if (r.winType === 'ELIMINATION' && ctWon && plant) out.push('CT elimination win after a plant (must defuse)')
    if (r.winType === 'TIME' && !ctWon) out.push('TIME win for T')
    if (r.winType === 'TIME' && tDead >= 5) out.push('TIME win although all Ts dead')
    if (r.winType === 'TIME' && plant) out.push('TIME win after a plant')
    if (r.winType === 'BOMB_DEFUSE' && (!plant || !defuse)) out.push('defuse win without plant + DEFUSE')
    if (r.winType === 'BOMB_EXPLODED' && (!plant || !explode)) out.push('explosion win without plant + EXPLODE')
    if (r.winType === 'BOMB_EXPLODED' && ctDead >= 5) out.push('BOMB_EXPLODED though all CTs dead')
    if (explode && r.winType !== 'BOMB_EXPLODED') out.push('EXPLODE event in a non-explosion round')
    if (defuse && r.winType !== 'BOMB_DEFUSE') out.push('DEFUSE event in a non-defuse round')
    if (plant && defuse && (defuse.time >= plant.time + BOMB_TIMER || defuse.time < plant.time)) out.push('defuse outside the bomb timer')
    if (plant && explode && Math.abs(explode.time - plant.time - BOMB_TIMER) > 0.01) out.push('explode not at plant + 40 s')
    if (plant && plant.time > ROUND_CLOCK) out.push('plant after the 1:55 round clock')
    const clutch = ev.find(e => e.type === 'CLUTCH')
    if (clutch && (!clutch.playerId || dead.has(clutch.playerId) || homeIds.has(clutch.playerId) !== winnerHome)) out.push('CLUTCH by a dead or losing player')
    if (clutch && winnersDead !== 4) out.push('CLUTCH without a lone survivor')
    if (r.kills.reduce((s, k) => s + k.kills, 0) !== kills.length) out.push('kills[] total != KILL events')
    return out
}

/** Series-level rules: round numbering, map scores, overtime entry, winners, finite player stats. */
export function seriesViolations(result: MatchResult, home: BuiltSide, away: BuiltSide): string[] {
    const out: string[] = []
    const homeId = home.team.id
    let homeMaps = 0, awayMaps = 0
    const killsBy = new Map<string, number>(), deathsBy = new Map<string, number>()
    for (const m of result.maps) {
        const n = m.rounds.length
        if (m.rounds.some((r, i) => r.roundNumber !== i + 1)) out.push('round numbers not 1..n')
        const hs = m.rounds.filter(r => r.winningTeamId === homeId).length
        const as = n - hs
        if (m.homeScore !== undefined && (m.homeScore !== hs || m.awayScore !== as)) out.push('map score != rounds won')
        if (Math.max(hs, as) < 13) out.push('map ended below 13')
        if (n <= 24 && !(Math.max(hs, as) === 13 && Math.min(hs, as) <= 11)) out.push('regulation map not won 13-x (x ≤ 11)')
        if (n > 24) {
            const at24 = m.rounds.slice(0, 24).filter(r => r.winningTeamId === homeId).length
            if (at24 !== 12) out.push('overtime without 12-12')
        }
        if (m.winner && m.winner !== (hs > as ? homeId : away.team.id)) out.push('map winner != more rounds')
        if (hs > as) homeMaps++; else awayMaps++
        for (const r of m.rounds) for (const e of r.events ?? []) {
            if (e.type !== 'KILL') continue
            killsBy.set(e.playerId!, (killsBy.get(e.playerId!) ?? 0) + 1)
            deathsBy.set(e.victimId!, (deathsBy.get(e.victimId!) ?? 0) + 1)
        }
    }
    if (result.winnerId !== (homeMaps > awayMaps ? homeId : away.team.id)) out.push('series winner != more maps')
    for (const p of [...home.players, ...away.players]) {
        const s = result.playerStats[p.id]
        if (!s) { out.push('missing player stats'); continue }
        if (![s.kills, s.deaths, s.assists, s.adr, s.kast, s.rating].every(Number.isFinite)) out.push('non-finite player stat')
        if (s.kast < 0 || s.kast > 100 || s.rating < 0 || s.adr < 0) out.push('player stat out of range')
        if (s.kills !== (killsBy.get(p.id) ?? 0)) out.push('player kills != KILL events')
        if (s.deaths !== (deathsBy.get(p.id) ?? 0)) out.push('player deaths != KILL events')
    }
    return out
}

// ─── Clutch detection ──────────────────────────────────────────────────────

/**
 * 1vX situations in one round: the first moment a side is down to one
 * player while the other side still has someone alive. Both sides can be in
 * one (a 1v2 that becomes a 1v1). `won` = that side won the round.
 */
export function clutchSituations(kills: readonly MatchEvent[], homeIds: Set<string>, homeWon: boolean): { side: 'home' | 'away'; enemies: number; won: boolean }[] {
    let homeAlive = 5, awayAlive = 5
    const out: { side: 'home' | 'away'; enemies: number; won: boolean }[] = []
    let homeSeen = false, awaySeen = false
    for (const e of kills) {
        if (homeIds.has(e.victimId!)) homeAlive--; else awayAlive--
        if (!homeSeen && homeAlive === 1 && awayAlive >= 1) { homeSeen = true; out.push({ side: 'home', enemies: awayAlive, won: homeWon }) }
        if (!awaySeen && awayAlive === 1 && homeAlive >= 1) { awaySeen = true; out.push({ side: 'away', enemies: homeAlive, won: !homeWon }) }
    }
    return out
}

// ─── Realism (score shape, economy, fights, clutches, win reasons, roles) ─

export class RealismAccumulator {
    maps = 0
    private roundCounts: number[] = []
    private ot = 0
    private loserLe3 = 0
    private afterWin = new Ratio()
    private pistolR2 = new Ratio()
    private pistolR2R3 = new Ratio()
    private ctWin = new Ratio()
    private buyVsFull = new Map<string, Ratio>()
    private rounds = 0
    private kills = 0
    private trades = 0
    private headshots = 0
    private clutch = new Ratio()
    private k4 = 0
    private aces = 0
    private ctReasons = new Map<string, number>()
    private tReasons = new Map<string, number>()
    private openings = new Map<string, number>()
    private kpr: number[] = []
    private adr: number[] = []
    private kast: number[] = []
    private rating: number[] = []
    readonly violations = new Map<string, number>()

    add(result: MatchResult, home: BuiltSide, away: BuiltSide): void {
        const homeId = home.team.id
        const homeIds = new Set(home.players.map(p => p.id))
        const roleOf = new Map([...home.players, ...away.players].map(p => [p.id, String(p.role)]))
        const flag = (v: string) => this.violations.set(v, (this.violations.get(v) ?? 0) + 1)
        seriesViolations(result, home, away).forEach(flag)
        let seriesRounds = 0
        for (const m of result.maps) {
            const rs = m.rounds
            this.maps++
            seriesRounds += rs.length
            this.roundCounts.push(rs.length)
            if (rs.length > 24) this.ot++
            const hs = rs.filter(r => r.winningTeamId === homeId).length
            if (Math.min(hs, rs.length - hs) <= 3) this.loserLe3++
            // Same half only: skip the first round of the second half and overtime.
            for (let i = 1; i < Math.min(24, rs.length); i++) if (i !== 12) this.afterWin.add(rs[i].winningTeamId === rs[i - 1].winningTeamId)
            for (const start of [0, 12]) {
                if (!rs[start + 2]) continue
                const r2 = rs[start + 1].winningTeamId === rs[start].winningTeamId
                const r3 = rs[start + 2].winningTeamId === rs[start].winningTeamId
                this.pistolR2.add(r2)
                this.pistolR2R3.add(r2 && r3)
            }
            for (const r of rs) this.addRound(r, homeId, homeIds, roleOf, flag)
        }
        for (const p of [...home.players, ...away.players]) {
            const s = result.playerStats[p.id]
            if (!s || !seriesRounds) continue
            this.kpr.push(s.kills / seriesRounds)
            this.adr.push(s.adr)
            this.kast.push(s.kast)
            this.rating.push(s.rating)
        }
    }

    private addRound(r: RoundResult, homeId: string, homeIds: Set<string>, roleOf: Map<string, string>, flag: (v: string) => void): void {
        this.rounds++
        roundViolations(r, homeIds, homeId).forEach(flag)
        const homeWon = r.winningTeamId === homeId
        this.ctWin.add(r.winner === 'ct')
        const reasons = r.winner === 'ct' ? this.ctReasons : this.tReasons
        reasons.set(r.winType, (reasons.get(r.winType) ?? 0) + 1)
        if (r.buys) {
            for (const [mine, theirs, won] of [[r.buys.home, r.buys.away, homeWon], [r.buys.away, r.buys.home, !homeWon]] as const) {
                if (theirs !== 'FULL') continue
                const ratio = this.buyVsFull.get(mine) ?? new Ratio()
                ratio.add(won)
                this.buyVsFull.set(mine, ratio)
            }
        }
        const kills = killEvents(r)
        this.kills += kills.length
        const perPlayer = new Map<string, number>()
        for (const e of kills) {
            if (e.isTrade) this.trades++
            if (e.isHeadshot) this.headshots++
            perPlayer.set(e.playerId!, (perPlayer.get(e.playerId!) ?? 0) + 1)
        }
        for (const n of perPlayer.values()) { if (n === 4) this.k4++; if (n >= 5) this.aces++ }
        if (kills.length) {
            const role = roleOf.get(kills[0].playerId!) ?? 'UNKNOWN'
            this.openings.set(role, (this.openings.get(role) ?? 0) + 1)
        }
        for (const c of clutchSituations(kills, homeIds, homeWon)) this.clutch.add(c.won)
    }

    values(): Record<string, number | null> {
        const ctTotal = [...this.ctReasons.values()].reduce((s, v) => s + v, 0)
        const tTotal = [...this.tReasons.values()].reduce((s, v) => s + v, 0)
        const share = (map: Map<string, number>, total: number, ...keys: string[]) => (total ? (100 * keys.reduce((s, k) => s + (map.get(k) ?? 0), 0)) / total : null)
        const openingTotal = [...this.openings.values()].reduce((s, v) => s + v, 0)
        const opening = (role: string) => (openingTotal ? (100 * (this.openings.get(role) ?? 0)) / openingTotal : null)
        const entry = opening('ENTRY_FRAGGER'), awper = opening('AWPER')
        const others = ['IGL', 'SUPPORT', 'RIFLER'].map(opening).filter((v): v is number => v !== null)
        const perMap = (n: number) => (this.maps ? n / this.maps : null)
        return {
            rounds_per_map: mean(this.roundCounts),
            ot_rate: this.maps ? (100 * this.ot) / this.maps : null,
            loser_le3_share: this.maps ? (100 * this.loserLe3) / this.maps : null,
            win_after_win: this.afterWin.pct(),
            pistol_conv_r2: this.pistolR2.pct(),
            pistol_conv_r2r3: this.pistolR2R3.pct(),
            ct_round_win: this.ctWin.pct(),
            eco_vs_full: this.buyVsFull.get('ECO')?.pct() ?? null,
            force_vs_full: this.buyVsFull.get('FORCE')?.pct() ?? null,
            half_vs_full: this.buyVsFull.get('SEMIBUY')?.pct() ?? null,
            kills_per_round: this.rounds ? this.kills / this.rounds : null,
            kpr_mean: mean(this.kpr),
            adr_mean: mean(this.adr),
            kast_mean: mean(this.kast),
            rating_mean: mean(this.rating),
            trade_share: this.kills ? (100 * this.trades) / this.kills : null,
            headshot_pct: this.kills ? (100 * this.headshots) / this.kills : null,
            clutch_situations_per_map: perMap(this.clutch.n),
            clutch_conversion: this.clutch.pct(),
            clutches_won_per_map: perMap(this.clutch.hit),
            k4_per_map: perMap(this.k4),
            ace_per_map: perMap(this.aces),
            ct_win_elim: share(this.ctReasons, ctTotal, 'ELIMINATION'),
            ct_win_defuse: share(this.ctReasons, ctTotal, 'BOMB_DEFUSE'),
            ct_win_time: share(this.ctReasons, ctTotal, 'TIME'),
            t_win_elim: share(this.tReasons, tTotal, 'ELIMINATION'),
            t_win_bomb: share(this.tReasons, tTotal, 'BOMB_EXPLODED'),
            opening_share_entry: entry,
            opening_share_awper: awper,
            opening_role_gap: entry !== null && awper !== null && others.length ? Math.min(entry, awper) - Math.max(...others) : null,
            impossible_states: [...this.violations.values()].reduce((s, v) => s + v, 0),
        }
    }

    /** Sample sizes behind the rate metrics (shown as n in the report). */
    sizes(): Record<string, number> {
        const n = (r?: Ratio) => r?.n ?? 0
        return {
            rounds_per_map: this.maps, ot_rate: this.maps, loser_le3_share: this.maps,
            win_after_win: this.afterWin.n, pistol_conv_r2: this.pistolR2.n, pistol_conv_r2r3: this.pistolR2R3.n,
            ct_round_win: this.ctWin.n, eco_vs_full: n(this.buyVsFull.get('ECO')), force_vs_full: n(this.buyVsFull.get('FORCE')),
            half_vs_full: n(this.buyVsFull.get('SEMIBUY')), kills_per_round: this.rounds, trade_share: this.kills, headshot_pct: this.kills,
            clutch_conversion: this.clutch.n, kpr_mean: this.kpr.length, adr_mean: this.adr.length, kast_mean: this.kast.length, rating_mean: this.rating.length,
        }
    }
}

// ─── Skill curve (paired managed / AI path) ───────────────────────────────

export class SkillCurveAccumulator {
    private byGap = new Map<number, { managed: Ratio; ai: Ratio }>()
    private roundsManaged: number[] = []
    private roundsAi: number[] = []

    add(gap: number, path: 'managed' | 'ai', result: MatchResult, favId: string): void {
        const g = this.byGap.get(gap) ?? { managed: new Ratio(), ai: new Ratio() }
        this.byGap.set(gap, g)
        g[path].add(result.winnerId === favId)
        const rounds = result.maps.reduce((s, m) => s + m.rounds.length, 0)
        ;(path === 'managed' ? this.roundsManaged : this.roundsAi).push(rounds)
    }

    /** Favourite map-win % per gap, both paths pooled. */
    curve(): { gap: number; favWin: number | null; managed: number | null; ai: number | null; n: number }[] {
        return [...this.byGap.entries()].sort((a, b) => a[0] - b[0]).map(([gap, g]) => {
            const n = g.managed.n + g.ai.n
            return { gap, favWin: n ? (100 * (g.managed.hit + g.ai.hit)) / n : null, managed: g.managed.pct(), ai: g.ai.pct(), n }
        })
    }

    values(): Record<string, number | null> {
        const curve = this.curve()
        const out: Record<string, number | null> = {}
        for (const c of curve) out[`fav_win_gap_${c.gap}`] = c.favWin
        let maxDrop = 0
        for (let i = 1; i < curve.length; i++) {
            const a = curve[i - 1].favWin, b = curve[i].favWin
            if (a !== null && b !== null) maxDrop = Math.max(maxDrop, a - b)
        }
        out.fav_curve_max_drop = curve.length > 1 ? maxDrop : null
        const diffs = curve.filter(c => c.managed !== null && c.ai !== null).map(c => c.managed! - c.ai!)
        out.path_parity_fav_win = mean(diffs)
        const rm = mean(this.roundsManaged), ra = mean(this.roundsAi)
        out.path_parity_rounds = rm !== null && ra !== null ? rm - ra : null
        return out
    }
}

// ─── Star impact ───────────────────────────────────────────────────────────

export class StarAccumulator {
    private starKills = 0
    private teamKills = 0
    private starRating: number[] = []
    private mateRating: number[] = []

    add(result: MatchResult, starId: string, teammates: readonly string[]): void {
        const star = result.playerStats[starId]
        const mates = teammates.map(id => result.playerStats[id]).filter(Boolean)
        if (!star || mates.length !== teammates.length) return
        this.starKills += star.kills
        this.teamKills += star.kills + mates.reduce((s, m) => s + m.kills, 0)
        this.starRating.push(star.rating)
        this.mateRating.push(mates.reduce((s, m) => s + m.rating, 0) / mates.length)
    }

    values(): Record<string, number | null> {
        const star = mean(this.starRating), mates = mean(this.mateRating)
        return {
            star_kill_share: this.teamKills ? (100 * this.starKills) / this.teamKills : null,
            star_rating_ratio: star !== null && mates ? star / mates : null,
        }
    }
}

// ─── Paired effects (manager agency, non-player cap) ──────────────────────

export interface SeriesOutcome {
    win: number
    roundShare: number
    /** Round winners, for "identical to baseline" detection. */
    signature: string
}

export function seriesOutcome(result: MatchResult, teamId: string): SeriesOutcome {
    let own = 0, total = 0
    const sig: string[] = []
    for (const m of result.maps) {
        let s = ''
        for (const r of m.rounds) { total++; const mine = r.winningTeamId === teamId; if (mine) own++; s += mine ? '1' : '0' }
        sig.push(s)
    }
    return { win: result.winnerId === teamId ? 1 : 0, roundShare: total ? own / total : 0, signature: sig.join('|') }
}

export class PairedEffect {
    private dWin: number[] = []
    private dShare: number[] = []
    private identical = true

    add(baseline: SeriesOutcome, variant: SeriesOutcome): void {
        this.dWin.push(variant.win - baseline.win)
        this.dShare.push(variant.roundShare - baseline.roundShare)
        if (variant.signature !== baseline.signature) this.identical = false
    }

    get n(): number { return this.dWin.length }

    stats(): EffectStats | null {
        if (!this.dWin.length) return null
        const w = meanCi(this.dWin), s = meanCi(this.dShare)
        return { mapWin: 100 * w.mean, mapWinCi: 100 * w.ci, roundShare: 100 * s.mean, roundShareCi: 100 * s.ci, identical: this.identical }
    }
}
