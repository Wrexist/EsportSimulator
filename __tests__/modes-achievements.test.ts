/**
 * Audit 2026-11-15 (MODES-03/04/05/06/27): each Steam achievement unlocks
 * exactly when its text says, for the manager's own club, from played and
 * auto-simulated matches alike.
 */
import { produce, enableMapSet } from "immer"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { createMatchSimulationSlice } from "@/store/slices/match-simulation-slice"
import type { StoreState } from "@/store/types"
import { evaluatePostTickAchievements, officialCareerWins } from "@/engine/processors/post-tick-achievements"
import { SteamService } from "@/engine/steam-service"
import type { CompletedMatchSaveData, GameSave, PlayerSaveData } from "@/engine/save-types"

enableMapSet()

function unlocks(): { unlocked: Set<string>; restore: () => void } {
    const svc = SteamService.getInstance() as unknown as { unlockedAchievements: Set<string>; isInitialized: boolean; electronBridge: unknown }
    const previous = new Set(svc.unlockedAchievements)
    const prevInit = svc.isInitialized
    const prevBridge = svc.electronBridge
    svc.unlockedAchievements = new Set<string>()
    svc.isInitialized = true
    svc.electronBridge = null
    return {
        unlocked: svc.unlockedAchievements,
        restore: () => { svc.unlockedAchievements = previous; svc.isInitialized = prevInit; svc.electronBridge = prevBridge },
    }
}

// ---------------------------------------------------------------- played matches (saveMatchResult)

function harness(tournamentId: string | null) {
    const save = createLaunchFixture("first-week")
    save.scheduledMatches[0].maps = ["Nuke"]
    save.scheduledMatches[0].tournamentId = tournamentId as never
    let state = { ...save, saveId: save.id, managerDetails: save.managerDetails, newsFeed: [], addToast: () => {} } as unknown as StoreState
    const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === "function" ? produce(state, fn) : { ...state, ...fn } }
    const slice = createMatchSimulationSlice(set as never, () => state)
    const match = state.scheduledMatches[0]
    return { read: () => state, set, slice, match }
}

/** One map; `comeback` = the side that trails 3-12 and wins 13-12. */
function result(h: ReturnType<typeof harness>, comeback: "home" | "away" | null) {
    const { homeTeamId, awayTeamId } = h.match
    const rounds: { winningTeamId: string }[] = []
    const push = (id: string, n: number) => { for (let i = 0; i < n; i++) rounds.push({ winningTeamId: id }) }
    let home = 13, away = 5
    if (comeback === "home") { push(homeTeamId, 3); push(awayTeamId, 12); push(homeTeamId, 10); away = 12 }
    else if (comeback === "away") { push(awayTeamId, 3); push(homeTeamId, 12); push(awayTeamId, 10); home = 12; away = 13 }
    else { push(homeTeamId, 13); push(awayTeamId, 5) }
    const homeWon = home > away
    return {
        homeScore: homeWon ? 1 : 0, awayScore: homeWon ? 0 : 1,
        maps: [{ map: "Nuke", homeScore: home, awayScore: away, rounds }],
        playerStats: Object.fromEntries(h.read().players.map(p => [p.id, { kills: 10, deaths: 5, assists: 2, rating: 1.1 }])),
        mvpPlayerId: h.read().teams[0].rosterIds[0],
    }
}

describe("played matches", () => {
    test("the managed club's own 3-12 comeback unlocks Comeback King at once and flags the match", () => {
        const snap = unlocks()
        try {
            const h = harness("league_test")
            expect(h.match.homeTeamId).toBe(h.read().playerTeamId)
            h.slice.saveMatchResult(h.match.id, result(h, "home"))
            expect(h.read().completedMatches[0]._comebackWin).toBe(true)
            expect(snap.unlocked.has("COMEBACK_KING")).toBe(true)
        } finally { snap.restore() }
    })

    test("the opponent's comeback against the managed club unlocks nothing", () => {
        const snap = unlocks()
        try {
            const h = harness("league_test")
            h.slice.saveMatchResult(h.match.id, result(h, "away"))
            expect(h.read().completedMatches[0]._comebackWin).toBeUndefined()
            expect(snap.unlocked.has("COMEBACK_KING")).toBe(false)
            evaluatePostTickAchievements(h.read() as unknown as GameSave)
            expect(snap.unlocked.has("COMEBACK_KING")).toBe(false)
        } finally { snap.restore() }
    })

    test("Giant Slayer: a played win over a club ranked 20+ places higher", () => {
        const snap = unlocks()
        try {
            const h = harness("league_test")
            h.set(s => { s.teams.find(t => t.id === h.match.homeTeamId)!.worldRanking = 80; s.teams.find(t => t.id === h.match.awayTeamId)!.worldRanking = 10 })
            h.slice.saveMatchResult(h.match.id, result(h, null))
            expect(h.read().completedMatches[0]._underdogWin).toBe(true)
            expect(snap.unlocked.has("UNDERDOG")).toBe(true)
        } finally { snap.restore() }
    })

    test("a friendly win does not count toward First Victory; an official win does", () => {
        const snap = unlocks()
        try {
            const friendly = harness(null)
            friendly.slice.saveMatchResult(friendly.match.id, result(friendly, null))
            expect(friendly.read().completedMatches).toHaveLength(1)
            expect(snap.unlocked.has("FIRST_WIN")).toBe(false)
            expect(snap.unlocked.has("FIRST_TOURNAMENT")).toBe(false)

            const official = harness("league_test")
            official.slice.saveMatchResult(official.match.id, result(official, null))
            expect(snap.unlocked.has("FIRST_WIN")).toBe(true)
            expect(snap.unlocked.has("FIRST_TOURNAMENT")).toBe(true)
        } finally { snap.restore() }
    })
})

// ---------------------------------------------------------------- week tick (post-tick evaluation)

function match(id: string, week: number, home: string, away: string, homeScore: number, awayScore: number, tournamentId = "league_t", extra: Partial<CompletedMatchSaveData> = {}): CompletedMatchSaveData {
    return {
        id, homeTeamId: home, awayTeamId: away, tournamentId, week, day: 5, format: "BO1", seed: 1, stage: "Group Stage",
        result: { homeScore, awayScore, maps: [], playerStats: {}, winnerId: homeScore > awayScore ? home : away, mvpPlayerId: "" },
        ...extra,
    } as unknown as CompletedMatchSaveData
}

function save(over: Partial<GameSave> = {}): GameSave {
    return {
        currentWeek: 20, playerTeamId: "me",
        managerDetails: { name: "M", level: 1, xp: 0, reputation: 50, careerWins: 0, careerLosses: 0, championships: 0, tenureStartWeek: 1 },
        teams: [{ id: "me", name: "Me", rosterIds: [], trophies: [], budget: 1000, lastRosterChangeWeek: 1 }, { id: "ai", name: "AI", rosterIds: [], trophies: [] }],
        players: [], tournaments: [], completedMatches: [], financeLedger: [], legendaryPlayers: [],
        ...over,
    } as unknown as GameSave
}

describe("week tick", () => {
    test("Champion (TOURNAMENT_WIN) unlocks with the first title won as manager", () => {
        const snap = unlocks()
        try {
            evaluatePostTickAchievements(save())
            expect(snap.unlocked.has("TOURNAMENT_WIN")).toBe(false)
            const s = save()
            s.teams[0].trophies = [{ tournamentId: "cup_c", tournamentName: "C cup", week: 12, tier: "C_TIER" }]
            evaluatePostTickAchievements(s)
            expect(snap.unlocked.has("TOURNAMENT_WIN")).toBe(true)
        } finally { snap.restore() }
    })

    test("titles a club won before the manager arrived unlock nothing", () => {
        const snap = unlocks()
        try {
            const s = save()
            s.managerDetails.tenureStartWeek = 30
            s.currentWeek = 31
            s.teams[0].trophies = [{ tournamentId: "major_x", tournamentName: "Major", week: 20, tier: "S_TIER" }]
            evaluatePostTickAchievements(s)
            expect(snap.unlocked.has("TOURNAMENT_WIN")).toBe(false)
            expect(snap.unlocked.has("WIN_MAJOR")).toBe(false)
        } finally { snap.restore() }
    })

    test("Into the Arena needs the managed club's own official match", () => {
        const snap = unlocks()
        try {
            evaluatePostTickAchievements(save({ completedMatches: [match("a", 1, "ai", "x", 1, 0), match("f", 1, "me", "ai", 1, 0, "SCRIM")] }))
            expect(snap.unlocked.has("FIRST_TOURNAMENT")).toBe(false)
            evaluatePostTickAchievements(save({ completedMatches: [match("l", 1, "ai", "me", 1, 0)] }))
            expect(snap.unlocked.has("FIRST_TOURNAMENT")).toBe(true)
        } finally { snap.restore() }
    })

    test("Immortalized needs a legend who played for the manager's club", () => {
        const snap = unlocks()
        try {
            const worldLegend = { id: "w", seasonLines: [{ season: 1, clubId: "ai", maps: 30 }] } as unknown as PlayerSaveData
            evaluatePostTickAchievements(save({ legendaryPlayers: [worldLegend] }))
            expect(snap.unlocked.has("HALL_OF_FAME_INDUCTION")).toBe(false)
            const ourLegend = { id: "o", seasonLines: [{ season: 1, clubId: "me", maps: 30 }] } as unknown as PlayerSaveData
            evaluatePostTickAchievements(save({ legendaryPlayers: [worldLegend, ourLegend] }))
            expect(snap.unlocked.has("HALL_OF_FAME_INDUCTION")).toBe(true)
        } finally { snap.restore() }
    })

    test("comeback / upset flags left on a lost match by an older save unlock nothing", () => {
        const snap = unlocks()
        try {
            evaluatePostTickAchievements(save({ completedMatches: [match("l", 20, "me", "ai", 0, 1, "league_t", { _comebackWin: true, _underdogWin: true })] }))
            expect(snap.unlocked.has("COMEBACK_KING")).toBe(false)
            expect(snap.unlocked.has("UNDERDOG")).toBe(false)
        } finally { snap.restore() }
    })

    test("last week's auto-played comeback still counts once the tick has moved the week on", () => {
        const snap = unlocks()
        try {
            evaluatePostTickAchievements(save({ completedMatches: [match("w", 19, "ai", "me", 0, 1, "league_t", { _comebackWin: true })] }))
            expect(snap.unlocked.has("COMEBACK_KING")).toBe(true)
        } finally { snap.restore() }
    })

    test("win counts: friendlies left out, wins at earlier clubs kept", () => {
        const s = save({
            completedMatches: [match("f", 2, "me", "ai", 1, 0, "SCRIM"), match("o", 3, "me", "ai", 1, 0), match("x", 4, "ai", "me", 1, 0)],
        })
        expect(officialCareerWins(s)).toBe(1)
        s.managerDetails.stints = [
            { teamId: "old", teamName: "Old", fromWeek: 1, toWeek: 10, matches: 12, wins: 9, losses: 3, trophies: 0, ended: "moved" },
            { teamId: "me", teamName: "Me", fromWeek: 11, matches: 2, wins: 1, losses: 1, trophies: 0 },
        ]
        expect(officialCareerWins(s)).toBe(10)
        const snap = unlocks()
        try {
            evaluatePostTickAchievements(s)
            expect(snap.unlocked.has("WIN_10")).toBe(true)
        } finally { snap.restore() }
    })
})
