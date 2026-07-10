/**
 * Regression coverage for tournament progression of FORFEITED matches and for
 * placement/pairing gaps in the Swiss & single-elim formats.
 *
 * Critical bug: a forfeited tournament match (team with <5 healthy players) is
 * recorded as a completed match by the week processor but is NOT routed through
 * TournamentManager.processMatchResult — it is later backfilled by
 * repairTournamentProgression, which used to send EVERY match through the
 * generic single-elim handler. For Swiss that never updated standings or
 * advanced rounds (soft-lock) and marked the loser eliminated on their first
 * loss; for double-elim it eliminated an opening-match loser instead of dropping
 * them to the lower bracket. The fix routes repaired matches to their
 * format-specific handler (routeRepairedProgression).
 *
 * Also covered:
 *  - single-elim (16-team) now places Round-of-16 losers at 9-16;
 *  - Swiss placements reward mid-table teams (wins<3 AND losses<3);
 *  - Swiss pairing avoids rematches when a rematch-free pairing exists.
 */

import { TournamentManager } from "@/engine/tournament-manager"
import { setupSwissStage, generateSwissRound } from "@/engine/tournament/swiss-handlers"
import { SeededRNG } from "@/engine/rng"
import type {
    GameSave,
    TournamentSaveData,
    BracketMatchSaveData,
    CompletedMatchSaveData,
    TournamentStandingSaveData,
} from "@/engine/save-types"

function standing(teamId: string, wins = 0, losses = 0): TournamentStandingSaveData {
    return {
        teamId, matchesPlayed: wins + losses, wins, losses,
        mapsWon: 0, mapsLost: 0, points: wins * 3, mapDiff: 0, roundDiff: 0,
    }
}

function makeSave(tournament: TournamentSaveData, teamIds: string[]): GameSave {
    return {
        saveVersion: 6, saveId: "t", saveName: "t",
        createdAt: "", updatedAt: "", currentWeek: 5, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: "", managerDetails: {} as any, lastRngSeed: 7, playerTeamId: "none",
        teams: teamIds.map((id, i) => ({
            id, name: id, rosterIds: [], staffIds: [], reputation: 50,
            elo: 1500 - i, worldRanking: i + 1,
            fanbase: 1000, followers: 1000, trophies: [], facilities: [], sponsors: [], budget: 100_000,
        })) as any,
        players: [], contracts: [], staff: [],
        tournaments: [tournament], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [], circuitPoints: [],
        tournamentQualifications: [], weekTickState: null,
    } as unknown as GameSave
}

function makeTournament(over: Partial<TournamentSaveData> = {}): TournamentSaveData {
    return {
        id: "t1", name: "Test", shortName: "T", tier: "S_TIER", region: "GLOBAL",
        teamIds: [], format: "swiss", currentStage: "Swiss Stage",
        standings: [], prizePool: 0, startWeek: 5, duration: 8, endWeek: 13,
        isCompleted: false, rewardsGranted: false, playoffBracket: [],
        ...over,
    } as unknown as TournamentSaveData
}

/** Record a forfeit result for a scheduled/bracket match without routing it. */
function forfeit(save: GameSave, m: BracketMatchSaveData, forfeiterId: string): void {
    const winnerId = m.homeTeamId === forfeiterId ? m.awayTeamId! : m.homeTeamId!
    const homeForfeits = m.homeTeamId === forfeiterId
    save.completedMatches.push({
        id: m.id, homeTeamId: m.homeTeamId!, awayTeamId: m.awayTeamId!, tournamentId: m.tournamentId,
        stage: m.stage, week: m.week, day: 5, format: m.format, seed: m.seed,
        result: {
            homeScore: homeForfeits ? 0 : 1, awayScore: homeForfeits ? 1 : 0,
            maps: [], playerStats: {}, winnerId, mvpPlayerId: "",
        },
    } as unknown as CompletedMatchSaveData)
    save.scheduledMatches = save.scheduledMatches.filter(sm => sm.id !== m.id)
}

describe("CRITICAL — forfeited Swiss matches flow through the Swiss handler", () => {
    test("repair updates Swiss standings, advances the round, and does not eliminate a first-loss team", () => {
        const teamIds = ["T1", "T2", "T3", "T4"]
        const t = makeTournament({ teamIds })
        const save = makeSave(t, teamIds)

        setupSwissStage(save, t, teamIds, new SeededRNG(123))

        // Round 1 = 2 matches in the 0-0 bucket. Forfeit BOTH (away team forfeits).
        const r1 = t.playoffBracket!.filter(m => m.id.includes("_swiss_r1_"))
        expect(r1.length).toBe(2)
        r1.forEach(m => forfeit(save, m, m.awayTeamId!))

        // Sanity: bracket matches are NOT yet marked complete (forfeit path skips routing).
        expect(r1.every(m => !m.isCompleted)).toBe(true)

        TournamentManager.repairTournamentProgression(save, "t1")

        // (a) Swiss standings were updated by handleSwissResult (generic handler
        //     would have left wins/losses at 0).
        const winners = r1.map(m => m.homeTeamId!)
        const losers = r1.map(m => m.awayTeamId!)
        for (const w of winners) {
            expect(t.standings.find(s => s.teamId === w)!.wins).toBe(1)
        }
        for (const l of losers) {
            const rec = t.standings.find(s => s.teamId === l)!
            expect(rec.losses).toBe(1)
            // (b) A single loss must NOT eliminate a Swiss team.
            const q = (save.tournamentQualifications ?? []).find(
                (x: any) => x.tournamentId === "t1" && x.teamId === l,
            )
            expect(q?.status).not.toBe("ELIMINATED")
        }

        // (c) No soft-lock: round 2 was generated (winners bucket + losers bucket).
        const r2 = t.playoffBracket!.filter(m => m.id.includes("_swiss_r2_"))
        expect(r2.length).toBeGreaterThan(0)
    })
})

describe("CRITICAL — forfeited double-elim opening match drops the loser to the lower bracket", () => {
    test("repair routes an opening forfeit to handleOpeningResult (not generic elimination)", () => {
        const teamIds = ["T1", "T2"]
        const groupId = "t1_Group_A"
        const opening: BracketMatchSaveData = {
            id: `${groupId}_opening_0`, tournamentId: "t1", stage: "Group A Opening",
            homeTeamId: "T1", awayTeamId: "T2", isCompleted: false, week: 5, format: "BO3",
            seed: 10, sourceMatchIds: [],
        }
        const upperSemi: BracketMatchSaveData = {
            id: `${groupId}_upper_semi_0`, tournamentId: "t1", stage: "Group A Upper Semi",
            isCompleted: false, week: 6, format: "BO3", seed: 11, sourceMatchIds: [],
        }
        const t = makeTournament({
            format: "double_elim", currentStage: "Group Stage", teamIds,
            playoffBracket: [opening, upperSemi],
        })
        const save = makeSave(t, teamIds)

        forfeit(save, opening, "T2") // T2 forfeits → T1 wins

        TournamentManager.repairTournamentProgression(save, "t1")

        // Winner advanced to the upper semi.
        const semi = t.playoffBracket!.find(m => m.id === `${groupId}_upper_semi_0`)!
        expect(semi.homeTeamId).toBe("T1")

        // Loser dropped to a freshly-created lower-bracket R1 slot — the generic
        // handler would never create a lower bracket, it would just eliminate T2.
        const lowerR1 = t.playoffBracket!.find(m => m.id === `${groupId}_lower_r1_0`)
        expect(lowerR1).toBeDefined()
        expect(lowerR1!.homeTeamId).toBe("T2")

        // And T2 must NOT be eliminated by the opening loss.
        const q = (save.tournamentQualifications ?? []).find(
            (x: any) => x.tournamentId === "t1" && x.teamId === "T2",
        )
        expect(q?.status).not.toBe("ELIMINATED")
    })
})

describe("HIGH — 16-team single-elim places Round-of-16 losers at 9-16", () => {
    test("every Round-of-16 loser gets a placement in 9..16, highest ELO first", () => {
        const bracket: BracketMatchSaveData[] = []
        // 8 Round-of-16 matches, distinct losers r16_L0..r16_L7.
        for (let i = 0; i < 8; i++) {
            bracket.push({
                id: `t1_r1_m${i + 1}`, tournamentId: "t1", stage: `Round of 16 Match ${i + 1}`,
                homeTeamId: `W${i}`, awayTeamId: `r16_L${i}`, isCompleted: true,
                winnerId: `W${i}`, loserId: `r16_L${i}`, week: 5, format: "BO3", seed: i, sourceMatchIds: [],
            })
        }
        // 4 QFs (5-8), 2 SFs (3-4), GF (1-2).
        for (let i = 0; i < 4; i++) {
            bracket.push({
                id: `t1_r2_m${i + 1}`, tournamentId: "t1", stage: `Quarter-final ${i + 1}`,
                homeTeamId: `W${i}`, awayTeamId: `W${i + 4}`, isCompleted: true,
                winnerId: `W${i}`, loserId: `W${i + 4}`, week: 6, format: "BO3", seed: 20 + i, sourceMatchIds: [],
            })
        }
        for (let i = 0; i < 2; i++) {
            bracket.push({
                id: `t1_r3_m${i + 1}`, tournamentId: "t1", stage: `Semi-final ${i + 1}`,
                homeTeamId: `W${i}`, awayTeamId: `W${i + 2}`, isCompleted: true,
                winnerId: `W${i}`, loserId: `W${i + 2}`, week: 7, format: "BO3", seed: 30 + i, sourceMatchIds: [],
            })
        }
        bracket.push({
            id: "t1_r4_m1", tournamentId: "t1", stage: "Grand Final",
            homeTeamId: "W0", awayTeamId: "W1", isCompleted: true,
            winnerId: "W0", loserId: "W1", week: 8, format: "BO5", seed: 40, sourceMatchIds: [],
        })

        const t = makeTournament({ format: "bracket", currentStage: "Playoffs", playoffBracket: bracket, standings: [] })
        // Give R16 losers distinct ELOs so the intra-block ordering is defined.
        const teamIds = [
            ...Array.from({ length: 8 }, (_, i) => `W${i}`),
            ...Array.from({ length: 8 }, (_, i) => `r16_L${i}`),
        ]
        const save = makeSave(t, teamIds)
        // r16_L0 strongest .. r16_L7 weakest.
        save.teams.forEach(tm => {
            const m = tm.id.match(/^r16_L(\d+)$/)
            if (m) (tm as any).elo = 2000 - parseInt(m[1], 10)
        })

        const placements = TournamentManager.calculatePlacements(save, t)

        // Positions 9..16 are exactly the eight Round-of-16 losers.
        const r16Positions = placements
            .filter(p => p.teamId.startsWith("r16_L"))
            .map(p => p.position)
            .sort((a, b) => a - b)
        expect(r16Positions).toEqual([9, 10, 11, 12, 13, 14, 15, 16])

        // Highest-ELO R16 loser is placed 9th.
        const ninth = placements.find(p => p.position === 9)!
        expect(ninth.teamId).toBe("r16_L0")
    })
})

describe("MEDIUM — Swiss mid-table teams get a placement/prize tier", () => {
    test("a team with losses<3 AND wins<3 is placed, not dropped", () => {
        const gf: BracketMatchSaveData = {
            id: "t1_grand_final", tournamentId: "t1", stage: "Grand Final",
            homeTeamId: "A", awayTeamId: "B", isCompleted: true, winnerId: "A", loserId: "B",
            week: 8, format: "BO5", seed: 1, sourceMatchIds: [],
        }
        const t = makeTournament({
            format: "swiss", currentStage: "Playoffs", playoffBracket: [gf],
            standings: [
                standing("A", 3, 1), standing("B", 3, 2),
                standing("M1", 2, 2),   // mid-table: never reached 3 losses
                standing("E1", 1, 3),   // 3-loss elimination
            ],
        })
        const save = makeSave(t, ["A", "B", "M1", "E1"])

        const placements = TournamentManager.calculatePlacements(save, t)

        // Bracket teams keep 1/2.
        expect(placements.find(p => p.teamId === "A")!.position).toBe(1)
        expect(placements.find(p => p.teamId === "B")!.position).toBe(2)

        // The mid-table team MUST receive a placement (pre-fix it got none).
        const m1 = placements.find(p => p.teamId === "M1")
        expect(m1).toBeDefined()
        // More wins → placed ahead of the 3-loss team.
        const e1 = placements.find(p => p.teamId === "E1")!
        expect(m1!.position).toBeLessThan(e1.position)
        // Every standings team is placed.
        expect(new Set(placements.map(p => p.teamId)).size).toBe(4)
    })
})

describe("MEDIUM — Swiss pairing avoids rematches when a rematch-free pairing exists", () => {
    test("a 4-team bucket where A-B and C-D already played never re-pairs them", () => {
        const teamIds = ["A", "B", "C", "D"]
        for (let seed = 1; seed <= 40; seed++) {
            const t = makeTournament({
                teamIds,
                standings: [standing("A", 1, 1), standing("B", 1, 1), standing("C", 1, 1), standing("D", 1, 1)],
            })
            const save = makeSave(t, teamIds)
            // Prior round-1 opponents: A-B and C-D.
            save.completedMatches.push(
                { id: "t1_swiss_r1_A_B", homeTeamId: "A", awayTeamId: "B", tournamentId: "t1",
                  result: { homeScore: 1, awayScore: 0, winnerId: "A", maps: [] } } as any,
                { id: "t1_swiss_r1_C_D", homeTeamId: "C", awayTeamId: "D", tournamentId: "t1",
                  result: { homeScore: 1, awayScore: 0, winnerId: "C", maps: [] } } as any,
            )

            generateSwissRound(save, t, 3, new SeededRNG(seed))

            const r3 = t.playoffBracket!.filter(m => m.id.includes("_swiss_r3_"))
            expect(r3.length).toBe(2)
            const pairs = r3.map(m => [m.homeTeamId, m.awayTeamId].sort().join(":"))
            expect(pairs).not.toContain("A:B")
            expect(pairs).not.toContain("C:D")
        }
    })
})
