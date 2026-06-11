/**
 * Game Constants
 * Centralized constants for game mechanics
 */

// ============================================
// TIME
// ============================================

/** One game season = one calendar year = 52 weeks. */
export const WEEKS_PER_YEAR = 52

// ============================================
// PLAYER CONSTANTS
// ============================================

export const PLAYER_CONSTANTS = {
    // Age ranges
    MIN_AGE: 16,
    MAX_AGE: 35,
    PEAK_AGE_START: 22,
    PEAK_AGE_END: 25,

    // Stats (0-100 scale)
    MIN_STAT: 0,
    MAX_STAT: 100,
    AVERAGE_STAT: 50,

    // Roster
    MIN_ROSTER_SIZE: 5,
    MAX_ROSTER_SIZE: 10,
    STARTING_ROSTER_SIZE: 5,

    // Development
    MAX_POTENTIAL: 100,
    DEVELOPMENT_RATE_YOUNG: 0.5, // Per season for players under 22
    DEVELOPMENT_RATE_PEAK: 0.2,  // Per season for players 22-25
    DECLINE_RATE: -0.3,           // Per season for players over 25
} as const

// ============================================
// FINANCIAL CONSTANTS
//  ============================================

export const FINANCE_CONSTANTS = {
    // Starting budget
    STARTING_CASH: 50000,

    // Salary ranges (per week)
    MIN_SALARY: 500,
    MAX_SALARY: 50000,
    AVERAGE_SALARY: 3000,

    // Transfer fees
    MIN_TRANSFER_FEE: 0,
    MAX_TRANSFER_FEE: 10000000,

    // Signing bonuses
    MIN_SIGNING_BONUS: 0,
    MAX_SIGNING_BONUS: 100000,

    // Bankruptcy threshold
    BANKRUPT_THRESHOLD: -50000,

    // Prize money
    MAJOR_WINNER_PRIZE: 100000,
    MAJOR_RUNNERUP_PRIZE: 50000,
    MINOR_WINNER_PRIZE: 25000,
} as const

// ============================================
// MATCH CONSTANTS
// ============================================

export const MATCH_CONSTANTS = {
    // Round timings
    ROUND_TIME: 115,    // 1:55 in seconds
    BOMB_TIME: 40,       // 40 seconds

    // Economy
    START_MONEY: 800,
    MAX_MONEY: 16000,

    // Win bonuses
    ELIMINATION_BONUS: 300, // standard kill reward

    // Loss bonuses (progressive)
    LOSS_BONUS_1: 1900,
    LOSS_BONUS_2: 2400,
    LOSS_BONUS_3: 2900,
    LOSS_BONUS_4: 3400,
    LOSS_BONUS_5: 3400,
} as const

// ============================================
// GAMEPLAY BALANCE CONSTANTS
// ============================================

export const GAMEPLAY_CONSTANTS = {
    // Roster
    ACTIVE_ROSTER_SIZE: 5,
    REQUIRED_ROSTER_SIZE: 5,

    // ELO
    DEFAULT_ELO: 1000,

    // League
    PROMOTION_SLOTS: 3,
    RELEGATION_SLOTS: 3,

    // Schedule
    MAX_WEEKLY_ACTIVITIES: 10,
    MAX_DAILY_EVENTS: 2,
    MAX_GAME_WEEKS: 100000,

    // Market
    MARKET_REFRESH_MIN_WEEKS: 4,
    MARKET_REFRESH_MAX_WEEKS: 8,

    // Scouting
    FOG_OF_WAR_RANGE: 15,
    MAX_SEARCH_RESULTS: 50,

    // Training
    DRILL_STAT_GAIN: 0.1,
    DRILL_XP_GAIN: 50,

    // Match
    MATCH_FATIGUE_BO1: 10,
    MATCH_FATIGUE_BO3: 15,
    MATCH_FATIGUE_BO5: 25,
    MATCH_FATIGUE_OT_EXTRA: 3,
} as const

// ============================================
// FACILITY CONSTANTS
// ============================================

export const FACILITY_CONSTANTS = {
    MAX_LEVEL: 5,
    BASE_COST: 10000,
    UPGRADE_COST_PER_LEVEL: 25000,
    COST_EXPONENT: 1.25,
    MONTHLY_COST_MULTIPLIER: 2000,

    // Merch Store
    MERCH_UPGRADE_BASE: 50000,
    MERCH_UPGRADE_MULTIPLIER: 2,
} as const

// ============================================
// TREATMENT & COSTS
// ============================================

export const COST_CONSTANTS = {
    VOD_REVIEW_COST: 2500,
    MENTAL_RESET_COST: 5000,
    INJURY_TREATMENT_COST: 5000,
    TRAINING_MISSION_COST: 5000,

    // Prospect
    PROSPECT_DEFAULT_SALARY: 2000,
    PROSPECT_DEFAULT_CONTRACT_WEEKS: 104,
    PROSPECT_RELEASE_FEE: 1000,
} as const

// ============================================
// ECONOMY (TEAM FINANCIALS)
// ============================================

export const ECONOMY_CONSTANTS = {
    /** Base facility upkeep cost per week, scaled by level^COST_EXPONENT. */
    FACILITY_BASE_COST: 500,
    /** Income per follower per week (legacy fans*7 fallback). */
    BASE_FAN_INCOME_PER_FAN: 0.0015,
    /** Weekly stability income that every team receives. */
    LEAGUE_REVENUE_SHARE: 15000,
    /** Reputation floor multiplier applied to sponsor income. */
    SPONSOR_REP_FACTOR_BASE: 0.7,
    /** Reputation range multiplier applied to sponsor income. */
    SPONSOR_REP_FACTOR_RANGE: 0.6,
    /** Per-merch-level multiplier applied to fan income (1 + (level-1) * RATE). */
    MERCH_LEVEL_RATE: 0.4,
    /** Per-FanZone-level bonus to fan income (1 + level * RATE). */
    FANZONE_LEVEL_RATE: 0.2,
} as const

/** Team tier -> sponsor income multiplier. */
export const TEAM_TIER_MULTIPLIERS: Record<string, number> = {
    S_TIER: 10.0,
    A_TIER: 5.0,
    B_TIER: 2.5,
    C_TIER: 1.0,
    D_TIER: 0.5,
}

// ============================================
// SCOUTING
// ============================================

export const SCOUT_LEVEL_CONFIG = {
    BASIC:    { duration: 4, costPerMission: 3000,  upgradeCost: 0,     accuracy: 0.70 },
    ADVANCED: { duration: 3, costPerMission: 5000,  upgradeCost: 15000, accuracy: 0.85 },
    EXPERT:   { duration: 2, costPerMission: 8000,  upgradeCost: 30000, accuracy: 0.95 },
    ELITE:    { duration: 1, costPerMission: 12000, upgradeCost: 50000, accuracy: 1.0  },
} as const

// ============================================
// STAFF SALARIES (per week, by tier)
// ============================================

export const STAFF_SALARY_RANGES = {
    Legendary: { min: 4500, max: 6000 },
    Epic:      { min: 3000, max: 4500 },
    High:      { min: 1800, max: 3000 },
    Standard:  { min:  800, max: 1800 },
} as const

// ============================================
// TEAM BUDGET TIERS
// ============================================

export const TEAM_BUDGET_TIERS = {
    TOP: { minReputation: 80, budget: 2000000 },
    HIGH: { minReputation: 50, budget: 1000000 },
    MID: { minReputation: 1, budget: 500000 },
    LOW: { minReputation: 0, budget: 250000 },
} as const

// ============================================
// CIRCUIT POINTS
// ============================================

export const CIRCUIT_POINTS_BY_PLACEMENT: Record<number, number> = {
    1: 2000, 2: 1500, 3: 1000, 4: 800,
    5: 600, 6: 500, 7: 400, 8: 300,
}

// ============================================
// FINANCIAL GRADE
// ============================================

export const FINANCIAL_GRADE_CONFIG = {
    BUDGET_THRESHOLD: 500000,
    BUDGET_MAX_POINTS: 30,
    CASHFLOW_POSITIVE_POINTS: 30,
    CASHFLOW_NEGATIVE_DIVISOR: 10000,
    RUNWAY_THRESHOLD_WEEKS: 52,
    RUNWAY_MAX_POINTS: 20,
    SPONSOR_POINTS_EACH: 7,
} as const

// ============================================
// HALL OF FAME
// ============================================

export const HALL_OF_FAME_REQUIREMENTS = {
    MAJOR_WINS: 3,
    TOTAL_WINS: 500,
    CAREER_EARNINGS: 10000000,
} as const

// ============================================
// STAFF BONUSES
// ============================================

export const STAFF_BONUS_MULTIPLIERS = {
    COACH_XP_MULTIPLIER: 0.5,
    PSYCHOLOGIST_RECOVERY_DIVISOR: 10,
    ANALYST_TACTICAL_DIVISOR: 20,
} as const

// ============================================
// ARRAY CAPS (anti-bloat for long sessions)
// ============================================

/**
 * Maximum sizes for growing game arrays. Caps prevent unbounded memory
 * growth during long play sessions and keep save files lean. Engine
 * compacts at these limits and the store prunes to match after each tick.
 */
export const ARRAY_CAPS = {
    completedMatches: 2000,
    eventsLog: 500,
    financeLedger: 2000,
    transferHistory: 1000,
    newsFeed: 200,
    tournamentQualifications: 2000,
    academyMatchHistory: 200,
    academyWeeklyReports: 100,
    hallOfFame: 500,
    /** Placement-history entries kept inside each per-team circuitPoints entry. */
    circuitPointResults: 60,
} as const

// ============================================
// MATCH SIMULATION BALANCE
// ============================================

export const MATCH_BALANCE = {
    /** Per-side win-probability modifier for T side on standard maps. */
    T_SIDE_ADVANTAGE: 0.02,
    /** Per-side win-probability modifier for CT side on standard maps. */
    CT_SIDE_ADVANTAGE: 0.03,
    /** Weight applied to recent round momentum in win probability. */
    MOMENTUM_WEIGHT: 0.02,
    /** Window of rounds considered for momentum. */
    MOMENTUM_MAX_ROUNDS: 5,
    /** Number of consecutive lost rounds before tilt penalty triggers. */
    TILT_THRESHOLD: 3,
    /** Per-side win-probability penalty when a team is tilting. */
    TILT_PENALTY: 0.03,
    /** Baseline probability for a clutch event to occur in 1vX rounds. */
    CLUTCH_BASE_CHANCE: 0.05,
    /** Win-probability bonus when the team's playstyle counters opponent's. */
    PLAYSTYLE_COUNTER_BONUS: 0.04,
    /** Win-probability penalty when the team's playstyle is countered. */
    PLAYSTYLE_COUNTER_PENALTY: 0.03,
} as const

/** Utility item -> impact power on round outcome. */
export const UTIL_POWER: Record<string, number> = {
    smoke: 6,
    molotov: 8,
    flash: 5,
    he: 4,
}
export const UTIL_POWER_DEFAULT = 1

// ============================================
// PRESTIGE
// ============================================

export const PRESTIGE = {
    /** Score thresholds mapping to S/A/B/C tiers (descending). */
    SCORE_S_TIER: 90,
    SCORE_A_TIER: 80,
    SCORE_B_TIER: 50,
    /** Rank-based reputation cutoffs. */
    TOP_RANK_CUTOFF: 50,
    MID_RANK_CUTOFF: 75,
} as const

// ============================================
// MATCH STRUCTURE
// ============================================

export const MATCH_STRUCTURE = {
    /** Rounds in regulation. */
    REGULATION_ROUNDS: 24,
    /** Overtime rounds per side. */
    OT_ROUNDS_PER_HALF: 3,
} as const

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get loss bonus for streak
 */
export function getLossBonus(lossStreak: number): number {
    const bonuses = [
        MATCH_CONSTANTS.LOSS_BONUS_1,
        MATCH_CONSTANTS.LOSS_BONUS_2,
        MATCH_CONSTANTS.LOSS_BONUS_3,
        MATCH_CONSTANTS.LOSS_BONUS_4,
        MATCH_CONSTANTS.LOSS_BONUS_5,
    ]
    // Clamp into [0, 4]: a negative index would return `undefined` and
    // propagate NaN into team economy. Callers pass `streak - 1`, so guard
    // the lower bound here at the boundary rather than at every call site.
    return bonuses[Math.min(Math.max(lossStreak, 0), 4)]
}
