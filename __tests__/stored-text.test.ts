/**
 * Display-time translation of English text the save keeps (weekly report
 * labels and causes, ledger lines): exact entries, same-text keys, patterns,
 * and the English passing through untouched.
 */
import { readFileSync } from "fs"
import { join } from "path"
import { registerLocale, setLocale } from "@/lib/i18n"
import { storedText } from "@/lib/stored-text"
import { weekHeadline, type WeekReport } from "@/lib/week-report"

const de = JSON.parse(readFileSync(join(__dirname, "..", "public", "locales", "de.json"), "utf8")) as Record<string, string>

beforeAll(() => registerLocale("de", de))
afterEach(() => setLocale("en"))

describe("storedText", () => {
    test("English is returned as written", () => {
        expect(storedText("Recovered from Wrist Strain")).toBe("Recovered from Wrist Strain")
        expect(storedText("")).toBe("")
        expect(storedText(undefined)).toBe("")
    })

    test("exact entries, patterns and segments in German", () => {
        setLocale("de")
        expect(storedText("Player wages")).toBe("Spielergehälter")
        expect(storedText("Recovered from Wrist Strain")).toBe("Erholt von: Handgelenkszerrung")
        expect(storedText("Aim training · coach ×1.10 · training facility L2")).toBe("Aim-Training · Coach ×1.10 · Leistungszentrum St. 2")
        expect(storedText("Leadership")).toBe("Führung")
        expect(storedText("Transfer Fee: s1mplee")).toBe("Ablöse: s1mplee")
        expect(storedText("Unanswered: Unhappy player (ace)")).toBe("Unbeantwortet: Unzufriedener Spieler (ace)")
        expect(storedText("ace's contract ends in 3 weeks")).toBe("Vertrag von ace endet in 3 Wochen")
        expect(storedText("TRAINING Facility — Upgrade to Level 3")).toBe("Leistungszentrum: Ausbau auf Stufe 3")
    })

    test("unknown text stays as written", () => {
        setLocale("de")
        expect(storedText("Something the engine never wrote")).toBe("Something the engine never wrote")
    })
})

describe("weekHeadline in another language", () => {
    const report: Omit<WeekReport, "headline"> = {
        v: 1, week: 5, teamId: "us", changes: [], warnings: [], names: {},
        matches: [{ id: "m1", opponentId: "them", opponentName: "Nemesis", won: true, score: "2–1", competition: "League" }],
        kpis: { budget: [0, 0], rank: [16, 14], elo: [1000, 1010], board: [50, 50], chemistry: [50, 50], morale: [60, 60], reputation: [10, 10] },
    }

    test("English matches the saved wording", () => {
        expect(weekHeadline(report)).toBe("Beat Nemesis 2–1 and climbed 2 places to #14.")
    })

    test("German builds the same sentence from the same data", () => {
        setLocale("de")
        expect(weekHeadline(report)).toBe("Sieg gegen Nemesis 2–1 und 2 Plätze hoch auf #14.")
    })
})
