/**
 * Save System Types
 * Phase 5: Fail-safe save structure with versioning
 * 
 * GOALS:
 * - No corruption, no duplication, no undefined state
 * - Atomic week tick with rollback capability
 * - Migration support for older saves
 */

import {
    Player,
    PlayerContract,
    Team,
    Tournament,
    GameEvent,
    Match,
    MatchResult,
    Injury,
} from "@/types"
import {
    AcademyPlayer,
    AcademyMatchResult,
    AcademyWeeklyReport,
    AcademyScoutingMission
} from "@/types/academy"
import { FPLSaveData } from "@/types/fpl"
import { logger } from "@/lib/logger"

// ===== VERSION CONSTANTS =====

/**
 * Current save version - increment when schema changes
 */
export const CURRENT_SAVE_VERSION = 7

/**
 * Minimum supported save version for migration
 */
export const MIN_SUPPORTED_VERSION = 1

// ===== SAVE STRUCTURE =====

/**
 * Complete game save data structure
 * All fields required - no partial saves allowed
 */
export interface GameSave {
    // === METADATA ===
    saveVersion: number
    saveId: string
    saveName: string
    createdAt: string // ISO date
    updatedAt: string // ISO date
    integrityHash?: string // Tamper/corruption detection

    // === GAME STATE ===
    currentWeek: number
    currentDay: number // 0-6
    timeMode: "WEEKLY" | "HYBRID_DAILY"
    gameStartDate: string // ISO date - week 1 corresponds to this date

    // === GAME OVER STATE ===
    gameOverReason?: string // "BANKRUPTCY" if team dissolved
    gameOverWeek?: number   // Week when game ended

    // === SESSION TRACKING ===
    lastPlayedAt?: string // ISO date of last save for offline recovery

    // === MANAGER CAREER ===
    playerTeamId: string
    managerDetails: ManagerDetails
    difficulty?: "easy" | "normal" | "hard" | "legendary"

    // === ENTITIES ===
    teams: TeamSaveData[]
    players: PlayerSaveData[]
    contracts: ContractSaveData[]
    tournaments: TournamentSaveData[]

    // === MATCH DATA ===
    staff: StaffSaveData[]
    scheduledMatches: MatchSaveData[]
    completedMatches: CompletedMatchSaveData[]
    scheduledActivities: ActivitySaveData[]

    // Phase 60: Staff Market Dynamics
    marketStaff: StaffSaveData[]
    nextMarketRefreshWeek?: number

    // === FINANCE ===
    financeLedger: FinanceLedgerEntry[]

    // === SPONSORSHIP OFFERS ===
    sponsorOffers?: SponsorSaveData[]
    declinedSponsorOfferIds?: string[]

    // Phase 23: Hall of Fame
    hallOfFame: HallOfFameEntry[]

    // === EVENTS ===
    eventsLog: GameEventSaveData[]
    newsFeed: NewsFeedItem[] // Phase 21: News Feed Item
    acknowledgedEventIds: string[]

    // === RNG STATE ===
    lastRngSeed: number

    // === PHASE 23: HALL OF FAME ===
    legendaryPlayers: PlayerSaveData[]

    // === TRANSACTION STATE ===
    weekTickState: WeekTickState | null

    // === PHASE 9: SCOUTING SYSTEM ===
    scoutedPlayers: ScoutedPlayerEntry[] // Players fully scouted
    activeScoutingMission?: ScoutingMissionData // Current scouting in progress

    // === PHASE 20: TOURNAMENT SYSTEM ===
    circuitPoints: CircuitPointsEntry[]
    tournamentQualifications: QualificationStatus[]

    // === TRANSFER HISTORY SYSTEM ===
    transferHistory: TransferRecord[]

    // === UI CELEBRATIONS ===
    pendingCelebration?: CelebrationData | null
    pendingSeasonRecap?: number | null // Year number if a recap is pending
    pendingLegendPick?: LegendPickData | null // Major win legend selection
    signedLegendIds?: string[] // Track signed legends to prevent duplicates
    activelyPlayingLegendIds?: string[] // Legend IDs whose active counterparts are still in game

    // === PHASE 70: YOUTH ACADEMY ===
    academyPlayers: AcademyPlayer[]
    academyMatchHistory: AcademyMatchResult[]
    academyRoster: Record<string, string | null>
    academyTrainingSchedule: Record<number, string | null>
    academyWeeklyReports: AcademyWeeklyReport[]
    academyScoutingMissions: AcademyScoutingMission[]
    academyPendingProspects: string[]

    // === PHASE 80: FPL SYSTEM ===
    fplData?: FPLSaveData // Individual player ranking system

    // === CROSS-SEASON CAREER STATISTICS ===
    careerStats?: CareerStats
}

/**
 * Cross-season career statistics
 * Computed incrementally at season boundaries (every 52 weeks)
 */
export interface CareerStats {
    // Per-season summaries (appended each season end)
    seasons: SeasonSummary[]

    // Aggregate career totals for the player's managed team
    totalSeasons: number
    totalMatches: number
    totalWins: number
    totalLosses: number
    totalTournamentWins: number
    totalPrizeMoney: number
    peakWorldRanking: number
    peakElo: number

    // Manager career progression
    teamsManaged: string[] // team IDs
    lastUpdatedWeek: number
}

export interface SeasonSummary {
    seasonNumber: number
    startWeek: number
    endWeek: number
    teamId: string
    teamName: string

    // Performance
    matches: number
    wins: number
    losses: number
    winRate: number

    // Achievements
    trophiesWon: { tournamentId: string; tournamentName: string; tier: string }[]
    finalWorldRanking: number
    finalElo: number
    leagueTier: string

    // Financial
    totalIncome: number
    totalExpenses: number
    endBudget: number

    // Roster
    rosterSize: number
    mvpPlayerId?: string // Best avg rating player that season
    mvpPlayerName?: string
}

export interface CelebrationData {
    tournamentId: string
    tournamentName: string
    tier: string
    prize: number
    repGain: number
    fanGain: number
    week: number
    logoPath?: string
    trophyPath?: string
}

export interface LegendPickData {
    tournamentName: string
    candidates: string[] // 3 legend player IDs
    week: number
}

/**
 * Transfer Record - tracks all player movements
 */
export interface TransferRecord {
    id: string
    playerId: string
    playerName: string
    fromTeamId: string | null // null = free agent
    fromTeamName: string | null
    toTeamId: string | null
    toTeamName: string | null
    fee: number // 0 for free agent signings
    week: number
    type: "SIGNING" | "TRANSFER" | "RELEASE" | "RETIREMENT"
}

/**
 * Phase 20: Circuit Points Entry
 */
export interface CircuitPointsEntry {
    teamId: string
    points: number
    results: Array<{
        tournamentId: string
        tournamentName: string
        placement: number
        points: number
        week: number
    }>
}

/**
 * Phase 20: Tournament Qualification Record
 */
export interface QualificationStatus {
    tournamentId: string
    seriesId?: string
    instanceId?: string
    seasonNumber?: number
    sourceInstanceId?: string
    stageId?: string
    teamId: string
    status: "QUALIFIED" | "REGISTERED" | "PENDING" | "INVITED" | "ELIMINATED"
    qualifiedVia?: string
    qualifierPosition?: number
}

/**
 * Phase 21: News Feed Item
 */
export interface NewsFeedItem {
    id: string
    title: string
    content: string
    week: number
    category: "MATCH" | "TRANSFER" | "TOURNAMENT" | "ACHIEVEMENT" | "LEVEL_UP" | "INJURY" | "FINANCE" | "FACILITY" | "STAFF" | "RETIREMENT"
    imageUrl?: string
    teamId?: string
    playerId?: string
    link?: string
    engagement?: {
        likes: number
        views: number
    }
}

/**
 * Phase 9: Scouting mission in progress
 */
export interface ScoutingMissionData {
    playerId: string
    startWeek: number
    completionWeek: number
    scoutId: string // Staff member doing the scouting
}

/**
 * Phase 9: Scouted player record
 */
export interface ScoutedPlayerEntry {
    playerId: string
    scoutedWeek: number
    scoutLevel: "BASIC" | "ADVANCED" | "EXPERT" | "ELITE"
}

/**
 * Simplified team data for save (IDs only, no nested objects)
 */
export interface TeamSaveData {
    id: string
    name: string
    shortName?: string // Team tag (2-5 chars)
    tier: string
    region?: string
    rosterIds: string[]
    staffIds: string[]
    reputation: number
    fanbase: number
    chemistry: number
    lastRosterChangeWeek?: number // Week when roster last changed (for chemistry growth)
    facilitiesLevel: number

    // Phase 55: Training Limits
    trainingSlotsUsed: number
    maxTrainingSlots: number
    budget: number
    elo: number // Phase 19: World Ranking
    leagueTier: string // Phase 19: S_TIER, A_TIER, etc.
    // Snapshot of the tier the team started the career in. Used by the
    // ZERO_TO_HERO achievement (start at C_TIER → climb to S_TIER). Set
    // exactly once at newGame time for the playerTeam; never mutated by
    // promotion/relegation. Optional because legacy saves predate it.
    startingLeagueTier?: string
    worldRanking?: number // Phase 19: Calculated 1-30 rank
    // Phase 17: Tactical Mastery
    synergyMatrix?: Record<string, number> // key: "id1_id2", value: 0-100

    // === PHASE 8: ECONOMIC ENGINE ===
    financialState?: "STABLE" | "TIGHT" | "RISK" | "CRISIS" | "INSOLVENT"
    runwayWeeks?: number // Cash / Net Burn
    weeklyNet?: number // Last week's net cashflow
    consecutiveInsolventWeeks?: number // Tracks insolvency duration for game-over trigger
    _prevFinancialState?: "STABLE" | "TIGHT" | "RISK" | "CRISIS" | "INSOLVENT" // Tracks previous state for change detection

    // === PHASE 18: THE EMPIRE ===
    facilities?: FacilitySaveData[]
    sponsors?: SponsorSaveData[]
    merchHype?: number // 0-100 multiplier for merchandise revenue

    // === NEW: Fan Base & Merch System ===
    followers?: number // Total followers across social platforms
    description?: string // Team bio/description
    merchStoreLevel?: number // Level 1-5 store upgrade
    activeMerchItems?: string[] // List of item types being sold (jersey, hoodie, etc)

    // === PHASE 20: TACTICAL PERFECTION ===
    playstyle?: "balanced" | "aggressive" | "structured" | "default"
    tacticalPrep?: number // 0-100 bonus from VOD reviews
    economyStyle?: "standard" | "force" | "eco" // Phase 60: Economy aggressiveness
    targetPlayerId?: string // Phase 60: Antistratting - targeted enemy player
    lastStrategyChangeWeek?: number // Week of last AI strategy adaptation (cooldown enforcement)

    // === PHASE 21: CAREER NARRATIVE ===
    youthAcademyIds?: string[] // IDs of prospects in the academy
    trophies?: { tournamentId: string; tournamentName: string; week: number; mvpId?: string; trophyPath?: string; tier?: string }[]
    logoPath?: string
    branding?: import("@/data/snapshot-types").TeamBranding
    recentForm?: ("W" | "L" | "D")[] // Phase 1: Recent Form Display

    // === PHASE 11: LONG-TERM MEMORY ===
    // === PHASE 11: LONG-TERM MEMORY ===
    rivalries?: RivalryData[] // Teams faced often, tracks win/loss history

    // === PHASE 10: ROLE & SYNERGY ===
    activeRoleTraining?: RoleTrainingSession[]

    // === EQUIPMENT SHOP ===
    equipment?: EquipmentItem[] // Purchased equipment items

    // === PHASE 70: YOUTH ACADEMY ===
    academyFacility?: AcademyFacilitySaveData

    // === PHASE 90: BUILD YOUR OWN TEAM ===
    customTeam?: boolean // Flag for user-created teams
    customTeamData?: {
        difficulty: string // 'story' | 'normal' | 'hard' | 'impossible'
        logoIndex: number
        primaryColor: string
        secondaryColor: string
        logoData?: string
    }
    difficultySettings?: {
        incomeMultiplier: number
        fansMultiplier: number
        tournamentPrizeMultiplier: number
    }
}

/**
 * Equipment Item for stat bonuses
 */
export interface EquipmentItem {
    id: string
    type: "MOUSE" | "KEYBOARD" | "MONITOR" | "HEADSET" | "CHAIR" | "PC"
    tier: 1 | 2 | 3 // 1=Standard, 2=Pro, 3=Elite
    name: string
    bonus: { stat: string; value: number }
    weeklyCost: number
    purchasedWeek: number
}

/**
 * Phase 70: Academy Facility for save
 */
export interface AcademyFacilitySaveData {
    level: number // 0=not built, 1-5
    builtWeek?: number
    lastUpgradeWeek?: number
}

/**
 * Phase 10: Role Training Session
 */
export interface RoleTrainingSession {
    playerId: string
    targetRole: string // using string to avoid import issues, but conceptually "Role"
    weeksCompleted: number
    totalWeeks: number
    weeklyCost: number
    startWeek: number
    pausedNotified?: boolean
    injuryPaused?: boolean
}

/**
 * Phase 11: Rivalry tracking between teams
 */
export interface RivalryData {
    opponentTeamId: string
    matchesPlayed: number
    wins: number
    losses: number
    lastPlayed: number // week number
    highStakesCount?: number // Accumulated count of playoff/final meetings
    intensity: "FRIENDLY" | "NEUTRAL" | "HEATED" | "FIERCE" // Based on frequency and stakes
}

export interface FacilitySaveData {
    id: string
    type: "TRAINING" | "RECOVERY" | "TACTICAL" | "FANZONE"
    level: number // 1-5
    description: string
    monthlyCost: number
}

export interface SponsorSaveData {
    id: string
    name: string
    tier: "STANDARD" | "PREMIUM" | "ELITE"
    weeklyPayout: number
    remainingWeeks: number
    signedWeek?: number
    followerCheckpoint?: number
    lastProcessedWeek?: number
    requirements: string
    goals?: {
        id: string
        description: string
        target: number
        current: number
        bonusPayout: number
        isCompleted: boolean
    }[]
}

/**
 * Complete player data for save
 */
export interface PlayerSaveData {
    id: string
    name: string
    nickname: string
    age: number
    nationality: string
    portraitPath: string
    role: string
    secondaryRole?: string
    tier: string
    achievements?: { type: string, week: number, description: string }[]

    // Phase 55: Energy (0-100)
    energy: number
    maxEnergy: number

    // Stats (0-100)
    skill: number
    awp: number
    rifle: number
    pistol: number
    grenades: number
    creativity: number
    clutch: number
    tactic: number
    leader: number
    teamwork: number
    morale: number
    amicability: number
    productivity: number
    stressResistance: number
    loyalty: number
    reaction: number
    eyesight: number
    health: number
    strength: number
    endurance: number

    // Dynamic
    form: number
    fatigue: number
    potential: number

    // Career
    matchesPlayed: number
    roundsPlayed: number
    avgRating: number
    headshots?: number
    clutchSuccessRate: number
    // Phase 17: Tactical Mastery
    perks?: string[] // e.g. ["clutch_king", "flash_god"]
    traits?: string[] // e.g. ["AGGRESSIVE", "PASSIVE", "CLUTCHER"]
    roleMastery?: Record<string, number> // e.g. { "AWPER": 85, "RIFLER": 40 }
    availableSkillPoints?: number
    trainingFocus?: string // TrainingFocus enum key

    // Phase 6: Prestige System
    proHistory?: { year: number; rank: number }[]
    prestigeScore?: number

    // Phase 23: Legendary System
    isRetired?: boolean
    retirementWeek?: number
    isLegendary?: boolean
    legendaryAchievements?: string[]
    careerTeams?: string[]

    // Career totals for Hall of Fame
    totalKills?: number
    totalDeaths?: number
    totalHeadshots?: number
    totalMVPs?: number
    majorWins?: number

    // Phase 7: Transfer Market
    forSale?: boolean
    transferListingPrice?: number
    weeksOnTransferList?: number

    // Phase 60: Talent Tree
    level: number
    xp: number
    xpToNextLevel: number
    talentPoints: number
    unlockedTalentIds: string[]

    // Phase 65: Weapon Mastery - supports both simple XP (number) and detailed tracking (object)
    weaponMastery?: Record<string, number | { xp: number, level: number, kills: number }>

    // Transfer History: Player's career path
    careerHistory?: { teamId: string; teamName: string; joinedWeek: number; leftWeek?: number }[]

    // Phase 100: Player Injury System
    injury?: Injury

    // Phase 70: Youth Academy
    isAcademyGraduate?: boolean
    enrolledWeek?: number
}

/**
 * Contract data for save
 */
export interface ContractSaveData {
    playerId: string
    teamId: string
    salaryPerWeek: number
    startWeek: number
    endWeek: number
    buyout: number

    // Performance Bonuses
    matchWinBonus?: number
    mvpBonus?: number
    tournamentWinBonus?: number
    signOnBonus?: number
}

/**
 * Staff data for save
 */
export const STAFF_ROLES = ["coach", "analyst", "psychologist", "scout"] as const

export type StaffRarity = "Common" | "Rare" | "Epic" | "Legendary"

export interface StaffSaveData {
    id: string
    name: string
    role: "coach" | "analyst" | "psychologist" | "scout"
    level: number
    specialization: string
    salaryPerWeek: number
    teamId: string
    yearsRemaining: number

    // Phase 56: Dynamic Market
    portraitPath?: string
    description?: string
    nationality?: string
    stats?: Record<string, number> // Dynamic stats based on role

    // Phase 58: Advanced Market
    rarity?: StaffRarity
    salaryTier?: string

    // Phase 59: Contracts
    contractEndWeek?: number // Keeps track of when the contract expires (Week #)
    signingBonus?: number // For historical records

    // Phase 60: Talent Tree
    xp: number
    xpToNextLevel: number
    talentPoints: number
    unlockedTalentIds: string[]
}

/**
 * Tournament data for save
 */
export interface TournamentSaveData {
    id: string
    seriesId?: string
    instanceId?: string
    seasonNumber?: number
    name: string
    shortName: string
    tier: string
    region: string
    teamIds: string[]
    format: string
    entryPolicy?: {
        kind: "OPEN_QUALIFIER" | "CLOSED_QUALIFIER" | "DIRECT_INVITE" | "RANKING_INVITE" | "POINTS_INVITE" | "LEAGUE_SLOT"
        requiredRanking?: number
        requiredPoints?: number
        requiredLeagueTier?: "S_TIER" | "A_TIER" | "B_TIER"
    }
    currentStage: string
    standings: TournamentStandingSaveData[]
    prizePool: number
    startWeek: number
    duration: number
    endWeek: number
    groups?: TournamentGroupSaveData[]
    playoffBracket?: BracketMatchSaveData[]
    isCompleted?: boolean
    winnerId?: string
    rewardsGranted?: boolean
    logoPath?: string
    trophyPath?: string
    // Tournament MVP (calculated when tournament ends)
    mvpPlayerId?: string
    mvpRating?: number
}

export interface TournamentGroupSaveData {
    id: string
    name: string
    teamIds: string[]
    matches: string[] // Match IDs
}

export interface BracketMatchSaveData {
    id: string
    tournamentId: string
    stage: string
    homeTeamId?: string
    awayTeamId?: string
    homeScore?: number
    awayScore?: number
    winnerId?: string
    loserId?: string
    isCompleted: boolean
    nextMatchId?: string
    sourceMatchIds?: string[]
    week: number
    format: string
    seed: number
}

export interface TournamentStandingSaveData {
    teamId: string
    matchesPlayed: number
    wins: number
    losses: number
    mapsWon: number
    mapsLost: number
    points: number
    mapDiff: number
    roundDiff: number
}

/**
 * Match data for save (scheduled)
 */
export interface MatchSaveData {
    id: string
    homeTeamId: string
    awayTeamId: string
    tournamentId: string | null
    stage: string | null
    week: number
    format: string
    seed: number

    // Phase 45: Granular Schedule
    day?: number // 0 (Mon) - 6 (Sun)
    result?: {
        winnerId: string | null
        homeScore: number
        awayScore: number
    }

    // === PHASE 20: TACTICAL PERFECTION ===
    isHighPressure?: boolean // Finals/Semi-finals
    isScrim?: boolean

    // Phase 20: Veto Persistence
    vetoComplete?: boolean
    maps?: string[]
    mapStartingSides?: Record<string, string> // MapId -> TeamId of starting CT team

    // Phase 20: Tactical Prep Persistence
    vodReviewed?: boolean
    mentalPrep?: boolean
    /**
     * Team ID that paid for mental prep on this match. Required for the
     * simulator to apply the bonus to the correct side — `mentalPrep: true`
     * alone is ambiguous when the player is the away team. If absent on
     * legacy saves, fall back to the home side (prior behaviour).
     */
    mentalPrepTeamId?: string
}

/**
 * Completed match with result
 */
export interface CompletedMatchSaveData extends MatchSaveData {
    result: MatchResult
    analysis?: MatchAnalysis // Phase 12: Explainability
    eloChange?: { home: number; away: number }
    rankingChange?: { home: number; away: number }
    _comebackWin?: boolean
    _underdogWin?: boolean
}

/**
 * Phase 12: Detailed Match Analysis
 */
export interface MatchAnalysis {
    summary: string
    keyFactor: "ECONOMY" | "FIREPOWER" | "TRADING" | "CLUTCH" | "ENTRY" | "UTILITY"
    winningFactor: string // "Better economy management"
    losingFactor: string // "Lost too many opening duels"
    teamPerformance: {
        economyRating: number // 0-100
        aimRating: number
        utilityRating: number
        tradingRating: number
    }
}

/**
 * Scheduled Activity (Bootcamp, Media, Travel)
 */
export interface ActivitySaveData {
    id: string
    type: "BOOTCAMP" | "MEDIA" | "REST" | "TRAVEL" | "STAFF_MEETING" | "MARKETING"
    week: number
    duration: number // weeks
    cost: number
    day?: number // 0 (Mon) - 6 (Sun)
    name: string
    description?: string
    contract?: {
        yearsRemaining: number
        buyoutClause: number
    }

    // Phase 55: Energy
    energy?: number
    maxEnergy?: number
    fatigue?: number // usually negative (reduction)
    effect?: {
        trainingBonus?: number
        morale?: number
    }
    data?: Record<string, unknown>
}

/**
 * Finance ledger entry
 */
export interface FinanceLedgerEntry {
    id: string
    week: number
    teamId: string
    type: "INCOME" | "EXPENSE"
    // Strict categories for Phase 8
    category: "WAGES_PLAYER" | "WAGES_STAFF" | "FACILITIES" | "PRIZE" | "SPONSOR" | "TRANSFER_IN" | "TRANSFER_OUT" | "OTHER" | "MERCH" | "TRAINING"
    amount: number
    description: string
    balance: number // Running balance after this entry
}

/**
 * Game event for save
 */
/**
 * Flexible event data payload.
 * Events have diverse data shapes — this interface covers all known fields
 * used across the codebase while remaining extensible via index signature.
 */
export interface EventDataPayload {
    // Common fields
    title?: string
    message?: string
    severity?: string

    // Player-related
    playerId?: string
    playerName?: string

    // Team-related
    teamId?: string
    teamName?: string
    fromTeamId?: string
    toTeamId?: string

    // Financial
    amount?: number
    offerAmount?: number
    salary?: number
    buyout?: number
    budget?: number

    // Transfer/offer
    offeringTeamId?: string
    offeringTeamName?: string
    offeringTeamTier?: string
    salaryOffer?: number
    signingBonus?: number
    budgetAvailable?: number
    worldRanking?: number
    deadlineWeek?: number
    reason?: string

    // Tournament/match
    tournamentId?: string
    tournamentName?: string
    matchId?: string
    placement?: number

    // Pro awards
    proAwards?: Record<string, unknown> | object

    // Fan/social
    followerCount?: number
    followersPerWeek?: number
    brand?: string
    discount?: number

    // Injury
    weeksOut?: number
    weeksUntilExpiry?: number

    // Reputation
    reputationImpact?: number

    // Rival
    rivalTeamId?: string

    // Career
    priority?: string

    // Extensible for future event types
    [key: string]: unknown
}

export interface GameEventSaveData {
    id: string
    type: string
    week: number
    data: EventDataPayload
    acknowledged: boolean
    selectedChoiceId?: string
    choices?: {
        id: string
        text: string
        effects: {
            morale?: number
            reputation?: number
            money?: number
            loyalty?: number
        }
    }[]
}

// ===== TRANSACTION STATE =====

/**
 * Week tick transaction state for atomic processing
 * Tracks which steps have completed to enable resume/rollback
 */
export interface WeekTickState {
    weekNumber: number
    saveId?: string
    startedAt: string // ISO date

    // Step completion flags (in order)
    trainingComplete: boolean
    fatigueRecoveryComplete: boolean
    injuryChecksComplete: boolean
    financeComplete: boolean
    tournamentProcessingComplete: boolean
    matchSimulationComplete: boolean
    standingsUpdateComplete: boolean
    eventGenerationComplete: boolean
    worldLogicComplete: boolean
    restDayProcessingComplete: boolean

    // Intermediate data for resume
    pendingMatchIds: string[]
    completedMatchIds: string[]
    generatedEventIds: string[]

    // Error state
    errorMessage?: string
    failedStep?: string
}

// ===== SAVE SLOT =====

/**
 * Save slot metadata (for save selection UI)
 */
export interface PlayerPreview {
    id: string
    nickname: string
    nationality: string
    portraitPath: string
    ovr: number
}

export interface SaveSlotMetadata {
    slotId: string
    saveId: string | null
    saveName: string | null
    currentWeek: number | null
    teamName: string | null
    updatedAt: string | null
    isEmpty: boolean

    // Set when the slot's data failed to parse/validate. The slot is still
    // surfaced (rather than silently dropped) so the player can see it and
    // attempt recovery.
    isCorrupted?: boolean

    // Phase 2 Upgrade: Rich Metadata
    teamLogo?: string
    stats?: {
        wins: number
        losses: number
        tournamentsWon: number
        majorWins?: number
    }
    topPlayerPreviews?: PlayerPreview[] // Rich preview data
    topPlayerPortraits?: string[] // Legacy support
    teamOvr?: number // Overall Team Rating
    budget?: number // Team Budget

    // NEW: Date/Time Display
    gameStartDate?: string // ISO date string

    // NEW: Trophy Display Data
    trophies?: {
        tournamentId: string
        tournamentName: string
        tier: string
        logoPath?: string
        week: number
    }[]
}

// ===== STORAGE KEYS =====

export const STORAGE_KEYS = {
    SAVE_PREFIX: "esports_save_",
    CURRENT_SAVE_ID: "esports_current_save",
    SAVE_SLOTS: "esports_save_slots",
    BACKUP_PREFIX: "esports_backup_",
    WEEK_TICK_STATE: "esports_week_tick_state",
    INSTALL_SECRET: "esports_install_secret",
} as const

// ===== VALIDATION =====

const REQUIRED_FIELDS = [
    "saveVersion",
    "saveId",
    "saveName",
    "currentWeek",
    "currentDay",
    "timeMode",
    "teams",
    "players",
    "contracts",
    "tournaments",
    "staff",
    "scheduledMatches",
    "completedMatches",
    "financeLedger",
    "eventsLog",
    "lastRngSeed",
    "playerTeamId",
    "managerDetails",
    "marketStaff",
    "scoutedPlayers",
    "circuitPoints",
    "tournamentQualifications",
    "transferHistory",
    "hallOfFame",
    "newsFeed",
    "scheduledActivities",
    "academyPlayers",
    "academyMatchHistory",
    "academyRoster",
    "academyTrainingSchedule",
    "academyWeeklyReports",
    "academyScoutingMissions",
    "academyPendingProspects"
] as const

const AUTO_MIGRATE: Record<string, unknown> = {
    currentDay: 6,
    timeMode: "WEEKLY",
    newsFeed: [],
    marketStaff: [],
    transferHistory: [],
    scheduledActivities: [],
    scoutedPlayers: [],
    circuitPoints: [],
    tournamentQualifications: [],
    hallOfFame: [],
    legendaryPlayers: [],
    academyPlayers: [],
    academyMatchHistory: [],
    academyRoster: { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null },
    academyTrainingSchedule: {},
    academyWeeklyReports: [],
    academyScoutingMissions: [],
    academyPendingProspects: [],
}

/**
 * Collect all validation errors from a save object.
 * Returns an empty array if the save is valid.
 */
export function collectValidationErrors(save: unknown): string[] {
    const errors: string[] = []
    if (!save || typeof save !== "object") {
        return ["Save is null or not an object"]
    }

    const s = save as Record<string, unknown>

    // Auto-migrate missing optional fields
    for (const field of REQUIRED_FIELDS) {
        if (!(field in s) && field in AUTO_MIGRATE) {
            s[field] = AUTO_MIGRATE[field]
        }
    }

    // Check required fields
    const missingFields: string[] = []
    for (const field of REQUIRED_FIELDS) {
        if (!(field in s)) missingFields.push(field)
    }
    if (missingFields.length > 0) {
        errors.push(`Missing fields: ${missingFields.join(", ")}`)
        return errors // Can't continue without basic fields
    }

    if (typeof s.saveVersion !== "number" || s.saveVersion < MIN_SUPPORTED_VERSION) {
        errors.push(`Unsupported version ${s.saveVersion}`)
        return errors
    }

    // Reject forward-incompatible saves explicitly instead of silently
    // running them through the migration ladder (which would skip every
    // step and leave the unknown shape intact).
    if (s.saveVersion > CURRENT_SAVE_VERSION) {
        errors.push(
            `Save version ${s.saveVersion} was written by a newer build than this one (max supported: ${CURRENT_SAVE_VERSION}). Update the game to load it.`,
        )
        return errors
    }

    if (!Array.isArray(s.teams) || !Array.isArray(s.players)) {
        errors.push("teams or players not arrays")
        return errors
    }

    if (typeof s.currentWeek !== "number" || !Number.isFinite(s.currentWeek) || s.currentWeek < 1) {
        errors.push(`Invalid currentWeek: ${s.currentWeek}`)
    }

    const isValidTimeMode = s.timeMode === "WEEKLY" || s.timeMode === "HYBRID_DAILY"
    if (!isValidTimeMode) {
        errors.push(`Invalid timeMode: ${String(s.timeMode)}`)
    }

    if (typeof s.currentDay !== "number" || !Number.isFinite(s.currentDay) || s.currentDay < 0 || s.currentDay > 6) {
        errors.push(`Invalid currentDay: ${String(s.currentDay)}`)
    }

    if (typeof s.playerTeamId !== "string" || !(s.teams as TeamSaveData[]).some(t => t.id === s.playerTeamId)) {
        errors.push(`playerTeamId "${s.playerTeamId}" not found in teams`)
    }

    const teams = s.teams as TeamSaveData[]
    const players = s.players as PlayerSaveData[]
    const contracts = (s.contracts as ContractSaveData[]) || []

    const teamIds = new Set<string>()
    for (const team of teams) {
        if (!team?.id) { errors.push("Team with missing id"); continue }
        if (teamIds.has(team.id)) { errors.push(`Duplicate team id: ${team.id}`); continue }
        teamIds.add(team.id)
        if (!Number.isFinite(team.budget)) {
            errors.push(`NaN budget on team ${team.id}`)
        }
    }

    const playerIds = new Set<string>()
    for (const player of players) {
        if (!player?.id) { errors.push("Player with missing id"); continue }
        if (playerIds.has(player.id)) { errors.push(`Duplicate player id: ${player.id}`); continue }
        playerIds.add(player.id)
    }

    for (const team of teams) {
        for (const rosterId of team.rosterIds || []) {
            if (!playerIds.has(rosterId)) {
                errors.push(`Team ${team.name || team.id} roster refs missing player ${rosterId}`)
            }
        }
    }

    for (const contract of contracts) {
        if (!playerIds.has(contract.playerId)) {
            errors.push(`Contract refs missing player ${contract.playerId}`)
        }
        if (!teamIds.has(contract.teamId)) {
            errors.push(`Contract refs missing team ${contract.teamId}`)
        }
        if (!Number.isFinite(contract.salaryPerWeek) || contract.salaryPerWeek < 0) {
            errors.push(`Invalid salary ${contract.salaryPerWeek} for player ${contract.playerId}`)
        }
        if (!Number.isFinite(contract.endWeek) || contract.endWeek < contract.startWeek) {
            errors.push(`Invalid contract duration for player ${contract.playerId}`)
        }
    }

    return errors
}

/**
 * Auto-repair common save integrity issues in-place.
 * Returns list of repairs made. If unrepairable issues exist, returns null.
 */
export function repairSave(save: unknown): string[] | null {
    if (!save || typeof save !== "object") return null

    const s = save as Record<string, unknown>

    // Auto-migrate missing fields first
    for (const field of REQUIRED_FIELDS) {
        if (!(field in s) && field in AUTO_MIGRATE) {
            s[field] = AUTO_MIGRATE[field]
        }
    }

    // Check for unrepairable issues (missing core fields, bad version, etc.)
    const missingCore = REQUIRED_FIELDS.filter(f => !(f in s))
    if (missingCore.length > 0) return null
    if (typeof s.saveVersion !== "number" || s.saveVersion < MIN_SUPPORTED_VERSION) return null
    if (!Array.isArray(s.teams) || !Array.isArray(s.players)) return null

    const teams = s.teams as TeamSaveData[]
    const players = s.players as PlayerSaveData[]
    const repairs: string[] = []

    if (s.timeMode !== "WEEKLY" && s.timeMode !== "HYBRID_DAILY") {
        s.timeMode = "WEEKLY"
        repairs.push("Set invalid timeMode to WEEKLY")
    }

    if (typeof s.currentDay !== "number" || !Number.isFinite(s.currentDay)) {
        s.currentDay = (s.timeMode === "HYBRID_DAILY") ? 0 : 6
        repairs.push("Set missing currentDay")
    } else {
        const clampedDay = Math.max(0, Math.min(6, Math.floor(s.currentDay)))
        if (clampedDay !== s.currentDay) {
            s.currentDay = clampedDay
            repairs.push("Clamped currentDay into 0-6 range")
        }
    }

    // Build lookup sets
    const playerIds = new Set(players.filter(p => p?.id).map(p => p.id))
    const teamIds = new Set(teams.filter(t => t?.id).map(t => t.id))

    // Fix NaN budgets
    for (const team of teams) {
        if (team?.id && !Number.isFinite(team.budget)) {
            repairs.push(`Reset NaN budget for ${team.name || team.id}`)
            team.budget = 0
        }
    }

    // Fix orphan roster references
    for (const team of teams) {
        if (!team?.rosterIds) continue
        const before = team.rosterIds.length
        team.rosterIds = team.rosterIds.filter(id => playerIds.has(id))
        const removed = before - team.rosterIds.length
        if (removed > 0) {
            repairs.push(`Pruned ${removed} orphan roster ref(s) from ${team.name || team.id}`)
        }
    }

    // Fix orphan contracts
    const contracts = (s.contracts as ContractSaveData[]) || []
    const beforeContracts = contracts.length
    s.contracts = contracts.filter(c => {
        if (!playerIds.has(c.playerId) || !teamIds.has(c.teamId)) return false
        return true
    })
    const removedContracts = beforeContracts - (s.contracts as ContractSaveData[]).length
    if (removedContracts > 0) {
        repairs.push(`Removed ${removedContracts} orphan contract(s)`)
    }

    // Fix invalid salaries and durations
    for (const c of s.contracts as ContractSaveData[]) {
        if (!Number.isFinite(c.salaryPerWeek) || c.salaryPerWeek < 0) {
            repairs.push(`Reset invalid salary for player ${c.playerId}`)
            c.salaryPerWeek = 0
        }
        if (!Number.isFinite(c.endWeek) || c.endWeek < c.startWeek) {
            repairs.push(`Fixed contract duration for player ${c.playerId}`)
            c.endWeek = c.startWeek
        }
    }

    return repairs
}

/**
 * Validate save structure has all required fields
 */
export function validateSaveStructure(save: unknown): save is GameSave {
    const errors = collectValidationErrors(save)
    if (errors.length > 0) {
        logger.error(`Save validation failed (${errors.length} issues)`, errors.join("; "))
        return false
    }
    return true
}

/**
 * Check if week tick state indicates incomplete transaction
 */
export function hasIncompleteWeekTick(state: WeekTickState | null): boolean {
    if (!state) return false

    // If all steps complete, no incomplete transaction
    return !(
        state.trainingComplete &&
        state.fatigueRecoveryComplete &&
        state.injuryChecksComplete &&
        state.financeComplete &&
        state.tournamentProcessingComplete &&
        state.matchSimulationComplete &&
        state.standingsUpdateComplete &&
        state.eventGenerationComplete &&
        state.worldLogicComplete &&
        state.restDayProcessingComplete
    )
}

/**
 * Get next step to resume from incomplete week tick
 */
export function getResumeStep(state: WeekTickState): number {
    if (!state.trainingComplete) return 1
    if (!state.fatigueRecoveryComplete) return 2
    if (!state.injuryChecksComplete) return 3
    if (!state.financeComplete) return 4
    if (!state.tournamentProcessingComplete) return 5
    if (!state.matchSimulationComplete) return 6
    if (!state.standingsUpdateComplete) return 7
    if (!state.eventGenerationComplete) return 8
    if (!state.worldLogicComplete) return 9
    if (!state.restDayProcessingComplete) return 10
    return 11 // All complete
}

// Phase 23: Hall of Fame Entry
export interface HallOfFameEntry {
    id: string
    name: string
    portraitPath: string
    eraStart: number
    eraEnd: number
    primaryRole: string
    category: "FOUNDING" | "INDUCTED"
    // No raw numbers, only badges/reasons
    inductionReasons: {
        type: "CHAMPION" | "MVP" | "LONGEVITY" | "IMPACT" | "LOYALTY"
        label: string
        icon: string // Lucide icon name
    }[]
    nationality: string
}

/**
 * Manager Details for Career Mode
 */
export interface ManagerDetails {
    name: string
    level: number
    xp: number
    reputation: number // 0-100
    careerWins: number
    careerLosses: number
    championships: number
    totalKills?: number
    totalHS?: number
    careerMatches?: number
    maxBudget?: number
}
