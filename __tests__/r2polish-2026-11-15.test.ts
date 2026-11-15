/**
 * Regression tests for the round-2 polish fixes of the 2026-11-15 smoke test
 * (unload saving, event year, RU stage names, momentum decision, celebration
 * once, signing date, decimal marks, answered decision notice, Draft Cup board).
 */
import fs from "fs"
import { createSaveSoon, durableStateChanged } from "@/lib/save-soon"
import { matchEventName } from "@/lib/tournament-instances"
import { roundOfName, stageName } from "@/lib/display-names"
import { registerLocale, setLocale } from "@/lib/i18n"
import { generateCareerDecision } from "@/engine/career-decisions"
import type { GameSave, TeamSaveData } from "@/engine/save-types"
import { celebrationPlayed, markCelebrationPlayed } from "@/lib/match-celebration"
import { buildSigningMoment } from "@/store/slices/moments-slice"
import { fmtDelta, signedDelta } from "@/lib/week-report"
import { signedDelta as boardDelta } from "@/components/career/board-view"
import { advanceStopStillOpen } from "@/lib/advance-stops"
import { dealFitsWorld, normalizeDraftCupBoard } from "@/lib/draft-cup-board"
import { DRAFT_ROLES, type DraftPool } from "@/engine/draft-cup"
import { snapshotLoader } from "@/data"

jest.mock("@/data", () => {
    const actual = jest.requireActual("@/data")
    const { SnapshotLoader } = jest.requireActual("@/data/snapshot-loader")
    const nodePath = jest.requireActual("node:path")
    return { ...actual, snapshotLoader: new SnapshotLoader(nodePath.join(process.cwd(), "public/data/snapshot")) }
})
jest.setTimeout(120_000)

const useLocale = (code: string) => {
    registerLocale(code, JSON.parse(fs.readFileSync(`public/locales/${code}.json`, "utf8")))
    setLocale(code)
}
afterEach(() => setLocale("en"))

describe("browser reload: a career change is saved a moment after it happens", () => {
    type S = { saveId: string | null; isInitialized: boolean; isLoading: boolean; continueRun: unknown; teams: unknown[]; toasts: unknown[] }
    function harness(initial: Partial<S> = {}, enabled = true) {
        let state: S = { saveId: "s1", isInitialized: true, isLoading: false, continueRun: null, teams: [], toasts: [], ...initial }
        const listeners = new Set<(s: S, p: S) => void>()
        const save = jest.fn(() => Promise.resolve())
        let dirty = false
        const saver = createSaveSoon<S>({
            subscribe: l => { listeners.add(l); return () => listeners.delete(l) },
            getState: () => state,
            enabled: () => enabled,
            hasUnsavedChanges: () => dirty,
            save: () => { dirty = false; return save() },
            delayMs: 1000,
        })
        const set = (patch: Partial<S>, durable: boolean) => {
            const prev = state
            state = { ...state, ...patch }
            if (durable) dirty = true
            listeners.forEach(l => l(state, prev))
        }
        return { set, save, saver, get state() { return state } }
    }
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it("saves once, shortly after a burst of durable changes", () => {
        const h = harness()
        h.set({ teams: [1] }, true)
        jest.advanceTimersByTime(500)
        h.set({ teams: [1, 2] }, true)
        jest.advanceTimersByTime(999)
        expect(h.save).not.toHaveBeenCalled()
        jest.advanceTimersByTime(1)
        expect(h.save).toHaveBeenCalledTimes(1)
    })

    it("ignores UI-only changes such as toasts (a failed save's toast cannot loop)", () => {
        const h = harness()
        h.set({ toasts: [1] }, false)
        jest.advanceTimersByTime(5000)
        expect(h.save).not.toHaveBeenCalled()
        const teams: unknown[] = []
        expect(durableStateChanged({ teams, toasts: [1] }, { teams, toasts: [] })).toBe(false)
        expect(durableStateChanged({ teams: [1] }, { teams })).toBe(true)
    })

    it("leaves saving to the week tick, a Continue run, or auto-save off", () => {
        for (const patch of [{ isLoading: true }, { continueRun: {} }, { saveId: null }]) {
            const h = harness(patch)
            h.set({ teams: [1] }, true)
            jest.advanceTimersByTime(5000)
            expect(h.save).not.toHaveBeenCalled()
        }
        const off = harness({}, false)
        off.set({ teams: [1] }, true)
        jest.advanceTimersByTime(5000)
        expect(off.save).not.toHaveBeenCalled()
    })

    it("a tick that starts before the timer fires is not interrupted", () => {
        const h = harness()
        h.set({ teams: [1] }, true)
        h.set({ isLoading: true }, false)
        jest.advanceTimersByTime(5000)
        expect(h.save).not.toHaveBeenCalled()
    })

    it("dispose cancels a pending save", () => {
        const h = harness()
        h.set({ teams: [1] }, true)
        h.saver.dispose()
        jest.advanceTimersByTime(5000)
        expect(h.save).not.toHaveBeenCalled()
    })

    it("the shell saves soon in the browser only and prompts on unload only with unsaved progress", () => {
        const src = fs.readFileSync("components/layout/GameShell.tsx", "utf8")
        expect(src).toMatch(/const saveSoon = electronBridge \? null : createSaveSoon/)
        const unload = src.slice(src.indexOf("const handleBeforeUnload"))
        expect(unload.indexOf("if (!hasUnsavedChanges(state)) return")).toBeGreaterThan(-1)
        expect(unload.indexOf("if (!hasUnsavedChanges(state)) return")).toBeLessThan(unload.indexOf("event.preventDefault()"))
    })
})

describe("result page: the event is named with the year it is played in", () => {
    it("prefers the saved instance's name over the calendar's data name", () => {
        expect(matchEventName("Winter Open Katova 2027", "Winter Open Katova 2025", "iem_katowice_s1", 2, "2026-12-02T00:00:00.000Z")).toBe("Winter Open Katova 2027")
    })
    it("without a saved instance, dates the data name by the match's season", () => {
        const name = matchEventName(undefined, "Winter Open Katova 2025", "x_s1", 6, "2026-12-02T00:00:00.000Z")
        expect(name).toBe("Winter Open Katova 2027")
        expect(matchEventName(undefined, undefined, "x", 1)).toBeUndefined()
    })
    it("the page no longer reads the calendar name first", () => {
        const src = fs.readFileSync("app/match/[id]/result/page.tsx", "utf8")
        expect(src).not.toMatch(/tournamentDef\?\.name \|\|/)
        expect(src.match(/matchEventName\(/g)?.length).toBe(2)
    })
})

describe("stage names: round of 16 is 1/8 in Russian and Polish", () => {
    it("Russian", () => {
        useLocale("ru")
        expect(stageName("Round of 16")).toBe("1/8 финала")
        expect(stageName("Round of 32")).toBe("1/16 финала")
        expect(stageName("Round of 16 Match 3")).toBe("1/8 финала · матч 3")
        expect(roundOfName(64)).toBe("1/32 финала")
    })
    it("Polish and German name the round too; English keeps 'Round of 16'", () => {
        useLocale("pl")
        expect(stageName("Round of 16")).toBe("1/8 finału")
        useLocale("de")
        expect(stageName("Round of 16")).toBe("Achtelfinale")
        setLocale("en")
        expect(stageName("Round of 16")).toBe("Round of 16")
        expect(stageName("Round of 128")).toBe("Round of 128")
    })
})

describe("'Three straight wins' counts competitive matches only", () => {
    type M = { id: string; week: number; day?: number; win: boolean; scrim?: boolean; tid?: string }
    function world(matches: M[]): GameSave {
        return {
            currentWeek: 3, eventsLog: [], players: [{ id: "p1", nickname: "ace", morale: 70, fatigue: 10 }],
            teams: [{ id: "t", name: "Ligion", rosterIds: ["p1"], sponsors: [] } as unknown as TeamSaveData],
            completedMatches: matches.map(m => ({ id: m.id, week: m.week, day: m.day, isScrim: m.scrim, tournamentId: m.scrim ? "SCRIM" : (m.tid ?? "league_s1_p1_eu_d1"), homeTeamId: "t", awayTeamId: "o", result: { winnerId: m.win ? "t" : "o", homeScore: m.win ? 1 : 0, awayScore: m.win ? 0 : 1, maps: [] } })),
            playerTeamId: "t",
        } as unknown as GameSave
    }
    const momentum = (save: GameSave) => save.eventsLog.some(e => e.id.endsWith("_momentum"))

    it("scrim L, scrim W, league W, scrim W is one official win: no decision", () => {
        const save = world([{ id: "a", week: 1, win: false, scrim: true }, { id: "b", week: 2, win: true, scrim: true }, { id: "c", week: 2, day: 3, win: true }, { id: "d", week: 3, win: true, scrim: true }])
        generateCareerDecision(save)
        expect(momentum(save)).toBe(false)
    })

    it("three official wins with scrims between them still count", () => {
        const save = world([{ id: "a", week: 1, win: true }, { id: "s", week: 2, day: 0, win: false, scrim: true }, { id: "c", week: 2, day: 2, win: true }, { id: "d", week: 3, win: true, tid: "iem_katowice_open_s1" }])
        generateCareerDecision(save)
        expect(momentum(save)).toBe(true)
    })
})

describe("the win celebration plays once per match", () => {
    it("is marked per career and match", () => {
        expect(celebrationPlayed("c1", "m1", "confetti")).toBe(false)
        markCelebrationPlayed("c1", "m1", "confetti")
        expect(celebrationPlayed("c1", "m1", "confetti")).toBe(true)
        expect(celebrationPlayed("c1", "m1", "advancement")).toBe(false)
        expect(celebrationPlayed("c2", "m1", "confetti")).toBe(false)
    })
    it("the result page checks it before the confetti and the advancing card", () => {
        const src = fs.readFileSync("app/match/[id]/result/page.tsx", "utf8")
        expect(src).toMatch(/!celebrationPlayed\(careerId, match\.id, "confetti"\)/)
        expect(src).toMatch(/if \(celebrationPlayed\(careerId, match\.id, "advancement"\)\) return/)
    })
})

describe("created club crest on the advancing card", () => {
    it("draws the club through TeamLogoDisplay (no guessed /assets/teams/<slug>/logo.webp request)", () => {
        const src = fs.readFileSync("components/tournament/AdvancementAnimation.tsx", "utf8")
        expect(src).not.toMatch(/<Image src=\{teamLogo\}/)
        expect(src).toMatch(/<TeamLogoDisplay team=\{team\}/)
    })
})

describe("new-signing card and contract paper agree on the end date", () => {
    it("the moment keeps the signing day in daily mode", () => {
        const players = [{ id: "p", nickname: "ropx", skill: 70 }]
        const teams = [{ id: "me", name: "Me", rosterIds: ["p"] }]
        const daily = buildSigningMoment({ currentWeek: 6, currentDay: 3, timeMode: "HYBRID_DAILY", playerTeamId: "me", players, teams } as never, { playerId: "p", fee: 0, salaryPerWeek: 1, contractEndWeek: 118, fromTeamId: "FA" })!
        expect(daily.day).toBe(3)
        const weekly = buildSigningMoment({ currentWeek: 6, currentDay: 3, timeMode: "WEEKLY", playerTeamId: "me", players, teams } as never, { playerId: "p", fee: 0, salaryPerWeek: 1, contractEndWeek: 118, fromTeamId: "FA" })!
        expect(weekly.day).toBeUndefined()
    })
    it("the card dates the end with that day, as the paper does", () => {
        const src = fs.readFileSync("components/moments/SigningRevealView.tsx", "utf8")
        expect(src).toMatch(/gameCalendarDate\(gameStartDate, moment\.contractEndWeek, moment\.day \?\? 0\)/)
    })
})

describe("week report and board deltas use the language's decimal mark", () => {
    it("German and Russian use a comma, English a dot", () => {
        expect(signedDelta(0.2)).toBe("+0.2")
        expect(fmtDelta(-2.8)).toBe("2.8")
        expect(fmtDelta(12.4)).toBe("12")
        useLocale("de")
        expect(signedDelta(0.2)).toBe("+0,2")
        expect(signedDelta(-1.5)).toBe("−1,5")
        expect(fmtDelta(0.04)).toBe("0,04")
        expect(boardDelta(0.8)).toBe("+0,8")
        useLocale("ru")
        expect(signedDelta(2.2)).toBe("+2,2")
        expect(fmtDelta(1234)).toBe("1234")
    })
})

describe("'Decision waiting' ends once the decision is answered", () => {
    const pending = { id: "e1", type: "CAREER_UPDATE", week: 3, data: {}, choices: [{ id: "a" }] }
    it("open while unanswered, closed when answered, withdrawn or gone", () => {
        const stop = { key: "event:e1", kind: "event" as const }
        expect(advanceStopStillOpen(stop, [pending] as never)).toBe(true)
        expect(advanceStopStillOpen(stop, [{ ...pending, selectedChoiceId: "a" }] as never)).toBe(false)
        expect(advanceStopStillOpen(stop, [{ ...pending, data: { isWithdrawn: true } }] as never)).toBe(false)
        expect(advanceStopStillOpen(stop, [] as never)).toBe(false)
    })
    it("a grouped stop stays while any of its decisions is open; other stops are untouched", () => {
        const grouped = { key: "event:e1", kind: "event" as const, keys: ["event:e1", "event:e2"] }
        const log = [{ ...pending, selectedChoiceId: "a" }, { ...pending, id: "e2" }]
        expect(advanceStopStillOpen(grouped, log as never)).toBe(true)
        expect(advanceStopStillOpen(grouped, [log[0], { ...log[1], selectedChoiceId: "b" }] as never)).toBe(false)
        expect(advanceStopStillOpen({ key: "contract:p:9", kind: "contract" }, [])).toBe(true)
    })
})

describe("Draft Cup: the draft board survives a reload", () => {
    const pool = Object.fromEntries(DRAFT_ROLES.map((role, i) => [role, [{ playerId: `p${i}`, nickname: `n${i}`, role, overall: 80, price: 20, fromTeamId: "" }]])) as unknown as DraftPool
    const board = { version: 1, step: "draft", worldSeed: 42, managerName: "Ana", teamName: "Draft FC", shortName: "DRF", swatch: 2, difficulty: "pro", rerolls: 0,
        deal: { difficulty: "pro", opponentIds: ["t1"], pool, picks: { IGL: "p0", AWPER: "nope" } } }

    it("keeps a valid board and drops picks that are not in the pool", () => {
        const b = normalizeDraftCupBoard(JSON.parse(JSON.stringify(board)))!
        expect(b.step).toBe("draft")
        expect(b.deal!.picks).toEqual({ IGL: "p0" })
        expect(b.rerolls).toBe(0)
    })
    it("a draft step without a deal falls back to setup; junk is refused", () => {
        expect(normalizeDraftCupBoard({ ...board, deal: undefined })!.step).toBe("setup")
        expect(normalizeDraftCupBoard({ ...board, worldSeed: "x" })).toBeNull()
        expect(normalizeDraftCupBoard(null)).toBeNull()
    })
    it("a deal fits only a world that still has its players and opponents", () => {
        const deal = normalizeDraftCupBoard(board)!.deal!
        expect(dealFitsWorld(deal, new Set(["p0", "p1", "p2", "p3", "p4"]), new Set(["t1"]))).toBe(true)
        expect(dealFitsWorld(deal, new Set(["p0"]), new Set(["t1"]))).toBe(false)
    })
    it("the same seed rebuilds the same players", async () => {
        await snapshotLoader.loadSnapshot()
        const id = snapshotLoader.getSnapshot()!.teams[0].id
        const a = snapshotLoader.createCareerFromSnapshot("a", id, 1, 1234)!
        const b = snapshotLoader.createCareerFromSnapshot("b", id, 1, 1234)!
        expect(b.players.map(p => [p.id, p.morale, p.form, p.skill])).toEqual(a.players.map(p => [p.id, p.morale, p.form, p.skill]))
        expect(b.contracts.map(c => [c.playerId, c.salaryPerWeek, c.endWeek])).toEqual(a.contracts.map(c => [c.playerId, c.salaryPerWeek, c.endWeek]))
    })
})
