/**
 * Display-time translation of English text the save keeps (weekly report
 * labels and causes, ledger lines): exact entries, same-text keys, patterns,
 * and the English passing through untouched.
 */
import { readFileSync } from "fs"
import { join } from "path"
import { JOIN_REF, LIST_REF, NUMBER_REF, ORDINAL_REF, STORED_REF, registerLocale, setLocale, tRef, tRefEn } from "@/lib/i18n"
import { pressText } from "@/engine/storylines/press-view"
import { lineText, newsContent, newsTitle } from "@/lib/news-text"
import { divisionRef, newsText } from "@/lib/news-ref"
import { storedText } from "@/lib/stored-text"
import { weekHeadline, type WeekReport } from "@/lib/week-report"
import { rivalLine } from "@/engine/transfer-hype"
import { momentHeadline } from "@/engine/moments"

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

describe("moments and Continue stops", () => {
    test("rival lists follow the language's list style", () => {
        expect(rivalLine(["A", "B", "C"], 5)).toBe("A, B, C and 2 other clubs")
        setLocale("de")
        expect(rivalLine(["A", "B", "C"], 5)).toBe("A, B, C und 2 weiteren Vereinen")
    })
    test("a stored division name in a moment headline is shown in the active language", () => {
        const m = { kind: "promotion", key: "k", week: 10, scope: "division", season: 1, fromLabel: "Europe Division 3", toLabel: "Europe Division 2" } as const
        expect(momentHeadline(m as never)).toBe("Promoted to Europe Division 2")
        setLocale("de")
        expect(momentHeadline(m as never)).not.toContain("Promoted")
    })
})

describe("press conferences", () => {
    const decider = {
        key: "press.q.decider",
        params: {
            team: "Us",
            detail: { key: "press.detail.promotion", count: 2, params: { pos: { key: ORDINAL_REF, count: 3 }, division: { key: "league.divisionName", params: { region: { key: "region.EUROPE" }, level: 2 } } } },
        },
    }
    test("nested values, ordinals and lists are shown in the active language", () => {
        expect(tRefEn(decider)).toBe("Us are 3rd in Europe Division 2, 2 rounds left, promotion at stake. How do you handle the pressure?")
        setLocale("de")
        expect(tRef(decider)).toBe("Us: 3. Platz in Europa Division 2, noch 2 Spieltage, es geht um den Aufstieg. Wie geht ihr mit dem Druck um?")
        expect(tRefEn(decider)).toContain("3rd in Europe Division 2")
        expect(tRef({ key: LIST_REF, params: { 0: "A", 1: "B", 2: { key: "press.aTopSide" } } })).toBe("A, B und ein Spitzenteam")
    })
    test("a question saved before translation keys keeps its English text", () => {
        setLocale("de")
        expect(pressText({ text: "Old question?" })).toBe("Old question?")
        expect(pressText({ text: "No comment.", ref: { key: "press.noComment" } })).toBe("Kein Kommentar.")
    })
})

describe("storylines", () => {
    test("news and story lines show the active language, old saves keep their English", () => {
        const title = { key: "sl.ld.retired", count: 120, params: { name: "Ace", age: 33, rating: "1.10", trophies: { key: "sl.ld.trophies", count: 1 } } }
        expect(tRefEn(title)).toBe("Ace retires at 33 after 120 official maps (career rating 1.10, 1 trophy).")
        setLocale("de")
        expect(newsTitle({ title: "x", titleRef: title })).toBe("Ace beendet mit 33 seine Karriere nach 120 offiziellen Maps (Karriere-Rating 1.10, 1 Titel).")
        expect(newsContent({ content: "Old English." })).toBe("Old English.")
        expect(lineText({ text: "x", ref: { key: JOIN_REF, params: { sep: " ", 0: { key: "sl.bp.log", params: { confidence: 30 } }, 1: { key: "sl.gk.reward", params: { fans: { key: NUMBER_REF, count: 12000 }, board: 5 } } } } }))
            .toBe("Vorstandsvertrauen auf 30/100 gefallen. Der Lauf bringt 12.000 neue Follower, und das Vertrauen des Vorstands steigt um 5.")
        expect(lineText({ text: "x", ref: { key: "sl.bp.setbacks", params: { causes: { key: LIST_REF, params: { 0: { key: STORED_REF, params: { text: "Lost to THEM" } } } } } } })).toBe("Jüngste Rückschläge: Niederlage gegen THEM.")
    })
})

describe("news feed", () => {
    test("engine news keep English text and show the active language", () => {
        const item = newsText(
            { key: "nw.league.won", params: { team: "Us", division: divisionRef("Europe Division 2") } },
            { key: "nw.league.c", params: { team: "Us", pos: { key: ORDINAL_REF, count: 3 }, n: 10, w: 7, l: 2, fate: { key: "nw.league.up", params: { level: 1 } } } },
        )
        expect(item.title).toBe("Us win Europe Division 2")
        expect(item.content).toBe("Us finished 3rd of 10 (7–2). Promoted to Division 1 for the next split.")
        setLocale("de")
        expect(newsTitle(item)).toBe("Us gewinnt Europa Division 2")
        expect(newsContent(item)).toBe("Us beendet den Split als 3. von 10 (7–2). Aufstieg in Division 1 zum nächsten Split.")
        const injury = newsText({ key: "nw.injury.t", params: { name: "Ace", injury: { key: STORED_REF, params: { text: "Wrist Strain" } } } }, { key: "nw.sev.MINOR" })
        expect(newsTitle(injury)).toBe(`Ace fällt aus: ${de["svd.inj.wristStrain"]}`)
    })

    it("board causes and reviews follow the language", () => {
        setLocale("de")
        expect(storedText("Behind target: 5th in Europe Division 2 (target 3rd)")).toContain("Hinter dem Ziel")
        expect(storedText("Finances at risk: 3 weeks of runway")).toBe("Finanzen gefährdet: Reserve für 3 Wochen")
        expect(storedText("Season ranking met: #12, 2 trophies (target #15)")).toBe("Saisonplatzierung erreicht: #12, 2 Titel (Ziel #15)")
        expect(storedText("Season 3 board review: expectations met")).toBe("Vorstandsbilanz Saison 3: Erwartungen erfüllt")
        expect(storedText("Results: 2 won, 1 lost")).toBe("Ergebnisse: 2 gewonnen, 1 verloren")
    })
})
