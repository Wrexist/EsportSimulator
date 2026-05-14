"use client"

import { enableMapSet } from "immer"
import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { persist, createJSONStorage } from "zustand/middleware"
import {
  GameSave,
  TransferRecord,
  ManagerDetails,
  SaveManager,
  saveManager,
  TeamSaveData,
  PlayerSaveData,
  ContractSaveData,
  CURRENT_SAVE_VERSION,
  FacilitySaveData,
  SponsorSaveData,
  TournamentSaveData,
  StaffSaveData,
  MatchSaveData,
  CompletedMatchSaveData,
  GameEventSaveData,
  ActivitySaveData,
  SeededRNG,
  atomicWeekProcessor,
  STORAGE_KEYS,
  asyncStorage,
  debouncedStorage,
  SaveSlotMetadata,
  HallOfFameEntry,
  AIManager,
  TrainingManager,
  reconcileAllRoles,
  simulationEngineV2,
  TournamentManager,
  LeagueEngine,
  QualificationStatus,
  CircuitPointsEntry,
  SynergyCalculator,
  FOUNDING_LEGENDS,
  type SaveErrorCode
} from "@/engine"
import { soundManager } from "@/lib/sound-manager"
import { JobOfferGenerator } from "@/engine/job-offer-generator"
import { ManagerProgression } from "@/engine/manager-progression"
import { StaffGenerator } from "@/engine/staff-generator"
import { WeaponMasteryManager, WeaponType } from "@/engine/weapon-mastery-system"
import { PreSeasonTransferProcessor } from "@/engine/pre-season-transfers"
import { snapshotLoader } from "@/data"
import { FULL_TOURNAMENT_CALENDAR, CIRCUIT_POINTS } from "@/data/tournament-calendar"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { weekProcessorBridge } from "@/engine/worker/week-processor-bridge"
import { Player, Team, Match, GameEvent, MatchResult, EquipmentItem, Role, CustomTactics, TacticalStrategy, ActiveMatchState, WEEKLY_ACTIVITIES } from "@/types"
import { MapId } from "@/types/enums"
import { PLAYER_TALENT_TREE, collectTeamTalentBonuses, applyTalentMoraleFloor } from "@/engine/talent-trees"
import { checkAchievements, steamService as steamAchievements } from "@/engine/steam-service"
import { AcademyEngine } from "@/engine/academy-engine"
import { generateProspect, prospectToPlayerData } from "@/engine/prospect-generator"
import { SCOUTING_COSTS, ACADEMY_LEVELS, DEV_MATCH_CONFIG, isScoutingTierUnlocked, ENERGY_CONFIG, DEVELOPMENT_CONFIG, ACADEMY_DRILLS, SCOUTING_DURATIONS, PENDING_POOL_MAX_SIZE } from "@/engine/academy-constants"
import { AcademyPlayer, AcademyTrainingFocus, ScoutingTier } from "@/types/academy"
import { generateSeed } from "@/engine/rng"
import { SponsorGenerator } from "@/engine/economy-manager"
import { applyRosterChangePenalty, applyBootcampChemistryBonus } from "@/engine/chemistry-engine"
import { isDevToolsEnabled } from "@/lib/runtime-flags"
import { LEGENDARY_PLAYERS } from "@/engine/legendary-players-data"
import {
  buildInstanceId,
  getSeasonFromTournamentId,
  getSeasonFromWeek,
  getSeriesIdFromTournamentId,
  isQualificationForTournament,
  normalizeQualificationStatus,
  resolveTournamentIdentity
} from "@/engine/circuit-engine"
import { buildEntityIndexes, type EntityIndexes } from "@/store/indexes"
import { pruneGameState } from "@/store/utils/array-pruning"
import { logger } from "@/lib/logger"
import { createSettingsSlice } from "@/store/slices/settings-slice"
import { createScoutingSlice } from "@/store/slices/scouting-slice"

enableMapSet()

const debugToolsEnabled = () => isDevToolsEnabled()

type RngBackedState = {
  lastRngSeed: number
  currentWeek: number
}

const nextRandom = (state: RngBackedState): number => {
  const rng = new SeededRNG(state.lastRngSeed || generateSeed())
  const value = rng.next()
  state.lastRngSeed = rng.getState()
  return value
}

const nextRandomInt = (state: RngBackedState, min: number, max: number): number => {
  return Math.floor(nextRandom(state) * (max - min + 1)) + min
}

const nextDeterministicId = (
  state: RngBackedState,
  prefix: string,
  ...parts: Array<string | number | null | undefined>
): string => {
  const token = nextRandomInt(state, 0, 0x7fffffff).toString(36)
  const suffix = parts
    .filter((part): part is string | number => part !== undefined && part !== null)
    .map(String)
    .join("_")

  return suffix
    ? `${prefix}_${state.currentWeek}_${token}_${suffix}`
    : `${prefix}_${state.currentWeek}_${token}`
}

const ensureDeterministicSeed = (
  state: RngBackedState,
  matchLike: { seed?: number }
): number => {
  if (Number.isFinite(matchLike.seed) && (matchLike.seed as number) > 0) {
    return matchLike.seed as number
  }
  const seed = nextRandomInt(state, 1, 2147483646)
  matchLike.seed = seed
  return seed
}

const computeFallbackMatchSeed = (matchId: string, week: number, day: number, salt: number): number => {
  let hash = 2166136261
  const payload = `${matchId}:${week}:${day}:${salt}`
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.max(1, hash >>> 0)
}

const simulateDueAIMatchesForDay = (state: GameStoreState, day: number): void => {
  const dueMatches = state.scheduledMatches
    .filter(match =>
      match.week === state.currentWeek &&
      (match.day ?? 6) <= day &&
      match.homeTeamId !== state.playerTeamId &&
      match.awayTeamId !== state.playerTeamId
    )
    .sort((a, b) => ((a.day ?? 6) - (b.day ?? 6)) || a.id.localeCompare(b.id))

  if (dueMatches.length === 0) return

  const completedIds = new Set<string>()
  // Use entity indexes for O(1) lookups (fall back to linear scan if not built yet)
  const teamIdx = state._teamIndex?.size ? state._teamIndex : undefined
  const playerIdx = state._playerIndex?.size ? state._playerIndex : undefined
  const staffIdx = state._staffIndex?.size ? state._staffIndex : undefined

  const findTeam = (id: string) => teamIdx ? teamIdx.get(id) : state.teams.find(t => t.id === id)
  const findPlayer = (id: string) => playerIdx ? playerIdx.get(id) : state.players.find(p => p.id === id)

  const mapStaff = (staffIds: string[]) => {
    const rows = staffIdx
      ? staffIds.map(id => staffIdx.get(id)).filter(Boolean) as StaffSaveData[]
      : state.staff.filter(s => staffIds.includes(s.id))
    return {
      coach: rows.find(s => s.role === "coach"),
      analyst: rows.find(s => s.role === "analyst"),
      psychologist: rows.find(s => s.role === "psychologist"),
    }
  }

  for (const match of dueMatches) {
    const homeTeam = findTeam(match.homeTeamId)
    const awayTeam = findTeam(match.awayTeamId)
    if (!homeTeam || !awayTeam) continue

    const homePlayers = homeTeam.rosterIds
      .map(playerId => findPlayer(playerId))
      .filter(Boolean)
      .slice(0, 5) as Player[]
    const awayPlayers = awayTeam.rosterIds
      .map(playerId => findPlayer(playerId))
      .filter(Boolean)
      .slice(0, 5) as Player[]

    if (homePlayers.length < 5 || awayPlayers.length < 5) continue

    const homeStaff = mapStaff(homeTeam.staffIds)
    const awayStaff = mapStaff(awayTeam.staffIds)

    const fallbackSeed = computeFallbackMatchSeed(
      match.id,
      match.week,
      match.day ?? 6,
      state.lastRngSeed || 1
    )

    const runtimeMatch: any = {
      ...match,
      seed: (typeof match.seed === "number" && match.seed > 0) ? match.seed : fallbackSeed,
      bestOf: match.format === "BO5" ? 5 : match.format === "BO3" ? 3 : 1
    }

    const result = simulationEngineV2.simulateMatch(
      runtimeMatch,
      homeTeam as unknown as Team,
      awayTeam as unknown as Team,
      homePlayers,
      awayPlayers,
      homeStaff as any,
      awayStaff as any
    )

    const completedMatch: CompletedMatchSaveData = {
      ...match,
      result
    }
    state.completedMatches.push(completedMatch)
    completedIds.add(match.id)

    if (match.tournamentId && match.tournamentId !== "SCRIM") {
      const winnerId =
        result.homeScore > result.awayScore
          ? match.homeTeamId
          : result.awayScore > result.homeScore
            ? match.awayTeamId
            : null
      const loserId = winnerId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
      if (winnerId && loserId) {
        TournamentManager.processMatchResult(
          state as unknown as GameSave,
          match.tournamentId,
          match.id,
          winnerId,
          loserId
        )
      }
    }
  }

  if (completedIds.size > 0) {
    state.scheduledMatches = state.scheduledMatches.filter(match => !completedIds.has(match.id))
  }
}

const MAX_TRANSFER_FEE = 1_000_000_000
const MAX_PLAYER_SALARY_PER_WEEK = 10_000_000
const MAX_STAFF_SALARY_PER_WEEK = 2_000_000
const MAX_SIGNING_BONUS = 50_000_000
const MAX_CONTRACT_LENGTH_WEEKS = 52 * 10
const MAX_MAPS_PER_SERIES = 5
const ALLOWED_MAP_IDS = new Set<string>(Object.values(MapId))
const MAX_ROUNDS_PER_MAP = 60
const MAX_MATCH_KILLS = 80
const MAX_MATCH_DEATHS = 80
const MAX_MATCH_ASSISTS = 60
const MAX_MATCH_CLUTCHES = 15
const MAX_MATCH_OPENINGS = 30
const MAX_MATCH_ADR = 300
const MAX_MATCH_RATING = 3
const VOD_REVIEW_COST = 2_500
const MENTAL_RESET_COST = 5_000
const VALID_PLAYSTYLES = new Set<TeamSaveData["playstyle"]>(["balanced", "aggressive", "structured", "default"])
const VALID_ECONOMY_STYLES = new Set<TeamSaveData["economyStyle"]>(["standard", "force", "eco"])

type NumericValidationResult =
  | { ok: true; value: number }
  | { ok: false; message: string }

const parseBoundedInt = (
  value: unknown,
  label: string,
  min: number,
  max: number
): NumericValidationResult => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, message: `${label} must be a valid number` }
  }

  const normalized = Math.floor(value)
  if (normalized < min || normalized > max) {
    return { ok: false, message: `${label} must be between ${min.toLocaleString()} and ${max.toLocaleString()}` }
  }

  return { ok: true, value: normalized }
}

const parseBoundedNumber = (
  value: unknown,
  label: string,
  min: number,
  max: number
): NumericValidationResult => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, message: `${label} must be a valid number` }
  }

  if (value < min || value > max) {
    return { ok: false, message: `${label} must be between ${min.toLocaleString()} and ${max.toLocaleString()}` }
  }

  return { ok: true, value }
}

// UI-specific state extensions
interface GameStoreState {
  // Game Data (Mirrors GameSave)
  saveId: string | null
  saveName: string
  currentWeek: number
  currentDay: number
  timeMode: "WEEKLY" | "HYBRID_DAILY"
  gameStartDate: string
  lastRngSeed: number

  teams: TeamSaveData[]
  players: PlayerSaveData[]
  contracts: ContractSaveData[]
  tournaments: TournamentSaveData[]
  staff: StaffSaveData[]

  scheduledMatches: MatchSaveData[]
  completedMatches: CompletedMatchSaveData[]
  scheduledActivities: ActivitySaveData[]

  financeLedger: any[] // Using any for brevity, matches GameSave
  eventsLog: GameEventSaveData[]
  acknowledgedEventIds: string[]

  // Derived/Runtime State
  playerTeamId: string | null
  managerDetails: ManagerDetails
  isLoading: boolean
  error: string | null
  lastLoadError: { saveId: string; errorCode: SaveErrorCode; message: string } | null
  isInitialized: boolean
  _hasHydrated: boolean

  // Phase 18: The Empire
  theme: "crystal" | "onyx"
  availableEquipment: EquipmentItem[]

  // Phase 22: Professional Polish
  onboardingCompleted: boolean
  tutorialCompleted: boolean
  showTutorialOnNewGame: boolean
  manualTutorialTrigger: number // Timestamp to force trigger tutorial
  soundEnabled: boolean

  // Phase 23: Hall of Fame
  legendaryPlayers: PlayerSaveData[]

  // Phase 23: Hall of Fame
  hallOfFame: HallOfFameEntry[]

  // Phase 9: Scouting System
  scoutedPlayers: { playerId: string; scoutedWeek: number; scoutLevel: "BASIC" | "ADVANCED" | "EXPERT" | "ELITE" }[]
  activeScoutingMission?: { playerId: string; startWeek: number; completionWeek: number; scoutId: string }
  watchlistedPlayerIds: string[]

  // Phase 25: Region Selection
  selectedRegions: string[]

  // Phase 20: Tournament System
  circuitPoints: CircuitPointsEntry[]
  tournamentQualifications: QualificationStatus[]

  // Phase 40: Navigation Guard
  activeMatchId: string | null
  activeMatchState: ActiveMatchState | null

  // Phase 39: Customizable Tactical Loadouts
  customTactics: CustomTactics

  // Phase 56: Staff Market
  marketStaff: StaffSaveData[]
  nextMarketRefreshWeek?: number

  // Transfer History System
  transferHistory: TransferRecord[]

  // Game Over State
  gameOverReason: string | null
  gameOverWeek: number | null

  // UI Celebrations
  pendingCelebration: import("@/engine/save-types").CelebrationData | null
  pendingSeasonRecap: number | null
  pendingLegendPick: import("@/engine/save-types").LegendPickData | null
  signedLegendIds: string[]
  activelyPlayingLegendIds: string[]

  // Toast Notifications (UI-only, transient)
  toasts: { id: string; message: string; type: "level_up" | "xp_gain" | "achievement" | "info" | "warning" | "error"; duration?: number }[]

  // Phase 21: Career Narrative
  newsFeed: {
    id: string;
    title: string;
    content: string;
    week: number;
    category: "MATCH" | "TRANSFER" | "TOURNAMENT" | "ACHIEVEMENT" | "LEVEL_UP" | "INJURY" | "FINANCE" | "FACILITY" | "STAFF" | "RETIREMENT";
    imageUrl?: string;
    teamId?: string;
    playerId?: string;
    link?: string;
    engagement?: { likes: number; views: number; };
  }[]

  // Immersive Content
  selectedWeeklyActivity: import("@/types").WeeklyActivityType | null

  // Phase 70: Youth Academy
  academyPlayers: import("@/types/academy").AcademyPlayer[]
  academyMatchHistory: import("@/types/academy").AcademyMatchResult[]
  academyRoster: Record<string, string | null> // role -> prospectId
  academyTrainingSchedule: Record<number, string | null> // day(0-6) -> drillId
  academyWeeklyReports: import("@/types/academy").AcademyWeeklyReport[]
  academyScoutingMissions: import("@/types/academy").AcademyScoutingMission[]
  academyPendingProspects: string[] // List of player IDs scouted but not yet enrolled

  // Phase 80: FPL System
  fplData?: import("@/types/fpl").FPLSaveData

  // Sponsorship Manager
  sponsorOffers: SponsorSaveData[]
  declinedSponsorOfferIds: string[]

  // Entity indexes (transient, not persisted, rebuilt on hydration)
  _teamIndex: Map<string, TeamSaveData>
  _playerIndex: Map<string, PlayerSaveData>
  _contractByPlayerIndex: Map<string, ContractSaveData>
  _staffIndex: Map<string, StaffSaveData>
  _completedMatchIds: Set<string>

  // Phase 75: Game Settings
  resolution: string
  masterVolume: number
  musicVolume: number
  gameSpeed: "normal" | "fast" | "very-fast"
  difficulty: "easy" | "normal" | "hard" | "legendary"
  autoSave: boolean
  notifications: boolean
  showBugReportButton: boolean
}

interface GameStoreActions {
  // Lifecycle
  initializeNewGame: (saveName: string, playerTeamId: string, snapshotId?: string) => Promise<void>
  initializeCustomTeam: (managerName: string, teamData: import("@/types/team-creator").CustomTeamData) => Promise<void>
  loadGame: (saveId: string) => Promise<void>
  saveGame: () => Promise<void>
  initAchievements: () => void
  addNewsItem: (item: Omit<GameStoreState["newsFeed"][0], "id" | "week">) => void

  // Game Loop
  advanceDay: () => Promise<void>
  advanceToWeekEnd: () => Promise<void>
  advanceWeek: () => Promise<void>

  // UI Actions
  acknowledgeEvent: (eventId: string) => void
  markAllEventsAsRead: () => void
  resolveEventChoice: (eventId: string, choiceId: string) => void
  saveMatchResult: (matchId: string, result: MatchResult) => void
  transferPlayer: (playerId: string, fromTeamId: string | null, toTeamId: string, fee: number, newContract?: { salaryPerWeek: number, startWeek: number, endWeek: number, buyout: number }) => { success: boolean; message?: string }
  scheduleScrim: (opponentId: string, week: number, day?: number) => { success: boolean, message: string }
  scheduleActivity: (activity: ActivitySaveData) => { success: boolean, message: string }


  // Tactics (Phase 17)
  unlockSkill: (playerId: string, skillId: string, cost: number) => void

  // Empire (Phase 18)
  upgradeFacility: (teamId: string, facilityType: FacilitySaveData["type"]) => void
  signSponsor: (teamId: string, sponsor: SponsorSaveData) => { success: boolean; message: string }
  refreshSponsorOffers: () => void
  declineSponsorOffer: (offerId: string) => void
  setTheme: (theme: "crystal" | "onyx") => void
  setPlaystyle: (teamId: string, playstyle: TeamSaveData["playstyle"]) => void
  setEconomyStyle: (teamId: string, economyStyle: TeamSaveData["economyStyle"]) => void
  setTargetPlayer: (teamId: string, targetPlayerId: string | undefined) => void
  performVODReview: (matchId: string) => void
  performMentalReset: (matchId?: string) => void

  // Equipment Shop
  purchaseEquipment: (catalogId: string) => { success: boolean; error?: string }
  // Squad Management
  swapRosterPositions: (teamId: string, index1: number, index2: number) => void
  promotePlayer: (playerId: string) => void

  // Multi-slot Save System
  listSaves: () => Promise<SaveSlotMetadata[]>
  switchSave: (saveId: string) => Promise<boolean>
  deleteSaveInSlot: (saveId: string) => Promise<void>
  deleteAllSaves: () => Promise<void>
  attemptSaveRecovery: (saveId: string) => Promise<boolean>
  clearLoadError: () => void

  // Phase 22: Professional Polish
  completeOnboarding: () => void
  completeTutorial: () => void
  triggerTutorial: () => void
  setShowTutorialOnNewGame: (enabled: boolean) => void
  setSoundEnabled: (enabled: boolean) => void

  // Phase 3: Career Moves
  switchTeam: (newTeamId: string) => void

  // Phase 60: Talent Trees
  unlockStaffTalent: (staffId: string, talentId: string) => void
  unlockPlayerTalent: (playerId: string, talentId: string) => void

  // Phase 9: Scouting
  startScoutingMission: (playerId: string) => void
  getScoutingLevel: (playerId: string) => string
  isPlayerScouted: (playerId: string) => boolean
  toggleWatchlistPlayer: (playerId: string) => void
  isPlayerWatchlisted: (playerId: string) => boolean

  // Phase 39: Customizable Tactical Loadouts
  updateCustomTactic: (id: keyof CustomTactics, side: "ct" | "t", strategy: TacticalStrategy) => void

  // Phase 56: Staff Market Actions
  refreshStaffMarket: () => void
  hireStaff: (staffId: string, terms?: { salary: number, duration: number, signingBonus: number }) => { success: boolean; message: string }
  renewStaffContract: (staffId: string, salary: number, duration: number) => { success: boolean; message: string }
  fireStaff: (staffId: string) => void

  // Getters / Helpers
  getPlayerTeam: () => TeamSaveData | undefined
  getUpcomingMatches: (limit?: number) => MatchSaveData[]
  calculateTeamRating: () => number
  runTeamDrill: (drillId: string, gains: { stat: string; amount: number }[], cost: number) => { success: boolean, message: string }
  getDateForWeek: (week: number) => Date

  // Debug
  debugAddFunds: (amount: number) => void
  debugHealAll: () => void
  debugMaxMorale: () => void
  debugTriggerJobOffer: () => void
  debugFastForward: (weeks: number) => void // Internal
  setHasHydrated: (state: boolean) => void

  // Phase 10: Role Training
  startRoleTraining: (playerId: string, targetRole: Role) => { success: boolean, message: string }
  cancelRoleTraining: (playerId: string) => void

  // Phase 24: Fan & Merch
  upgradeMerchStore: (teamId: string) => { success: boolean, message: string }
  toggleMerchItem: (teamId: string, itemType: string) => void
  setPlayerTrainingFocus: (playerId: string, focus: string) => void
  listPlayerForTransfer: (playerId: string, price: number) => void
  unlistPlayerForTransfer: (playerId: string) => void
  acceptTransferOffer: (eventId: string) => void
  renewContract: (playerId: string) => void

  // Phase 20: Tournament System
  registerForTournament: (tournamentId: string) => { success: boolean; message: string }
  checkTournamentEligibility: (tournamentId: string) => { eligible: boolean; reason: string } // New action
  qualifyForTournament: (tournamentId: string, via: string) => void
  awardCircuitPoints: (teamId: string, tournamentId: string, placement: number) => void

  // Match Management
  updateScheduledMatch: (matchId: string, updates: Partial<MatchSaveData>) => void
  simulateInstantMatch: (matchId: string) => Promise<void>

  // Generic Updates (Added for Flexibility)
  updatePlayer: (playerId: string, updates: Partial<PlayerSaveData>) => void
  updateTeamBudget: (teamId: string, amount: number) => void

  // Phase 60: Job Market
  acceptJobOffer: (eventId: string) => { success: boolean; message: string }
  declineJobOffer: (eventId: string) => void

  negotiateJobOffer: (eventId: string) => { success: boolean; message: string; newOffer?: number; withdrew?: boolean }

  // Immersive Content
  setWeeklyActivity: (type: import("@/types").WeeklyActivityType) => void

  // Navigation Guard
  setActiveMatch: (id: string | null) => void
  updateActiveMatchState: (state: ActiveMatchState) => void
  clearActiveMatchState: () => void

  // UI Celebrations
  clearCelebration: () => void
  clearPendingSeasonRecap: () => void
  selectLegend: (legendId: string) => void
  clearLegendPick: () => void
  debugTriggerCelebration: () => void
  debugTriggerInjury: (playerId?: string) => void
  debugTriggerLegendPick: () => void
  debugTriggerSeasonRecap: () => void
  debugTriggerRetirement: () => void
  debugBoostPlayerSkill: (playerId?: string, amount?: number) => void
  debugMaxAllSkills: () => void
  debugTriggerTransferOffer: () => void
  debugAddXP: (playerId?: string, amount?: number) => void
  debugSetPlayerAge: (playerId?: string, age?: number) => void
  treatInjury: (playerId: string) => void

  // Toast Notifications
  addToast: (toast: { message: string; type: "level_up" | "xp_gain" | "achievement" | "info" | "warning" | "error"; duration?: number }) => void
  removeToast: (id: string) => void

  // Phase 70: Youth Academy
  buildAcademy: (teamId: string) => { success: boolean; message: string }
  upgradeAcademy: (teamId: string) => { success: boolean; message: string }
  scoutProspect: (tier: import("@/types/academy").ScoutingTier) => { success: boolean; player?: import("@/engine/save-types").PlayerSaveData; message: string }
  enrollProspect: (playerId: string) => { success: boolean; message: string }
  setProspectTraining: (prospectId: string, focus: import("@/types/academy").AcademyTrainingFocus) => void
  releaseProspect: (prospectId: string, sellFee?: number) => { success: boolean; message: string }
  promoteProspect: (prospectId: string, contract: { salaryPerWeek: number; lengthWeeks: number }) => { success: boolean; message: string }
  scheduleDevMatch: () => { success: boolean; message: string }
  processAcademyWeek: () => void
  updateAcademyRoster: (role: string, prospectId: string | null) => void
  updateAcademySchedule: (day: number, drillId: string | null) => void
  discardPendingProspect: (playerId: string) => void
  enrollPendingProspect: (playerId: string) => { success: boolean; message: string }

  // Settings Actions
  setResolution: (res: string) => void
  setMasterVolume: (vol: number) => void
  setMusicVolume: (vol: number) => void
  setGameSpeed: (speed: "normal" | "fast" | "very-fast") => void
  setTimeMode: (mode: "WEEKLY" | "HYBRID_DAILY") => void
  setDifficulty: (difficulty: "easy" | "normal" | "hard" | "legendary") => void
  setAutoSave: (enabled: boolean) => void
  setNotifications: (enabled: boolean) => void
  setShowBugReportButton: (enabled: boolean) => void
}

export const useGameStore = create<GameStoreState & GameStoreActions>()(
  persist(
    immer((set, get) => ({
      // Slices — extracted into /store/slices for incremental modularization
      // of this 6k+ line store. Settings is the first slice extracted; the
      // surface remains identical because the spread happens at construction.
      ...createSettingsSlice(
        set as Parameters<typeof createSettingsSlice>[0],
        get as Parameters<typeof createSettingsSlice>[1],
      ),
      ...createScoutingSlice(
        set as Parameters<typeof createScoutingSlice>[0],
        get as Parameters<typeof createScoutingSlice>[1],
      ),

      // Initial State
      saveId: null,
      saveName: "",

      currentWeek: 0,
      currentDay: 0,
      timeMode: "HYBRID_DAILY",
      gameStartDate: new Date().toISOString(),
      managerDetails: {
        name: "Unknown",
        level: 1,
        xp: 0,
        reputation: 0,
        careerWins: 0,
        careerLosses: 0,
        championships: 0,
        totalKills: 0,
        totalHS: 0,
        careerMatches: 0,
        maxBudget: 100000
      },
      lastRngSeed: generateSeed(),

      teams: [],
      players: [],
      contracts: [],
      tournaments: [],
      staff: [],

      scheduledMatches: [],
      completedMatches: [],
      scheduledActivities: [],

      financeLedger: [],
      sponsorOffers: [],
      declinedSponsorOfferIds: [],
      eventsLog: [],
      acknowledgedEventIds: [],
      availableEquipment: [],

      // Immersive Content
      selectedWeeklyActivity: null,

      // Empire (Phase 18)
      theme: "crystal",

      // Phase 22
      onboardingCompleted: false,
      tutorialCompleted: false,
      showTutorialOnNewGame: true,
      manualTutorialTrigger: 0,
      soundEnabled: true,

      // Phase 23
      legendaryPlayers: [],
      hallOfFame: [],

      // Phase 9: Scouting
      scoutedPlayers: [],
      activeScoutingMission: undefined,
      watchlistedPlayerIds: [],

      // Phase 25
      selectedRegions: ["EU", "NA"], // Default regions

      // Phase 56: Staff Market
      marketStaff: [],
      nextMarketRefreshWeek: 8, // Initial offset

      // Phase 20: Tournament System
      circuitPoints: [],
      tournamentQualifications: [],

      // Transfer History System
      transferHistory: [],

      // Phase 70: Youth Academy
      academyPlayers: [],
      academyMatchHistory: [],
      academyRoster: { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null },
      academyTrainingSchedule: {},
      academyWeeklyReports: [],
      academyScoutingMissions: [],
      academyPendingProspects: [],

      // Phase 75: Game Settings
      resolution: "1920x1080",
      masterVolume: 80,
      musicVolume: 70,
      gameSpeed: "normal",
      difficulty: "normal",
      autoSave: true,
      notifications: true,
      showBugReportButton: true,

      // Game Over State
      gameOverReason: null,
      gameOverWeek: null,

      // UI Celebrations
      pendingCelebration: null,
      pendingSeasonRecap: null,
      pendingLegendPick: null,
      signedLegendIds: [],
      activelyPlayingLegendIds: [],
      clearCelebration: () => set(state => {
        state.pendingCelebration = null
      }),
      clearPendingSeasonRecap: () => set(state => {
        state.pendingSeasonRecap = null
      }),
      selectLegend: (legendId: string) => set(state => {
        if (!state.pendingLegendPick) return
        const candidates = state.pendingLegendPick.candidates
        if (!candidates.includes(legendId)) return

        // Find the legend in players array (they're pre-loaded as retired)
        const legend = (state._playerIndex?.get(legendId) ?? state.players.find(p => p.id === legendId))
        if (!legend) return

        const myTeam = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
        if (!myTeam) return

        // Reactivate the legend
        legend.isRetired = false
        legend.retirementWeek = undefined

        // Add to roster (prevent duplicate roster entries)
        if (!myTeam.rosterIds.includes(legendId)) {
          myTeam.rosterIds.push(legendId)
        }

        // Remove any existing contracts for this player before creating new one
        state.contracts = state.contracts.filter(c => c.playerId !== legendId)

        // Create contract (high salary for legends)
        const legendSalary = Math.round(50000 + legend.skill * 500) // $50k-$100k/wk
        state.contracts.push({
          playerId: legendId,
          teamId: myTeam.id,
          salaryPerWeek: legendSalary,
          startWeek: state.currentWeek,
          endWeek: state.currentWeek + 104, // 2 year contract
          buyout: legendSalary * 52,
        })

        // Track to prevent duplicates
        if (!state.signedLegendIds) state.signedLegendIds = []
        state.signedLegendIds.push(legendId)

        // Clear the pick
        state.pendingLegendPick = null
      }),
      clearLegendPick: () => set(state => {
        state.pendingLegendPick = null
      }),
      debugTriggerCelebration: () => set(state => {
        if (!debugToolsEnabled()) return
        state.pendingCelebration = {
          tournamentId: "major_copenhagen",
          tournamentName: "Copenhagen Major 2025",
          tier: "S_TIER",
          prize: 1250000,
          repGain: 25,
          fanGain: 250000,
          week: state.currentWeek,
          logoPath: "/assets/tournaments/logo_copenhagen_major.png",
          trophyPath: "/assets/tournaments/trophy_gold_new.png"
        }
      }),
      debugTriggerInjury: (playerId) => set(state => {
        if (!debugToolsEnabled()) return
        const targetId = playerId || (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))?.rosterIds[0];
        const player = (state._playerIndex?.get(targetId!) ?? state.players.find(p => p.id === targetId));
        if (player) {
          player.injury = {
            type: "RSI", // Using string literal matching type
            name: "Debug Repetitive Strain",
            description: "Forced injury for testing purposes.",
            severity: "MINOR",
            weeksRemaining: 3,
            isRecovering: true
          };
          // Toast
          state.toasts.push({
            id: nextDeterministicId(state, "toast_injury_debug", player.id),
            message: `${player.nickname} injured (DEBUG)`,
            type: "info"
          });
          // Event Log
          state.eventsLog.unshift({
            id: nextDeterministicId(state, "evt_injury_debug", player.id),
            type: "INJURY" as any,
            week: state.currentWeek,
            acknowledged: false,
            data: {
              playerId: player.id,
              title: "Debug Injury",
              message: "Debug injury triggered.",
              severity: "error"
            }
          });
        }
      }),

      debugTriggerLegendPick: () => set(state => {
        if (!debugToolsEnabled()) return
        const alreadySigned = state.signedLegendIds || []
        const available = LEGENDARY_PLAYERS.filter(
          lp => !alreadySigned.includes(lp.id)
        )
        if (available.length < 3) {
          state.toasts.push({ id: nextDeterministicId(state, "toast_debug"), message: "Not enough unsigned legends remaining!", type: "info" })
          return
        }
        // Fisher-Yates shuffle using seeded RNG (unbiased)
        const shuffled = [...available]
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(nextRandom(state) * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        state.pendingLegendPick = {
          tournamentName: "Debug Major Test",
          candidates: shuffled.slice(0, 3).map(p => p.id),
          week: state.currentWeek,
        }
        state.toasts.push({ id: nextDeterministicId(state, "toast_debug"), message: "Legend Pick triggered!", type: "info" })
      }),

      debugTriggerSeasonRecap: () => set(state => {
        if (!debugToolsEnabled()) return
        state.pendingSeasonRecap = state.currentWeek
        state.toasts.push({ id: nextDeterministicId(state, "toast_debug"), message: "Season Recap triggered!", type: "info" })
      }),

      debugTriggerRetirement: () => set(state => {
        if (!debugToolsEnabled()) return
        const myTeam = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
        if (!myTeam) return
        const rosterPlayers = myTeam.rosterIds
          .map(id => (state._playerIndex?.get(id) ?? state.players.find(p => p.id === id)))
          .filter(Boolean) as PlayerSaveData[]
        const candidate = rosterPlayers
          .filter(p => !p.isRetired && !p.isLegendary && p.age >= 20)
          .sort((a, b) => b.age - a.age)[0]
        if (!candidate) {
          state.toasts.push({ id: nextDeterministicId(state, "toast_debug"), message: "No eligible player to retire!", type: "info" })
          return
        }
        candidate.isRetired = true
        candidate.retirementWeek = state.currentWeek
        myTeam.rosterIds = myTeam.rosterIds.filter(id => id !== candidate.id)
        if (myTeam.activeRoleTraining) {
          myTeam.activeRoleTraining = myTeam.activeRoleTraining.filter((t: any) => t.playerId !== candidate.id)
        }
        state.contracts = state.contracts.filter(c => c.playerId !== candidate.id)
        if (state.newsFeed) {
          state.newsFeed.unshift({
            id: nextDeterministicId(state, "news_retirement_debug", candidate.id),
            title: `${candidate.nickname} announces retirement (DEBUG)`,
            content: `${candidate.nickname} has retired from professional esports at age ${candidate.age}.`,
            category: "RETIREMENT",
            playerId: candidate.id,
            teamId: myTeam.id,
            week: state.currentWeek,
            engagement: { likes: 1000, views: 5000 }
          })
        }
        state.toasts.push({ id: nextDeterministicId(state, "toast_debug"), message: `${candidate.nickname} (age ${candidate.age}) retired!`, type: "info" })
      }),

      debugBoostPlayerSkill: (playerId, amount = 5) => set(state => {
        if (!debugToolsEnabled()) return
        const myTeam = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
        if (!myTeam) return
        const targetId = playerId || myTeam.rosterIds[0]
        const player = (state._playerIndex?.get(targetId) ?? state.players.find(p => p.id === targetId))
        if (!player) return
        player.skill = Math.min(99, player.skill + amount)
        state.toasts.push({ id: nextDeterministicId(state, "toast_debug"), message: `${player.nickname} skill +${amount} → ${player.skill}`, type: "level_up" })
      }),

      debugMaxAllSkills: () => set(state => {
        if (!debugToolsEnabled()) return
        const myTeam = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
        if (!myTeam) return
        let count = 0
        myTeam.rosterIds.forEach(id => {
          const player = (state._playerIndex?.get(id) ?? state.players.find(p => p.id === id))
          if (player) { player.skill = 99; count++ }
        })
        state.toasts.push({ id: nextDeterministicId(state, "toast_debug"), message: `${count} players set to skill 99!`, type: "level_up" })
      }),

      debugTriggerTransferOffer: () => set(state => {
        if (!debugToolsEnabled()) return
        const myTeam = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
        if (!myTeam || myTeam.rosterIds.length === 0) return
        const bestPlayer = myTeam.rosterIds
          .map(id => (state._playerIndex?.get(id) ?? state.players.find(p => p.id === id)))
          .filter(Boolean)
          .sort((a: any, b: any) => b.skill - a.skill)[0] as PlayerSaveData | undefined
        if (!bestPlayer) return
        const aiTeam = state.teams.find(t => t.id !== state.playerTeamId && t.tier === "ELITE")
        if (!aiTeam) return
        const offerAmount = Math.round(bestPlayer.skill * 5000 + 100000)
        state.eventsLog.unshift({
          id: nextDeterministicId(state, "evt_transfer_debug", bestPlayer.id),
          type: "TRANSFER_OFFER" as any,
          week: state.currentWeek,
          acknowledged: false,
          data: {
            playerId: bestPlayer.id,
            teamId: aiTeam.id,
            teamName: aiTeam.name,
            playerName: bestPlayer.nickname,
            title: `${aiTeam.name} wants to sign ${bestPlayer.nickname}`,
            message: `${aiTeam.name} has offered $${offerAmount.toLocaleString()} for ${bestPlayer.nickname} (skill ${bestPlayer.skill}).`,
            offerAmount,
            severity: "info"
          }
        } as any)
        state.toasts.push({ id: nextDeterministicId(state, "toast_debug"), message: `Transfer offer for ${bestPlayer.nickname}!`, type: "info" })
      }),

      debugAddXP: (playerId, amount = 500) => set(state => {
        if (!debugToolsEnabled()) return
        const myTeam = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
        if (!myTeam) return
        const targetId = playerId || myTeam.rosterIds[0]
        const player = (state._playerIndex?.get(targetId) ?? state.players.find(p => p.id === targetId))
        if (!player) return
        player.xp = (player.xp || 0) + amount
        const xpNeeded = (player.level || 1) * 1000
        if (player.xp >= xpNeeded) {
          player.xp -= xpNeeded
          player.level = (player.level || 1) + 1
          player.talentPoints = (player.talentPoints || 0) + 1
          state.toasts.push({ id: nextDeterministicId(state, "toast_debug"), message: `${player.nickname} LEVELED UP to ${player.level}!`, type: "level_up" })
        } else {
          state.toasts.push({ id: nextDeterministicId(state, "toast_debug"), message: `${player.nickname} +${amount} XP (${player.xp}/${xpNeeded})`, type: "xp_gain" })
        }
      }),

      debugSetPlayerAge: (playerId, age = 37) => set(state => {
        if (!debugToolsEnabled()) return
        const myTeam = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
        if (!myTeam) return
        const targetId = playerId || myTeam.rosterIds[0]
        const player = (state._playerIndex?.get(targetId) ?? state.players.find(p => p.id === targetId))
        if (!player) return
        player.age = age
        state.toasts.push({ id: nextDeterministicId(state, "toast_debug"), message: `${player.nickname} age set to ${age}`, type: "info" })
      }),

      treatInjury: (playerId) => set(state => {
        const player = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId));
        const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId));
        if (!player || !player.injury || !team) return;

        const COST = 5000;
        if (team.budget < COST) {
          state.toasts.push({ id: nextDeterministicId(state, "toast_treatment_error"), message: "Insufficient funds ($5k required)", type: "info" });
          return;
        }

        team.budget -= COST;
        player.injury.weeksRemaining = Math.max(0, player.injury.weeksRemaining - 2);

        // Log expense
        state.financeLedger.push({
          id: nextDeterministicId(state, "fin_treat", player.id),
          week: state.currentWeek,
          teamId: team.id,
          type: "EXPENSE",
          category: "FACILITIES",
          amount: COST,
          description: `Specialist treatment for ${player.nickname}`,
          balance: team.budget
        });

        // Log Event
        state.eventsLog.unshift({
          id: nextDeterministicId(state, "evt_treat_injury", player.id),
          type: "INJURY" as any,
          week: state.currentWeek,
          acknowledged: true,
          data: {
            playerId: player.id,
            title: "Medical Specialist Hired",
            message: `Expert treatment provided for ${player.nickname}. Recovery expedited by 2 weeks.`,
            severity: "success"
          }
        });

        state.toasts.push({ id: nextDeterministicId(state, "toast_treatment_success"), message: "Treatment successful!", type: "info" });
      }),

      // Toast Notifications (UI-only, transient)
      toasts: [],
      addToast: (toast) => set(state => {
        const id = nextDeterministicId(state, "toast")
        state.toasts.push({ ...toast, id })
      }),
      removeToast: (id) => set(state => {
        state.toasts = state.toasts.filter(t => t.id !== id)
      }),

      // Phase 21: Career Narrative
      newsFeed: [],
      addNewsItem: (item) => set(state => {
        const id = nextDeterministicId(state, "news")
        state.newsFeed.unshift({
          ...item,
          id,
          week: state.currentWeek
        })
        // Keep feed manageable
        if (state.newsFeed.length > 50) {
          state.newsFeed.pop()
        }
      }),

      // Navigation Guard
      activeMatchId: null,
      activeMatchState: null,
      setActiveMatch: (id) => set({ activeMatchId: id }),
      updateActiveMatchState: (newState) => set({ activeMatchState: newState }),
      clearActiveMatchState: () => set({ activeMatchState: null, activeMatchId: null }),

      updateCustomTactic: (id, side, tactic) => {
        set(state => {
          if (!state.customTactics[id]) return
          state.customTactics[id][side] = tactic
        })
      },

      // Phase 39/43: Default Tactics with Per-Player Loadouts
      customTactics: {
        ECO: {
          ct: {
            primaryWeaponId: "usp", secondaryWeaponId: "usp", armorTier: "NONE", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "usp", secondaryWeaponId: "usp", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "usp", secondaryWeaponId: "usp", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "usp", secondaryWeaponId: "usp", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "usp", secondaryWeaponId: "usp", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "usp", secondaryWeaponId: "usp", armorTier: "NONE", hasKit: false, utility: [] }
            ]
          },
          t: {
            primaryWeaponId: "glock", secondaryWeaponId: "glock", armorTier: "NONE", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "glock", secondaryWeaponId: "glock", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "glock", secondaryWeaponId: "glock", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "glock", secondaryWeaponId: "glock", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "glock", secondaryWeaponId: "glock", armorTier: "NONE", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "glock", secondaryWeaponId: "glock", armorTier: "NONE", hasKit: false, utility: [] }
            ]
          }
        },
        FORCE: {
          ct: {
            primaryWeaponId: "mp9", secondaryWeaponId: "fiveseven", armorTier: "LIGHT", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "mp9", secondaryWeaponId: "fiveseven", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "mp9", secondaryWeaponId: "fiveseven", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "mp9", secondaryWeaponId: "fiveseven", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "mp9", secondaryWeaponId: "fiveseven", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "mp9", secondaryWeaponId: "fiveseven", armorTier: "LIGHT", hasKit: false, utility: [] }
            ]
          },
          t: {
            primaryWeaponId: "mac10", secondaryWeaponId: "p250", armorTier: "LIGHT", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "mac10", secondaryWeaponId: "p250", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "mac10", secondaryWeaponId: "p250", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "mac10", secondaryWeaponId: "p250", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "mac10", secondaryWeaponId: "p250", armorTier: "LIGHT", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "mac10", secondaryWeaponId: "p250", armorTier: "LIGHT", hasKit: false, utility: [] }
            ]
          }
        },
        SEMIBUY: {
          ct: {
            primaryWeaponId: "famas", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "famas", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "famas", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "famas", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "famas", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "famas", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: false, utility: [] }
            ]
          },
          t: {
            primaryWeaponId: "galil", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "galil", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "galil", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "galil", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "galil", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "galil", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] }
            ]
          }
        },
        FULL: {
          ct: {
            primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "awp", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] }
            ]
          },
          t: {
            primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "awp", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "RIFLER", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] }
            ]
          }
        },
        "DOUBLE AWP": {
          ct: {
            primaryWeaponId: "awp", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "awp", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 1, roleHint: "AWPER", primaryWeaponId: "awp", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "m4a1s", secondaryWeaponId: "usp", armorTier: "HEAVY", hasKit: true, utility: [] }
            ]
          },
          t: {
            primaryWeaponId: "awp", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [],
            playerLoadouts: [
              { slotIndex: 0, roleHint: "AWPER", primaryWeaponId: "awp", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 1, roleHint: "AWPER", primaryWeaponId: "awp", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 2, roleHint: "RIFLER", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 3, roleHint: "SUPPORT", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] },
              { slotIndex: 4, roleHint: "IGL", primaryWeaponId: "ak47", secondaryWeaponId: "glock", armorTier: "HEAVY", hasKit: false, utility: [] }
            ]
          }
        }
      },

      playerTeamId: null,
      isLoading: false,
      error: null,
      lastLoadError: null,
      isInitialized: false,
      _hasHydrated: false,

      // Entity indexes (transient, rebuilt on hydration and after advanceWeek)
      _teamIndex: new Map(),
      _playerIndex: new Map(),
      _contractByPlayerIndex: new Map(),
      _staffIndex: new Map(),
      _completedMatchIds: new Set(),

      // Actions
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      scheduleScrim: (opponentId, week, day) => {
        const state = get()
        const weekValidation = parseBoundedInt(week, "Scrim week", state.currentWeek, 100000)
        if (!weekValidation.ok) {
          return { success: false, message: weekValidation.message }
        }
        const normalizedWeek = weekValidation.value

        let normalizedDay: number | undefined = undefined
        if (day !== undefined) {
          const dayValidation = parseBoundedInt(day, "Scrim day", 0, 6)
          if (!dayValidation.ok) {
            return { success: false, message: dayValidation.message }
          }
          normalizedDay = dayValidation.value
        }

        if (
          state.timeMode === "HYBRID_DAILY" &&
          normalizedWeek === state.currentWeek &&
          normalizedDay !== undefined &&
          normalizedDay < state.currentDay
        ) {
          return { success: false, message: "Cannot schedule events in past days of the current week." }
        }

        const weekActivities = state.scheduledActivities.filter(a => normalizedWeek >= a.week && normalizedWeek < a.week + a.duration)
        const weekMatches = state.scheduledMatches.filter(m => m.week === normalizedWeek)

        const duplicateScrim = weekMatches.some(m =>
          m.isScrim &&
          m.homeTeamId === state.playerTeamId &&
          m.awayTeamId === opponentId &&
          (normalizedDay === undefined || (m.day ?? undefined) === normalizedDay)
        )
        if (duplicateScrim) {
          return { success: false, message: "Scrim already scheduled for this slot" }
        }

        // Count slots used for this specific day if provided
        if (normalizedDay !== undefined) {
          const dayMatches = weekMatches.filter(m => m.day === normalizedDay)
          if (dayMatches.length >= 2) {
            return { success: false, message: "Day schedule is full (max 2 events per day)" }
          }
        }

        if (weekActivities.length + weekMatches.length >= 10) {
          return { success: false, message: "Weekly schedule is full (max 10 slots)" }
        }

        set(state => {
          const id = nextDeterministicId(state, "scrim", normalizedWeek, opponentId)
          state.scheduledMatches.push({
            id,
            homeTeamId: state.playerTeamId!,
            awayTeamId: opponentId,
            tournamentId: "SCRIM",
            stage: "Practice",
            week: normalizedWeek,
            day: normalizedDay,
            format: "BO1",
            seed: 0,
            isScrim: true
          })
        })
        return { success: true, message: "Scrim scheduled" }
      },

      scheduleActivity: (activity) => {
        const state = get()
        const weekValidation = parseBoundedInt(activity.week, "Activity week", state.currentWeek, 100000)
        if (!weekValidation.ok) {
          return { success: false, message: weekValidation.message }
        }
        const durationValidation = parseBoundedInt(activity.duration, "Activity duration", 1, 52)
        if (!durationValidation.ok) {
          return { success: false, message: durationValidation.message }
        }
        const costValidation = parseBoundedInt((activity as any).cost ?? 0, "Activity cost", 0, MAX_TRANSFER_FEE)
        if (!costValidation.ok) {
          return { success: false, message: costValidation.message }
        }

        const normalizedDay = activity.day
        if (normalizedDay !== undefined) {
          const dayValidation = parseBoundedInt(normalizedDay, "Activity day", 0, 6)
          if (!dayValidation.ok) {
            return { success: false, message: dayValidation.message }
          }
        }

        const normalizedActivity = {
          ...activity,
          week: weekValidation.value,
          duration: durationValidation.value,
          cost: costValidation.value,
          day: normalizedDay !== undefined ? Math.floor(normalizedDay) : undefined
        }

        if (
          state.timeMode === "HYBRID_DAILY" &&
          normalizedActivity.week === state.currentWeek &&
          normalizedActivity.day !== undefined &&
          normalizedActivity.day < state.currentDay
        ) {
          return { success: false, message: "Cannot schedule events in past days of the current week." }
        }

        const week = normalizedActivity.week
        const weekActivities = state.scheduledActivities.filter(a => week >= a.week && week < a.week + a.duration)
        const weekMatches = state.scheduledMatches.filter(m => m.week === week)

        if (weekActivities.length + weekMatches.length >= 10) {
          return { success: false, message: "Weekly schedule is full (max 10 slots)" }
        }

        // Fatigue check for Bootcamps
        if (normalizedActivity.type === "BOOTCAMP" && normalizedActivity.duration >= 1) {
          const playerTeam = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          const players = state.players.filter(p => playerTeam?.rosterIds.includes(p.id))
          const avgFatigue = players.reduce((acc, p) => acc + p.fatigue, 0) / (players.length || 1)

          if (avgFatigue > 80) {
            return { success: false, message: "Team is too exhausted for a bootcamp (Avg Fatigue > 80)" }
          }
        }

        set(state => {
          state.scheduledActivities.push(normalizedActivity as ActivitySaveData)
        })
        return { success: true, message: "Activity scheduled" }
      },



      unlockPlayerTalent: (playerId: string, talentId: string) => {
        const node = PLAYER_TALENT_TREE.find(n => n.id === talentId)
        if (!node) return

        set(state => {
          const p = state.players.find(pl => pl.id === playerId)
          if (!p) return

          if (!p.unlockedTalentIds) p.unlockedTalentIds = []
          if (p.unlockedTalentIds.includes(talentId)) return // Already unlocked

          // Check Logic (inside set() to prevent TOCTOU)
          const hasPoints = (p.talentPoints || 0) >= node.cost
          const requirementsMet = node.requirements.every(req => p.unlockedTalentIds.includes(req))
          if (!hasPoints || !requirementsMet) return

          if (p) {
            p.talentPoints -= node.cost
            if (!p.unlockedTalentIds) p.unlockedTalentIds = []
            p.unlockedTalentIds.push(talentId)

            // Apply Effect
            if (node.effect) {
              const clamp = (v: number) => Math.max(0, Math.min(100, v))
              switch (node.effect.type) {
                case "STAT_BOOST":
                  if (node.effect.target === "all") {
                    // Boost specific visible stats (clamped to 0-100)
                    p.skill = clamp(p.skill + node.effect.value)
                    p.rifle = clamp(p.rifle + node.effect.value)
                    p.awp = clamp(p.awp + node.effect.value)
                    p.creativity = clamp(p.creativity + node.effect.value)
                    p.tactic = clamp(p.tactic + node.effect.value)
                    p.teamwork = clamp(p.teamwork + node.effect.value)
                    p.clutch = clamp(p.clutch + node.effect.value)
                  } else {
                    // Properly typed stat modification (clamped to 0-100)
                    const target = node.effect.target as keyof typeof p
                    if (typeof p[target] === 'number') {
                      (p[target] as number) = clamp((p[target] as number) + node.effect.value)
                    }
                  }
                  break;
                // Passive bonuses are read dynamically elsewhere, effectively "unlocked" by ID presence
              }
            }

            // Log
            state.eventsLog.unshift({
              id: nextDeterministicId(state, "evt_talent", playerId, talentId),
              type: "TRAINING_COMPLETE", // Reusing training type for positive growth
              week: state.currentWeek,
              data: {
                title: "Talent Unlocked",
                message: `${p.nickname} unlocked '${node.name}'`,
                severity: "success"
              },
              acknowledged: false
            })
          }
        })
      },

      registerForTournament: (tournamentId: string) => {
        const state = get()
        const identity = resolveTournamentIdentity(tournamentId, state.currentWeek)
        const baseId = identity.seriesId || getSeriesIdFromTournamentId(tournamentId)
        const definition = FULL_TOURNAMENT_CALENDAR.find(t => t.id === baseId)
        if (!definition) return { success: false, message: "Tournament not found" }

        if (!state.playerTeamId) return { success: false, message: "No player team" }

        let seasonNumber = getSeasonFromTournamentId(tournamentId) ?? identity.seasonNumber
        if (!getSeasonFromTournamentId(tournamentId)) {
          let absoluteStart = ((seasonNumber - 1) * 52) + definition.startWeek
          while (absoluteStart < state.currentWeek) {
            seasonNumber += 1
            absoluteStart += 52
          }
        }

        const instanceId = buildInstanceId(baseId, seasonNumber)

        // Check if already registered for this series + season
        const existing = state.tournamentQualifications.find(
          q => q.teamId === state.playerTeamId && isQualificationForTournament(q, instanceId, state.currentWeek)
        )
        if (existing) return { success: false, message: "Already registered or qualified" }

        // Check if this is a qualifier and player is already in main tournament
        if (definition.qualifierFor) {
          const mainTournamentId = buildInstanceId(definition.qualifierFor, seasonNumber)
          const isInMain = state.tournamentQualifications.some(q =>
            isQualificationForTournament(q, mainTournamentId, state.currentWeek) &&
            q.teamId === state.playerTeamId &&
            (q.status === "QUALIFIED" || q.status === "REGISTERED")
          )
          if (isInMain) {
            const mainTournament = FULL_TOURNAMENT_CALENDAR.find(t => t.id === definition.qualifierFor)
            return {
              success: false,
              message: `Already qualified for ${mainTournament?.name || "main tournament"}. Cannot enter qualifier.`
            }
          }

          // Check if already registered for another qualifier for the same main event
          const siblingQualifiers = FULL_TOURNAMENT_CALENDAR.filter(
            t => t.qualifierFor === definition.qualifierFor && t.id !== baseId
          )
          for (const sibling of siblingQualifiers) {
            const siblingInstanceId = buildInstanceId(sibling.id, seasonNumber)
            const isInSibling = state.tournamentQualifications.some(q =>
              isQualificationForTournament(q, siblingInstanceId, state.currentWeek) &&
              q.teamId === state.playerTeamId &&
              (q.status === "QUALIFIED" || q.status === "REGISTERED")
            )
            if (isInSibling) {
              return {
                success: false,
                message: `Already registered for ${sibling.name || sibling.shortName}. Cannot enter multiple qualifiers for the same tournament.`
              }
            }
          }
        }

        set(state => {
          const registration = normalizeQualificationStatus({
            tournamentId: instanceId,
            seriesId: baseId,
            instanceId,
            seasonNumber,
            teamId: state.playerTeamId!,
            status: "REGISTERED"
          }, state.currentWeek)

          state.tournamentQualifications.push(registration)

          // Log confirmation event
          state.eventsLog.push({
            id: nextDeterministicId(state, "evt_reg", instanceId),
            type: "TOURNAMENT_UPDATE",
            week: state.currentWeek,
            acknowledged: false,
            data: {
              tournamentId: instanceId,
              title: "Registration Confirmed",
              message: `Your team has successfully registered for ${definition.name}. Check your schedule for upcoming qualification matches.`,
              sender: "Tournament Ops",
              severity: "success"
            }
          })
        })
        return { success: true, message: `Registered for ${definition.name}` }
      },

      checkTournamentEligibility: (tournamentId: string) => {
        const state = get()
        const { QualificationEngine } = require("@/engine/tournament-qualification")
        const seriesId = getSeriesIdFromTournamentId(tournamentId)
        let tournament = FULL_TOURNAMENT_CALENDAR.find(t => t.id === seriesId)
        if (!tournament) return { eligible: false, reason: "Tournament not found" }

        const myTeam = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
        if (!myTeam) return { eligible: false, reason: "Team not found" }

        const seasonNumber = getSeasonFromTournamentId(tournamentId) ?? getSeasonFromWeek(state.currentWeek)

        // Check if this is a qualifier and player is already in main tournament
        if (tournament.qualifierFor) {
          const mainTournamentId = buildInstanceId(tournament.qualifierFor, seasonNumber)
          const isInMain = state.tournamentQualifications.some(q =>
            isQualificationForTournament(q, mainTournamentId, state.currentWeek) &&
            q.teamId === state.playerTeamId &&
            (q.status === "QUALIFIED" || q.status === "REGISTERED")
          )
          if (isInMain) {
            const mainTournament = FULL_TOURNAMENT_CALENDAR.find(t => t.id === mainTournamentId)
            return {
              eligible: false,
              reason: `Already qualified for ${mainTournament?.name || "main tournament"}`
            }
          }
        }

        const eligibility = QualificationEngine.checkEligibility(
          tournament,
          myTeam,
          myTeam.worldRanking || 999,
          state.circuitPoints,
          state.tournamentQualifications
        )

        return {
          eligible: eligibility.canRegister,
          reason: eligibility.reason
        }
      },

      initAchievements: () => {
        void steamAchievements.setActiveSave(get().saveId)
        steamAchievements.initialize((achievement) => {
          get().addToast({
            message: `Achievement Unlocked: ${achievement.name}`,
            type: "achievement"
          })
        })
      },

      initializeNewGame: async (saveName, playerTeamId) => {
        set({ isLoading: true, error: null })
        try {
          // Ensure snapshot is loaded
          if (!snapshotLoader.getSnapshot()) {
            await snapshotLoader.loadSnapshot()
          }

          // Initialize Steam Achievements
          steamAchievements.initialize((achievement) => {
            get().addToast({
              message: `Achievement Unlocked: ${achievement.name}`,
              type: "achievement"
            })
          })

          // Create new save from snapshot
          const newSave = snapshotLoader.createCareerFromSnapshot(saveName, playerTeamId, 1)

          if (!newSave) {
            throw new Error("Failed to create save from snapshot")
          }

          await steamAchievements.setActiveSave(newSave.saveId)
          // Initialize Phase 18: The Empire fields for new save
          newSave.players.forEach((p: any) => {
            if (!p.perks) p.perks = []
            if (!p.roleMastery) p.roleMastery = { [p.role]: 75 }
            if (p.availableSkillPoints === undefined) p.availableSkillPoints = 2
          })


          newSave.teams.forEach((t: any) => {
            {
              const roster = newSave.players.filter((p: any) => t.rosterIds.includes(p.id))
              t.synergyMatrix = SynergyCalculator.calculateTeamMatrix(roster)
            }
            if (!t.facilities) t.facilities = [
              { id: "room_train", type: "TRAINING", level: 1, description: "Basic training setup", monthlyCost: 1000 },
              { id: "room_rec", type: "RECOVERY", level: 1, description: "Rest area", monthlyCost: 500 }
            ]
            if (!t.sponsors) t.sponsors = []
            if (t.merchHype === undefined) t.merchHype = 10

            // Initialize Budget based on Tier/Reputation (0-100 scale)
            let calculatedBudget = 250000 // Low Tier
            if (t.reputation > 80) calculatedBudget = 2000000 // Top Tier
            else if (t.reputation > 50) calculatedBudget = 1000000 // High Tier
            else if (t.reputation > 0) calculatedBudget = 500000 // Mid Tier

            // Check for incomplete roster and inject funds to ensure they can fill the squad
            if (t.rosterIds.length < 5) {
              const missingCount = 5 - t.rosterIds.length
              const teammates = newSave.players.filter((p: any) => t.rosterIds.includes(p.id))

              // Get world ranking for this team
              const ranking = t.worldRanking || 50

              // Calculate target value based on MINIMUM valued player (more realistic)
              let targetValue = 150000 // Bare minimum fallback
              if (teammates.length > 0) {
                const values = teammates.map((p: any) => {
                  const evaluation = evaluatePlayer(p)
                  return evaluation.transferValue
                }).sort((a: number, b: number) => a - b)

                // Use the lowest-valued player as the target
                targetValue = values[0]

                // Apply world ranking modifier - lower ranked teams get budget for cheaper players
                let rankingModifier = 1.0
                if (ranking > 100) rankingModifier = 0.4
                else if (ranking > 50) rankingModifier = 0.6
                else if (ranking > 20) rankingModifier = 0.8

                targetValue = Math.round(targetValue * rankingModifier)
              }

              // Injection: Target Value × Missing Count (realistic budget)
              const injection = Math.round(targetValue * missingCount)
              calculatedBudget += injection
            }

            // Apply calculated budget if missing or lower (unless manually set higher in JSON)
            if (t.startingBudget === undefined || t.startingBudget < calculatedBudget) {
              t.startingBudget = calculatedBudget
            }
            // ALWAYS set current budget to startingBudget (fix for $0 bug)
            t.budget = t.startingBudget
          })

          // Initialize Elo and Tiers (Phase 19)
          AIManager.initializeTeamData(newSave)

          const initialEquipment: EquipmentItem[] = [
            { id: "mouse_001", name: "Logi Elite G", type: "MOUSE", weeklyCost: 0, tier: 1, purchasedWeek: 0, bonus: { stat: "skill", value: 2 } },
            { id: "kbd_001", name: "Mech-X 60%", type: "KEYBOARD", weeklyCost: 0, tier: 1, purchasedWeek: 0, bonus: { stat: "reaction", value: 3 } },
            { id: "mon_001", name: "UltraSync 360Hz", type: "MONITOR", weeklyCost: 0, tier: 2, purchasedWeek: 0, bonus: { stat: "eyesight", value: 5 } },
          ]

          // Phase 10: Role Refinement Sweep (Ensure balanced specialties)
          reconcileAllRoles(newSave.teams, newSave.players)

          // Initialize career history for all players (Phase 3 improvements)
          PreSeasonTransferProcessor.initializeCareerHistory(newSave)

          // Run pre-season transfer window (first 3 days)
          const transferResult = PreSeasonTransferProcessor.processPreSeasonWindow(newSave, playerTeamId)

          // Apply results
          newSave.eventsLog.push(...transferResult.events)
          newSave.transferHistory = transferResult.transfers

          // Get the selected team for welcome message
          const selectedTeam = newSave.teams.find((t: any) => t.id === playerTeamId)
          const teamRoster = newSave.players.filter((p: any) => selectedTeam?.rosterIds?.includes(p.id))
          const avgRating = teamRoster.length > 0
            ? Math.round(teamRoster.reduce((acc: number, p: any) => acc + (p.skill || 75), 0) / teamRoster.length)
            : 75

          // Add Welcome Mail
          newSave.eventsLog.unshift({
            id: `evt_welcome_${newSave.currentWeek}_${newSave.saveId}`,
            type: "CAREER_UPDATE",
            week: 1,
            acknowledged: false,
            data: {
              title: `Welcome to ${selectedTeam?.name || 'Your New Team'}!`,
              message: `Congratulations on your appointment as head coach! Here's what you need to know:\n\n` +
                `🎮 YOUR TEAM\n` +
                `You're managing ${selectedTeam?.name || 'your team'} with ${teamRoster.length} player${teamRoster.length !== 1 ? 's' : ''} on the roster. ` +
                `Your current average team rating is ${avgRating}.\n\n` +
                `📋 FIRST STEPS\n` +
                `• Review your roster in the Squad page — know your players' strengths\n` +
                `• Check the Schedule to see upcoming matches\n` +
                `• Visit Training to start improving your players\n` +
                `• Keep an eye on your Budget in Finances\n\n` +
                `💡 KEY TIPS\n` +
                `• Player morale affects performance — keep it high!\n` +
                `• Don't overtrain — exhausted players perform poorly\n` +
                `• Save money for the transfer window to improve your roster\n` +
                `• Watch your players' contract expiration dates\n\n` +
                `🏆 YOUR GOAL\n` +
                `Build a championship-winning team! Start by competing in local tournaments, climb the rankings, and eventually qualify for a Major.\n\n` +
                `Click 'Advance Week' when you're ready to begin. Good luck, Coach!`,
              severity: "success"
            }
          })

          // Phase 80: Initialize FPL System with Non-Pro Players
          const { generateFPLNonProPlayers } = require("@/engine/fpl-player-generator")
          const { initializeFPL } = require("@/engine/fpl-engine")

          // Generate non-pro FPL players (streamers, semi-pros, grinders, etc.)
          const fplGeneratorRng = new SeededRNG(newSave.lastRngSeed || generateSeed())
          const { players: nonProPlayers, metadata: nonProMetadata } = generateFPLNonProPlayers(
            newSave.currentWeek,
            fplGeneratorRng
          )

          // Add non-pro players to the player pool
          newSave.players.push(...nonProPlayers)

          // Initialize FPL with all players (including non-pros)
          newSave.fplData = initializeFPL(newSave.players, newSave.currentWeek)
          if (newSave.fplData) {
            newSave.fplData.nonProPlayers = nonProMetadata
          }

          // Initial Save
          await saveManager.saveGame(newSave)

          // Update Store
          set({
            ...newSave,
            availableEquipment: initialEquipment,
            playerTeamId: playerTeamId, // We assume the user controls the team they selected
            theme: "crystal", // Default theme for new game
            tutorialCompleted: false, // Reset tutorial for new game
            onboardingCompleted: false, // Reset onboarding for new game
            showTutorialOnNewGame: true, // Always enable tutorial for new games
            isInitialized: true,
            isLoading: false
          })
          // Rebuild entity indexes after new game initialization
          const newState = get()
          set(buildEntityIndexes(newState.teams, newState.players, newState.contracts, newState.staff, newState.completedMatches))
          get().refreshStaffMarket()
        } catch (err) {
          const message = err instanceof Error ? err.message : "Initialization failed"
          set({ isLoading: false, error: message })
          get().addToast({ message: `Could not start new game: ${message}`, type: "error", duration: 8000 })
        }
      },

      /**
       * Initialize a custom team for "Build Your Own Team" mode
       */
      initializeCustomTeam: async (managerName, teamData) => {
        set({ isLoading: true, error: null })
        try {
          // Import team creator engine
          const { createCustomTeam, generateCustomTeamData } = await import("@/engine/team-creator")
          const { DIFFICULTY_SETTINGS } = await import("@/types/team-creator")

          // Ensure snapshot is loaded (for world data, other teams, free agents)
          if (!snapshotLoader.getSnapshot()) {
            await snapshotLoader.loadSnapshot()
          }

          // Create custom team
          const result = createCustomTeam(teamData)
          if (!result.success) {
            throw new Error(result.error || "Failed to create team")
          }

          // Generate full team data
          const customTeamSaveData = generateCustomTeamData(teamData, result.teamId)

          const snapshot = snapshotLoader.getSnapshot()
          if (!snapshot) throw new Error("No snapshot loaded")

          // Get difficulty settings
          const diffSettings = DIFFICULTY_SETTINGS[teamData.difficulty]

          // ===== USE PROVEN createCareerFromSnapshot PATH =====
          // Use the first snapshot team as a temporary playerTeamId.
          // createCareerFromSnapshot produces a fully valid GameSave with:
          //   - All teams converted via snapshotTeamToSaveTeam (all fields populated)
          //   - All players converted via snapshotPlayerToSavePlayer (seeded RNG)
          //   - Seeded RNG contracts via generateContracts
          //   - LEGENDARY_PLAYERS included in players array
          //   - Initial match schedule generated
          //   - reconcileTeamRoles called per team
          //   - Hall of Fame with FOUNDING_LEGENDS
          const tempTeamId = snapshot.teams[0].id
          const newSave = snapshotLoader.createCareerFromSnapshot(managerName, tempTeamId, 1)
          if (!newSave) throw new Error("Failed to create base save from snapshot")

          // ===== OVERLAY CUSTOM TEAM =====
          // Calculate budget with recruitment bonus for empty rosters
          const baseBudget = diffSettings.startingBudget
          const recruitmentBonus = Math.round(baseBudget * 0.3) // +30% for empty roster
          const totalBudget = baseBudget + recruitmentBonus

          const newTeamEntry: any = {
            ...customTeamSaveData,
            shortName: teamData.shortName.toUpperCase(), // Team tag
            tier: "AMATEUR",
            staffIds: [],
            trainingSlotsUsed: 0,
            maxTrainingSlots: 3,
            budget: totalBudget, // Includes recruitment bonus
            leagueTier: "C_TIER",
            worldRanking: 150, // Start at bottom
            facilities: [
              { id: "room_train", type: "TRAINING" as const, level: 1, description: "Basic training setup", monthlyCost: 500 },
            ],
            sponsors: [],
            merchHype: 5,
            trophies: [],
            recentForm: [],
            equipment: [],
            // Fields required by TeamSaveData (from snapshotTeamToSaveTeam parity)
            followers: (customTeamSaveData.fanbase || 1000) * 5,
            merchStoreLevel: 1,
            activeMerchItems: ["JERSEY"],
            description: `${teamData.name} is a newly founded esports organization competing in the ${teamData.region || 'Global'} region.`,
            playstyle: "default",
            tacticalPrep: 0,
            youthAcademyIds: [],
          }

          // Add custom team to the save
          newSave.teams.push(newTeamEntry)

          // Switch playerTeamId to custom team
          newSave.playerTeamId = result.teamId

          // Update manager details with custom difficulty settings
          newSave.managerDetails.reputation = diffSettings.startingReputation

          // Add circuit points for custom team
          newSave.circuitPoints.push({
            teamId: result.teamId,
            points: 0, // Custom team starts with 0 circuit points
            results: []
          })

          // Add custom team to eligible tournaments + update standings
          const tierOrder = ["ELITE", "PRO", "SEMI_PRO", "AMATEUR", "ACADEMY"]
          newSave.tournaments.forEach((tournament: TournamentSaveData) => {
            // Check if the custom team is eligible for this tournament
            let eligible = true
            const tournamentDef = snapshot.tournaments.find((st: any) => st.id === tournament.id)
            if (tournamentDef?.minTeamTier) {
              const minIndex = tierOrder.indexOf(tournamentDef.minTeamTier)
              const teamIndex = tierOrder.indexOf("AMATEUR")
              eligible = teamIndex <= minIndex
            }
            if (tournamentDef?.invitedTeamIds) {
              eligible = tournamentDef.invitedTeamIds.includes(result.teamId)
            }

            if (eligible && tournament.teamIds.length < (tournamentDef?.maxTeams || 16)) {
              tournament.teamIds.push(result.teamId)
              tournament.standings.push({
                teamId: result.teamId,
                matchesPlayed: 0,
                wins: 0,
                losses: 0,
                mapsWon: 0,
                mapsLost: 0,
                points: 0,
                mapDiff: 0,
                roundDiff: 0,
              })
            }
          })

          // Add initial finance ledger entry for custom team
          newSave.financeLedger.push({
            id: `fin_initial_${newSave.saveId}`,
            week: 1,
            teamId: result.teamId,
            type: "INCOME",
            category: "OTHER",
            amount: totalBudget,
            description: "Initial budget + Recruitment bonus",
            balance: totalBudget,
          })

          // ===== POST-PROCESSING (matching initializeNewGame) =====
          // Initialize player perks/roleMastery/availableSkillPoints
          newSave.players.forEach((p: any) => {
            if (!p.perks) p.perks = []
            if (!p.roleMastery) p.roleMastery = { [p.role]: 75 }
            if (p.availableSkillPoints === undefined) p.availableSkillPoints = 2
          })

          // Calculate synergy matrix and recalculate budgets for ALL teams
          newSave.teams.forEach((t: any) => {
            {
              const roster = newSave.players.filter((p: any) => t.rosterIds.includes(p.id))
              t.synergyMatrix = SynergyCalculator.calculateTeamMatrix(roster)
            }
            if (!t.facilities) t.facilities = [
              { id: "room_train", type: "TRAINING", level: 1, description: "Basic training setup", monthlyCost: 1000 },
              { id: "room_rec", type: "RECOVERY", level: 1, description: "Rest area", monthlyCost: 500 }
            ]
            if (!t.sponsors) t.sponsors = []
            if (t.merchHype === undefined) t.merchHype = 10

            // Skip budget recalculation for the custom team (it has its own budget)
            if (t.id === result.teamId) return

            // Recalculate budget based on Tier/Reputation (matching initializeNewGame)
            let calculatedBudget = 250000
            if (t.reputation > 80) calculatedBudget = 2000000
            else if (t.reputation > 50) calculatedBudget = 1000000
            else if (t.reputation > 0) calculatedBudget = 500000

            // Inject funds for incomplete rosters
            if (t.rosterIds.length < 5) {
              const missingCount = 5 - t.rosterIds.length
              const teammates = newSave.players.filter((p: any) => t.rosterIds.includes(p.id))
              const ranking = t.worldRanking || 50
              let targetValue = 150000
              if (teammates.length > 0) {
                const values = teammates.map((p: any) => {
                  const evaluation = evaluatePlayer(p)
                  return evaluation.transferValue
                }).sort((a: number, b: number) => a - b)
                targetValue = values[0]
                let rankingModifier = 1.0
                if (ranking > 100) rankingModifier = 0.4
                else if (ranking > 50) rankingModifier = 0.6
                else if (ranking > 20) rankingModifier = 0.8
                targetValue = Math.round(targetValue * rankingModifier)
              }
              calculatedBudget += Math.round(targetValue * missingCount)
            }

            if (t.startingBudget === undefined || t.startingBudget < calculatedBudget) {
              t.startingBudget = calculatedBudget
            }
            t.budget = t.startingBudget
          })

          // Initialize Elo and Tiers
          AIManager.initializeTeamData(newSave)

          // Reconcile all roles (was missing from custom path!)
          reconcileAllRoles(newSave.teams, newSave.players)

          // Initialize FPL with Non-Pro Players
          const { generateFPLNonProPlayers } = require("@/engine/fpl-player-generator")
          const { initializeFPL } = require("@/engine/fpl-engine")

          // Generate non-pro FPL players (streamers, semi-pros, grinders, etc.)
          const fplGeneratorRng = new SeededRNG(newSave.lastRngSeed || generateSeed())
          const { players: nonProPlayers, metadata: nonProMetadata } = generateFPLNonProPlayers(
            newSave.currentWeek,
            fplGeneratorRng
          )

          // Add non-pro players to the player pool
          newSave.players.push(...nonProPlayers)

          // Initialize FPL with all players (including non-pros)
          newSave.fplData = initializeFPL(newSave.players, newSave.currentWeek)
          if (newSave.fplData) {
            newSave.fplData.nonProPlayers = nonProMetadata
          }

          // Generate starter academy prospects for custom teams
          try {
            const { generateProspectBatch } = await import("@/engine/prospect-generator")
            const prospectRng = new SeededRNG(newSave.lastRngSeed || generateSeed())
            const starterProspects = generateProspectBatch(3, "LOCAL", prospectRng)

            // Convert prospects to PlayerSaveData and add to game
            starterProspects.forEach((prospect, idx) => {
              const prospectPlayerId = `prospect_${result.teamId}_${idx}_${prospectRng.int(100000, 999999)}`

              // Create PlayerSaveData for the prospect
              const prospectPlayer = {
                id: prospectPlayerId,
                name: `${prospect.firstName} ${prospect.lastName}`,
                nickname: prospect.nickname,
                age: prospect.age,
                nationality: prospect.nationality,
                portraitPath: prospect.portraitPath || "/player_placeholder.png",
                role: prospect.role,
                tier: "ACADEMY" as const,
                skill: prospect.stats.skill,
                awp: prospect.stats.awp,
                rifle: prospect.stats.rifle,
                pistol: prospect.stats.pistol,
                grenades: prospect.stats.grenades,
                creativity: prospect.stats.creativity,
                clutch: prospect.stats.clutch,
                tactic: prospect.stats.tactic,
                leader: prospect.stats.leader,
                teamwork: prospect.stats.teamwork,
                amicability: 50,
                productivity: 50,
                stressResistance: prospect.stats.stressResistance,
                loyalty: 70,
                reaction: prospect.stats.reaction,
                eyesight: 70,
                health: prospect.stats.health,
                strength: 50,
                endurance: prospect.stats.endurance,
                potential: prospect.stats.potential,
                form: 70,
                fatigue: 0,
                morale: 80,
                energy: 100,
                maxEnergy: 100,
                level: 1,
                xp: 0,
                xpToNextLevel: 1000,
                talentPoints: 0,
                unlockedTalentIds: [],
                matchesPlayed: 0,
                roundsPlayed: 0,
                avgRating: 0,
                clutchSuccessRate: 0,
                careerHistory: []
              }

              newSave.players.push(prospectPlayer as any)
              newSave.academyPendingProspects.push(prospectPlayerId)
            })
          } catch {
            // Non-critical, continue without prospects
          }

          // Initialize career history and run pre-season transfers for AI teams
          PreSeasonTransferProcessor.initializeCareerHistory(newSave)
          const transferResult = PreSeasonTransferProcessor.processPreSeasonWindow(newSave, result.teamId)
          newSave.eventsLog.push(...transferResult.events)
          newSave.transferHistory = transferResult.transfers

          // Add Welcome Mail for custom team
          newSave.eventsLog.unshift({
            id: `evt_welcome_custom_${newSave.currentWeek}_${newSave.saveId}`,
            type: "CAREER_UPDATE",
            week: 1,
            acknowledged: false,
            data: {
              title: `Welcome to ${teamData.name}!`,
              message: `Congratulations on founding your own esports organization!\n\n` +
                `🎮 YOUR NEW TEAM\n` +
                `You've created ${teamData.name} [${teamData.shortName}] in the ${teamData.region} region. ` +
                `Starting budget: $${(totalBudget / 1000).toFixed(0)}K (includes recruitment bonus!).\n\n` +
                `📋 FIRST STEPS\n` +
                `• Your roster is EMPTY! Visit Transfers immediately to sign free agents\n` +
                `• You need at least 5 players to compete in tournaments\n` +
                `• Budget carefully - every dollar counts!\n\n` +
                `💡 KEY TIPS\n` +
                `• Look for undervalued talents with high potential\n` +
                `• Consider players with good teamwork stats\n` +
                `• Don't overspend on salaries - leave room for growth\n\n` +
                `🏆 YOUR GOAL\n` +
                `Rise from obscurity to become a championship-winning team. The journey starts now!\n\n` +
                `Good luck, Coach ${managerName}!`,
              severity: "success"
            }
          })

          // Save game (match initializeNewGame behavior — don't throw on validation failure)
          await saveManager.saveGame(newSave)

          // Update Store
          set({
            ...newSave,
            availableEquipment: [
              { id: "mouse_001", name: "Basic Gaming Mouse", type: "MOUSE", weeklyCost: 0, tier: 1, purchasedWeek: 0, bonus: { stat: "skill", value: 1 } },
            ],
            playerTeamId: result.teamId,
            theme: "crystal",
            tutorialCompleted: false,
            onboardingCompleted: false,
            showTutorialOnNewGame: true,
            isInitialized: true,
            isLoading: false,
          })

          // Rebuild entity indexes after custom team initialization
          const customState = get()
          set(buildEntityIndexes(customState.teams, customState.players, customState.contracts, customState.staff, customState.completedMatches))

          get().refreshStaffMarket()
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to create team"
          logger.error("Failed to create custom team", err)
          set({ isLoading: false, error: message })
          get().addToast({ message: `Could not create custom team: ${message}`, type: "error", duration: 8000 })
        }
      },

      switchTeam: (newTeamId: string) => {
        set(state => {
          const team = (state._teamIndex?.get(newTeamId) ?? state.teams.find(t => t.id === newTeamId))
          if (!team) return

          state.playerTeamId = newTeamId
          state.eventsLog.unshift({
            id: nextDeterministicId(state, "evt_job_switch", newTeamId),
            type: "CAREER_UPDATE",
            week: state.currentWeek,
            data: {
              title: "New Job Accepted",
              message: `You are now the manager of ${team.name}.`,
              severity: "success"
            },
            acknowledged: false
          })
        })
      },

      loadGame: async (saveId) => {
        set({ isLoading: true, error: null, lastLoadError: null })
        try {
          const { save, error, errorCode, restoredFromBackup } = await saveManager.loadGame(saveId)

          if (error || !save) {
            const message = error || "Save not found"
            set({ lastLoadError: { saveId, errorCode: errorCode || "UNKNOWN", message } })
            throw new Error(message)
          }

          await steamAchievements.setActiveSave(save.saveId)

          // Initialize Steam Achievements with UI callback
          steamAchievements.initialize((achievement) => {
            get().addToast({
              message: `Achievement Unlocked: ${achievement.name}`,
              type: "achievement"
            })
          })

          // Notify user if save was restored from backup
          if (restoredFromBackup) {
            setTimeout(() => {
              get().addToast({
                message: "Your save was corrupted and has been restored from a backup.",
                type: "warning",
                duration: 10000
              })
            }, 500)
          }

          const inferredTeamId = save.playerTeamId || "team_navi"
          // structuredClone is ~10x faster than JSON parse/stringify and preserves
          // Date, Map, Set, etc. Falls back for ancient runtimes that lack it.
          const hydratedSave: GameSave = typeof structuredClone === "function"
            ? structuredClone(save)
            : JSON.parse(JSON.stringify(save))

          // Augment with new fields if missing (backward compatibility)
          hydratedSave.players.forEach(p => {
            if (!p.perks) p.perks = []
            if (!p.roleMastery) p.roleMastery = { [p.role]: 75 }
            if (p.availableSkillPoints === undefined) p.availableSkillPoints = 2
            if (p.level === undefined) p.level = 1
            if (p.xp === undefined) p.xp = 0
            if (p.xpToNextLevel === undefined) p.xpToNextLevel = 1000
            if (p.talentPoints === undefined) p.talentPoints = 0
            if (p.unlockedTalentIds === undefined) p.unlockedTalentIds = []
          })

          hydratedSave.teams.forEach(t => {
            {
              const roster = hydratedSave.players.filter(p => t.rosterIds.includes(p.id))
              t.synergyMatrix = SynergyCalculator.calculateTeamMatrix(roster)
            }
            if (!t.facilities) t.facilities = [
              { id: "room_train", type: "TRAINING", level: 1, description: "Basic training setup", monthlyCost: 1000 },
              { id: "room_rec", type: "RECOVERY", level: 1, description: "Rest area", monthlyCost: 500 }
            ]
            if (!t.sponsors) t.sponsors = []
            if (t.merchHype === undefined) t.merchHype = 10
            if (t.followers === undefined) t.followers = t.fanbase * 7
            if (t.merchStoreLevel === undefined) t.merchStoreLevel = 1
            if (t.activeMerchItems === undefined) t.activeMerchItems = ["JERSEY"]
            if (!t.description) t.description = `${t.name} is a professional esports organization.`
            if (!t.playstyle) t.playstyle = "default"
            if (t.playstyle === undefined) t.playstyle = "default" as any
            if (t.tacticalPrep === undefined) t.tacticalPrep = 0
          })

          hydratedSave.staff.forEach(s => {
            if (s.level === undefined) s.level = 1
            if (s.xp === undefined) s.xp = 0
            if (s.xpToNextLevel === undefined) s.xpToNextLevel = 1000
            if (s.talentPoints === undefined) s.talentPoints = 0
            if (s.unlockedTalentIds === undefined) s.unlockedTalentIds = []
          })

          // FPL backward compatibility migration
          if (hydratedSave.fplData) {
            const { getFPLTier, FPL_CONSTANTS: FC } = require("@/types/fpl")
            // Add missing fields to FPL player stats
            Object.values(hydratedSave.fplData.playerStats).forEach((stats: any) => {
              if (stats.totalFPLEarnings === undefined) stats.totalFPLEarnings = 0
              if (stats.fplChampionships === undefined) stats.fplChampionships = 0
            })
            // Retroactively compute championships/earnings from season history
            if (hydratedSave.fplData.seasonHistory) {
              hydratedSave.fplData.seasonHistory.forEach((season: any) => {
                if (season.champion) {
                  const stats = hydratedSave.fplData!.playerStats[season.champion]
                  if (stats) (stats as any).fplChampionships = ((stats as any).fplChampionships || 0) + 1
                }
                (season.leaderboard || []).slice(0, 3).forEach((entry: any, idx: number) => {
                  const stats = hydratedSave.fplData!.playerStats[entry.playerId]
                  const reward = (season.rewards || [])[idx]
                  if (stats && reward) {
                    (stats as any).totalFPLEarnings = ((stats as any).totalFPLEarnings || 0) + reward.prize
                  }
                })
              })
            }
            // Fix empty FPL/FPL_C tiers: use nonProPlayers metadata to infer intended tier
            const tierCounts = { FPL: 0, FPL_C: 0, HUBS: 0 }
            Object.values(hydratedSave.fplData.playerStats).forEach((s: any) => {
              if (tierCounts[s.fplTier as keyof typeof tierCounts] !== undefined) {
                tierCounts[s.fplTier as keyof typeof tierCounts]++
              }
            })
            if (tierCounts.FPL < 10 || tierCounts.FPL_C < 10) {
              (hydratedSave.fplData.nonProPlayers || []).forEach((np: any) => {
                const stats = hydratedSave.fplData!.playerStats[np.playerId]
                if (!stats) return
                const player = hydratedSave.players.find((p: any) => p.id === np.playerId)
                if (player && (player as any).initialFplElo) {
                  (stats as any).fplElo = (player as any).initialFplElo
                    ; (stats as any).fplTier = getFPLTier((player as any).initialFplElo)
                } else if (np.isRecruitableBy === 'TIER_1') {
                  // Deterministic: hash player ID into a stable ELO offset
                  const hash1 = np.playerId.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
                    ; (stats as any).fplElo = 2000 + (hash1 % 400)
                    ; (stats as any).fplTier = 'FPL'
                } else if (np.isRecruitableBy === 'TIER_2') {
                  const hash2 = np.playerId.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
                    ; (stats as any).fplElo = 1500 + (hash2 % 499)
                    ; (stats as any).fplTier = 'FPL_C'
                }
              })
              // Rebuild standings after tier fix
              try {
                const fplPlayers = Object.values(hydratedSave.fplData.playerStats)
                  .filter((s: any) => s.fplTier === 'FPL')
                  .sort((a: any, b: any) => (b.monthlyPoints || 0) - (a.monthlyPoints || 0) || b.fplElo - a.fplElo)
                const fplCPlayers = Object.values(hydratedSave.fplData.playerStats)
                  .filter((s: any) => s.fplTier === 'FPL_C')
                  .sort((a: any, b: any) => (b.monthlyPoints || 0) - (a.monthlyPoints || 0) || b.fplElo - a.fplElo)
                hydratedSave.fplData.fplStandings = fplPlayers.map((stats: any, idx: number) => ({
                  playerId: stats.playerId,
                  rank: idx + 1,
                  points: stats.monthlyPoints || 0,
                  wins: stats.wins || 0,
                  losses: stats.losses || 0,
                  matchesPlayed: stats.matchesPlayed || 0,
                  avgRating: stats.avgRating || 1.0,
                  isInPromotionZone: false,
                  isInRelegationZone: idx >= fplPlayers.length - FC.RELEGATION_SLOTS
                }))
                hydratedSave.fplData.fplCStandings = fplCPlayers.map((stats: any, idx: number) => ({
                  playerId: stats.playerId,
                  rank: idx + 1,
                  points: stats.monthlyPoints || 0,
                  wins: stats.wins || 0,
                  losses: stats.losses || 0,
                  matchesPlayed: stats.matchesPlayed || 0,
                  avgRating: stats.avgRating || 1.0,
                  isInPromotionZone: idx < FC.PROMOTION_SLOTS,
                  isInRelegationZone: false
                }))
              } catch { /* non-critical */ }
            }
          }

          AIManager.initializeTeamData(hydratedSave)
          reconcileAllRoles(hydratedSave.teams, hydratedSave.players)

          set({
            ...hydratedSave,
            playerTeamId: inferredTeamId,
            currentDay: (typeof hydratedSave.currentDay === "number" ? Math.max(0, Math.min(6, Math.floor(hydratedSave.currentDay))) : 6),
            timeMode: hydratedSave.timeMode === "HYBRID_DAILY" ? "HYBRID_DAILY" : "WEEKLY",
            lastRngSeed: hydratedSave.lastRngSeed || generateSeed(),
            marketStaff: hydratedSave.marketStaff || [],
            newsFeed: hydratedSave.newsFeed || [],
            academyPlayers: hydratedSave.academyPlayers || [],
            academyRoster: hydratedSave.academyRoster || { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null },
            academyScoutingMissions: hydratedSave.academyScoutingMissions || [],
            isInitialized: true,
            isLoading: false
          })

          // Rebuild entity indexes after loading game
          const loadedState = get()
          set(buildEntityIndexes(loadedState.teams, loadedState.players, loadedState.contracts, loadedState.staff, loadedState.completedMatches))

          // Welcome back toast if player was away for 24+ hours
          const lastPlayed = hydratedSave.lastPlayedAt
          if (lastPlayed) {
            const hoursAway = (Date.now() - new Date(lastPlayed).getTime()) / (1000 * 60 * 60)
            if (hoursAway >= 24) {
              const daysAway = Math.floor(hoursAway / 24)
              get().addToast({
                message: `Welcome back! You've been away for ${daysAway} day${daysAway !== 1 ? "s" : ""}.`,
                type: "info",
                duration: 6000
              })
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Load failed"
          set({ isLoading: false, error: message })
          get().addToast({ message: `Could not load save: ${message}`, type: "error", duration: 8000 })
          throw new Error(message)
        }
      },

      saveGame: async () => {
        const state = get()
        if (!state.saveId) {
          get().addToast({ message: "Cannot save: no active save slot", type: "error", duration: 5000 })
          return
        }

        // NOTE: We intentionally do NOT set({ isLoading: true }) here.
        // Setting isLoading triggers Zustand persist to serialize and write the
        // entire multi-MB state to IndexedDB, creating concurrent transactions
        // that interfere with SaveManager's own writes and cause save failures.
        try {
          // Use gameStartDate as createdAt — avoids a full loadGame() round-trip
          // (which involved IndexedDB reads + Steam Cloud IPC + SHA-256 hashing)
          // just to retrieve a single timestamp.
          const createdAt = state.gameStartDate || new Date().toISOString()

          // Construct GameSave object from state
          const gameSave: GameSave = {
            saveVersion: CURRENT_SAVE_VERSION,
            saveId: state.saveId,
            saveName: state.saveName,
            managerDetails: state.managerDetails,
            playerTeamId: state.playerTeamId || "unknown",
            createdAt,
            updatedAt: new Date().toISOString(),
            lastPlayedAt: new Date().toISOString(),
            currentWeek: state.currentWeek,
            currentDay: state.currentDay,
            timeMode: state.timeMode,
            gameStartDate: state.gameStartDate,
            teams: state.teams,
            players: state.players,
            contracts: state.contracts,
            tournaments: state.tournaments,
            staff: state.staff,
            marketStaff: state.marketStaff || [],
            scheduledMatches: state.scheduledMatches,
            completedMatches: state.completedMatches,
            scheduledActivities: state.scheduledActivities || [],
            financeLedger: state.financeLedger,
            eventsLog: state.eventsLog,
            acknowledgedEventIds: state.acknowledgedEventIds,
            lastRngSeed: state.lastRngSeed || generateSeed(),
            legendaryPlayers: state.legendaryPlayers,
            weekTickState: null,
            scoutedPlayers: state.scoutedPlayers || [],
            activeScoutingMission: state.activeScoutingMission,
            circuitPoints: state.circuitPoints || [],
            tournamentQualifications: state.tournamentQualifications || [],
            newsFeed: state.newsFeed,
            transferHistory: state.transferHistory || [],
            hallOfFame: state.hallOfFame || FOUNDING_LEGENDS, // Use constant if empty
            signedLegendIds: state.signedLegendIds || [],
            activelyPlayingLegendIds: state.activelyPlayingLegendIds || [],
            // Academy (Phase 40)
            academyPlayers: state.academyPlayers || [],
            academyRoster: state.academyRoster || { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null },
            academyMatchHistory: state.academyMatchHistory || [],
            academyTrainingSchedule: state.academyTrainingSchedule || {},
            academyWeeklyReports: state.academyWeeklyReports || [],
            academyScoutingMissions: state.academyScoutingMissions || [],
            academyPendingProspects: state.academyPendingProspects || [],
            sponsorOffers: state.sponsorOffers || [],
            declinedSponsorOfferIds: state.declinedSponsorOfferIds || [],
            fplData: state.fplData,
            pendingCelebration: state.pendingCelebration,
            pendingSeasonRecap: state.pendingSeasonRecap,
            pendingLegendPick: state.pendingLegendPick,
            difficulty: state.difficulty,
            gameOverReason: state.gameOverReason ?? undefined,
            gameOverWeek: state.gameOverWeek ?? undefined,
          }

          const saveResult = await saveManager.saveGame(gameSave)
          if (!saveResult.success) {
            logger.error("[saveGame] SaveManager failed", saveResult.error)
            throw new Error(saveResult.error || "Save failed")
          }
          if (saveResult.repairs && saveResult.repairs.length > 0) {
            get().addToast({ message: `Save auto-repaired: ${saveResult.repairs[0]}`, type: "warning", duration: 8000 })
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Save failed"
          logger.error("[saveGame] Error", message)
          // Surface the failure so the user knows their progress wasn't
          // persisted, instead of silently letting the catch propagate up
          // to a caller that may or may not show a toast.
          get().addToast({
            message: `Save failed: ${message}`,
            type: "error",
            duration: 8000,
          })
          throw new Error(message)
        }
      },

      advanceDay: async () => {
        const state = get()
        if (state.timeMode !== "HYBRID_DAILY") {
          await state.advanceWeek()
          return
        }

        if (state.currentDay < 6) {
          set(draft => {
            const nextDay = Math.min(6, draft.currentDay + 1)
            draft.currentDay = nextDay
            simulateDueAIMatchesForDay(draft, nextDay)
          })
          return
        }

        await state.advanceWeek()
      },

      advanceToWeekEnd: async () => {
        const state = get()
        if (state.timeMode !== "HYBRID_DAILY") {
          await state.advanceWeek()
          return
        }

        // Check if player has an unplayed match this week — stop at match day
        const playerMatchThisWeek = state.playerTeamId ? state.scheduledMatches.find(m =>
          m.week === state.currentWeek &&
          (m.homeTeamId === state.playerTeamId || m.awayTeamId === state.playerTeamId) &&
          !state.completedMatches.some(cm => cm.id === m.id)
        ) : null

        if (playerMatchThisWeek) {
          const matchDay = playerMatchThisWeek.day ?? 6
          if (state.currentDay < matchDay) {
            // Advance to match day so PLAY MATCH button appears
            set(draft => {
              draft.currentDay = matchDay
              simulateDueAIMatchesForDay(draft, matchDay)
            })
            return
          }
          // Already on or past match day — match still unplayed, don't skip
          return
        }

        if (state.currentDay < 6) {
          set(draft => {
            draft.currentDay = 6
            simulateDueAIMatchesForDay(draft, 6)
          })
        }

        await get().advanceDay()
      },

      advanceWeek: async () => {
        const state = get()

        // Guard: prevent concurrent week processing (race condition from rapid key presses)
        if (state.isLoading) return

        // Guard: prevent advancing if game is over (bankruptcy)
        if (state.gameOverReason) {
          get().addToast({ message: "Your organization has been dissolved. Load a save or start a new game.", type: "warning" })
          set({ isLoading: false })
          return
        }

        // Guard: prevent advancing if the player has an unplayed match this week
        const completedIds = state._completedMatchIds || new Set(state.completedMatches.map(cm => cm.id))
        const unplayedPlayerMatch = state.playerTeamId ? state.scheduledMatches.find(m =>
          m.week === state.currentWeek &&
          (m.homeTeamId === state.playerTeamId || m.awayTeamId === state.playerTeamId) &&
          !completedIds.has(m.id)
        ) : null
        if (unplayedPlayerMatch) {
          get().addToast({ message: "You have a match to play this week!", type: "warning" })
          set({ isLoading: false })
          return
        }

        set({ isLoading: true })
        try {
          const preTickRng = new SeededRNG(state.lastRngSeed || generateSeed())

          // Batched pre-tick mutations: scouting, market rotation, staff XP, player XP
          // Combined into a single set() to avoid multiple Immer snapshots + persist serializations
          set(draft => {
            // === Process Scouting Completion ===
            const mission = draft.activeScoutingMission
            if (mission && draft.currentWeek >= mission.completionWeek) {
              const player = draft.players.find(p => p.id === mission.playerId)
              draft.activeScoutingMission = undefined

              if (!player) {
                draft.eventsLog.unshift({
                  id: nextDeterministicId(draft, "evt_scout_failed", mission.playerId),
                  type: "SCOUTING_COMPLETE",
                  week: draft.currentWeek,
                  data: {
                    title: "Scouting Mission Failed",
                    message: "The scouted player is no longer available.",
                    severity: "warning"
                  },
                  acknowledged: false
                })
              } else {
                const alreadyScouted = draft.scoutedPlayers.some(sp => sp.playerId === mission.playerId)
                if (!alreadyScouted) {
                  draft.scoutedPlayers.push({
                    playerId: mission.playerId,
                    scoutedWeek: draft.currentWeek,
                    scoutLevel: "EXPERT"
                  })
                }
                draft.eventsLog.unshift({
                  id: nextDeterministicId(draft, "evt_scout_complete", mission.playerId),
                  type: "SCOUTING_COMPLETE",
                  week: draft.currentWeek,
                  data: {
                    title: "Scouting Report Ready",
                    message: `Analysis for ${player.nickname} is complete. Full attributes are now visible.`,
                    playerId: mission.playerId,
                    severity: "success"
                  },
                  acknowledged: false
                })
              }
            }

            // === Market Rotation (every 4-8 weeks) ===
            if (!draft.nextMarketRefreshWeek) {
              draft.nextMarketRefreshWeek = state.currentWeek + 4
            } else if (state.currentWeek >= draft.nextMarketRefreshWeek) {
              const rotated = StaffGenerator.rotateMarket(draft.marketStaff, state.currentWeek, preTickRng)
              draft.marketStaff = rotated
              draft.nextMarketRefreshWeek = state.currentWeek + 4 + Math.floor(preTickRng.next() * 5)
            }

            // === Staff XP & Level Up ===
            if (draft.staff) {
              draft.staff.forEach(s => {
                if (s.teamId === state.playerTeamId) {
                  const xpGain = 50 + Math.floor(preTickRng.next() * 50)
                  s.xp += xpGain

                  if (s.xp >= s.xpToNextLevel) {
                    s.xp -= s.xpToNextLevel
                    s.level += 1
                    s.talentPoints += 1
                    s.xpToNextLevel = Math.floor(s.xpToNextLevel * 1.5)

                    draft.eventsLog.unshift({
                      id: nextDeterministicId(draft, "evt_staff_levelup", s.id),
                      type: "STAFF_LEVEL_UP",
                      week: state.currentWeek,
                      data: { staffName: s.name, newLevel: s.level },
                      acknowledged: false
                    })
                  }
                }
              })
            }

            // === Player XP & Level Up ===
            const userTeam = draft.teams.find(t => t.id === state.playerTeamId)
            if (userTeam) {
              draft.players.forEach(p => {
                if (userTeam.rosterIds.includes(p.id)) {
                  const xpGain = 40 + Math.floor(preTickRng.next() * 40)
                  p.xp = (p.xp || 0) + xpGain

                  if (p.xp >= (p.xpToNextLevel || 1000)) {
                    p.xp -= (p.xpToNextLevel || 1000)
                    p.level = (p.level || 1) + 1
                    p.talentPoints = (p.talentPoints || 0) + 1
                    p.xpToNextLevel = Math.floor((p.xpToNextLevel || 1000) * 1.5)

                    draft.eventsLog.unshift({
                      id: nextDeterministicId(draft, "evt_player_levelup", p.id),
                      type: "PLAYER_LEVEL_UP",
                      week: state.currentWeek,
                      data: { playerName: p.nickname, newLevel: p.level },
                      acknowledged: false
                    })
                  }
                }
              })
            }
          })

          const rng = new SeededRNG(preTickRng.getState())
          const latestState = get()

          // Explicitly construct GameSave from store state (avoid fragile spread)
          const saveState: GameSave = structuredClone({
            saveVersion: (latestState as any).saveVersion || CURRENT_SAVE_VERSION,
            saveId: latestState.saveId || `save_recovery_${Date.now()}`,
            saveName: latestState.saveName || "Unknown",
            createdAt: (latestState as any).createdAt || latestState.gameStartDate || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentWeek: latestState.currentWeek,
            currentDay: latestState.currentDay,
            timeMode: latestState.timeMode,
            gameStartDate: latestState.gameStartDate,
            playerTeamId: latestState.playerTeamId || "unknown",
            managerDetails: latestState.managerDetails,
            teams: latestState.teams,
            players: latestState.players,
            contracts: latestState.contracts,
            tournaments: latestState.tournaments,
            staff: latestState.staff,
            marketStaff: latestState.marketStaff || [],
            nextMarketRefreshWeek: (latestState as any).nextMarketRefreshWeek,
            scheduledMatches: latestState.scheduledMatches,
            completedMatches: latestState.completedMatches,
            scheduledActivities: latestState.scheduledActivities || [],
            financeLedger: latestState.financeLedger,
            eventsLog: latestState.eventsLog,
            acknowledgedEventIds: latestState.acknowledgedEventIds,
            lastRngSeed: latestState.lastRngSeed || generateSeed(),
            legendaryPlayers: latestState.legendaryPlayers || [],
            weekTickState: null,
            scoutedPlayers: latestState.scoutedPlayers || [],
            activeScoutingMission: latestState.activeScoutingMission,
            circuitPoints: latestState.circuitPoints || [],
            tournamentQualifications: latestState.tournamentQualifications || [],
            newsFeed: latestState.newsFeed || [],
            transferHistory: latestState.transferHistory || [],
            hallOfFame: latestState.hallOfFame || FOUNDING_LEGENDS,
            academyPlayers: latestState.academyPlayers || [],
            academyRoster: latestState.academyRoster || { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null },
            academyMatchHistory: latestState.academyMatchHistory || [],
            academyTrainingSchedule: latestState.academyTrainingSchedule || {},
            academyWeeklyReports: latestState.academyWeeklyReports || [],
            academyScoutingMissions: latestState.academyScoutingMissions || [],
            academyPendingProspects: latestState.academyPendingProspects || [],
            sponsorOffers: latestState.sponsorOffers || [],
            declinedSponsorOfferIds: latestState.declinedSponsorOfferIds || [],
            fplData: latestState.fplData,
            pendingCelebration: latestState.pendingCelebration,
            pendingSeasonRecap: latestState.pendingSeasonRecap,
            pendingLegendPick: latestState.pendingLegendPick,
            signedLegendIds: latestState.signedLegendIds || [],
            activelyPlayingLegendIds: latestState.activelyPlayingLegendIds || [],
            gameOverReason: latestState.gameOverReason ?? undefined,
            gameOverWeek: latestState.gameOverWeek ?? undefined,
          })

          const config = {
            playerTeamId: state.playerTeamId || "",
            trainingFocus: new Map()
          }

          // Immersive Content: Process Weekly Activity
          if (state.selectedWeeklyActivity) {
            const activity = WEEKLY_ACTIVITIES[state.selectedWeeklyActivity]
            if (activity && activity.type !== "TRAINING_ONLY") { // String literal check as backup
              const myTeam = saveState.teams.find((t: any) => t.id === state.playerTeamId)
              if (myTeam) {
                // Cost
                if (activity.cost > 0) {
                  myTeam.budget -= activity.cost
                  saveState.financeLedger.push({
                    id: nextDeterministicId(saveState, "fin_activity", activity.type),
                    teamId: myTeam.id,
                    type: "EXPENSE",
                    amount: activity.cost,
                    category: "FACILITIES", // Categorize as facility/ops
                    week: saveState.currentWeek,
                    description: `Activity: ${activity.name}`,
                    balance: myTeam.budget
                  })
                }

                // Effects
                const myPlayers = saveState.players.filter((p: any) => myTeam.rosterIds.includes(p.id))
                myPlayers.forEach((p: any) => {
                  if (activity.effects.fatigue) {
                    p.fatigue = Math.max(0, Math.min(100, (p.fatigue || 0) + activity.effects.fatigue))
                  }
                  if (activity.effects.morale) {
                    p.morale = Math.max(0, Math.min(100, (p.morale || 50) + activity.effects.morale))
                  }
                  if (activity.effects.xp) {
                    // Flat XP bonus simulation based on multiplier assumption (multiplier usually applies to training, here we give flat bonus)
                    // Bootcamp (2.0) -> +100 XP. Streaming -> 0.
                    const baseGain = 50
                    if (activity.effects.xp > 1) {
                      const bonus = Math.floor(baseGain * (activity.effects.xp - 1))
                      p.xp = (p.xp || 0) + bonus
                    }
                  }
                  // Fan Support / Reputation (Team level, but maybe stored on team?)
                })

                if (activity.effects.reputation) {
                  myTeam.reputation = Math.min(100, (myTeam.reputation || 0) + activity.effects.reputation)
                }

                // Log Event
                saveState.eventsLog.unshift({
                  id: nextDeterministicId(saveState, "evt_activity", activity.type),
                  type: "TEAM_UPDATE" as any, // Generic type
                  week: saveState.currentWeek,
                  acknowledged: false,
                  data: {
                    title: `Weekly Focus: ${activity.name}`,
                    message: activity.description,
                    severity: "info"
                  }
                })
              }
            }
          }



          // Process Scheduled Activities (Staff Meetings, etc.)
          const activeScheduled = saveState.scheduledActivities?.filter((a: any) => a.week === saveState.currentWeek) || []
          activeScheduled.forEach((act: any) => {
            if (act.type === "STAFF_MEETING") {
              const team = saveState.teams.find((t: any) => t.id === state.playerTeamId)
              if (team) {
                const roster = saveState.players.filter((p: any) => team.rosterIds.includes(p.id))

                // Get meeting effects from activity data, or use defaults
                const effects = act.data?.effects || { morale: 10, xp: 25 }
                const meetingName = act.name || "Staff Meeting"

                // Build effect summary for event log
                const effectParts: string[] = []

                roster.forEach((p: any) => {
                  // Apply morale effect
                  if (effects.morale) {
                    p.morale = Math.min(100, Math.max(0, (p.morale || 50) + effects.morale))
                  }
                  // Apply XP effect
                  if (effects.xp) {
                    p.xp = (p.xp || 0) + effects.xp
                  }
                  // Apply fatigue effect (negative value reduces fatigue)
                  if (effects.fatigue) {
                    p.fatigue = Math.min(100, Math.max(0, (p.fatigue || 0) + effects.fatigue))
                  }
                  // Apply stress resistance effect
                  if (effects.stressResistance) {
                    p.stressResistance = Math.min(100, (p.stressResistance || 50) + effects.stressResistance)
                  }
                  // Apply tactic XP effect
                  if (effects.tacticXp) {
                    p.tactic = Math.min(99, (p.tactic || 50) + Math.floor(effects.tacticXp / 5))
                  }
                })

                // Apply team chemistry effect
                if (effects.chemistry && team.chemistry !== undefined) {
                  team.chemistry = Math.min(100, (team.chemistry || 50) + effects.chemistry)
                }

                // Build effect message
                if (effects.morale) effectParts.push(`Morale +${effects.morale}`)
                if (effects.xp) effectParts.push(`XP +${effects.xp}`)
                if (effects.fatigue) effectParts.push(`Fatigue ${effects.fatigue}`)
                if (effects.chemistry) effectParts.push(`Chemistry +${effects.chemistry}`)
                if (effects.stressResistance) effectParts.push(`Stress Resistance +${effects.stressResistance}`)
                if (effects.tacticXp) effectParts.push(`Tactic XP +${effects.tacticXp}`)

                saveState.eventsLog.unshift({
                  id: nextDeterministicId(saveState, "evt_staff_meeting"),
                  type: "TEAM_UPDATE" as any,
                  week: saveState.currentWeek,
                  acknowledged: false,
                  data: {
                    title: meetingName,
                    message: `The team held a ${meetingName.toLowerCase()}. ${effectParts.join(", ")}.`,
                    severity: "success"
                  }
                })
              }
            }

            // Bootcamp chemistry boost
            if (act.type === "BOOTCAMP" || act.type === "REST" || act.type === "TRAVEL") {
              const team = saveState.teams.find((t: any) => t.id === state.playerTeamId)
              if (team) {
                const bonus = applyBootcampChemistryBonus(team, act.type)
                if (bonus > 0) {
                  saveState.eventsLog.unshift({
                    id: nextDeterministicId(saveState, "evt_bootcamp_chem", act.type),
                    type: "TEAM_UPDATE" as any,
                    week: saveState.currentWeek,
                    acknowledged: false,
                    data: {
                      title: "Team Chemistry Improved",
                      message: `The ${act.name || "bootcamp"} brought the team closer together. Chemistry +${bonus}.`,
                      severity: "success"
                    }
                  })
                }
              }
            }
          })

          // Phase 20 Enhancement: Auto-Registration for Player Team
          const pTeamId = state.playerTeamId
          if (pTeamId) {
            const myTeam = saveState.teams.find((t: any) => t.id === pTeamId)
            if (myTeam) {
              try {
                const { QualificationEngine } = require("@/engine/tournament-qualification")
                const upcoming = saveState.tournaments.filter((t: any) =>
                  t.startWeek >= saveState.currentWeek &&
                  t.startWeek <= saveState.currentWeek + 4
                )

                upcoming.forEach((t: any) => {
                  const tournamentSeriesId = t.seriesId || getSeriesIdFromTournamentId(t.id)
                  const tournamentDef = FULL_TOURNAMENT_CALENDAR.find(def => def.id === tournamentSeriesId)
                  if (!tournamentDef) return
                  if (!(tournamentDef.entryType === "INVITE" || tournamentDef.entryType === "POINTS")) return

                  const isRegistered = saveState.tournamentQualifications.some(
                    (q: any) =>
                      q.teamId === myTeam.id &&
                      isQualificationForTournament(q, t.id, saveState.currentWeek)
                  )
                  if (!isRegistered) {
                    const eligibility = QualificationEngine.checkEligibility(
                      tournamentDef,
                      myTeam,
                      myTeam.worldRanking,
                      saveState.circuitPoints,
                      saveState.tournamentQualifications
                    )

                    if (eligibility.canRegister) {
                      saveState.tournamentQualifications.push(normalizeQualificationStatus({
                        tournamentId: t.id,
                        seriesId: tournamentSeriesId,
                        instanceId: t.id,
                        seasonNumber: t.seasonNumber || getSeasonFromWeek(t.startWeek || saveState.currentWeek),
                        teamId: myTeam.id,
                        status: "REGISTERED",
                        qualifiedVia: "AUTO_INVITE"
                      }, saveState.currentWeek))

                      saveState.eventsLog.unshift({
                        id: nextDeterministicId(saveState, "evt_auto_reg", t.id),
                        type: "TOURNAMENT_UPDATE",
                        week: saveState.currentWeek,
                        acknowledged: false,
                        data: {
                          tournamentId: t.id,
                          title: "Auto-Registration",
                          message: `Team automatically registered for ${t.name} (Eligible via ${tournamentDef.entryType})`,
                          severity: "success"
                        }
                      })
                    }
                  }
                })
              } catch {
                // Auto-registration skipped, non-critical
              }
            }
          }

          // Phase 20 Enhancement: Simulate Weekly AI Registrations
          TournamentManager.simulateWeeklyRegistrationsV2(saveState, state.currentWeek, rng)

          // Phase 80: Process FPL (Individual Rankings) with Smart Scheduling
          if (saveState.fplData) {
            try {
              const { processFPLWeek } = require("@/engine/fpl-engine")
              const { SeededRNG } = require("@/engine/rng")
              const fplRng = new SeededRNG(rng.int(1, 999999))

              // Pass scheduling context for smart availability checking
              const fplResult = processFPLWeek(
                saveState.fplData,
                saveState.players,
                saveState.currentWeek,
                fplRng,
                saveState.tournaments,          // Tournament schedule
                saveState.scheduledMatches,     // Scheduled matches (scrims, etc.)
                saveState.scheduledActivities,  // Bootcamps, travel, etc.
                saveState.teams.map(t => ({     // Team roster mappings
                  id: t.id,
                  rosterIds: t.rosterIds
                }))
              )
              saveState.fplData = fplResult.fplData

              // Generate news for FPL promotions/demotions at season end
              if (fplResult.tierChanges && fplResult.tierChanges.length > 0) {
                const promotions = fplResult.tierChanges.filter((c: any) => c.reason === 'PROMOTION')
                const demotions = fplResult.tierChanges.filter((c: any) => c.reason === 'DEMOTION')

                if (promotions.length > 0) {
                  saveState.eventsLog.unshift({
                    id: `fpl_promotions_${saveState.currentWeek}`,
                    type: "PLAYER_UPDATE",
                    week: saveState.currentWeek,
                    acknowledged: false,
                    data: {
                      title: "FPL Promotions",
                      message: `${promotions.map((p: any) => p.playerName).join(', ')} promoted to FPL Pro after stellar FPL Challenger season!`,
                      severity: "success"
                    }
                  })
                }

                if (demotions.length > 0) {
                  saveState.eventsLog.unshift({
                    id: `fpl_demotions_${saveState.currentWeek}`,
                    type: "PLAYER_UPDATE",
                    week: saveState.currentWeek,
                    acknowledged: false,
                    data: {
                      title: "FPL Relegations",
                      message: `${demotions.map((d: any) => d.playerName).join(', ')} relegated to FPL Challenger after struggling in FPL Pro.`,
                      severity: "info"
                    }
                  })
                }
              }
            } catch {
              get().addToast({ message: "FPL rankings update failed this week", type: "warning", duration: 5000 })
            }
          }

          // Run the week off the main thread when possible. The bridge falls
          // back to a synchronous run if the worker can't load (SSR, Electron
          // packaged build with worker disabled, etc.) so the call is safe
          // everywhere. The worker structured-clones `saveState` on the way in
          // and returns a mutated copy; we use that copy below instead of the
          // original `saveState` reference.
          const { result, save: processedSave, rngState: postWeekRngState } =
            await weekProcessorBridge.processWeek(saveState, config, rng)
          processedSave.lastRngSeed = postWeekRngState

          if (result.success) {
            set((draft) => {
              Object.assign(draft, { ...processedSave, isLoading: false })
              draft.currentDay = draft.timeMode === "HYBRID_DAILY" ? 0 : 6
              draft.selectedWeeklyActivity = null // Reset selection

              // Prune growing arrays to prevent unbounded memory/save growth
              pruneGameState(draft)

              // Recalculate synergy for all teams (AI transfers may have changed rosters).
              // Build players-by-id once so each team is O(roster) instead of
              // O(players × roster). On a ~30 team / ~150 player league this
              // turns ~9000 array-includes scans into ~450 map lookups.
              const playersById = new Map<string, typeof draft.players[number]>()
              for (const p of draft.players) playersById.set(p.id, p)
              draft.teams.forEach(t => {
                const roster: typeof draft.players = []
                for (const id of t.rosterIds) {
                  const p = playersById.get(id)
                  if (p) roster.push(p)
                }
                t.synergyMatrix = SynergyCalculator.calculateTeamMatrix(roster)
              })
            })

            // Process academy weekly training, scouting missions, and prospect development
            get().processAcademyWeek()

            // Rebuild entity indexes after state update for O(1) lookups
            const postTickState = get()
            const newIndexes = buildEntityIndexes(postTickState.teams, postTickState.players, postTickState.contracts, postTickState.staff, postTickState.completedMatches)
            set(newIndexes)

            // Check and unlock achievements based on current state
            const updatedState = get()
            const playerTeam = updatedState.teams.find(t => t.id === updatedState.playerTeamId)
            if (playerTeam) {
              // Count total wins
              const totalWins = updatedState.completedMatches.filter(m => {
                const isHome = m.homeTeamId === updatedState.playerTeamId
                return isHome ? m.result.homeScore > m.result.awayScore : m.result.awayScore > m.result.homeScore
              }).length

              // Get tournament wins
              const tournamentsWon = playerTeam.trophies?.map(t => {
                const tournament = updatedState.tournaments.find(tour => tour.id === t.tournamentId)
                return { tier: tournament?.tier || "B_TIER", id: t.tournamentId }
              }) || []

              const seasonStartWeek = Math.floor((updatedState.currentWeek - 1) / 52) * 52 + 1
              const majorWinsInSeason = (playerTeam.trophies || []).filter(t =>
                t.tier === "S_TIER" &&
                t.week >= seasonStartWeek &&
                t.week <= updatedState.currentWeek
              ).length

              // Phase 40: Steam Rich Presence (enhanced)
              steamAchievements.updateGameStatePresence({
                teamName: playerTeam.name,
                week: updatedState.currentWeek,
                ranking: playerTeam.worldRanking,
                activity: playerTeam.leagueTier === "S_TIER" ? "S-Tier League" : "Pro League",
              })

              // Fastest Run tracking
              if (playerTeam.leagueTier === "S_TIER") {
                steamAchievements.pushLeaderboardStats({ weeksToSTier: updatedState.currentWeek })
              }

              // Detect comeback and underdog wins from this week's matches
              const thisWeekMatches = updatedState.completedMatches.filter(m =>
                m.week === updatedState.currentWeek &&
                (m.homeTeamId === updatedState.playerTeamId || m.awayTeamId === updatedState.playerTeamId)
              )
              const hasComebackWin = thisWeekMatches.some(m => (m as any)._comebackWin)
              const hasUnderdogWin = thisWeekMatches.some(m => (m as any)._underdogWin)

              // Total kills & headshots across all players
              const playerTeamPlayers = updatedState.players.filter(p =>
                playerTeam.rosterIds.includes(p.id)
              )
              const totalKills = playerTeamPlayers.reduce((s, p) => s + (p.totalKills || 0), 0)
              const totalHS = playerTeamPlayers.reduce((s, p) => s + (p.totalHeadshots || 0), 0)
              const matchesPlayed = updatedState.completedMatches.filter(m =>
                m.homeTeamId === updatedState.playerTeamId || m.awayTeamId === updatedState.playerTeamId
              ).length

              // Total major wins
              const totalMajorWins = (playerTeam.trophies || []).filter(t => t.tier === "S_TIER").length

              // LOYAL_TEAM: compute years since last roster change
              const loyalTeamYears = Math.floor(
                (updatedState.currentWeek - (playerTeam.lastRosterChangeWeek ?? 1)) / 52
              )

              // REDEMPTION: won S_TIER after losing an S_TIER Grand Final in prior year
              const seasonStart = Math.floor((updatedState.currentWeek - 1) / 52) * 52 + 1
              const priorSeasonStart = Math.max(1, seasonStart - 52)
              const lostSTierGrandFinalPriorYear = updatedState.completedMatches.some(m => {
                if (m.week < priorSeasonStart || m.week >= seasonStart) return false
                const isPlayerTeam = m.homeTeamId === updatedState.playerTeamId || m.awayTeamId === updatedState.playerTeamId
                if (!isPlayerTeam) return false
                const isHome = m.homeTeamId === updatedState.playerTeamId
                const lost = isHome ? m.result.homeScore < m.result.awayScore : m.result.awayScore < m.result.homeScore
                return lost && (m as any).stage === "Grand Final" && (m as any).tournamentTier === "S_TIER"
              })
              const wonSTierThisSeason = (playerTeam.trophies || []).some(
                t => t.tier === "S_TIER" && t.week >= seasonStart && t.week <= updatedState.currentWeek
              )
              const redemptionArc = lostSTierGrandFinalPriorYear && wonSTierThisSeason

              // UNLUCKY: check this week's matches for 14-16 Grand Final loss
              const lostGrandFinal1614 = thisWeekMatches.some(m => {
                const isHome = m.homeTeamId === updatedState.playerTeamId
                const lost = isHome ? m.result.homeScore < m.result.awayScore : m.result.awayScore < m.result.homeScore
                if (!lost) return false
                const loserScore = isHome ? m.result.homeScore : m.result.awayScore
                const winnerScore = isHome ? m.result.awayScore : m.result.homeScore
                return (m as any).stage === "Grand Final" && loserScore === 14 && winnerScore === 16
              })

              checkAchievements({
                totalWins,
                worldRanking: playerTeam.worldRanking,
                leagueTier: playerTeam.leagueTier,
                startingLeagueTier: (playerTeam as any).startingLeagueTier,
                budget: playerTeam.budget,
                tournamentsWon,
                hallOfFamePlayers: updatedState.legendaryPlayers?.length || 0,
                firstTournamentParticipation: updatedState.completedMatches.some(match => !!match.tournamentId && match.tournamentId !== "SCRIM"),
                developedStar: updatedState.players.some(player => !!(player as any).isAcademyGraduate && player.skill >= 90),
                majorWinsInSeason,
                totalMajorWins,
                seasonComplete: updatedState.currentWeek > 0 && updatedState.currentWeek % 52 === 0,
                comebackWin: hasComebackWin,
                underdogWin: hasUnderdogWin,
                totalKills,
                totalHS,
                matchesPlayed,
                loyalTeamYears,
                redemptionArc,
                lostGrandFinal1614,
              })

              // Push leaderboard stats
              const totalEarnings = updatedState.financeLedger
                .filter(e => e.type === "INCOME" && e.teamId === updatedState.playerTeamId)
                .reduce((sum, e) => sum + e.amount, 0)
              const form = playerTeam.recentForm || []
              let maxStreak = 0, curStreak = 0
              for (const r of form) {
                if (r === "W") { curStreak++; maxStreak = Math.max(maxStreak, curStreak) }
                else curStreak = 0
              }
              steamAchievements.pushLeaderboardStats({
                maxElo: playerTeam.elo,
                totalEarnings,
                longestWinStreak: maxStreak,
                tournamentsWon: (playerTeam.trophies || []).length,
                majorWins: totalMajorWins,
              })

              // Phase 62: Route transient events to Toast Notifications
              const freshState = get()
              const toastEventTypes = ["TRAINING_COMPLETE"] // Events that should be toasts only
              const toastEvents = freshState.eventsLog.filter(
                e => toastEventTypes.includes(e.type as string) && e.week === freshState.currentWeek && !e.acknowledged
              )

              toastEvents.forEach(event => {
                const data = event.data as any
                get().addToast({
                  message: data.title || data.description || "Event notification",
                  type: event.type === "TRAINING_COMPLETE" ? "level_up" : "info"
                })

                // Auto-acknowledge transient event to remove from inbox
                get().acknowledgeEvent(event.id)
              })
            }
          } else {
            throw new Error(result.error || "Week processing failed")
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Advance failed"
          logger.error("[advanceWeek] Failed", err)
          set({ isLoading: false, error: message })
          const display = message.length > 120 ? message.slice(0, 117) + "..." : message
          get().addToast({ message: `Week failed: ${display}`, type: "warning", duration: 12000 })
        }
      },

      acknowledgeEvent: (eventId) => {
        set((state) => {
          const event = state.eventsLog.find(e => e.id === eventId)
          if (event) event.acknowledged = true
          if (!state.acknowledgedEventIds.includes(eventId)) {
            state.acknowledgedEventIds.push(eventId)
          }
        })
      },

      markAllEventsAsRead: () => {
        set((state) => {
          state.eventsLog.forEach(e => {
            e.acknowledged = true
            if (!state.acknowledgedEventIds.includes(e.id)) {
              state.acknowledgedEventIds.push(e.id)
            }
          })
        })
      },

      resolveEventChoice: (eventId, choiceId) => {
        set((state) => {
          const event = state.eventsLog.find(e => e.id === eventId)
          if (!event || event.selectedChoiceId) return

          // Apply Effects
          const runtimeEvent = event as any
          if (runtimeEvent.choices) {
            const choice = runtimeEvent.choices.find((c: any) => c.id === choiceId)
            if (!choice || !choice.effects) return

            const { morale, money, loyalty, reputation } = choice.effects
            const playerId = (event.data as any).playerId
            const teamId = (event.data as any).teamId || state.playerTeamId

            let resolvedTeam: TeamSaveData | undefined
            let normalizedMoney = 0

            if (teamId && (money || reputation)) {
              resolvedTeam = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
              if (!resolvedTeam) return

              const moneyValidation = parseBoundedInt(money || 0, "Event money effect", -MAX_TRANSFER_FEE, MAX_TRANSFER_FEE)
              if (!moneyValidation.ok) return
              normalizedMoney = moneyValidation.value

              if (normalizedMoney < 0 && resolvedTeam.budget < Math.abs(normalizedMoney)) {
                // Keep event unresolved so player can choose a different branch they can afford.
                return
              }
            }

            if (playerId && (morale || loyalty)) {
              const player = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId))
              if (player) {
                if (morale) player.morale = Math.max(0, Math.min(100, player.morale + morale))
                if (loyalty) player.loyalty = Math.max(0, Math.min(100, player.loyalty + loyalty))
              }
            }

            if (resolvedTeam) {
              if (normalizedMoney !== 0) {
                resolvedTeam.budget += normalizedMoney
                state.financeLedger.push({
                  id: nextDeterministicId(state, "fin_event", eventId),
                  week: state.currentWeek,
                  teamId: resolvedTeam.id,
                  type: normalizedMoney > 0 ? "INCOME" : "EXPENSE",
                  category: "OTHER",
                  amount: Math.abs(normalizedMoney),
                  description: choice.text || "Event resolution",
                  balance: resolvedTeam.budget
                })
              }
              if (reputation) resolvedTeam.reputation = Math.max(0, Math.min(100, resolvedTeam.reputation + reputation))
            }
          }

          // Legend Coach Hire — special handling
          if (eventId.startsWith("legend_coach_opportunity_") && choiceId === "hire") {
            const legendData = event.data as any
            const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
            if (team && legendData) {
              const salaryCost = legendData.salaryCost || 15000
              // Replace existing coach or add new one
              const existingCoachIdx = state.staff.findIndex(s => s.teamId === team.id && s.role === "coach")
              const legendCoach: any = {
                id: `legend_coach_${legendData.legendId}_${state.currentWeek}`,
                name: legendData.legendName || "Legend Coach",
                role: "coach" as const,
                level: 5, // Max level
                specialization: "legendary",
                salaryPerWeek: salaryCost,
                teamId: team.id,
                yearsRemaining: 2,
                portraitPath: legendData.legendPortrait,
                description: `Legendary coach ${legendData.legendName}`,
                nationality: "",
                rarity: "LEGENDARY",
                contractEndWeek: state.currentWeek + 104,
                xp: 0,
                xpToNextLevel: 1000,
                talentPoints: 0,
                unlockedTalentIds: [],
              }
              if (existingCoachIdx >= 0) {
                state.staff[existingCoachIdx] = legendCoach
              } else {
                state.staff.push(legendCoach)
              }
              // Deduct first week's salary and boost chemistry
              team.budget -= salaryCost
              team.chemistry = Math.min(100, (team.chemistry ?? 50) + 10)
              team.reputation = Math.min(100, team.reputation + 5)
            }
          }

          event.selectedChoiceId = choiceId
          event.acknowledged = true
          if (!state.acknowledgedEventIds.includes(eventId)) {
            state.acknowledgedEventIds.push(eventId)
          }
        })
      },

      saveMatchResult: (matchId, result) => {
        set((state) => {
          const matchIndex = state.scheduledMatches.findIndex(m => m.id === matchId)
          if (matchIndex === -1) return

          const match = state.scheduledMatches[matchIndex]
          const matchSeed = ensureDeterministicSeed(state, match)
          const matchRng = new SeededRNG(matchSeed)

          const homeTeam = (state._teamIndex?.get(match.homeTeamId) ?? state.teams.find(t => t.id === match.homeTeamId))
          const awayTeam = (state._teamIndex?.get(match.awayTeamId) ?? state.teams.find(t => t.id === match.awayTeamId))
          if (!homeTeam || !awayTeam || !state.playerTeamId) return

          const isPlayerMatch = match.homeTeamId === state.playerTeamId || match.awayTeamId === state.playerTeamId
          if (!isPlayerMatch) return
          if (match.week > state.currentWeek) return

          const rosterIds = [...new Set([...homeTeam.rosterIds, ...awayTeam.rosterIds])]
          if (rosterIds.length === 0) return
          const rosterSet = new Set(rosterIds)

          const maxMapsForFormat = match.format === "BO1" ? 1 : match.format === "BO5" ? 5 : 3
          const mapsToWin = match.format === "BO1" ? 1 : match.format === "BO5" ? 3 : 2

          const clampInt = (value: unknown, min: number, max: number, fallback = min): number => {
            if (typeof value !== "number" || !Number.isFinite(value)) return fallback
            return Math.max(min, Math.min(max, Math.floor(value)))
          }
          const clampFloat = (value: unknown, min: number, max: number, fallback = min): number => {
            if (typeof value !== "number" || !Number.isFinite(value)) return fallback
            return Math.max(min, Math.min(max, value))
          }

          const rawMaps = Array.isArray(result.maps) ? result.maps : []
          const sanitizedMaps = rawMaps
            .slice(0, Math.min(MAX_MAPS_PER_SERIES, maxMapsForFormat))
            .map((rawMap: any, index: number) => {
              const fallbackMapId = typeof match.maps?.[index] === "string" && ALLOWED_MAP_IDS.has(match.maps[index])
                ? match.maps[index]
                : undefined
              const mapId = typeof rawMap?.map === "string" && ALLOWED_MAP_IDS.has(rawMap.map)
                ? rawMap.map
                : fallbackMapId

              if (!mapId) return null

              const homeRounds = clampInt(rawMap?.homeScore ?? rawMap?.finalScore?.team1, 0, MAX_ROUNDS_PER_MAP, 0)
              const awayRounds = clampInt(rawMap?.awayScore ?? rawMap?.finalScore?.team2, 0, MAX_ROUNDS_PER_MAP, 0)
              const mapWinner = homeRounds > awayRounds
                ? homeTeam.id
                : awayRounds > homeRounds
                  ? awayTeam.id
                  : undefined

              return {
                ...rawMap,
                map: mapId,
                homeScore: homeRounds,
                awayScore: awayRounds,
                finalScore: { team1: homeRounds, team2: awayRounds },
                winner: mapWinner
              }
            })
            .filter((entry): entry is NonNullable<typeof entry> => !!entry)

          let computedHomeSeries = 0
          let computedAwaySeries = 0
          sanitizedMaps.forEach((map) => {
            if (map.homeScore > map.awayScore) computedHomeSeries++
            else if (map.awayScore > map.homeScore) computedAwaySeries++
          })

          const providedHomeSeries = clampInt(result.homeScore, 0, maxMapsForFormat, 0)
          const providedAwaySeries = clampInt(result.awayScore, 0, maxMapsForFormat, 0)
          let homeSeries = (computedHomeSeries + computedAwaySeries) > 0 ? computedHomeSeries : providedHomeSeries
          let awaySeries = (computedHomeSeries + computedAwaySeries) > 0 ? computedAwaySeries : providedAwaySeries

          homeSeries = Math.min(maxMapsForFormat, homeSeries)
          awaySeries = Math.min(maxMapsForFormat, awaySeries)

          // Never allow tie series state at save boundary.
          if (homeSeries === awaySeries) {
            if (providedHomeSeries !== providedAwaySeries) {
              homeSeries = providedHomeSeries
              awaySeries = providedAwaySeries
            } else {
              // Deterministic fallback to avoid null winner corruption.
              if (matchRng.bool(0.5)) homeSeries = Math.min(maxMapsForFormat, awaySeries + 1)
              else awaySeries = Math.min(maxMapsForFormat, homeSeries + 1)
            }
          }

          const winnerId = homeSeries > awaySeries ? homeTeam.id : awayTeam.id
          const winnerRoster = winnerId === homeTeam.id ? homeTeam.rosterIds : awayTeam.rosterIds
          const fallbackMvp = rosterSet.has(result.mvpPlayerId)
            ? result.mvpPlayerId
            : (winnerRoster[0] || rosterIds[0])

          const sanitizedPlayerStats = rosterIds.reduce<Record<string, any>>((acc, pid) => {
            const raw = (result.playerStats as any)?.[pid]
            const kills = clampInt(raw?.kills, 0, MAX_MATCH_KILLS, 0)
            const deaths = clampInt(raw?.deaths, 0, MAX_MATCH_DEATHS, 0)
            const assists = clampInt(raw?.assists, 0, MAX_MATCH_ASSISTS, 0)
            const headshots = clampInt(raw?.headshots, 0, kills, 0)

            acc[pid] = {
              playerId: pid,
              matchId: match.id,
              kills,
              deaths,
              assists,
              headshots,
              adr: clampFloat(raw?.adr, 0, MAX_MATCH_ADR, 0),
              kast: clampFloat(raw?.kast, 0, 100, 0),
              rating: clampFloat(raw?.rating, 0, MAX_MATCH_RATING, 0),
              clutches: clampInt(raw?.clutches, 0, MAX_MATCH_CLUTCHES, 0),
              firstKills: clampInt(raw?.firstKills, 0, MAX_MATCH_OPENINGS, 0),
              firstDeaths: clampInt(raw?.firstDeaths, 0, MAX_MATCH_OPENINGS, 0),
              mapsPlayed: clampInt(raw?.mapsPlayed, 0, maxMapsForFormat, sanitizedMaps.length)
            }
            return acc
          }, {})

          result = {
            ...result,
            winnerId,
            homeScore: homeSeries,
            awayScore: awaySeries,
            maps: sanitizedMaps as any,
            mvpPlayerId: fallbackMvp,
            playerStats: sanitizedPlayerStats
          }
          const completedMatch: CompletedMatchSaveData = { ...match, result }

          // Remove from scheduled
          state.scheduledMatches.splice(matchIndex, 1)

          if (homeTeam && awayTeam) {
            const homeWon = result.homeScore > result.awayScore
            const isDraw = result.homeScore === result.awayScore

            // Update Recent Form
            const updateForm = (team: TeamSaveData, result: "W" | "L" | "D") => {
              if (!team.recentForm) team.recentForm = []
              team.recentForm.push(result)
              if (team.recentForm.length > 5) team.recentForm.shift()
            }

            updateForm(homeTeam, isDraw ? "D" : (homeWon ? "W" : "L"))
            updateForm(awayTeam, isDraw ? "D" : (homeWon ? "L" : "W"))

            // Elo and ranking update (shared path with weekly auto-sim)
            const oldHomeRank = homeTeam.worldRanking || 999
            const oldAwayRank = awayTeam.worldRanking || 999

            if (!isDraw) {
              const winnerId = homeWon ? homeTeam.id : awayTeam.id
              const loserId = homeWon ? awayTeam.id : homeTeam.id
              const scoreDiff = Math.abs(result.homeScore - result.awayScore)
              const tournamentTier = (match.tournamentId && match.tournamentId !== "SCRIM")
                ? state.tournaments.find(t => t.id === match.tournamentId)?.tier
                : undefined

              let homeRoundsTotal = 0
              let awayRoundsTotal = 0
              result.maps.forEach((m: any) => {
                homeRoundsTotal += m.homeScore || 0
                awayRoundsTotal += m.awayScore || 0
              })
              const roundDiff = homeWon
                ? (homeRoundsTotal - awayRoundsTotal)
                : (awayRoundsTotal - homeRoundsTotal)

              const getMatchesPlayed = (teamId: string) =>
                state.completedMatches.filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId).length
              const winnerMatches = getMatchesPlayed(winnerId)
              const loserMatches = getMatchesPlayed(loserId)

              const eloResult = LeagueEngine.updateEloAfterMatch(
                state as any,
                winnerId,
                loserId,
                scoreDiff,
                tournamentTier,
                winnerMatches,
                loserMatches,
                roundDiff
              )

              if (eloResult) {
                completedMatch.eloChange = {
                  home: homeWon ? eloResult.winnerChange : eloResult.loserChange,
                  away: homeWon ? eloResult.loserChange : eloResult.winnerChange
                }
              }
            }

            completedMatch.rankingChange = {
              home: oldHomeRank - (homeTeam.worldRanking || 999),
              away: oldAwayRank - (awayTeam.worldRanking || 999)
            }

            // ADD TO COMPLETED
            state.completedMatches.push(completedMatch)

            const xpGains: Record<string, number> = {}

              // Sponsor Goals
              ;[homeTeam, awayTeam].forEach(team => {
                const wonMatch = (team.id === homeTeam.id && homeWon) || (team.id === awayTeam.id && !homeWon)
                if (!team.sponsors) return
                team.sponsors.forEach((sponsor: any) => {
                  if (sponsor.goals) {
                    sponsor.goals.forEach((goal: any) => {
                      if (goal.isCompleted) return
                      if (goal.description.includes("Win Matches") && wonMatch) goal.current += 1
                      if (goal.description.includes("Win Tournament maps")) {
                        const mapsWon = team.id === homeTeam.id ? result.homeScore : result.awayScore
                        goal.current += mapsWon
                      }
                      if (goal.current >= goal.target) {
                        goal.current = goal.target
                        goal.isCompleted = true
                        const payoutEntryId = `fin_sponsor_match_${state.currentWeek}_${team.id}_${sponsor.id}_${goal.id}_${matchId}`
                        const alreadyPaid = state.financeLedger.some(entry => entry.id === payoutEntryId)
                        if (!alreadyPaid) {
                          team.budget += goal.bonusPayout
                          state.financeLedger.push({
                            id: payoutEntryId,
                            week: state.currentWeek,
                            teamId: team.id,
                            type: "INCOME",
                            category: "SPONSOR",
                            amount: goal.bonusPayout,
                            description: `Goal Reached: ${goal.description}`,
                            balance: team.budget
                          })
                          if (team.id === state.playerTeamId) {
                            const eventId = `evt_sponsor_match_goal_${state.currentWeek}_${sponsor.id}_${goal.id}_${matchId}`
                            if (!state.eventsLog.some(event => event.id === eventId)) {
                              state.eventsLog.unshift({
                                id: eventId,
                                type: "SPONSOR_OFFER",
                                week: state.currentWeek,
                                data: { title: "Sponsor Goal Met", message: `${sponsor.name} sent a bonus of $${goal.bonusPayout.toLocaleString()}.` },
                                acknowledged: false
                              })
                            }
                          }
                        }
                      }
                    })
                  }
                })
              })

            // XP and Stats - build lookup map for O(1) player access
            const playerMap = new Map(state.players.map(p => [p.id, p]))
            // Resolve tournament tier for XP/morale scaling (accessible to updatePlayerStats)
            const matchTournamentTier = (match.tournamentId && match.tournamentId !== "SCRIM")
              ? state.tournaments.find(t => t.id === match.tournamentId)?.tier
              : undefined
            const updatePlayerStats = (team: TeamSaveData, won: boolean) => {
              if (!team || !result.playerStats) return
              const playedIds = Object.keys(result.playerStats).filter(pid => team.rosterIds.includes(pid))
              playedIds.forEach(pid => {
                const player = playerMap.get(pid)
                if (player) {
                  player.matchesPlayed++
                  // Scale fatigue by match format: BO1=10, BO3=15, BO5=25
                  const fatigueCost = match.format === "BO5" ? 25 : match.format === "BO3" ? 15 : 10
                  player.fatigue = Math.min(100, (player.fatigue || 0) + fatigueCost)
                  // Morale scaled by tournament tier
                  const moraleChange = (() => {
                    if (!matchTournamentTier) return won ? 5 : -5
                    switch (matchTournamentTier) {
                      case "S_TIER": return won ? 15 : -3
                      case "A_TIER": return won ? 10 : -4
                      case "B_TIER": return won ? 7 : -5
                      default: return won ? 5 : -5
                    }
                  })()
                  player.morale = Math.max(0, Math.min(100, (player.morale || 50) + moraleChange))

                  const stats = result.playerStats[pid]
                  if (stats) {
                    player.totalKills = (player.totalKills || 0) + stats.kills
                    player.totalDeaths = (player.totalDeaths || 0) + stats.deaths
                    if (result.mvpPlayerId === pid) player.totalMVPs = (player.totalMVPs || 0) + 1

                    // XP - base + tournament tier bonus
                    let baseXP = won ? 150 : 80
                    if (matchTournamentTier) {
                      const tierBonus: Record<string, number> = { "S_TIER": 200, "A_TIER": 150, "B_TIER": 100, "C_TIER": 50 }
                      baseXP += tierBonus[matchTournamentTier] ?? 50
                    }
                    const ratingBonus = Math.max(0, (stats.rating - 1.0) * 200)
                    const mvpBonus = (result.mvpPlayerId === pid) ? 50 : 0
                    const totalXP = Math.round(baseXP + ratingBonus + mvpBonus)
                    xpGains[pid] = totalXP
                    player.xp = (player.xp || 0) + totalXP

                    // Level Up
                    if (player.xp >= (player.xpToNextLevel || 1000)) {
                      player.xp -= (player.xpToNextLevel || 1000)
                      player.level = (player.level || 1) + 1
                      player.talentPoints = (player.talentPoints || 0) + 1
                      player.xpToNextLevel = Math.floor((player.xpToNextLevel || 1000) * 1.5)
                      state.eventsLog.unshift({
                        id: nextDeterministicId(state, "evt_lvl", player.id),
                        type: "PLAYER_LEVEL_UP",
                        week: state.currentWeek,
                        data: { playerName: player.nickname, newLevel: player.level },
                        acknowledged: false
                      })
                    }

                    // Weapon Mastery
                    if (!player.weaponMastery) player.weaponMastery = {}
                    const role = (player as any).role || "RIFLER"
                    let primaryWeapon = "AK47"
                    if (role === "AWPER") primaryWeapon = "AWP"
                    else if (matchRng.bool(0.5)) primaryWeapon = "M4A4"

                    if (stats.kills > 0) {
                      const weaponXp = stats.kills * 10
                      if (!player.weaponMastery[primaryWeapon]) player.weaponMastery[primaryWeapon] = { xp: 0, level: 1, kills: 0 }
                      const mastery = player.weaponMastery[primaryWeapon] as any
                      mastery.kills += stats.kills
                      mastery.xp += weaponXp
                      const xpToNext = mastery.level * 200
                      if (mastery.xp >= xpToNext && mastery.level < 10) {
                        mastery.level++
                        mastery.xp -= xpToNext
                        if (mastery.level === 10) {
                          state.eventsLog.unshift({
                            id: nextDeterministicId(state, "evt_max"),
                            type: "TRAINING_COMPLETE",
                            week: state.currentWeek,
                            data: { title: "Signature Weapon", message: `${player.nickname} mastered ${primaryWeapon}!` },
                            acknowledged: false
                          })
                        }
                      }
                    }
                  }
                }
              })
            }

            updatePlayerStats(homeTeam, homeWon)
            updatePlayerStats(awayTeam, !homeWon)

            // Manager Stats
            if (homeTeam.id === state.playerTeamId || awayTeam.id === state.playerTeamId) {
              const pWon = (homeTeam.id === state.playerTeamId && homeWon) || (awayTeam.id === state.playerTeamId && !homeWon)
              state.managerDetails.careerMatches = (state.managerDetails.careerMatches || 0) + 1
              if (pWon) state.managerDetails.careerWins = (state.managerDetails.careerWins || 0) + 1
              else state.managerDetails.careerLosses = (state.managerDetails.careerLosses || 0) + 1

              // Achievement Check (Simplified)
              checkAchievements({
                totalWins: state.managerDetails.careerWins,
                matchesPlayed: state.managerDetails.careerMatches,
                firstTournamentParticipation: !!match.tournamentId && match.tournamentId !== "SCRIM"
              })

              // Manager XP Progression
              ManagerProgression.gainXP(state, pWon ? 100 : 25)
            }

            // Tournament Logic
            if (match.tournamentId && match.tournamentId !== "SCRIM") {
              const rng = new SeededRNG(matchSeed)
              const winnerId = homeWon ? homeTeam.id : awayTeam.id
              const loserId = homeWon ? awayTeam.id : homeTeam.id
              const tournament = state.tournaments.find(t => t.id === match.tournamentId)

              TournamentManager.processMatchResult(state as any, match.tournamentId, matchId, winnerId, loserId)

              // Simulate all other AI matches in the same stage
              TournamentManager.simulateConcurrentMatches(state as any, match.tournamentId, state.playerTeamId || "", match.stage || "", rng)

              // Safety: Ensure player's next bracket match gets scheduled if ready
              if (tournament?.playoffBracket) {
                const completedMatch = tournament.playoffBracket.find((m: any) => m.id === matchId)
                if (completedMatch) {
                  // Find the next match this feeds into
                  const nextMatch = tournament.playoffBracket.find((m: any) =>
                    m.sourceMatchIds?.includes(matchId) && !m.isCompleted
                  )
                  if (nextMatch && nextMatch.homeTeamId && nextMatch.awayTeamId) {
                    // Both teams are ready but match might not be scheduled
                    const alreadyScheduled = state.scheduledMatches.some((m: any) => m.id === nextMatch.id)
                    if (!alreadyScheduled) {
                      state.scheduledMatches.push({
                        id: nextMatch.id,
                        homeTeamId: nextMatch.homeTeamId,
                        awayTeamId: nextMatch.awayTeamId,
                        tournamentId: nextMatch.tournamentId,
                        stage: nextMatch.stage,
                        week: nextMatch.week,
                        format: nextMatch.format,
                        seed: ensureDeterministicSeed(state, nextMatch as { seed?: number }),
                        isHighPressure: nextMatch.stage?.includes("Final") || nextMatch.stage?.includes("Semi")
                      })
                    }
                  }
                }
              }
            }

            result.xpGains = xpGains
            state.activeMatchId = null
            state.activeMatchState = null

            // News Feed
            const winner = homeWon ? homeTeam : awayTeam
            const loser = homeWon ? awayTeam : homeTeam
            const scoreStr = homeWon ? `${result.homeScore}-${result.awayScore}` : `${result.awayScore}-${result.homeScore}`
            state.newsFeed.unshift({
              id: nextDeterministicId(state, "news_match"),
              title: `${winner.name} defeat ${loser.name} ${scoreStr}`,
              content: `${winner.name} secured a ${scoreStr} victory against ${loser.name}.`,
              category: "MATCH",
              teamId: winner.id,
              week: state.currentWeek
            })
            if (state.newsFeed.length > 50) state.newsFeed.pop()
          }
        })
      },

      updateScheduledMatch: (matchId, updates) => {
        set((state) => {
          const match = state.scheduledMatches.find(m => m.id === matchId)
          if (match) {
            const sanitizedUpdates: Partial<MatchSaveData> = {}

            if (typeof updates.vetoComplete === "boolean") {
              sanitizedUpdates.vetoComplete = updates.vetoComplete
            }

            if (Array.isArray(updates.maps)) {
              const maxMapsForFormat = match.format === "BO1" ? 1 : match.format === "BO5" ? 5 : 3
              const uniqueMaps = [...new Set(
                updates.maps
                  .filter((map): map is string => typeof map === "string" && ALLOWED_MAP_IDS.has(map))
                  .slice(0, Math.min(MAX_MAPS_PER_SERIES, maxMapsForFormat))
              )]
              sanitizedUpdates.maps = uniqueMaps
            }

            if (updates.mapStartingSides && typeof updates.mapStartingSides === "object") {
              const sanitizedSides: Record<string, string> = {}
              const validTeamIds = new Set([match.homeTeamId, match.awayTeamId])
              const candidateMaps = Array.isArray(sanitizedUpdates.maps)
                ? sanitizedUpdates.maps
                : (Array.isArray(match.maps) ? match.maps : [])
              const allowedSeriesMaps = new Set(
                candidateMaps.filter((map): map is string => typeof map === "string" && ALLOWED_MAP_IDS.has(map))
              )
              Object.entries(updates.mapStartingSides).forEach(([mapId, ctTeamId]) => {
                const isAllowedMap = ALLOWED_MAP_IDS.has(mapId) && (allowedSeriesMaps.size === 0 || allowedSeriesMaps.has(mapId))
                if (isAllowedMap && typeof ctTeamId === "string" && validTeamIds.has(ctTeamId)) {
                  sanitizedSides[mapId] = ctTeamId
                }
              })
              sanitizedUpdates.mapStartingSides = sanitizedSides
            }

            if (typeof updates.vodReviewed === "boolean") {
              sanitizedUpdates.vodReviewed = updates.vodReviewed
            }

            if (typeof updates.mentalPrep === "boolean") {
              sanitizedUpdates.mentalPrep = updates.mentalPrep
            }

            if (sanitizedUpdates.vetoComplete) {
              const mapsForVeto = Array.isArray(sanitizedUpdates.maps)
                ? sanitizedUpdates.maps
                : (Array.isArray(match.maps) ? match.maps : [])
              if (mapsForVeto.length === 0) {
                // Never mark veto complete without a resolved map pool.
                delete sanitizedUpdates.vetoComplete
              }
            }

            if (Object.keys(sanitizedUpdates).length > 0) {
              Object.assign(match, sanitizedUpdates)
            }
          }
        })
      },

      simulateInstantMatch: async (matchId: string) => {
        const state = get()
        const match = state.scheduledMatches.find(m => m.id === matchId)
        if (!match) return
        if (!state.playerTeamId) return

        const isPlayerMatch = match.homeTeamId === state.playerTeamId || match.awayTeamId === state.playerTeamId
        if (!isPlayerMatch) return
        if (match.week > state.currentWeek) return
        if (state.timeMode === "HYBRID_DAILY" && match.week === state.currentWeek) {
          const matchDay = match.day ?? 6
          if (matchDay > state.currentDay) return
        }

        const hTeam = (state._teamIndex?.get(match.homeTeamId) ?? state.teams.find(t => t.id === match.homeTeamId))
        const aTeam = (state._teamIndex?.get(match.awayTeamId) ?? state.teams.find(t => t.id === match.awayTeamId))
        if (!hTeam || !aTeam) return

        const hPlayers = hTeam.rosterIds.map(id => (state._playerIndex?.get(id) ?? state.players.find(p => p.id === id))).filter(Boolean) as unknown as Player[]
        const aPlayers = aTeam.rosterIds.map(id => (state._playerIndex?.get(id) ?? state.players.find(p => p.id === id))).filter(Boolean) as unknown as Player[]

        const hStaffData = state.staff.filter(s => hTeam.staffIds.includes(s.id))
        const aStaffData = state.staff.filter(s => aTeam.staffIds.includes(s.id))

        const mapStaff = (sData: any[]) => ({
          coach: sData.find(s => s.role === "coach"),
          analyst: sData.find(s => s.role === "analyst"),
          psychologist: sData.find(s => s.role === "psychologist"),
        })

        // Apply staff talent passive bonuses
        const hBonuses = collectTeamTalentBonuses(hStaffData)
        const aBonuses = collectTeamTalentBonuses(aStaffData)
        applyTalentMoraleFloor(hPlayers, hBonuses)
        applyTalentMoraleFloor(aPlayers, aBonuses)

        const hStaff = mapStaff(hStaffData)
        const aStaff = mapStaff(aStaffData)

        // anti_strat: reduce opponent coach tactic bonus (multiplicative)
        // mapStaff returns raw StaffSaveData which lacks tacticBonus, so derive from level
        const homeAntiStrat = (hBonuses["anti_strat"] || 0) / 100
        const awayAntiStrat = (aBonuses["anti_strat"] || 0) / 100
        if (homeAntiStrat > 0 && aStaff.coach) {
          const baseTactic = aStaff.coach.tacticBonus || (aStaff.coach.level || 1) * 2
          aStaff.coach.tacticBonus = Math.round(baseTactic * (1 - homeAntiStrat))
        }
        if (awayAntiStrat > 0 && hStaff.coach) {
          const baseTactic = hStaff.coach.tacticBonus || (hStaff.coach.level || 1) * 2
          hStaff.coach.tacticBonus = Math.round(baseTactic * (1 - awayAntiStrat))
        }

        const bestOf = match.format === "BO3" ? 3 : match.format === "BO5" ? 5 : 1
        const fallbackSeed = Math.max(
          1,
          Array.from(match.id).reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 0)
        )
        const runtimeMatch: any = {
          ...match,
          seed: (typeof match.seed === "number" && match.seed > 0) ? match.seed : fallbackSeed,
          bestOf
        }

        const result = simulationEngineV2.simulateMatch(
          runtimeMatch,
          hTeam as unknown as Team,
          aTeam as unknown as Team,
          hPlayers,
          aPlayers,
          hStaff as any,
          aStaff as any
        )

        state.saveMatchResult(matchId, result)

        // Check Achievements Update
        checkAchievements({
          totalWins: state.managerDetails.careerWins,
          firstTournamentParticipation: !!match.tournamentId && match.tournamentId !== "SCRIM",
        })

        // Clear active match if we just simulated it
        if (state.activeMatchId === matchId) {
          set({ activeMatchId: null, activeMatchState: null })
        }
      },

      transferPlayer: (playerId, fromTeamId, toTeamId, fee, newContract) => {
        let result = { success: false, message: "Unknown error" }
        set((state) => {
          // Handle release to free agency
          if (toTeamId === "FA") {
            const sourceTeam = fromTeamId && fromTeamId !== "FA"
              ? (state._teamIndex?.get(fromTeamId) ?? state.teams.find(t => t.id === fromTeamId))
              : state.teams.find(t => t.rosterIds.includes(playerId))
            if (sourceTeam) {
              sourceTeam.rosterIds = sourceTeam.rosterIds.filter(id => id !== playerId)
              if (sourceTeam.activeRoleTraining) {
                const hadTraining = sourceTeam.activeRoleTraining.some(t => t.playerId === playerId)
                sourceTeam.activeRoleTraining = sourceTeam.activeRoleTraining.filter(t => t.playerId !== playerId)
                if (hadTraining) {
                  sourceTeam.trainingSlotsUsed = Math.max(0, (sourceTeam.trainingSlotsUsed || 0) - 1)
                }
              }
              const roster = state.players.filter(p => sourceTeam.rosterIds.includes(p.id))
              sourceTeam.synergyMatrix = SynergyCalculator.calculateTeamMatrix(roster)
            }
            state.contracts = state.contracts.filter(c => c.playerId !== playerId)
            const releasedPlayer = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId))
            if (releasedPlayer) {
              (releasedPlayer as any).forSale = false
            }
            result = { success: true, message: "Player released to free agency" }
            return
          }

          const toTeam = (state._teamIndex?.get(toTeamId) ?? state.teams.find(t => t.id === toTeamId))
          if (!toTeam) {
            result = { success: false, message: "Target team not found" }
            return
          }

          const feeValidation = parseBoundedInt(fee, "Transfer fee", 0, MAX_TRANSFER_FEE)
          if (!feeValidation.ok) {
            result = { success: false, message: feeValidation.message }
            return
          }
          const normalizedFee = feeValidation.value

          const transferPlayerRecord = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId))
          if (!transferPlayerRecord) {
            result = { success: false, message: "Player not found" }
            return
          }

          if (fromTeamId && fromTeamId !== "FA" && fromTeamId === toTeamId) {
            result = { success: false, message: "Cannot transfer a player to the same team" }
            return
          }

          const destinationHasPlayer = toTeam.rosterIds.includes(playerId)
          if (destinationHasPlayer) {
            result = { success: false, message: "Player is already on the destination team" }
            return
          }
          if (toTeam.rosterIds.length >= 7) {
            result = { success: false, message: `${toTeam.name} roster is full (max 7 players)` }
            return
          }

          let fromTeam = null as typeof toTeam | null
          if (!fromTeamId || fromTeamId === "FA") {
            const currentOwner = state.teams.find(t => t.rosterIds.includes(playerId))
            if (currentOwner) {
              result = { success: false, message: `${currentOwner.name} currently owns this player` }
              return
            }
          }
          // 0. Validate and Strategic Refusal Check (Phase 7 Enh)
          if (fromTeamId && fromTeamId !== "FA") {
            fromTeam = (state._teamIndex?.get(fromTeamId) ?? state.teams.find(t => t.id === fromTeamId)) || null
            if (!fromTeam) {
              result = { success: false, message: "Source team not found" }
              return
            }

            if (!fromTeam.rosterIds.includes(playerId)) {
              result = { success: false, message: "Player is not on the source team roster" }
              return
            }

            const matches = state.scheduledMatches.filter(m =>
              m.week >= state.currentWeek &&
              m.week <= state.currentWeek + 3 &&
              ((m.homeTeamId === fromTeamId && m.awayTeamId === toTeamId) || (m.homeTeamId === toTeamId && m.awayTeamId === fromTeamId))
            )

            if (matches.length > 0) {
              const week = matches[0].week
              result = { success: false, message: `Offer Rejected: "We play you in Week ${week}! We won't strengthen a rival before the match."` }
              return
            }
          }

          let normalizedContract: {
            salaryPerWeek: number
            startWeek: number
            endWeek: number
            buyout: number
          } | undefined

          if (newContract) {
            const salaryValidation = parseBoundedInt(newContract.salaryPerWeek, "Contract salary", 1, MAX_PLAYER_SALARY_PER_WEEK)
            if (!salaryValidation.ok) {
              result = { success: false, message: salaryValidation.message }
              return
            }

            const startWeekValidation = parseBoundedInt(newContract.startWeek, "Contract start week", 0, 100000)
            if (!startWeekValidation.ok) {
              result = { success: false, message: startWeekValidation.message }
              return
            }

            const endWeekValidation = parseBoundedInt(newContract.endWeek, "Contract end week", 1, 100000)
            if (!endWeekValidation.ok) {
              result = { success: false, message: endWeekValidation.message }
              return
            }

            const buyoutValidation = parseBoundedInt(newContract.buyout, "Contract buyout", 0, MAX_TRANSFER_FEE)
            if (!buyoutValidation.ok) {
              result = { success: false, message: buyoutValidation.message }
              return
            }

            if (endWeekValidation.value <= startWeekValidation.value) {
              result = { success: false, message: "Contract end week must be after start week" }
              return
            }

            if (endWeekValidation.value - startWeekValidation.value > MAX_CONTRACT_LENGTH_WEEKS) {
              result = { success: false, message: "Contract length exceeds maximum allowed duration" }
              return
            }

            normalizedContract = {
              salaryPerWeek: salaryValidation.value,
              startWeek: startWeekValidation.value,
              endWeek: endWeekValidation.value,
              buyout: buyoutValidation.value
            }
          }

          // 1. Hard budget check for destination team
          if (toTeam.budget < normalizedFee) {
            result = { success: false, message: `${toTeam.name} cannot afford this transfer fee.` }
            return
          }

          // 2. Handle From Team (if applicable)
          if (fromTeam) {
            fromTeam.rosterIds = fromTeam.rosterIds.filter(id => id !== playerId)
            fromTeam.budget += normalizedFee

            // Clean up active role training for transferred player
            if (fromTeam.activeRoleTraining) {
              const hadTraining = fromTeam.activeRoleTraining.some(t => t.playerId === playerId)
              fromTeam.activeRoleTraining = fromTeam.activeRoleTraining.filter(t => t.playerId !== playerId)
              if (hadTraining) {
                fromTeam.trainingSlotsUsed = Math.max(0, (fromTeam.trainingSlotsUsed || 0) - 1)
              }
            }
          }

          // 3. Handle To Team
          if (!destinationHasPlayer) {
            toTeam.rosterIds.push(playerId)
          }
          toTeam.budget -= normalizedFee

          // 4. Update Contract
          if (normalizedContract) {
            // Remove old contract for this player
            state.contracts = state.contracts.filter(c => c.playerId !== playerId)

            // Add new contract
            state.contracts.push({
              playerId,
              teamId: toTeamId,
              salaryPerWeek: normalizedContract.salaryPerWeek,
              startWeek: normalizedContract.startWeek,
              endWeek: normalizedContract.endWeek,
              buyout: normalizedContract.buyout
            })
          }

          // 5. Update Player Status
          const updatedPlayer = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId))
          if (updatedPlayer) {
            (updatedPlayer as any).forSale = false
          }

          // 6. Ledger Entries
          if (normalizedFee > 0) {
            const playerName = transferPlayerRecord.nickname || playerId
            state.financeLedger.push({
              id: nextDeterministicId(state, "fin_transfer_out", playerId, toTeamId),
              week: state.currentWeek,
              teamId: toTeamId,
              type: "EXPENSE",
              category: "TRANSFER_OUT",
              amount: normalizedFee,
              description: `Transfer Fee: ${playerName}`,
              balance: toTeam.budget
            })

            if (fromTeamId && fromTeamId !== "FA" && fromTeam) {
              state.financeLedger.push({
                id: nextDeterministicId(state, "fin_transfer_in", playerId, fromTeamId),
                week: state.currentWeek,
                teamId: fromTeamId,
                type: "INCOME",
                category: "TRANSFER_IN",
                amount: normalizedFee,
                description: `Transfer Received: ${playerName}`,
                balance: fromTeam.budget
              })
            }
          }

          // 7. Transfer History
          if (state.transferHistory) {
            const player = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId))
            let fromName = "Free Agent"

            if (fromTeamId && fromTeamId !== "FA") {
              const fTeam = (state._teamIndex?.get(fromTeamId) ?? state.teams.find(t => t.id === fromTeamId))
              if (fTeam) fromName = fTeam.name
            }

            state.transferHistory.push({
              id: `transfer_${state.currentWeek}_${playerId}_${toTeamId}_${state.transferHistory.length}`,
              week: state.currentWeek,
              type: "TRANSFER",
              playerId: playerId,
              playerName: player?.nickname || "Unknown",
              fromTeamId: fromTeamId || null,
              fromTeamName: fromName,
              toTeamId: toTeamId,
              toTeamName: toTeam.name,
              fee: normalizedFee
            })

            // Phase 21: Career Narrative - Transfer News
            const newsId = nextDeterministicId(state, "news_tr", playerId, toTeamId)
            state.newsFeed.unshift({
              id: newsId,
              title: `${player?.nickname || "Player"} joins ${toTeam.name}`,
              content: `${player?.nickname || "Player"} has officially completed a move from ${fromName} to ${toTeam.name}. ${normalizedFee > 0 ? `The deal is estimated to be worth $${normalizedFee.toLocaleString()}.` : 'The player joins as a free agent.'}`,
              category: "TRANSFER",
              playerId: playerId,
              teamId: toTeamId,
              week: state.currentWeek
            })
            if (state.newsFeed.length > 50) state.newsFeed.pop()
          }

          // Recalculate synergy for affected teams
          const recalcTeams = [toTeam]
          if (fromTeam) recalcTeams.push(fromTeam)
          for (const team of recalcTeams) {
            const roster = state.players.filter(p => team.rosterIds.includes(p.id))
            team.synergyMatrix = SynergyCalculator.calculateTeamMatrix(roster)
            applyRosterChangePenalty(team, state.currentWeek, 1)
          }

          // Steam Achievement: First Transfer (only if player's team is involved)
          if (toTeamId === state.playerTeamId || (fromTeamId && fromTeamId === state.playerTeamId)) {
            try {
              checkAchievements({ completedTransfer: true })
            } catch (e) {
              // Silent fail for achievements
            }
          }

          result = { success: true, message: "Transfer successful" }
        })
        return result
      },


      fireStaff: (staffId) => {
        set((state) => {
          const staffIndex = state.staff.findIndex(s => s.id === staffId)
          if (staffIndex !== -1) {
            const staffMember = state.staff[staffIndex]
            const team = (state._teamIndex?.get(staffMember.teamId) ?? state.teams.find(t => t.id === staffMember.teamId))
            if (team) {
              team.staffIds = team.staffIds.filter(id => id !== staffId)
            }
            state.staff.splice(staffIndex, 1)

            // Phase 21: News
            const newsId = nextDeterministicId(state, "news_fire", staffId)
            state.newsFeed.unshift({
              id: newsId,
              title: `${staffMember.name} leaves ${team?.name || 'Organization'}`,
              content: `The organization has announced that ${staffMember.name} is no longer serving as their ${staffMember.role}. The search for a replacement begins immediately.`,
              category: "STAFF",
              teamId: team?.id,
              week: state.currentWeek,
              engagement: {
                likes: nextRandomInt(state, 20, 219),
                views: nextRandomInt(state, 200, 2199)
              }
            })
            if (state.newsFeed.length > 50) state.newsFeed.pop()
          }
        })
      },

      unlockSkill: (playerId: string, skillId: string, cost: number) => {
        set((state) => {
          const player = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId))
          if (player && (player.availableSkillPoints || 0) >= cost) {
            if (!player.perks) player.perks = []
            if (!player.perks.includes(skillId)) {
              player.perks.push(skillId)
              player.availableSkillPoints = (player.availableSkillPoints || 0) - cost
            }
          }
        })
      },

      upgradeFacility: (teamId, facilityType) => {
        set(state => {
          const team = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
          if (!team) return

          if (!team.facilities) team.facilities = []
          let facility = team.facilities.find(f => f.type === facilityType)

          const getFacilityDescription = (type: string, level: number) => {
            switch (type) {
              case "TRAINING":
                if (level === 1) return "Basic gaming booths for daily practice."
                if (level === 2) return "Upgraded setup with a dedicated analysts corner."
                if (level === 3) return "Professional academy with private practice rooms."
                if (level === 4) return "State-of-the-art lab with bio-metric feedback."
                if (level === 5) return "The Empire Training Center: Apex of esports."
                return "Inactive"
              case "RECOVERY":
                if (level === 1) return "Basic rest area with snacks and drinks."
                if (level === 2) return "Chill zone with gaming chairs and lounges."
                if (level === 3) return "Health suite with physical therapy equipment."
                if (level === 4) return "Performance kitchen and dedicated sleep pods."
                if (level === 5) return "Empire Wellness Retreat: Infinite stamina."
                return "Inactive"
              case "FANZONE":
                if (level === 1) return "Small local fan club booth."
                if (level === 2) return "Official team store and media studio."
                if (level === 3) return "Interactive museum and fan experience hub."
                if (level === 4) return "Global flagship store and content mansion."
                if (level === 5) return "Empire Fan Plaza: Global cultural center."
                return "Inactive"
              case "TACTICAL":
                if (level === 1) return "Whiteboard and projector setup."
                if (level === 2) return "VOD review station with basic software."
                if (level === 3) return "War room with multi-screen data analysis."
                if (level === 4) return "AI-assisted strategic simulator."
                if (level === 5) return "Empire Command Hub: Tactical perfection."
                return "Inactive"
              default:
                return "Professional facility"
            }
          }

          if (facility) {
            if (facility.level < 5) {
              const cost = facility.level * 25000 // Slightly steeper scaling
              if (team.budget >= cost) {
                team.budget -= cost
                facility.level += 1
                facility.description = getFacilityDescription(facility.type, facility.level)
                facility.monthlyCost = Math.floor(Math.pow(facility.level, 1.25) * 2000)

                // Phase 21: News
                const newsId = nextDeterministicId(state, "news_fac", facilityType, facility.level)
                state.newsFeed.unshift({
                  id: newsId,
                  title: `${team.name} upgrade ${facility.type} Facility`,
                  content: `${team.name} have officially completed work on their ${facility.type.toLowerCase()} center, now reaching level ${facility.level}. ${facility.description}`,
                  category: "FACILITY",
                  teamId: team.id,
                  week: state.currentWeek,
                  engagement: {
                    likes: nextRandomInt(state, 100, 599),
                    views: nextRandomInt(state, 1000, 5999)
                  }
                })
                if (state.newsFeed.length > 50) state.newsFeed.pop()
              }
            }
          } else {
            const cost = 10000 // Base construction cost
            if (team.budget >= cost) {
              team.budget -= cost
              team.facilities.push({
                id: nextDeterministicId(state, "fac", facilityType),
                type: facilityType as any,
                level: 1,
                description: getFacilityDescription(facilityType, 1),
                monthlyCost: 2000
              })

              // Phase 21: News
              const newsId = nextDeterministicId(state, "news_fac_new", facilityType)
              state.newsFeed.unshift({
                id: newsId,
                title: `New ${facilityType} Center for ${team.name}`,
                content: `${team.name} have announced the construction of a new dedicated ${facilityType.toLowerCase()} center to support their operations.`,
                category: "FACILITY",
                teamId: team.id,
                week: state.currentWeek,
                engagement: {
                  likes: nextRandomInt(state, 50, 349),
                  views: nextRandomInt(state, 500, 3499)
                }
              })
              if (state.newsFeed.length > 50) state.newsFeed.pop()
            }
          }
        })
      },

      signSponsor: (teamId, sponsor) => {
        let result = { success: false, message: "Sponsor signing failed." }
        set(state => {
          const team = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
          if (!team) {
            result = { success: false, message: "Team not found." }
            return
          }

          if (!team.sponsors) team.sponsors = []

          if (team.sponsors.length >= 3) {
            result = { success: false, message: "All sponsor slots are full." }
            return
          }

          if (team.sponsors.some(s => s.tier === sponsor.tier)) {
            result = { success: false, message: `You already have an active ${sponsor.tier.toLowerCase()} sponsor.` }
            return
          }

          if (team.sponsors.some(s => s.name === sponsor.name)) {
            result = { success: false, message: "This sponsor is already signed." }
            return
          }

          const ranking = team.worldRanking || 999
          if (sponsor.tier === "PREMIUM" && ranking > 30) {
            result = { success: false, message: "Premium sponsors require a Top 30 world ranking." }
            return
          }

          if (sponsor.tier === "ELITE") {
            const hasMajorTrophy = (team.trophies || []).some(t => t.tier === "S_TIER")
            const hasMajorParticipation = state.completedMatches.some(match => {
              if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) return false
              if (!match.tournamentId) return false
              const tournament = state.tournaments.find(t => t.id === match.tournamentId)
              return tournament?.tier === "S_TIER"
            })
            const isTopRanked = ranking <= 10
            if (!hasMajorTrophy && !hasMajorParticipation && !isTopRanked) {
              result = { success: false, message: "Elite sponsors require Top 10 ranking or major tournament participation." }
              return
            }
          }

          const normalizedSponsor: SponsorSaveData = {
            ...sponsor,
            id: sponsor.id || nextDeterministicId(state, "spon", sponsor.tier, sponsor.name),
            remainingWeeks: Math.max(1, Math.floor(sponsor.remainingWeeks || 0)),
            signedWeek: state.currentWeek,
            followerCheckpoint: team.followers || 0,
            lastProcessedWeek: undefined
          }

          team.sponsors.push(normalizedSponsor)
          // Remove from available offers
          state.sponsorOffers = state.sponsorOffers.filter(o => o.id !== sponsor.id)
          result = { success: true, message: `${normalizedSponsor.name} signed successfully.` }
        })
        return result
      },

      refreshSponsorOffers: () => {
        set(state => {
          const team = state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId)
          if (!team) return
          const rng = new SeededRNG(state.lastRngSeed + state.currentWeek * 7919)
          state.sponsorOffers = SponsorGenerator.generateVariedOffers(team, state.currentWeek, rng)
          state.declinedSponsorOfferIds = []
        })
      },

      declineSponsorOffer: (offerId: string) => {
        set(state => {
          state.sponsorOffers = state.sponsorOffers.filter(o => o.id !== offerId)
          state.declinedSponsorOfferIds.push(offerId)
        })
      },

      // Equipment Shop
      purchaseEquipment: (catalogId) => {
        let result = { success: false, error: "" }
        set(state => {
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (!team) {
            result = { success: false, error: "Team not found" }
            return
          }

          // Import EquipmentManager inline to avoid circular dependencies
          const { EquipmentManager } = require("@/engine/equipment-manager")
          const purchaseResult = EquipmentManager.purchaseEquipment(team, catalogId, state.currentWeek)
          result = purchaseResult
        })
        return result
      },

      setTheme: (theme) => set({ theme }),

      upgradeMerchStore: (teamId) => {
        let result = { success: false, message: "" }
        set((state) => {
          const team = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
          if (!team) {
            result = { success: false, message: "Team not found" }
            return
          }

          const currentLevel = team.merchStoreLevel || 1
          if (currentLevel >= 5) {
            result = { success: false, message: "Store is already at maximum level (5)" }
            return
          }

          const cost = 50000 * Math.pow(2, currentLevel - 1)
          if (team.budget < cost) {
            result = { success: false, message: `Insufficient funds. Need $${cost.toLocaleString()}` }
            return
          }

          team.budget -= cost
          team.merchStoreLevel = currentLevel + 1

          state.financeLedger.push({
            id: `exp_merch_up_${state.currentWeek}_${teamId}`,
            week: state.currentWeek,
            teamId: teamId,
            type: "EXPENSE",
            category: "FACILITIES",
            amount: cost,
            description: `Merch Store Upgrade to Level ${team.merchStoreLevel}`,
            balance: team.budget
          })

          result = { success: true, message: `Store upgraded to Level ${team.merchStoreLevel}` }
        })
        return result
      },

      toggleMerchItem: (teamId, itemType) => {
        let result = { success: false, message: "Team not found" }
        set((state) => {
          const team = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
          if (!team) return

          if (!team.activeMerchItems) team.activeMerchItems = []

          if (team.activeMerchItems.includes(itemType)) {
            team.activeMerchItems = team.activeMerchItems.filter(i => i !== itemType)
            result = { success: true, message: `${itemType} removed from active merch.` }
          } else {
            team.activeMerchItems.push(itemType)
          }
        })
      },

      setPlaystyle: (teamId, playstyle) => {
        set((state) => {
          if (!state.playerTeamId || teamId !== state.playerTeamId) return
          if (!VALID_PLAYSTYLES.has(playstyle)) return
          const team = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
          if (team) {
            team.playstyle = playstyle
          }
        })
      },

      setEconomyStyle: (teamId, economyStyle) => {
        set((state) => {
          if (!state.playerTeamId || teamId !== state.playerTeamId) return
          if (!VALID_ECONOMY_STYLES.has(economyStyle)) return
          const team = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
          if (team) {
            team.economyStyle = economyStyle
          }
        })
      },

      setTargetPlayer: (teamId, targetPlayerId) => {
        set((state) => {
          if (!state.playerTeamId || teamId !== state.playerTeamId) return
          const team = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
          if (team) {
            if (!targetPlayerId) {
              team.targetPlayerId = undefined
              return
            }

            // Target must exist and cannot be one of our own roster players.
            const isOwnPlayer = team.rosterIds.includes(targetPlayerId)
            const targetExists = state.players.some(p => p.id === targetPlayerId)
            if (!isOwnPlayer && targetExists) {
              team.targetPlayerId = targetPlayerId
            }
          }
        })
      },

      performVODReview: (matchId) => {
        set((state) => {
          const match = state.scheduledMatches.find(m => m.id === matchId)
          if (match) {
            if (match.vodReviewed) return
            if (state.playerTeamId !== match.homeTeamId && state.playerTeamId !== match.awayTeamId) return
            if (match.week < state.currentWeek) return

            const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
            if (team) {
              // Check funds
              if (team.budget < VOD_REVIEW_COST) return

              team.tacticalPrep = Math.min(100, (team.tacticalPrep || 0) + 25)
              team.budget -= VOD_REVIEW_COST
              match.vodReviewed = true
              state.financeLedger.push({
                id: nextDeterministicId(state, "fin_vod_review", matchId),
                week: state.currentWeek,
                teamId: team.id,
                type: "EXPENSE",
                category: "FACILITIES",
                amount: VOD_REVIEW_COST,
                description: "VOD Review Session",
                balance: team.budget
              })
            }
          }
        })
      },

      performMentalReset: (matchId?: string) => {
        set((state) => {
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (!team || team.budget < MENTAL_RESET_COST) return

          if (matchId) {
            const match = state.scheduledMatches.find(m => m.id === matchId)
            if (!match) return
            if (state.playerTeamId !== match.homeTeamId && state.playerTeamId !== match.awayTeamId) return
            if (match.week < state.currentWeek || match.mentalPrep) return
            match.mentalPrep = true
            match.mentalPrepTeamId = state.playerTeamId!
          }

          team.budget -= MENTAL_RESET_COST

          state.financeLedger.push({
            id: nextDeterministicId(state, "fin_mental_reset", matchId || "weekly"),
            week: state.currentWeek,
            teamId: team.id,
            type: "EXPENSE",
            category: "WAGES_STAFF",
            amount: MENTAL_RESET_COST,
            description: "Mental Reset Session",
            balance: team.budget
          })

          // Boost morale for all players in roster
          team.rosterIds.forEach(pid => {
            const player = (state._playerIndex?.get(pid) ?? state.players.find(p => p.id === pid))
            if (player) {
              player.morale = Math.min(100, (player.morale || 70) + 15)
            }
          })
        })
      },

      swapRosterPositions: (teamId, index1, index2) => {
        set((state) => {
          const team = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
          if (team) {
            // Validate indices
            if (index1 >= 0 && index1 < team.rosterIds.length && index2 >= 0 && index2 < team.rosterIds.length) {
              const temp = team.rosterIds[index1]
              team.rosterIds[index1] = team.rosterIds[index2]
              team.rosterIds[index2] = temp
            }
          }
        })
      },

      promotePlayer: (playerId) => {
        set((state) => {
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (!team) return

          // Check Phase 70 academy system first
          const academyIdx = state.academyPlayers?.findIndex(p => p.playerId === playerId) ?? -1
          if (academyIdx >= 0 && state.academyPlayers) {
            const academyEntry = state.academyPlayers[academyIdx]
            if (team.rosterIds.length < 7) {
              // Remove from academy
              state.academyPlayers.splice(academyIdx, 1)
              // Clear from academy roster slots
              if (state.academyRoster) {
                for (const role of Object.keys(state.academyRoster) as Array<keyof typeof state.academyRoster>) {
                  if (state.academyRoster[role] === academyEntry.id) {
                    state.academyRoster[role] = null
                  }
                }
              }
              // Add to main roster (PlayerSaveData already exists in state.players)
              team.rosterIds.push(playerId)
              // Create a basic contract
              const playerData = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId))
              const potential = playerData?.potential ?? 50
              state.contracts.push({
                playerId,
                teamId: team.id,
                salaryPerWeek: Math.floor(potential / 100 * 20000),
                weeksRemaining: 104,
                buyout: Math.floor(potential / 100 * 400000),
              } as any)
            }
            return
          }

          // Fallback: legacy youthAcademyIds
          if (team.youthAcademyIds?.includes(playerId)) {
            team.youthAcademyIds = team.youthAcademyIds.filter(id => id !== playerId)
            if (team.rosterIds.length < 7) {
              team.rosterIds.push(playerId)
            }
          }
        })
      },

      listSaves: async () => {
        return await saveManager.getSaveSlots()
      },

      switchSave: async (saveId) => {
        try {
          await get().loadGame(saveId)
          const loadedSaveId = get().saveId
          if (loadedSaveId === saveId) {
            await asyncStorage.setItem(STORAGE_KEYS.CURRENT_SAVE_ID, saveId)
            return true
          }
          set({ error: "Failed to activate requested save." })
          return false
        } catch (err) {
          set({ error: err instanceof Error ? err.message : "Failed to switch save." })
          return false
        }
      },

      deleteSaveInSlot: async (saveId) => {
        await saveManager.deleteSave(saveId)
      },

      deleteAllSaves: async () => {
        await saveManager.deleteAllSaves()
        // Reset state
        set({
          saveId: null,
          saveName: "",
          isInitialized: false,
          playerTeamId: null,
          teams: [],
          players: [],
        })
      },

      attemptSaveRecovery: async (saveId) => {
        set({ isLoading: true, error: null, lastLoadError: null })
        const recovery = await saveManager.attemptRecovery(saveId)
        if (!recovery.save) {
          set({
            isLoading: false,
            lastLoadError: {
              saveId,
              errorCode: recovery.errorCode || "UNKNOWN",
              message: recovery.error || "Recovery failed",
            },
          })
          return false
        }
        // attemptRecovery has already promoted the recovered candidate to the
        // primary key, so a normal loadGame() will now find clean data.
        try {
          await get().loadGame(saveId)
          await asyncStorage.setItem(STORAGE_KEYS.CURRENT_SAVE_ID, saveId)
          get().addToast({
            message: "Save recovered from backup. Some recent progress may be lost.",
            type: "warning",
            duration: 10000,
          })
          return true
        } catch (err) {
          const message = err instanceof Error ? err.message : "Recovery hydration failed"
          set({
            lastLoadError: {
              saveId,
              errorCode: "UNKNOWN",
              message,
            },
          })
          get().addToast({ message: `Save recovery failed: ${message}`, type: "error", duration: 8000 })
          return false
        }
      },

      clearLoadError: () => {
        set({ lastLoadError: null, error: null })
      },

      // completeOnboarding / completeTutorial / triggerTutorial /
      // setShowTutorialOnNewGame / setSoundEnabled live in
      // store/slices/settings-slice.ts now (spread above).

      // Helpers
      getPlayerTeam: () => {
        const state = get()
        return (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
      },

      getUpcomingMatches: (limit = 5) => {
        const state = get()
        return state.scheduledMatches
          .filter(m =>
            m.week >= state.currentWeek &&
            !m.stage?.includes("Finished") &&
            (m.homeTeamId === state.playerTeamId || m.awayTeamId === state.playerTeamId)
          )
          // Sort by week first, then by day within the same week (Mon=0 to Sun=6)
          .sort((a, b) => {
            if (a.week !== b.week) return a.week - b.week
            // Within same week, sort by day (default to 6/Sunday if not set)
            return (a.day ?? 6) - (b.day ?? 6)
          })
          .slice(0, limit)
      },

      calculateTeamRating: () => {
        const state = get()
        const playerTeam = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
        if (!playerTeam) return 0

        const teamPlayers = state.players
          .filter(p => playerTeam.rosterIds.includes(p.id))
          .map(p => evaluatePlayer(p).overallRating)
          .sort((a, b) => b - a)
          .slice(0, 5)

        if (teamPlayers.length === 0) return 0
        const avg = teamPlayers.reduce((sum, r) => sum + r, 0) / teamPlayers.length
        return parseFloat(avg.toFixed(1))
      },

      runTeamDrill: (drillId, gains, cost) => {
        let result = { success: false, message: "Unknown error" }
        set((state) => {
          if (!state.playerTeamId) {
            result = { success: false, message: "No team selected" }
            return
          }

          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (!team) {
            result = { success: false, message: "Team not found" }
            return
          }

          // 0. Training Limit Check
          if ((team.trainingSlotsUsed || 0) >= (team.maxTrainingSlots || 10)) {
            result = { success: false, message: "Weekly training limit reached!" }
            return
          }

          // 1. Resolve Drill Data
          const drillName = drillId.replace(/_/g, " ").toUpperCase()

          // 2. Team-wide Fatigue Check
          // If any player is exhausted (>90 fatigue), drill is cancelled
          // Use 'energy' (0-100) where 0 is exhausted, or use 'fatigue' (0-100) where 100 is exhausted?
          // Game types say: fatigue: number // 0-100 - Current fatigue level
          const roster = state.players.filter(p => team.rosterIds.includes(p.id))
          const exhaustedPlayer = roster.find(p => (p.fatigue || 0) >= 90)

          if (exhaustedPlayer) {
            result = { success: false, message: `${exhaustedPlayer.nickname} is too exhausted to train!` }
            return
          }

          // 3. Execute Drill
          roster.forEach(p => {
            // --- CALC FATIGUE ---
            let fatigueHit = cost

            // Talent: Iron Lung (-20%)
            if (p.unlockedTalentIds && p.unlockedTalentIds.includes("player_fit_2")) {
              fatigueHit = Math.ceil(fatigueHit * 0.8)
            }

            p.fatigue = Math.min(100, (p.fatigue || 0) + fatigueHit)

            // --- CALC XP ---
            const xpGain = 50
            p.xp = (p.xp || 0) + xpGain

            // Level Up Logic
            if (p.xp >= (p.xpToNextLevel || 1000)) {
              p.xp -= (p.xpToNextLevel || 1000)
              p.level = (p.level || 1) + 1
              p.talentPoints = (p.talentPoints || 0) + 1
              p.xpToNextLevel = Math.floor((p.xpToNextLevel || 1000) * 1.5)

              state.eventsLog.push({
                id: nextDeterministicId(state, "lvl_up", p.id),
                type: "PLAYER_LEVEL_UP",
                week: state.currentWeek,
                acknowledged: false,
                data: { playerId: p.id, message: `${p.nickname} reached Level ${p.level}!` }
              })
            }

            // --- CALC STAT GAINS ---
            gains.forEach(gain => {
              let statKey = gain.stat.toLowerCase()

              // Map Drill Terminology to PlayerSaveData fields
              const statMapping: Record<string, keyof PlayerSaveData | null> = {
                "agility": "reaction",
                "focus": "stressResistance",
                "entry": "rifle",
                "mechanics": "skill",
                "accuracy": "rifle"
              }

              if (statMapping[statKey]) {
                statKey = statMapping[statKey] as string
              }

              // Validate key exists on player
              const currentVal = (p as any)[statKey]
              if (currentVal !== undefined && typeof currentVal === 'number') {
                // Core player stats are 0-100; drills must never collapse high-rated players.
                (p as any)[statKey] = Math.min(100, currentVal + gain.amount)
              }
            })
          })


          // 4. Update Limits
          team.trainingSlotsUsed = (team.trainingSlotsUsed || 0) + 1

          // 5. Weapon Mastery Integration
          // If the drill improves a weapon stat, also grant Weapon XP
          roster.forEach(p => {
            gains.forEach(g => {
              const stat = g.stat.toUpperCase()
              if (["RIFLE", "AWP", "SMG", "PISTOL"].includes(stat)) {
                // Grant XP (e.g. 50 XP per drill)
                // Cast to any to bypass WritableDraft mismatch
                const currentMastery = WeaponMasteryManager.getPlayerMastery(p as any)
                const currentXP = currentMastery[stat as WeaponType] || 0
                const newXP = currentXP + 50

                if (!p.weaponMastery) p.weaponMastery = {}
                // Handle both number and object formats cleanly
                p.weaponMastery[stat] = newXP
              }
            })
          })

          result = { success: true, message: `Completed ${drillName} (+50 XP)` }
        })
        return result
      },

      getDateForWeek: (week) => {
        const state = get()
        const start = new Date(state.gameStartDate)
        const daysToAdd = (week - 1) * 7
        const date = new Date(start)
        date.setDate(date.getDate() + daysToAdd)
        return date
      },
      // ===== DEBUG TOOLS =====
      debugAddFunds: (amount: number) => {
        if (!debugToolsEnabled()) return
        set((state) => {
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (team) {
            team.budget = (team.budget || 0) + amount
            state.financeLedger.push({
              id: nextDeterministicId(state, "fin_debug", amount),
              week: state.currentWeek,
              teamId: team.id,
              type: "INCOME",
              category: "OTHER",
              amount: amount,
              description: "Dev Tools Injection",
              balance: team.budget
            })
          }
        })
      },

      debugHealAll: () => {
        if (!debugToolsEnabled()) return
        set((state) => {
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (team) {
            team.rosterIds.forEach(pid => {
              const player = (state._playerIndex?.get(pid) ?? state.players.find(p => p.id === pid))
              if (player) {
                player.health = 100
                player.fatigue = 0
                player.form = 100
                player.injury = undefined as any
              }
            })
          }
        })
      },

      debugMaxMorale: () => {
        if (!debugToolsEnabled()) return
        set((state) => {
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (team) {
            team.rosterIds.forEach(pid => {
              const player = (state._playerIndex?.get(pid) ?? state.players.find(p => p.id === pid))
              if (player) {
                player.morale = 100
                player.loyalty = 100
              }
            })
            team.chemistry = 100
          }
        })
      },

      debugTriggerJobOffer: () => {
        if (!debugToolsEnabled()) return
        set((state) => {
          const rng = new SeededRNG(state.lastRngSeed || generateSeed())
          JobOfferGenerator.forceJobOffer(state as unknown as GameSave, rng)
          state.lastRngSeed = rng.getState()
        })
      },

      startRoleTraining: (playerId: string, targetRole: Role) => {
        let result = { success: false, message: "Unknown error" }
        set((state) => {
          if (!state.playerTeamId) {
            result = { success: false, message: "No team selected" }
            return
          }
          // We must cast state to GameSave because immer proxy type issues
          result = TrainingManager.startRoleTraining(state as unknown as GameSave, state.playerTeamId, playerId, targetRole)
        })
        return result
      },

      cancelRoleTraining: (playerId: string) => {
        set((state) => {
          if (state.playerTeamId) {
            TrainingManager.cancelTraining(state as unknown as GameSave, state.playerTeamId, playerId)
          }
        })
      },

      setPlayerTrainingFocus: (playerId: string, focus: string) => {
        set((state) => {
          const player = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId))
          if (player) {
            (player as any).trainingFocus = focus
          }
        })
      },

      listPlayerForTransfer: (playerId, price) => {
        set((state) => {
          const player = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId))
          const normalizedPrice = parseBoundedInt(price, "Transfer listing price", 0, MAX_TRANSFER_FEE)
          if (!normalizedPrice.ok) {
            return
          }
          if (player) {
            (player as any).forSale = true;
            (player as any).transferListingPrice = normalizedPrice.value
          }
        })
      },

      acceptJobOffer: (eventId) => {
        let result = { success: false, message: "Unknown error" }
        set((state) => {
          // Find the event
          const event = state.eventsLog.find(e => e.id === eventId)
          if (!event || event.type !== "JOB_OFFER") {
            result = { success: false, message: "Job offer not found" }
            return
          }

          const offerData = event.data as any
          const newTeam = (state._teamIndex?.get(offerData.offeringTeamId) ?? state.teams.find(t => t.id === offerData.offeringTeamId))
          if (!newTeam) {
            result = { success: false, message: "Team no longer exists" }
            return
          }

          // Check deadline
          if (state.currentWeek > offerData.deadlineWeek) {
            result = { success: false, message: "Offer has expired" }
            return
          }

          // Store old team ID for logging
          const oldTeamId = state.playerTeamId
          const oldTeam = (state._teamIndex?.get(oldTeamId!) ?? state.teams.find(t => t.id === oldTeamId))

          // === CRITICAL: Switch teams ===
          state.playerTeamId = newTeam.id

          // Mark event as acknowledged
          event.acknowledged = true
          event.selectedChoiceId = "ACCEPT"

          // Create a notification event
          state.eventsLog.unshift({
            id: nextDeterministicId(state, "job_transition", newTeam.id),
            week: state.currentWeek,
            type: "CAREER_UPDATE" as any,
            acknowledged: false,
            data: {
              title: `Welcome to ${newTeam.name}!`,
              message: `You have accepted the position as manager of ${newTeam.name}.`,
              severity: "success"
            }
          })

          result = {
            success: true,
            message: `Welcome to ${newTeam.name}!`
          }
        })
        return result
      },

      declineJobOffer: (eventId) => {
        set((state) => {
          JobOfferGenerator.declineJobOffer(state as unknown as GameSave, eventId)
        })
      },

      negotiateJobOffer: (eventId) => {
        let result = { success: false, message: "Unknown error" }
        set((state) => {
          result = JobOfferGenerator.negotiateJobOffer(state as unknown as GameSave, eventId)
        })
        return result
      },

      setWeeklyActivity: (type) => {
        set((state) => {
          state.selectedWeeklyActivity = type
        })
      },

      unlistPlayerForTransfer: (playerId) => {
        set((state) => {
          const player = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId))
          if (player) {
            (player as any).forSale = false;
            (player as any).transferListingPrice = undefined
          }
        })
      },

      acceptTransferOffer: (eventId) => {
        // Read current state fresh for each check
        const currentState = get()
        const event = currentState.eventsLog.find(e => e.id === eventId)
        if (!event || !event.data || (event as any).type !== "TRANSFER_OFFER" || event.selectedChoiceId) return

        const { playerId, teamId, offerAmount } = event.data as any
        // Read playerTeamId fresh right before use
        const playerTeamId = get().playerTeamId

        // Smart Selling: Prevent selling if match this week
        const freshState = get()
        const hasMatchThisWeek = freshState.scheduledMatches.some(m =>
          m.week === freshState.currentWeek &&
          (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
        )

        if (hasMatchThisWeek) {
          get().addToast({
            message: "Cannot sell player! You have a match scheduled this week.",
            type: "info"
          })
          return
        }

        // AI Contract generation based on player rating and buying team budget
        const player = get().players.find(p => p.id === playerId)
        const buyingTeam = get().teams.find(t => t.id === teamId)
        const currentContract = get().contracts.find(c => c.playerId === playerId)
        const currentWeek = get().currentWeek

        // Calculate salary from player skill (OVR) and team tier
        const playerOvr = player ? Math.round(
          ((player.rifle ?? 50) + (player.pistol ?? 50) + (player.awp ?? 50) +
           (player.clutch ?? 50) + (player.creativity ?? 50) + (player.tactic ?? 50) +
           (player.teamwork ?? 50)) / 7
        ) : 50
        const tierMult = buyingTeam?.leagueTier === "S_TIER" ? 1.5
          : buyingTeam?.leagueTier === "A_TIER" ? 1.2
          : buyingTeam?.leagueTier === "B_TIER" ? 1.0
          : 0.8
        const baseSalary = Math.round((playerOvr / 100) * 2000 * tierMult)
        const newSalary = Math.max(200, Math.min(baseSalary, (buyingTeam?.budget ?? 50000) / 52))
        const contractLength = playerOvr >= 80 ? 104 : playerOvr >= 60 ? 78 : 52 // 2yr / 1.5yr / 1yr

        const transferResult = get().transferPlayer(
          playerId,
          playerTeamId,
          teamId,
          offerAmount,
          {
            salaryPerWeek: newSalary,
            startWeek: currentWeek,
            endWeek: currentWeek + contractLength,
            buyout: Math.round(newSalary * contractLength * 1.5)
          }
        )

        if (!transferResult.success) {
          get().addToast({
            message: transferResult.message || "Transfer failed.",
            type: "info"
          })
          return
        }

        // Check for PROFIT_MASTER achievement (sold for more than bought)
        const latestTransferHistory = get().transferHistory
        const originalBuy = [...latestTransferHistory]
          .reverse()
          .find(r => r.playerId === playerId && r.toTeamId === playerTeamId && r.fee > 0)
        if (originalBuy && offerAmount > originalBuy.fee) {
          checkAchievements({ profitableSale: true })
        }

        // Mark event as acknowledged/resolved
        set((draft) => {
          const liveEvent = draft.eventsLog.find(e => e.id === eventId)
          if (!liveEvent || liveEvent.selectedChoiceId) return
          liveEvent.selectedChoiceId = "accept"
          liveEvent.acknowledged = true
          if (!draft.acknowledgedEventIds.includes(eventId)) {
            draft.acknowledgedEventIds.push(eventId)
          }
        })
      },

      renewContract: (playerId) => {
        let toastMsg = ""
        let toastType: "info" | "warning" = "info"
        set((state) => {
          const contract = (state._contractByPlayerIndex?.get(playerId) ?? state.contracts.find(c => c.playerId === playerId))
          if (!contract) {
            toastMsg = "Contract not found."
            toastType = "warning"
            return
          }
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (!team) return
          const newSalary = Math.round(contract.salaryPerWeek * 1.1)
          const weeklyCost = newSalary - contract.salaryPerWeek
          const minBudgetNeeded = weeklyCost * 26 // at least 26 weeks runway
          if (team.budget < minBudgetNeeded) {
            toastMsg = "Insufficient budget to renew this contract."
            toastType = "warning"
            return
          }
          contract.salaryPerWeek = newSalary
          contract.endWeek += 52
          team.budget -= minBudgetNeeded
          toastMsg = "Contract renewed successfully."
          toastType = "info"
        })
        if (toastMsg) {
          get().addToast({ message: toastMsg, type: toastType })
        }
      },

      debugFastForward: (weeks: number) => {
        if (!debugToolsEnabled()) return
        set((state) => {
          state.currentWeek += weeks
        })
      },

      // ===== PHASE 9: SCOUTING =====

      // Scouting actions (startScoutingMission / getScoutingLevel /
      // isPlayerScouted / toggleWatchlistPlayer / isPlayerWatchlisted) live in
      // store/slices/scouting-slice.ts now (spread above).

      qualifyForTournament: (tournamentId, via) => {
        set((state) => {
          const identity = resolveTournamentIdentity(tournamentId, state.currentWeek)
          const exists = state.tournamentQualifications.find(q =>
            q.teamId === state.playerTeamId &&
            isQualificationForTournament(q, identity.instanceId, state.currentWeek)
          )
          if (!exists && state.playerTeamId) {
            state.tournamentQualifications.push(normalizeQualificationStatus({
              tournamentId: identity.instanceId,
              seriesId: identity.seriesId,
              instanceId: identity.instanceId,
              seasonNumber: identity.seasonNumber,
              teamId: state.playerTeamId,
              status: "QUALIFIED",
              qualifiedVia: via
            }, state.currentWeek))
          }
        })
      },

      // ===== PHASE 56: STAFF MARKET =====

      refreshStaffMarket: () => {
        set(state => {
          const rng = new SeededRNG(state.lastRngSeed || generateSeed())
          const market = StaffGenerator.generateWeeklyMarket(state.currentWeek, 20, rng)
          state.marketStaff = market
          state.lastRngSeed = rng.getState()
        })
      },

      hireStaff: (staffId, terms) => {
        let result = { success: false, message: "" }
        set(state => {
          const staffIndex = state.marketStaff.findIndex(s => s.id === staffId)
          if (staffIndex === -1) {
            result = { success: false, message: "Staff member not found" }
            return
          }

          const staffMember = state.marketStaff[staffIndex]
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))

          if (!team) return

          // Negotiated terms or defaults
          const rawSalary = terms?.salary ?? staffMember.salaryPerWeek
          // Default to 52 weeks (1 year) if not specified
          const rawDuration = terms?.duration ?? 52
          const rawSigningFee = terms?.signingBonus ?? (staffMember.salaryPerWeek * 2)

          const salaryValidation = parseBoundedInt(rawSalary, "Staff salary", 1, MAX_STAFF_SALARY_PER_WEEK)
          if (!salaryValidation.ok) {
            result = { success: false, message: salaryValidation.message }
            return
          }
          const durationValidation = parseBoundedInt(rawDuration, "Contract duration", 1, MAX_CONTRACT_LENGTH_WEEKS)
          if (!durationValidation.ok) {
            result = { success: false, message: durationValidation.message }
            return
          }
          const signingFeeValidation = parseBoundedInt(rawSigningFee, "Signing bonus", 0, MAX_SIGNING_BONUS)
          if (!signingFeeValidation.ok) {
            result = { success: false, message: signingFeeValidation.message }
            return
          }

          const salary = salaryValidation.value
          const duration = durationValidation.value
          const signingFee = signingFeeValidation.value

          if (team.budget < signingFee) {
            result = { success: false, message: `Insufficient funds. Need $${signingFee}` }
            return
          }

          // Check Slot (Max 5 staff)
          const currentStaff = state.staff.filter(s => s.teamId === team.id)
          if (currentStaff.length >= 5) {
            result = { success: false, message: "Staff roster full (Max 5)" }
            return
          }

          // Check Role Limit (Max 1 per role)
          const roleCount = currentStaff.filter(s => s.role === staffMember.role).length
          if (roleCount >= 1) {
            result = { success: false, message: `You already have a ${staffMember.role}!` }
            return
          }

          // Hire
          team.budget -= signingFee
          state.financeLedger.push({
            id: nextDeterministicId(state, "fin_hire", staffMember.id),
            week: state.currentWeek,
            teamId: team.id,
            type: "EXPENSE",
            category: "WAGES_STAFF",
            amount: signingFee,
            description: `Hired ${staffMember.name} (${staffMember.role}) - Sign-on Fee`,
            balance: team.budget
          })

          // Move to roster
          state.marketStaff.splice(staffIndex, 1)
          state.staff.push({
            ...staffMember,
            teamId: team.id,
            salaryPerWeek: salary,
            yearsRemaining: Math.max(1, Math.ceil(duration / 52)), // Legacy Compat
            contractEndWeek: state.currentWeek + duration,
            signingBonus: signingFee
          })
          team.staffIds.push(staffMember.id)

          // Phase 21: News
          const newsId = nextDeterministicId(state, "news_hire", staffMember.id)
          state.newsFeed.unshift({
            id: newsId,
            title: `${staffMember.name} hired by ${team.name}`,
            content: `${team.name} have officially signed ${staffMember.name} to their staff roster as ${staffMember.role}. The contract is expected to run for ${duration} weeks.`,
            category: "STAFF",
            teamId: team.id,
            week: state.currentWeek,
            engagement: {
              likes: nextRandomInt(state, 200, 1199),
              views: nextRandomInt(state, 1000, 10999)
            }
          })
          if (state.newsFeed.length > 50) state.newsFeed.pop()

          result = { success: true, message: `Hired ${staffMember.name}!` }
        })
        return result
      },

      renewStaffContract: (staffId, salary, duration) => {
        let result = { success: false, message: "" }
        set(state => {
          const staff = state.staff.find(s => s.id === staffId && s.teamId === state.playerTeamId)
          if (!staff) {
            result = { success: false, message: "Staff not found" }
            return
          }

          const salaryValidation = parseBoundedInt(salary, "Staff salary", 1, MAX_STAFF_SALARY_PER_WEEK)
          if (!salaryValidation.ok) {
            result = { success: false, message: salaryValidation.message }
            return
          }
          const durationValidation = parseBoundedInt(duration, "Contract duration", 1, MAX_CONTRACT_LENGTH_WEEKS)
          if (!durationValidation.ok) {
            result = { success: false, message: durationValidation.message }
            return
          }

          const normalizedSalary = salaryValidation.value
          const normalizedDuration = durationValidation.value

          // Update Contract
          staff.salaryPerWeek = normalizedSalary
          staff.contractEndWeek = state.currentWeek + normalizedDuration
          staff.yearsRemaining = Math.max(1, Math.ceil(normalizedDuration / 52)) // Legacy

          result = { success: true, message: "Contract Renewed!" }
        })
        return result
      },

      unlockStaffTalent: (staffId, talentId) => {
        set(state => {
          const staff = state.staff.find(s => s.id === staffId && s.teamId === state.playerTeamId)
          if (!staff) return

          // Dynamically import to avoid circular dependency issues if possible, or assume simple lookup
          const { STAFF_TALENT_TREES } = require("@/engine/talent-trees")
          const tree = STAFF_TALENT_TREES[staff.role] || []
          const node = tree.find((n: any) => n.id === talentId)

          if (!node) return
          if (staff.talentPoints < node.cost) return
          if (staff.unlockedTalentIds.includes(talentId)) return

          // Check requirements
          const meetsReq = node.requirements.every((req: string) => staff.unlockedTalentIds.includes(req))
          if (!meetsReq) return

          // Unlock
          staff.talentPoints -= node.cost
          staff.unlockedTalentIds.push(talentId)

          // Apply Instant Effects (Stat Boosts)
          if (node.effect && node.effect.type === "STAT_BOOST") {
            if (staff.stats) {
              if (node.effect.target === "all") {
                Object.keys(staff.stats).forEach(key => {
                  staff.stats![key] = Math.min(100, staff.stats![key] + node.effect.value)
                })
              } else if (staff.stats[node.effect.target] !== undefined) {
                staff.stats[node.effect.target] = Math.min(100, staff.stats[node.effect.target] + node.effect.value)
              }
            }
          }
        })
      },





      awardCircuitPoints: (teamId: string, tournamentId: string, placement: number) => {
        set(state => {
          // Use canonical circuit points table, keyed by tournament tier
          const tournamentDef = FULL_TOURNAMENT_CALENDAR.find((t: any) => t.id === tournamentId)
          const tier = (tournamentDef?.tier || "C_TIER") as keyof typeof CIRCUIT_POINTS
          const tierPoints = CIRCUIT_POINTS[tier] || CIRCUIT_POINTS.C_TIER
          const points = (tierPoints as Record<number, number>)[placement] || 0

          if (points === 0) return

          let entry = state.circuitPoints.find(cp => cp.teamId === teamId)
          if (entry) {
            entry.points += points
            entry.results.push({
              tournamentId,
              tournamentName: FULL_TOURNAMENT_CALENDAR.find((t: any) => t.id === tournamentId)?.name || "Unknown Tournament",
              placement,
              points,
              week: state.currentWeek
            })
          } else {
            state.circuitPoints.push({
              teamId,
              points,
              results: [{
                tournamentId,
                tournamentName: FULL_TOURNAMENT_CALENDAR.find((t: any) => t.id === tournamentId)?.name || "Unknown Tournament",
                placement,
                points,
                week: state.currentWeek
              }]
            })
          }

          // Phase 21: Career Narrative - Tournament Win News
          if (placement === 1) {
            const team = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
            const tournamentName = FULL_TOURNAMENT_CALENDAR.find((t: any) => t.id === tournamentId)?.name || "The Tournament"

            // Phase 40: Major Tracking
            if (teamId === state.playerTeamId) {
              // Determine if it was a Major (S-Tier)
              const isMajor = FULL_TOURNAMENT_CALENDAR.find((t: any) => t.id === tournamentId)?.tier === "S_TIER"
              if (isMajor) {
                state.managerDetails.championships = (state.managerDetails.championships || 0) + 1
                steamAchievements.pushLeaderboardStats({ majorWins: state.managerDetails.championships })
              }

              // Steam Achievement: Tournament Win
              try {
                checkAchievements({ wonTournament: true })
              } catch (e) {
                // Silent fail for achievements
              }
            }

            const newsId = nextDeterministicId(state, "news_win", tournamentId, teamId)
            state.newsFeed.unshift({
              id: newsId,
              title: `${team?.name || "Team"} win ${tournamentName}!`,
              content: `${team?.name || "Team"} have been crowned champions of ${tournamentName} after a hard-fought battle. This victory marks a significant milestone in their season history.`,
              category: "TOURNAMENT",
              teamId: teamId,
              week: state.currentWeek
            })
            if (state.newsFeed.length > 50) state.newsFeed.pop()
          }
        })
      },

      updatePlayer: (playerId, updates) => {
        set((state) => {
          const playerTeam = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (!playerTeam || !playerTeam.rosterIds.includes(playerId)) return

          const player = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId))
          if (player) {
            const numericClamp = (
              value: unknown,
              min: number,
              max: number
            ): number | undefined => {
              if (typeof value !== "number" || !Number.isFinite(value)) return undefined
              return Math.max(min, Math.min(max, Math.floor(value)))
            }

            const nextEnergy = numericClamp((updates as any).energy, 0, 100)
            if (nextEnergy !== undefined) {
              player.energy = nextEnergy
            }

            const nextFatigue = numericClamp((updates as any).fatigue, 0, 100)
            if (nextFatigue !== undefined) {
              player.fatigue = nextFatigue
            }

            const nextMorale = numericClamp((updates as any).morale, 0, 100)
            if (nextMorale !== undefined) {
              player.morale = nextMorale
            }

            const nextHealth = numericClamp((updates as any).health, 0, 100)
            if (nextHealth !== undefined) {
              player.health = nextHealth
            }

            const nextForm = numericClamp((updates as any).form, 0, 100)
            if (nextForm !== undefined) {
              player.form = nextForm
            }

            if ((updates as any).weaponMastery && typeof (updates as any).weaponMastery === "object") {
              player.weaponMastery = (updates as any).weaponMastery
            }
          }
        })
      },

      updateTeamBudget: (teamId, amount) => {
        set((state) => {
          if (!state.playerTeamId || teamId !== state.playerTeamId) return
          const amountValidation = parseBoundedInt(amount, "Budget adjustment", -MAX_TRANSFER_FEE, MAX_TRANSFER_FEE)
          if (!amountValidation.ok) return

          const team = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
          if (team) {
            const nextBudget = (team.budget || 0) + amountValidation.value
            if (nextBudget < 0) return
            team.budget = nextBudget
          }
        })
      },

      // ===== PHASE 70: YOUTH ACADEMY ACTIONS =====

      buildAcademy: (teamId) => {
        let result = { success: false, message: "" }
        set((state) => {
          const team = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
          if (!team) {
            result = { success: false, message: "Team not found" }
            return
          }

          // Check if already built
          if (team.academyFacility && team.academyFacility.level > 0) {
            result = { success: false, message: "Academy already exists" }
            return
          }

          const cost = ACADEMY_LEVELS[1].buildCost
          if (team.budget < cost) {
            result = { success: false, message: `Insufficient funds. Need $${cost.toLocaleString()}` }
            return
          }

          // Build academy
          team.budget -= cost
          team.academyFacility = { level: 1, builtWeek: state.currentWeek }

          // Add news
          state.newsFeed.unshift({
            id: nextDeterministicId(state, "news_academy", team.id),
            title: `${team.name} opens Youth Academy`,
            content: `${team.name} have invested in their future by opening a Youth Academy facility. The organization is now ready to develop the next generation of esports talent.`,
            category: "FACILITY",
            teamId: team.id,
            week: state.currentWeek
          })
          if (state.newsFeed.length > 50) state.newsFeed.pop()

          result = { success: true, message: "Academy built successfully!" }
        })
        return result
      },

      upgradeAcademy: (teamId) => {
        let result = { success: false, message: "" }
        set((state) => {
          const team = (state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId))
          if (!team) {
            result = { success: false, message: "Team not found" }
            return
          }

          const currentLevel = team.academyFacility?.level || 0
          if (currentLevel === 0) {
            result = { success: false, message: "Build academy first" }
            return
          }
          if (currentLevel >= 5) {
            result = { success: false, message: "Academy is already at maximum level" }
            return
          }

          const cost = AcademyEngine.getUpgradeCost(currentLevel)
          if (team.budget < cost) {
            result = { success: false, message: `Insufficient funds. Need $${cost.toLocaleString()}` }
            return
          }

          // Upgrade
          team.budget -= cost
          team.academyFacility!.level = currentLevel + 1
          team.academyFacility!.lastUpgradeWeek = state.currentWeek

          const levelInfo = ACADEMY_LEVELS[currentLevel + 1 as keyof typeof ACADEMY_LEVELS]
          state.newsFeed.unshift({
            id: nextDeterministicId(state, "news_academy_up", team.id, currentLevel + 1),
            title: `${team.name} upgrade Academy to ${levelInfo.name}`,
            content: `${team.name}'s Youth Academy has been upgraded to Level ${currentLevel + 1}. ${levelInfo.description}`,
            category: "FACILITY",
            teamId: team.id,
            week: state.currentWeek
          })
          if (state.newsFeed.length > 50) state.newsFeed.pop()

          result = { success: true, message: `Academy upgraded to Level ${currentLevel + 1}!` }
        })
        return result
      },

      scoutProspect: (tier: ScoutingTier) => {
        let result: { success: boolean; player?: PlayerSaveData; message: string } = { success: false, message: "" }
        set((state) => {
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (!team) {
            result = { success: false, message: "Team not found" }
            return
          }

          const academyLevel = team.academyFacility?.level || 0
          if (academyLevel === 0) {
            result = { success: false, message: "Build academy first" }
            return
          }

          if (!isScoutingTierUnlocked(tier, academyLevel)) {
            result = { success: false, message: `${tier} scouting requires Academy Level ${tier === "REGIONAL" ? 2 : 4}` }
            return
          }

          const cost = SCOUTING_COSTS[tier]
          if (team.budget < cost) {
            result = { success: false, message: `Insufficient funds. Need $${cost.toLocaleString()}` }
            return
          }

          // Check for staff
          const scouter = state.staff.find(s => s.teamId === state.playerTeamId && s.role === "scout")
          if (!scouter) {
            result = { success: false, message: "A hired Scout is required to start scouting missions" }
            return
          }

          // Deduct cost only after all preconditions pass
          team.budget -= cost

          const duration = SCOUTING_DURATIONS[tier]

          // Add mission
          const mission: import("@/types/academy").AcademyScoutingMission = {
            id: nextDeterministicId(state, "mission", tier),
            tier,
            weeksRemaining: duration,
            cost,
            startWeek: state.currentWeek,
            scoutId: scouter.id
          }

          state.academyScoutingMissions.push(mission)

          result = { success: true, message: `${tier} scouting mission initiated. Will take ${duration} week(s).` }
        })
        return result
      },

      enrollProspect: (playerId) => {
        let result = { success: false, message: "" }
        set((state) => {
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (!team) {
            result = { success: false, message: "Team not found" }
            return
          }

          const academyLevel = team.academyFacility?.level || 0
          if (academyLevel === 0) {
            result = { success: false, message: "Build academy first" }
            return
          }

          // Check capacity
          if (!AcademyEngine.canEnrollProspect(state.academyPlayers.length, academyLevel)) {
            result = { success: false, message: "Academy is at full capacity" }
            return
          }

          const player = (state._playerIndex?.get(playerId) ?? state.players.find(p => p.id === playerId))
          if (!player) {
            result = { success: false, message: "Player not found" }
            return
          }

          // Check if already enrolled
          if (state.academyPlayers.some(ap => ap.playerId === playerId)) {
            result = { success: false, message: "Player already in academy" }
            return
          }

          // Create academy player record
          const academyPlayer: AcademyPlayer = {
            id: nextDeterministicId(state, "academy", playerId),
            playerId,
            enrolledWeek: state.currentWeek,
            trainingFocus: "BALANCED",
            developmentProgress: 0,
            potentialRevealed: academyLevel >= 5, // Level 5 = instant reveal
            totalXpGained: 0,
            academyMatchesPlayed: 0,
            readyForPromotion: false,
            scoutNotes: AcademyEngine.generateScoutNotes(player as any, academyLevel >= 5),
            energy: 100
          }

          state.academyPlayers.push(academyPlayer)
          result = { success: true, message: `${player.nickname} enrolled in academy` }
        })
        return result
      },

      setProspectTraining: (prospectId, focus) => {
        set((state) => {
          const prospect = state.academyPlayers.find(p => p.id === prospectId)
          if (prospect) {
            prospect.trainingFocus = focus
          }
        })
      },

      releaseProspect: (prospectId, releaseCost = 1000) => {
        let result = { success: false, message: "" }
        set((state) => {
          const releaseCostValidation = parseBoundedInt(releaseCost, "Release fee", 0, MAX_TRANSFER_FEE)
          if (!releaseCostValidation.ok) {
            result = { success: false, message: releaseCostValidation.message }
            return
          }
          const normalizedReleaseCost = releaseCostValidation.value

          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          const prospectIndex = state.academyPlayers.findIndex(p => p.id === prospectId)

          if (prospectIndex === -1) {
            result = { success: false, message: "Prospect not found" }
            return
          }

          if (team && team.budget < normalizedReleaseCost) {
            result = { success: false, message: `Insufficient funds to pay termination fee ($${normalizedReleaseCost.toLocaleString()})` }
            return
          }

          const prospect = state.academyPlayers[prospectIndex]
          const player = (state._playerIndex?.get(prospect.playerId) ?? state.players.find(p => p.id === prospect.playerId))

          // Deduct release cost
          if (team) {
            team.budget -= normalizedReleaseCost
          }

          // Remove from academy
          state.academyPlayers.splice(prospectIndex, 1)

          // Remove player from game if not promoted
          const playerIndex = state.players.findIndex(p => p.id === prospect.playerId)
          if (playerIndex !== -1) {
            state.players.splice(playerIndex, 1)
          }

          result = { success: true, message: `${player?.nickname || "Prospect"} released. Paid $${normalizedReleaseCost.toLocaleString()} termination fee.` }
        })
        return result
      },

      promoteProspect: (prospectId, contract) => {
        let result = { success: false, message: "" }
        set((state) => {
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (!team) {
            result = { success: false, message: "Team not found" }
            return
          }

          const prospectIndex = state.academyPlayers.findIndex(p => p.id === prospectId)
          if (prospectIndex === -1) {
            result = { success: false, message: "Prospect not found" }
            return
          }

          const prospect = state.academyPlayers[prospectIndex]
          const player = (state._playerIndex?.get(prospect.playerId) ?? state.players.find(p => p.id === prospect.playerId))

          if (!player) {
            result = { success: false, message: "Player data not found" }
            return
          }

          const salaryValidation = parseBoundedInt(contract.salaryPerWeek, "Prospect salary", 1, MAX_PLAYER_SALARY_PER_WEEK)
          if (!salaryValidation.ok) {
            result = { success: false, message: salaryValidation.message }
            return
          }
          const lengthValidation = parseBoundedInt(contract.lengthWeeks, "Contract length", 1, MAX_CONTRACT_LENGTH_WEEKS)
          if (!lengthValidation.ok) {
            result = { success: false, message: lengthValidation.message }
            return
          }
          const normalizedSalary = salaryValidation.value
          const normalizedLength = lengthValidation.value

          // Check roster space
          if (team.rosterIds.length >= 7) {
            result = { success: false, message: "Roster is full (max 7 players)" }
            return
          }
          if (team.rosterIds.includes(player.id)) {
            result = { success: false, message: "Player is already on the main roster" }
            return
          }

          // Remove from academy
          state.academyPlayers.splice(prospectIndex, 1)

          // Add to roster
          team.rosterIds.push(player.id)

          // Create contract
          state.contracts = state.contracts.filter(c => c.playerId !== player.id)
          state.contracts.push({
            playerId: player.id,
            teamId: team.id,
            salaryPerWeek: normalizedSalary,
            startWeek: state.currentWeek,
            endWeek: state.currentWeek + normalizedLength,
            buyout: Math.min(MAX_TRANSFER_FEE, normalizedSalary * 20)
          })

            // Mark as academy graduate
            ; (player as any).isAcademyGraduate = true
          player.tier = "ACADEMY"

          // News
          state.newsFeed.unshift({
            id: nextDeterministicId(state, "news_promo", player.id),
            title: `${player.nickname} promoted to ${team.name} main roster`,
            content: `Rising star ${player.nickname} has graduated from ${team.name}'s Youth Academy and earned a spot on the main roster. The ${player.age}-year-old ${player.nationality} talent has signed a ${Math.round(normalizedLength / 52)}-year contract.`,
            category: "TRANSFER",
            teamId: team.id,
            playerId: player.id,
            week: state.currentWeek
          })
          if (state.newsFeed.length > 50) state.newsFeed.pop()

          result = { success: true, message: `${player.nickname} promoted to main roster!` }
        })
        return result
      },

      scheduleDevMatch: () => {
        let result = { success: false, message: "" }
        set((state) => {
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (!team || !team.academyFacility || team.academyFacility.level < 2) {
            result = { success: false, message: "Academy Level 2 required for matches" }
            return
          }

          const academyLevel = team.academyFacility.level

          if (team.budget < DEV_MATCH_CONFIG.matchCost) {
            result = { success: false, message: `Insufficient budget ($${DEV_MATCH_CONFIG.matchCost.toLocaleString()} required)` }
            return
          }

          // Get the actual enrolled starters
          const starterIds = Object.values(state.academyRoster).filter(Boolean) as string[]
          const activeStarters = state.academyPlayers.filter(p => starterIds.includes(p.id))

          if (activeStarters.length < 5) {
            result = { success: false, message: "You need 5 starters assigned in the roster tab to play matches" }
            return
          }

          // Check for exhaustion
          const exhausted = activeStarters.filter(p => (p.energy ?? 100) < ENERGY_CONFIG.exhaustionLimit)
          if (exhausted.length > 0) {
            const names = exhausted.map(p => {
              const pl = state.players.find(pl => pl.id === p.playerId)
              return pl?.nickname || "Player"
            }).join(", ")
            result = { success: false, message: `Starters are too exhausted to play (<${ENERGY_CONFIG.exhaustionLimit}% Energy): ${names}` }
            return
          }

          const prospectPlayers = activeStarters.map(ap =>
            (state._playerIndex?.get(ap.playerId) ?? state.players.find(p => p.id === ap.playerId))
          ).filter(Boolean) as PlayerSaveData[]
          const academyRng = new SeededRNG((state.lastRngSeed || generateSeed()) ^ 0xACADE)

          const matchResult = AcademyEngine.simulateDevelopmentMatch(
            activeStarters,
            prospectPlayers as any,
            academyLevel,
            state.currentWeek,
            academyRng
          )
          // Academy uses a derived seed - don't overwrite main RNG chain

          // Consume energy and apply XP
          activeStarters.forEach(prospect => {
            const xp = matchResult.xpGained[prospect.playerId] || 0
            prospect.energy = (prospect.energy ?? 100) - ENERGY_CONFIG.matchCost
            prospect.totalXpGained += xp
            prospect.academyMatchesPlayed += 1
            prospect.developmentProgress = Math.min(100, prospect.developmentProgress + AcademyEngine.calculateProgressGain(xp))
          })

          state.academyMatchHistory.unshift(matchResult)
          team.budget -= DEV_MATCH_CONFIG.matchCost

          const scoreText = `${matchResult.scoreHome}-${matchResult.scoreAway}`
          result = {
            success: true,
            message: matchResult.won
              ? `Victory! ${scoreText} vs ${matchResult.opponentName}`
              : `Defeat ${scoreText} vs ${matchResult.opponentName}`
          }
        })
        return result
      },

      processAcademyWeek: () => {
        set((state) => {
          const team = (state._teamIndex?.get(state.playerTeamId!) ?? state.teams.find(t => t.id === state.playerTeamId))
          if (!team || !team.academyFacility || team.academyFacility.level === 0) return

          const academyLevel = team.academyFacility.level
          const academyRng = new SeededRNG((state.lastRngSeed || generateSeed()) ^ 0xACADE)

          // Prepare report
          const report: import("@/types/academy").AcademyWeeklyReport = {
            week: state.currentWeek,
            overallXp: 0,
            prospectReports: []
          }

          // Identify starters
          const starterIds = Object.values(state.academyRoster).filter(Boolean) as string[]

          // Get active drills
          const scheduledDrills = Object.values(state.academyTrainingSchedule)
            .map(id => ACADEMY_DRILLS.find(d => d.id === id))
            .filter(Boolean) as import("@/types/academy").AcademyTrainingDrill[]

          // Process each prospect
          state.academyPlayers.forEach(prospect => {
            const player = (state._playerIndex?.get(prospect.playerId) ?? state.players.find(p => p.id === prospect.playerId))
            if (!player) return

            const isStarter = starterIds.includes(prospect.id)
            let xpGained = 0
            let energyChange = 0
            const statsImproved: Partial<Record<import("@/types/academy").TrainableStat, number>> = {}

            // 1. Process Training Schedule (Drills)
            scheduledDrills.forEach(drill => {
              // Deduct energy
              energyChange -= drill.energyCost

              // Calculate XP gain (Starters 100%, Bench 25%)
              let drillXp = drill.xpGain * (isStarter ? 1.0 : 0.25)

              // Fatigue penalty
              if ((prospect.energy ?? 100) < ENERGY_CONFIG.fatigueThreshold) {
                drillXp *= ENERGY_CONFIG.fatiguePenalty
              }

              xpGained += drillXp

              // Fractional Stat Improvements per drill
              drill.statFocus.forEach(stat => {
                const currentValue = (player as any)[stat] as number
                if (typeof currentValue === "number") {
                  const potentialCap = (player as any).potential
                  const roomToGrow = Math.max(0, potentialCap - currentValue)
                  const growthFactor = roomToGrow / 100
                  // Small increment per drill
                  const improvement = (drillXp / 100) * DEVELOPMENT_CONFIG.statGainPer100XP * growthFactor * (0.8 + academyRng.next() * 0.4)
                  statsImproved[stat] = (statsImproved[stat] || 0) + improvement
                }
              })
            })

            // 2. Weekly Recovery
            energyChange += isStarter ? ENERGY_CONFIG.starterRecovery : ENERGY_CONFIG.benchRecovery

            // 3. Finalize XP and Energy
            prospect.energy = Math.min(100, Math.max(0, (prospect.energy ?? 100) + energyChange))
            prospect.totalXpGained += xpGained
            prospect.developmentProgress = Math.min(100, prospect.developmentProgress + AcademyEngine.calculateProgressGain(xpGained))
            report.overallXp += xpGained

            // 4. Apply Stat Improvements
            const updates = AcademyEngine.applyStatImprovements(player as any, statsImproved)
            Object.assign(player, updates)

            // 5. check promotion etc
            const evaluation = AcademyEngine.evaluatePromotion(prospect, player as any)
            prospect.readyForPromotion = evaluation.ready

            if (state.currentWeek % 4 === 0) {
              prospect.scoutNotes = AcademyEngine.generateScoutNotes(player as any, prospect.potentialRevealed)
            }

            // Reveal potential based on level
            if (!prospect.potentialRevealed) {
              const weeksEnrolled = state.currentWeek - prospect.enrolledWeek
              const revealWeeks = academyLevel >= 4 ? 2 : academyLevel === 3 ? 4 : academyLevel === 2 ? 8 : 12

              if (weeksEnrolled >= revealWeeks) {
                prospect.potentialRevealed = true
                prospect.scoutNotes = AcademyEngine.generateScoutNotes(player as any, true)
              }
            }

            // 6. Add to prospect report
            report.prospectReports.push({
              playerId: prospect.playerId,
              nickname: player.nickname,
              xpGained: Math.round(xpGained),
              statImprovements: statsImproved,
              energyChange,
              isStarter
            })
          })

          // Save report
          state.academyWeeklyReports.unshift(report)
          if (state.academyWeeklyReports.length > 10) {
            state.academyWeeklyReports = state.academyWeeklyReports.slice(0, 10)
          }

          // 7. Process Scouting Missions
          state.academyScoutingMissions.forEach((mission) => {
            mission.weeksRemaining--

            if (mission.weeksRemaining <= 0) {
              // Complete Mission
              const newProspect = generateProspect(mission.tier, undefined, academyRng)
              const playerData = prospectToPlayerData(newProspect, state.currentWeek, academyRng) as unknown as PlayerSaveData

              const isPoolFull = (state.academyPendingProspects || []).length >= PENDING_POOL_MAX_SIZE

              if (!isPoolFull) {
                state.players.push(playerData)
                state.academyPendingProspects.push(playerData.id)
              }

              state.newsFeed.unshift({
                id: nextDeterministicId(state, "news_scout", mission.id),
                title: isPoolFull ? `${mission.tier} Scouting Overload` : `${mission.tier} Scouting Complete`,
                content: isPoolFull
                  ? `Your scout found a talent, but your review desk is full (Max ${PENDING_POOL_MAX_SIZE}). The prospect was lost to other teams.`
                  : `Your scout has found a new talent: ${playerData.nickname} (${playerData.age}y). Review them in the Scouting tab.`,
                category: "STAFF",
                week: state.currentWeek,
                teamId: team.id
              })
            }
          })

          // Remove completed missions
          state.academyScoutingMissions = state.academyScoutingMissions.filter(m => m.weeksRemaining > 0)
          // Academy uses a derived seed - don't overwrite main RNG chain

          // Deduct costs
          const upkeep = AcademyEngine.getWeeklyUpkeep(academyLevel, state.academyPlayers.length)
          team.budget -= upkeep
        })
      },

      updateAcademyRoster: (role, prospectId) => {
        set((state) => {
          state.academyRoster[role] = prospectId
        })
      },

      updateAcademySchedule: (day, drillId) => {
        set((state) => {
          state.academyTrainingSchedule[day] = drillId
        })
      },

      discardPendingProspect: (playerId) => {
        set((state) => {
          state.academyPendingProspects = state.academyPendingProspects.filter(id => id !== playerId)
          // Also remove from global players pool if they were only scounted for the academy
          const playerIndex = state.players.findIndex(p => p.id === playerId)
          if (playerIndex !== -1) {
            state.players.splice(playerIndex, 1)
          }
        })
      },



      // Settings actions (setResolution / setMasterVolume / setMusicVolume /
      // setGameSpeed / setTimeMode / setDifficulty / setAutoSave /
      // setNotifications / setShowBugReportButton) live in
      // store/slices/settings-slice.ts now (spread above).

      enrollPendingProspect: (playerId) => {
        const state = get()
        let result = state.enrollProspect(playerId)
        if (result.success) {
          set((state) => {
            state.academyPendingProspects = (state.academyPendingProspects || []).filter(id => id !== playerId)
          })
        }
        return result
      }

    })),
    {
      name: 'esports-sim-storage',
      storage: createJSONStorage(() => debouncedStorage),
      skipHydration: false,
      partialize: (state) => {
        // Exclude transient UI state and entity indexes from persistence
        const { isLoading, error, lastLoadError, toasts, _hasHydrated, _teamIndex, _playerIndex, _contractByPlayerIndex, _staffIndex, _completedMatchIds, ...rest } = state
        return rest as typeof state
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          logger.error('[Store] Rehydration failed', error)
        }
        // Always mark hydrated — even on error — so the UI doesn't hang forever
        if (state) {
          state.setHasHydrated(true)
          // Rebuild entity indexes after rehydration for O(1) lookups
          const s = useGameStore.getState()
          const indexes = buildEntityIndexes(s.teams, s.players, s.contracts, s.staff, s.completedMatches)
          useGameStore.setState(indexes)
          // Defensive: clear stale isLoading from legacy persisted states
          if (state.isLoading) {
            useGameStore.setState({ isLoading: false, error: null })
          }
        } else {
          useGameStore.setState({ _hasHydrated: true })
        }
      }
    }
  )
)
