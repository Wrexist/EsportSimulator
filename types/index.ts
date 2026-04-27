/**
 * Central type index for the Tactical FPS Esports Manager Simulation
 * Phase 3: Complete game data model
 * 
 * This file exports all types from the Phase 3 data model.
 * Import from this file to access any game type.
 */

// ===== ENUMS =====
export {
    GameId,
    PlayerRole,
    PlayerTier,
    MatchFormat,
    MapId,
    EventType,
    TrainingFocus,
    EquipmentSlot,
    StaffType,
    TournamentTier,
    TournamentFormat,
} from "./enums"

// ===== PLAYER =====
export type {
    Player,
    PlayerContract,
    PlayerMatchStats,
} from "./player"

export {
    PLAYER_STAT_CONSTRAINTS,
    calculateInjuryRisk,
    validatePlayerStats,
} from "./player"

// ===== TEAM & STAFF =====
export type {
    Team,
    Staff,
    Coach,
    Analyst,
    Psychologist,
} from "./team"

export {
    calculateTeamChemistry,
    STAFF_EFFECTS,
    createCoach,
    createAnalyst,
    createPsychologist,
} from "./team"

// ===== MATCH & TOURNAMENT =====
export type {
    Match,
    MapVeto,
    MapResult,
    RoundResult,
    MatchEvent,
    MatchResult,
    Tournament,
    TeamStanding,
    BracketMatch,
    TacticalStrategy,
    CustomTactics,
    PlayerLoadout,
} from "./match"

export {
    createBO3Veto,
    getMatchWinner,
    calculatePlayerRating,
} from "./match"

// ===== EVENTS & TRAINING =====
export type {
    GameEvent,
    EventData,
    MoraleEventData,
    FinanceEventData,
    InjuryEventData,
    ContractEventData,
    MediaEventData,
    EventChoice,
    TrainingSession,
    TrainingResult,
} from "./events"

export * from "./activities"

export {
    TRAINING_EFFECTS,
    calculateTrainingGains,
    calculateTrainingFatigue,
} from "./events"

// ===== CIRCUIT =====
export type {
    EntryPolicyKind,
    EntryPolicy,
    StageTemplate,
    QualificationLink,
    CircuitSeriesDefinition,
    CircuitInstance,
} from "./circuit"

// ===== LEGACY COMPATIBILITY =====
// Re-export legacy types from game.ts for backward compatibility
// These will be gradually migrated to the new model
export type {
    Game,
    Role,
    PlayerStats,
    EquipmentItem,
    CS2Map,
    Message,
    MessageChoice,
    GameState,
    NewsItem,
    GameSettings,
    SaveData,
    DataSource,
    ActiveMatchState,
    LivePlayerState,
    LiveGameState,
    SimState,
    LogEntry,
    Injury,
    InjuryType
} from "./game"

// ===== ACADEMY =====
export type {
    AcademyPlayer,
    AcademyFacility,
    AcademyMatchResult,
    AcademyTrainingFocus,
    ScoutingTier,
    ScoutingReport,
    ProspectContractOffer,
    AcademyLevelInfo,
    TrainableStat,
} from "./academy"
