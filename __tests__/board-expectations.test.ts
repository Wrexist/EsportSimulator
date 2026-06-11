import {
    getBoardSanctionedFee,
    processMidSeasonBoardPulse,
    deriveExpectationTier,
    evaluateOutcome,
    confidenceDelta,
    ensureBoardState,
    processSeasonBoardReview,
    trophiesInSeason,
} from "@/engine/board-expectations"
import type { GameSave, BoardState } from "@/engine/save-types"

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

describe("processMidSeasonBoardPulse — quarterly check-ins", () => {
    const mkMatch = (id: string, week: number, won: boolean) => ({
        id, week, homeTeamId: "player", awayTeamId: "rival",
        result: { homeScore: won ? 2 : 0, awayScore: won ? 0 : 2, winnerId: won ? "player" : "rival", maps: [] },
    })

    function pulseSave(week: number, wins: number, losses: number, confidence = 60) {
        const save = makeSave({ currentWeek: week }, { confidence, seasonExpectation: "COMPETE", expectationSetSeason: 1, lastReviewedSeason: 0 })
        const matches = []
        for (let i = 0; i < wins; i++) matches.push(mkMatch(`w${i}`, week - 1 - i, true))
        for (let i = 0; i < losses; i++) matches.push(mkMatch(`l${i}`, week - 1 - wins - i, false))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(save as any).completedMatches = matches
        return save
    }

    test("only fires on quarter weeks (13/26/39, season-relative)", () => {
        expect(processMidSeasonBoardPulse(pulseSave(12, 5, 1)).pulsed).toBe(false)
        expect(processMidSeasonBoardPulse(pulseSave(13, 5, 1)).pulsed).toBe(true)
        expect(processMidSeasonBoardPulse(pulseSave(65, 5, 1)).pulsed).toBe(true) // week 13 of season 2
        expect(processMidSeasonBoardPulse(pulseSave(52, 5, 1)).pulsed).toBe(false) // season review week, not a pulse
    })

    test("hot form (+4), steady (+1), poor (-3), slump (-6); clamped; never sacks", () => {
        const hot = pulseSave(13, 6, 1)
        expect(processMidSeasonBoardPulse(hot)).toMatchObject({ pulsed: true, delta: 4, confidence: 64 })

        const steady = pulseSave(13, 4, 4)
        expect(processMidSeasonBoardPulse(steady)).toMatchObject({ delta: 1, confidence: 61 })

        const poor = pulseSave(13, 3, 5) // 37.5% in [0.25, 0.45)
        expect(processMidSeasonBoardPulse(poor)).toMatchObject({ delta: -3, confidence: 57 })

        const slump = pulseSave(13, 0, 6, 4) // 0% from confidence 4 → clamps at 0, no sack
        const res = processMidSeasonBoardPulse(slump)
        expect(res).toMatchObject({ delta: -6, confidence: 0 })
        expect(slump.gameOverReason).toBeUndefined()
    })

    test("idempotent within a week; skips with too few matches", () => {
        const save = pulseSave(13, 5, 1)
        processMidSeasonBoardPulse(save)
        const after = save.boardState!.confidence
        expect(processMidSeasonBoardPulse(save).pulsed).toBe(false) // same week again
        expect(save.boardState!.confidence).toBe(after)

        const quiet = pulseSave(13, 1, 1) // only 2 matches < min 3
        expect(processMidSeasonBoardPulse(quiet).pulsed).toBe(false)
        expect(quiet.boardState!.confidence).toBe(60) // untouched
    })

    test("low-confidence pulse carries the ultimatum warning", () => {
        const save = pulseSave(13, 0, 6, 25) // → 19 after -6
        const res = processMidSeasonBoardPulse(save)
        expect(res.newsContent).toContain("deliver results")
    })
})
