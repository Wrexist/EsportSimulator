import { mkdir, writeFile } from "fs/promises"
import { SnapshotLoader } from "../data/snapshot-loader"
import { AtomicWeekProcessor } from "../engine/atomic-week-processor"
import { SaveManager } from "../engine/save-manager"
import { SeededRNG } from "../engine/rng"
import { TournamentManager } from "../engine/tournament-manager"
import { AIManager } from "../engine/ai-manager"
import type { AsyncStorage } from "../engine/storage-adapter"
import type { CompletedMatchSaveData, GameSave, TeamSaveData } from "../engine/save-types"

type InvariantCounts = {
  nonFiniteTeamBudget: number
  nonFiniteTeamElo: number
  rosterUnderflow: number
  rosterOverflow: number
  nonFinitePlayerValue: number
  orphanScheduledMatchTeam: number
  orphanCompletedMatchTeam: number
}

type SessionSummary = {
  session: number
  teamId: string
  teamName: string
  startTier: string
  startLeagueTier: string
  success: boolean
  error?: string
  weeksRequested: number
  weeksProcessed: number
  durationMs: number
  avgMsPerWeek: number
  startBudget: number
  endBudget: number
  minBudget: number
  maxBudget: number
  budgetDelta: number
  startElo: number
  endElo: number
  eloDelta: number
  startFollowers: number
  endFollowers: number
  followersDelta: number
  endLeagueTier: string
  winRate: number
  playerWins: number
  playerLosses: number
  playerMatches: number
  playerWentNegativeBudget: boolean
  playerSevereDebt: boolean
  peakWorldBankruptTeams: number
  avgWorldBankruptTeams: number
  finalWorldBankruptTeams: number
  eventsLogged: number
  newsEntries: number
  financeEntries: number
  transferEntries: number
  invariantCounts: InvariantCounts
}

type AggregateTierStats = {
  sessions: number
  avgBudgetDelta: number
  avgEloDelta: number
  avgWinRate: number
  negativeBudgetSessions: number
}

type AggregateReport = {
  generatedAt: string
  config: {
    sessions: number
    weeks: number
    startIndex: number
    endIndex: number
  }
  snapshot: {
    teams: number
    players: number
    tournaments: number
  }
  totals: {
    requestedSessions: number
    successfulSessions: number
    failedSessions: number
    totalWeeksProcessed: number
    totalDurationMs: number
    avgMsPerWeek: number
    totalPlayerMatches: number
    totalPlayerWins: number
    totalPlayerLosses: number
    playerNegativeBudgetSessions: number
    playerSevereDebtSessions: number
  }
  aggregateInvariants: InvariantCounts
  byStartTier: Record<string, AggregateTierStats>
  bestBudgetRuns: SessionSummary[]
  worstBudgetRuns: SessionSummary[]
  severeDebtRuns: SessionSummary[]
  failedRuns: SessionSummary[]
  sessions: SessionSummary[]
}

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
}

function createEmptyInvariantCounts(): InvariantCounts {
  return {
    nonFiniteTeamBudget: 0,
    nonFiniteTeamElo: 0,
    rosterUnderflow: 0,
    rosterOverflow: 0,
    nonFinitePlayerValue: 0,
    orphanScheduledMatchTeam: 0,
    orphanCompletedMatchTeam: 0,
  }
}

function mergeInvariantCounts(target: InvariantCounts, source: InvariantCounts): void {
  target.nonFiniteTeamBudget += source.nonFiniteTeamBudget
  target.nonFiniteTeamElo += source.nonFiniteTeamElo
  target.rosterUnderflow += source.rosterUnderflow
  target.rosterOverflow += source.rosterOverflow
  target.nonFinitePlayerValue += source.nonFinitePlayerValue
  target.orphanScheduledMatchTeam += source.orphanScheduledMatchTeam
  target.orphanCompletedMatchTeam += source.orphanCompletedMatchTeam
}

function parsePositiveIntArg(name: string, defaultValue: number): number {
  const prefix = `--${name}=`
  const arg = process.argv.find(value => value.startsWith(prefix))
  if (!arg) return defaultValue

  const value = Number.parseInt(arg.slice(prefix.length), 10)
  return Number.isFinite(value) && value > 0 ? value : defaultValue
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function pickStratifiedTeams(
  teams: readonly TeamSaveData[],
  sessions: number,
  startIndex: number,
  endIndex: number
): TeamSaveData[] {
  const sorted = [...teams].sort((a, b) => {
    const repDiff = (a.reputation || 0) - (b.reputation || 0)
    if (repDiff !== 0) return repDiff
    return a.id.localeCompare(b.id)
  })

  const safeStart = clamp(startIndex, 0, sorted.length - 1)
  const safeEnd = clamp(endIndex, safeStart + 1, sorted.length)
  const subset = sorted.slice(safeStart, safeEnd)

  if (sessions === 1) return [subset[Math.floor(subset.length / 2)]]

  const picks: TeamSaveData[] = []
  for (let i = 0; i < sessions; i++) {
    const ratio = i / (sessions - 1)
    const idx = Math.round(ratio * (subset.length - 1))
    picks.push(subset[idx])
  }
  return picks
}

function scanInvariants(save: GameSave): InvariantCounts {
  const counts = createEmptyInvariantCounts()
  const teamIds = new Set(save.teams.map(team => team.id))
  const playerNumericKeys = [
    "skill",
    "awp",
    "rifle",
    "pistol",
    "grenades",
    "creativity",
    "clutch",
    "tactic",
    "teamwork",
    "morale",
    "fatigue",
    "energy",
    "potential",
  ] as const

  for (const team of save.teams) {
    if (!Number.isFinite(team.budget)) counts.nonFiniteTeamBudget++
    if (!Number.isFinite(team.elo)) counts.nonFiniteTeamElo++
    if (team.rosterIds.length < 5) counts.rosterUnderflow++
    if (team.rosterIds.length > 7) counts.rosterOverflow++
  }

  for (const player of save.players) {
    for (const key of playerNumericKeys) {
      if (!Number.isFinite((player as any)[key])) {
        counts.nonFinitePlayerValue++
      }
    }
  }

  for (const match of save.scheduledMatches) {
    if (!teamIds.has(match.homeTeamId)) counts.orphanScheduledMatchTeam++
    if (!teamIds.has(match.awayTeamId)) counts.orphanScheduledMatchTeam++
  }

  for (const match of save.completedMatches) {
    if (!teamIds.has(match.homeTeamId)) counts.orphanCompletedMatchTeam++
    if (!teamIds.has(match.awayTeamId)) counts.orphanCompletedMatchTeam++
  }

  return counts
}

function countPlayerMatchRecord(matches: CompletedMatchSaveData[], playerTeamId: string): {
  wins: number
  losses: number
  played: number
} {
  let wins = 0
  let losses = 0

  for (const match of matches) {
    if (match.homeTeamId !== playerTeamId && match.awayTeamId !== playerTeamId) continue
    if (!match.result) continue

    const homeScore = match.result.homeScore
    const awayScore = match.result.awayScore
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue

    if (match.homeTeamId === playerTeamId) {
      if (homeScore > awayScore) wins++
      else if (awayScore > homeScore) losses++
    } else {
      if (awayScore > homeScore) wins++
      else if (homeScore > awayScore) losses++
    }
  }

  return { wins, losses, played: wins + losses }
}

function round(value: number, decimals = 2): number {
  const scale = 10 ** decimals
  return Math.round(value * scale) / scale
}

async function runSession(
  session: number,
  weeks: number,
  loader: SnapshotLoader,
  seedTeamId: string
): Promise<SessionSummary> {
  const storage = new InMemoryStorage()
  const manager = new SaveManager(storage)
  const processor = new AtomicWeekProcessor(manager)
  const save = loader.createCareerFromSnapshot(`SimSession_${session}`, seedTeamId, 1)

  if (!save) {
    return {
      session,
      teamId: seedTeamId,
      teamName: seedTeamId,
      startTier: "UNKNOWN",
      startLeagueTier: "UNKNOWN",
      success: false,
      error: "Failed to create save from snapshot",
      weeksRequested: weeks,
      weeksProcessed: 0,
      durationMs: 0,
      avgMsPerWeek: 0,
      startBudget: 0,
      endBudget: 0,
      minBudget: 0,
      maxBudget: 0,
      budgetDelta: 0,
      startElo: 0,
      endElo: 0,
      eloDelta: 0,
      startFollowers: 0,
      endFollowers: 0,
      followersDelta: 0,
      endLeagueTier: "UNKNOWN",
      winRate: 0,
      playerWins: 0,
      playerLosses: 0,
      playerMatches: 0,
      playerWentNegativeBudget: false,
      playerSevereDebt: false,
      peakWorldBankruptTeams: 0,
      avgWorldBankruptTeams: 0,
      finalWorldBankruptTeams: 0,
      eventsLogged: 0,
      newsEntries: 0,
      financeEntries: 0,
      transferEntries: 0,
      invariantCounts: createEmptyInvariantCounts(),
    }
  }

  // Mirror new-game bootstrapping so world ranking and AI fields are initialized.
  AIManager.initializeTeamData(save)

  const playerTeamId = save.playerTeamId
  const startTeam = save.teams.find(team => team.id === playerTeamId)
  if (!startTeam) {
    throw new Error(`Player team ${playerTeamId} not found in save`)
  }
  const startTier = startTeam.tier
  const startLeagueTier = startTeam.leagueTier
  const startBudget = startTeam.budget
  const startElo = startTeam.elo
  const startFollowers = startTeam.followers || 0

  const sessionInvariants = createEmptyInvariantCounts()
  let weeksProcessed = 0
  let error: string | undefined
  let minBudget = startBudget
  let maxBudget = startBudget
  let peakWorldBankruptTeams = 0
  let sumWorldBankruptTeams = 0
  const started = Date.now()

  const originalLog = console.log
  const originalWarn = console.warn
  console.log = () => {}
  console.warn = () => {}

  try {
    for (let i = 0; i < weeks; i++) {
      const weekRng = new SeededRNG(save.lastRngSeed)
      TournamentManager.simulateWeeklyRegistrationsV2(save, save.currentWeek, weekRng)
      const result = await processor.processWeek(
        save,
        { playerTeamId, trainingFocus: new Map() as any },
        weekRng
      )

      if (!result.success) {
        error = result.error || "Unknown week processing error"
        break
      }

      weeksProcessed++
      if (weeksProcessed % 5 === 0 || weeksProcessed === weeks) {
        process.stdout.write(`  session ${session}: week ${weeksProcessed}/${weeks}\n`)
      }

      const inv = scanInvariants(save)
      mergeInvariantCounts(sessionInvariants, inv)

      const playerTeam = save.teams.find(team => team.id === playerTeamId)
      if (playerTeam) {
        minBudget = Math.min(minBudget, playerTeam.budget)
        maxBudget = Math.max(maxBudget, playerTeam.budget)
      }

      let worldBankruptTeams = 0
      for (const team of save.teams) {
        if (team.budget < 0) worldBankruptTeams++
      }
      peakWorldBankruptTeams = Math.max(peakWorldBankruptTeams, worldBankruptTeams)
      sumWorldBankruptTeams += worldBankruptTeams
    }
  } finally {
    console.log = originalLog
    console.warn = originalWarn
  }

  const endTeam = save.teams.find(team => team.id === playerTeamId) || startTeam
  const matchRecord = countPlayerMatchRecord(save.completedMatches, playerTeamId)
  const avgWorldBankruptTeams = weeksProcessed > 0 ? sumWorldBankruptTeams / weeksProcessed : 0
  const finalWorldBankruptTeams = save.teams.filter(team => team.budget < 0).length
  const durationMs = Date.now() - started

  return {
    session,
    teamId: endTeam.id,
    teamName: endTeam.name,
    startTier,
    startLeagueTier,
    success: !error,
    error,
    weeksRequested: weeks,
    weeksProcessed,
    durationMs,
    avgMsPerWeek: weeksProcessed > 0 ? durationMs / weeksProcessed : 0,
    startBudget,
    endBudget: endTeam.budget,
    minBudget,
    maxBudget,
    budgetDelta: endTeam.budget - startBudget,
    startElo,
    endElo: endTeam.elo,
    eloDelta: endTeam.elo - startElo,
    startFollowers,
    endFollowers: endTeam.followers || 0,
    followersDelta: (endTeam.followers || 0) - startFollowers,
    endLeagueTier: endTeam.leagueTier,
    winRate: matchRecord.played > 0 ? matchRecord.wins / matchRecord.played : 0,
    playerWins: matchRecord.wins,
    playerLosses: matchRecord.losses,
    playerMatches: matchRecord.played,
    playerWentNegativeBudget: minBudget < 0,
    playerSevereDebt: minBudget < -500_000,
    peakWorldBankruptTeams,
    avgWorldBankruptTeams: round(avgWorldBankruptTeams, 2),
    finalWorldBankruptTeams,
    eventsLogged: save.eventsLog.length,
    newsEntries: save.newsFeed.length,
    financeEntries: save.financeLedger.length,
    transferEntries: save.transferHistory.length,
    invariantCounts: sessionInvariants,
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildTierSummary(sessions: SessionSummary[]): Record<string, AggregateTierStats> {
  const grouped = new Map<string, SessionSummary[]>()

  for (const session of sessions) {
    if (!grouped.has(session.startTier)) grouped.set(session.startTier, [])
    grouped.get(session.startTier)!.push(session)
  }

  const summary: Record<string, AggregateTierStats> = {}
  for (const [tier, items] of grouped.entries()) {
    summary[tier] = {
      sessions: items.length,
      avgBudgetDelta: round(average(items.map(item => item.budgetDelta)), 2),
      avgEloDelta: round(average(items.map(item => item.eloDelta)), 2),
      avgWinRate: round(average(items.map(item => item.winRate)), 3),
      negativeBudgetSessions: items.filter(item => item.playerWentNegativeBudget).length,
    }
  }

  return summary
}

async function main(): Promise<void> {
  const sessions = parsePositiveIntArg("sessions", 20)
  const weeks = parsePositiveIntArg("weeks", 30)
  const startIndex = parsePositiveIntArg("start", 0)
  const endIndex = parsePositiveIntArg("end", Number.MAX_SAFE_INTEGER)

  console.log(
    `Running session simulation audit: sessions=${sessions}, weeks=${weeks}, range=[${startIndex}, ${endIndex})`
  )

  const loader = new SnapshotLoader("public/data/snapshot")
  const loadResult = await loader.loadSnapshot()
  if (!loadResult.success) {
    throw new Error(loadResult.error || "Failed to load snapshot")
  }

  const snapshot = loader.getSnapshot()
  if (!snapshot) {
    throw new Error("Snapshot was not loaded")
  }

  const selectedTeams = pickStratifiedTeams(
    snapshot.teams as unknown as TeamSaveData[],
    sessions,
    startIndex,
    endIndex
  )
  const sessionSummaries: SessionSummary[] = []
  const aggregateInvariants = createEmptyInvariantCounts()
  const started = Date.now()

  for (let i = 0; i < selectedTeams.length; i++) {
    const team = selectedTeams[i]
    const summary = await runSession(i + 1, weeks, loader, team.id)
    sessionSummaries.push(summary)
    mergeInvariantCounts(aggregateInvariants, summary.invariantCounts)

    const status = summary.success ? "OK" : `FAIL (${summary.error || "unknown"})`
    console.log(
      `[${i + 1}/${selectedTeams.length}] ${team.name} (${team.tier}) -> ${status}, ` +
      `weeks=${summary.weeksProcessed}, budgetDelta=${summary.budgetDelta}, eloDelta=${summary.eloDelta}, ` +
      `winRate=${round(summary.winRate * 100, 1)}%`
    )

    if (typeof (globalThis as any).gc === "function") {
      ;(globalThis as any).gc()
    }
  }

  const successful = sessionSummaries.filter(session => session.success)
  const totalWeeksProcessed = sessionSummaries.reduce((sum, session) => sum + session.weeksProcessed, 0)
  const totalDurationMs = Date.now() - started
  const totalPlayerWins = sessionSummaries.reduce((sum, session) => sum + session.playerWins, 0)
  const totalPlayerLosses = sessionSummaries.reduce((sum, session) => sum + session.playerLosses, 0)
  const totalPlayerMatches = sessionSummaries.reduce((sum, session) => sum + session.playerMatches, 0)

  const report: AggregateReport = {
    generatedAt: new Date().toISOString(),
    config: { sessions, weeks, startIndex, endIndex },
    snapshot: {
      teams: snapshot.teams.length,
      players: snapshot.players.length,
      tournaments: snapshot.tournaments.length,
    },
    totals: {
      requestedSessions: sessions,
      successfulSessions: successful.length,
      failedSessions: sessionSummaries.length - successful.length,
      totalWeeksProcessed,
      totalDurationMs,
      avgMsPerWeek: totalWeeksProcessed > 0 ? round(totalDurationMs / totalWeeksProcessed, 2) : 0,
      totalPlayerMatches,
      totalPlayerWins,
      totalPlayerLosses,
      playerNegativeBudgetSessions: sessionSummaries.filter(session => session.playerWentNegativeBudget).length,
      playerSevereDebtSessions: sessionSummaries.filter(session => session.playerSevereDebt).length,
    },
    aggregateInvariants,
    byStartTier: buildTierSummary(successful),
    bestBudgetRuns: [...successful].sort((a, b) => b.budgetDelta - a.budgetDelta).slice(0, 5),
    worstBudgetRuns: [...successful].sort((a, b) => a.budgetDelta - b.budgetDelta).slice(0, 5),
    severeDebtRuns: successful.filter(session => session.playerSevereDebt),
    failedRuns: sessionSummaries.filter(session => !session.success),
    sessions: sessionSummaries,
  }

  await mkdir("docs", { recursive: true })
  await writeFile("docs/session-simulation-report.json", JSON.stringify(report, null, 2), "utf-8")

  console.log("")
  console.log("=== Aggregate Summary ===")
  console.log(`Successful sessions: ${report.totals.successfulSessions}/${report.totals.requestedSessions}`)
  console.log(`Total weeks processed: ${report.totals.totalWeeksProcessed}`)
  console.log(`Average ms/week: ${report.totals.avgMsPerWeek}`)
  console.log(`Player record: ${report.totals.totalPlayerWins}W-${report.totals.totalPlayerLosses}L (${report.totals.totalPlayerMatches} matches)`)
  console.log(`Negative budget sessions: ${report.totals.playerNegativeBudgetSessions}`)
  console.log(`Severe debt sessions (< -500k): ${report.totals.playerSevereDebtSessions}`)
  console.log(`Report written: docs/session-simulation-report.json`)
}

main().catch(error => {
  console.error("Session simulation audit failed:", error instanceof Error ? error.message : error)
  process.exitCode = 1
})
