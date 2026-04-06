/**
 * Engine Module Index
 * Phase 4 & 5: Exports all simulation and save system components
 */

// ===== RNG =====
export { SeededRNG, createMatchRNG, generateSeed } from "./rng"

// ===== MATCH SIMULATION =====
export {
    SimulationEngineV2,
    simulationEngineV2,
    type RoundSimulationResult,
    type MapSimulationResult,
    type MatchStats,
} from "./match-simulation"

export { EconomyManager, WEAPONS, WeaponType } from "./economy-manager"

export { matchEngine, MatchEngine } from "./match-engine"
export { commentaryManager, type CommentaryContext, type CommentaryType } from "./commentary-manager"

// ===== WEEKLY LOOP =====
// Legacy weekly-loop.ts removed - use AtomicWeekProcessor instead

// ===== SAVE SYSTEM (Phase 5) =====
export {
    // Types
    type GameSave,
    type TeamSaveData,
    type PlayerSaveData,
    type StaffSaveData,
    type ContractSaveData,
    type TournamentSaveData,
    type MatchSaveData,
    type CompletedMatchSaveData,
    type FinanceLedgerEntry,
    type GameEventSaveData,
    type FacilitySaveData,
    type SponsorSaveData,
    type WeekTickState,
    type ActivitySaveData,
    type SaveSlotMetadata,
    // Constants
    CURRENT_SAVE_VERSION,
    MIN_SUPPORTED_VERSION,
    STORAGE_KEYS,
    // Validation
    validateSaveStructure,
    hasIncompleteWeekTick,
    getResumeStep,
    type HallOfFameEntry, // Phase 23
    type ManagerDetails,
    type TransferRecord,
} from "./save-types"

export { FOUNDING_LEGENDS } from "./hall-of-fame-data"

export {
    SaveManager,
    saveManager,
} from "./save-manager"

export { asyncStorage, debouncedStorage } from "./storage-adapter"

export {
    AtomicWeekProcessor,
    atomicWeekProcessor,
    type WeekProcessorConfig,
    type WeekProcessorResult,
} from "./atomic-week-processor"

// ===== AI MANAGER (Phase 19) =====
export {
    AIManager,
} from "./ai-manager"

// ===== TOURNAMENT MANAGER =====
export { TournamentManager } from "./tournament-manager"
export { LeagueEngine } from "./league-engine"

// ===== ADDITIONAL EXPORTS =====
// Legacy SimulationEngine removed - use SimulationEngineV2 instead
export { TrainingManager } from "./training-manager"
export { EventsManager } from "./events-manager"
export { reconcileTeamRoles, reconcileAllRoles } from "./role-reconciler"
export { ManagerProgression } from "./manager-progression"
export {
    QualificationEngine,
    CircuitPointsManager,
    TournamentParticipationManager,
    type TournamentEligibility
} from "./tournament-qualification"
export { type QualificationStatus, type CircuitPointsEntry } from "./save-types"
export {
    resolveTournamentIdentity,
    isQualificationForTournament,
    buildQualificationGraph,
    getSeriesIdFromTournamentId,
    buildInstanceId
} from "./circuit-engine"
export { SynergyCalculator } from "./synergy-calculator"
