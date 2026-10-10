/**
 * Calibration harness for the match engine (Phase 2B, item H).
 *
 *   runCalibration({ engine: 'legacy-v2', samples: 600, seed: 20261010 })
 *
 * Builds synthetic teams (./fixtures.ts), plays seeded BO1 maps through the
 * PRODUCTION series paths, and scores every metric in ./targets.ts against
 * the pro-CS2 table. Pure and deterministic for a given engine, sample size
 * and seed (only the timing metric varies). CLI: scripts/calibrate-engine.ts.
 * Fast gate: __tests__/calibration-gate.test.ts.
 *
 * ── ENGINE SELECTION (the one function to wire) ───────────────────────────
 * `seriesRunnerFor(engine)` below is the only place the harness picks an
 * engine. Both engines run through the same production entry points:
 *
 *   managed path  prepareLegacySeries → runLegacySeries → finalizeLegacySeries
 *                 (the player's own match: instant sim, live, skip)
 *   AI path       MatchEngine.simulateMatch (week ticks, tournaments)
 *
 * with the match stamped `engineVersion: <engine>`, exactly as a new match
 * would be. An engine counts as available when
 * `isMatchEngineRunnable(engine)` (engine/match/engine-registry.ts) says so;
 * otherwise the report says "not available" and nothing is simulated.
 *
 * To measure script-v1: make createSeriesContext accept
 * `engineVersion: 'script-v1'` and flip RUNNABLE['script-v1'] in the
 * registry. If script-v1 gets its own series runner instead of plugging into
 * the legacy one, return it from `seriesRunnerFor` — nothing else here needs
 * to change, the metrics read only the public MatchResult shape.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Suites (sizes scale with `samples`)
 *   realism  equal 70 v 70 teams, roles AWP/IGL/entry/support/rifler,
 *            `samples` maps alternating managed / AI path
 *   skill    favourite vs underdog at +3/+6/+10/+15/+25 skill, samples/3
 *            seeds per gap, each seed on both paths; the same seeds at every
 *            gap (common random numbers) so the curve is smooth
 *   star     90 + 4×65 (average 70) vs 5×70, samples/3 maps
 *   agency   managed team decisions vs an even baseline (opponent plays
 *            "balanced"), samples/2 paired seeds per decision
 *   cap      non-player bonus ceiling on both paths, samples/2 paired seeds
 */

import type { MapId, MatchResult } from '@/types'
import type { MatchSaveData, PlayerSaveData, StaffSaveData, TeamSaveData } from '@/engine/save-types'
import { ACTIVE_MAP_POOL } from '@/data/map-pool'
import { MatchEngine } from '../../match-engine'
import { SeededRNG, deriveSeed } from '../../rng'
import { prepareLegacySeries } from '../legacy-prepare'
import { finalizeLegacySeries, runLegacySeries, type LegacyDecisionPolicy } from '../legacy-series'
import { isMatchEngineRunnable, type MatchEngineId } from '../engine-registry'
import { ALL_RIFLERS, ROLES5, buildSide, even, type BuiltSide, type SideSpec } from './fixtures'
import { PairedEffect, RealismAccumulator, SkillCurveAccumulator, StarAccumulator, seriesOutcome, type SeriesOutcome } from './metrics'
import {
    CALIBRATION_TARGETS, describeTarget, evaluateBand, evaluateEffect,
    type CalibrationTarget, type EffectStats, type MetricGroup, type Status, type SuiteId,
} from './targets'

export const CALIBRATION_HARNESS_VERSION = 1

// ─── Engine selection ──────────────────────────────────────────────────────

export interface SeriesInput {
    /** Match id; mixed into every round seed, so paired arms share it. */
    id: string
    seed: number
    map: MapId
    home: BuiltSide
    away: BuiltSide
    /** Managed path: the manager's team (gets `policy`). Default: nobody. */
    managedTeamId?: string
    policy?: LegacyDecisionPolicy
    /** AI path: caller tactical bonus in Coach.tacticBonus units (what tournaments pass). */
    homeBonus?: number
    awayBonus?: number
}

export interface SeriesRunner {
    engine: MatchEngineId
    managed(input: SeriesInput): MatchResult
    ai(input: SeriesInput): MatchResult
}

/** THE engine switch (see the module comment). Null = not available yet. */
export function seriesRunnerFor(engine: MatchEngineId): SeriesRunner | null {
    if (!isMatchEngineRunnable(engine)) return null
    return productionRunner(engine)
}

function productionRunner(engine: MatchEngineId): SeriesRunner {
    const aiEngine = new MatchEngine()
    return {
        engine,
        managed(input) {
            const ctx = prepareLegacySeries({
                match: { id: input.id, seed: input.seed, format: 'BO1', maps: [input.map], engineVersion: engine },
                homeTeam: input.home.team,
                awayTeam: input.away.team,
                homePlayers: input.home.players,
                awayPlayers: input.away.players,
                staff: [...input.home.staff, ...input.away.staff],
                managedTeamId: input.managedTeamId ?? 'nobody',
            })
            return finalizeLegacySeries(ctx, runLegacySeries(ctx, input.policy).state)
        },
        ai(input) {
            const match = { id: input.id, homeTeamId: input.home.team.id, awayTeamId: input.away.team.id, format: 'BO1', seed: input.seed, maps: [input.map], engineVersion: engine }
            return aiEngine.simulateMatch(
                match as unknown as MatchSaveData,
                input.home.team as unknown as TeamSaveData,
                input.away.team as unknown as TeamSaveData,
                input.home.players as unknown as PlayerSaveData[],
                input.away.players as unknown as PlayerSaveData[],
                new SeededRNG(input.seed),
                input.homeBonus ?? 0,
                input.awayBonus ?? 0,
                input.home.staff as unknown as StaffSaveData[],
                input.away.staff as unknown as StaffSaveData[],
            )
        },
    }
}

// ─── Options and report ────────────────────────────────────────────────────

export interface CalibrationOptions {
    engine: MatchEngineId
    /** Realism sample in maps; the other suites scale from it (see the module comment). */
    samples: number
    seed: number
    /** Metric ids, `prefix*` patterns or group names; default all. Suites no selected metric needs are skipped. */
    metrics?: readonly string[]
    onProgress?: (suite: SuiteId, done: number, total: number) => void
}

export interface MetricResult {
    id: string
    label: string
    group: MetricGroup
    unit: CalibrationTarget['unit']
    value: number | null
    /** 95% CI half-width, when the metric is a paired effect. */
    ci?: number
    /** Sample size behind a rate. */
    n?: number
    /** Extra context (effects: round-share delta and why it warned/failed). */
    detail?: string
    target: string
    source: string
    approximate: boolean
    status: Status
}

export interface SkillCurvePoint { gap: number; favWin: number | null; managed: number | null; ai: number | null; n: number }

export interface CalibrationReport {
    harnessVersion: number
    engine: MatchEngineId
    available: boolean
    reason?: string
    samples: number
    seed: number
    suites: Partial<Record<SuiteId, number>>
    mapsSimulated: number
    durationMs: number
    metrics: MetricResult[]
    skillCurve: SkillCurvePoint[]
    violations: Record<string, number>
    summary: Record<Status, number>
}

/** Resolve a metric filter to targets (exact id, `prefix*`, or group name). */
export function selectTargets(filter?: readonly string[]): CalibrationTarget[] {
    if (!filter?.length) return [...CALIBRATION_TARGETS]
    const picked = new Set<CalibrationTarget>()
    for (const raw of filter) {
        const token = raw.trim()
        if (!token) continue
        const hits = CALIBRATION_TARGETS.filter(t => token.endsWith('*') ? t.id.startsWith(token.slice(0, -1)) : t.id === token || t.group === token)
        if (!hits.length) throw Error(`Unknown calibration metric "${token}". Known: ${CALIBRATION_TARGETS.map(t => t.id).join(', ')}`)
        hits.forEach(t => picked.add(t))
    }
    return CALIBRATION_TARGETS.filter(t => picked.has(t))
}

export function suiteSizes(samples: number): Record<SuiteId, number> {
    const n = Math.max(1, Math.floor(samples))
    return { realism: n, skill: Math.ceil(n / 3), star: Math.ceil(n / 3), agency: Math.ceil(n / 2), cap: Math.ceil(n / 2) }
}

// ─── Suites ────────────────────────────────────────────────────────────────

const BASE_SKILL = 70
export const SKILL_GAPS = [3, 6, 10, 15, 25] as const
const AI_OVER_CAP_BONUS = 25

const timeoutOnStreak: LegacyDecisionPolicy = v => (v.ownLossStreak >= 3 && v.timeoutsRemaining > 0 && !v.regroupActive ? { callTimeout: true } : undefined)
const forceAfterPistolLoss: LegacyDecisionPolicy = v => (!v.isOvertime && (v.round === 2 || v.round === 14) && v.ownLossStreak === 1 ? { strategy: 'FORCE' } : undefined)
const ecoEveryRound: LegacyDecisionPolicy = v => (v.pistolRound ? undefined : { strategy: 'ECO' })

interface Decision {
    id: string
    /** Baseline change for this decision only (default: the even baseline). */
    baseline?: Partial<SideSpec>
    /** The decision itself, applied on top of the baseline. */
    variant?: Partial<SideSpec>
    policy?: LegacyDecisionPolicy
}

const DECISIONS: readonly Decision[] = [
    { id: 'agency_playstyle_counter', variant: { playstyle: 'structured' } },
    { id: 'agency_vod_prep', variant: { tacticalPrep: 25 } },
    { id: 'agency_timeout', policy: timeoutOnStreak },
    { id: 'agency_buy_force_r2', policy: forceAfterPistolLoss },
    { id: 'agency_buy_eco_control', policy: ecoEveryRound },
    { id: 'agency_roles', baseline: { roles: ALL_RIFLERS }, variant: { roles: ROLES5 } },
]
const CAP_MANAGED: Decision = { id: 'nonplayer_cap_managed', variant: { staff: { coach: 5, analyst: 5, psychologist: 5 }, playstyle: 'structured' } }

const HOME: SideSpec = { id: 'HOME', skills: even(BASE_SKILL) }
const AWAY_BALANCED: SideSpec = { id: 'AWAY', skills: even(BASE_SKILL), playstyle: 'balanced' }

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

class Session {
    maps = 0
    simMs = 0
    readonly realism = new RealismAccumulator()
    readonly skill = new SkillCurveAccumulator()
    readonly star = new StarAccumulator()
    readonly effects = new Map<string, PairedEffect>()
    realismMs = 0

    constructor(readonly runner: SeriesRunner, readonly opts: CalibrationOptions, readonly sizes: Record<SuiteId, number>) {}

    private mapFor(i: number): MapId { return ACTIVE_MAP_POOL[i % ACTIVE_MAP_POOL.length] }
    private seedFor(suite: string, i: number): number { return deriveSeed(this.opts.seed, 'calibration', suite, i) }

    /** Progress callback for one suite: call the returned function once per unit of work. */
    private ticker(suite: SuiteId, total: number): () => void {
        let done = 0
        return () => this.opts.onProgress?.(suite, ++done, total)
    }

    private play(path: 'managed' | 'ai', input: SeriesInput): MatchResult {
        const t0 = now()
        const result = path === 'managed' ? this.runner.managed(input) : this.runner.ai(input)
        this.simMs += now() - t0
        this.maps++
        return result
    }

    runRealism(): void {
        const n = this.sizes.realism
        const tick = this.ticker('realism', n)
        const home = buildSide({ id: 'HOME', skills: even(BASE_SKILL) })
        const away = buildSide({ id: 'AWAY', skills: even(BASE_SKILL) })
        const t0 = this.simMs
        for (let i = 0; i < n; i++) {
            const input = { id: `cal-realism-${i}`, seed: this.seedFor('realism', i), map: this.mapFor(i), home, away }
            this.realism.add(this.play(i % 2 === 0 ? 'managed' : 'ai', input), home, away)
            tick()
        }
        this.realismMs = (this.simMs - t0) / n
    }

    runSkill(): void {
        const n = this.sizes.skill
        const tick = this.ticker('skill', n * SKILL_GAPS.length)
        for (const gap of SKILL_GAPS) {
            const fav = buildSide({ id: 'FAV', skills: even(BASE_SKILL + gap / 2) })
            const dog = buildSide({ id: 'DOG', skills: even(BASE_SKILL - gap / 2) })
            for (let i = 0; i < n; i++) {
                const favHome = i % 2 === 0
                const input = { id: `cal-skill-${i}`, seed: this.seedFor('skill', i), map: this.mapFor(i), home: favHome ? fav : dog, away: favHome ? dog : fav }
                this.skill.add(gap, 'managed', this.play('managed', input), 'FAV')
                this.skill.add(gap, 'ai', this.play('ai', input), 'FAV')
                tick()
            }
        }
    }

    runStar(): void {
        const n = this.sizes.star
        const tick = this.ticker('star', n)
        const star = buildSide({ id: 'STAR', skills: [90, 65, 65, 65, 65], roles: ['RIFLER', 'AWPER', 'IGL', 'ENTRY_FRAGGER', 'SUPPORT'] })
        const opp = buildSide({ id: 'OPP', skills: even(BASE_SKILL) })
        const starId = star.players[0].id
        const mates = star.players.slice(1).map(p => p.id)
        for (let i = 0; i < n; i++) {
            const starHome = i % 2 === 0
            const input = { id: `cal-star-${i}`, seed: this.seedFor('star', i), map: this.mapFor(i), home: starHome ? star : opp, away: starHome ? opp : star }
            this.star.add(this.play(Math.floor(i / 2) % 2 === 0 ? 'managed' : 'ai', input), starId, mates)
            tick()
        }
    }

    /** Baseline outcomes by (sample size, baseline spec), shared by every decision with that baseline. */
    private readonly baselines = new Map<string, SeriesOutcome[]>()

    runAgency(wanted: Set<string>): void {
        const decisions = DECISIONS.filter(d => wanted.has(d.id))
        this.runDecisions('agency', decisions, this.ticker('agency', decisions.length * this.sizes.agency))
    }

    /** Paired managed-path decisions against the even baseline (opponent plays "balanced"). */
    private runDecisions(suite: SuiteId, decisions: readonly Decision[], tick: () => void): void {
        const n = this.sizes[suite]
        const away = buildSide(AWAY_BALANCED)
        for (const d of decisions) {
            const baseSpec: SideSpec = { ...HOME, ...d.baseline }
            const key = `${n}:${JSON.stringify(baseSpec)}`
            const baseSide = buildSide(baseSpec)
            const variantSide = buildSide({ ...baseSpec, ...d.variant })
            let base = this.baselines.get(key)
            if (!base) {
                base = []
                for (let i = 0; i < n; i++) base.push(seriesOutcome(this.play('managed', this.decisionInput(i, baseSide, away)), 'HOME'))
                this.baselines.set(key, base)
            }
            const effect = new PairedEffect()
            for (let i = 0; i < n; i++) {
                const result = this.play('managed', { ...this.decisionInput(i, variantSide, away), policy: d.policy })
                effect.add(base[i], seriesOutcome(result, 'HOME'))
                tick()
            }
            this.effects.set(d.id, effect)
        }
    }

    private decisionInput(i: number, home: BuiltSide, away: BuiltSide): SeriesInput {
        return { id: `cal-decision-${i}`, seed: this.seedFor('decision', i), map: this.mapFor(i), home, away, managedTeamId: 'HOME' }
    }

    /** Non-player bonus ceiling: full level-5 staff + counter on the managed path, an over-cap caller bonus on the AI path. */
    runCap(wanted: Set<string>): void {
        const managed = wanted.has(CAP_MANAGED.id), ai = wanted.has('nonplayer_cap_ai')
        const n = this.sizes.cap
        const tick = this.ticker('cap', (managed ? n : 0) + (ai ? n : 0))
        if (managed) this.runDecisions('cap', [CAP_MANAGED], tick)
        if (!ai) return
        const home = buildSide(HOME), away = buildSide(AWAY_BALANCED)
        const effect = new PairedEffect()
        for (let i = 0; i < n; i++) {
            const input = this.decisionInput(i, home, away)
            const base = seriesOutcome(this.play('ai', input), 'HOME')
            const boosted = seriesOutcome(this.play('ai', { ...input, homeBonus: AI_OVER_CAP_BONUS }), 'HOME')
            effect.add(base, boosted)
            tick()
        }
        this.effects.set('nonplayer_cap_ai', effect)
    }
}

// ─── Entry point ───────────────────────────────────────────────────────────

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits
const DIGITS: Record<CalibrationTarget['unit'], number> = { '%': 1, rounds: 2, '/map': 2, '/round': 2, x: 2, pts: 1, ms: 2, count: 1, rating: 3 }

function emptySummary(): Record<Status, number> {
    return { pass: 0, warn: 0, fail: 0, 'n/a': 0, info: 0 }
}

export function runCalibration(options: CalibrationOptions): CalibrationReport {
    const targets = selectTargets(options.metrics)
    const wanted = new Set(targets.map(t => t.id))
    const needed = new Set(targets.map(t => t.suite))
    const sizes = suiteSizes(options.samples)
    const suites: Partial<Record<SuiteId, number>> = {}
    for (const s of Object.keys(sizes) as SuiteId[]) if (needed.has(s)) suites[s] = sizes[s]
    const base = { harnessVersion: CALIBRATION_HARNESS_VERSION, engine: options.engine, samples: sizes.realism, seed: options.seed, suites }

    const runner = seriesRunnerFor(options.engine)
    if (!runner) {
        const metrics = targets.map(t => toResult(t, null, 'n/a'))
        const summary = emptySummary()
        summary['n/a'] = metrics.length
        return {
            ...base, available: false, reason: `${options.engine} is not runnable yet (see engine/match/engine-registry.ts)`,
            mapsSimulated: 0, durationMs: 0, metrics, skillCurve: [], violations: {}, summary,
        }
    }

    const started = now()
    const session = new Session(runner, options, sizes)
    if (needed.has('realism')) session.runRealism()
    if (needed.has('skill')) session.runSkill()
    if (needed.has('star')) session.runStar()
    if (needed.has('agency')) session.runAgency(wanted)
    if (needed.has('cap')) session.runCap(wanted)

    const values: Record<string, number | null> = {
        ...(needed.has('realism') ? session.realism.values() : {}),
        ...(needed.has('skill') ? session.skill.values() : {}),
        ...(needed.has('star') ? session.star.values() : {}),
        ms_per_map: needed.has('realism') ? session.realismMs : null,
    }
    const sizesByMetric = needed.has('realism') ? session.realism.sizes() : {}

    const metrics = targets.map(t => {
        if (t.rule.kind === 'effect') {
            const effect = session.effects.get(t.id)
            const stats = effect?.stats() ?? null
            const { status, why } = evaluateEffect(stats, t.rule)
            return toResult(t, stats ? stats.mapWin : null, status, stats, effect?.n, why)
        }
        return toResult(t, values[t.id] ?? null, evaluateBand(values[t.id] ?? null, t.rule), null, sizesByMetric[t.id])
    })
    const summary = emptySummary()
    for (const m of metrics) summary[m.status]++

    return {
        ...base, available: true, mapsSimulated: session.maps, durationMs: Math.round(now() - started),
        metrics,
        skillCurve: needed.has('skill') ? session.skill.curve().map(c => ({ ...c, favWin: c.favWin === null ? null : round(c.favWin, 1), managed: c.managed === null ? null : round(c.managed, 1), ai: c.ai === null ? null : round(c.ai, 1) })) : [],
        violations: Object.fromEntries([...session.realism.violations.entries()].sort((a, b) => b[1] - a[1])),
        summary,
    }
}

function toResult(t: CalibrationTarget, value: number | null, status: Status, effect?: EffectStats | null, n?: number, why?: string): MetricResult {
    const digits = DIGITS[t.unit]
    const out: MetricResult = {
        id: t.id, label: t.label, group: t.group, unit: t.unit,
        value: value === null || !Number.isFinite(value) ? null : round(value, digits),
        target: describeTarget(t), source: t.source, approximate: t.approximate, status,
    }
    if (n !== undefined) out.n = n
    if (effect) {
        out.ci = round(effect.mapWinCi, 1)
        const share = `rounds ${effect.roundShare >= 0 ? '+' : ''}${effect.roundShare.toFixed(1)} ±${effect.roundShareCi.toFixed(1)} pp`
        out.detail = why ? `${share}; ${why}` : share
    }
    return out
}
