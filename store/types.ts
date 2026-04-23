"use client"

/**
 * Store Type Definitions
 *
 * All slice state & action interfaces are defined here to avoid
 * circular dependencies between slice files.
 * The combined StoreState type is used by every slice creator.
 */

import type {
  TeamSaveData,
  PlayerSaveData,
  ContractSaveData,
  TournamentSaveData,
  StaffSaveData,
  MatchSaveData,
  CompletedMatchSaveData,
  GameEventSaveData,
  ActivitySaveData,
  ManagerDetails,
  TransferRecord,
  FacilitySaveData,
  SponsorSaveData,
  CircuitPointsEntry,
  QualificationStatus,
  HallOfFameEntry,
  CelebrationData,
  LegendPickData,
  SaveSlotMetadata,
  NewsFeedItem,
} from "@/engine/save-types"
import type { EquipmentItem, Role, CustomTactics, TacticalStrategy, ActiveMatchState, WeeklyActivityType } from "@/types"
import type { AcademyPlayer, AcademyMatchResult, AcademyWeeklyReport, AcademyScoutingMission, AcademyTrainingFocus, ScoutingTier } from "@/types/academy"
import type { FPLSaveData } from "@/types/fpl"
import type { CustomTeamData } from "@/types/team-creator"
import type { MatchResult } from "@/types"

// ===== SLICE STATE INTERFACES =====

export interface CoreGameState {
  saveId: string | null
  saveName: string
  currentWeek: number
  currentDay: number
  timeMode: "WEEKLY" | "HYBRID_DAILY"
  gameStartDate: string
  lastRngSeed: number
  playerTeamId: string | null
  managerDetails: ManagerDetails
  gameOverReason: string | null
  gameOverWeek: number | null
  isLoading: boolean
  error: string | null
  isInitialized: boolean
  _hasHydrated: boolean
}

export interface EntitiesState {
  teams: TeamSaveData[]
  players: PlayerSaveData[]
  contracts: ContractSaveData[]
  staff: StaffSaveData[]
  marketStaff: StaffSaveData[]
  nextMarketRefreshWeek?: number
}

export interface MatchState {
  scheduledMatches: MatchSaveData[]
  completedMatches: CompletedMatchSaveData[]
  scheduledActivities: ActivitySaveData[]
  activeMatchId: string | null
  activeMatchState: ActiveMatchState | null
  customTactics: CustomTactics
}

export interface TournamentState {
  tournaments: TournamentSaveData[]
  selectedRegions: string[]
  circuitPoints: CircuitPointsEntry[]
  tournamentQualifications: QualificationStatus[]
}

export interface EventsState {
  eventsLog: GameEventSaveData[]
  acknowledgedEventIds: string[]
  newsFeed: NewsFeedItem[]
  financeLedger: any[]
  transferHistory: TransferRecord[]
}

export interface SponsorshipState {
  sponsorOffers: SponsorSaveData[]
  declinedSponsorOfferIds: string[]
}

export interface ScoutingState {
  scoutedPlayers: { playerId: string; scoutedWeek: number; scoutLevel: "BASIC" | "ADVANCED" | "EXPERT" | "ELITE" }[]
  activeScoutingMission?: { playerId: string; startWeek: number; completionWeek: number; scoutId: string }
  watchlistedPlayerIds: string[]
}

export interface AcademyState {
  academyPlayers: AcademyPlayer[]
  academyMatchHistory: AcademyMatchResult[]
  academyRoster: Record<string, string | null>
  academyTrainingSchedule: Record<number, string | null>
  academyWeeklyReports: AcademyWeeklyReport[]
  academyScoutingMissions: AcademyScoutingMission[]
  academyPendingProspects: string[]
}

export interface UIState {
  theme: "crystal" | "onyx"
  availableEquipment: EquipmentItem[]
  toasts: { id: string; message: string; type: "level_up" | "xp_gain" | "achievement" | "info" | "warning" | "error"; duration?: number }[]
  pendingCelebration: CelebrationData | null
  pendingSeasonRecap: number | null
  pendingLegendPick: LegendPickData | null
  legendaryPlayers: PlayerSaveData[]
  hallOfFame: HallOfFameEntry[]
  signedLegendIds: string[]
  activelyPlayingLegendIds: string[]
  selectedWeeklyActivity: WeeklyActivityType | null
  fplData?: FPLSaveData
}

export interface SettingsState {
  onboardingCompleted: boolean
  tutorialCompleted: boolean
  showTutorialOnNewGame: boolean
  manualTutorialTrigger: number
  soundEnabled: boolean
  resolution: string
  masterVolume: number
  musicVolume: number
  gameSpeed: "normal" | "fast" | "very-fast"
  difficulty: "easy" | "normal" | "hard" | "legendary"
  autoSave: boolean
  notifications: boolean
  showBugReportButton: boolean
}

export interface IndexesState {
  _teamIndex: Map<string, TeamSaveData>
  _playerIndex: Map<string, PlayerSaveData>
  _contractByPlayerIndex: Map<string, ContractSaveData>
  _staffIndex: Map<string, StaffSaveData>
  _completedMatchIds: Set<string>
}

// ===== SLICE ACTION INTERFACES =====

export interface CoreGameActions {
  initializeNewGame: (saveName: string, playerTeamId: string, snapshotId?: string) => Promise<void>
  initializeCustomTeam: (managerName: string, teamData: CustomTeamData) => Promise<void>
  loadGame: (saveId: string) => Promise<void>
  saveGame: () => Promise<void>
  initAchievements: () => void
  advanceDay: () => Promise<void>
  advanceToWeekEnd: () => Promise<void>
  advanceWeek: () => Promise<void>
  switchTeam: (newTeamId: string) => void
  setHasHydrated: (state: boolean) => void
  listSaves: () => Promise<SaveSlotMetadata[]>
  switchSave: (saveId: string) => Promise<boolean>
  deleteSaveInSlot: (saveId: string) => Promise<void>
  deleteAllSaves: () => Promise<void>
  attemptSaveRecovery: (saveId: string) => Promise<boolean>
  clearLoadError: () => void
}

export interface EntitiesActions {
  transferPlayer: (playerId: string, fromTeamId: string | null, toTeamId: string, fee: number, newContract?: { salaryPerWeek: number, startWeek: number, endWeek: number, buyout: number }) => { success: boolean; message?: string }
  updatePlayer: (playerId: string, updates: Partial<PlayerSaveData>) => void
  updateTeamBudget: (teamId: string, amount: number) => void
  swapRosterPositions: (teamId: string, index1: number, index2: number) => void
  promotePlayer: (playerId: string) => void
  refreshStaffMarket: () => void
  hireStaff: (staffId: string, terms?: { salary: number, duration: number, signingBonus: number }) => { success: boolean; message: string }
  renewStaffContract: (staffId: string, salary: number, duration: number) => { success: boolean; message: string }
  fireStaff: (staffId: string) => void
  upgradeFacility: (teamId: string, facilityType: FacilitySaveData["type"]) => void
  signSponsor: (teamId: string, sponsor: SponsorSaveData) => { success: boolean; message: string }
  setPlaystyle: (teamId: string, playstyle: TeamSaveData["playstyle"]) => void
  setEconomyStyle: (teamId: string, economyStyle: TeamSaveData["economyStyle"]) => void
  setTargetPlayer: (teamId: string, targetPlayerId: string | undefined) => void
  purchaseEquipment: (catalogId: string) => { success: boolean; error?: string }
  upgradeMerchStore: (teamId: string) => { success: boolean, message: string }
  toggleMerchItem: (teamId: string, itemType: string) => void
  setPlayerTrainingFocus: (playerId: string, focus: string) => void
  listPlayerForTransfer: (playerId: string, price: number) => void
  unlistPlayerForTransfer: (playerId: string) => void
  acceptTransferOffer: (eventId: string) => void
  renewContract: (playerId: string) => void
  startRoleTraining: (playerId: string, targetRole: Role) => { success: boolean, message: string }
  cancelRoleTraining: (playerId: string) => void
  unlockSkill: (playerId: string, skillId: string, cost: number) => void
  unlockStaffTalent: (staffId: string, talentId: string) => void
  unlockPlayerTalent: (playerId: string, talentId: string) => void
  runTeamDrill: (drillId: string, gains: { stat: string; amount: number }[], cost: number) => { success: boolean, message: string }
  treatInjury: (playerId: string) => void
}

export interface MatchActions {
  scheduleScrim: (opponentId: string, week: number, day?: number) => { success: boolean, message: string }
  scheduleActivity: (activity: ActivitySaveData) => { success: boolean, message: string }
  updateScheduledMatch: (matchId: string, updates: Partial<MatchSaveData>) => void
  simulateInstantMatch: (matchId: string) => Promise<void>
  saveMatchResult: (matchId: string, result: MatchResult) => void
  performVODReview: (matchId: string) => void
  performMentalReset: (matchId?: string) => void
  setActiveMatch: (id: string | null) => void
  updateActiveMatchState: (state: ActiveMatchState) => void
  clearActiveMatchState: () => void
  updateCustomTactic: (id: keyof CustomTactics, side: "ct" | "t", strategy: TacticalStrategy) => void
}

export interface TournamentActions {
  registerForTournament: (tournamentId: string) => { success: boolean; message: string }
  checkTournamentEligibility: (tournamentId: string) => { eligible: boolean; reason: string }
  qualifyForTournament: (tournamentId: string, via: string) => void
  awardCircuitPoints: (teamId: string, tournamentId: string, placement: number) => void
}

export interface EventsActions {
  acknowledgeEvent: (eventId: string) => void
  markAllEventsAsRead: () => void
  resolveEventChoice: (eventId: string, choiceId: string) => void
  addNewsItem: (item: Omit<NewsFeedItem, "id" | "week">) => void
  acceptJobOffer: (eventId: string) => { success: boolean; message: string }
  declineJobOffer: (eventId: string) => void
  negotiateJobOffer: (eventId: string) => { success: boolean; message: string; newOffer?: number; withdrew?: boolean }
}

export interface ScoutingActions {
  startScoutingMission: (playerId: string) => void
  getScoutingLevel: (playerId: string) => string
  isPlayerScouted: (playerId: string) => boolean
  toggleWatchlistPlayer: (playerId: string) => void
  isPlayerWatchlisted: (playerId: string) => boolean
}

export interface AcademyActions {
  buildAcademy: (teamId: string) => { success: boolean; message: string }
  upgradeAcademy: (teamId: string) => { success: boolean; message: string }
  scoutProspect: (tier: ScoutingTier) => { success: boolean; player?: PlayerSaveData; message: string }
  enrollProspect: (playerId: string) => { success: boolean; message: string }
  setProspectTraining: (prospectId: string, focus: AcademyTrainingFocus) => void
  releaseProspect: (prospectId: string, sellFee?: number) => { success: boolean; message: string }
  promoteProspect: (prospectId: string, contract: { salaryPerWeek: number; lengthWeeks: number }) => { success: boolean; message: string }
  scheduleDevMatch: () => { success: boolean; message: string }
  processAcademyWeek: () => void
  updateAcademyRoster: (role: string, prospectId: string | null) => void
  updateAcademySchedule: (day: number, drillId: string | null) => void
  discardPendingProspect: (playerId: string) => void
  enrollPendingProspect: (playerId: string) => { success: boolean; message: string }
}

export interface UIActions {
  setTheme: (theme: "crystal" | "onyx") => void
  addToast: (toast: { message: string; type: "level_up" | "xp_gain" | "achievement" | "info" | "warning" | "error"; duration?: number }) => void
  removeToast: (id: string) => void
  clearCelebration: () => void
  clearPendingSeasonRecap: () => void
  selectLegend: (legendId: string) => void
  clearLegendPick: () => void
  setWeeklyActivity: (type: WeeklyActivityType) => void

  // Getters / Helpers
  getPlayerTeam: () => TeamSaveData | undefined
  getUpcomingMatches: (limit?: number) => MatchSaveData[]
  calculateTeamRating: () => number
  getDateForWeek: (week: number) => Date
}

export interface SettingsActions {
  completeOnboarding: () => void
  completeTutorial: () => void
  triggerTutorial: () => void
  setShowTutorialOnNewGame: (enabled: boolean) => void
  setSoundEnabled: (enabled: boolean) => void
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

export interface SponsorshipActions {
  refreshSponsorOffers: () => void
  declineSponsorOffer: (offerId: string) => void
}

export interface DebugActions {
  debugAddFunds: (amount: number) => void
  debugHealAll: () => void
  debugMaxMorale: () => void
  debugTriggerJobOffer: () => void
  debugFastForward: (weeks: number) => void
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
}

// ===== COMBINED STORE TYPE =====

export type GameStoreState =
  CoreGameState &
  EntitiesState &
  MatchState &
  TournamentState &
  EventsState &
  ScoutingState &
  AcademyState &
  SponsorshipState &
  UIState &
  SettingsState &
  IndexesState

export type GameStoreActions =
  CoreGameActions &
  EntitiesActions &
  MatchActions &
  TournamentActions &
  EventsActions &
  ScoutingActions &
  AcademyActions &
  SponsorshipActions &
  UIActions &
  SettingsActions &
  DebugActions

export type StoreState = GameStoreState & GameStoreActions

// Zustand slice creator type - each slice uses this signature
export type SliceCreator<T> = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => void)) => void,
  get: () => StoreState,
) => T
