/**
 * Audit 2026-11-17 smoke run B regressions:
 *  - SMOKE-B-01..04: week report text (unanswered answers, job offers and
 *    bids, ranking causes, event-title causes) reads in German for new saves
 *    (stored keys) and old ones (stored English) with no English left.
 *  - SMOKE-B-05: no offer from a club with a full senior squad.
 *  - SMOKE-B-10: the offer names the starter the pro would push out.
 *  - SMOKE-B-16: an insolvent week re-sends the warning with the new count.
 *  - SMOKE-B-17: the career draft keeps the save the roster builder belongs to.
 *  - SMOKE-B-19/21: headline casing and the money sign on its line.
 */
import { readFileSync } from "fs"
import { join } from "path"
import { registerLocale, setLocale, t, tRef } from "@/lib/i18n"
import { storedText } from "@/lib/stored-text"
import { weekHeadline, type WeekReport } from "@/lib/week-report"
import { expireDecisions, expiredDecisionCause } from "@/engine/decision-deadlines"
import { rankEntries, rankMovementEntries } from "@/engine/ranking-report"
import { findOfferingClub, offerDisplaces } from "@/engine/pro-career"
import { SENIOR_ROSTER_MAX } from "@/engine/roster-rules"
import { FinanceProcessor } from "@/engine/processors/finance-processor"
import { normalizeCareerDraft } from "@/lib/new-career-draft"
import type { ContractSaveData, GameEventSaveData, GameSave, PlayerSaveData, TeamSaveData } from "@/engine/save-types"

const de = JSON.parse(readFileSync(join(__dirname, "..", "public", "locales", "de.json"), "utf8")) as Record<string, string>

beforeAll(() => registerLocale("de", de))
afterEach(() => setLocale("en"))

/** English words the checked German lines must not contain. */
const ENGLISH = /\b(Send|Wishes|Roster|Shakeup|Warning|Stay|Focused|Job offer|Bid for|Other clubs|results|this week|passed by|dropped behind|Happy birthday|Your results|Beat|Lost to|Unanswered|Staff answered|equipment deal|Interview request)\b/

function noEnglish(s: string) {
    expect({ s, english: s.match(ENGLISH)?.[0] ?? null }).toEqual({ s, english: null })
}

describe("SMOKE-B-01..04: old saves' stored English reads in German", () => {
    test.each([
        "Send Wishes",
        "Roster Shakeup Warning",
        "Stay Focused",
        "Stay at Rebels",
        "Job offer from Rebels",
        "Bid for s1mple",
        "Unanswered: Job offer from Rebels",
        "Unanswered: Bid for s1mple",
        "Other clubs' results this week: passed by C, D",
        "Other clubs' results this week: passed by C; D dropped behind",
        "Happy birthday, ace!",
        "Interview request: HLTV",
        "Zowie equipment deal",
    ])("%s", english => {
        setLocale("de")
        const out = storedText(english)
        expect(out).not.toBe(english)
        noEnglish(out)
    })
})

describe("SMOKE-B-01/02: new saves store the label and answer as keys", () => {
    function save(type: string, data: Record<string, unknown>, choices: GameEventSaveData["choices"]) {
        return {
            currentWeek: 12, playerTeamId: "me", acknowledgedEventIds: [], financeLedger: [],
            teams: [{ id: "me", budget: 100_000, rosterIds: ["p1"] }],
            players: [{ id: "p1", nickname: "ace", morale: 70 }],
            eventsLog: [{ id: "e1", week: 10, type, acknowledged: false, data: { deadlineWeek: 11, ...data }, choices }],
        } as unknown as GameSave
    }

    test("a job offer that lapses", () => {
        const s = save("JOB_OFFER", { offeringTeamName: "Rebels" }, [{ id: "decline", text: "Decline", effects: {} }] as never)
        const [d] = expireDecisions(s)
        expect(d.labelRef).toEqual({ key: "svd.p.jobOfferFrom", params: { club: "Rebels" } })
        const cause = expiredDecisionCause(d, "unanswered")
        expect(cause.label).toBe("Unanswered: Job offer from Rebels")
        setLocale("de")
        const text = tRef(cause.ref!)
        expect(text).toContain("Rebels")
        noEnglish(text)
    })

    test("an applied default keeps the choice's key", () => {
        const s = save("PLAYER_BIRTHDAY", { playerId: "p1", defaultChoiceId: "wishes" },
            [{ id: "wishes", text: "Send Wishes", ref: { key: "rnd.c.wishes" }, effects: {} }] as never)
        const [d] = expireDecisions(s)
        expect(d.applied).toBe(true)
        expect(d.outcomeRef).toEqual({ key: "rnd.c.wishes" })
        const stored = (s.eventsLog[0].data as { unanswered: { outcomeRef?: unknown } }).unanswered
        expect(stored.outcomeRef).toEqual({ key: "rnd.c.wishes" })
        setLocale("de")
        noEnglish(tRef(d.outcomeRef!))
    })
})

describe("SMOKE-B-03: ranking causes carry keys", () => {
    const teams = [
        { id: "me", name: "Me", worldRank: 5, prevWorldRank: 3 },
        { id: "c", name: "C", worldRank: 3, prevWorldRank: 4 },
        { id: "d", name: "D", worldRank: 4, prevWorldRank: 6 },
    ]

    test("other clubs' results", () => {
        const entries = rankEntries({ teams } as unknown as GameSave, "me", { from: 3, to: 5, own: 0, others: 2, passedBy: ["c", "d"], droppedBehind: [] } as never, { type: "match", label: "x" }, " this week")
        const others = entries.find(e => e.cause.type === "world")!
        expect(others.cause.label).toBe("Other clubs' results this week: passed by C, D")
        setLocale("de")
        noEnglish(tRef(others.cause.ref!))
    })

    test("rank movement entries never fall back to English for the own-results cause", () => {
        const save = { teams, completedMatches: [], tournaments: [], currentWeek: 1 } as unknown as GameSave
        setLocale("de")
        for (const e of rankMovementEntries(save, "me")) if (e.cause.ref) noEnglish(tRef(e.cause.ref))
    })
})

describe("SMOKE-B-04: event-title causes", () => {
    test("a stored title reads in German", () => {
        setLocale("de")
        noEnglish(storedText("Happy birthday, ace!"))
        expect(storedText("Happy birthday, ace!")).toBe(t("rnd.birthday.t", { name: "ace" }))
    })
})

const STATS = ["skill", "rifle", "awp", "pistol", "grenades", "creativity", "clutch", "tactic", "leader", "teamwork", "reaction", "eyesight", "entry", "trading"] as const
function flat(id: string, role: string, v: number): PlayerSaveData {
    return {
        id, nickname: id, name: id, age: 22, nationality: "Sweden", role, morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, potential: 85, productivity: 60, endurance: 70, unlockedTalentIds: [],
        ...Object.fromEntries(STATS.map(k => [k, v])),
    } as unknown as PlayerSaveData
}
function team(id: string, over: Partial<TeamSaveData>): TeamSaveData {
    return { id, name: id, shortName: id.toUpperCase(), budget: 1_000_000, rosterIds: [], staffIds: [], trophies: [], facilities: [], sponsors: [], fanbase: 1000, reputation: 50, region: "EU", ...over } as unknown as TeamSaveData
}

describe("SMOKE-B-05/10: club offers to the pro", () => {
    const W = 20
    function world(extra: number) {
        const roles = [["igl", "IGL"], ["awp", "AWPER"], ["entry", "ENTRY_FRAGGER"], ["rifler", "RIFLER"], ["support", "SUPPORT"]] as const
        const club = roles.map(([id, role]) => flat(`b_${id}`, role, id === "awp" ? 70 : 72))
        const bench = Array.from({ length: extra }, (_, i) => flat(`b_bench${i}`, "RIFLER", 40))
        const pro = flat("pro", "AWPER", 80)
        const mates = ["a", "b", "c", "d", "e"].map(id => flat(id, "RIFLER", 40))
        return {
            saveId: "s", currentWeek: W, playerTeamId: "home",
            teams: [team("home", { reputation: 30, rosterIds: [...mates.map(p => p.id), "pro"] }), team("big", { reputation: 40, rosterIds: [...club, ...bench].map(p => p.id) })],
            players: [...mates, pro, ...club, ...bench], contracts: [], eventsLog: [],
            proCareer: { playerId: "pro", startWeek: 1, clubs: [{ teamId: "home", fromWeek: 1 }] },
        } as unknown as GameSave
    }

    test("a club one short of the cap makes the offer; a full one does not", () => {
        expect(findOfferingClub(world(SENIOR_ROSTER_MAX - 6))?.id).toBe("big")
        expect(findOfferingClub(world(SENIOR_ROSTER_MAX - 5))).toBeUndefined()
    })

    test("the offer names the starter he would replace", () => {
        const save = world(0)
        expect(offerDisplaces(save, save.teams[1], save.players.find(p => p.id === "pro")!)?.id).toBe("b_awp")
    })
})

describe("SMOKE-B-16: insolvency reminder every week", () => {
    test("a second insolvent week sends the warning with the new count", () => {
        const rosterIds = Array.from({ length: 10 }, (_, i) => `p${i}`)
        const t1 = team("t1", { budget: 1_000, reputation: 5, fanbase: 0, rosterIds, consecutiveInsolventWeeks: 4, facilitiesLevel: 0 } as Partial<TeamSaveData>)
        t1._prevFinancialState = "INSOLVENT"
        const contracts = rosterIds.map((pid, i) => ({ id: `c${i}`, playerId: pid, teamId: "t1", salaryPerWeek: 5000, startWeek: 1, endWeek: 52, buyout: 0 })) as unknown as ContractSaveData[]
        const save = {
            currentWeek: 10, currentDay: 6, playerTeamId: "t1", teams: [t1], players: [], contracts, tournaments: [], staff: [],
            scheduledMatches: [], completedMatches: [], scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [], acknowledgedEventIds: [],
        } as unknown as GameSave
        FinanceProcessor.processFinance(save, "t1")
        expect(t1.financialState).toBe("INSOLVENT")
        const warning = save.eventsLog.find(e => e.type === "BUDGET_WARNING")
        expect((warning?.data as { messageRef?: unknown })?.messageRef).toEqual({ key: "evn.budget.INSOLVENT", params: { week: 5 } })
    })
})

describe("SMOKE-B-17: the career draft remembers the started save", () => {
    test("createdSaveId survives normalize", () => {
        expect(normalizeCareerDraft({ version: 1, managerName: "M", createdSaveId: "save_1" })?.createdSaveId).toBe("save_1")
        expect(normalizeCareerDraft({ version: 1, managerName: "M", createdSaveId: 5 })?.createdSaveId).toBeUndefined()
    })
})

describe("SMOKE-B-19/21: week headline", () => {
    const base = {
        v: 1, week: 4, teamId: "me", names: { p1: "ace" }, kpis: { budget: [0, 0], rank: [null, null], elo: [0, 0], board: [null, null], chemistry: [0, 0], morale: [null, null], reputation: [0, 0] }, unanswered: [], matches: [], warnings: [],
    } as unknown as Omit<WeekReport, "headline">

    test("the growth cause keeps its capitals after the first letter", () => {
        const h = weekHeadline({ ...base, changes: [{ kind: "attribute", subjectId: "p1", label: "Aim", delta: 3, cause: { type: "training", label: "Drill: VOD review" } }] } as never)
        expect(h).toContain("drill: VOD review")
    })

    test("the money sign stays on the amount's line", () => {
        const h = weekHeadline({ ...base, changes: [{ kind: "money", subjectId: "me", label: "Wages", delta: -900, cause: { type: "wages", label: "Wages" } }] } as never)
        expect(h).toMatch(/−⁠\$900/)
    })
})
