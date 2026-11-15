/**
 * Regression tests for the round-3 fixes of the 2026-11-15 smoke test:
 * event year on Home, match prep, veto, schedule popup, match intro and
 * registration messages (A); translated stage on Home (B); the live Rounds
 * table at 1024 px (C); decimal marks on the week and board pages (D).
 */
import fs from "fs"
import { produce, enableMapSet } from "immer"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { createTournamentSlice } from "@/store/slices/tournament-slice"
import { getTournamentById } from "@/data/tournament-calendar"
import { competitionOf } from "@/lib/match-framing"
import { instanceName } from "@/lib/tournament-instances"
import { formatNumber, registerLocale, setLocale } from "@/lib/i18n"
import { buildWeekPreview } from "@/components/week/week-preview"
import { trainingModifiers } from "@/components/training/weekly-training"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"

enableMapSet()

const useLocale = (code: string) => {
    registerLocale(code, JSON.parse(fs.readFileSync(`public/locales/${code}.json`, "utf8")))
    setLocale(code)
}
afterEach(() => setLocale("en"))

const START = "2026-12-02T00:00:00.000Z"
const read = (path: string) => fs.readFileSync(path, "utf8")

describe("A: a calendar event is named with the year it is played in", () => {
    it("the match intro dates an unsaved event and prefers the saved name", () => {
        const match = { id: "m1", tournamentId: "iem_katowice_s1", stage: "Quarter-final 1", week: 2 }
        expect(competitionOf(match, [], START).name).toBe("Winter Open Katova 2027")
        expect(competitionOf(match, [{ id: "iem_katowice_s1", name: "Winter Open Katova 2027" }]).name).toBe("Winter Open Katova 2027")
        expect(competitionOf(match, [], START).name).not.toMatch(/2025/)
    })

    it("Home, match prep, veto and the schedule popup no longer show the calendar name raw", () => {
        const home = read("app/page.tsx")
        expect(home).not.toMatch(/leagueStage \?\? tournament\?\.name/)
        expect(home).toMatch(/matchEventName\(stored, tournament\?\.name/)
        // The "registered, starts in N weeks" card dates its event too.
        expect(home).toMatch(/name: getDynamicTournamentName\(t\.name, currentWeek \+ weeksUntil/)
        const prep = read("app/match/[id]/tactics/page.tsx")
        expect(prep).not.toMatch(/tournamentDef\?\.name \|\| liveTournament\?\.name/)
        expect(prep).toMatch(/matchEventName\(liveTournament\?\.name, tournamentDef\?\.name/)
        const veto = read("app/match/[id]/veto/page.tsx")
        expect(veto).not.toMatch(/`\$\{tournament\.name\}/)
        expect(veto).toMatch(/matchEventName\(storedTournamentName, tournament\.name/)
        const schedule = read("app/schedule/page.tsx")
        expect(schedule).not.toMatch(/tournamentName=\{tournamentDef\?\.name\}/)
        for (const src of [read("components/moments/WelcomeMomentView.tsx"), read("app/match/[id]/live/page.tsx")]) {
            expect(src).toMatch(/competitionOf\([^)]*gameStartDate\)/)
        }
    })

    it("registration messages name the event with its year", () => {
        const save = createLaunchFixture("first-week", 3417)
        save.gameStartDate = START
        save.currentWeek = 1
        save.tournamentQualifications = []
        save.teams.find(t => t.id === save.playerTeamId)!.worldRanking = 1
        const dallas = getTournamentById("iem_dallas")!
        let state = save as unknown as StoreState
        const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === "function" ? produce(state, fn) : { ...state, ...fn } }
        const slice = createTournamentSlice(set as never, () => state)
        const result = slice.registerForTournament("iem_dallas")
        expect(result.success).toBe(true)
        expect(dallas.name).toBe("Dallas Masters 2025")
        expect(instanceName(dallas, 1, START)).toBe("Dallas Masters 2027")
        expect(result.message).toBe("Registered for Dallas Masters 2027")
        const inbox = state.eventsLog.at(-1)!.data
        expect(JSON.stringify(inbox)).toContain("Dallas Masters 2027")
        expect(JSON.stringify(inbox)).not.toContain("2025")
    })
})

describe("B: Home shows the next match's stage in the active language", () => {
    it("the stage goes through stageName, as on the prep page", () => {
        const home = read("app/page.tsx")
        expect(home).toMatch(/· \{stageName\(nextMatch\.stage\)\}/)
        expect(home).not.toMatch(/· \{nextMatch\.stage\}/)
    })
})

describe("C: the live Rounds table gives the winner room in a narrow side column", () => {
    it("the panel is a size container whose narrow tracks leave the winner column wider than its header", () => {
        const src = read("components/match/live/RoundsPanel.tsx")
        expect(src).toMatch(/@container\/rounds/)
        const narrow = /grid-cols-\[(\d+)px_minmax\(0,1fr\)_(\d+)px_(\d+)px\] gap-x-1\.5 px-2\.5/.exec(src)
        expect(narrow).not.toBeNull()
        // The side column is 272 px wide at 1024 px: the winner column keeps at least 56 px ("WINNER" needs 49 px).
        const fixed = Number(narrow![1]) + Number(narrow![2]) + Number(narrow![3]) + 3 * 6 + 2 * 10 + 2
        expect(272 - fixed).toBeGreaterThanOrEqual(56)
        // Full layout from 18rem on, as before (1280 px and wider).
        expect(src).toMatch(/@min-\[18rem\]\/rounds:grid-cols-\[28px_minmax\(0,1fr\)_76px_104px\]/)
    })
})

describe("D: decimals use the language's mark on the week and board pages", () => {
    it("formatNumber", () => {
        expect(formatNumber(14.6)).toBe("14.6")
        expect(formatNumber(8)).toBe("8")
        useLocale("de")
        expect(formatNumber(14.6)).toBe("14,6")
        expect(formatNumber(-0.8)).toBe("-0,8")
        expect(formatNumber(100)).toBe("100")
        useLocale("ru")
        expect(formatNumber(0.3)).toBe("0,3")
    })

    it("the week plan's recovery line reads −14,6 in German", () => {
        const players = ["a", "b", "c", "d", "e"].map(id => ({
            id, nickname: id, role: "Rifler", morale: 60, fatigue: 40, energy: 70, unlockedTalentIds: [],
        }) as unknown as PlayerSaveData)
        const team = {
            id: "t1", name: "T", budget: 100_000, rosterIds: players.map(p => p.id), staffIds: [], trophies: [],
            facilities: [{ type: "RECOVERY", level: 3 }], chemistry: 50,
        } as unknown as TeamSaveData
        const build = () => buildWeekPreview({
            team, roster: players, staff: [], currentWeek: 10, selectedWeeklyActivity: null,
            scheduledActivities: [], scheduledMatches: [], completedMatches: [],
            trainingMods: trainingModifiers(team, [], 10),
        })
        const en = build()
        const total = 8 + Math.round(en.recoveryBonus * 10) / 10
        const line = (p: ReturnType<typeof build>) => p.effects.find(e => e.source === "recovery")!.effects[0].text
        expect(line(en)).toContain(`−${total}`)
        useLocale("de")
        const de = line(build())
        expect(de).toContain(`−${String(total).replace(".", ",")}`)
        if (!Number.isInteger(total)) expect(de).not.toMatch(/\d\.\d/)
    })

    it("the board rules and the drill toast format their numbers for the language", () => {
        const board = read("app/career/board/page.tsx")
        const rules = board.slice(board.indexOf("function weeklyRules"), board.indexOf("export default function"))
        // Every tuning value goes through the formatter.
        expect(rules).not.toMatch(/: T\.[A-Z_]+[,} ]/)
        expect(rules).toMatch(/win: num\(T\.RESULT_WIN\)/)
        expect(read("app/training/page.tsx")).not.toMatch(/g\.amount\.toFixed/)
    })
})
