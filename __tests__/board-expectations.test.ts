import {
    getBoardSanctionedFee,
    deriveExpectationTier,
    leagueObjective,
    processWeeklyBoard,
    weeklyBoardMoves,
    evaluateOutcome,
    confidenceDelta,
    ensureBoardState,
    processSeasonBoardReview,
    trophiesInSeason,
} from "@/engine/board-expectations"
import type { GameSave, BoardState } from "@/engine/save-types"
import { divisionOfTeam, drawDueLeagueSplit, processLeagueWeek } from "@/engine/season/regional-league"
import { JobOfferGenerator } from "@/engine/job-offer-generator"
import { SeededRNG } from "@/engine/rng"
import { BOARD_TUNING, LEAGUE_TUNING } from "@/lib/balance-tuning"
import { makeWorld, playLeagueWeek } from "./league-fixtures"

function makeSave(over: Partial<GameSave> = {}, boardState?: Partial<BoardState>): GameSave {
    const team = {
        id: "player", name: "My Club", reputation: 50, worldRanking: 12, budget: 1_000_000,
        trophies: [] as { tournamentId: string; tournamentName: string; week: number }[],
    }
    return {
        saveVersion: 6, saveId: "t", saveName: "t",
        currentWeek: 52, currentDay: 1, timeMode: "WEEKLY",
        playerTeamId: "player",
        managerDetails: { name: "C", level: 1, xp: 0, reputation: 50, careerWins: 0, careerLosses: 0, championships: 0 },
        teams: [team],
        players: [], contracts: [], staff: [], tournaments: [],
        scheduledMatches: [], completedMatches: [], scheduledActivities: [],
        financeLedger: [], eventsLog: [], newsFeed: [], acknowledgedEventIds: [],
        hallOfFame: [], legendaryPlayers: [], weekTickState: null,
        boardState: boardState ? { teamId: "player", confidence: 60, seasonExpectation: "COMPETE", expectationSetSeason: 1, lastReviewedSeason: 0, onNotice: false, ...boardState } : undefined,
        ...over,
    } as unknown as GameSave
}

describe("deriveExpectationTier", () => {
    test("maps stature to tiers (uses the more demanding signal)", () => {
        expect(deriveExpectationTier(2, 50)).toBe("WIN")
        expect(deriveExpectationTier(8, 50)).toBe("CONTEND")
        expect(deriveExpectationTier(15, 50)).toBe("COMPETE")
        expect(deriveExpectationTier(28, 30)).toBe("SURVIVE")
        // reputation can lift the tier even with a poor ranking
        expect(deriveExpectationTier(25, 82)).toBe("WIN")
    })
})

describe("evaluateOutcome", () => {
    test("forgiving bands around each tier target", () => {
        // COMPETE target: rank<=14, 0 trophies
        expect(evaluateOutcome("COMPETE", 14, 0)).toBe("MET")
        expect(evaluateOutcome("COMPETE", 10, 0)).toBe("EXCEEDED") // 3+ better than target
        expect(evaluateOutcome("COMPETE", 14, 1)).toBe("EXCEEDED") // a trophy over-delivers
        expect(evaluateOutcome("COMPETE", 18, 0)).toBe("MISSED")   // within +5
        expect(evaluateOutcome("COMPETE", 25, 0)).toBe("FAILED")   // well short
    })
    test("WIN tier demands a trophy to merely MEET", () => {
        expect(evaluateOutcome("WIN", 3, 1)).toBe("MET")
        expect(evaluateOutcome("WIN", 3, 0)).toBe("MISSED") // top-3 but no silverware
    })
})

describe("confidenceDelta", () => {
    test("rewards success, punishes failure", () => {
        expect(confidenceDelta("EXCEEDED")).toBeGreaterThan(0)
        expect(confidenceDelta("MET")).toBeGreaterThan(0)
        expect(confidenceDelta("MISSED")).toBeLessThan(0)
        expect(confidenceDelta("FAILED")).toBeLessThan(confidenceDelta("MISSED"))
    })
})

describe("ensureBoardState", () => {
    test("initializes a fresh board at a comfortable confidence", () => {
        const save = makeSave()
        const b = ensureBoardState(save)
        expect(b.confidence).toBe(60)
        expect(b.teamId).toBe("player")
        expect(b.onNotice).toBe(false)
        expect(save.boardState).toBe(b)
    })
    test("resets when the manager has moved clubs (teamId mismatch)", () => {
        const save = makeSave({ playerTeamId: "player" }, { teamId: "old_club", confidence: 12, onNotice: true })
        const b = ensureBoardState(save)
        expect(b.teamId).toBe("player")
        expect(b.confidence).toBe(60) // fresh board, not the old 12
        expect(b.onNotice).toBe(false)
    })
})

describe("trophiesInSeason", () => {
    test("counts only trophies within the season window", () => {
        const save = makeSave()
        save.teams[0].trophies = [
            { tournamentId: "a", tournamentName: "A", week: 10 },  // season 1
            { tournamentId: "b", tournamentName: "B", week: 50 },  // season 1
            { tournamentId: "c", tournamentName: "C", week: 80 },  // season 2
        ] as never
        expect(trophiesInSeason(save, 1)).toBe(2)
        expect(trophiesInSeason(save, 2)).toBe(1)
    })
})

describe("processSeasonBoardReview", () => {
    test("a met season raises confidence and posts a positive review (no sack)", () => {
        const save = makeSave({ currentWeek: 52 }, { confidence: 60, seasonExpectation: "COMPETE", expectationSetSeason: 1, lastReviewedSeason: 0 })
        save.teams[0].worldRanking = 12 // <= 14 target → MET
        const res = processSeasonBoardReview(save)
        expect(res.reviewed).toBe(true)
        expect(res.outcome).toBe("MET")
        expect(res.confidence).toBe(70)
        expect(res.sacked).toBeFalsy()
        expect(save.boardState!.lastReviewedSeason).toBe(1)
        expect(save.boardState!.expectationSetSeason).toBe(2) // next season set
        expect(res.newsTitle).toContain("satisfied")
    })

    test("a single failure from a healthy board does NOT sack (grace)", () => {
        const save = makeSave({ currentWeek: 52 }, { confidence: 60, seasonExpectation: "WIN", expectationSetSeason: 1, lastReviewedSeason: 0, onNotice: false })
        save.teams[0].worldRanking = 20 // WIN target rank 3 → FAILED
        const res = processSeasonBoardReview(save)
        expect(res.outcome).toBe("FAILED")
        expect(res.confidence).toBe(32) // 60 - 28
        expect(res.sacked).toBeFalsy()
        expect(save.gameOverReason).toBeUndefined()
    })

    test("sacks the manager when already on notice and the meter bottoms out", () => {
        const save = makeSave({ currentWeek: 104 }, { confidence: 20, seasonExpectation: "WIN", expectationSetSeason: 2, lastReviewedSeason: 1, onNotice: true })
        save.teams[0].worldRanking = 25 // FAILED again (-28 → 0)
        const res = processSeasonBoardReview(save)
        expect(res.outcome).toBe("FAILED")
        expect(res.confidence).toBe(0)
        expect(res.sacked).toBe(true)
        expect(save.gameOverReason).toBe("SACKED")
        expect(save.gameOverWeek).toBe(104)
        expect(res.newsTitle).toContain("Sacked")
    })

    test("over-delivering credits a capped board-backing bonus + ledger entry", () => {
        const save = makeSave({ currentWeek: 52 }, { confidence: 50, seasonExpectation: "COMPETE", expectationSetSeason: 1, lastReviewedSeason: 0 })
        save.teams[0].worldRanking = 5 // beats COMPETE target by >3 → EXCEEDED
        const budgetBefore = save.teams[0].budget
        const res = processSeasonBoardReview(save)
        expect(res.outcome).toBe("EXCEEDED")
        expect(res.rewardBudget).toBeGreaterThan(0)
        expect(save.teams[0].budget).toBe(budgetBefore + res.rewardBudget!)
        expect(save.financeLedger.some(e => e.description.includes("Board backing"))).toBe(true)
        // manager reputation climbs
        expect(save.managerDetails.reputation).toBeGreaterThan(50)
    })

    test("is idempotent within a season (no double-counting)", () => {
        const save = makeSave({ currentWeek: 52 }, { confidence: 60, seasonExpectation: "COMPETE", expectationSetSeason: 1, lastReviewedSeason: 0 })
        save.teams[0].worldRanking = 12
        const first = processSeasonBoardReview(save)
        expect(first.reviewed).toBe(true)
        const second = processSeasonBoardReview(save)
        expect(second.reviewed).toBe(false)
        expect(save.boardState!.confidence).toBe(70) // unchanged by the 2nd call
    })
})

describe("getBoardSanctionedFee — board war-chest", () => {
    const board = (confidence: number, onNotice = false) => ({
        teamId: "player", confidence, seasonExpectation: "COMPETE",
        expectationSetSeason: 1, lastReviewedSeason: 0, onNotice,
    }) as unknown as BoardState

    test("tiers: full backing >=70, 80% at 40-69, 60% at 25-39, 40% below/on-notice", () => {
        expect(getBoardSanctionedFee(board(85), 100_000).maxFee).toBe(100_000)
        expect(getBoardSanctionedFee(board(60), 100_000).maxFee).toBe(80_000)
        expect(getBoardSanctionedFee(board(30), 100_000).maxFee).toBe(60_000)
        expect(getBoardSanctionedFee(board(10), 100_000).maxFee).toBe(40_000)
        expect(getBoardSanctionedFee(board(80, true), 100_000).maxFee).toBe(40_000) // on notice overrides
    })

    test("missing board state never blocks (fresh saves pre-tick)", () => {
        expect(getBoardSanctionedFee(undefined, 100_000)).toEqual({ maxFee: 100_000, fraction: 1 })
    })
})

describe("weekly board (Phase 4.4): objectives, moves with causes, reviews, warnings, dismissal", () => {
    const league = (week: number) => {
        const save = makeWorld({ EU: 30 }, "t_EU_14")
        save.currentWeek = week
        drawDueLeagueSplit(save)
        return save
    }

    test("objectives scale with the club: league finish in its division, world ranking, budget discipline", () => {
        const save = league(1)
        const board = ensureBoardState(save)
        expect(board.objectives!.map(o => o.id)).toEqual(["league", "ranking", "finance"])
        const lo = board.objectives![0]
        const division = divisionOfTeam(save, save.playerTeamId)!
        expect(lo.divisionId).toBe(division.id)
        expect(lo.target).toBeGreaterThanOrEqual(1)
        expect(lo.target).toBeLessThanOrEqual(division.teamIds.length)
        expect(lo.label).toContain(division.name)
        // Finance: keep at least half the opening cash (or 8 weeks of costs).
        const fo = board.objectives!.find(o => o.id === "finance")!
        expect(fo.target).toBeLessThanOrEqual(save.teams.find(t => t.id === save.playerTeamId)!.budget)
        expect(fo.target).toBeGreaterThan(0)
        // A strong club in a lower division is asked to go up; a weak one to stay up.
        const strong = leagueObjective(save, division.teamIds[0])!
        const weak = leagueObjective(save, division.teamIds.at(-1)!)!
        expect(strong.target).toBeLessThan(weak.target)
    })

    test("each weekly move names its cause: results by opponent strength, the table vs the objective, finances", () => {
        const save = league(1)
        const board = ensureBoardState(save)
        const me = save.teams.find(t => t.id === save.playerTeamId)!
        const weaker = save.teams.find(t => t.id !== me.id)!
        weaker.elo = (me.elo ?? 1000) - 2 * BOARD_TUNING.UPSET_ELO_GAP
        save.currentWeek = 5
        save.completedMatches.push({ id: "m1", homeTeamId: me.id, awayTeamId: weaker.id, tournamentId: "league_x", stage: null, week: 4, format: "BO1", seed: 1,
            result: { winnerId: weaker.id, homeScore: 0, awayScore: 1, maps: [] } } as never)
        me.financialState = "RISK"; me.runwayWeeks = 4
        const moves = weeklyBoardMoves(save, board, 4)
        expect(moves).toContainEqual({ week: 5, delta: BOARD_TUNING.EXPECTED_LOSS, cause: `Lost to ${weaker.name}` })
        expect(moves).toContainEqual({ week: 5, delta: BOARD_TUNING.FINANCE_RISK, cause: "Finances at risk: 4 weeks of runway" })
        const before = board.confidence
        const out = processWeeklyBoard(save)
        expect(out.moves.length).toBeGreaterThan(0)
        expect(board.confidence).toBeCloseTo(before + out.moves.reduce((s, m) => s + m.delta, 0), 5)
        expect(board.history![0].cause).toBeTruthy()
        // Idempotent per week.
        expect(processWeeklyBoard(save).moves).toEqual([])
    })

    test("a week's moves are clamped so one week never decides a career", () => {
        const save = league(1)
        const board = ensureBoardState(save)
        const me = save.teams.find(t => t.id === save.playerTeamId)!
        const weaker = save.teams.filter(t => t.id !== me.id).slice(0, 4)
        for (const w of weaker) w.elo = (me.elo ?? 1000) - 2 * BOARD_TUNING.UPSET_ELO_GAP
        weaker.forEach((w, i) => save.completedMatches.push({ id: `m${i}`, homeTeamId: me.id, awayTeamId: w.id, tournamentId: "league_x", stage: null, week: 4, format: "BO1", seed: 1,
            result: { winnerId: w.id, homeScore: 0, awayScore: 1, maps: [] } } as never))
        me.financialState = "INSOLVENT"
        save.currentWeek = 5
        const total = weeklyBoardMoves(save, board, 4).reduce((s, m) => s + m.delta, 0)
        expect(total).toBeGreaterThanOrEqual(-BOARD_TUNING.WEEKLY_MAX_MOVE - 0.2)
    })

    test("warning, then final warning (on notice), then dismissal, each telegraphed with an event", () => {
        const save = league(1)
        const board = ensureBoardState(save)
        save.managerDetails.tenureStartWeek = 1
        save.currentWeek = BOARD_TUNING.TENURE_GRACE_WEEKS + 2
        board.lastWeeklyUpdateWeek = save.currentWeek - 1
        board.confidence = BOARD_TUNING.WARN_BELOW - 1
        processWeeklyBoard(save)
        expect(board.warnings).toBe(1)
        expect(board.onNotice).toBe(false)
        expect(save.eventsLog.some(e => e.id.startsWith("board_warning_"))).toBe(true)
        save.currentWeek++; board.confidence = BOARD_TUNING.NOTICE_BELOW - 1
        processWeeklyBoard(save)
        expect(board.warnings).toBe(2)
        expect(board.onNotice).toBe(true)
        expect(save.eventsLog.some(e => e.id.startsWith("board_notice_"))).toBe(true)
        expect(save.gameOverReason).toBeUndefined()
        save.currentWeek++; board.confidence = BOARD_TUNING.SACK_AT_OR_BELOW
        const out = processWeeklyBoard(save)
        expect(out.sacked).toBe(true)
        expect(save.gameOverReason).toBe("SACKED")
        expect(save.eventsLog.some(e => e.id.startsWith("board_sacked_"))).toBe(true)
    })

    test("no warnings or dismissal in the first weeks of a tenure; recovery clears warnings", () => {
        const save = league(1)
        const board = ensureBoardState(save)
        save.currentWeek = 3
        board.confidence = 5; board.warnings = 2; board.onNotice = true
        processWeeklyBoard(save)
        expect(save.gameOverReason).toBeUndefined()
        save.currentWeek = 30
        board.confidence = BOARD_TUNING.RECOVERED_AT + 1
        processWeeklyBoard(save)
        expect(board.warnings).toBe(0)
        expect(board.onNotice).toBe(false)
    })

    test("mid-season review judges split 1 against the league objective, then re-targets split 2", () => {
        const save = league(1)
        const board = ensureBoardState(save)
        const split1 = save.league!.current!
        const objective = board.objectives!.find(o => o.id === "league")!
        // Every other club wins: the managed club finishes last.
        for (let w = split1.firstWeek; w <= split1.lastWeek + 1; w++) {
            save.currentWeek = w
            playLeagueWeek(save, w, (h, a) => h === save.playerTeamId || (a !== save.playerTeamId && false))
            processLeagueWeek(save, save.playerTeamId)
            board.lastWeeklyUpdateWeek = w
        }
        save.currentWeek = LEAGUE_TUNING.SPLITS[1].drawWeek
        drawDueLeagueSplit(save)
        const before = board.confidence
        const out = processWeeklyBoard(save)
        expect(out.review?.reviewed).toBe(true)
        expect(out.moves.some(m => m.cause.startsWith("League objective missed"))).toBe(true)
        expect(board.confidence).toBeLessThan(before)
        expect(board.lastReview?.kind).toBe("MID_SEASON")
        const next = board.objectives!.find(o => o.id === "league")!
        expect(next.divisionId).toBe(divisionOfTeam(save, save.playerTeamId)!.id)
        expect(next.divisionId).not.toBe(objective.divisionId)
    })
})

describe("dismissal → job market (Phase 4.4)", () => {
    test("a sacked manager gets offers from clubs at or below the old club and continues the career", () => {
        const save = league(1)
        ensureBoardState(save)
        save.gameOverReason = "SACKED"; save.gameOverWeek = save.currentWeek
        const oldTeam = save.playerTeamId
        const offers = JobOfferGenerator.createDismissalOffers(save, new SeededRNG(3))
        expect(offers.length).toBe(BOARD_TUNING.DISMISSAL_OFFERS)
        const oldRep = save.teams.find(t => t.id === oldTeam)!.reputation
        for (const o of offers) {
            expect(o.data.afterDismissal).toBe(true)
            expect(save.teams.find(t => t.id === o.data.offeringTeamId)!.reputation).toBeLessThanOrEqual(Math.max(30, oldRep))
        }
        // Idempotent while open.
        expect(JobOfferGenerator.createDismissalOffers(save, new SeededRNG(4)).map(o => o.id).sort()).toEqual(offers.map(o => o.id).sort())
        const res = JobOfferGenerator.acceptJobOffer(save, offers[0].id)
        expect(res.success).toBe(true)
        expect(save.gameOverReason).toBeUndefined()
        expect(save.playerTeamId).toBe(offers[0].data.offeringTeamId)
        expect(save.managerDetails.dismissals).toBe(1)
        expect(save.boardState!.teamId).toBe(save.playerTeamId)
        expect(save.boardState!.confidence).toBe(BOARD_TUNING.NEW_BOARD_CONFIDENCE)
        // The other offers are withdrawn.
        expect(offers.slice(1).every(o => o.data.isWithdrawn)).toBe(true)
    })

    test("ordinary offers still cannot be taken once a career has ended", () => {
        const save = league(1)
        save.gameOverReason = "SACKED"
        save.eventsLog.unshift({ id: "job_offer_x", type: "JOB_OFFER", week: 1, acknowledged: false, data: { offeringTeamId: save.teams[0].id, originTeamId: save.playerTeamId, deadlineWeek: 5, salaryOffer: 1000 } })
        expect(JobOfferGenerator.acceptJobOffer(save, "job_offer_x").success).toBe(false)
    })

    function league(week: number) {
        const save = makeWorld({ EU: 30 }, "t_EU_14")
        save.currentWeek = week
        drawDueLeagueSplit(save)
        return save
    }
})
