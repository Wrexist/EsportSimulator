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
     * exceed this share of the club's weekly running costs (players + staff +
     * operations), with the base floored at WAGE_BILL_FLOOR so lean small
     * clubs still get normal offers. Three such sponsors cover at most ~0.9x
     * of running costs (Phase 4.4: was 0.34 of a $20k + $1k x rep floor,
     * which paid a $1.7k/week semi-pro club up to $27k per deal), so raising
     * wages never pays for itself through sponsors.
     */
    MAX_SHARE_OF_WAGE_BILL: 0.3,
    /** Base floor = BASE + PER_REP x reputation: a famous club with a lean payroll still sells exposure. */
    WAGE_BILL_FLOOR: 2_000,
    WAGE_BILL_FLOOR_PER_REP: 100,
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
    /**
     * Weekly chance an AI club with an open, eligible sponsor slot reviews
     * offers, and its slot count (human cap 3). Pass 2: 0.05 -> 0.25;
     * Phase 4.6: every week (the managed club can look every week too).
     */
    SPONSOR_LOOK_CHANCE: 1,
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

/**
 * Regional league (Phase 4.4). Before it, a passive club played a median of
 * 4 official matches a season (143 of 197 AI clubs under 20; campaign
 * 2026-10-11 "before"). Every club now plays a weekly league in two splits a
 * season, in divisions of about ten clubs per region, with promotion and
 * relegation between splits.
 *
 * Fixture target: 30-45 official matches a season for a typical club. A
 * double round robin of ten is 18 league matches a split (36 a season); with
 * the open/regional events lower clubs reach, that lands in the band.
 * Divisions of busy international clubs (median world rank <= 30) play a
 * single round robin (9 a split) because the circuit already gives them
 * 25-60 matches. One league round per week at most, on a weekday, so a club
 * never has two league games in a week and the weekend stays free for events.
 */
export const LEAGUE_TUNING = {
    /** Club region -> league region (small regions share a conference). */
    REGION_OF: {
        EU: "EUROPE", MENA: "EUROPE", CIS: "CIS",
        NA: "AMERICAS", BR: "AMERICAS", SA: "AMERICAS",
        ASIA: "ASIA_PACIFIC", OCE: "ASIA_PACIFIC", OCEANIA: "ASIA_PACIFIC",
    } as Record<string, "EUROPE" | "CIS" | "AMERICAS" | "ASIA_PACIFIC">,
    DEFAULT_REGION: "EUROPE" as const,
    REGION_NAMES: { EUROPE: "Europe", CIS: "CIS", AMERICAS: "Americas", ASIA_PACIFIC: "Asia-Pacific" } as const,
    /** Clubs per division (a region of N clubs gets round(N / size) divisions, sized as evenly as possible). */
    DIVISION_TARGET_SIZE: 10,
    /** A division whose median world ranking is at most this plays a single round robin. */
    LIGHT_SCHEDULE_MEDIAN_RANK: 30,
    /** Week-of-season windows. The split is drawn on drawWeek; rounds are spread over firstWeek..lastWeek. */
    SPLITS: [
        { split: 1 as const, drawWeek: 1, firstWeek: 2, lastWeek: 24 },
        { split: 2 as const, drawWeek: 26, firstWeek: 27, lastWeek: 49 },
    ],
    /** A split can be drawn late (old saves, careers started mid-split) while at least this many weeks remain. */
    LATE_DRAW_MIN_WEEKS: 8,
    PROMOTED: 2,
    RELEGATED: 2,
    MATCH_FORMAT: "BO1" as const,
    /** Preferred weekdays (0 = Mon). Events prefer Fri-Sun, so league nights stay clear of them. */
    DAYS_DOUBLE: [1, 2, 0, 3],
    DAYS_SINGLE: [2, 1, 3, 0],
    /**
     * Weekly central distribution by division level (index = level - 1; the
     * last value applies to every deeper level). Replaces the flat $15,000
     * "league revenue share" every club received regardless of stature.
     */
    CENTRAL_PAYMENT_BY_LEVEL: [8_000, 6_000, 4_500, 3_500, 2_500] as const,
    /** Paid to clubs outside the league (none normally; old saves until the first draw). */
    CENTRAL_PAYMENT_FALLBACK: 2_500,
    /** Split prize pool by division level, paid by final table position. */
    SPLIT_PRIZE_POOL_BY_LEVEL: [120_000, 60_000, 35_000, 20_000, 12_000] as const,
    SPLIT_PRIZE_SHARES: [0.40, 0.20, 0.10, 0.10, 0.05, 0.05, 0.05, 0.05] as const,
    /** Reputation for a division title (top division / any other). */
    CHAMPION_REPUTATION_TOP: 4,
    CHAMPION_REPUTATION: 2,
    /** AI-vs-AI league match records are kept this many weeks; the table keeps the results. */
    AI_MATCH_RECORD_WEEKS: 4,
    /** Finished splits kept in league history. */
    HISTORY_SPLITS: 4,
} as const

/**
 * Club economy (Phase 4.4). Before: every club got $15,000/week of league
 * share plus a sponsor floor of $2,000 + $150 x reputation, so every non-elite
 * club made $19-23k a week doing nothing and the managed club banked
 * +$3-5M a season. Now the unconditional income is small, clubs pay for their
 * operation, and starting cash is a fixed number of weeks of running costs,
 * so every tier starts with the same runway and has to earn (sponsors,
 * prizes, league finish) to grow. Same rules for the managed and AI clubs.
 */
export const CLUB_ECONOMY_TUNING = {
    /**
     * Base partner income (minor partners, platform revenue): BASE + PER_REP x
     * reputation per week, earned before any signed deal; signed deals add on
     * top. Was a max() floor of 2,000 + 150 x rep.
     */
    SPONSOR_FLOOR_BASE: 400,
    SPONSOR_FLOOR_PER_REP: 30,
    /** Club operations (travel, admin, content, housing): BASE + PER_REP x reputation per week. */
    OPERATIONS_BASE: 300,
    OPERATIONS_PER_REP: 15,
    /** Starting cash = this many weeks of running costs (wages, staff, upkeep, operations)... */
    STARTING_RUNWAY_WEEKS: 26,
    /** ...rounded to this step, never below the minimum. */
    STARTING_BUDGET_ROUND: 10_000,
    STARTING_BUDGET_MIN: 100_000,
    /** AI administration: after this many consecutive insolvent weeks (the managed club's bankruptcy rule). */
    ADMINISTRATION_WEEKS: 8,
    ADMINISTRATION_REPUTATION_PENALTY: 10,
    /**
     * New owners recapitalise an AI club in administration to this many weeks
     * of its (cut) running costs; without it a club that only breaks even
     * stays insolvent forever, re-enters administration every 8 weeks and
     * forfeits its fixtures (campaign 2026-10-11: 61 insolvent AI clubs, 56
     * short rosters in season 2). The managed club instead goes bankrupt and
     * the manager moves to another club.
     */
    ADMINISTRATION_RECAPITALISE_WEEKS: 8,
    /** AI cost control: an AI club losing money with less than this runway lets its highest-paid staff go (one a week). */
    COST_CONTROL_RUNWAY_WEEKS: 26,
} as const

/**
 * AI club economy (Phase 4.6). Money pressure is for the managed club; AI
 * clubs are run by prudent owners so the world stays healthy and
 * competitive. Campaign 2026-10-11 (6 careers x 2 seasons) before this:
 * ~47 administrations per career in season 2 (13 clubs twice or three
 * times), AI rosters down to 3 players, the median wage of a contract an AI
 * club signed $2,094/week against $330 for the snapshot contracts it let
 * lapse, and top clubs filling barely half their sponsor slots.
 *
 * An AI club commits to a new recurring cost (a signing, a raise, staff,
 * facilities, training) only while its weekly net after the cost keeps
 * SURPLUS_SHARE of income in hand, and answers a deficit the way the
 * competent managed policy does: bench first, then staff, a facility
 * level, then an overpaid starter for a cheaper free agent
 * (engine/ai/club-budget.ts).
 */
export const AI_ECONOMY_TUNING = {
    /** Share of weekly income an AI club keeps as surplus when it takes on a new recurring cost. */
    SURPLUS_SHARE: 0.05,
    /** A transfer fee leaves at least this many weeks of running costs in the bank. */
    FEE_RESERVE_WEEKS: 12,
    /**
     * Beyond the bench, cost control cuts (staff, a facility level, an
     * overpaid starter; one step a week) while the deficit leaves less
     * runway than this, or the club is in debt...
     */
    CUT_RUNWAY_WEEKS: 52,
    /** ...a starter swap at most once per this many weeks per club... */
    SWAP_EVERY_WEEKS: 2,
    /** ...and only for a replacement asking at most this share of the starter's wage. */
    SWAP_MAX_WAGE_SHARE: 0.6,
    /** Emergency (below five players) and trialist contracts. */
    EMERGENCY_CONTRACT_WEEKS: 26,
    /** Trialist from the local scene when free agency is empty: skill range and age range. */
    TRIALIST_SKILL: [42, 52] as const,
    TRIALIST_AGE: [18, 22] as const,
} as const

/** Weekly running costs the starting runway is measured against. */
export function clubOperationsCost(reputation: number): number {
    const rep = Math.max(0, Math.min(100, Number.isFinite(reputation) ? reputation : 50))
    return Math.round(CLUB_ECONOMY_TUNING.OPERATIONS_BASE + CLUB_ECONOMY_TUNING.OPERATIONS_PER_REP * rep)
}

export function sponsorIncomeFloor(reputation: number): number {
    const rep = Math.max(0, Math.min(100, Number.isFinite(reputation) ? reputation : 50))
    return Math.round(CLUB_ECONOMY_TUNING.SPONSOR_FLOOR_BASE + CLUB_ECONOMY_TUNING.SPONSOR_FLOOR_PER_REP * rep)
}

/** League central payment for a division level (undefined = not in the league). */
export function leagueCentralPayment(level: number | undefined): number {
    if (!level || !Number.isFinite(level) || level < 1) return LEAGUE_TUNING.CENTRAL_PAYMENT_FALLBACK
    const table = LEAGUE_TUNING.CENTRAL_PAYMENT_BY_LEVEL
    return table[Math.min(table.length, Math.floor(level)) - 1]
}

/**
 * Board objectives and confidence (Phase 4.4). Confidence moves every week
 * with a named cause (results, league position against the objective,
 * finances) and at two reviews (mid-season after split 1, season end).
 * Consequences are telegraphed: a warning under WARN_BELOW, a final warning
 * (on notice) under NOTICE_BELOW, and dismissal at SACK_AT_OR_BELOW only
 * while on notice. A dismissed manager goes to the job market.
 */
export const BOARD_TUNING = {
    NEW_BOARD_CONFIDENCE: 60,
    /** Weekly movement is clamped so one bad week never decides a career. */
    WEEKLY_MAX_MOVE: 5,
    RESULT_WIN: 0.8,
    RESULT_LOSS: -0.8,
    /** Elo gap that makes a result an upset or an expected outcome. */
    UPSET_ELO_GAP: 100,
    UPSET_WIN: 1.5,
    EXPECTED_LOSS: -1.5,
    EXPECTED_WIN: 0.3,
    UPSET_LOSS: -0.3,
    TITLE: 4,
    TITLE_S_TIER: 8,
    /** League table vs objective, once LEAGUE_MIN_PLAYED matches of the split are played. */
    LEAGUE_ON_TRACK: 0.3,
    LEAGUE_BEHIND: -0.6,
    LEAGUE_MIN_PLAYED: 3,
    /** Weekly finance pressure by state. */
    FINANCE_RISK: -1,
    FINANCE_CRISIS: -2,
    FINANCE_INSOLVENT: -3,
    /** Reviews. */
    REVIEW_LEAGUE_EXCEEDED: 10,
    REVIEW_LEAGUE_MET: 6,
    REVIEW_LEAGUE_MISSED: -6,
    REVIEW_LEAGUE_FAILED: -12,
    REVIEW_RANK_EXCEEDED: 10,
    REVIEW_RANK_MET: 6,
    REVIEW_RANK_MISSED: -6,
    REVIEW_RANK_FAILED: -12,
    REVIEW_FINANCE_MET: 4,
    REVIEW_FINANCE_MISSED: -8,
    /** Finance objective: end the season with at least max(SHARE x season-start cash, WEEKS x running costs). */
    FINANCE_CASH_SHARE: 0.5,
    FINANCE_MIN_WEEKS_OF_COSTS: 8,
    /** Consequences. */
    WARN_BELOW: 40,
    NOTICE_BELOW: 25,
    SACK_AT_OR_BELOW: 10,
    /** Confidence that clears warnings. */
    RECOVERED_AT: 50,
    /** No warnings or dismissal in the first weeks of a tenure. */
    TENURE_GRACE_WEEKS: 8,
    HISTORY_LENGTH: 16,
    /** Job offers a dismissed manager receives. */
    DISMISSAL_OFFERS: 3,
} as const

/**
 * World ranking (Phase 4.8). Elo is the ranking: world rank = Elo order, the
 * league tier is the rank band at the last season end. The previous model
 * gave the winner and the loser different K-factors (by rank, an upset bonus,
 * margin bonuses for the winner only) so every match created points (pool
 * mean 1366 -> 1427 -> 1484 over two seasons), counted "calibration" matches
 * from a match log the league trims to four weeks (so most clubs stayed on
 * the volatile K = 32 forever), and set tiers from absolute Elo, so the S tier
 * grew from 10 clubs to 83 after week one and ~133 by the end of season two
 * (campaign evidence phase4-8-rankings-before.json). Now:
 *  - one K per match, by importance (league < qualifier < event tier <
 *    playoffs; friendlies are unrated), and the same points move from loser
 *    to winner, so the pool never inflates;
 *  - margin of victory scales K a little, damped when the favourite wins big
 *    (it already expected to);
 *  - a new club's first matches move faster (provisional K, shared by both
 *    sides so the exchange stays zero-sum);
 *  - between seasons every rating moves REGRESSION toward the pool mean
 *    (order preserving, so no rank changes at the rollover);
 *  - tiers by rank bands at season end.
 */
export const RANKING_TUNING = {
    /** K by match importance. FRIENDLY (preseason friendlies, scrims) is unrated. */
    K: {
        FRIENDLY: 0,
        LEAGUE: 8,
        QUALIFIER: 10,
        C_TIER: 10,
        B_TIER: 12,
        A_TIER: 16,
        S_TIER: 20,
    } as Record<string, number>,
    /** Playoff (elimination bracket) matches of an event weigh this much more. */
    PLAYOFF_MULTIPLIER: 1.25,
    /** Margin of victory: up to +MOV_MAX of K at MOV_FULL_ROUND_DIFF rounds per map. */
    MOV_MAX: 0.25,
    MOV_FULL_ROUND_DIFF: 10,
    /** Autocorrelation damping of the margin bonus: SCALE / (SCALE + favourite's Elo edge / 1000). */
    MOV_DAMPING_SCALE: 2.2,
    /** Clubs with fewer rated matches than this get a provisional K (new orgs only). */
    PROVISIONAL_MATCHES: 20,
    PROVISIONAL_MULTIPLIER: 2,
    /** No rating falls below this; the exchange is clamped so it stays zero-sum. */
    FLOOR: 600,
    /** Share of the distance to the pool mean removed at every season end. */
    REGRESSION: 0.1,
    /**
     * League tiers by world-rank band at season end, as cumulative shares of
     * the clubs (rounded): in the 198-club world S = ranks 1-16, A = 17-48,
     * B = 49-111, C = 112 and below.
     */
    TIER_BANDS: [
        { tier: "S_TIER", share: 0.08 },
        { tier: "A_TIER", share: 0.24 },
        { tier: "B_TIER", share: 0.56 },
    ] as const,
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
