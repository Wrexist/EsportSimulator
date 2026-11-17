/**
 * I18N audit 2026-11-17: text that was frozen in one language (or stored as
 * English) now follows the language active when it is shown.
 */
import { readFileSync } from "fs"
import { join } from "path"
import { registerLocale, setLocale, tRef } from "@/lib/i18n"
import { collectStopSignals, nextStop, stopActionText, stopReasonText, type StopSource } from "@/lib/advance-stops"
import { createAdvanceSlice } from "@/store/slices/advance-slice"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { storedText } from "@/lib/stored-text"
import { getEventBody } from "@/components/inbox/inbox-model"
import { lineText } from "@/lib/news-text"
import { EN } from "@/locales/en"
import type { GameSave } from "@/engine/save-types"

const locale = (code: string) => JSON.parse(readFileSync(join(__dirname, "..", "public", "locales", `${code}.json`), "utf8")) as Record<string, string>
const de = locale("de")
const ru = locale("ru")

beforeAll(() => {
    registerLocale("de", de)
    registerLocale("ru", ru)
})
afterEach(() => setLocale("en"))

describe("I18N-01: the match-day notice follows a language change", () => {
    function base(): GameSave {
        const save = createLaunchFixture("first-week")
        save.timeMode = "WEEKLY"
        save.currentDay = 0
        save.currentWeek = 5
        save.scheduledMatches = [{ id: "m1", homeTeamId: save.playerTeamId, awayTeamId: "team_ai_1", week: 5, format: "BO1", stage: "Group", tournamentId: null, seed: 1 } as never]
        return save
    }
    const src = (save: GameSave) => save as unknown as StopSource

    test("a notice built in German reads Russian after the switch", () => {
        setLocale("de")
        const stop = nextStop(src(base()), new Set())!
        expect(stop.reason).toBe(de["stop.playFormat"].replace("{{team}}", "AI Team 1").replace("{{format}}", "BO1"))
        setLocale("ru")
        expect(stopReasonText(stop)).toBe(ru["stop.playFormat"].replace("{{team}}", "AI Team 1").replace("{{format}}", "BO1"))
        expect(stopActionText(stop)).toBe(ru["stop.playMatch"])
    })

    test("restoreMatchStop keeps the refs (a reload before the language file loaded showed English)", () => {
        const save = base()
        let state = { ...save, saveId: "s1", isLoading: false, gameOverReason: null, continueRun: null, advanceStop: null, advanceSeenKeys: [] } as Record<string, unknown>
        const set = (patch: unknown) => { state = typeof patch === "function" ? state : { ...state, ...(patch as object) } }
        createAdvanceSlice(set as never, (() => state) as never).restoreMatchStop()
        const notice = state.advanceStop as Parameters<typeof stopReasonText>[0]
        expect(notice.reason).toBe("Play AI Team 1 (BO1)")
        setLocale("de")
        expect(stopReasonText(notice)).toBe("Gegen AI Team 1 spielen (BO1)")
    })

    test("every other stop kind carries a ref too (injury, contract, grouped)", () => {
        const save = base()
        save.scheduledMatches = []
        save.players[0].injury = { type: "RSI", name: "Wrist Strain", weeksRemaining: 2 } as never
        save.contracts.find(c => c.playerId === "p_a2")!.endWeek = 6
        for (const s of collectStopSignals(src(save))) {
            expect(s.reasonRef).toBeDefined()
            setLocale("ru")
            expect(stopReasonText(s)).not.toBe(s.reason)
            setLocale("en")
            expect(stopReasonText(s)).toBe(s.reason)
        }
    })

    test("a stop without refs (built by older code) still shows its text", () => {
        setLocale("de")
        expect(stopReasonText({ reason: "Old text" })).toBe("Old text")
        expect(stopActionText({ actionLabel: "Go" })).toBe("Go")
    })
})

describe("I18N-02 / I18N-04: week-report causes written in English are translated when shown", () => {
    test("German and Russian, old and new saves alike", () => {
        setLocale("de")
        expect(storedText("Natural growth (age 16)")).toBe("Natürliche Entwicklung (16 Jahre)")
        expect(storedText("Natural growth")).toBe("Natürliche Entwicklung")
        expect(storedText("Age decline (age 31)")).toBe("Altersabbau (31 Jahre)")
        expect(storedText("Weekly injury roll (risk rises with fatigue)")).toBe(de["svd.injuryRoll"])
        expect(storedText("New season")).toBe("Neue Saison")
        expect(storedText("Medical treatment")).toBe("Medizinische Behandlung")
        expect(storedText("Transfer offer accepted")).toBe("Transferangebot angenommen")
        expect(storedText("Released ace")).toBe("ace freigestellt")
        expect(storedText("Released a player")).toBe("Spieler freigestellt")
        expect(storedText("Released Academy Prospect")).toBe(de["svd.led.releasedProspect"])
        expect(storedText("Paid less than ZywOo")).toBe("Verdient weniger als ZywOo")
        expect(storedText("Benched 3 matches")).toBe("3 Matches auf der Bank")
        expect(storedText("Natural growth (age 16) · Benched 1 match")).toBe("Natürliche Entwicklung (16 Jahre) · 1 Match auf der Bank")
        setLocale("ru")
        expect(storedText("Benched 22 matches")).toBe("22 матча на скамейке")
        expect(storedText("Benched 5 matches")).toBe("5 матчей на скамейке")
    })

    test("English stays as the engine wrote it", () => {
        expect(storedText("Natural growth (age 16)")).toBe("Natural growth (age 16)")
        expect(storedText("Benched 3 matches")).toBe("Benched 3 matches")
    })
})

describe("I18N-03: budget warnings are translated (new events by key, older saves by their English)", () => {
    test("older saves: the four English sentences", () => {
        setLocale("de")
        expect(storedText("Budget is getting tight. You have 3 weeks of runway remaining. Consider reducing expenses.")).toBe(de["evn.budget.TIGHT.other"].replace("{{count}}", "3"))
        expect(storedText("Financial warning! Only 1 week of runway left. Cut costs or find new income sources urgently.")).toBe(de["evn.budget.RISK.one"].replace("{{count}}", "1"))
        expect(storedText("CRITICAL: Team finances in crisis! 2 weeks until insolvency. Players are losing morale.")).toBe(de["evn.budget.CRISIS.other"].replace("{{count}}", "2"))
        setLocale("ru")
        expect(storedText("Team is INSOLVENT. This is week 4 of 8 consecutive insolvent settlements before the club disbands. Restore a positive balance by a weekly settlement to reset this counter.")).toBe(ru["evn.budget.INSOLVENT"].replace("{{week}}", "4"))
    })

    test("the English keys reproduce the old English text exactly", () => {
        setLocale("en")
        expect(tRef({ key: "evn.budget.TIGHT", count: 1 })).toBe("Budget is getting tight. You have 1 week of runway remaining. Consider reducing expenses.")
        expect(tRef({ key: "evn.budget.CRISIS", count: 5 })).toBe("CRITICAL: Team finances in crisis! 5 weeks until insolvency. Players are losing morale.")
    })

    test("the inbox body of an older warning follows the language", () => {
        setLocale("de")
        const event = { id: "budget_warning_5_RISK", type: "BUDGET_WARNING", week: 5, acknowledged: false, data: { description: "Financial warning! Only 2 weeks of runway left. Cut costs or find new income sources urgently." } }
        expect(getEventBody(event as never, { currentWeek: 5, playerTeamId: "t", rosterIds: new Set() } as never)).toBe(de["evn.budget.RISK.other"].replace("{{count}}", "2"))
    })
})

describe("I18N-04: smaller stored-English leaks", () => {
    const pressAnswerKey = Object.keys(EN).find(k => k.startsWith("press.a.") && !(EN as Record<string, string>)[k].includes("{{"))!
    const answerEn = (EN as Record<string, string>)[pressAnswerKey]

    test("forfeit notices: new (refs) and saved English", () => {
        setLocale("de")
        expect(storedText("Your team forfeited against Foo: only 4/5 players were available.")).toBe(de["evn.forfeit.lost"].replace("{{team}}", "Foo").replace("{{n}}", "4"))
        expect(storedText("Foo forfeited your match — win by default!")).toBe(de["evn.forfeit.won"].replace("{{team}}", "Foo"))
        const event = { id: "forfeit_4_m1", type: "MATCH_RESULT", week: 4, acknowledged: false, data: { description: "Foo forfeited your match — win by default!" } }
        expect(getEventBody(event as never, { currentWeek: 4, playerTeamId: "t", rosterIds: new Set() } as never)).toBe(de["evn.forfeit.won"].replace("{{team}}", "Foo"))
    })

    test("storyline lines and the press ledger line", () => {
        setLocale("de")
        expect(lineText({ text: "You left the club, which ends the story." })).toBe(de["sl.managerLeft"])
        expect(lineText({ text: `You told the press, "${answerEn}"` })).toBe(de["sl.toldPress"].replace("{{answer}}", de[pressAnswerKey]))
        expect(storedText(`Press conference: "${answerEn}"`)).toBe(de["svd.p.pressAnswer"].replace("{{answer}}", de[pressAnswerKey]))
        expect(lineText({ text: "Some line", ref: { key: "sl.managerLeft" } })).toBe(de["sl.managerLeft"])
        setLocale("en")
        expect(tRef({ key: "sl.toldPress", params: { answer: { key: pressAnswerKey } } })).toBe(`You told the press, "${answerEn}"`)
    })

    test("role mastery moment (saved English names the training role)", () => {
        setLocale("de")
        expect(storedText("Mastered awper as secondary role")).toBe(de["moment.roleMastered"].replace("{{role}}", de["tr.role.awper"]))
        setLocale("en")
        expect(tRef({ key: "moment.roleMastered", params: { role: { key: "market.role.AWPER" } } })).toBe("Mastered the AWPer role")
    })

    test("error stop notice", () => {
        setLocale("de")
        expect(tRef({ key: "stop.errorCalendar" })).toBe(de["stop.errorCalendar"])
    })
})
