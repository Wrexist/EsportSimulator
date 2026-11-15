/**
 * Audit 2026-11 (I18N-01…06, 13, 17): engine-written text reaches the player
 * in their language. News and milestones carry translation keys; English that
 * older saves keep is translated at display time; counted nouns use the
 * language's plural forms; decimals use its separator.
 */
import { readFileSync } from "fs"
import { join } from "path"
import { formatDecimal, registerLocale, setLocale, tn, tRef } from "@/lib/i18n"
import { generateNarrativeNews } from "@/engine/processors/narrative-news"
import { checkMilestones } from "@/engine/milestone-checker"
import { SeededRNG } from "@/engine/rng"
import type { GameSave } from "@/engine/save-types"
import { newsContent, newsTitle } from "@/lib/news-text"
import { storedText } from "@/lib/stored-text"
import { stageName } from "@/lib/display-names"
import { activityDescription, activityName } from "@/components/schedule/activity-labels"
import { digestLine, type InboxContext } from "@/components/inbox/inbox-model"

const load = (code: string) => JSON.parse(readFileSync(join(__dirname, "..", "public", "locales", `${code}.json`), "utf8")) as Record<string, string>

beforeAll(() => {
    registerLocale("de", load("de"))
    registerLocale("ru", load("ru"))
})
afterEach(() => setLocale("en"))

function world(): GameSave {
    const team = (id: string, elo: number) => ({ id, name: id.toUpperCase(), elo, budget: 500_000, rosterIds: [] as string[] })
    const teams = [team("us", 1500), team("a", 1900), team("c", 1300), ...Array.from({ length: 6 }, (_, i) => team(`x${i}`, 1200 + i * 60))]
    const done = (id: string, home: string, away: string, winner: string) => ({ id, homeTeamId: home, awayTeamId: away, week: 8, tournamentId: "cup_1", stage: "Group", format: "BO1", seed: 1, result: { winnerId: winner, homeScore: 1, awayScore: 0, maps: [] } })
    return {
        currentWeek: 9, playerTeamId: "us", teams, players: [], contracts: [], tournaments: [], scheduledMatches: [], newsFeed: [],
        completedMatches: [done("m_upset", "a", "c", "c"), done("m_ours", "us", "x1", "us")],
    } as unknown as GameSave
}

describe("narrative news (I18N-01)", () => {
    test("every item is saved with translation keys and reads in German", () => {
        const save = world()
        generateNarrativeNews(save, new SeededRNG(5))
        expect(save.newsFeed.length).toBeGreaterThan(0)
        const englishTitles = save.newsFeed.map(n => newsTitle(n))
        setLocale("de")
        for (const [i, n] of save.newsFeed.entries()) {
            expect(n.titleRef).toBeDefined()
            expect(n.contentRef).toBeDefined()
            expect(newsTitle(n)).not.toBe(englishTitles[i])
            expect(`${newsTitle(n)} ${newsContent(n)}`).not.toMatch(/\b(defeat|beat|stun|upset|the)\b/)
        }
    })
})

describe("milestones (I18N-02)", () => {
    test("a milestone keeps its English copy and a key that follows the language", () => {
        const save = { playerTeamId: "us", teams: [{ id: "us", followers: 120_000, trophies: [] }], completedMatches: [], players: [] } as unknown as GameSave
        const hits = checkMilestones(save, new Set())
        const fans = hits.find(h => h.id === "ms_fans_100000")!
        expect(fans.message).toMatch(/followers/)
        setLocale("de")
        expect(tRef(fans.ref)).toContain("100.000")
        expect(tRef(fans.ref)).not.toMatch(/followers/)
    })
})

describe("stored English in older saves (I18N-02…04)", () => {
    // English lines older builds wrote into the save. Each must read differently in German.
    const STORED = [
        "10 career wins!",
        "3 trophies in the cabinet!",
        "5,000 team kills!",
        "500k followers reached!",
        "5-match win streak!",
        "Tournament Elimination",
        "Your team has been eliminated from Spring Clash.",
        "Manager leveled up to Level 4!",
        "League central payment (Europe Division 3)",
        "Spring Clash (S-Tier playoffs)",
    ]
    test.each(STORED)("German: %s", line => {
        setLocale("de")
        expect(storedText(line)).not.toBe(line)
    })

    test("numbers inside stored lines use the language's format", () => {
        setLocale("de")
        expect(storedText("5,000 team kills!")).toContain("5.000")
        expect(storedText("Manager leveled up to Level 4!")).toBe("Du hast Manager-Stufe 4 erreicht.")
        expect(storedText("Your team has been eliminated from Spring Clash.")).toBe("Dein Team ist aus Spring Clash ausgeschieden.")
    })

    test("the inbox round-up line prefers the saved key, else translates the stored English", () => {
        const ctx: InboxContext = { currentWeek: 5, playerTeamId: "us", rosterIds: new Set(), playerName: () => undefined }
        setLocale("de")
        const withRef = digestLine({ id: "e1", type: "INFO", week: 5, data: { message: "10 career wins!", messageRef: { key: "evn.ms.wins", count: 10 } } }, ctx)
        expect(withRef).toBe("10 Karrieresiege!")
        const old = digestLine({ id: "e2", type: "INFO", week: 5, data: { message: "Manager leveled up to Level 4!" } }, ctx)
        expect(old).toBe("Du hast Manager-Stufe 4 erreicht.")
    })
})

describe("calendar and stage names (I18N-05, I18N-06)", () => {
    test("stored stage names have keys", () => {
        setLocale("de")
        expect(stageName("League Play")).toBe("Ligaphase")
        for (const s of ["Bracket", "Swiss Stage", "Registration", "Qualifiers"]) expect(stageName(s)).not.toBe("")
    })

    test("a rest day and its recovery line are translated", () => {
        setLocale("ru")
        expect(activityName("Rest Day")).toBe("День отдыха")
        expect(activityDescription("Rest Day", "Recovery (+15 energy)")).toBe("Восстановление (+15 энергии)")
    })
})

describe("plurals and decimals (I18N-13, I18N-17)", () => {
    test("counted nouns agree with the count", () => {
        expect(tn("sr.wins", 1, { n: 1 })).toBe("1 win")
        expect(tn("sp.goal.matches", 1, { n: 1 })).toBe("Win 1 match")
        setLocale("de")
        expect(tn("sr.wins", 1, { n: 1 })).toBe("1 Sieg")
        expect(tn("sr.wins", 3, { n: 3 })).toBe("3 Siege")
        setLocale("ru")
        expect(tn("sr.wins", 1, { n: 1 })).toBe("1 победа")
        expect(tn("sr.wins", 3, { n: 3 })).toBe("3 победы")
        expect(tn("sr.wins", 5, { n: 5 })).toMatch(/^5 побед$/)
    })

    test("decimals use the language's separator", () => {
        expect(formatDecimal(2.5)).toBe("2.5")
        setLocale("de")
        expect(formatDecimal(2.5)).toBe("2,5")
        expect(formatDecimal(0.25, 2)).toBe("0,25")
    })
})

describe("engine inbox messages found by the report check (I18N-27)", () => {
    test("a cancelled role training is saved with a key and reads in Russian", () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { TrainingManager } = require("@/engine/training-manager") as typeof import("@/engine/training-manager")
        const game = {
            currentWeek: 10, playerTeamId: "t1", staff: [], contracts: [], financeLedger: [], eventsLog: [], tournaments: [], scheduledMatches: [], completedMatches: [],
            teams: [{ id: "t1", budget: 50_000, trainingSlotsUsed: 1, activeRoleTraining: [{ playerId: "p1", targetRole: "awper", totalWeeks: 8, weeksCompleted: 2, weeklyCost: 5000 }] }],
            players: [{ id: "p1", nickname: "Star" }],
        } as unknown as GameSave
        TrainingManager.cancelTraining(game, "t1", "p1")
        const data = game.eventsLog[0].data as { description: string; messageRef: never }
        expect(data.description).toBe("Training cancelled for Star. Progress: 2/8 weeks. Refunded $5,000.")
        setLocale("ru")
        expect(tRef(data.messageRef)).toBe("Переобучение (Star) отменено. Пройдено недель: 2 из 8. Возврат: $5,000.")
    })
})
