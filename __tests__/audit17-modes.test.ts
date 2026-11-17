/**
 * Audit 2026-11-17, area "modes" (Pro career, Draft Cup, sandbox):
 *  - MODES-01: the draft board keeps every deal (device storage) until the cup starts.
 *  - MODES-04: no storylines or club money decisions in a Draft Cup; the run's open decisions lapse.
 *  - MODES-05: a Draft Cup week headline names no money.
 *  - MODES-06: the Draft Cup's internal C_TIER is not named in report causes.
 *  - MODES-07: equal-price draft cards list the stronger player first.
 *  - MODES-10: a sandboxed run is marked in the best-runs list.
 *  - MODES-11: a club offer to the pro needs a place in the five its coach would field.
 *  - MODES-12: the pro cannot pick the club's week focus or book (and pay for) activities.
 *  - MODES-13: the lineup swap says whether it happened (refused in a pro career).
 *  - MODES-14: the default captain is a fit starter, a bench player only when no starter can be.
 *  - MODES-20: the pro starts just behind the five the coach would field.
 *  - MODES-22: a retiring pro hands over a manager career with its own chores and a new board.
 * Manager careers keep their behaviour (each block checks that side too).
 */
import { produce, enableMapSet } from "immer"
import type { GameEventSaveData, GameSave, PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"
import { PlayerRole } from "@/types/enums"
import { WeeklyActivityType } from "@/types/activities"
import { findOfferingClub, ovrOf, retirePro, startProCareer } from "@/engine/pro-career"
import { bestAILineup } from "@/engine/ai/lineup"
import { defaultCaptainId } from "@/engine/personality"
import { buildDraftPool, type DraftPool } from "@/engine/draft-cup"
import { processStorylines, ARC_DEFINITIONS } from "@/engine/storylines"
import { EventProcessor } from "@/engine/processors/event-processor"
import { competitionLabel } from "@/engine/ranking-report"
import { weekHeadline, type WeekReport } from "@/lib/week-report"
import { closeDraftCupDecisions } from "@/store/slices/draft-cup-slice"
import { isOpenDecision } from "@/engine/decision-deadlines"
import { createUISlice } from "@/store/slices/ui-slice"
import { createMatchSchedulingSlice } from "@/store/slices/match-scheduling-slice"
import { createTeamSettingsSlice } from "@/store/slices/team-settings-slice"
import { proStaffRunRefusal } from "@/store/utils/pro-guard"
import { loadDraftCupRuns, recordDraftCupRun } from "@/lib/draft-cup-runs"
import { clearDraftCupBoard, loadDraftCupBoard, normalizeDraftCupBoard, saveDraftCupBoard } from "@/lib/draft-cup-board"

enableMapSet()

const STATS = ["skill", "rifle", "awp", "pistol", "grenades", "creativity", "clutch", "tactic", "leader", "teamwork", "reaction", "eyesight", "entry", "trading"] as const

function makePlayer(id: string, over: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, name: id, age: 22, nationality: "Sweden", role: "RIFLER",
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60, clutch: 60, tactic: 60, leader: 55,
        teamwork: 65, reaction: 70, eyesight: 70, morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, talentPoints: 0, unlockedTalentIds: [], majorWins: 0,
        matchesPlayed: 0, totalMVPs: 0, skill: 70, potential: 85, productivity: 60, endurance: 70,
        ...over,
    } as unknown as PlayerSaveData
}

/** A player whose every skill stat is `v` (the overall follows it). */
const flat = (id: string, role: string, v: number, over: Partial<PlayerSaveData> = {}) =>
    makePlayer(id, { role, ...Object.fromEntries(STATS.map(k => [k, v])), ...over } as Partial<PlayerSaveData>)

function makeTeam(id: string, over: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(), budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [], fanbase: 1000, reputation: 50, region: "EU", facilitiesLevel: 1,
        leagueTier: "B_TIER", recentForm: [], ...over,
    } as unknown as TeamSaveData
}

function harness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set = (patch: Partial<StoreState> | ((draft: StoreState) => void)) => {
        state = typeof patch === "function" ? produce(state, patch as (s: StoreState) => void) : { ...state, ...patch }
    }
    return { state: () => state, set, get: () => state }
}

const PRO = "pro_save1"
const W = 20

describe("MODES-11: an offer means a place in the five", () => {
    /** The pro (an AWPer) at a weak club, and a bigger club with one player per role. */
    function world(proLevel: number, awperLevel: number) {
        const roles = [["igl", "IGL"], ["awp", "AWPER"], ["entry", "ENTRY_FRAGGER"], ["rifler", "RIFLER"], ["support", "SUPPORT"]] as const
        const club = roles.map(([id, role]) => flat(`b_${id}`, role, id === "awp" ? awperLevel : id === "support" ? 58 : 70))
        const pro = flat(PRO, "AWPER", proLevel)
        const mates = ["a", "b", "c", "d", "e"].map(id => flat(id, "RIFLER", 40))
        return {
            saveId: "save1", currentWeek: W, playerTeamId: "home",
            teams: [
                makeTeam("home", { reputation: 30, rosterIds: [...mates.map(p => p.id), PRO] }),
                makeTeam("big", { reputation: 40, rosterIds: club.map(p => p.id) }),
            ],
            players: [...mates, pro, ...club], contracts: [], eventsLog: [],
            proCareer: { playerId: PRO, startWeek: 1, clubs: [{ teamId: "home", fromWeek: 1 }] },
        } as unknown as GameSave
    }

    test("better than their weakest starter but not good enough for their five: no offer (the audit's BUSS case)", () => {
        const save = world(60, 85)
        const ovr = (id: string) => ovrOf(save.players.find(p => p.id === id)!, W)
        // The old rule would have offered: the pro beats their weakest starter (the support).
        expect(ovr(PRO)).toBeGreaterThan(ovr("b_support"))
        const big = save.teams[1]
        const five = bestAILineup([...big.rosterIds, PRO].map(id => save.players.find(p => p.id === id)!), W).five.map(p => p.id)
        expect(five).not.toContain(PRO)
        expect(findOfferingClub(save)).toBeUndefined()
    })

    test("good enough to take a place in their five: the offer comes", () => {
        const save = world(80, 70)
        expect(findOfferingClub(save)?.id).toBe("big")
    })
})

describe("MODES-20: the pro starts just behind the coach's five", () => {
    test("a weak player first in roster order does not set the pro's level", () => {
        const weak = flat("weak", "RIFLER", 35)
        const five = [["i", "IGL"], ["w", "AWPER"], ["e", "ENTRY_FRAGGER"], ["r", "RIFLER"], ["s", "SUPPORT"]].map(([id, role]) => flat(id, role, 72))
        const save = {
            saveId: "save1", currentWeek: W, playerTeamId: "home",
            teams: [makeTeam("home", { rosterIds: [weak.id, ...five.map(p => p.id)] })],
            players: [weak, ...five], contracts: [], eventsLog: [],
        } as unknown as GameSave
        const pro = startProCareer(save, { nickname: "kid", role: PlayerRole.RIFLER })!
        const weakestOfFive = Math.min(...five.map(p => ovrOf(p, W)))
        expect(ovrOf(pro, W)).toBeGreaterThan(ovrOf(weak, W) + 10)
        expect(Math.abs(ovrOf(pro, W) - (weakestOfFive - 2))).toBeLessThanOrEqual(2)
    })
})

describe("MODES-22: retiring hands over a fresh manager's job", () => {
    test("delegation off, a new board with its grace period, and the board brief", () => {
        const roster = ["a", "b", "c", "d", "e", "f"].map(id => flat(id, "RIFLER", 60))
        const pro = flat(PRO, "RIFLER", 70)
        const save = {
            saveId: "save1", currentWeek: 400, playerTeamId: "home",
            teams: [makeTeam("home", { rosterIds: [...roster.map(p => p.id), PRO], worldRanking: 50, reputation: 40 })],
            players: [...roster, pro], contracts: [], eventsLog: [], scheduledMatches: [], completedMatches: [], tournaments: [],
            delegation: { matches: true, drills: true, renewals: true, scouting: true, veto: true },
            boardState: { teamId: "home", confidence: 12, onNotice: true, warnings: 2, history: [], seasonExpectation: "CONTEND", rankTarget: 10, expectationSetSeason: 1, lastReviewedSeason: 7 },
            managerDetails: { name: "kid", tenureStartWeek: 1 },
            proCareer: { playerId: PRO, startWeek: 1, clubs: [{ teamId: "home", fromWeek: 1 }] },
        } as unknown as GameSave
        expect(retirePro(save)).toBe(true)
        expect(save.delegation).toEqual({})
        expect(save.boardState?.onNotice).toBe(false)
        expect(save.boardState?.warnings).toBe(0)
        expect(save.boardState?.confidence).toBeGreaterThan(12)
        expect(save.managerDetails.tenureStartWeek).toBe(401)
        expect(save.momentQueue?.some(m => m.kind === "welcome")).toBe(true)
    })
})

describe("MODES-14: the default captain plays", () => {
    const lookupOf = (players: PlayerSaveData[]) => (id: string) => players.find(p => p.id === id)
    test("the best leader among the starters, not a benched one", () => {
        const players = ["s1", "s2", "s3", "s4", "s5", "bench"].map((id, i) => makePlayer(id, { leader: i === 5 ? 95 : 50 + i }))
        const team = { id: "t", rosterIds: players.map(p => p.id) }
        expect(defaultCaptainId(team, lookupOf(players))).toBe("s5")
    })
    test("an injured starter is passed over; with no fit starter the bench leader is captain", () => {
        const players = ["s1", "s2", "s3", "s4", "s5", "bench"].map((id, i) => makePlayer(id, { leader: i === 4 ? 90 : i === 5 ? 80 : 50 }))
        players[4].injury = { name: "Wrist", weeksRemaining: 2 } as never
        const team = { id: "t", rosterIds: players.map(p => p.id) }
        expect(defaultCaptainId(team, lookupOf(players))).toBe("s1")
        for (const p of players.slice(0, 5)) p.injury = { name: "Wrist", weeksRemaining: 2 } as never
        expect(defaultCaptainId(team, lookupOf(players))).toBe("bench")
    })
})

describe("MODES-07: the draft board's order", () => {
    test("within one price the stronger player comes first", () => {
        const roles = ["IGL", "AWPER", "ENTRY_FRAGGER", "RIFLER", "SUPPORT"]
        const players = roles.flatMap(role => [56, 57, 58, 57, 56, 58].map((v, i) => ({ ...flat(`${role}_${i}`, role, v), nickname: `${role}_${i}` })))
        const pool = buildDraftPool(players as never, [], [], 7) as DraftPool
        for (const role of roles) {
            const list = pool[role as keyof DraftPool]
            for (let i = 1; i < list.length; i++) {
                if (list[i].price === list[i - 1].price) expect(list[i].overall).toBeLessThanOrEqual(list[i - 1].overall)
            }
        }
    })
})

describe("MODES-04: a Draft Cup runs no club world", () => {
    const fakeRng = { bool: () => true, next: () => 0, int: (a: number) => a, pick: <T>(xs: T[]) => xs[0] } as never
    const manager = { recordEventGenerated: jest.fn().mockResolvedValue(undefined) } as never
    function save(draftCup: boolean) {
        return {
            saveId: "s", currentWeek: 5, playerTeamId: "me",
            teams: [makeTeam("me", { rosterIds: [], sponsors: [{ id: "sp", remainingWeeks: 10 }] as never })],
            players: [], contracts: [], completedMatches: [], eventsLog: [], storylines: [],
            ...(draftCup ? { draftCup: { tournamentId: "cup", teamId: "me" } } : {}),
        } as unknown as GameSave
    }

    test("no fan meetup or sponsor review decision in a cup; a club career still gets them", async () => {
        const cup = save(true), club = save(false)
        await EventProcessor.generateEvents(cup, { generatedEventIds: [] } as never, fakeRng, "me", manager)
        await EventProcessor.generateEvents(club, { generatedEventIds: [] } as never, fakeRng, "me", manager)
        expect(cup.eventsLog.map(e => e.id)).toEqual([])
        expect(club.eventsLog.map(e => e.id)).toEqual(expect.arrayContaining(["fan_meet_5", "sponsor_review_5"]))
    })

    test("no storyline is even looked for in a cup", () => {
        const spy = jest.spyOn(ARC_DEFINITIONS.CONTRACT_STANDOFF, "detect")
        const cup = save(true)
        expect(processStorylines(cup).started).toEqual([])
        expect(spy).not.toHaveBeenCalled()
        processStorylines(save(false))
        expect(spy).toHaveBeenCalled()
        spy.mockRestore()
    })

    test("the run's open decisions lapse when it ends (no effects applied)", () => {
        const fan = { id: "fan_meet_2", type: "FAN", week: 2, acknowledged: false, data: { deadlineWeek: 3 }, choices: [{ id: "fan_meet", text: "x", effects: { money: -2000 } }] } as unknown as GameEventSaveData
        const done = { ...fan, id: "fan_meet_1", selectedChoiceId: "fan_meet" } as GameEventSaveData
        const target = { eventsLog: [fan, done], acknowledgedEventIds: [] as string[], currentWeek: 4 }
        expect(isOpenDecision(fan)).toBe(true)
        expect(closeDraftCupDecisions(target as never)).toBe(1)
        expect(target.eventsLog.filter(isOpenDecision)).toEqual([])
        expect(target.eventsLog[0].selectedChoiceId).toBe("expired")
        expect(target.eventsLog[1].selectedChoiceId).toBe("fan_meet")
        expect(target.acknowledgedEventIds).toEqual(["fan_meet_2"])
    })
})

describe("MODES-05 / MODES-06: Draft Cup reports", () => {
    const report = (moneyless: boolean) => ({
        v: 1, week: 1, teamId: "me", changes: [{ kind: "money", subjectId: "me", label: "Wages", delta: -7800, cause: { type: "finance", label: "Wages" } }],
        matches: [{ id: "m", opponentId: "o", opponentName: "Rival", won: true, score: "2–1", competition: "Draft Cup" }],
        warnings: [], names: {}, kpis: { budget: [0, 0], rank: [null, null], elo: [0, 0], board: [null, null], chemistry: [0, 0], morale: [null, null], reputation: [0, 0] },
        ...(moneyless ? { moneyless: true } : {}),
    }) as unknown as Omit<WeekReport, "headline">

    test("the cup's headline names no money; a club week still does", () => {
        expect(weekHeadline(report(true))).not.toMatch(/financ|\$/i)
        expect(weekHeadline(report(false))).toMatch(/\$7\.8k/)
    })

    test("a Draft Cup result is not called a C-Tier event; other events keep their tier", () => {
        const tournaments = [
            { id: "draft_cup_s", seriesId: "draft_cup", name: "Draft Cup", tier: "C_TIER" },
            { id: "c_cup_s1", seriesId: "c_cup", name: "Some Cup", tier: "C_TIER" },
        ] as never
        expect(competitionLabel({ tournaments }, { tournamentId: "draft_cup_s", stage: "Quarter-final 1" } as never)).toBe(" · Draft Cup")
        expect(competitionLabel({ tournaments }, { tournamentId: "c_cup_s1", stage: "Quarter-final 1" } as never)).toBe(" · Some Cup (C-Tier playoffs)")
    })
})

describe("MODES-12 / MODES-13: the pro does not run the club", () => {
    const base = (pro: boolean) => ({
        currentWeek: 10, currentDay: 0, timeMode: "WEEKLY", playerTeamId: "home", selectedWeeklyActivity: null,
        teams: [makeTeam("home", { budget: 50_000, rosterIds: ["a", "b", "c", "d", "e", PRO] })],
        players: ["a", "b", "c", "d", "e", PRO].map(id => makePlayer(id)),
        scheduledActivities: [], scheduledMatches: [], financeLedger: [], isInitialized: false,
        ...(pro ? { proCareer: { playerId: PRO, startWeek: 1, clubs: [{ teamId: "home", fromWeek: 1 }] } } : {}),
    }) as unknown as Partial<StoreState>
    const bootcamp = { id: "bootcamp_10_x_1", type: "BOOTCAMP", week: 10, duration: 1, cost: 10_000, name: "Bootcamp" } as never

    test("week focus and paid bookings are refused in a pro career and cost nothing", () => {
        const h = harness(base(true))
        createUISlice(h.set as never, h.get as never).setWeeklyActivity(WeeklyActivityType.TEAM_BONDING)
        expect(h.state().selectedWeeklyActivity).toBeNull()
        expect(createMatchSchedulingSlice(h.set as never, h.get as never).scheduleActivity(bootcamp)).toEqual(proStaffRunRefusal())
        expect(h.state().teams[0].budget).toBe(50_000)
        expect(h.state().scheduledActivities).toEqual([])
    })

    test("a manager still plans and books his week", () => {
        const h = harness(base(false))
        createUISlice(h.set as never, h.get as never).setWeeklyActivity(WeeklyActivityType.TEAM_BONDING)
        expect(h.state().selectedWeeklyActivity).toBe(WeeklyActivityType.TEAM_BONDING)
        expect(createMatchSchedulingSlice(h.set as never, h.get as never).scheduleActivity(bootcamp).success).toBe(true)
        expect(h.state().teams[0].budget).toBe(40_000)
    })

    test("the lineup swap reports whether it happened", () => {
        const pro = harness(base(true))
        expect(createTeamSettingsSlice(pro.set as never, pro.get as never).swapRosterPositions("home", 5, 0)).toBe(false)
        expect(pro.state().teams[0].rosterIds[0]).toBe("a")
        const mgr = harness(base(false))
        expect(createTeamSettingsSlice(mgr.set as never, mgr.get as never).swapRosterPositions("home", 5, 0)).toBe(true)
        expect(mgr.state().teams[0].rosterIds[0]).toBe(PRO)
        expect(createTeamSettingsSlice(mgr.set as never, mgr.get as never).swapRosterPositions("home", 0, 99)).toBe(false)
    })
})

describe("device storage (MODES-01, MODES-10)", () => {
    /** A minimal Storage for the node test environment. */
    function fakeStorage() {
        const m = new Map<string, string>()
        return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), map: m }
    }
    let local: ReturnType<typeof fakeStorage>, session: ReturnType<typeof fakeStorage>
    beforeEach(() => {
        local = fakeStorage(); session = fakeStorage()
        ;(globalThis as unknown as { window: unknown }).window = { localStorage: local, sessionStorage: session }
    })
    afterAll(() => { delete (globalThis as unknown as { window?: unknown }).window })

    const pool = (tag: string) => Object.fromEntries(["IGL", "AWPER", "ENTRY_FRAGGER", "RIFLER", "SUPPORT"].map((role, i) => [role, [{ playerId: `${tag}${i}`, nickname: `n${i}`, role, overall: 70, price: 10, fromTeamId: "" }]])) as unknown as DraftPool
    const board = {
        version: 1 as const, step: "setup" as const, worldSeed: 9, managerName: "Ana", teamName: "Draft FC", shortName: "DRF", swatch: 0, difficulty: "pro" as const, rerolls: 1,
        deal: { difficulty: "pro" as const, opponentIds: ["t1"], pool: pool("p"), picks: { IGL: "p0" } },
        otherDeals: { open: { difficulty: "open" as const, opponentIds: ["t2"], pool: pool("o"), picks: {} } },
    }

    test("the board, with every difficulty's deal and the rerolls left, survives a restart (device storage)", () => {
        saveDraftCupBoard(board)
        expect(session.map.size).toBe(0)
        const back = loadDraftCupBoard()!
        expect(back.deal!.pool).toEqual(board.deal.pool)
        expect(back.otherDeals!.open!.opponentIds).toEqual(["t2"])
        expect(back.rerolls).toBe(1)
        clearDraftCupBoard()
        expect(loadDraftCupBoard()).toBeNull()
    })

    test("a board kept by an older version in tab storage is read once and moved", () => {
        session.setItem("esim_draft_cup_board_v1", JSON.stringify(board))
        expect(loadDraftCupBoard()!.deal!.difficulty).toBe("pro")
        expect(session.map.size).toBe(0)
    })

    test("junk in the other deals is dropped, and the current difficulty is never stored twice", () => {
        const b = normalizeDraftCupBoard({ ...board, otherDeals: { pro: board.deal, elite: { difficulty: "elite", pool: "x" } } })!
        expect(b.otherDeals).toBeUndefined()
    })

    test("a sandboxed run is marked in the best-runs list", () => {
        recordDraftCupRun({ saveId: "a", teamName: "A", difficulty: "pro", finish: "champion", score: 900, at: "2026-01-01", sandbox: true })
        recordDraftCupRun({ saveId: "b", teamName: "B", difficulty: "pro", finish: "semi", score: 300, at: "2026-01-02" })
        const runs = loadDraftCupRuns()
        expect(runs.find(r => r.saveId === "a")?.sandbox).toBe(true)
        expect(runs.find(r => r.saveId === "b")?.sandbox).toBeUndefined()
    })
})
