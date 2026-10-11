/**
 * Tuning table for the script-v1 round resolver. All values are rating
 * points on the duel scale unless noted: P(A beats B) = logistic((rA - rB) / DUEL_SCALE).
 *
 * Calibrated against the pro-CS2 targets in docs/revamp/AUDIT_2026-10-09.md
 * §3a with the calibration runners (tmp/p2b, scripts/calibrate-engine.ts).
 * Exported as a plain object so calibration sweeps can override values in a
 * scratch process; production code never mutates it.
 */
export const TUNING = {
    /** Logistic scale: a gap of this many points is a 73/27 duel. */
    DUEL_SCALE: 30,
    /** Skill points above the group average that double a player's share of the duels (see impactWeight). */
    STAR_SPREAD: 20,
    /** Rating points per skill point. */
    AIM_PER_SKILL: 0.28,
    /** Per-map spread of a player's day, and of a whole team's day (points, normal). */
    DAY_FORM_SD: 3,
    TEAM_DAY_FORM_SD: 2,
    /** Duel points per 1.0 of capped team-edge difference (split half to each side). */
    EDGE_DUEL_POINTS: 8.5,

    // ── angles ──
    /** Holding a pre-aimed angle against a peeker. */
    HOLD: 7,
    /** Extra for an AWP / scout holding a long angle. */
    AWP_HOLD: 6,
    /** An AWP / scout forced to peek or fight close. */
    AWP_PEEK: 4,
    /** Peeker penalty per extra defender covering the same entrance (max 2). */
    CROSSFIRE: 3,
    /** A holder who got a kill within SPOTTED_SECONDS keeps only this share of the hold. */
    SPOTTED_SECONDS: 8,
    SPOTTED_HOLD: 0,
    /** Per player the attackers outnumber (or are outnumbered by) the holders in a fight (max 3). */
    NUMBERS: 0,
    /**
     * Every duel: per player one team has alive over the other, relative to the
     * smaller side ((a - b) / min(a, b), capped at ±NUMBERS_CAP): 5v4 +¼, 2v1 +1, 3v1 +2.
     */
    NUMBERS_ROUND: 3.2,
    NUMBERS_CAP: 2,
    // ── saves (see givesUp in simulate.ts) ──
    /**
     * Chance an outnumbered side saves: BASE + PER_DOWN per player down - PER_LEFT
     * per player left beyond the first (1v2 0.28, 1v3 0.43, 2v3 0.15, 2v4 0.30), times the scale below.
     */
    SAVE_BASE: 0.13,
    SAVE_PER_DOWN: 0.15,
    SAVE_PER_LEFT: 0.13,
    /** Save chance when the clock says the round is lost (scaled by urgency). */
    SAVE_CLOCK: 0.4,
    /** Seconds before the last moment (plant / defuse) the clock starts to weigh. */
    SAVE_CLOCK_SECONDS: 12,
    /** Nothing worth keeping (pistols, SMGs on an eco): saves this much less. */
    SAVE_CHEAP: 0.5,
    /** Scale for Ts before a plant (time to play, the plant still wins), early in the round, and CTs on a retake (the bomb clock). */
    SAVE_T: 0.2,
    SAVE_EARLY: 0.24,
    SAVE_RETAKE: 0.9,
    /** Chance the winners catch a saver on the way out: CTs hunting Ts, Ts (guarding the bomb) hunting CTs. */
    EXIT_HUNT_CT: 0.4,
    EXIT_HUNT_T: 0.11,
    /** Seconds of round left for a full hunt chance; the hunter's edge over a running saver. */
    EXIT_ROOM: 25,
    EXIT_EDGE: 10,
    /** Chance a lone site defender facing 3+ attackers falls back to retake. */
    FALLBACK: 0.5,
    /** A blinded player. */
    BLIND: 10,
    /** Eyesight above 70 while holding, per point. */
    EYESIGHT: 0.05,
    /** Split executes hit from two angles: holders lose this much of their hold. */
    SPLIT_HOLD_CUT: 2,

    // ── situations ──
    /** Opening duel: entry (peeker) and reaction (both) per point above 50. */
    ENTRY: 0.08,
    REACTION: 0.05,
    /** Trade duel: trader bonus, + trading per point above 50. */
    TRADE: 10,
    TRADING: 0.08,
    /** The player who just won a duel is exposed to the trade. */
    EXPOSED: 4,
    /** Last alive: clutch per point above 60 and stress resistance per point above 50. */
    CLUTCH: 0.08,
    STRESS: 0.04,
    /**
     * The last player alive against two or more: every angle is theirs to clear
     * alone while the others crossfire and trade, so late man-advantages close
     * out instead of trading down to a 1v1 (1v2 clutches ≈ 13%, 1v3 ≈ 2%).
     */
    CLUTCH_ISOLATE: -24,
    /** A lurker catching a rotator from behind. */
    LURK: 6,
    LURK_CREATIVITY: 0.08,
    /** An aggressive CT push surprises the first T on the route. */
    PUSH_SURPRISE: 6,
    /** Attackers on a rush (or an eco rush) hit before the defence is set. */
    RUSH_SPEED: 2,
    /** Retakers swinging late with the bomb ticking. */
    RUSHED: 3,
    /** High-pressure stage: per point of stress resistance below 60, scaled by stage. */
    PRESSURE: 0.06,
    /** Anti-strat: the opponent knows this player's spots. */
    TARGETED: 6,

    // ── health ──
    /** Per kill this player already made this round (max 3). */
    MULTI_KILL: 5,
    /** Per HP missing. */
    HP_PENALTY: 0.2,
    /** Chance a duel's loser chips the winner: base + close × (1 - P(winner)). */
    CHIP_BASE: 0.3,
    CHIP_CLOSE: 0.6,

    // ── trades ──
    /** Base chance the side that just lost a player trades it (attack / defence / pick). */
    TRADE_HIT: 0.47,
    TRADE_HOLD: 0.34,
    TRADE_PICK: 0.3,
    TRADE_DECAY: 0.57,
    /** Extra trade chance per attacker beyond the defenders' number (they swing together). */
    TRADE_PER_EXTRA: 0.15,
    /** Trade chance kept by the last player alive against two or more. */
    TRADE_LONE: 0.16,

    // ── timing ──
    /** Seconds between new peeks while a site is being taken (clearing angles), and on a rush. */
    HIT_STEP: [3, 6] as [number, number],
    RUSH_STEP: [1.2, 3] as [number, number],
    /** When off-site CTs start rotating, relative to the execute (seconds). */
    ROTATE_INFO: [-2, 1.5] as [number, number],

    // ── utility ──
    FLASH_BASE: 0.25,
    FLASH_PER_GRENADES: 0.004,

    // ── reads ──
    /** CT read edge per 50 points of IGL call-quality difference. */
    READ_IGL: 0.12,
    /** Read edge when your playstyle counters theirs (negative when countered). */
    READ_COUNTER: 0.15,
    READ_RIGHT_BASE: 0.18,
    READ_WRONG_BASE: 0.08,

    // ── team factors ──
    /** Duel points per +1.0 round-win probability of a manager regroup (timeout). */
    REGROUP_POINTS_PER_PROB: 50,

    // ── side balance ──
    /** CT side bias (points) applied to every CT duel; per-map overrides below. */
    CT_BIAS: 6,
    MAP_CT_BIAS: {} as Record<string, number>,
}
