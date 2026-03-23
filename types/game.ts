// Core game types for CS2 esports manager simulation

export type Game = "cs2"

export type Role = "awper" | "rifler" | "igl" | "support" | "entry"

export type InjuryType = "RSI" | "WRIST_FRACTURE" | "CARPAL_TUNNEL" | "EYE_STRAIN" | "BACK_PAIN" | "BURNOUT" | "FLU" | "BROKEN_FINGER" | "ANXIETY" | "MIGRAINE" | "FATIGUE" | "ILLNESS" | "OTHER"

export interface Injury {
  type: InjuryType
  name: string
  description: string
  severity: "MINOR" | "MODERATE" | "SEVERE" | "CRITICAL"
  weeksRemaining: number
  isRecovering: boolean
}

/** @deprecated Use PlayerSaveData from save-types.ts instead. All stats are 0-100 scale. */
export interface PlayerStats {
  // Technical stats (0-100)
  skill: number // 0-100 - Overall skill
  rifle: number // 0-100 - Rifle proficiency
  awp: number // 0-100 - AWP proficiency
  pistol: number // 0-100 - Pistol proficiency
  grenades: number // 0-100 - Utility usage
  creativity: number // 0-100 - Creative plays
  clutch: number // 0-100 - Clutch situations
  tactic: number // 0-100 - Tactical understanding

  // Mental stats (0-100)
  leader: number // 0-100 - Leadership ability
  teamwork: number // 0-100 - Team coordination
  morale: number // 0-100 - Current morale
  amicability: number // 0-100 - Team chemistry contribution
  productivity: number // 0-100 - Training efficiency
  stressResistance: number // 0-100 - Handles pressure
  loyalty: number // 0-100 - Team loyalty

  // Physical stats (0-100)
  reaction: number // 0-100 - Reaction time
  eyesight: number // 0-100 - Visual acuity
  health: number // 0-100 - Physical health
  strength: number // 0-100 - Endurance in long sessions
  endurance: number // 0-100 - Stamina over time
}

export interface Player {
  id: string
  firstName: string
  lastName: string
  nickname: string
  age: number
  nationality: string
  portrait?: string // Path to portrait image
  role: Role
  secondaryRole?: Role
  injury?: Injury
  stats: PlayerStats

  // Dynamic states
  energy: number // 0-100, Phase 55
  maxEnergy: number // Default 100
  form: number // 0-100 - Short-term performance
  fatigue: number // 0-100 - Current fatigue level
  morale: number // 0-100 - Current morale
  potential: number // 1-20 - Hidden growth potential
  peakAge: number // When player reaches peak (22-26 typically)

  // Contract & financial
  salary: number // Weekly salary
  contract: {
    yearsRemaining: number
    buyoutClause: number
  }

  // Match stats (career)
  careerStats: {
    matchesPlayed: number
    wins: number
    kills: number
    deaths: number
    assists: number
    rating: number
  }

  // Phase 17/18
  perks?: string[]
  roleMastery?: Record<string, number>
  availableSkillPoints?: number
  trainingFocus?: string // TrainingFocus enum key

  // Phase 23: Legendary System
  isRetired?: boolean
  retirementWeek?: number
  isLegendary?: boolean
  legendaryAchievements?: string[] // e.g., "Major Champion", "MVP x3", "1000+ Kills"
  careerTeams?: string[] // Teams played for during career
}

export interface EquipmentItem {
  id: string
  type: "MOUSE" | "KEYBOARD" | "MONITOR" | "HEADSET" | "CHAIR" | "PC"
  tier: 1 | 2 | 3
  name: string
  bonus: { stat: string; value: number }
  weeklyCost: number
  purchasedWeek: number
}

export interface Team {
  id: string
  name: string
  region: string
  tier: "top" | "mid" | "lower"
  elo: number // Phase 19
  leagueTier: string // Phase 19: S_TIER, A_TIER, etc.
  worldRanking?: number // Phase 19: 1-30
  roster: Player[]

  // Financial
  money: number
  weeklyIncome: number // From sponsors
  weeklyExpenses: number // Salaries + facilities

  // Phase 55: Training Limits
  trainingSlotsUsed: number
  maxTrainingSlots: number // Default 10

  // Facilities
  reputation: number // 1-100
  fanbase: number // Numeric fan count
  facilities: {
    trainingCenter: number // 1-10
    gamingHouse: number // 1-10
    analysisRoom: number // 1-10
  }

  // Equipment
  equipment: EquipmentItem[]

  // Staff
  staff: {
    coach?: Coach
    analyst?: Analyst
    psychologist?: Psychologist
  }

  // Phase 18: The Empire
  facilitiesList?: {
    id: string
    type: "TRAINING" | "RECOVERY" | "TACTICAL" | "FANZONE"
    level: number
    description: string
    monthlyCost: number
  }[]
  sponsors?: {
    id: string
    name: string
    tier: "STANDARD" | "PREMIUM" | "ELITE"
    weeklyPayout: number
    remainingWeeks: number
    requirements: string
    // Dynamic Goals (Phase 2)
    goals?: {
      id: string
      description: string // e.g., "Win next 2 matches"
      target: number
      current: number
      bonusPayout: number
      isCompleted: boolean
    }[]
  }[]
  merchHype?: number
  // Phase 24: Fan & Merch
  followers: number
  description?: string
  merchStoreLevel: number
  activeMerchItems: string[]

  // Phase 20: Tactical Perfection
  playstyle?: "balanced" | "aggressive" | "structured" | "default"
  tacticalPrep?: number // 0-100 bonus from VOD reviews
  economyStyle?: "standard" | "force" | "eco" // Phase 60: Economy aggressiveness
  targetPlayerId?: string // Phase 60: Antistratting - targeted enemy player
}

export interface Coach {
  id: string
  name: string
  age: number
  nationality: string
  level: number // 1-20
  specialization: "tactical" | "mental" | "individual"
  salary: number
  contract: {
    yearsRemaining: number
  }
  buffs: {
    tactic: number
    morale: number
  }
}

export interface Analyst {
  id: string
  name: string
  age: number
  nationality: string
  level: number // 1-20
  salary: number
  contract: {
    yearsRemaining: number
  }
  buffs: {
    mapVeto: number // Improves veto phase
  }
}

export interface Psychologist {
  id: string
  name: string
  age: number
  nationality: string
  level: number // 1-20
  salary: number
  contract: {
    yearsRemaining: number
  }
  buffs: {
    moraleStability: number // Reduces morale swings
    stressResistance: number
  }
}

export type CS2Map = "Dust2" | "Mirage" | "Inferno" | "Nuke" | "Overpass" | "Vertigo" | "Ancient"

export interface MapVeto {
  phase: "ban" | "pick" | "decider"
  team: string // team id
  map: CS2Map
}

export interface RoundResult {
  roundNumber: number
  winner: "ct" | "t"
  winType: "elimination" | "bomb" | "time" | "defuse"
  ctTeam: string // team id (switches sides)
  tTeam: string // team id
  kills: { playerId: string; kills: number }[]
  deaths?: { playerId: string; deaths: number }[]
}

export interface MapResult {
  map: CS2Map
  ctStartTeam: string // Which team started CT
  rounds: RoundResult[]
  finalScore: {
    team1: number
    team2: number
  }
  mvp: string // player id
}

export interface Match {
  id: string
  homeTeam: Team
  awayTeam: Team
  competition: string
  stage: string
  date: Date
  bestOf: 1 | 3 | 5
  seed: number // For deterministic replay
  veto?: MapVeto[]
  result?: MatchResult
  // Phase 20: Tactical Perfection
  isHighPressure?: boolean // Finals/Semi-finals
}

export interface MatchResult {
  homeScore: number // Maps won
  awayScore: number // Maps won
  maps: MapResult[]
  mvp: string // Overall match MVP
  playerStats: Record<string, PlayerMatchStats>
}

export interface PlayerMatchStats {
  kills: number
  deaths: number
  assists: number
  headshots: number
  adr: number // Average damage per round
  kast: number // Kill/Assist/Survive/Trade percentage
  rating: number // HLTV-style rating
  clutches: number // Clutch rounds won
}

export type TrainingFocus = "aim" | "tactics" | "teamplay" | "rest"

export interface TrainingSession {
  week: number
  focus: TrainingFocus
  intensity: number // 1-10
  results: {
    playerId: string
    statGains: Partial<PlayerStats>
    fatigueGain: number
    injuryRisk: number
  }[]
}

export interface Tournament {
  id: string
  name: string
  tier: "s" | "a" | "b" | "c" // S-tier = major, A = top tournament, etc
  prizePool: number
  teams: Team[]
  format: "bracket" | "league" | "swiss"
  currentStage: string
  startWeek?: number
  endWeek?: number
  bracket?: BracketMatch[]
  standings?: TeamStanding[]
}

export interface BracketMatch {
  id: string
  round: string // "quarterfinals", "semifinals", "final"
  team1?: Team
  team2?: Team
  winner?: Team
  match?: Match
}

export interface TeamStanding {
  team: Team
  played: number
  wins: number
  losses: number
  points: number
  mapDiff: number
}

export interface Message {
  id: string
  from: string // "Player: John Smith" or "Coach: Mike" or "Sponsor: Coca Cola"
  subject: string
  content: string
  date: Date
  read: boolean
  choices?: MessageChoice[]
  responded?: boolean
}

export interface MessageChoice {
  id: string
  text: string
  effects: {
    morale?: number // Change to player/team morale
    reputation?: number
    money?: number
    loyalty?: number // To specific player
  }
}

export interface GameEvent {
  id: string
  type: "player_unhappy" | "contract_expiring" | "win_streak" | "loss_streak" | "injury" | "sponsor_offer"
  triggeredAt: Date
  data: any
  message?: Message
}

export interface GameState {
  // Core state
  currentDate: Date
  currentWeek: number
  playerTeam: Team
  allTeams: Team[]

  // Competitions
  tournaments: Tournament[]
  schedule: Match[]
  completedMatches: Match[]

  // Training
  currentTraining?: TrainingSession
  trainingHistory: TrainingSession[]

  // Messages & events
  inbox: Message[]
  events: GameEvent[]
  news: NewsItem[]

  // Scouting
  scoutingBudget: number
  scoutedPlayers: Player[] // Available for transfer

  // Available equipment for purchase
  availableEquipment: EquipmentItem[]

  // Settings
  settings: GameSettings
}

export interface NewsItem {
  id: string
  date: Date
  title: string
  content: string
  category: "transfer" | "result" | "tournament" | "injury" | "contract"
}

export interface GameSettings {
  difficulty: "easy" | "medium" | "hard"
  autoSave: boolean
  simulationSpeed: "slow" | "normal" | "fast"
  soundEnabled: boolean
}

export interface SaveData {
  version: string
  saveDate: Date
  gameState: GameState
}

export interface DataSource {
  type: "players" | "teams" | "portraits"
  source: string
  license: string
  modified: boolean
  attribution: string
}

export interface LivePlayerState {
  id: string
  name: string
  kills: number
  deaths: number
  assists: number
  headshots: number
  money: number
  isDead: boolean
  weapon: string
  hasArmor: boolean
  hasHelmet: boolean
  hasKit: boolean
}

export interface LiveGameState {
  round: number
  homeScore: number
  awayScore: number
  homeSeriesScore: number
  awaySeriesScore: number
  status: "NOT_STARTED" | "IN_PROGRESS" | "FINISHED"
  time: number
  isPaused: boolean
  currentMapIndex: number
}

export interface SimState {
  homeEconomy: Record<string, any>
  awayEconomy: Record<string, any>
  homeWinStreak: number
  awayWinStreak: number
  homeLossStreak: number
  awayLossStreak: number
  homeRounds: number
  awayRounds: number
  currentMapIndex: number
  currentRound: number
  homeSeriesScore: number
  awaySeriesScore: number
  isOvertime: boolean
  currentOTSet: number
  homeStartsCT: boolean
  homeMomentumScore: number
  awayMomentumScore: number
}

export interface LogEntry {
  type: "KILL" | "PLANT" | "DEFUSE" | "EXPLODE" | "ROUND_END" | "BUY" | "SYSTEM" | "SAVE" | "CLUTCH"
  time?: number
  message: string
  // Kill-specific data
  killerName?: string
  killerImage?: string
  killerSide?: "CT" | "T"
  victimName?: string
  victimImage?: string
  assisterName?: string
  assisterImage?: string
  weapon?: string
  isHeadshot?: boolean
  isUtility?: boolean
  isTrade?: boolean
  isFlashAssist?: boolean
  reward?: number
  playerId?: string // For clutch
  details?: string // For save/clutch
}

export interface ActiveMatchState {
  matchId: string
  gameState: LiveGameState
  simState: SimState
  homeRoster: LivePlayerState[]
  awayRoster: LivePlayerState[]
  logs: LogEntry[]
  roundTime: number
  isBombPlanted: boolean
  bombTime: number
  isWaitingForStrategy: boolean
  originalHomePlayers: any[]
  originalAwayPlayers: any[]
  matchResult: MatchResult
}
