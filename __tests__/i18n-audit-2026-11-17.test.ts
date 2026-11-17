/**
 * I18N audit 2026-11-17: text that was frozen in one language (or stored as
 * English) now follows the language active when it is shown.
 */
import { readFileSync } from "fs"
import { join } from "path"
import { registerLocale, setLocale } from "@/lib/i18n"
import { collectStopSignals, nextStop, stopActionText, stopReasonText, type StopSource } from "@/lib/advance-stops"
import { createAdvanceSlice } from "@/store/slices/advance-slice"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { storedText } from "@/lib/stored-text"
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
