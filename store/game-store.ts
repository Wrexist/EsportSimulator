"use client"

import { newFirstSession, restoreFirstSession, restoreWeeklyPlan } from '@/lib/first-session'
import { createDefaultTactics } from "@/engine/default-tactics"
import { refreshStockIdentities } from "@/lib/identity-refresh"
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
import { seedPreseasonFriendlies } from "@/engine/preseason-friendlies"
import { ManagerProgression } from "@/engine/manager-progression"
import { recordCareerProgress } from "@/engine/manager-career-profile"
import { StaffGenerator } from "@/engine/staff-generator"
import { WeaponMasteryManager, WeaponType } from "@/engine/weapon-mastery-system"
import { PreSeasonTransferProcessor } from "@/engine/pre-season-transfers"
import { snapshotLoader } from "@/data"
import { FULL_TOURNAMENT_CALENDAR, CIRCUIT_POINTS } from "@/data/tournament-calendar"
import { initialClubBudget } from "@/engine/season/club-finances"
import { drawDueLeagueSplit } from "@/engine/season/regional-league"
import { recordOfficialMatch } from "@/engine/official-stats"
import { ensureBoardState } from "@/engine/board-expectations"
import { weekProcessorBridge } from "@/engine/worker/week-processor-bridge"
import { Player, Team, Match, GameEvent, MatchResult, EquipmentItem, Role, CustomTactics, TacticalStrategy, ActiveMatchState, WEEKLY_ACTIVITIES } from "@/types"
import { MapId } from "@/types/enums"
import { checkAchievements, steamService as steamAchievements } from "@/engine/steam-service"
import { AcademyEngine } from "@/engine/academy-engine"
import { generateProspect, prospectToPlayerData } from "@/engine/prospect-generator"
import { deriveTraits, ensurePersonality } from "@/engine/personality"
import { SCOUTING_COSTS, ACADEMY_LEVELS, DEV_MATCH_CONFIG, isScoutingTierUnlocked, ENERGY_CONFIG, DEVELOPMENT_CONFIG, ACADEMY_DRILLS, SCOUTING_DURATIONS, PENDING_POOL_MAX_SIZE } from "@/engine/academy-constants"
import { AcademyPlayer, AcademyTrainingFocus, ScoutingTier } from "@/types/academy"
import { TrainingFocus } from "@/types"
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
import { pendingPlayableMatch } from "@/lib/playable-match"
import { pruneGameState } from "@/store/utils/array-pruning"
import { perfTrace } from "@/engine/perf-trace"
import { logger } from "@/lib/logger"
import { createSettingsSlice } from "@/store/slices/settings-slice"
import { createScoutingSlice } from "@/store/slices/scouting-slice"
import { createDebugSlice } from "@/store/slices/debug-slice"
import { createTournamentSlice } from "@/store/slices/tournament-slice"
import { createEventsSlice } from "@/store/slices/events-slice"
import { createUISlice } from "@/store/slices/ui-slice"
import { createSponsorshipSlice } from "@/store/slices/sponsorship-slice"
import { createPhysicalPreviewSlice, type PhysicalPreviewActions } from '@/store/slices/physical-preview-slice'
import { createMatchUISlice } from "@/store/slices/match-ui-slice"
import { createMatchOperationsSlice } from "@/store/slices/match-operations-slice"
import { createMatchSchedulingSlice } from "@/store/slices/match-scheduling-slice"
import { createMatchSimulationSlice } from "@/store/slices/match-simulation-slice"
import { createTeamDrillsSlice } from "@/store/slices/team-drills-slice"
import { applyPreTickMutations } from "@/engine/processors/pre-tick-mutations"
import { buildSaveSnapshot } from "@/store/utils/build-save-snapshot"
import { useSettingsStore } from "@/lib/settings-store"
import { applyWeeklyActivity } from "@/engine/processors/weekly-activity-processor"
import { applyScheduledActivities } from "@/engine/processors/scheduled-activities-processor"
import { applyAutoRegistration } from "@/engine/processors/auto-registration-processor"
import { evaluatePostTickAchievements } from "@/engine/processors/post-tick-achievements"
import { checkMilestones } from "@/engine/milestone-checker"
import { recalculateAllSynergy, recalculateTeamSynergy } from "@/engine/processors/team-synergy-recalc"
import { createTrainingSlice } from "@/store/slices/training-slice"
import { createTeamSettingsSlice } from "@/store/slices/team-settings-slice"
import { createDelegationSlice } from "@/store/slices/delegation-slice"
import { createDressingRoomSlice } from "@/store/slices/dressing-room-slice"
import { createPlayerDevelopmentSlice } from "@/store/slices/player-development-slice"
import { createStaffManagementSlice } from "@/store/slices/staff-management-slice"
import { createTeamFacilitiesSlice } from "@/store/slices/team-facilities-slice"
import { createTransferContractSlice } from "@/store/slices/transfer-contract-slice"
import { createAcademySlice } from "@/store/slices/academy-slice"
import { createAdvanceSlice, initialAdvanceState, isContinueStepping, type AdvanceState, type AdvanceActions } from "@/store/slices/advance-slice"
import { createMomentsSlice, initialMomentsState, type MomentsState, type MomentsActions } from "@/store/slices/moments-slice"
import { queueMoment, restoreMomentQueue, restoreSeenMomentKeys } from "@/engine/moments"
import { WeekChangeRecorder, diffClubs, sideScore, snapshotClub, type ChangeCause, type ChangeEntry } from "@/lib/week-changes"
import { competitionLabel, splitLiveRankEntries } from "@/engine/ranking-report"
import { buildWeekReport, newTracker, pushWeekReport, sanitizeWeekReports } from "@/lib/week-report"
import { recordWeekChanges, withTracker, type TrackingState } from "@/store/utils/week-tracking"
import { getEventTitle } from "@/lib/event-format"
import { foldWeeklyDigest } from "@/lib/inbox-digest"
import { normalizeDecisions } from "@/engine/decision-deadlines"
import drillCatalog from "@/data/drills.json"
import { formatCurrency } from "@/lib/utils-extended"
import { DEFAULT_TEAM_TRAINING } from "@/engine/development-outlook"

enableMapSet()


type RngBackedState = {
  lastRngSeed: number
  currentWeek: number
}

const nextRandom = (state: RngBackedState): number => {
  const rng = new SeededRNG(state.lastRngSeed ?? generateSeed())
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
let pendingGameSave: Promise<void> | null = null
export async function waitForPendingGameSave(): Promise<void> { await pendingGameSave }
let careerGeneration = 0

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
      state.lastRngSeed ?? 1
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
    // Careers, season tallies and records (Phase 5.1): same as the week tick's AI path.
    recordOfficialMatch(state as unknown as GameSave, match, result, { player: findPlayer, team: findTeam })

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
        undefined,
        undefined,
        roundDiff,
        { tournamentId: match.tournamentId, stage: match.stage, maps: result.maps.length },
      )
      if (eloResult) {
        completedMatch.eloChange = {
          home: homeWon ? eloResult.winnerChange : eloResult.loserChange,
          away: homeWon ? eloResult.loserChange : eloResult.winnerChange,
        }
      }
    }

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
// Series totals: a long BO5 runs 120+ rounds, and a star kills about 0.8 a round.
const MAX_MATCH_KILLS = 200
const MAX_MATCH_DEATHS = 200
const MAX_MATCH_ASSISTS = 150
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
export interface GameStoreState extends AdvanceState, MomentsState {
  // Game Data (Mirrors GameSave)
  saveId: string | null
  saveName: string
  currentWeek: number
  currentDay: number
  timeMode: "WEEKLY" | "HYBRID_DAILY"
  gameStartDate: string
  lastRngSeed: number
  lastCommittedWeekTick?: number

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
  firstSession?: import('@/lib/first-session').FirstSessionState
  onboardingCompleted: boolean
  tutorialCompleted: boolean
  showTutorialOnNewGame: boolean
  manualTutorialTrigger: number // Timestamp to force trigger tutorial

  // Phase 23: Hall of Fame
  legendaryPlayers: PlayerSaveData[]

  // Phase 23: Hall of Fame
  hallOfFame: HallOfFameEntry[]

  // Phase 9: Scouting System
  scoutedPlayers: { playerId: string; scoutedWeek: number; scoutLevel: "BASIC" | "ADVANCED" | "EXPERT" | "ELITE" }[]
  activeScoutingMission?: { playerId: string; startWeek: number; completionWeek: number; scoutId: string }
  watchlistedPlayerIds: string[]
  savedSearches: import("@/engine/save-types").SavedMarketSearch[]
  delegation: import("@/engine/delegation").DelegationSettings
  mapRecords?: import("@/engine/map-record").MapRecordState

  // Phase 25: Region Selection
  selectedRegions: string[]

  // Phase 20: Tournament System
  circuitPoints: CircuitPointsEntry[]
  tournamentQualifications: QualificationStatus[]

  // Phase 40: Navigation Guard
  activeMatchId: string | null
  activeMatchState: ActiveMatchState | null
  physicalMatchPreview?: import('@/engine/spatial/career-round-journal').PhysicalCareerJournal | null

  // Phase 39: Customizable Tactical Loadouts
  customTactics: CustomTactics
  /** Live match: the decision card confirms the engine's call by itself (saved with the career). */
  autoTactics: boolean

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
  weekProgress: import("@/store/types").WeekProgressPhase | null
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

  // Phase 4.4: regional league (divisions, fixtures, tables)
  league?: import("@/engine/save-types").LeagueState

  // Board Expectations & Confidence
  boardState?: import("@/engine/save-types").BoardState
  socialFeed?: import("@/engine/save-types").SocialPost[]
  careerStats?: import("@/engine/save-types").CareerStats
  recordBook?: import("@/engine/records-types").RecordBook
  storylines?: import("@/engine/storylines/types").StoryArc[]

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
  gameSpeed: "normal" | "fast" | "very-fast"
  difficulty: "easy" | "normal" | "hard" | "legendary"
  autoSave: boolean
  notifications: boolean
  showBugReportButton: boolean
}

interface GameStoreActions extends PhysicalPreviewActions, AdvanceActions, MomentsActions {
  // Lifecycle
  initializeNewGame: (saveName: string, playerTeamId: string, snapshotId?: string, options?: { unemployed?: boolean }) => Promise<void>
  initializeCustomTeam: (managerName: string, teamData: import("@/types/team-creator").CustomTeamData) => Promise<void>
  loadGame: (saveId: string, cloudChoice?: "local" | "cloud") => Promise<void>
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
  /** Phase 5.3: answer a press conference (question id → answer id). */
  answerPressConference: (eventId: string, answers: Record<string, string>) => { ok: boolean; message: string }
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
  setDelegation: (area: import("@/engine/delegation").DelegationArea, on: boolean) => void
  runDelegatedChores: () => string[]
  performVODReview: (matchId: string) => void
  performMentalReset: (matchId?: string) => void

  // Equipment Shop
  purchaseEquipment: (catalogId: string) => { success: boolean; error?: string }
  // Squad Management
  swapRosterPositions: (teamId: string, index1: number, index2: number) => void
  promotePlayer: (playerId: string) => void
  // Dressing room (Phase 5.2)
  setCaptain: (playerId: string | null) => { success: boolean; message: string }
  assignMentor: (mentorId: string, menteeId: string) => { success: boolean; message: string }
  endMentorship: (menteeId: string) => void

  // Multi-slot Save System
  listSaves: () => Promise<SaveSlotMetadata[]>
  switchSave: (saveId: string, cloudChoice?: "local" | "cloud") => Promise<boolean>
  deleteSaveInSlot: (saveId: string) => Promise<void>
  deleteAllSaves: () => Promise<void>
  attemptSaveRecovery: (saveId: string) => Promise<boolean>
  clearLoadError: () => void

  // Phase 22: Professional Polish
  completeOnboarding: () => void
  reviewGuideStep: (step: import('@/lib/first-session').FirstSessionStep) => void
  syncFirstSession: () => void
  completeTutorial: () => void
  triggerTutorial: () => void
  setShowTutorialOnNewGame: (enabled: boolean) => void

  // Phase 3: Career Moves
  switchTeam: (newTeamId: string) => void

  // Phase 60: Talent Trees
  unlockStaffTalent: (staffId: string, talentId: string) => void
  unlockPlayerTalent: (playerId: string, talentId: string) => void

  // Phase 9: Scouting
  startScoutingMission: (playerId: string) => void
  cancelScoutingMission: () => void
  getScoutingLevel: (playerId: string) => string
  isPlayerScouted: (playerId: string) => boolean
  toggleWatchlistPlayer: (playerId: string) => void
  isPlayerWatchlisted: (playerId: string) => boolean
  /** G8: save the current market filters; returns false when nothing narrows the market or the list is full. */
  saveMarketSearch: (name: string, criteria: import("@/engine/market-search").MarketCriteria) => boolean
  deleteMarketSearch: (id: string) => void
  toggleMarketSearchAlerts: (id: string) => void

  // Phase 39: Customizable Tactical Loadouts
  updateCustomTactic: (id: keyof CustomTactics, side: "ct" | "t", strategy: TacticalStrategy) => void
  setAutoTactics: (on: boolean) => void

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
  releasePlayer: (playerId: string) => { success: boolean; message: string }

  // Phase 20: Tournament System
  registerForTournament: (tournamentId: string) => { success: boolean; message: string }
  checkTournamentEligibility: (tournamentId: string) => { eligible: boolean; reason: string } // New action
  qualifyForTournament: (tournamentId: string, via: string) => void
  awardCircuitPoints: (teamId: string, tournamentId: string, placement: number) => void

  // Match Management
  updateScheduledMatch: (matchId: string, updates: Partial<MatchSaveData>) => void
  simulateInstantMatch: (matchId: string, opts?: { skippedPrep?: boolean }) => Promise<boolean>

  // Generic Updates (Added for Flexibility)
  updatePlayer: (playerId: string, updates: Partial<PlayerSaveData>) => void
  updateTeamBudget: (teamId: string, amount: number) => void

  // Phase 60: Job Market
  acceptJobOffer: (eventId: string) => { success: boolean; message: string }
  declineJobOffer: (eventId: string) => void
  findMoreJobOffers: () => number

  negotiateJobOffer: (eventId: string) => { success: boolean; message: string; newOffer?: number; withdrew?: boolean }

  // Immersive Content
  setWeeklyActivity: (type: import("@/types").WeeklyActivityType) => void

  // Navigation Guard
  setActiveMatch: (id: string | null) => void
  updateActiveMatchState: (state: ActiveMatchState) => void
  clearActiveMatchState: () => void

  // UI Celebrations
  clearCelebration: () => void
  selectLegend: (legendId: string) => void
  clearLegendPick: () => void
  debugTriggerCelebration: () => void
  debugTriggerMoment: (kind: import("@/engine/moments").MomentKind, opts?: { major?: boolean }) => void
  debugTriggerInjury: (playerId?: string) => void
  debugTriggerLegendPick: () => void
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
  setGameSpeed: (speed: "normal" | "fast" | "very-fast") => void
  setTimeMode: (mode: "WEEKLY" | "HYBRID_DAILY") => void
  setDifficulty: (difficulty: "easy" | "normal" | "hard" | "legendary") => void
  setAutoSave: (enabled: boolean) => void
  setNotifications: (enabled: boolean) => void
  setShowBugReportButton: (enabled: boolean) => void
}

/**
 * Achievement-unlock toast for steamService. Built outside loadGame /
 * initializeNewGame on purpose: the service keeps this callback for the whole
 * session, and an inline closure kept those functions' scope alive, which
 * pinned an entire extra copy of the loaded save in renderer memory (L27).
 */
function achievementToast(get: () => { addToast: (toast: { message: string; type: "achievement" }) => void }) {
  return (achievement: { name: string }) => get().addToast({ message: `Achievement Unlocked: ${achievement.name}`, type: "achievement" })
}

/**
 * The manager's fixture this week that must be played before the week can
 * advance (any day of the week). Shares its predicate with the TopBar's
 * "Play match" offer (lib/playable-match.ts): fixtures where either side
 * cannot field five are excluded, because simulateInstantMatch refuses them
 * and the week tick resolves them by forfeit (match-forfeit.ts).
 */
/**
 * True once a career is actually loaded. Without one, an advance builds a
 * snapshot for team "unknown" under a recovery saveId (build-save-snapshot.ts)
 * and persists a phantom career, so every advance action is a no-op.
 */
function hasLoadedCareer(state: Pick<GameStoreState, "saveId" | "playerTeamId">): boolean {
  return !!state.saveId && !!state.playerTeamId
}

/**
 * A day step in daily mode is saved at once (with that day's AI results), so
 * a reload resumes on the same day instead of the start of the week. A
 * Continue run saves once when it stops (advance-slice), not every day.
 */
function persistDayCursor(): void {
  const s = useGameStore.getState()
  if (!s.saveId || !s.isInitialized || s.isLoading || s.continueRun) return
  void s.saveGame().catch(() => { /* surfaced by saveGame */ })
}

function weekBlockingMatch(
  state: Pick<GameStoreState, "playerTeamId" | "scheduledMatches" | "completedMatches" | "currentWeek" | "teams" | "players">,
  completedIds: Set<string> = new Set(state.completedMatches.map(cm => cm.id)),
) {
  return pendingPlayableMatch(state, completedIds, { respectDay: false })
}

/**
 * Weekly report: store actions whose effect has a known cause record the
 * managed-club changes they make as they happen (store/utils/week-tracking.ts).
 * Each wraps the slice's own implementation; behaviour is unchanged.
 */
function weekRecordedActions(set: unknown, get: unknown) {
  type Store = GameStoreState & GameStoreActions
  const g = get as () => TrackingState
  const s = set as Parameters<typeof recordWeekChanges>[1]
  const slice = <T,>(create: (set: never, get: never) => T): T => create(set as never, get as never)
  const store = (st: TrackingState) => st as unknown as Store
  const short = (text: string) => (text.length > 70 ? `${text.slice(0, 67)}...` : text)

  const matchCause = (st: TrackingState, matchId: string): ChangeCause | null => {
    const state = store(st)
    const m = state.completedMatches.find(cm => cm.id === matchId)
    if (!m?.result || !state.playerTeamId) return null
    const isHome = m.homeTeamId === state.playerTeamId
    const opp = state.teams.find(t => t.id === (isHome ? m.awayTeamId : m.homeTeamId))?.name ?? "opponent"
    const won = m.result.winnerId === state.playerTeamId
    return { type: "match", label: `${won ? "Beat" : "Lost to"} ${opp} ${sideScore(m.result, isHome)}${competitionLabel(state, m)}` }
  }

  const sim = slice(createMatchSimulationSlice as never) as ReturnType<typeof createMatchSimulationSlice>
  const drills = slice(createTeamDrillsSlice as never) as ReturnType<typeof createTeamDrillsSlice>
  const events = slice(createEventsSlice as never) as ReturnType<typeof createEventsSlice>
  const settings = slice(createTeamSettingsSlice as never) as ReturnType<typeof createTeamSettingsSlice>
  const ops = slice(createMatchOperationsSlice as never) as ReturnType<typeof createMatchOperationsSlice>
  const transfers = slice(createTransferContractSlice as never) as ReturnType<typeof createTransferContractSlice>

  return {
    // The ranking refreshes after the managed match: its rank move is split
    // into this result and other clubs' results since the last refresh.
    saveMatchResult: recordWeekChanges(g, s, sim.saveMatchResult, (st, matchId: string) => matchCause(st, matchId),
      (entries, start, now) => now.playerTeamId ? splitLiveRankEntries(entries, store(start), store(now), now.playerTeamId) : entries),
    runTeamDrill: recordWeekChanges(g, s, drills.runTeamDrill, (_st, drillId: string) =>
      ({ type: "training", label: `Drill: ${drillCatalog.find(d => d.id === drillId)?.name ?? "team drill"}` })),
    resolveEventChoice: recordWeekChanges(g, s, events.resolveEventChoice, (st, eventId: string, choiceId: string) => {
      const event = store(st).eventsLog.find(e => e.id === eventId)
      if (!event) return null
      const choice = (event as unknown as { choices?: { id: string; text?: string }[] }).choices?.find(c => c.id === choiceId)
      return { type: "event", label: short(`${getEventTitle(event)}: ${choice?.text ?? choiceId}`) }
    }),
    answerPressConference: recordWeekChanges(g, s, events.answerPressConference, (st, eventId: string) => {
      const event = store(st).eventsLog.find(e => e.id === eventId)
      return event ? { type: "event", label: short(getEventTitle(event)) } : null
    }),
    treatInjury: recordWeekChanges(g, s, settings.treatInjury, () => ({ type: "injury", label: "Medical treatment" })),
    performMentalReset: recordWeekChanges(g, s, ops.performMentalReset, () => ({ type: "staff", label: "Mental reset" })),
    renewContract: recordWeekChanges(g, s, transfers.renewContract, () => ({ type: "contract", label: "Contract renewal" })),
    releasePlayer: recordWeekChanges(g, s, transfers.releasePlayer, (st, playerId: string) =>
      ({ type: "transfer", label: `Released ${store(st).players.find(p => p.id === playerId)?.nickname ?? "a player"}` })),
    acceptTransferOffer: recordWeekChanges(g, s, transfers.acceptTransferOffer, () => ({ type: "transfer", label: "Transfer offer accepted" })),
  }
}

/**
 * Advance/report state for a career that just became active: its saved
 * reports (sanitized) and a tracker for the current week. `fresh` marks a
 * brand-new career, whose baseline is the true start of the week.
 */
function careerAdvanceState(save: GameSave, playerTeamId: string | null, fresh: boolean): AdvanceState {
  const loaded = sanitizeWeekReports((save as GameSave & { weekReports?: unknown }).weekReports)
  const source = { ...save, playerTeamId, weekReports: loaded } as unknown as TrackingState
  return { ...initialAdvanceState, weekReports: withTracker(source, !fresh) }
}

/**
 * A brand-new career starts with an empty moment queue and the board brief
 * (Phase 5.4a), shown once on the dashboard after creation.
 */
function queueWelcomeMoment(save: GameSave, teamId: string): void {
  save.momentQueue = []
  save.seenMomentKeys = []
  queueMoment(save, { key: `welcome:${save.saveId}`, kind: "welcome", week: save.currentWeek, teamId })
}

/** Field defaults shared by load hydration and the weekly commit. */
function applyPlayerFieldDefaults(players: PlayerSaveData[]): void {
  players.forEach(p => {
    if (!p.perks) p.perks = []
    if (!p.roleMastery) p.roleMastery = { [p.role]: 75 }
    if (p.availableSkillPoints === undefined) p.availableSkillPoints = 2
    if (p.level === undefined) p.level = 1
    if (p.xp === undefined) p.xp = 0
    if (p.xpToNextLevel === undefined) p.xpToNextLevel = 1000
    if (p.talentPoints === undefined) p.talentPoints = 0
    if (p.unlockedTalentIds === undefined) p.unlockedTalentIds = []
    // Phase 5.2 safety net: any player that arrived without a personality.
    ensurePersonality(p)
  })
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
      ...createPhysicalPreviewSlice(
        set as Parameters<typeof createPhysicalPreviewSlice>[0],
        get as Parameters<typeof createPhysicalPreviewSlice>[1],
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
      ...createDelegationSlice(
        set as Parameters<typeof createDelegationSlice>[0],
        get as Parameters<typeof createDelegationSlice>[1],
      ),
      ...createDressingRoomSlice(
        set as Parameters<typeof createDressingRoomSlice>[0],
        get as Parameters<typeof createDressingRoomSlice>[1],
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
      // Continue to next decision + weekly report state (Phase 4 stream 4.1).
      ...createAdvanceSlice(
        set as unknown as Parameters<typeof createAdvanceSlice>[0],
        get as unknown as Parameters<typeof createAdvanceSlice>[1],
      ),
      ...initialAdvanceState,
      // Full-screen moments queue (Phase 5.4a).
      ...createMomentsSlice(
        set as unknown as Parameters<typeof createMomentsSlice>[0],
        get as unknown as Parameters<typeof createMomentsSlice>[1],
      ),
      ...initialMomentsState,
      // Overrides the slice actions above with change-recording wrappers.
      ...weekRecordedActions(set, get),

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
      lastCommittedWeekTick: undefined,

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

      // Phase 23
      legendaryPlayers: [],
      hallOfFame: [],

      // Phase 9: Scouting
      scoutedPlayers: [],
      activeScoutingMission: undefined,
      watchlistedPlayerIds: [],
      savedSearches: [],
      delegation: {},
      mapRecords: undefined,

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
      gameSpeed: "normal",
      difficulty: "normal",
      autoSave: true,
      notifications: true,
      showBugReportButton: false,

      // Game Over State
      gameOverReason: null,
      gameOverWeek: null,

      // UI Celebrations
      pendingCelebration: null,
      weekProgress: null,
      pendingLegendPick: null,
      signedLegendIds: [],
      activelyPlayingLegendIds: [],
      // clearCelebration / selectLegend / clearLegendPick
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
      physicalMatchPreview: null,
      // setActiveMatch / updateActiveMatchState / clearActiveMatchState /
      // updateCustomTactic moved to store/slices/match-ui-slice.ts (spread above).

      // Phase 39/43: Default Tactics with Per-Player Loadouts
      customTactics: createDefaultTactics(),
      autoTactics: false,

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

      initializeNewGame: async (saveName, playerTeamId, _snapshotId, options) => {
        // G9: an unemployed start creates the world around a placeholder club
        // (never managed) and opens on the first-job market.
        const unemployed = options?.unemployed === true
        careerGeneration++
        weekProcessorBridge.reset?.()
        set({ isLoading: true, error: null })
        try {
          // Ensure snapshot is loaded
          if (!snapshotLoader.getSnapshot()) {
            await snapshotLoader.loadSnapshot()
          }

          // Initialize Steam Achievements
          steamAchievements.initialize(achievementToast(get))

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

            // Phase 4.4: starting cash = 26 weeks of the club's own running
            // costs (plus the missing starters' wages for an incomplete squad),
            // so every tier starts with the same runway. Was a flat $250k-$2M
            // by reputation band that no club could spend down.
            t.startingBudget = initialClubBudget(newSave, t)
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
          if (selectedTeam && !unemployed && selectedTeam.startingLeagueTier == null) {
            selectedTeam.startingLeagueTier = selectedTeam.leagueTier
          }
          const teamRoster = newSave.players.filter((p: any) => selectedTeam?.rosterIds?.includes(p.id))
          const avgRating = teamRoster.length > 0
            ? Math.round(teamRoster.reduce((acc: number, p: any) => acc + (p.skill || 75), 0) / teamRoster.length)
            : 75

          // Add Welcome Mail
          if (!unemployed) newSave.eventsLog.unshift({
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

          // Seed preseason friendlies so Week 1 isn't an empty calendar — gives
          // the player scrims to play immediately and a real "next match" on the
          // dashboard while the first tournaments are still weeks away.
          if (!unemployed) seedPreseasonFriendlies(newSave, playerTeamId)

          // Regional league: draw split 1 now (after the friendlies, so league
          // nights avoid them) so the fixture list is there on day one, and set
          // the board's objectives against it (Phase 4.4).
          drawDueLeagueSplit(newSave)
          ensureBoardState(newSave)
          if (unemployed) {
            newSave.gameOverReason = "UNEMPLOYED"
            newSave.gameOverWeek = newSave.currentWeek
            JobOfferGenerator.createFirstJobOffers(newSave, new SeededRNG((newSave.lastRngSeed ?? 1) ^ 0x51ed)) // adds the offers to the inbox
          } else {
            queueWelcomeMoment(newSave, playerTeamId)
          }

          // Initial Save
          newSave.firstSession = get().showTutorialOnNewGame ? newFirstSession() : { ...newFirstSession(), status: "dismissed" }
          newSave.selectedWeeklyActivity = null
          const initialSaveResult = await saveManager.saveGame(newSave)
          if (!initialSaveResult.success) throw new Error(initialSaveResult.error || "Could not save the new career. Free disk space and retry.")

          // Update Store
          set({
            ...newSave,
            ...careerAdvanceState(newSave, playerTeamId, true),
            lastCommittedWeekTick: newSave.lastCommittedWeekTick,
            recordBook: newSave.recordBook, // explicit: a new career never inherits the last one's records
            storylines: newSave.storylines, // nor its storylines (Phase 5.3)
            autoTactics: false, // nor its auto-tactics switch
            delegation: {}, // nor its staff delegation
            availableEquipment: initialEquipment,
            playerTeamId: playerTeamId, // We assume the user controls the team they selected
            theme: "crystal", // Default theme for new game
            manualTutorialTrigger: 0,
            tutorialCompleted: false, // Reset tutorial for new game
            onboardingCompleted: false, // Reset onboarding for new game
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
        careerGeneration++
        weekProcessorBridge.reset?.()
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

            // Same runway rule as initializeNewGame (Phase 4.4).
            t.startingBudget = initialClubBudget(newSave, t)
            t.budget = t.startingBudget
          })

          // Initialize Elo and Tiers
          AIManager.initializeTeamData(newSave)

          // Reconcile all roles (was missing from custom path!)
          reconcileAllRoles(newSave.teams, newSave.players)

          // Generate starter academy prospects for custom teams
          try {
            const { generateProspectBatch } = await import("@/engine/prospect-generator")
            const prospectRng = new SeededRNG(newSave.lastRngSeed ?? generateSeed())
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
                careerHistory: [],
                // Phase 5.2: the rolled prospect type is his archetype.
                personality: { archetype: prospect.archetype },
                traits: deriveTraits({ ...prospect.stats, id: prospectPlayerId, role: prospect.role }),
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

          // Regional league draw + board objectives (Phase 4.4).
          drawDueLeagueSplit(newSave)
          ensureBoardState(newSave)
          queueWelcomeMoment(newSave, result.teamId)

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
                `Starting budget: ${formatCurrency(totalBudget)} (includes recruitment bonus!).\n\n` +
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

          // Do not open a career whose first durable write failed.
          newSave.firstSession = get().showTutorialOnNewGame ? newFirstSession() : { ...newFirstSession(), status: "dismissed" }
          newSave.selectedWeeklyActivity = null
          const initialSaveResult = await saveManager.saveGame(newSave)
          if (!initialSaveResult.success) throw new Error(initialSaveResult.error || "Could not save the new career. Free disk space and retry.")

          // Update Store
          set({
            ...newSave,
            ...careerAdvanceState(newSave, result.teamId, true),
            lastCommittedWeekTick: newSave.lastCommittedWeekTick,
            recordBook: newSave.recordBook,
            storylines: newSave.storylines,
            autoTactics: false,
            delegation: {},
            availableEquipment: [
              { id: "mouse_001", name: "Basic Gaming Mouse", type: "MOUSE", weeklyCost: 0, tier: 1, purchasedWeek: 0, bonus: { stat: "skill", value: 1 } },
            ],
            playerTeamId: result.teamId,
            theme: "crystal",
            manualTutorialTrigger: 0,
            tutorialCompleted: false,
            onboardingCompleted: false,
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

      loadGame: async (saveId, cloudChoice) => {
        careerGeneration++
        weekProcessorBridge.reset?.()
        set({ isLoading: true, error: null, lastLoadError: null })
        try {
          const { save, error, errorCode, restoredFromBackup, recoveryMessage } = await saveManager.loadGame(saveId, cloudChoice)

          if (error || !save) {
            const message = error || "Save not found"
            set({ lastLoadError: { saveId, errorCode: errorCode || "UNKNOWN", message } })
            throw new Error(message)
          }

          await steamAchievements.setActiveSave(save.saveId)

          // Initialize Steam Achievements with UI callback
          steamAchievements.initialize(achievementToast(get))

          // Notify user if save was restored from backup
          if (restoredFromBackup) {
            setTimeout(() => {
              get().addToast({
                message: recoveryMessage || "Your latest save could not be used, so a backup was loaded. Recent progress may be missing.",
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

          refreshStockIdentities(hydratedSave)

          // Augment with new fields if missing (backward compatibility)
          applyPlayerFieldDefaults(hydratedSave.players)

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

          AIManager.initializeTeamData(hydratedSave)
          reconcileAllRoles(hydratedSave.teams, hydratedSave.players)
          // Older saves hold open requests without a deadline (and stacked
          // repeats): give each its deadline and default, merge repeats (Phase 4.9).
          normalizeDecisions(hydratedSave, { arrivals: false })

          set({
            ...hydratedSave,
            ...careerAdvanceState(hydratedSave, inferredTeamId, false),
            firstSession: restoreFirstSession(hydratedSave.firstSession),
            selectedWeeklyActivity: restoreWeeklyPlan(hydratedSave.selectedWeeklyActivity),
            manualTutorialTrigger: 0,
            tutorialCompleted: restoreFirstSession(hydratedSave.firstSession).status !== "active",
            onboardingCompleted: restoreFirstSession(hydratedSave.firstSession).status === "complete",
            customTactics: hydratedSave.customTactics ?? createDefaultTactics(),
            autoTactics: hydratedSave.autoTactics === true,
            watchlistedPlayerIds: hydratedSave.watchlistedPlayerIds ?? [],
            savedSearches: hydratedSave.savedSearches ?? [],
            delegation: hydratedSave.delegation ?? {},
            mapRecords: hydratedSave.mapRecords,
            activeMatchId: hydratedSave.activeMatchId ?? null,
            activeMatchState: hydratedSave.activeMatchState ?? null,
            physicalMatchPreview: hydratedSave.physicalMatchPreview ?? null,
            boardState: hydratedSave.boardState,
            socialFeed: hydratedSave.socialFeed,
            // Optional slices must be assigned explicitly: the spread above
            // omits absent keys, which would keep the previous career's data.
            league: hydratedSave.league,
            careerStats: hydratedSave.careerStats,
            recordBook: hydratedSave.recordBook,
            storylines: hydratedSave.storylines,
            activeScoutingMission: hydratedSave.activeScoutingMission,
            gameOverReason: hydratedSave.gameOverReason,
            gameOverWeek: hydratedSave.gameOverWeek,
            pendingCelebration: hydratedSave.pendingCelebration ?? null,
            pendingLegendPick: hydratedSave.pendingLegendPick ?? null,
            momentQueue: restoreMomentQueue(hydratedSave.momentQueue),
            seenMomentKeys: restoreSeenMomentKeys(hydratedSave.seenMomentKeys),
            signedLegendIds: hydratedSave.signedLegendIds ?? [],
            activelyPlayingLegendIds: hydratedSave.activelyPlayingLegendIds ?? [],
            declinedSponsorOfferIds: hydratedSave.declinedSponsorOfferIds ?? [],
            sponsorOffers: hydratedSave.sponsorOffers ?? [],
            difficulty: hydratedSave.difficulty ?? "normal",
            nextMarketRefreshWeek: hydratedSave.nextMarketRefreshWeek,
            lastCommittedWeekTick: hydratedSave.lastCommittedWeekTick,
            playerTeamId: inferredTeamId,
            currentDay: (typeof hydratedSave.currentDay === "number" ? Math.max(0, Math.min(6, Math.floor(hydratedSave.currentDay))) : 6),
            timeMode: hydratedSave.timeMode === "HYBRID_DAILY" ? "HYBRID_DAILY" : "WEEKLY",
            lastRngSeed: hydratedSave.lastRngSeed ?? generateSeed(),
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

        try {
          const gameSave = buildSaveSnapshot(state)

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
        pendingGameSave = chained
        const finished = () => { if (pendingGameSave === chained) pendingGameSave = null }
        void chained.then(finished, finished)
        saveChain = chained.catch(() => {})
        return chained
      },

      advanceDay: async () => {
        const state = get()
        // A dissolved career must not move its calendar (daily mode never reached advanceWeek's guard).
        if (state.isLoading || state.gameOverReason || !hasLoadedCareer(state)) return
        // During a Continue run only the run itself advances (no stray hotkey steps past a stop).
        if (state.continueRun && !isContinueStepping()) return
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
          persistDayCursor()
          return
        }

        await state.advanceWeek()
      },

      advanceToWeekEnd: async () => {
        const state = get()
        if (state.isLoading || state.gameOverReason || !hasLoadedCareer(state)) return
        if (state.continueRun && !isContinueStepping()) return
        if (state.timeMode !== "HYBRID_DAILY") {
          await state.advanceWeek()
          return
        }

        // Check if player has an unplayed match this week — stop at match day
        const playerMatchThisWeek = weekBlockingMatch(state)

        if (playerMatchThisWeek) {
          const matchDay = playerMatchThisWeek.day ?? 6
          if (state.currentDay < matchDay) {
            // Advance to match day so PLAY MATCH button appears — same
            // two-phase commit as advanceDay so the day cursor moves
            // before the match simulation runs.
            set(draft => { draft.currentDay = matchDay })
            await new Promise(resolve => setTimeout(resolve, 0))
            set(draft => { simulateDueAIMatchesForDay(draft, matchDay) })
            persistDayCursor()
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
        const generation = careerGeneration

        // Guard: prevent concurrent week processing (race condition from rapid key presses)
        if (state.isLoading) return

        // Guard: no career loaded — nothing to advance (would persist a phantom save)
        if (!hasLoadedCareer(state)) return

        // Guard: during a Continue run only the run itself advances.
        if (state.continueRun && !isContinueStepping()) return

        // Guard: prevent advancing if game is over (bankruptcy)
        if (state.gameOverReason) {
          get().addToast({ message: "You have no club. Take a job offer to continue the career.", type: "warning" })
          set({ isLoading: false })
          return
        }

        // Guard: prevent advancing if the player has an unplayed match this week
        const completedIds = state._completedMatchIds || new Set(state.completedMatches.map(cm => cm.id))
        const unplayedPlayerMatch = weekBlockingMatch(state, completedIds)
        if (unplayedPlayerMatch) {
          get().addToast({ message: "You have a match to play this week!", type: "warning" })
          set({ isLoading: false })
          return
        }

        // G6: staff run the chores the manager delegated (renewals, drills, scouting) before the week is built.
        get().runDelegatedChores()

        set({ isLoading: true, weekProgress: "preparing" })

        // Yield one macrotask so React can commit the isLoading=true state
        // and the browser can paint the WeekProcessingOverlay BEFORE we start
        // the 10-50ms block of synchronous pre-tick work below (structuredClone
        // + applyPreTickMutations + applyWeeklyActivity + ...).
        // Without this yield, the overlay only appears after that work
        // finishes — pressing space feels like a stall before the spinner.
        await new Promise(resolve => setTimeout(resolve, 0))

        // ESM_PERF_TRACE_STEPS=1 phase timings (no-op otherwise). Yields are
        // excluded by restarting the clock after each await.
        let phaseStart = perfTrace.now()
        const phase = (label: string) => {
          if (perfTrace.stepsEnabled) perfTrace.step(`coord.${label}`, phaseStart)
          phaseStart = perfTrace.now()
        }
        try {
          if (generation !== careerGeneration || get().saveId !== state.saveId) return
          phaseStart = perfTrace.now()

          // Build a clean GameSave snapshot detached from store state so
          // the worker thread receives a serialization-safe copy.
          const latestState = get()
          const saveState: GameSave = structuredClone(buildSaveSnapshot(latestState))
          const preTickRng = new SeededRNG(saveState.lastRngSeed ?? generateSeed())
          // Weekly report: the club as the manager leaves the week, plus each
          // pre-tick step's movement with its cause.
          const reportTeamId = state.playerTeamId || ""
          const playedWeek = state.currentWeek
          const weekTracker = latestState.weekReports?.tracker ?? null
          const preTick = new WeekChangeRecorder(reportTeamId)
          preTick.begin(saveState)
          const preAdvanceClub = preTick.snapshot
          phase("01_snapshotClone")

          // Yield so the browser can paint the overlay spinner frame after
          // the structuredClone (the most expensive synchronous step).
          await new Promise(resolve => setTimeout(resolve, 0))
          if (generation !== careerGeneration || get().saveId !== state.saveId) return
          phaseStart = perfTrace.now()

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
          preTick.mark(saveState, { type: "development", label: "Weekly XP" })

          const rng = new SeededRNG(preTickRng.getState())

          // Passive weekly training for the player's roster. Each player trains
          // their selected Training Focus (the per-player dropdown); players left
          // on "Balanced" (the no-specific-focus sentinel) fall through to the
          // team default regimen below. This Map was previously always empty
          // (AUDIT_UX G1) — so processTraining iterated zero teams, the focus
          // dropdown did nothing, and the squad never auto-trained. Scoped to the
          // player team: the AI world's weekly progression is carried by
          // processNaturalGrowth (player-lifecycle), so the player still pulls
          // ahead via training — the documented intent — without rebalancing
          // every AI roster. Bounded by potential, with fatigue as the brake.
          const trainingFocus = new Map<string, { focus: TrainingFocus; intensity: number }>()
          if (state.playerTeamId) {
            trainingFocus.set(state.playerTeamId, { ...DEFAULT_TEAM_TRAINING })
          }

          const config = {
            playerTeamId: state.playerTeamId || "",
            trainingFocus
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
          const focusName = state.selectedWeeklyActivity ? WEEKLY_ACTIVITIES[state.selectedWeeklyActivity]?.name : undefined
          preTick.mark(saveState, { type: "activity", label: focusName ? `Weekly focus: ${focusName}` : "Weekly focus" })

          // Apply this-week scheduledActivities (staff meetings, bootcamps,
          // rest, travel). Each one applies its own effects + chemistry
          // bonus + surfaces an event. Module owns the per-effect math.
          const bookedNames = (saveState.scheduledActivities || [])
            .filter(a => a.week === saveState.currentWeek || (saveState.currentWeek > a.week && saveState.currentWeek < a.week + (a.duration || 0)))
            .filter(a => a.type === "STAFF_MEETING" || a.type === "BOOTCAMP" || a.type === "TRAVEL" || (a.type === "REST" && !a.id.startsWith("rest_w")))
            .map(a => a.name || a.type)
          applyScheduledActivities(saveState, {
            playerTeamId: state.playerTeamId || "",
            nextId: nextDeterministicId,
          })
          preTick.mark(saveState, {
            type: bookedNames.some(n => /meeting/i.test(n)) ? "staff" : "activity",
            label: [...new Set(bookedNames)].join(", ") || "Booked activity",
          })

          // Auto-register the player team for upcoming INVITE/POINTS
          // tournaments they're eligible for (look-ahead 4 weeks). Errors
          // are swallowed inside the processor and logged.
          applyAutoRegistration(saveState, {
            playerTeamId: state.playerTeamId || "",
            nextId: nextDeterministicId,
          })
          preTick.mark(saveState, { type: "other", label: "Tournament registration" })

          // Phase 20 Enhancement: Simulate Weekly AI Registrations
          TournamentManager.simulateWeeklyRegistrationsV2(saveState, state.currentWeek, rng)
          phase("02_preTick")

          preTick.mark(saveState, { type: "world", label: "World update" })
          const preTickChanges = preTick.result()

          // Run the week off the main thread when possible. The bridge falls
          // back to a synchronous run if the worker can't load (SSR, Electron
          // packaged build with worker disabled, etc.) so the call is safe
          // everywhere. The worker structured-clones `saveState` on the way in
          // and returns a mutated copy; we use that copy below instead of the
          // original `saveState` reference. `saveState` is never touched after
          // this call, so ownership passes to the bridge (no second clone).
          set({ weekProgress: "simulating" })
          const { result, save: processedSave, rngState: postWeekRngState } =
            await weekProcessorBridge.processWeek(saveState, config, rng, { inputOwned: true })
          if (generation !== careerGeneration || get().saveId !== state.saveId) return
          processedSave.lastRngSeed = postWeekRngState
          phase("04_compute")

          if (result.success) {
            // processedSave is a private copy (worker result, or the bridge's
            // owned input on the synchronous path), so it is finished in place
            // and committed as one plain partial. Doing this inside an Immer
            // producer made Immer walk and deep-freeze the entire save on every
            // tick: ~0.1 s for a new career, ~2 s by season 10 (L27). The
            // committed values are identical; the state is simply not frozen,
            // exactly as it already is after loadGame.
            const committed = processedSave as GameSave & { currentDay: number; selectedWeeklyActivity: null }
            const live = get()
            // Keys the old producer read from the merged draft fall back to the
            // live value if the worker result ever omitted them.
            for (const key of ["completedMatches", "eventsLog", "financeLedger", "playerTeamId", "transferHistory", "newsFeed", "academyMatchHistory", "academyWeeklyReports", "league", "timeMode"] as const) {
              if (!(key in committed)) (committed as unknown as Record<string, unknown>)[key] = live[key as keyof typeof live]
            }
            committed.currentDay = committed.timeMode === "HYBRID_DAILY" ? 0 : 6
            committed.selectedWeeklyActivity = null // Reset selection

            // Prune growing arrays to prevent unbounded memory/save growth
            pruneGameState(committed)

            // Players created this tick (prospects, regens) get the same
            // defaults loadGame applies; otherwise a reload changes them.
            applyPlayerFieldDefaults(committed.players)

            // Recalculate synergy for all teams (AI transfers may have
            // changed rosters). Uses the indexed O(roster) pass from
            // engine/processors/team-synergy-recalc.ts.
            recalculateAllSynergy(committed.teams, committed.players)

            // Keep roles reconciled after AI roster moves, as loadGame and
            // new careers do. Without this a save/reload re-assigned roles
            // and the reloaded career diverged from the uninterrupted one.
            reconcileAllRoles(committed.teams, committed.players)
            set({ ...(committed as unknown as Partial<GameStoreState>), weekProgress: "applying" })
            phase("05_commit")

            // Keep progression locked through post-processing and the final
            // durable save. A failed post-step must not replay an advanced week.
            try {
            // Process academy weekly training, scouting missions, and prospect development
            const preAcademyClub = snapshotClub(get(), reportTeamId)
            get().processAcademyWeek()
            const postTickChanges = diffClubs(preAcademyClub, snapshotClub(get(), reportTeamId), { type: "academy", label: "Academy week" })
            phase("06_academy")

            // Rebuild entity indexes after state update for O(1) lookups
            const postTickState = get()
            const newIndexes = buildEntityIndexes(postTickState.teams, postTickState.players, postTickState.contracts, postTickState.staff, postTickState.completedMatches)
            set(newIndexes)
            phase("07_indexes")

            // Evaluate Steam achievements + push leaderboard stats + update
            // Rich Presence from the post-tick snapshot. Self-guards on
            // playerTeam — no-ops if the player isn't on a team yet.
            evaluatePostTickAchievements(get() as unknown as GameSave)
            phase("08_achievements")

            // Career milestones (firsts, round-number totals, streaks). Dedup
            // against the durable acknowledgedEventIds set — each milestone has a
            // stable id, so it fires exactly once ever. Toast + acknowledge so the
            // id persists and it never re-fires.
            try {
              const msState = get()
              const firedIds = new Set<string>([
                ...msState.acknowledgedEventIds,
                ...msState.eventsLog.map(e => e.id),
              ])
              const milestones = checkMilestones(msState as unknown as GameSave, firedIds)
              milestones.forEach(ms => {
                get().addToast({ message: ms.message, type: "achievement" })
                set((s) => {
                  s.eventsLog.unshift({
                    id: ms.id,
                    week: s.currentWeek,
                    type: "MILESTONE",
                    data: { description: ms.message, importance: "MEDIUM" },
                    acknowledged: true,
                  })
                  if (!s.acknowledgedEventIds.includes(ms.id)) s.acknowledgedEventIds.push(ms.id)
                })
              })
            } catch (msErr) {
              logger.error("[advanceWeek] milestone check failed", msErr)
            }
            phase("09_milestones")

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

            // Smaller notices (level-ups, milestones, confirmations, match-day
            // reminders) go into one weekly round-up instead of one inbox row
            // each (Phase 4.9). After the toasts, which read them.
            set(s => { foldWeeklyDigest(s) })

            // Weekly report (replaces the old five-line "week in review"):
            // every change of the week with its cause. Modal after a weekly
            // advance, compact toast in daily mode; a Continue run opens the
            // last report itself when it stops.
            try {
              if (reportTeamId) {
                const reportState = get()
                const finalClub = snapshotClub(reportState, reportTeamId)
                const tickChanges: ChangeEntry[] = [...preTickChanges, ...(result.changes ?? []), ...postTickChanges]
                const report = buildWeekReport({
                  week: playedWeek,
                  teamId: reportTeamId,
                  tracker: weekTracker,
                  preAdvance: preAdvanceClub,
                  tickChanges,
                  final: finalClub,
                  state: reportState,
                })
                const presentation = reportState.continueRun ? {}
                  : reportState.timeMode === "WEEKLY" ? { weekReportOpen: playedWeek, weekReportToast: null }
                    : { weekReportToast: playedWeek }
                set({
                  weekReports: pushWeekReport(reportState.weekReports, report, finalClub ? newTracker(finalClub) : null),
                  ...presentation,
                })
              }
            } catch (reportErr) {
              logger.error("[advanceWeek] weekly report failed (week committed)", reportErr)
            }
            phase("10_toastsReveal")
            } catch (postErr) {
              logger.error("[advanceWeek] post-week processing failed (week already committed)", postErr)
              // The week stays committed. Rebuild entity indexes defensively
              // so O(1) lookups keep working despite the failed post-step.
              try {
                const s = get()
                set(buildEntityIndexes(s.teams, s.players, s.contracts, s.staff, s.completedMatches))
              } catch { /* indexes are best-effort */ }
            }

            // Both compute transports are persistence-free. Commit the complete
            // application state once; failed saves retain the week in memory so
            // manual save or autosave can retry without simulating it twice.
            try {
              set({ weekProgress: "saving" })
              phaseStart = perfTrace.now()
              await get().saveGame()
              phase("11_save")
              // Refresh the cross-save career profile (peak level/majors/rank)
              // so progression survives new games. Fire-and-forget — off the
              // save critical path; failures are swallowed inside the helper.
              void recordCareerProgress(get() as unknown as GameSave)
            } catch (saveErr) {
              logger.error("[advanceWeek] post-tick authoritative save failed (week committed in memory)", saveErr)
            } finally {
              if (generation === careerGeneration) set({ isLoading: false, weekProgress: null })
            }
          } else {
            throw new Error(result.error || "Week processing failed")
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Advance failed"
          if (generation !== careerGeneration) return
          logger.error("[advanceWeek] Failed", err)
          set({ isLoading: false, error: message, weekProgress: null })
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

      switchSave: async (saveId, cloudChoice) => {
        try {
          await get().loadGame(saveId, cloudChoice)
          if (get().lastLoadError) return false
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
        if (get().isLoading) throw new Error("Wait for the current operation before deleting careers.")
        careerGeneration++
        weekProcessorBridge.reset?.()
        set({ isLoading: true })
        try {
        await waitForPendingGameSave()
        const deleted = await saveManager.deleteAllSaves()
        if (!deleted.success) throw new Error("Some careers could not be deleted. Your current session is still open; check storage and retry.")
        // Reset state
        set({
          saveId: null,
          saveName: "",
          isInitialized: false,
          playerTeamId: null,
          teams: [],
          players: [],
        })
        } finally { set({ isLoading: false }) }
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
      // setShowTutorialOnNewGame live in store/slices/settings-slice.ts now
      // (spread above). Audio settings live only in lib/settings-store.ts.

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



      // Settings actions (setResolution /
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
        firstSession: state.firstSession,
        onboardingCompleted: state.onboardingCompleted,
        tutorialCompleted: state.tutorialCompleted,
        showTutorialOnNewGame: state.showTutorialOnNewGame,
        manualTutorialTrigger: state.manualTutorialTrigger,
        resolution: state.resolution,
        gameSpeed: state.gameSpeed,
        difficulty: state.difficulty,
        notifications: state.notifications,
        showBugReportButton: state.showBugReportButton,
        // UI preference
        theme: state.theme,
        // Bootstrap: which save to reload on page refresh
        saveId: state.saveId,
      }) as typeof state,
      onRehydrateStorage: () => (state, error) => {
        if (state && !error) {
          useSettingsStore.getState().adoptLegacyAutoSave(state.autoSave)
          // Pre-Phase-5 saves kept the sound switch here; the device settings own it now.
          useSettingsStore.getState().adoptLegacySoundEnabled((state as { soundEnabled?: boolean }).soundEnabled)
        }
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
