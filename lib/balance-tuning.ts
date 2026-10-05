/**
 * Balance tuning approved after the long-career campaign (E4) and the L21
 * paired match scenarios (E5). Evidence and before/after distributions:
 * docs/launch-readiness/evidence/balance-tuning-2026-10-04.md.
 *
 * Every rule here applies to the managed club and to AI clubs alike. Nothing
 * here scripts an outcome: the rules change costs, flows and thresholds, and
 * all randomness still comes from the seeded week/match RNG (or, where a rule
 * needs a per-player roll, a pure hash of stable ids and the week).
 */

/** Player condition: recovery parity and the cost of a heavy schedule. */
export const CONDITION_TUNING = {
    /** Energy restored per day without a match or activity, for every club. */
    IDLE_DAY_ENERGY: 15,
    /**
     * Share of current fatigue removed per idle day, for every club. Proportional
     * rather than the old flat -12 so recovery stays bounded and a busy
     * schedule (matches + training) keeps some fatigue.
     */
    IDLE_DAY_FATIGUE_RECOVERY_RATE: 0.2,
    /**
     * Idle days no longer add form or morale. Before tuning, the managed club
     * alone gained +1 form / +2 morale per idle day (equilibrium form 100 vs
     * AI 50). Kept as named zeros so the parity is explicit and testable.
     */
    IDLE_DAY_FORM: 0,
    IDLE_DAY_MORALE: 0,
    /** Form change per match result, for both clubs in every committed match. */
    FORM_PER_WIN: 3,
    FORM_PER_LOSS: -3,
    /**
     * Morale gains from wins are scaled by (100 - morale) / this, capped at
     * full value: full gain up to morale 50, half at 75, a tenth at 95.
     * Before tuning, S-tier wins (+15, loss -3) pinned winning rosters at 100.
     */
    MORALE_GAIN_HEADROOM: 50,
    /** Weekly form/morale drift target is lowered by this much per point of fatigue. */
    FATIGUE_FORM_DRAG: 0.3,
    FATIGUE_MORALE_DRAG: 0.2,
} as const

/** Sponsorship: payouts follow reputation tier and stay proportionate to the wage bill. */
export const SPONSOR_TUNING = {
    /** Base weekly payout range [min, max] by reputation band (exclusive lower bounds). */
    BASE_RANGE_REP_80: [25_000, 60_000] as const,
    BASE_RANGE_REP_60: [12_000, 32_000] as const,
    BASE_RANGE_REP_40: [6_000, 16_000] as const,
    BASE_RANGE_LOW: [2_000, 8_000] as const,
    /** Tier multipliers on the base payout (were PREMIUM 1.8, ELITE 3.5). */
    PREMIUM_MULTIPLIER: 1.5,
    ELITE_MULTIPLIER: 2.2,
    /**
     * One offer's effective weekly income (payout x reputation factor) may not
     * exceed this share of the club's weekly wage bill (players + staff), with
     * the wage bill floored at WAGE_BILL_FLOOR so lean small clubs still get
     * normal offers. Three such sponsors cover at most ~1x the wage bill, so
     * raising wages never pays for itself through sponsors.
     */
    MAX_SHARE_OF_WAGE_BILL: 0.34,
    /** Wage-bill floor = BASE + PER_REP x reputation: a famous club with a lean payroll still sells exposure. */
    WAGE_BILL_FLOOR: 20_000,
    WAGE_BILL_FLOOR_PER_REP: 1_000,
} as const

/** Wage bill used for the sponsor cap: the actual bill, floored by reputation. */
export function sponsorWageBase(weeklyWageBill: number, reputation: number): number {
    return Math.max(weeklyWageBill, SPONSOR_TUNING.WAGE_BILL_FLOOR + SPONSOR_TUNING.WAGE_BILL_FLOOR_PER_REP * Math.max(0, Math.min(100, reputation || 0)))
}

/** Free-agent market: asking wages, buyer tier and long-unsigned retirement. */
export const FREE_AGENT_TUNING = {
    /** Asking wage falls by this share per week unsigned... */
    WAGE_DECAY_PER_WEEK: 0.02,
    /** ...down to this share of the original ask. */
    WAGE_DECAY_FLOOR: 0.25,
    /** Buyer reputation scaling: ask x (MIN + (1 - MIN) x reputation/100). */
    BUYER_REPUTATION_MIN_FACTOR: 0.6,
    /**
     * A club below five senior players may sign a free agent asking up to this
     * weekly wage even when its cash flow is negative (no fee). Indebted clubs
     * otherwise forfeited for months while free agents sat unsigned.
     */
    QUORUM_WAGE_ALLOWANCE: 1_000,
    /** Weeks a free agent stays available before retirement can happen. */
    RETIRE_GRACE_WEEKS: 26,
    /** Pass 2: an oversized pool shortens the grace period (grace / pool factor), never below this. */
    RETIRE_GRACE_MIN_WEEKS: 8,
    /** Weekly retirement chance once past the grace period (age-adjusted below). */
    RETIRE_WEEKLY_CHANCE: 0.015,
    /**
     * Pass 2: the weekly chance is multiplied by (free agents / target), with
     * target = POOL_TARGET_PER_CLUB x clubs, clamped to [MIN, MAX].
     */
    POOL_TARGET_PER_CLUB: 1,
    POOL_FACTOR_MIN: 0.25,
    POOL_FACTOR_MAX: 6,
    /**
     * AI prospect scouting chance is multiplied by (target / free agents),
     * clamped to [SCOUTING_FACTOR_MIN, 1]: youth keeps arriving, but more
     * slowly while the free-agent pool is over target (the hard pause tried
     * in 2a07265d starved youth and was reverted).
     */
    SCOUTING_FACTOR_MIN: 0.15,
    /** Age at/above which the weekly chance doubles; below YOUTH_AGE it halves. */
    RETIRE_VETERAN_AGE: 28,
    RETIRE_YOUTH_AGE: 21,
} as const

/**
 * AI squad maintenance: what the competent managed policy does, AI clubs now
 * do under the same rules (engine/ai/squad-maintenance.ts).
 */
export const AI_SQUAD_TUNING = {
    /**
     * Pass 2: AI clubs train every week on the managed club's default
     * regimen (store/game-store.ts: AIM at intensity 5) through the same
     * TrainingProcessor, so development is symmetric.
     */
    TRAINING_FOCUS: "AIM",
    TRAINING_INTENSITY: 5,
    /** Renew contracts ending within this many weeks (pass 2: 4 -> 12, before the expiry wave)... */
    RENEW_WINDOW_WEEKS: 12,
    /** ...for the club's most valuable players (by the AI release ordering)... */
    RENEW_TOP_N: 6,
    /** ...below this age (older players are left to retire or move on). */
    RENEW_MAX_AGE: 33,
    /** Opening snapshot contracts end within +/- this many weeks of their nominal length (seeded). */
    INITIAL_CONTRACT_STAGGER_WEEKS: 26,
    INITIAL_CONTRACT_MIN_WEEKS: 26,
    /** Pass 2: weekly chance an AI club reviews sponsor offers (was 0.05), and its slot count (was 2; human cap 3). */
    SPONSOR_LOOK_CHANCE: 0.25,
    /** Pass 2: AI academy prospects leave at this age, and an AI academy holds at most this many (season end). */
    ACADEMY_RELEASE_AGE: 20,
    ACADEMY_MAX_PROSPECTS: 3,
    MAX_SPONSORS: 3,
    /** Human Renew button terms (store/slices/transfer-contract-slice.ts). */
    RENEWAL_SALARY_MULTIPLIER: 1.1,
    RENEWAL_EXTENSION_WEEKS: 52,
    RENEWAL_RUNWAY_WEEKS: 26,
    /** Upgrade attempt cadence during transfer windows (spread by team id). */
    UPGRADE_EVERY_WEEKS: 4,
    /** A free agent must beat the weakest starter by at least this much skill. */
    UPGRADE_MIN_SKILL_GAIN: 5,
    /** Bound the wage quotes per attempt (performance). */
    UPGRADE_MAX_QUOTES: 12,
    /** No upgrade signing at or above this roster size. */
    MAX_ROSTER: 7,
} as const

/** Tournament entry for the managed club. */
export const REGISTRATION_TUNING = {
    /** Open qualifiers are entered automatically (same eligibility and double-entry rules as the Register button). */
    AUTO_REGISTER_OPEN_QUALIFIERS: true,
} as const

/** Hall of Fame: a few inductions per season, not every long career. */
export const HALL_OF_FAME_TUNING = {
    /** Each of these counts as one achievement; two are needed. */
    MVP_AWARDS: 15,
    CAREER_KILLS: 2_500,
    CAREER_MATCHES: 350,
    CAREER_RATING: 1.15,
    /** Rating counts only over a real career. */
    RATING_MIN_MATCHES: 150,
    /** Any one of these alone inducts. */
    AUTO_MAJOR_WINS: 2,
    AUTO_RATING: 1.2,
    ACHIEVEMENTS_REQUIRED: 2,
} as const

/** Round economy: saving has value, so buying every round is not automatically best. */
export const ROUND_ECONOMY_TUNING = {
    /**
     * Default (AI and un-called managed) buy thresholds on average team cash.
     * Before tuning (2000/3200/4500) FULL needed $4,500, so teams holding
     * rifle + helmet money ($3,700) bought a Galil, and a manager calling FULL
     * every round gained +14.5 pp. FULL now starts at rifle + helmet; forcing
     * needs a little more cash so a lost pistol round is followed by a save.
     * Calibrated with scripts/launch/l21-paired-scenarios.ts (200 seeds).
     */
    FORCE_MIN_AVG_CASH: 2200,
    SEMIBUY_MIN_AVG_CASH: 3000,
    FULL_MIN_AVG_CASH: 3700,
    /**
     * Loss bonus by consecutive losses (index 0 = first loss). Was
     * 1900/2400/2900/3400/3400, which paid enough to buy every round, so
     * saving was under-rewarded. Now $1,400 + $500 per consecutive loss.
     */
    LOSS_BONUS_LADDER: [1400, 1900, 2400, 2900, 3400] as const,
} as const
