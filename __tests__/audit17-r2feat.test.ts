/**
 * Audit 2026-11-17, round 2 (r2feat): features and leftovers.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"

describe("i18n leftover: the Electron boot-failure page is in the game's language", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadHandlers } = require("../scripts/launch/electron-handler-harness.cjs")
    let directory: string
    beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "esim-r2feat-")) })
    afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }) })

    function errorPage(harness: { contexts: Record<string, vm.Context> }): string {
        const showErrorPage = vm.runInContext("showErrorPage", harness.contexts["main.js"])
        let url = ""
        showErrorPage({ loadURL: (u: string) => { url = u }, show() {} }, "Renderer boot timeout", "Error: boom")
        return decodeURIComponent(url.slice("data:text/html;charset=utf-8,".length))
    }

    test("before the renderer reports, the language saved in the game's settings is used", () => {
        fs.mkdirSync(path.join(directory, "game-storage"))
        fs.writeFileSync(path.join(directory, "game-storage", "esports_device_game-settings.json"),
            JSON.stringify({ state: { language: "de" }, version: 1 }))
        const html = errorPage(loadHandlers({ directory }))
        expect(html).toContain('<html lang="de">')
        expect(html).toContain("<h1>Start fehlgeschlagen</h1>")
        expect(html).toContain(">Beenden</button>")
        expect(html).toContain("Eigenschaften &gt; Installierte Dateien")
        expect(html).not.toMatch(/Failed to launch|Quit</)
    })

    test("the renderer's reported language wins; no settings file falls back to English", async () => {
        const harness = loadHandlers({ directory })
        expect(errorPage(harness)).toContain("<h1>Failed to launch</h1>")
        expect(await harness.invoke("app-set-ui-language", "fr")).toBe(true)
        const html = errorPage(harness)
        expect(html).toContain('<html lang="fr">')
        expect(html).toContain("Le moteur du jeu n&#39;a pas pu démarrer.")
    })

    test("a damaged settings file is ignored", () => {
        fs.mkdirSync(path.join(directory, "game-storage"))
        fs.writeFileSync(path.join(directory, "game-storage", "esports_device_game-settings.json"), "{not json")
        expect(errorPage(loadHandlers({ directory }))).toContain('<html lang="en">')
    })
})

describe("i18n leftover: the workload warning's stored percent is shown in the language's style", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const i18n = require("@/lib/i18n") as typeof import("@/lib/i18n")
    beforeAll(() => {
        for (const lang of ["fr", "de"]) i18n.registerLocale(lang, JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "locales", `${lang}.json`), "utf8")))
    })
    afterEach(() => i18n.setLocale("en"))

    test("stored params stay English; the rendered text is localized at read time", () => {
        const follows = { key: "ev.workload.follows", params: { risk: "0.4%" } }
        const message = { key: "ev.workload.m", params: { name: "k1ncu", fatigue: 70, risk: "<0.1%", rested: 40 } }
        expect(i18n.tRef(follows)).toBe("Injury chance 0.4% this week")
        i18n.setLocale("fr")
        expect(i18n.tRef(follows)).toMatch(/0,4\s%/u)
        expect(i18n.tRef(follows)).not.toContain("0.4%")
        expect(i18n.tRef(message)).toMatch(/<0,1\s%/u)
        i18n.setLocale("de")
        expect(i18n.tRef({ key: "ev.workload.follows", params: { risk: "12%" } })).toMatch(/12\s%/u)
        expect(i18n.tRefEn(follows)).toBe("Injury chance 0.4% this week")
        expect(follows.params.risk).toBe("0.4%")
    })

    test("anything that is not a plain percent is left alone", () => {
        expect(i18n.localizeStoredPercent("high")).toBe("high")
        expect(i18n.localizeStoredPercent("0.4")).toBe("0.4")
    })
})

describe("MODES-17: Finances names the difficulty behind the income multiplier", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { incomeDifficulty } = require("@/lib/career-difficulty") as typeof import("@/lib/career-difficulty")
    test("existing club on Hard, created club on Impossible, Normal and joined clubs show nothing", () => {
        expect(incomeDifficulty({ difficultySettings: { incomeMultiplier: 0.85 } }, "hard")).toEqual({ label: "Hard", factor: 0.85 })
        expect(incomeDifficulty({ difficultySettings: { incomeMultiplier: 0.6 }, customTeamData: { difficulty: "impossible" } }, "normal")).toEqual({ label: "Impossible", factor: 0.6 })
        expect(incomeDifficulty({ difficultySettings: { incomeMultiplier: 1 } }, "normal")).toBeNull()
        expect(incomeDifficulty({}, "hard")).toBeNull()
        expect(incomeDifficulty({ difficultySettings: { incomeMultiplier: 1.2 } }, "legendary")).toBeNull()
    })
    test("the finances page shows it under the income rows", () => {
        const src = fs.readFileSync(path.join(__dirname, "..", "app", "finances", "page.tsx"), "utf8")
        expect(src).toContain('t("fin.in.difficulty"')
        expect(src).toContain("incomeDifficulty(team, careerDifficulty)")
    })
})

describe("MODES-19: a pro trial offer names the starter to beat", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { proRival, ovrOf } = require("@/engine/pro-career") as typeof import("@/engine/pro-career")
    const STATS = ["skill", "rifle", "awp", "pistol", "grenades", "creativity", "clutch", "tactic", "leader", "teamwork", "reaction", "eyesight", "entry", "trading"]
    const flat = (id: string, role: string, v: number, over: Record<string, unknown> = {}) => ({
        id, nickname: id, name: id, age: 22, nationality: "Sweden", role, morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, potential: 85, productivity: 60, endurance: 70, ...Object.fromEntries(STATS.map(k => [k, v])), ...over,
    }) as unknown as import("@/engine/save-types").PlayerSaveData
    const five = [["i", "IGL"], ["w", "AWPER"], ["e", "ENTRY_FRAGGER"], ["r", "RIFLER"], ["s", "SUPPORT"]].map(([id, role]) => flat(id, role, 70))

    test("the AWPer in the coach's five, with his OVR, not the bench AWPer", () => {
        const benchAwp = flat("w2", "AWPER", 60)
        const rival = proRival([...five, benchAwp], "AWPER" as never, 20)!
        expect(rival.player.id).toBe("w")
        expect(rival.ovr).toBe(ovrOf(five[1], 20))
    })
    test("an injured starter does not count; no starter in the role gives null", () => {
        const injured = five.map(p => p.id === "w" ? { ...p, injury: { weeksRemaining: 3 } } as typeof p : p)
        expect(proRival(injured, "AWPER" as never, 20)).toBeNull()
        expect(proRival(five.filter(p => p.role !== "IGL"), "IGL" as never, 20)).toBeNull()
    })
})

describe("NEWPLAYER-12: the first official win is celebrated when it is recorded", () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { produce, enableMapSet } = require("immer") as typeof import("immer")
    const { createLaunchFixture } = require("@/scripts/launch/fixtures") as typeof import("@/scripts/launch/fixtures")
    const { createMatchSimulationSlice } = require("@/store/slices/match-simulation-slice") as typeof import("@/store/slices/match-simulation-slice")
    const { getActivePlayersByRosterOrder } = require("@/lib/live-match-builders") as typeof import("@/lib/live-match-builders")
    const { prepareLegacySeries } = require("@/engine/match/legacy-prepare") as typeof import("@/engine/match/legacy-prepare")
    const { runLegacySeries, finalizeLegacySeries } = require("@/engine/match/legacy-series") as typeof import("@/engine/match/legacy-series")
    const { createDefaultTactics } = require("@/engine/default-tactics") as typeof import("@/engine/default-tactics")
    const { checkMilestones } = require("@/engine/milestone-checker") as typeof import("@/engine/milestone-checker")
    const { resetCelebrationToasts } = require("@/lib/celebration-toasts") as typeof import("@/lib/celebration-toasts")
    /* eslint-enable @typescript-eslint/no-require-imports */
    enableMapSet()
    type Save = import("@/engine/save-types").GameSave
    type Store = import("@/store/types").StoreState

    function harness(tournamentId: string | null) {
        const save = createLaunchFixture("first-week", 3921) as Save
        const m = save.scheduledMatches[0]
        m.tournamentId = tournamentId as never
        m.maps = ["Sandstone"] as never
        const own = save.teams.find(t => t.id === save.playerTeamId)!
        own.rosterIds.forEach(id => Object.assign(save.players.find(p => p.id === id)!, { skill: 95, rifle: 95, awp: 95, pistol: 95, tactic: 95, reaction: 95, eyesight: 95 }))
        let state = { ...save, customTactics: createDefaultTactics(), newsFeed: [], acknowledgedEventIds: [], addToast: jest.fn() } as unknown as Store
        const set = (fn: Partial<Store> | ((s: Store) => void)) => { state = typeof fn === "function" ? produce(state, fn) : { ...state, ...fn } }
        const slice = createMatchSimulationSlice(set as never, () => state)
        state = { ...state, ...slice }
        const home = save.teams.find(t => t.id === m.homeTeamId)!, away = save.teams.find(t => t.id === m.awayTeamId)!
        const ctx = prepareLegacySeries({
            match: m, homeTeam: home, awayTeam: away,
            homePlayers: getActivePlayersByRosterOrder(home, save.players), awayPlayers: getActivePlayersByRosterOrder(away, save.players),
            staff: save.staff as never, customTactics: createDefaultTactics(), managedTeamId: save.playerTeamId,
        })
        const result = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
        return { read: () => state, slice, match: m, result }
    }
    beforeEach(() => resetCelebrationToasts())

    test("an official win records ms_win_1 with the match id and toasts at once; the week tick does not repeat it", () => {
        const h = harness("league_eu_test")
        expect(h.result.winnerId).toBe(h.read().playerTeamId)
        h.slice.saveMatchResult(h.match.id, h.result)
        const s = h.read()
        const ev = s.eventsLog.find(e => e.id === "ms_win_1")
        expect(ev).toBeDefined()
        expect((ev!.data as { matchId?: string }).matchId).toBe(h.match.id)
        expect(s.acknowledgedEventIds).toContain("ms_win_1")
        expect((s as unknown as { addToast: jest.Mock }).addToast).toHaveBeenCalledWith({ message: "Your first win!", type: "achievement" })
        const fired = new Set([...s.acknowledgedEventIds, ...s.eventsLog.map(e => e.id)])
        expect(checkMilestones(s as unknown as Save, fired).map(x => x.id)).not.toContain("ms_win_1")
    })

    test("a friendly win is not the first win", () => {
        const h = harness(null)
        h.slice.saveMatchResult(h.match.id, h.result)
        expect(h.read().completedMatches).toHaveLength(1)
        expect(h.read().eventsLog.some(e => e.id === "ms_win_1")).toBe(false)
    })
})

describe("NEWPLAYER-23: the week report's player list starts with each player's main change", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { playerGroups } = require("@/components/report/report-model") as typeof import("@/components/report/report-model")
    type Report = import("@/lib/week-report").WeekReport
    const report = (changes: unknown[]) => ({
        week: 3, teamId: "t", names: { p1: "k1ncu", p2: "ace" }, headline: "", matches: [], warnings: [],
        kpis: { rank: [null, null], board: [null, null], morale: [null, null], budget: [0, 0] }, changes,
    }) as unknown as Report
    const stat = (subjectId: string, label: string, delta: number) => ({ kind: "attribute", subjectId, label, delta, cause: { type: "training", label: "Aim training" } })
    const form = (subjectId: string, delta: number) => ({ kind: "form", subjectId, label: "Form", delta, cause: { type: "match", label: "Lost to Zumblers 9–13" } })

    test("the condition row leads over stat rows; an injury leads over both", () => {
        const groups = playerGroups(report([
            stat("p1", "AWP", 0.6), form("p1", -4.6),
            stat("p2", "Rifle", 1.2), form("p2", 3),
            { kind: "injury", subjectId: "p2", label: "Sprained wrist", delta: 2, cause: { type: "match", label: "Lost to Zumblers 9–13" } },
        ]))
        const p1 = groups.find(g => g.id === "p1")!
        expect(p1.rows[p1.lead].change).toMatch(/^Form/)
        const p2 = groups.find(g => g.id === "p2")!
        expect(p2.rows[p2.lead].change).toMatch(/Sprained wrist/)
    })
    test("only stat changes: the first row leads", () => {
        const [g] = playerGroups(report([stat("p1", "AWP", 0.6)]))
        expect(g.lead).toBe(0)
    })
    test("the view shows the lead row unless the player asked for every row", () => {
        const src = fs.readFileSync(path.join(__dirname, "..", "components", "report", "WeekReportView.tsx"), "utf8")
        expect(src).toContain("showAllRows ? group.rows : [group.rows[group.lead]]")
        expect(src).toContain('t("wr.more", { n: group.rows.length - 1 })')
    })
})

describe("COMP-22: a locked event's row says what the club still has to do", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { entryPathText } = require("../engine/tournament/qualification-path") as typeof import("../engine/tournament/qualification-path")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FULL_TOURNAMENT_CALENDAR } = require("../data/tournament-calendar") as typeof import("../data/tournament-calendar")
    const katowice = FULL_TOURNAMENT_CALENDAR.find(d => d.id === "iem_katowice")!
    const teams = Array.from({ length: 20 }, (_, i) => ({ id: `t${i + 1}`, region: i % 2 ? "NA" : "EU", worldRanking: i + 1 }))
    const save = (rows: object[] = []) => ({ teams, tournaments: [], tournamentQualifications: rows }) as never
    const name = (d: { id: string }) => d.id

    test("a club in the invite places waits for the invite, which goes out when the qualifier path starts", () => {
        expect(entryPathText(save(), teams[0], katowice, 1, 1, name)).toEqual({ key: "tm.path.invite", params: { week: 2, n: 12 } })
    })

    test("a club outside the invite places is pointed at the first qualifier still open to it", () => {
        expect(entryPathText(save(), teams[14], katowice, 1, 1, name)).toEqual({ key: "tm.path.qualify", params: { event: "iem_katowice_open", week: 2 } })
        // A club already in the EU closed qualifier is pointed at it.
        const rows = [{ tournamentId: "iem_katowice_closed_eu_s1", instanceId: "iem_katowice_closed_eu_s1", teamId: "t15", status: "QUALIFIED" }]
        expect(entryPathText(save(rows), teams[14], katowice, 1, 3, name)).toEqual({ key: "tm.path.qualify", params: { event: "iem_katowice_closed_eu", week: 6 } })
    })

    test("with the qualifiers gone or closed to its region, the ranking is what is left", () => {
        // Week 3: the open qualifier has begun and the EU closed one is not for an NA club.
        expect(entryPathText(save(), teams[15], katowice, 1, 3, name)).toEqual({ key: "tm.path.rank", params: { n: 12, rank: 16 } })
    })

    test("a club already entered gets no line", () => {
        const rows = [{ tournamentId: "iem_katowice_s1", instanceId: "iem_katowice_s1", teamId: "t1", status: "QUALIFIED", qualifiedVia: "Direct Invite" }]
        expect(entryPathText(save(rows), teams[0], katowice, 1, 3, name)).toBeNull()
    })
})
