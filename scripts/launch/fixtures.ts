import { SaveManager } from "../../engine/save-manager"
import { SeededRNG } from "../../engine/rng"
import type { AsyncStorage } from "../../engine/storage-adapter"
import type { GameSave, PlayerSaveData, TeamSaveData, ContractSaveData } from "../../engine/save-types"

// Explicit memory-only storage: generating fixtures never touches application storage.
export class FixtureStorage implements AsyncStorage {
  readonly data = new Map<string, string>()
  failWrite: ((key: string) => boolean) | null = null
  async getItem(key: string) { return this.data.get(key) ?? null }
  async setItem(key: string, value: string) {
    if (this.failWrite?.(key)) throw new Error(`Injected QA write failure: ${key}`)
    this.data.set(key, value)
  }
  async removeItem(key: string) { this.data.delete(key) }
  async clear() { this.data.clear() }
  async getAllKeys() { return [...this.data.keys()] }
}
export const SCENARIOS = ["first-week", "weak-club", "strong-club", "cash-crisis", "roster-shortage", "season-boundary", "late-career"] as const
export type Scenario = typeof SCENARIOS[number]
export const EXPECTATIONS: Record<Scenario, string[]> = {
  "first-week": ["Five contracted starters and an affordable free agent", "Recruit, assign training, prepare the scheduled match, advance and reload"],
  "weak-club": ["Lower player ratings and limited cash", "Compare affordable recruitment with training and observe the cost"],
  "strong-club": ["High player ratings and larger budget", "Win probability remains bounded; strong teams can lose"],
  "cash-crisis": ["Cash is below one week of player wages", "Financial warning and consequences must agree with the ledger"],
  "roster-shortage": ["Only four contracted starters", "Signing a free agent resolves the shortage; match handling is explicit"],
  "season-boundary": ["Starts at week 52", "Advance to 53; season review and rewards occur at most once after reload"],
  "late-career": ["Starts at week 521 with 520 synthetic history records", "Inspect history and save/reload; this is not a simulated ten-season balance result"],
}
function createPlayer(id: string, name: string, role: string, tier = "PRO"): PlayerSaveData {
  return {
    id,
    name,
    nickname: name,
    age: 18,
    nationality: "Sweden",
    portraitPath: "/player_placeholder.webp",
    role,
    tier,
    energy: 100,
    maxEnergy: 100,
    skill: 65,
    awp: 62,
    rifle: 66,
    pistol: 64,
    grenades: 60,
    creativity: 61,
    clutch: 63,
    tactic: 62,
    leader: 55,
    teamwork: 64,
    morale: 70,
    amicability: 60,
    productivity: 60,
    stressResistance: 60,
    loyalty: 60,
    reaction: 62,
    eyesight: 63,
    health: 78,
    strength: 57,
    endurance: 62,
    form: 65,
    fatigue: 10,
    potential: 80,
    matchesPlayed: 0,
    roundsPlayed: 0,
    avgRating: 1,
    clutchSuccessRate: 0.2,
    level: 1,
    xp: 0,
    xpToNextLevel: 1000,
    talentPoints: 0,
    unlockedTalentIds: [],
  }
}

function createTeam(id: string, name: string, rosterIds: string[], budget = 200_000): TeamSaveData {
  return {
    id,
    name,
    tier: "A_TIER",
    region: "EU",
    rosterIds,
    staffIds: [],
    reputation: 55,
    fanbase: 25_000,
    chemistry: 60,
    facilitiesLevel: 1,
    trainingSlotsUsed: 0,
    maxTrainingSlots: 10,
    budget,
    elo: 1500,
    leagueTier: "A_TIER",
    recentForm: [],
    facilities: [],
    sponsors: [],
    merchHype: 10,
    followers: 25_000,
  }
}

function createBaseSave(manager: SaveManager): GameSave {
  const p1 = ["p_a1", "p_a2", "p_a3", "p_a4", "p_a5"].map((id, i) =>
    createPlayer(id, `PlayerA${i + 1}`, i === 0 ? "AWPER" : "RIFLER")
  )
  const p2 = ["p_b1", "p_b2", "p_b3", "p_b4", "p_b5"].map((id, i) =>
    createPlayer(id, `PlayerB${i + 1}`, i === 0 ? "AWPER" : "RIFLER")
  )
  const p3 = ["p_c1", "p_c2", "p_c3", "p_c4", "p_c5"].map((id, i) =>
    createPlayer(id, `PlayerC${i + 1}`, i === 0 ? "AWPER" : "RIFLER")
  )
  const players = [...p1, ...p2, ...p3]

  const teamPlayer = createTeam("team_player", "Player Team", p1.map(p => p.id))
  const teamAi1 = createTeam("team_ai_1", "AI Team 1", p2.map(p => p.id))
  const teamAi2 = createTeam("team_ai_2", "AI Team 2", p3.map(p => p.id))
  const teams = [teamPlayer, teamAi1, teamAi2]

  const contracts: ContractSaveData[] = players.map((player, idx) => {
    const teamId = idx < 5 ? teamPlayer.id : idx < 10 ? teamAi1.id : teamAi2.id
    return {
      playerId: player.id,
      teamId,
      salaryPerWeek: 2500,
      startWeek: 1,
      endWeek: 5000,
      buyout: 150_000,
    }
  })

  const save = manager.createSave("ReleaseHardening", {
    currentWeek: 1,
    playerTeamId: teamPlayer.id,
    gameStartDate: new Date("2025-01-01").toISOString(),
    teams,
    players,
    contracts,
    tournaments: [],
    staff: [],
    scheduledMatches: [],
    completedMatches: [],
    scheduledActivities: [],
    financeLedger: [],
    eventsLog: [],
    acknowledgedEventIds: [],
    transferHistory: [],
    scoutedPlayers: [],
    circuitPoints: [],
    tournamentQualifications: [],
    newsFeed: [],
    marketStaff: [],
    academyPlayers: [],
    academyMatchHistory: [],
    academyRoster: { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null },
    academyTrainingSchedule: {},
    academyWeeklyReports: [],
    academyScoutingMissions: [],
    academyPendingProspects: [],
    managerDetails: {
      name: "Release QA",
      level: 1,
      xp: 0,
      reputation: 100,
      careerWins: 0,
      careerLosses: 0,
      championships: 0,
    },
  })

  return save
}

export function createLaunchFixture(scenario: Scenario, seed = 3402): GameSave {
  if (!SCENARIOS.includes(scenario) || !Number.isSafeInteger(seed) || seed <= 0 || seed >= 2147483647) throw new Error("Invalid fixture scenario or seed")
  const save = createBaseSave(new SaveManager(new FixtureStorage()))
  const rng = new SeededRNG(seed)
  save.saveId = `qa_${scenario}_${seed}`
  save.saveName = `QA ${scenario} (synthetic)`
  save.createdAt = save.updatedAt = save.gameStartDate = "2025-01-01T00:00:00.000Z"
  save.lastRngSeed = seed
  save.hallOfFame = []
  const team = save.teams[0]
  team.name = "QA Aurora"
  const strength = scenario === "weak-club" ? 40 : scenario === "strong-club" ? 88 : 65
  save.players.slice(0, 5).forEach(p => {
    const rating = strength + Math.floor(rng.next() * 5)
    p.skill = p.rifle = p.awp = p.pistol = p.tactic = rating
  })
  save.players.push(createPlayer("qa_free_agent", "QA Free Agent", "RIFLER"))
  if (scenario === "weak-club") team.budget = 40000
  if (scenario === "strong-club") team.budget = 2000000
  if (scenario === "cash-crisis") team.budget = 1000
  if (scenario === "roster-shortage") {
    const removed = team.rosterIds.pop()
    save.contracts = save.contracts.filter(c => c.playerId !== removed)
  }
  if (scenario === "season-boundary") save.currentWeek = 52
  if (scenario === "late-career") {
    save.currentWeek = 521
    // Deliberately synthetic history; not evidence of a balanced ten-season simulation.
    save.eventsLog = Array.from({length: 520}, (_, i) => ({
      id: `qa_history_${i}`, week: i + 1, type: "INFO", data: { title: "Synthetic QA history", description: "Generated for persistence and history UI coverage" }, acknowledged: true,
    }))
  }
  save.scheduledMatches = [{id: `qa_match_${scenario}`, homeTeamId: team.id, awayTeamId: save.teams[1].id,
    tournamentId: null, stage: "Friendly", week: save.currentWeek, format: "BO1", seed}]
  return save
}
