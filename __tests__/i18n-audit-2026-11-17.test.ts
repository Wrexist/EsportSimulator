/**
 * I18N audit 2026-11-17: text that was frozen in one language (or stored as
 * English) now follows the language active when it is shown.
 */
import { readFileSync } from "fs"
import { join } from "path"
import { formatPercent, registerLocale, setLocale, tRef } from "@/lib/i18n"
import { collectStopSignals, nextStop, stopActionText, stopReasonText, type StopSource } from "@/lib/advance-stops"
import { createAdvanceSlice } from "@/store/slices/advance-slice"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { storedText } from "@/lib/stored-text"
import { getEventBody } from "@/components/inbox/inbox-model"
import { lineText } from "@/lib/news-text"
import { stageName } from "@/lib/display-names"
import { applySandboxEdit, enableSandbox, type SandboxTarget } from "@/engine/sandbox"
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

describe("I18N-05 / I18N-06: stage names", () => {
    test("a Swiss round with its record, through stored text", () => {
        setLocale("de")
        expect(storedText("Swiss Round 1 (0-0)")).toBe(de["stage.swiss"].replace("{{n}}", "1").replace("{{record}}", "0-0"))
        expect(tRef({ key: "@stored", params: { text: "Swiss Round 3 (2-0)" } })).toBe(de["stage.swiss"].replace("{{n}}", "3").replace("{{record}}", "2-0"))
    })

    test("the bracket's 3rd place column", () => {
        setLocale("ru")
        expect(stageName("3rd Place")).toBe(ru["stage.thirdPlace"])
        setLocale("en")
        expect(stageName("3rd Place")).toBe(stageName("3rd Place Decider"))
    })
})

describe("I18N-07: legend achievements in the legend pick", () => {
    test("every line of every legend is translated in Russian (only the play name Olofpass stays)", () => {
        const { LEGENDARY_PLAYERS } = jest.requireActual("@/engine/legendary-players-data") as { LEGENDARY_PLAYERS?: Array<{ legendaryAchievements?: string[] }> }
        const lines = [...new Set((LEGENDARY_PLAYERS ?? []).flatMap(p => p.legendaryAchievements ?? []))]
        expect(lines.length).toBeGreaterThan(50)
        setLocale("ru")
        const untranslated = lines.filter(l => storedText(l) === l && l !== "Olofpass")
        expect(untranslated).toEqual([])
    })

    test("counted and dated lines", () => {
        setLocale("de")
        expect(storedText("2x Major Champion")).toBe(de["moment.major.other"].replace("{{count}}", "2"))
        expect(storedText("4x Player of the Year")).toBe("4× Spieler des Jahres")
        expect(storedText("Major champion 2020")).toBe("Major-Sieg 2020")
        expect(storedText("Best Player 2013-2014")).toBe("Bester Spieler 2013-2014")
    })
})

describe("I18N-08: sandbox editor results and log follow the language", () => {
    const target = (): SandboxTarget => ({
        currentWeek: 20,
        teams: [{ id: "t", name: "Club", shortName: "CLB", budget: 100000 } as never],
        players: [{ id: "p", nickname: "ace", name: "A Person", age: 19, skill: 60 } as never],
        contracts: [{ playerId: "p", teamId: "t", salaryPerWeek: 1500, startWeek: 1, endWeek: 40, buyout: 0 }],
    })

    test("English text unchanged; German from the refs (digit grouping, labels, no 'He')", () => {
        const t = target()
        enableSandbox(t)
        const money = applySandboxEdit(t, { kind: "money", teamId: "t", budget: 500000 })
        expect(money.ok && money.what).toBe("Club: money 100,000 → 500,000")
        const player = applySandboxEdit(t, { kind: "player", playerId: "p", age: 20, nickname: "zed" })
        expect(player.ok && player.what).toBe("zed: age 19 → 20, nickname → zed")
        const contract = applySandboxEdit(t, { kind: "contract", playerId: "p", salaryPerWeek: 2000, endWeek: 60 })
        expect(contract.ok && contract.what).toBe("zed's contract: wage 1,500 → 2,000/wk, ends week 40 → 60")
        setLocale("de")
        expect(money.ok && tRef(money.whatRef)).toBe("Club: Geld 100.000 → 500.000")
        expect(player.ok && tRef(player.whatRef)).toBe("zed: Alter 19 → 20, Nickname → zed")
        expect(tRef(t.sandbox!.log[0].whatRef!)).toBe("Vertrag von zed: Gehalt 1.500 → 2.000/Woche, Vertragsende Woche 40 → 60")
        const refused = applySandboxEdit({ ...target(), contracts: [] , sandbox: { enabledWeek: 1, edits: 0, log: [] } }, { kind: "contract", playerId: "p", salaryPerWeek: 1 })
        expect(!refused.ok && tRef(refused.reasonRef)).toBe(de["sb.noContract"])
        expect(!refused.ok && refused.reason).not.toMatch(/\bHe\b/)
    })
})

describe("I18N-09: percentages follow the language's spacing", () => {
    test("formatPercent", () => {
        expect(formatPercent(23)).toBe("23%")
        expect(formatPercent(14.5)).toBe("15%")
        expect(formatPercent(4.25, 1)).toBe("4.3%")
        setLocale("de")
        expect(formatPercent(23).replace(/\s/g, " ")).toBe("23 %")
        expect(formatPercent(4.25, 1).replace(/\s/g, " ")).toBe("4,3 %")
        setLocale("ru")
        expect(formatPercent(82).replace(/\s/g, " ")).toBe("82 %")
    })

    test("no hand-built percentages left at the audited call sites", () => {
        const files = ["app/match/[id]/tactics/page.tsx", "app/training/page.tsx", "app/trophies/page.tsx", "app/staff/page.tsx", "app/squad/page.tsx", "app/basecamp/page.tsx", "components/stats/MapDataPanel.tsx", "components/player/DevelopmentOutlook.tsx", "app/match/[id]/veto/page.tsx", "components/squad/LoadChip.tsx", "app/basecamp/_components/GearCatalog.tsx"]
        for (const f of files) {
            const src = readFileSync(join(__dirname, "..", f), "utf8")
            // A number followed by a literal % sign in text (CSS widths and positions are fine).
            const hits = src.split("\n").filter(l => !/^\s*(\/\/|\*)/.test(l) && /(\}|\d)%(`|<|\)|"\s*\}|\s)/.test(l) && !/(width|left|top|height|translate)/.test(l))
            expect({ f, hits }).toEqual({ f, hits: [] })
        }
    })
})

describe("I18N-10: native Electron dialogs follow the game's language", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { STRINGS, UI_LANGUAGES, pickUiLanguage } = require("../electron/ui-strings")
    test("every shipped language has every dialog string", () => {
        const keys = Object.keys(STRINGS.en).sort()
        expect(UI_LANGUAGES.sort()).toEqual(["de", "en", "es", "fr", "pl", "pt-BR", "ru"])
        for (const lang of UI_LANGUAGES) {
            expect(Object.keys(STRINGS[lang]).sort()).toEqual(keys)
            for (const k of keys) expect(STRINGS[lang][k].trim().length).toBeGreaterThan(0)
        }
        expect(pickUiLanguage("de-AT")).toBe("de")
        expect(pickUiLanguage("pt_PT")).toBe("pt-BR")
        expect(pickUiLanguage("ja")).toBeNull()
    })
    test("the renderer's language reaches the main process over the gated channel", async () => {
        const fs = await import("node:fs")
        const os = await import("node:os")
        const path = await import("node:path")
        const vm = await import("node:vm")
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { loadHandlers } = require("../scripts/launch/electron-handler-harness.cjs")
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "esim-ipc-test-"))
        try {
            const harness = loadHandlers({ directory })
            const main = harness.contexts["main.js"]
            expect(await harness.invoke("app-set-ui-language", "ru")).toBe(true)
            expect(vm.runInContext("ui('closeWithoutSaving')", main)).toBe("Закрыть без сохранения")
            expect(await harness.invoke("app-set-ui-language", "xx")).toBe(false)
            expect(await harness.invoke("app-set-ui-language", "de", "extra")).toBe(false)
            expect(vm.runInContext("ui('quit')", main)).toBe("Выйти")
            expect(await harness.invoke("app-set-ui-language", "de")).toBe(true)
            expect(vm.runInContext("ui('quit')", main)).toBe("Beenden")
        } finally {
            fs.rmSync(directory, { recursive: true, force: true })
        }
    })
})
