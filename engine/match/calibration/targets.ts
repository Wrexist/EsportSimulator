/**
 * Pro-level calibration targets for the match engine (Phase 2B, item H).
 *
 * One row per metric the harness (./run.ts) measures. Reference numbers are
 * approximate: the audit's benchmark table (docs/revamp/AUDIT_2026-10-09.md
 * §3a/§7) where it has one, otherwise an estimate from pro-match aggregates or a
 * design intent (skill curve, agency) that has no pro equivalent. The pass
 * band is what calibration aims for; the warn band is "close, keep an eye on
 * it"; anything outside the warn band fails.
 *
 * Rule kinds
 *   band     value must sit inside `pass` (else inside `warn`, else fail)
 *   effect   a paired manager-agency delta (map-win points): must be
 *            non-zero (95% CI excludes 0), point the expected way and stay
 *            within ±passAbs (±warnAbs for warn)
 *   info     reported only, never pass/fail (timing)
 */

export type SuiteId = 'realism' | 'skill' | 'star' | 'agency' | 'cap'
export type MetricGroup = 'score' | 'economy' | 'fights' | 'clutch' | 'bomb' | 'roles' | 'skill' | 'agency' | 'integrity' | 'performance'
export type Status = 'pass' | 'warn' | 'fail' | 'n/a' | 'info'

export interface Band { min?: number; max?: number }

export type TargetRule =
    | { kind: 'band'; pass: Band; warn: Band }
    | { kind: 'effect'; direction: 1 | -1 | 0; passAbs: number; warnAbs: number }
    | { kind: 'info' }

export interface CalibrationTarget {
    id: string
    label: string
    group: MetricGroup
    /** Simulation suite that produces the metric (lets a run skip suites nobody asked for). */
    suite: SuiteId
    /** Display unit: '%' values are 0–100. */
    unit: '%' | 'rounds' | '/map' | '/round' | 'x' | 'pts' | 'ms' | 'count' | 'rating'
    /** Reference shown in the report (pro-match data where known, else the design intent). */
    reference: string
    rule: TargetRule
    source: string
    approximate: boolean
}

export const GROUP_LABELS: Record<MetricGroup, string> = {
    score: 'Score shape (equal teams, BO1)',
    economy: 'Economy (round win % vs a full buy)',
    fights: 'Fights and player stats',
    clutch: 'Clutches and multi-kills',
    bomb: 'Win reasons',
    roles: 'Roles and stars',
    skill: 'Skill gap (favourite map win)',
    agency: 'Manager agency (paired, map-win points)',
    integrity: 'Integrity',
    performance: 'Performance',
}

const AUDIT = 'Audit 2026-10-09 §3a/§7 (pro matches, approx.)'
const ESTIMATE = 'Estimate from pro-match aggregates (approx., unverified)'
const DESIGN = 'Design target (no pro equivalent)'
/**
 * Multi-kills from published pro Rating 1.0 averages: KPR 0.679 and the
 * multi-kill value RMK = (1K + 4·2K + 9·3K + 16·4K + 25·5K) / rounds = 1.277,
 * i.e. E[k²] per player-round. A beta-binomial over the five kills a player
 * can make that matches both moments puts 4-kill rounds at ≈ 0.90% and aces
 * at ≈ 0.12% of player-rounds; a plain Poisson at KPR 0.68–0.70 (no
 * overdispersion, a lower bound) at ≈ 0.45–0.50% / 0.06–0.07%. At ≈ 21.8
 * rounds × 10 players per map that is 4k ≈ 1.0–2.0 and aces ≈ 0.13–0.26 per
 * map (half that per team). The earlier 0.35 / 0.06 per map was per-team
 * scale or less, below even the Poisson bound.
 */
const MULTIKILL = 'Pro Rating 1.0 averages (KPR 0.679, RMK 1.277), beta-binomial fit (approx.)'
/**
 * 1vX situations follow from the other targets: every round in which the
 * losing side is wiped passes through a 1vX for that side, and every clutch
 * won is one more. The win-reason targets alone (≈ 65% of CT wins and ≈ 55%
 * of T wins by elimination, ≈ 25% of CT wins by defuse, nearly all after the
 * Ts are dead) put a wiped side in ≈ 70% of rounds, ≈ 15.5 per 21.8-round
 * map; bomb rounds in which the last CT survives (saving or out of time),
 * lone Ts saving and the ≈ 2 clutches won add ≈ 4 more: ≈ 19–22 per map. The
 * earlier ≈ 14–18 (pass ≤ 20) sat below what the other targets allow.
 */
const SITUATIONS = 'Derived from the win-reason and clutch targets (wipes + lone survivors + clutches won)'
const RULE = 'Hard rule'

const band = (pass: Band, warn: Band): TargetRule => ({ kind: 'band', pass, warn })
const effect = (direction: 1 | -1 | 0, passAbs: number, warnAbs: number): TargetRule => ({ kind: 'effect', direction, passAbs, warnAbs })

export const CALIBRATION_TARGETS: readonly CalibrationTarget[] = [
    // ── Score shape ──────────────────────────────────────────────────────
    { id: 'rounds_per_map', label: 'Avg rounds per map', group: 'score', suite: 'realism', unit: 'rounds', reference: '21–22', rule: band({ min: 20.5, max: 23 }, { min: 19.5, max: 24 }), source: AUDIT, approximate: true },
    { id: 'ot_rate', label: 'Overtime rate', group: 'score', suite: 'realism', unit: '%', reference: '8–12%', rule: band({ min: 7, max: 13 }, { min: 5, max: 16 }), source: AUDIT, approximate: true },
    { id: 'loser_le3_share', label: 'Maps where the loser scores ≤ 3', group: 'score', suite: 'realism', unit: '%', reference: '6–10%', rule: band({ min: 5, max: 11 }, { min: 3, max: 15 }), source: AUDIT, approximate: true },
    { id: 'win_after_win', label: 'Win the next round after a win', group: 'score', suite: 'realism', unit: '%', reference: '60–65%', rule: band({ min: 58, max: 66 }, { min: 55, max: 69 }), source: AUDIT, approximate: true },
    { id: 'pistol_conv_r2', label: 'Pistol winner wins round 2', group: 'score', suite: 'realism', unit: '%', reference: '≈ 78%', rule: band({ min: 70, max: 86 }, { min: 65, max: 90 }), source: ESTIMATE, approximate: true },
    { id: 'pistol_conv_r2r3', label: 'Pistol winner wins rounds 2 and 3', group: 'score', suite: 'realism', unit: '%', reference: '≈ 48%', rule: band({ min: 40, max: 56 }, { min: 34, max: 62 }), source: ESTIMATE, approximate: true },
    { id: 'ct_round_win', label: 'CT round win', group: 'score', suite: 'realism', unit: '%', reference: '50–53%', rule: band({ min: 48, max: 55 }, { min: 45, max: 58 }), source: ESTIMATE, approximate: true },

    // ── Economy ──────────────────────────────────────────────────────────
    { id: 'eco_vs_full', label: 'Eco vs full buy', group: 'economy', suite: 'realism', unit: '%', reference: '≈ 8%', rule: band({ min: 4, max: 14 }, { min: 2, max: 18 }), source: ESTIMATE, approximate: true },
    { id: 'force_vs_full', label: 'Force buy vs full buy', group: 'economy', suite: 'realism', unit: '%', reference: '25–30%', rule: band({ min: 22, max: 33 }, { min: 17, max: 38 }), source: AUDIT, approximate: true },
    { id: 'half_vs_full', label: 'Half buy (semi) vs full buy', group: 'economy', suite: 'realism', unit: '%', reference: '30–40%', rule: band({ min: 27, max: 42 }, { min: 20, max: 47 }), source: ESTIMATE, approximate: true },

    // ── Fights and player stats ─────────────────────────────────────────
    { id: 'kills_per_round', label: 'Kills per round (both teams)', group: 'fights', suite: 'realism', unit: '/round', reference: '≈ 7.1', rule: band({ min: 6.6, max: 7.6 }, { min: 6.0, max: 8.0 }), source: AUDIT, approximate: true },
    { id: 'kpr_mean', label: 'KPR (player mean)', group: 'fights', suite: 'realism', unit: '/round', reference: '≈ 0.71', rule: band({ min: 0.66, max: 0.76 }, { min: 0.60, max: 0.80 }), source: AUDIT, approximate: true },
    { id: 'adr_mean', label: 'ADR (player mean)', group: 'fights', suite: 'realism', unit: 'count', reference: '≈ 76', rule: band({ min: 71, max: 81 }, { min: 64, max: 86 }), source: AUDIT, approximate: true },
    { id: 'kast_mean', label: 'KAST (player mean)', group: 'fights', suite: 'realism', unit: '%', reference: '≈ 72%', rule: band({ min: 68, max: 76 }, { min: 64, max: 80 }), source: ESTIMATE, approximate: true },
    { id: 'rating_mean', label: 'Rating (player mean)', group: 'fights', suite: 'realism', unit: 'rating', reference: '1.00', rule: band({ min: 0.96, max: 1.04 }, { min: 0.90, max: 1.10 }), source: AUDIT, approximate: true },
    { id: 'trade_share', label: 'Trade kills share', group: 'fights', suite: 'realism', unit: '%', reference: '20–25%', rule: band({ min: 18, max: 27 }, { min: 14, max: 32 }), source: AUDIT, approximate: true },
    { id: 'headshot_pct', label: 'Headshot kills', group: 'fights', suite: 'realism', unit: '%', reference: '45–50%', rule: band({ min: 40, max: 54 }, { min: 34, max: 60 }), source: ESTIMATE, approximate: true },

    // ── Clutches and multi-kills ────────────────────────────────────────
    { id: 'clutch_situations_per_map', label: '1vX situations per map', group: 'clutch', suite: 'realism', unit: '/map', reference: '≈ 19–22', rule: band({ min: 15, max: 23 }, { min: 12, max: 25 }), source: SITUATIONS, approximate: true },
    { id: 'clutch_conversion', label: '1vX situations won', group: 'clutch', suite: 'realism', unit: '%', reference: '≈ 13%', rule: band({ min: 9, max: 18 }, { min: 6, max: 22 }), source: ESTIMATE, approximate: true },
    { id: 'clutches_won_per_map', label: 'Clutches won per map', group: 'clutch', suite: 'realism', unit: '/map', reference: '≈ 2', rule: band({ min: 1.5, max: 2.6 }, { min: 1.0, max: 3.2 }), source: AUDIT, approximate: true },
    { id: 'k4_per_map', label: '4-kill rounds per map', group: 'clutch', suite: 'realism', unit: '/map', reference: '≈ 1.5 (1.0–2.0)', rule: band({ min: 1.0, max: 2.1 }, { min: 0.7, max: 2.5 }), source: MULTIKILL, approximate: true },
    { id: 'ace_per_map', label: 'Aces per map', group: 'clutch', suite: 'realism', unit: '/map', reference: '≈ 0.2 (0.13–0.26)', rule: band({ min: 0.12, max: 0.30 }, { min: 0.07, max: 0.40 }), source: MULTIKILL, approximate: true },
    { id: 'multikill_index', label: 'Kill concentration E[k²] ÷ E[k] per player-round', group: 'clutch', suite: 'realism', unit: 'x', reference: '≈ 1.88 (RMK 1.277 ÷ KPR 0.679)', rule: band({ min: 1.76, max: 2.0 }, { min: 1.68, max: 2.1 }), source: MULTIKILL, approximate: true },

    // ── Win reasons ─────────────────────────────────────────────────────
    { id: 'ct_win_elim', label: 'CT wins by elimination', group: 'bomb', suite: 'realism', unit: '%', reference: '≈ 65% of CT wins', rule: band({ min: 55, max: 75 }, { min: 48, max: 82 }), source: ESTIMATE, approximate: true },
    { id: 'ct_win_defuse', label: 'CT wins by defuse', group: 'bomb', suite: 'realism', unit: '%', reference: '≈ 25% of CT wins', rule: band({ min: 15, max: 32 }, { min: 10, max: 38 }), source: ESTIMATE, approximate: true },
    { id: 'ct_win_time', label: 'CT wins on time', group: 'bomb', suite: 'realism', unit: '%', reference: '≈ 8% of CT wins', rule: band({ min: 4, max: 13 }, { min: 2, max: 17 }), source: ESTIMATE, approximate: true },
    { id: 't_win_elim', label: 'T wins by elimination', group: 'bomb', suite: 'realism', unit: '%', reference: '≈ 55% of T wins', rule: band({ min: 45, max: 68 }, { min: 38, max: 75 }), source: ESTIMATE, approximate: true },
    { id: 't_win_bomb', label: 'T wins by the bomb', group: 'bomb', suite: 'realism', unit: '%', reference: '≈ 45% of T wins', rule: band({ min: 32, max: 55 }, { min: 25, max: 62 }), source: ESTIMATE, approximate: true },

    // ── Roles and stars ─────────────────────────────────────────────────
    { id: 'opening_share_entry', label: 'Opening kills by the entry fragger', group: 'roles', suite: 'realism', unit: '%', reference: '≈ 26% (even split 20%)', rule: band({ min: 23, max: 40 }, { min: 20.5, max: 45 }), source: ESTIMATE, approximate: true },
    { id: 'opening_share_awper', label: 'Opening kills by the AWPer', group: 'roles', suite: 'realism', unit: '%', reference: '≈ 25% (even split 20%)', rule: band({ min: 22, max: 40 }, { min: 20.5, max: 45 }), source: ESTIMATE, approximate: true },
    { id: 'opening_role_gap', label: 'Entry/AWPer lead over the next role', group: 'roles', suite: 'realism', unit: 'pts', reference: 'clearly above others', rule: band({ min: 4 }, { min: 1.5 }), source: DESIGN, approximate: true },
    { id: 'star_kill_share', label: 'Star (90 among 65s): share of team kills', group: 'roles', suite: 'star', unit: '%', reference: '≈ 30% (even split 20%)', rule: band({ min: 26, max: 36 }, { min: 23, max: 40 }), source: ESTIMATE, approximate: true },
    { id: 'star_rating_ratio', label: 'Star rating ÷ teammates’ rating', group: 'roles', suite: 'star', unit: 'x', reference: '≈ 1.4', rule: band({ min: 1.25, max: 1.7 }, { min: 1.12, max: 1.9 }), source: ESTIMATE, approximate: true },

    // ── Skill gap ───────────────────────────────────────────────────────
    { id: 'fav_win_gap_3', label: 'Favourite map win, +3 skill', group: 'skill', suite: 'skill', unit: '%', reference: '≈ 57%', rule: band({ min: 53, max: 62 }, { min: 50, max: 66 }), source: DESIGN, approximate: true },
    { id: 'fav_win_gap_6', label: 'Favourite map win, +6 skill', group: 'skill', suite: 'skill', unit: '%', reference: '≈ 64%', rule: band({ min: 57, max: 70 }, { min: 53, max: 75 }), source: DESIGN, approximate: true },
    { id: 'fav_win_gap_10', label: 'Favourite map win, +10 skill', group: 'skill', suite: 'skill', unit: '%', reference: '≈ 72%', rule: band({ min: 64, max: 80 }, { min: 58, max: 86 }), source: DESIGN, approximate: true },
    { id: 'fav_win_gap_15', label: 'Favourite map win, +15 skill', group: 'skill', suite: 'skill', unit: '%', reference: '≈ 80%', rule: band({ min: 72, max: 88 }, { min: 66, max: 93 }), source: DESIGN, approximate: true },
    { id: 'fav_win_gap_25', label: 'Favourite map win, +25 skill', group: 'skill', suite: 'skill', unit: '%', reference: '≈ 92% (upsets possible)', rule: band({ min: 85, max: 97 }, { min: 78, max: 99 }), source: DESIGN, approximate: true },
    { id: 'fav_curve_max_drop', label: 'Skill curve: largest drop between gaps', group: 'skill', suite: 'skill', unit: 'pts', reference: '0 (smooth, monotone)', rule: band({ max: 1 }, { max: 4 }), source: DESIGN, approximate: false },
    { id: 'path_parity_fav_win', label: 'Managed vs AI path: favourite win diff', group: 'skill', suite: 'skill', unit: 'pts', reference: '0', rule: band({ min: -4, max: 4 }, { min: -8, max: 8 }), source: DESIGN, approximate: false },
    { id: 'path_parity_rounds', label: 'Managed vs AI path: rounds/map diff', group: 'skill', suite: 'skill', unit: 'rounds', reference: '0', rule: band({ min: -0.75, max: 0.75 }, { min: -1.5, max: 1.5 }), source: DESIGN, approximate: false },

    // ── Manager agency (paired vs an even 70 v 70 baseline) ─────────────
    { id: 'agency_playstyle_counter', label: 'Playstyle counter (structured vs balanced)', group: 'agency', suite: 'agency', unit: 'pts', reference: 'non-zero, bounded', rule: effect(1, 12, 18), source: DESIGN, approximate: false },
    { id: 'agency_vod_prep', label: 'VOD review (tactical prep 0 → 25)', group: 'agency', suite: 'agency', unit: 'pts', reference: 'non-zero, bounded', rule: effect(1, 12, 18), source: DESIGN, approximate: false },
    { id: 'agency_timeout', label: 'Timeout at a 3-round losing streak', group: 'agency', suite: 'agency', unit: 'pts', reference: 'non-zero, small', rule: effect(1, 6, 10), source: DESIGN, approximate: false },
    { id: 'agency_buy_force_r2', label: 'Buy call: force round 2/14 after a lost pistol', group: 'agency', suite: 'agency', unit: 'pts', reference: 'non-zero, bounded', rule: effect(0, 10, 15), source: DESIGN, approximate: false },
    { id: 'agency_buy_eco_control', label: 'Buy call: eco every round (negative control)', group: 'agency', suite: 'agency', unit: 'pts', reference: 'clearly negative', rule: effect(-1, 100, 100), source: DESIGN, approximate: false },
    { id: 'agency_roles', label: 'Roles: 5 riflers → AWP/IGL/entry/support/rifler', group: 'agency', suite: 'agency', unit: 'pts', reference: 'non-zero, bounded', rule: effect(1, 15, 22), source: DESIGN, approximate: false },
    { id: 'nonplayer_cap_managed', label: 'Non-player cap: L5 coach+analyst+psych + counter (managed)', group: 'agency', suite: 'cap', unit: 'pts', reference: '≤ +8', rule: effect(1, 9, 12), source: AUDIT, approximate: true },
    { id: 'nonplayer_cap_ai', label: 'Non-player cap: AI-path bonus 25 (2.5× the cap)', group: 'agency', suite: 'cap', unit: 'pts', reference: '≤ +8', rule: effect(1, 9, 12), source: AUDIT, approximate: true },

    // ── Integrity and performance ───────────────────────────────────────
    { id: 'impossible_states', label: 'Impossible states (timeline, win reason, stats)', group: 'integrity', suite: 'realism', unit: 'count', reference: '0', rule: band({ max: 0 }, { max: 0 }), source: RULE, approximate: false },
    { id: 'ms_per_map', label: 'Simulation time per map', group: 'performance', suite: 'realism', unit: 'ms', reference: '—', rule: { kind: 'info' }, source: 'Measured (not deterministic)', approximate: false },
]

export function targetById(id: string): CalibrationTarget | undefined {
    return CALIBRATION_TARGETS.find(t => t.id === id)
}

const inBand = (v: number, b: Band) => (b.min === undefined || v >= b.min) && (b.max === undefined || v <= b.max)

/** Status of a measured value. Effects need their paired statistics (see EffectStats). */
export function evaluateBand(value: number | null, rule: TargetRule): Status {
    if (rule.kind === 'info') return 'info'
    if (value === null || !Number.isFinite(value) || rule.kind !== 'band') return 'n/a'
    return inBand(value, rule.pass) ? 'pass' : inBand(value, rule.warn) ? 'warn' : 'fail'
}

/** Paired effect: map-win delta (points) and round-share delta (percentage points), each with a 95% CI half-width. */
export interface EffectStats {
    mapWin: number
    mapWinCi: number
    roundShare: number
    roundShareCi: number
    /** Every paired series came out identical to its baseline. */
    identical: boolean
}

/**
 * Agency rule: non-zero (either CI excludes 0), in the expected direction
 * and within ±passAbs map-win points. An effect too small to resolve at
 * this sample size, or between passAbs and warnAbs, warns; no effect at
 * all, a significant effect the wrong way, or one beyond warnAbs fails.
 */
export function evaluateEffect(stats: EffectStats | null, rule: TargetRule): { status: Status; why: string } {
    if (!stats || rule.kind !== 'effect') return { status: 'n/a', why: '' }
    if (stats.identical) return { status: 'fail', why: 'no effect' }
    const nonZero = Math.abs(stats.roundShare) > stats.roundShareCi || Math.abs(stats.mapWin) > stats.mapWinCi
    const sign = Math.sign(stats.roundShare || stats.mapWin)
    if (nonZero && rule.direction !== 0 && sign !== rule.direction) return { status: 'fail', why: 'wrong direction' }
    const size = Math.abs(stats.mapWin)
    if (size > rule.warnAbs) return { status: 'fail', why: 'too large' }
    if (!nonZero) return { status: 'warn', why: 'not resolved at this sample' }
    if (size > rule.passAbs) return { status: 'warn', why: 'larger than the pass bound' }
    return { status: 'pass', why: '' }
}

/** Human-readable target column ("21–22 (pass 20.5–23)"). */
export function describeTarget(t: CalibrationTarget): string {
    const r = t.rule
    if (r.kind === 'info') return t.reference
    if (r.kind === 'effect') {
        const dir = r.direction > 0 ? 'positive' : r.direction < 0 ? 'negative' : 'non-zero'
        return r.passAbs >= 100 ? dir : `${dir}, within ±${r.passAbs}`
    }
    const b = r.pass
    const range = b.min !== undefined && b.max !== undefined
        ? (b.min === -b.max ? `±${b.max}` : `${b.min}–${b.max}`)
        : b.min !== undefined ? `≥ ${b.min}` : `≤ ${b.max}`
    return `${t.reference} (pass ${range})`
}
