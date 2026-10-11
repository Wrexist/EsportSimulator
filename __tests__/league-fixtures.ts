/** Synthetic worlds for the Phase 4.4 season, economy and board tests. */
import type { CompletedMatchSaveData, GameSave, TeamSaveData } from "@/engine/save-types"

/** A world of clubs per region (interleaved world ranking, five contracted players each). */
export function makeWorld(regions: Record<string, number>, playerTeam = "t_EU_20"): GameSave {
    const teams: TeamSaveData[] = []
    const players: GameSave["players"] = []
    const contracts: GameSave["contracts"] = []
    let rank = 0
    const queues = Object.entries(regions).map(([region, n]) => Array.from({ length: n }, (_, i) => ({ region, i })))
    while (queues.some(q => q.length)) for (const q of queues) {
        const next = q.shift()
        if (!next) continue
        rank++
        const id = `t_${next.region}_${next.i}`
        const rosterIds = [1, 2, 3, 4, 5].map(k => `${id}_p${k}`)
        for (const pid of rosterIds) {
            players.push({ id: pid, nickname: pid, name: pid, age: 22, role: "RIFLER", skill: 60, potential: 70, morale: 70, form: 60, fatigue: 0, energy: 100, matchesPlayed: 0 } as unknown as GameSave["players"][number])
            contracts.push({ playerId: pid, teamId: id, salaryPerWeek: 400, startWeek: 1, endWeek: 200, buyout: 0 } as GameSave["contracts"][number])
        }
        teams.push({
            id, name: `Team ${next.region} ${next.i}`, tier: "SEMI_PRO", region: next.region,
            rosterIds, staffIds: [], reputation: Math.max(5, Math.round(95 - rank / 2)), fanbase: 1000, chemistry: 70,
            facilitiesLevel: 1, trainingSlotsUsed: 0, maxTrainingSlots: 10, budget: 200_000, elo: 1600 - rank * 4, leagueTier: "B_TIER", worldRanking: rank,
            sponsors: [], facilities: [],
        } as unknown as TeamSaveData)
    }
    return {
        saveVersion: 8, saveId: "league_test", saveName: "t", createdAt: "", updatedAt: "",
        currentWeek: 1, currentDay: 0, timeMode: "WEEKLY", gameStartDate: "2026-01-05",
        playerTeamId: playerTeam,
        managerDetails: { name: "M", level: 5, xp: 0, reputation: 50, careerWins: 0, careerLosses: 0, championships: 0, tenureStartWeek: 1 },
        teams, players, contracts, tournaments: [], staff: [],
        scheduledMatches: [], completedMatches: [], scheduledActivities: [], marketStaff: [],
        financeLedger: [], eventsLog: [], newsFeed: [], acknowledgedEventIds: [], hallOfFame: [], lastRngSeed: 1,
        legendaryPlayers: [], weekTickState: null, scoutedPlayers: [], circuitPoints: [], tournamentQualifications: [], transferHistory: [],
        academyPlayers: [], academyMatchHistory: [], academyRoster: {}, academyTrainingSchedule: {}, academyWeeklyReports: [], academyScoutingMissions: [], academyPendingProspects: [],
    } as unknown as GameSave
}

/** Play every league fixture of `week` (home wins unless `awayWins` says otherwise). */
export function playLeagueWeek(save: GameSave, week: number, awayWins: (home: string, away: string) => boolean = () => false): void {
    const due = save.scheduledMatches.filter(m => m.week === week && m.tournamentId?.startsWith("league_"))
    for (const m of due) {
        const away = awayWins(m.homeTeamId, m.awayTeamId)
        const result = { winnerId: away ? m.awayTeamId : m.homeTeamId, homeScore: away ? 0 : 1, awayScore: away ? 1 : 0, maps: [{ homeScore: away ? 9 : 13, awayScore: away ? 13 : 9 }] }
        save.completedMatches.push({ ...m, result } as unknown as CompletedMatchSaveData)
    }
    const ids = new Set(due.map(m => m.id))
    save.scheduledMatches = save.scheduledMatches.filter(m => !ids.has(m.id))
}
