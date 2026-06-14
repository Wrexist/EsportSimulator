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
import { recordCareerProgress } from "@/engine/manager-career-profile"
import { StaffGenerator } from "@/engine/staff-generator"
import { WeaponMasteryManager, WeaponType } from "@/engine/weapon-mastery-system"
import { PreSeasonTransferProcessor } from "@/engine/pre-season-transfers"
import { snapshotLoader } from "@/data"
import { FULL_TOURNAMENT_CALENDAR, CIRCUIT_POINTS } from "@/data/tournament-calendar"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { weekProcessorBridge } from "@/engine/worker/week-processor-bridge"
import { Player, Team, Match, GameEvent, MatchResult, EquipmentItem, Role, CustomTactics, TacticalStrategy, ActiveMatchState, WEEKLY_ACTIVITIES } from "@/types"
import { MapId } from "@/types/enums"
import { checkAchievements, steamService as steamAchievements } from "@/engine/steam-service"
import { AcademyEngine } from "@/engine/academy-engine"
import { generateProspect, prospectToPlayerData } from "@/engine/prospect-generator"
import { SCOUTING_COSTS, ACADEMY_LEVELS, DEV_MATCH_CONFIG, isScoutingTierUnlocked, ENERGY_CONFIG, DEVELOPMENT_CONFIG, ACADEMY_DRILLS, SCOUTING_DURATIONS, PENDING_POOL_MAX_SIZE } from "@/engine/academy-constants"
import { AcademyPlayer, AcademyTrainingFocus, ScoutingTier } from "@/types/academy"
import { generateSeed } from "@/engine/rng"
import { SponsorGenerator } from "@/engine/economy-manager"
import { applyRosterChangePenalty, applyBootcampChemistryBonus } from "@/engine/chemistry-engine"
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
import { createDebugSlice } from "@/store/slices/debug-slice"
import { createTournamentSlice } from "@/store/slices/tournament-slice"
import { createEventsSlice } from "@/store/slices/events-slice"
import { createUISlice } from "@/store/slices/ui-slice"
import { createSponsorshipSlice } from "@/store/slices/sponsorship-slice"
import { createMatchUISlice } from "@/store/slices/match-ui-slice"
import { createMatchOperationsSlice } from "@/store/slices/match-operations-slice"
import { createMatchSchedulingSlice } from "@/store/slices/match-scheduling-slice"
import { createMatchSimulationSlice } from "@/store/slices/match-simulation-slice"
import { createTeamDrillsSlice } from "@/store/slices/team-drills-slice"
import { applyPreTickMutations } from "@/engine/processors/pre-tick-mutations"
import { buildSaveSnapshot } from "@/store/utils/build-save-snapshot"
import { applyFplWeek } from "@/engine/processors/fpl-week-processor"
import { applyWeeklyActivity } from "@/engine/processors/weekly-activity-processor"
import { applyScheduledActivities } from "@/engine/processors/scheduled-activities-processor"
import { applyAutoRegistration } from "@/engine/processors/auto-registration-processor"
import { evaluatePostTickAchievements } from "@/engine/processors/post-tick-achievements"
import { recalculateAllSynergy, recalculateTeamSynergy } from "@/engine/processors/team-synergy-recalc"
import { createTrainingSlice } from "@/store/slices/training-slice"
import { createTeamSettingsSlice } from "@/store/slices/team-settings-slice"
import { createPlayerDevelopmentSlice } from "@/store/slices/player-development-slice"
import { createStaffManagementSlice } from "@/store/slices/staff-management-slice"
import { createTeamFacilitiesSlice } from "@/store/slices/team-facilities-slice"
import { createTransferContractSlice } from "@/store/slices/transfer-contract-slice"
import { createAcademySlice } from "@/store/slices/academy-slice"

enableMapSet()


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

// Serializes saveGame() calls. The post-tick authoritative save, a 60s
// autosave, and any rapid manual save can otherwise overlap and interleave
// SaveManager's tmp-stage → commit → backup-rotation on the same key. Each
// call chains onto the previous one (appended synchronously, so concurrent
// callers queue in invocation order) and runs on the freshest state at its
// turn. The chain swallows prior rejections so one failed save can't block the
// next; the caller still receives its own save's real result/rejection.
let saveChain: Promise<void> = Promise.resolve()

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
  // Build local maps from the live arrays for O(1) lookups in this loop.
  // We deliberately do NOT use state._teamIndex / _playerIndex / _staffIndex
  // — those maps are only rebuilt on hydrate / save-load / week-tick, and
  // any user mutation between ticks (signSponsor, upgradeFacility, etc.)
  // updates state.teams[i] without updating the Map. Reading through a
  // stale Map would feed pre-mutation teams to the simulator.
  const localTeams = new Map(state.teams.map(t => [t.id, t]))
  const localPlayers = new Map(state.players.map(p => [p.id, p]))
  const localStaff = new Map(state.staff.map(s => [s.id, s]))

  const findTeam = (id: string) => localTeams.get(id)
  const findPlayer = (id: string) => localPlayers.get(id)

  // Pre-match games-played per team (for the Elo K-factor calibration window),
  // taken before this loop's sims so each match reads its true prior count.
  const matchesPlayedByTeam = new Map<string, number>()
  for (const cm of state.completedMatches) {
    matchesPlayedByTeam.set(cm.homeTeamId, (matchesPlayedByTeam.get(cm.homeTeamId) || 0) + 1)
    matchesPlayedByTeam.set(cm.awayTeamId, (matchesPlayedByTeam.get(cm.awayTeamId) || 0) + 1)
  }
  const pushForm = (team: TeamSaveData, outcome: "W" | "L" | "D") => {
    if (!team.recentForm) team.recentForm = []
    team.recentForm.push(outcome)
    if (team.recentForm.length > 5) team.recentForm.shift()
  }

  const mapStaff = (staffIds: string[]) => {
    const rows = staffIds.map(id => localStaff.get(id)).filter(Boolean) as StaffSaveData[]
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

    // Elo + recent-form update. The atomic week tick's processMatches normally
    // does this, but these day-simmed AI matches are spliced out of
    // scheduledMatches below — so the tick never sees them. Without this, AI
    // Elo never moves in HYBRID_DAILY mode and refreshWorldRankings ranks off
    // stale Elo, drifting tournament seeding/qualification over a season.
    // (updateEloAfterMatch is pure math — no RNG — so determinism is unaffected.)
    const scoreDiff = Math.abs(result.homeScore - result.awayScore)
    const homeWon = result.homeScore > result.awayScore
    if (scoreDiff === 0) {
      pushForm(homeTeam, "D")
      pushForm(awayTeam, "D")
    } else {
      const winnerId = homeWon ? homeTeam.id : awayTeam.id
      const loserId = homeWon ? awayTeam.id : homeTeam.id
      pushForm(homeWon ? homeTeam : awayTeam, "W")
      pushForm(homeWon ? awayTeam : homeTeam, "L")

      const tournamentTier = (match.tournamentId && match.tournamentId !== "SCRIM")
        ? state.tournaments.find(t => t.id === match.tournamentId)?.tier
        : undefined

      let homeRounds = 0
      let awayRounds = 0
      result.maps.forEach(m => { homeRounds += m.homeScore || 0; awayRounds += m.awayScore || 0 })
      const roundDiff = homeWon ? (homeRounds - awayRounds) : (awayRounds - homeRounds)

      const eloResult = LeagueEngine.updateEloAfterMatch(
        state as unknown as GameSave,
        winnerId,
        loserId,
        scoreDiff,
        tournamentTier,
        matchesPlayedByTeam.get(winnerId) || 0,
        matchesPlayedByTeam.get(loserId) || 0,
        roundDiff
      )
      if (eloResult) {
        completedMatch.eloChange = {
          home: homeWon ? eloResult.winnerChange : eloResult.loserChange,
          away: homeWon ? eloResult.loserChange : eloResult.winnerChange,
        }
      }
    }
    matchesPlayedByTeam.set(homeTeam.id, (matchesPlayedByTeam.get(homeTeam.id) || 0) + 1)
    matchesPlayedByTeam.set(awayTeam.id, (matchesPlayedByTeam.get(awayTeam.id) || 0) + 1)

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
  weekReveal: import("@/store/types").WeekRevealData | null
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

  // Board Expectations & Confidence
  boardState?: import("@/engine/save-types").BoardState
  socialFeed?: import("@/engine/save-types").SocialPost[]
  careerStats?: import("@/engine/save-types").CareerStats

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
  syncSocialFeed: () => void
  publishSocialPost: (content: string) => void

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



  // Empire (Phase 18)
  upgradeFacility: (teamId: string, facilityType: FacilitySaveData["type"]) => { success: boolean; message: string }
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
  toggleMerchItem: (teamId: string, itemType: string) => { success: boolean, message: string }
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
  dismissWeekReveal: () => void
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
      ...createDebugSlice(
        set as Parameters<typeof createDebugSlice>[0],
        get as Parameters<typeof createDebugSlice>[1],
      ),
      ...createTournamentSlice(
        set as Parameters<typeof createTournamentSlice>[0],
        get as Parameters<typeof createTournamentSlice>[1],
      ),
      ...createEventsSlice(
        set as Parameters<typeof createEventsSlice>[0],
        get as Parameters<typeof createEventsSlice>[1],
      ),
      ...createUISlice(
        set as Parameters<typeof createUISlice>[0],
        get as Parameters<typeof createUISlice>[1],
      ),
      ...createSponsorshipSlice(
        set as Parameters<typeof createSponsorshipSlice>[0],
        get as Parameters<typeof createSponsorshipSlice>[1],
      ),
      ...createMatchUISlice(
        set as Parameters<typeof createMatchUISlice>[0],
        get as Parameters<typeof createMatchUISlice>[1],
      ),
      ...createMatchOperationsSlice(
        set as Parameters<typeof createMatchOperationsSlice>[0],
        get as Parameters<typeof createMatchOperationsSlice>[1],
      ),
      ...createMatchSchedulingSlice(
        set as Parameters<typeof createMatchSchedulingSlice>[0],
        get as Parameters<typeof createMatchSchedulingSlice>[1],
      ),
      ...createMatchSimulationSlice(
        set as Parameters<typeof createMatchSimulationSlice>[0],
        get as Parameters<typeof createMatchSimulationSlice>[1],
      ),
      ...createTeamDrillsSlice(
        set as Parameters<typeof createTeamDrillsSlice>[0],
        get as Parameters<typeof createTeamDrillsSlice>[1],
      ),
      ...createTrainingSlice(
        set as Parameters<typeof createTrainingSlice>[0],
        get as Parameters<typeof createTrainingSlice>[1],
      ),
      ...createTeamSettingsSlice(
        set as Parameters<typeof createTeamSettingsSlice>[0],
        get as Parameters<typeof createTeamSettingsSlice>[1],
      ),
      ...createPlayerDevelopmentSlice(
        set as Parameters<typeof createPlayerDevelopmentSlice>[0],
        get as Parameters<typeof createPlayerDevelopmentSlice>[1],
      ),
      ...createStaffManagementSlice(
        set as Parameters<typeof createStaffManagementSlice>[0],
        get as Parameters<typeof createStaffManagementSlice>[1],
      ),
      ...createTeamFacilitiesSlice(
        set as Parameters<typeof createTeamFacilitiesSlice>[0],
        get as Parameters<typeof createTeamFacilitiesSlice>[1],
      ),
      ...createTransferContractSlice(
        set as Parameters<typeof createTransferContractSlice>[0],
        get as Parameters<typeof createTransferContractSlice>[1],
      ),
      ...createAcademySlice(
        set as Parameters<typeof createAcademySlice>[0],
        get as Parameters<typeof createAcademySlice>[1],
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
      weekReveal: null,
      pendingSeasonRecap: null,
      pendingLegendPick: null,
      signedLegendIds: [],
      activelyPlayingLegendIds: [],
      // clearCelebration / clearPendingSeasonRecap / selectLegend / clearLegendPick
      // moved to store/slices/ui-slice.ts (spread above).
      // First debug actions block (debugTriggerCelebration … debugSetPlayerAge)
      // moved to store/slices/debug-slice.ts (spread above).

      // treatInjury moved to store/slices/team-settings-slice.ts (spread above).

      // Toast Notifications (UI-only, transient). State only — actions
      // (addToast / removeToast) moved to store/slices/ui-slice.ts.
      toasts: [],

      // Phase 21: Career Narrative
      newsFeed: [],
      // addNewsItem moved to store/slices/events-slice.ts (spread above).

      // Navigation Guard
      activeMatchId: null,
      activeMatchState: null,
      // setActiveMatch / updateActiveMatchState / clearActiveMatchState /
      // updateCustomTactic moved to store/slices/match-ui-slice.ts (spread above).

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

      // scheduleScrim / scheduleActivity moved to
      // store/slices/match-scheduling-slice.ts (spread above).



      // unlockPlayerTalent moved to store/slices/player-development-slice.ts (spread above).

      // registerForTournament + checkTournamentEligibility moved to
      // store/slices/tournament-slice.ts (spread above).

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
          // Snapshot the starting tier so ZERO_TO_HERO can detect a
          // career-long climb. Set exactly once at career creation;
          // post-tick achievement evaluation reads it without mutation.
          if (selectedTeam && selectedTeam.startingLeagueTier == null) {
            selectedTeam.startingLeagueTier = selectedTeam.leagueTier
          }
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
                `🔍 GROW YOUR TEAM\n` +
                `• Transfers — sign free agents or buy from rival rosters\n` +
                `• Scouting — research targets before you negotiate\n` +
                `• Youth Academy — develop the next generation of pros\n` +
                `• Sponsorships — unlock more deals as your reputation grows\n\n` +
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
            startingLeagueTier: "C_TIER", // ZERO_TO_HERO baseline
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
                portraitPath: prospect.portraitPath || "/player_placeholder.webp",
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
          const team = state.teams.find(t => t.id === newTeamId)
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

          // Prefer the saved team; otherwise fall back to a team that's
          // guaranteed to exist in THIS save (first team) rather than a
          // hardcoded id that may not exist in custom-team/modded snapshots —
          // which would strand the player on an unowned team via getPlayerTeam().
          const inferredTeamId = save.playerTeamId || save.teams?.[0]?.id || "team_navi"
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
        // Run serialized through saveChain so two saves never write concurrently.
        const run = async () => {
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
            boardState: state.boardState,
            socialFeed: state.socialFeed,
            careerStats: state.careerStats,
            nextMarketRefreshWeek: state.nextMarketRefreshWeek,
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
        }

        // Append to the chain synchronously so concurrent callers queue in
        // order. The caller awaits its own link (with the real rejection); the
        // chain itself swallows rejections so a failure can't wedge later saves.
        const chained = saveChain.then(run, run)
        saveChain = chained.catch(() => {})
        return chained
      },

      advanceDay: async () => {
        const state = get()
        if (state.timeMode !== "HYBRID_DAILY") {
          await state.advanceWeek()
          return
        }

        if (state.currentDay < 6) {
          const nextDay = Math.min(6, state.currentDay + 1)

          // Two-phase commit so the day number ticks over instantly. The
          // AI-match simulation that follows can take 5-100ms on heavy
          // match days; committing it in the same set() as the day bump
          // delays the visible change by that full amount. Splitting + a
          // macrotask yield lets React paint the new day FIRST, then the
          // match results arrive on the next frame.
          set(draft => { draft.currentDay = nextDay })
          await new Promise(resolve => setTimeout(resolve, 0))
          set(draft => { simulateDueAIMatchesForDay(draft, nextDay) })
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
            // Advance to match day so PLAY MATCH button appears — same
            // two-phase commit as advanceDay so the day cursor moves
            // before the match simulation runs.
            set(draft => { draft.currentDay = matchDay })
            await new Promise(resolve => setTimeout(resolve, 0))
            set(draft => { simulateDueAIMatchesForDay(draft, matchDay) })
            return
          }
          // Already on or past match day — match still unplayed, don't skip
          return
        }

        if (state.currentDay < 6) {
          set(draft => { draft.currentDay = 6 })
          await new Promise(resolve => setTimeout(resolve, 0))
          set(draft => { simulateDueAIMatchesForDay(draft, 6) })
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

        // Yield one macrotask so React can commit the isLoading=true state
        // and the browser can paint the WeekProcessingOverlay BEFORE we start
        // the 10-50ms block of synchronous pre-tick work below (structuredClone
        // + applyPreTickMutations + applyWeeklyActivity + ... + applyFplWeek).
        // Without this yield, the overlay only appears after that work
        // finishes — pressing space feels like a stall before the spinner.
        await new Promise(resolve => setTimeout(resolve, 0))

        try {
          const preTickRng = new SeededRNG(state.lastRngSeed || generateSeed())

          // Build a clean GameSave snapshot detached from store state so
          // the worker thread receives a serialization-safe copy.
          const latestState = get()
          const saveState: GameSave = structuredClone(buildSaveSnapshot(latestState))

          // Yield so the browser can paint the overlay spinner frame after
          // the structuredClone (the most expensive synchronous step).
          await new Promise(resolve => setTimeout(resolve, 0))

          // Pre-tick mutations: scouting completion, staff-market rotation,
          // staff XP, player XP (engine/processors/pre-tick-mutations.ts).
          // These are applied to the DETACHED snapshot, not committed to the
          // live store up-front: a previous version set() them into the store
          // before the worker ran, so a worker failure left XP advanced on a
          // week that never advanced. Applying them only to `saveState` keeps
          // the catch a true all-or-nothing rollback — the store is untouched
          // until the final commit writes the worker's processed save.
          applyPreTickMutations(saveState as unknown as Parameters<typeof applyPreTickMutations>[0], {
            playerTeamId: state.playerTeamId || "",
            currentWeek: state.currentWeek,
            rng: preTickRng,
            nextId: nextDeterministicId,
          })

          const rng = new SeededRNG(preTickRng.getState())

          const config = {
            playerTeamId: state.playerTeamId || "",
            trainingFocus: new Map()
          }

          // Apply the player's selected "weekly focus" activity (bootcamp,
          // marketing, streaming, etc.) — cost, per-player effects,
          // reputation gain, and event surfacing all live in the
          // weekly-activity-processor module.
          applyWeeklyActivity(saveState, {
            playerTeamId: state.playerTeamId || "",
            selectedActivity: state.selectedWeeklyActivity,
            nextId: nextDeterministicId,
          })



          // Apply this-week scheduledActivities (staff meetings, bootcamps,
          // rest, travel). Each one applies its own effects + chemistry
          // bonus + surfaces an event. Module owns the per-effect math.
          applyScheduledActivities(saveState, {
            playerTeamId: state.playerTeamId || "",
            nextId: nextDeterministicId,
          })

          // Auto-register the player team for upcoming INVITE/POINTS
          // tournaments they're eligible for (look-ahead 4 weeks). Errors
          // are swallowed inside the processor and logged.
          applyAutoRegistration(saveState, {
            playerTeamId: state.playerTeamId || "",
            nextId: nextDeterministicId,
          })

          // Phase 20 Enhancement: Simulate Weekly AI Registrations
          TournamentManager.simulateWeeklyRegistrationsV2(saveState, state.currentWeek, rng)

          // Yield before the FPL update (~1 800 players) so the spinner can
          // animate at least one frame between the two heaviest sync steps.
          await new Promise(resolve => setTimeout(resolve, 0))

          // Process FPL (Individual Rankings) before the week processor.
          // Surfaces tier-change events on the inbox; toasts the user on
          // engine failure since FPL is non-critical to the tick.
          const fplOk = applyFplWeek(saveState, rng)
          if (!fplOk) {
            get().addToast({ message: "FPL rankings update failed this week", type: "warning", duration: 5000 })
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

              // Recalculate synergy for all teams (AI transfers may have
              // changed rosters). Uses the indexed O(roster) pass from
              // engine/processors/team-synergy-recalc.ts.
              recalculateAllSynergy(draft.teams, draft.players)
            })

            // Post-week processing. The week is already committed by the set()
            // above (and isLoading is false). Isolate any failure here in its
            // own try so it cannot trigger the outer catch's "week failed"
            // path or leave the store half-updated for an already-advanced
            // week.
            try {
            // Process academy weekly training, scouting missions, and prospect development
            get().processAcademyWeek()

            // Rebuild entity indexes after state update for O(1) lookups
            const postTickState = get()
            const newIndexes = buildEntityIndexes(postTickState.teams, postTickState.players, postTickState.contracts, postTickState.staff, postTickState.completedMatches)
            set(newIndexes)

            // Evaluate Steam achievements + push leaderboard stats + update
            // Rich Presence from the post-tick snapshot. Self-guards on
            // playerTeam — no-ops if the player isn't on a team yet.
            evaluatePostTickAchievements(get() as unknown as GameSave)

            // Route transient (one-shot UI) events to in-game toasts and
            // auto-acknowledge so they don't pile up in the inbox.
            const freshState = get()
            const toastEventTypes = ["TRAINING_COMPLETE", "SPONSOR_OFFER", "MANAGER_LEVEL_UP", "PLAYER_LEVEL_UP"]
            const toastEvents = freshState.eventsLog.filter(
              e => e.week === freshState.currentWeek
                && !e.acknowledged
                && (
                  toastEventTypes.includes(e.type as string)
                  // Promotion/relegation ride on MEDIA events flagged in data —
                  // surface the climb beat instead of leaving it silent in the feed.
                  || (e.type === "MEDIA" && !!((e.data as { isPromotion?: boolean; isRelegation?: boolean })?.isPromotion || (e.data as { isPromotion?: boolean; isRelegation?: boolean })?.isRelegation))
                )
            )
            toastEvents.forEach(event => {
              const data = event.data as { title?: string; description?: string; message?: string; playerName?: string; newLevel?: number; isPromotion?: boolean; isRelegation?: boolean }
              const etype = event.type as string
              const message =
                etype === "PLAYER_LEVEL_UP" && !data.message && data.playerName
                  ? `${data.playerName} reached Level ${data.newLevel}!`
                  : data.title
                    ? `${data.title}${data.message ? ` — ${data.message}` : ""}`
                    : data.description || data.message || "Event notification"
              get().addToast({
                message,
                type: etype === "TRAINING_COMPLETE" || etype === "MANAGER_LEVEL_UP" || etype === "PLAYER_LEVEL_UP" ? "level_up"
                  : etype === "SPONSOR_OFFER" ? "achievement"
                  : data.isPromotion ? "achievement"
                  : data.isRelegation ? "warning"
                  : "info",
              })
              get().acknowledgeEvent(event.id)
            })

            // Build the "week in review" reveal — drives the post-processing
            // ticker in WeekProcessingOverlay. Player-team matches first, then
            // up to five captioned events from the week just played.
            const ptid = state.playerTeamId
            if (ptid) {
              const playedWeek = state.currentWeek
              const revealState = get()
              const teamName = (id: string | null) =>
                id ? (revealState.teams.find(t => t.id === id)?.name ?? "Unknown") : "TBD"
              const revealItems: import("@/store/types").WeekRevealItem[] = []
              let revealWins = 0
              let revealLosses = 0
              for (const m of revealState.completedMatches) {
                if (m.week !== playedWeek) continue
                if (m.homeTeamId !== ptid && m.awayTeamId !== ptid) continue
                const isHome = m.homeTeamId === ptid
                const won = m.result?.winnerId === ptid
                const myScore = (isHome ? m.result?.homeScore : m.result?.awayScore) ?? 0
                const oppScore = (isHome ? m.result?.awayScore : m.result?.homeScore) ?? 0
                if (won) revealWins++; else revealLosses++
                const flags = [
                  won && m._underdogWin ? "Upset" : "",
                  won && m._comebackWin ? "Comeback" : "",
                ].filter(Boolean)
                revealItems.push({
                  id: `match-${m.id}`,
                  kind: "match",
                  tone: won ? "win" : "loss",
                  title: `${won ? "Beat" : "Lost to"} ${teamName(isHome ? m.awayTeamId : m.homeTeamId)}`,
                  detail: `${myScore}–${oppScore}${flags.length ? ` · ${flags.join(" · ")}` : ""}`,
                })
              }
              // Board moments surface in the reveal so quarterly pulses and
              // season verdicts are felt, not buried in the news feed.
              for (const n of revealState.newsFeed) {
                if (n.week !== playedWeek && n.week !== revealState.currentWeek) continue
                if (!n.id.startsWith("board_pulse_") && !n.id.startsWith("board_review_")) continue
                const negative = /uneasy|alarmed|furious|concerned|Sacked/i.test(n.title)
                revealItems.push({
                  id: `board-${n.id}`,
                  kind: "event",
                  tone: negative ? "loss" : "win",
                  title: n.title,
                  detail: n.content.length > 110 ? `${n.content.slice(0, 107)}...` : n.content,
                })
              }
              const seenEvent = new Set<string>()
              let eventCount = 0
              for (const e of revealState.eventsLog) {
                if (eventCount >= 5) break
                if (e.week !== playedWeek && e.week !== revealState.currentWeek) continue
                if (seenEvent.has(e.id)) continue
                seenEvent.add(e.id)
                const d = e.data as { title?: string; headline?: string; description?: string; message?: string }
                const text = d?.title || d?.headline || d?.description || d?.message
                if (typeof text !== "string" || !text.trim()) continue
                eventCount++
                revealItems.push({
                  id: `event-${e.id}`,
                  kind: "event",
                  tone: "neutral",
                  title: text.length > 90 ? `${text.slice(0, 87)}...` : text,
                })
              }
              const headline =
                revealItems.length === 0 ? "A quiet week"
                  : revealWins > 0 && revealLosses === 0 ? "A flawless week"
                    : revealLosses > 0 && revealWins === 0 ? "A rough week"
                      : revealWins > revealLosses ? "A strong week"
                        : revealWins < revealLosses ? "A tough week"
                          : "A mixed week"
              if (revealItems.length === 0) {
                revealItems.push({
                  id: "summary-quiet",
                  kind: "summary",
                  tone: "neutral",
                  title: "Nothing major to report.",
                })
              }
              set({ weekReveal: { week: playedWeek, headline, items: revealItems } })
            }
            } catch (postErr) {
              logger.error("[advanceWeek] post-week processing failed (week already committed)", postErr)
              // The week stays committed. Rebuild entity indexes defensively
              // so O(1) lookups keep working despite the failed post-step.
              try {
                const s = get()
                set(buildEntityIndexes(s.teams, s.players, s.contracts, s.staff, s.completedMatches))
              } catch { /* indexes are best-effort */ }
            }

            // Authoritative persist of the fully post-processed week. The week
            // processor runs in a Worker that writes nothing (compute-only), and
            // even on the synchronous fallback the processor's own save happens
            // BEFORE the post-tick steps above (academy budget/history, array
            // pruning, synergy recompute, correct lastRngSeed) — which live only
            // in memory until now. Persist once, from the main thread, so the
            // on-disk save matches what the player sees. A failure here must NOT
            // roll back the already-committed week: saveGame surfaces its own
            // error toast and the next autosave retries.
            try {
              await get().saveGame()
              // Refresh the cross-save career profile (peak level/majors/rank)
              // so progression survives new games. Fire-and-forget — off the
              // save critical path; failures are swallowed inside the helper.
              void recordCareerProgress(get() as unknown as GameSave)
            } catch (saveErr) {
              logger.error("[advanceWeek] post-tick authoritative save failed (week committed in memory)", saveErr)
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

      // acknowledgeEvent / markAllEventsAsRead / resolveEventChoice moved to
      // store/slices/events-slice.ts (spread above).

      // saveMatchResult moved to store/slices/match-simulation-slice.ts (spread above).

      // updateScheduledMatch moved to store/slices/match-operations-slice.ts (spread above).

      // simulateInstantMatch moved to store/slices/match-simulation-slice.ts (spread above).

      // transferPlayer moved to store/slices/transfer-contract-slice.ts (spread above).


      // fireStaff moved to store/slices/staff-management-slice.ts (spread above).

      // upgradeFacility / signSponsor / purchaseEquipment / upgradeMerchStore / toggleMerchItem
      // moved to store/slices/team-facilities-slice.ts (spread above).

      // setPlaystyle / setEconomyStyle / setTargetPlayer moved to
      // store/slices/team-settings-slice.ts (spread above).

      // performVODReview / performMentalReset moved to
      // store/slices/match-operations-slice.ts (spread above).

      // swapRosterPositions moved to store/slices/team-settings-slice.ts (spread above).

      // promotePlayer moved to store/slices/transfer-contract-slice.ts (spread above).

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
      // getPlayerTeam / getUpcomingMatches / calculateTeamRating moved to
      // store/slices/ui-slice.ts (spread above).

      // runTeamDrill moved to store/slices/team-drills-slice.ts (spread above).

      // getDateForWeek moved to store/slices/ui-slice.ts (spread above).
      // ===== DEBUG TOOLS =====
      // debugAddFunds / debugHealAll / debugMaxMorale / debugTriggerJobOffer
      // moved to store/slices/debug-slice.ts (spread above).

      // startRoleTraining / cancelRoleTraining moved to
      // store/slices/training-slice.ts (spread above).

      // setPlayerTrainingFocus moved to store/slices/player-development-slice.ts (spread above).

      // listPlayerForTransfer moved to store/slices/transfer-contract-slice.ts (spread above).

      // acceptJobOffer / declineJobOffer / negotiateJobOffer moved to
      // store/slices/events-slice.ts (spread above).

      // setWeeklyActivity moved to store/slices/ui-slice.ts (spread above).

      // unlistPlayerForTransfer moved to store/slices/transfer-contract-slice.ts (spread above).

      // acceptTransferOffer moved to store/slices/transfer-contract-slice.ts (spread above).

      // renewContract moved to store/slices/transfer-contract-slice.ts (spread above).

      // debugFastForward moved to store/slices/debug-slice.ts (spread above).

      // ===== PHASE 9: SCOUTING =====

      // Scouting actions (startScoutingMission / getScoutingLevel /
      // isPlayerScouted / toggleWatchlistPlayer / isPlayerWatchlisted) live in
      // store/slices/scouting-slice.ts now (spread above).

      // qualifyForTournament moved to store/slices/tournament-slice.ts (spread above).

      // ===== PHASE 56: STAFF MARKET =====

      // refreshStaffMarket / hireStaff / renewStaffContract moved to
      // store/slices/staff-management-slice.ts (spread above).

      // unlockStaffTalent moved to store/slices/player-development-slice.ts (spread above).





      // awardCircuitPoints moved to store/slices/tournament-slice.ts (spread above).

      // updatePlayer moved to store/slices/player-development-slice.ts (spread above).

      // updateTeamBudget moved to store/slices/team-settings-slice.ts (spread above).

      // ===== PHASE 70: YOUTH ACADEMY ACTIONS =====

      // buildAcademy / upgradeAcademy / scoutProspect / enrollProspect / setProspectTraining
      // releaseProspect / promoteProspect / scheduleDevMatch / processAcademyWeek /
      // updateAcademyRoster / updateAcademySchedule / discardPendingProspect
      // moved to store/slices/academy-slice.ts (spread above).



      // Settings actions (setResolution / setMasterVolume / setMusicVolume /
      // setGameSpeed / setTimeMode / setDifficulty / setAutoSave /
      // setNotifications / setShowBugReportButton) live in
      // store/slices/settings-slice.ts now (spread above).

      // enrollPendingProspect moved to store/slices/academy-slice.ts (spread above).
    })),
    {
      name: 'esports-sim-storage',
      storage: createJSONStorage(() => debouncedStorage),
      skipHydration: false,
      // Persist ONLY the ~1 KB of user settings + the active saveId.
      // Previously the full multi-MB game state was included, causing
      // JSON.stringify to run synchronously on the main thread for every
      // single store mutation — the debounce only batched the IndexedDB
      // write, not the serialization cost. Game state is now owned
      // exclusively by saveManager; onRehydrateStorage calls loadGame()
      // to restore it from the save file on page refresh.
      partialize: (state) => ({
        // User settings — must survive app restarts without an active game
        onboardingCompleted: state.onboardingCompleted,
        tutorialCompleted: state.tutorialCompleted,
        showTutorialOnNewGame: state.showTutorialOnNewGame,
        manualTutorialTrigger: state.manualTutorialTrigger,
        soundEnabled: state.soundEnabled,
        resolution: state.resolution,
        masterVolume: state.masterVolume,
        musicVolume: state.musicVolume,
        gameSpeed: state.gameSpeed,
        difficulty: state.difficulty,
        autoSave: state.autoSave,
        notifications: state.notifications,
        showBugReportButton: state.showBugReportButton,
        // UI preference
        theme: state.theme,
        // Bootstrap: which save to reload on page refresh
        saveId: state.saveId,
      }) as typeof state,
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          logger.error('[Store] Rehydration failed', error)
        }
        // If there's an active saveId, kick off an async game reload from
        // saveManager. Setting isLoading=true before _hasHydrated=true
        // ensures page.tsx shows the progress spinner rather than
        // redirecting to main menu while the save file loads.
        // loadGame() sets isLoading=false and isInitialized=true when done,
        // and rebuilds entity indexes — no need to do it here.
        const saveId = state?.saveId ?? null
        if (saveId) {
          useGameStore.setState({ isLoading: true, _hasHydrated: true })
          useGameStore.getState().loadGame(saveId).catch((err) => {
            // loadGame already set isLoading: false and error on the store.
            // _hasHydrated is already true so the UI can render the error.
            logger.error('[Store] Auto-reload from persist saveId failed', err)
          })
        } else {
          useGameStore.setState({ _hasHydrated: true })
        }
      }
    }
  )
)
