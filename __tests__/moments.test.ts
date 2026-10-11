/**
 * Phase 5.4a moments: the queue (dedupe, ordering, persistence), Continue
 * stopping while a moment waits, and the engine queuing the right moment
 * once when a title, a division or a tier move is decided.
 */
import {
    dismissMoment,
    hasMomentKey,
    markMomentKey,
    MOMENT_QUEUE_CAP,
    queueMoment,
    restoreMomentQueue,
    restoreSeenMomentKeys,
    SEEN_MOMENT_KEYS_CAP,
    titleMomentFromCelebration,
    type Moment,
    type MomentHolder,
    type TitleMoment,
} from "@/engine/moments"
import { collectStopSignals, nextMoment, nextStop, type StopSource } from "@/lib/advance-stops"
import { queueDecidedTitle, updateStandings } from "@/engine/processors/standings-processor"
import { drawDueLeagueSplit, processLeagueWeek } from "@/engine/season/regional-league"
import { LeagueEngine } from "@/engine/league-engine"
import { LEAGUE_TUNING, leagueCentralPayment } from "@/lib/balance-tuning"
import { buildSaveSnapshot } from "@/store/utils/build-save-snapshot"
import { buildSigningMoment } from "@/store/slices/moments-slice"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { makeWorld, playLeagueWeek } from "./league-fixtures"
import { useGameStore } from "@/store/game-store"
import { saveManager } from "@/engine"
import { weekProcessorBridge } from "@/engine/worker/week-processor-bridge"
import { debouncedStorage } from "@/engine/storage-adapter"
import type { ComputedWeek } from "@/engine/worker/compute-week"
import type { BracketMatchSaveData, CompletedMatchSaveData, GameSave, TournamentSaveData } from "@/engine/save-types"

jest.mock("@/engine/worker/week-processor-bridge", () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

const signing = (key: string, week = 3): Moment => ({ key, kind: "signing", week, playerId: "p1", fee: 0, salaryPerWeek: 500, contractEndWeek: 60, fromTeamName: null, rating: 70, big: false })
const welcome = (key: string): Moment => ({ key, kind: "welcome", week: 1, teamId: "t1" })

describe("moment queue", () => {
    test("a key is queued once: again while queued, and never after it was shown", () => {
        const h: MomentHolder = {}
        expect(queueMoment(h, signing("a"))).toBe(true)
        expect(queueMoment(h, signing("a"))).toBe(false)
        expect(h.momentQueue).toHaveLength(1)
        dismissMoment(h, "a")
        expect(h.momentQueue).toHaveLength(0)
        expect(h.seenMomentKeys).toEqual(["a"])
        expect(queueMoment(h, signing("a"))).toBe(false)
        expect(hasMomentKey(h, "a")).toBe(true)
    })

    test("moments drain in the order they were decided (FIFO)", () => {
        const h: MomentHolder = {}
        queueMoment(h, welcome("w"))
        queueMoment(h, signing("s1"))
        queueMoment(h, signing("s2"))
        const order: string[] = []
        while (h.momentQueue?.length) { const head = nextMoment(h)!; order.push(head.key); dismissMoment(h, head.key) }
        expect(order).toEqual(["w", "s1", "s2"])
    })

    test("bounded: the queue and the delivered keys are capped, dropped moments count as delivered", () => {
        const h: MomentHolder = {}
        for (let i = 0; i < MOMENT_QUEUE_CAP + 3; i++) queueMoment(h, signing(`s${i}`))
        expect(h.momentQueue).toHaveLength(MOMENT_QUEUE_CAP)
        expect(h.momentQueue![0].key).toBe("s3")
        expect(queueMoment(h, signing("s0"))).toBe(false)
        for (let i = 0; i < SEEN_MOMENT_KEYS_CAP + 10; i++) markMomentKey(h, `k${i}`)
        expect(h.seenMomentKeys).toHaveLength(SEEN_MOMENT_KEYS_CAP)
        expect(h.seenMomentKeys!.at(-1)).toBe(`k${SEEN_MOMENT_KEYS_CAP + 9}`)
    })

    test("restored from a save: junk dropped, duplicates removed, older saves start empty", () => {
        expect(restoreMomentQueue(undefined)).toEqual([])
        expect(restoreSeenMomentKeys(null)).toEqual([])
        const raw = [signing("a"), { key: "b", kind: "nonsense" }, null, signing("a"), welcome("w")]
        expect(restoreMomentQueue(raw).map(m => m.key)).toEqual(["a", "w"])
        expect(restoreSeenMomentKeys(["x", 3, "x", "", "y"])).toEqual(["x", "y"])
    })

    test("a legacy pending celebration is shown as a title moment", () => {
        expect(titleMomentFromCelebration({ type: "x" } as never)).toBeNull()
        const legacy = titleMomentFromCelebration({ tournamentId: "t_major", tournamentName: "Major", tier: "S_TIER", prize: 1_000_000, repGain: 10, fanGain: 50_000, week: 9 })
        expect(legacy).toMatchObject({ key: "title:t_major", kind: "title", major: true, prizeIsPool: true, prizeBooked: false })
        expect(nextMoment({ momentQueue: [], pendingCelebration: { tournamentId: "t_major", tournamentName: "Major", tier: "S_TIER" } as never })?.key).toBe("title:t_major")
    })

    test("saved with the career: the snapshot carries the queue and the delivered keys", () => {
        const queue = [welcome("welcome:s")]
        const snap = buildSaveSnapshot({ ...useGameStore.getState(), momentQueue: queue, seenMomentKeys: ["intro:m1"] } as never)
        expect(snap.momentQueue).toEqual(queue)
        expect(snap.seenMomentKeys).toEqual(["intro:m1"])
        expect(JSON.parse(JSON.stringify(snap)).momentQueue).toEqual(queue)
    })
})

describe("Continue and moments", () => {
    const src = (save: GameSave) => save as unknown as StopSource
    const base = () => {
        const save = createLaunchFixture("first-week")
        save.scheduledMatches = []
        save.timeMode = "WEEKLY"
        save.currentDay = 0
        save.currentWeek = 5
        return save
    }

    test("a queued moment stops Continue before anything else, every time (it is never 'seen' by a stop)", () => {
        const save = base()
        save.scheduledMatches = [{ id: "m1", homeTeamId: save.playerTeamId, awayTeamId: "team_ai_1", week: 5, format: "BO3", tournamentId: null, seed: 1 } as never]
        save.momentQueue = [welcome("welcome:x")]
        expect(collectStopSignals(src(save)).map(s => s.kind)).toEqual(["moment", "match"])
        expect(nextStop(src(save), new Set(["moment:welcome:x"]))).toMatchObject({ kind: "moment", reason: "Board brief" })
        save.momentQueue = []
        expect(nextStop(src(save), new Set())?.kind).toBe("match")
    })

    const initial = { ...useGameStore.getState() }
    function load(script: Record<number, (save: GameSave) => void> = {}) {
        const save = base()
        useGameStore.setState({
            ...initial, ...structuredClone(save), league: undefined, boardState: undefined,
            weekReports: null, continueRun: null, advanceStop: null, advanceSeenKeys: [], weekReportOpen: null, weekReportToast: null,
            momentQueue: [], seenMomentKeys: [],
            isLoading: false, isInitialized: true, _completedMatchIds: new Set(), addToast: jest.fn(),
        } as never)
        jest.spyOn(saveManager, "saveGame").mockResolvedValue({ success: true })
        jest.mocked(weekProcessorBridge.processWeek).mockReset().mockImplementation(async input => {
            const processed = structuredClone(input)
            processed.currentWeek++
            script[processed.currentWeek]?.(processed)
            return { save: processed, rngState: 7, result: { success: true, changes: [] } as unknown as ComputedWeek["result"] }
        })
        return save
    }
    afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

    test("a moment decided in a week tick stops the run right after that week; Continue waits until it is shown", async () => {
        const save = load({ 7: s => { queueMoment(s, signing("league-title:x")) } })
        const store = () => useGameStore.getState()
        await store().continueToNextDecision()
        expect(store().currentWeek).toBe(save.currentWeek + 2)
        expect(store().momentQueue.map(m => m.key)).toEqual(["league-title:x"])
        // The moment explains itself; no notice under Continue.
        expect(store().advanceStop).toBeNull()
        await store().continueToNextDecision()
        expect(store().currentWeek).toBe(save.currentWeek + 2)
        expect(weekProcessorBridge.processWeek).toHaveBeenCalledTimes(2)
        store().dismissMoment("league-title:x")
        expect(store().momentQueue).toEqual([])
        expect(store().seenMomentKeys).toContain("league-title:x")
        await store().continueToNextDecision()
        expect(store().currentWeek).toBeGreaterThan(save.currentWeek + 2)
    })

    test("the store refuses a moment already delivered", () => {
        load()
        const store = useGameStore.getState()
        expect(store.enqueueMoment(welcome("w1"))).toBe(true)
        useGameStore.getState().dismissMoment("w1")
        expect(useGameStore.getState().enqueueMoment(welcome("w1"))).toBe(false)
        expect(useGameStore.getState().momentQueue).toEqual([])
    })
})

describe("titles", () => {
    function bracketSave(playerWinsFinal = true): { save: GameSave; tournament: TournamentSaveData } {
        const teams = ["me", "b", "c", "d"]
        const bm = (id: string, stage: string, home: string, away: string, winner: string, week: number, src?: string[]): BracketMatchSaveData =>
            ({ id, tournamentId: "cup", stage, homeTeamId: home, awayTeamId: away, winnerId: winner, loserId: winner === home ? away : home, isCompleted: true, week, format: "BO3", seed: 1, sourceMatchIds: src })
        const gfWinner = playerWinsFinal ? "me" : "c"
        const bracket = [bm("sf1", "Semi-final 1", "me", "b", "me", 4), bm("sf2", "Semi-final 2", "c", "d", "c", 4), bm("gf", "Grand Final", "me", "c", gfWinner, 5, ["sf1", "sf2"])]
        const tournament = {
            id: "cup", name: "Nordic Cup", shortName: "NC", tier: "S_TIER", region: "EU", teamIds: teams, format: "bracket",
            currentStage: "Playoffs", standings: teams.map(teamId => ({ teamId, matchesPlayed: 0, wins: 0, losses: 0, mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0 })),
            prizePool: 100_000, startWeek: 1, duration: 5, endWeek: 5, playoffBracket: bracket, trophyPath: "/t.png",
        } as unknown as TournamentSaveData
        const completed = bracket.map(m => ({
            id: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, tournamentId: "cup", stage: m.stage, week: m.week, day: 5, format: "BO3", seed: 1,
            result: { homeScore: m.winnerId === m.homeTeamId ? 2 : 1, awayScore: m.winnerId === m.homeTeamId ? 1 : 2, winnerId: m.winnerId, maps: [] },
        })) as unknown as CompletedMatchSaveData[]
        const save = {
            saveVersion: 8, saveId: "t", saveName: "t", createdAt: "", updatedAt: "", currentWeek: 5, currentDay: 6, timeMode: "WEEKLY", gameStartDate: "2026-01-05",
            managerDetails: {} as never, lastRngSeed: 1, playerTeamId: "me",
            teams: teams.map(id => ({ id, name: `Team ${id}`, rosterIds: [], staffIds: [], reputation: 95, fanbase: 1000, trophies: [], facilities: [], sponsors: [], followers: 1000, budget: 0 })),
            players: [], contracts: [], staff: [], tournaments: [tournament], scheduledMatches: [], completedMatches: completed, scheduledActivities: [],
            financeLedger: [], eventsLog: [], newsFeed: [], acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [], weekTickState: null,
            circuitPoints: [], tournamentQualifications: [], signedLegendIds: [], activelyPlayingLegendIds: [],
        } as unknown as GameSave
        return { save, tournament }
    }

    test("a grand final won on the result screen queues the title with the exact share the tick pays; the tick never queues it again", () => {
        const { save } = bracketSave()
        expect(queueDecidedTitle(save, "cup")).toBe(true)
        const queued = save.momentQueue![0] as TitleMoment
        expect(queued).toMatchObject({ key: "title:cup", kind: "title", major: true, prizeBooked: false, repGain: 5, finalOpponentName: "Team c", finalScore: "2-1", matchId: "gf" })
        // Legend pick offered once with the title (S-tier).
        expect(hasMomentKey(save, "legend:cup")).toBe(true)
        const pick = save.pendingLegendPick
        expect(queueDecidedTitle(save, "cup")).toBe(false)

        dismissMoment(save, "title:cup")
        save.pendingLegendPick = null
        updateStandings(save)
        const prizeRow = save.financeLedger.find(e => e.id.startsWith("prize_cup_me_"))!
        expect(prizeRow.amount).toBe(queued.prize)
        expect(save.momentQueue).toEqual([])
        expect(save.pendingLegendPick).toBeNull()
        expect(pick).toBeTruthy()
    })

    test("a title decided inside the week tick is queued there, booked, once", () => {
        const { save } = bracketSave()
        updateStandings(save)
        expect(save.momentQueue).toHaveLength(1)
        const m = save.momentQueue![0] as TitleMoment
        expect(m).toMatchObject({ key: "title:cup", prizeBooked: true, repGain: 5 })
        expect(m.fanGain).toBe(200 * 100 + 100 * 200)
        expect(m.prize).toBe(save.financeLedger.find(e => e.id.startsWith("prize_cup_me_"))!.amount)
        updateStandings(save)
        expect(save.momentQueue).toHaveLength(1)
    })

    test("no title moment for a lost final", () => {
        const { save } = bracketSave(false)
        expect(queueDecidedTitle(save, "cup")).toBe(false)
        updateStandings(save)
        expect(save.momentQueue ?? []).toEqual([])
    })
})

describe("league division and tier moves", () => {
    test("winning a division queues its title and the promotion with the next division's real payments", () => {
        const save = makeWorld({ EU: 30 })
        const split = drawDueLeagueSplit(save)!
        const d2 = split.divisions.find(d => d.level === 2)!
        const order = new Map(save.teams.map(t => [t.id, t.worldRanking!]))
        // The lower-ranked club always wins: the worst seed of Division 2 tops it.
        const champion = [...d2.teamIds].sort((a, b) => order.get(b)! - order.get(a)!)[0]
        save.playerTeamId = champion
        for (let w = split.firstWeek; w <= split.lastWeek + 1; w++) {
            save.currentWeek = w
            playLeagueWeek(save, w, (h, a) => order.get(a)! > order.get(h)!)
            processLeagueWeek(save, champion)
        }
        processLeagueWeek(save, champion)
        const kinds = (save.momentQueue ?? []).map(m => m.kind)
        expect(kinds).toEqual(["league-title", "promotion"])
        expect(save.momentQueue![0]).toMatchObject({ divisionName: d2.name, level: 2, prize: Math.round(LEAGUE_TUNING.SPLIT_PRIZE_POOL_BY_LEVEL[1] * 0.4), trophy: false })
        expect(save.momentQueue![1]).toMatchObject({
            scope: "division", fromLabel: d2.name, toLabel: "Europe Division 1", topDivision: true,
            centralPayment: { from: leagueCentralPayment(2), to: leagueCentralPayment(1) },
            prizePool: { from: LEAGUE_TUNING.SPLIT_PRIZE_POOL_BY_LEVEL[1], to: LEAGUE_TUNING.SPLIT_PRIZE_POOL_BY_LEVEL[0] },
        })
    })

    test("a season-end tier move queues a world promotion or relegation moment with the events each tier gates", () => {
        const save = makeWorld({ EU: 30 }, "t_EU_0")
        save.currentWeek = 52
        const me = save.teams.find(t => t.id === "t_EU_0")!
        me.leagueTier = "C_TIER"
        LeagueEngine.processSeasonEnd(save, me.id)
        const move = save.momentQueue?.find(m => m.kind === "promotion")
        expect(move).toMatchObject({ kind: "promotion", scope: "world", season: 1, fromLabel: "C-Tier", worldRank: 1 })
        expect(Array.isArray((move as { eligibleNow?: string[] }).eligibleNow)).toBe(true)
        LeagueEngine.processSeasonEnd(save, me.id)
        expect(save.momentQueue!.filter(m => m.kind === "promotion")).toHaveLength(1)
    })
})

describe("signing reveal", () => {
    test("built from the deal as made: fee, wage, contract end, selling club, big by rating", () => {
        const save = createLaunchFixture("first-week")
        const other = save.teams.find(t => t.id !== save.playerTeamId)!
        const pid = other.rosterIds[0]
        const moment = buildSigningMoment(save as never, { playerId: pid, fee: 120_000.4, salaryPerWeek: 2_500, contractEndWeek: 80, fromTeamId: other.id })!
        expect(moment).toMatchObject({ kind: "signing", playerId: pid, fee: 120_000, salaryPerWeek: 2_500, contractEndWeek: 80, fromTeamName: other.name })
        expect(moment.key).toBe(`signing:${pid}:${save.currentWeek}`)
        expect(moment.big).toBe(moment.rating >= 85)
        expect(buildSigningMoment(save as never, { playerId: pid, fee: 0, salaryPerWeek: 1, contractEndWeek: 9, fromTeamId: "FA" })!.fromTeamName).toBeNull()
    })
})
