import fs from "node:fs"
import path from "node:path"
import { AtomicWeekProcessor } from "../engine/atomic-week-processor"
import { SaveManager } from "../engine/save-manager"
import { SeededRNG, generateSeed } from "../engine/rng"
import type { AsyncStorage } from "../engine/storage-adapter"
import type {
  ContractSaveData,
  GameSave,
  PlayerSaveData,
  TeamSaveData,
  WeekTickState,
} from "../engine/save-types"

class InMemoryStorage implements AsyncStorage {
  private data = new Map<string, string>()

  async getItem(key: string): Promise<string | null> {
    return this.data.has(key) ? this.data.get(key)! : null
  }

  async setItem(key: string, value: string): Promise<void> {
    this.data.set(key, value)
  }

  async removeItem(key: string): Promise<void> {
    this.data.delete(key)
  }

  async clear(): Promise<void> {
    this.data.clear()
  }

  async getAllKeys(): Promise<string[]> {
    return [...this.data.keys()]
  }

  getRaw(key: string): string | undefined {
    return this.data.get(key)
  }
}

class FaultInjectSaveManager extends SaveManager {
  private failStep: string
  private injected = false
  private currentStep: string | null = null

  constructor(storage: AsyncStorage, failStep: string) {
    super(storage)
    this.failStep = failStep
  }

  async markStepComplete(
    state: WeekTickState,
    step: keyof Omit<
      WeekTickState,
      | "weekNumber"
      | "saveId"
      | "startedAt"
      | "pendingMatchIds"
      | "completedMatchIds"
      | "generatedEventIds"
      | "errorMessage"
      | "failedStep"
    >
  ): Promise<void> {
    this.currentStep = step
    await super.markStepComplete(state, step)
  }

  async saveGame(save: GameSave): Promise<{ success: boolean; error?: string }> {
    if (!this.injected && this.currentStep === this.failStep) {
      this.injected = true
      throw new Error(`Injected crash after ${this.failStep}`)
    }
    return super.saveGame(save)
  }
}

function createPlayer(id: string, name: string, role: string, tier = "PRO"): PlayerSaveData {
  return {
    id,
    name,
    nickname: name,
    age: 18,
    nationality: "Sweden",
    portraitPath: "/player_placeholder.png",
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

  // Pre-schedule AI-only weekly matches for fuzz/invariant testing.
  for (let week = 1; week <= 520; week++) {
    save.scheduledMatches.push({
      id: `fuzz_match_${week}`,
      homeTeamId: teamAi1.id,
      awayTeamId: teamAi2.id,
      tournamentId: null,
      stage: "League",
      week,
      format: "BO1",
      seed: (generateSeed() + week) % 2147483646 || 1,
    })
  }

  return save
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"])
const TEXT_SIGNATURES = ["<!doctype html", "<html", "<?xml", "<svg", "<!DOCTYPE html"]
const LEGACY_CONTAMINATED_ALLOWLIST = new Set([
  "public/assets/teams/morningstar/players/expsasiki.png",
  "public/assets/teams/morningstar/players/rage.png",
  "public/assets/teams/morningstar/players/ruben.png",
  "public/assets/teams/chinggis_warriors/players/tikuak.png",
])
const BINARY_IMAGE_PREFIXES = [
  Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.from("GIF87a"),
  Buffer.from("GIF89a"),
  Buffer.from("RIFF"),
]

function isBinaryImage(buffer: Buffer): boolean {
  if (buffer.length < 4) return false
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") return true
  return BINARY_IMAGE_PREFIXES.some(prefix => buffer.subarray(0, prefix.length).equals(prefix))
}

function looksLikeHtmlOrXml(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 512).toString("utf8").trimStart()
  const lowered = head.toLowerCase()
  return TEXT_SIGNATURES.some(sig => lowered.startsWith(sig.toLowerCase()))
}

function testStaticImageIntegrity(): { scanned: number; contaminated: string[] } {
  const root = path.join(process.cwd(), "public", "assets")
  if (!fs.existsSync(root)) return { scanned: 0, contaminated: [] }

  const contaminated: string[] = []
  let scanned = 0
  const queue = [root]

  while (queue.length > 0) {
    const dir = queue.pop()!
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        queue.push(fullPath)
        continue
      }

      const ext = path.extname(entry.name).toLowerCase()
      if (!IMAGE_EXTENSIONS.has(ext)) continue

      scanned += 1
      const bytes = fs.readFileSync(fullPath)
      if (!isBinaryImage(bytes) && looksLikeHtmlOrXml(bytes)) {
        contaminated.push(path.relative(process.cwd(), fullPath))
      }
    }
  }

  const unexpected = contaminated.filter(file => !LEGACY_CONTAMINATED_ALLOWLIST.has(file))
  if (unexpected.length > 0) {
    throw new Error(
      `Found ${unexpected.length} unexpected contaminated image file(s): ${unexpected.slice(0, 10).join(", ")}${unexpected.length > 10 ? " ..." : ""}`
    )
  }

  if (contaminated.length > 0) {
    console.warn(
      `WARN: ${contaminated.length} known legacy contaminated file(s) detected. They must stay excluded from Steam builds until replaced with owned assets.`
    )
  }

  return { scanned, contaminated }
}

async function testSaveIntegrityTamperDetection(): Promise<void> {
  const storage = new InMemoryStorage()
  const manager = new SaveManager(storage)
  const save = createBaseSave(manager)
  const saveRes = await manager.saveGame(save)
  assert(saveRes.success, "Baseline save failed before tamper test")

  const key = `esports_save_${save.saveId}`
  const raw = storage.getRaw(key)
  assert(!!raw, "Tamper test failed: save not stored")
  const parsed = JSON.parse(raw!)
  parsed.teams[0].budget += 9_999_999
  // Do not update integrityHash to simulate save-edit exploit.
  await storage.setItem(key, JSON.stringify(parsed))

  const loaded = await manager.loadGame(save.saveId)
  assert(!loaded.save, "Tamper test failed: corrupted save was accepted")
  assert(
    (loaded.error || "").toLowerCase().includes("integrity"),
    `Tamper test failed: expected integrity error, got "${loaded.error}"`
  )
}

async function testCrashResumeByStep(): Promise<void> {
  const crashSteps: Array<keyof WeekTickState> = [
    "trainingComplete",
    "fatigueRecoveryComplete",
    "injuryChecksComplete",
    "financeComplete",
    "tournamentProcessingComplete",
    "matchSimulationComplete",
    "standingsUpdateComplete",
    "eventGenerationComplete",
    "worldLogicComplete",
    "restDayProcessingComplete",
  ]

  for (const step of crashSteps) {
    const storage = new InMemoryStorage()
    const manager = new FaultInjectSaveManager(storage, step)
    const processor = new AtomicWeekProcessor(manager)
    const save = createBaseSave(manager)

    const originalError = console.error
    console.error = () => {}
    const first = await processor.processWeek(
      save,
      { playerTeamId: save.playerTeamId, trainingFocus: new Map() },
      new SeededRNG(save.lastRngSeed)
    )
    console.error = originalError
    assert(!first.success, `Crash-resume test did not fail for step ${step}`)

    const tx = await manager.getIncompleteTransaction(save.saveId)
    assert(!!tx, `Crash-resume test missing incomplete tx for step ${step}`)

    const resumed = await processor.processWeek(
      save,
      { playerTeamId: save.playerTeamId, trainingFocus: new Map() },
      new SeededRNG(save.lastRngSeed)
    )
    assert(resumed.success, `Crash-resume failed to recover for step ${step}`)
    assert(save.currentWeek === 2, `Week incremented incorrectly for ${step}; got ${save.currentWeek}`)

    const postTx = await manager.getIncompleteTransaction(save.saveId)
    assert(!postTx, `Transaction state not cleared after resume for ${step}`)
  }
}

function assertFiniteState(save: GameSave): void {
  for (const team of save.teams) {
    assert(Number.isFinite(team.budget), `Non-finite team budget: ${team.id}`)
    assert(Number.isFinite(team.elo), `Non-finite team elo: ${team.id}`)
    assert(team.rosterIds.length >= 5, `Roster underflow: ${team.id} has ${team.rosterIds.length}`)
    assert(team.rosterIds.length <= 7, `Roster overflow: ${team.id} has ${team.rosterIds.length}`)
  }

  for (const player of save.players) {
    const numericChecks = [
      player.skill,
      player.awp,
      player.rifle,
      player.pistol,
      player.grenades,
      player.creativity,
      player.clutch,
      player.tactic,
      player.teamwork,
      player.morale,
      player.fatigue,
      player.energy,
      player.potential,
    ]
    assert(numericChecks.every(Number.isFinite), `Non-finite player numeric state: ${player.id}`)
  }

  const teamIds = new Set(save.teams.map(t => t.id))
  for (const match of save.scheduledMatches) {
    assert(teamIds.has(match.homeTeamId), `Orphan scheduled match home team: ${match.id}`)
    assert(teamIds.has(match.awayTeamId), `Orphan scheduled match away team: ${match.id}`)
  }
  for (const match of save.completedMatches) {
    assert(teamIds.has(match.homeTeamId), `Orphan completed match home team: ${match.id}`)
    assert(teamIds.has(match.awayTeamId), `Orphan completed match away team: ${match.id}`)
  }
}

async function testLongRunFuzz500Weeks(): Promise<{ weeks: number; ms: number }> {
  const storage = new InMemoryStorage()
  const manager = new SaveManager(storage)
  const processor = new AtomicWeekProcessor(manager)
  const save = createBaseSave(manager)
  const start = Date.now()

  const originalLog = console.log
  const originalWarn = console.warn
  // Keep output readable during long fuzz loop.
  console.log = () => {}
  console.warn = () => {}

  const fuzzWeeks = parseInt(process.env.CI_FUZZ_WEEKS || "500", 10)
  try {
    for (let i = 0; i < fuzzWeeks; i++) {
      const weekBefore = save.currentWeek
      const result = await processor.processWeek(
        save,
        { playerTeamId: save.playerTeamId, trainingFocus: new Map() },
        new SeededRNG(save.lastRngSeed)
      )
      assert(result.success, `Fuzz week ${i + 1} failed: ${result.error || "unknown"}`)
      assert(save.currentWeek === weekBefore + 1, `Week jump mismatch at iteration ${i + 1}`)
      assertFiniteState(save)
    }
  } finally {
    console.log = originalLog
    console.warn = originalWarn
  }

  return { weeks: fuzzWeeks, ms: Date.now() - start }
}

async function main(): Promise<void> {
  const started = Date.now()
  console.log("=== Steam Release Hardening Checks ===")

  console.log("[1/4] Save tamper integrity check...")
  await testSaveIntegrityTamperDetection()
  console.log("PASS: tamper detection rejects edited saves")

  console.log("[2/4] Crash-resume exact-once by transaction step...")
  await testCrashResumeByStep()
  console.log("PASS: all step crashes resume cleanly without double-week progression")

  console.log("[3/4] 500-week simulation fuzz...")
  const fuzz = await testLongRunFuzz500Weeks()
  console.log(`PASS: fuzz ${fuzz.weeks} weeks in ${fuzz.ms}ms`)

  console.log("[4/4] Static image integrity (anti-third-party contamination)...")
  const imageValidation = testStaticImageIntegrity()
  console.log(`PASS: validated ${imageValidation.scanned} image files in public/assets`)

  const totalMs = Date.now() - started
  console.log(`=== All hardening checks passed in ${totalMs}ms ===`)
}

main().catch((error) => {
  console.error("Release hardening checks failed:", error instanceof Error ? error.message : error)
  process.exitCode = 1
})
