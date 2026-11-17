/**
 * Audit 2026-11-17, matchengine area: regressions for MATCHENGINE-01..07, -09..-11.
 */
import { EconomyManager } from "@/engine/economy-manager"
import { scriptBuyPhase } from "@/engine/match/round-sim/buy"
import type { PlayerSimulationState } from "@/engine/match/round-outcome"
import { buildMatchInsights, KEY_ROUND_LIMIT } from "@/lib/match-insights"
import { buildManagementRecord } from "@/engine/match/legacy-prepare"
import type { LegacySeriesContext } from "@/engine/match/legacy-series"
import { MatchAnalyzer } from "@/engine/match-analyzer"
import { pickStrengths, simulateMapVeto } from "@/engine/match/map-veto"
import { recordOfficialMatch } from "@/engine/official-stats"
import { createLaunchFixture } from "../scripts/launch/fixtures"
import { SeededRNG } from "@/engine/rng"
import { MapId } from "@/types"
import type { MapResult, MatchResult, RoundResult, Player } from "@/types"
import type { GameSave, MatchSaveData } from "@/engine/save-types"

// ---------------------------------------------------------------- MATCHENGINE-01

describe("MATCHENGINE-01: a low-cash team mid-half keeps the rifles it saved", () => {
    test("the automatic buy never returns PISTOL (half starts force it in the series runner)", () => {
        for (const style of [undefined, "standard", "force", "eco"] as const) {
            for (let cash = 0; cash <= 1000; cash += 50) expect(EconomyManager.getTeamStrategy(cash, style)).not.toBe("PISTOL")
        }
        expect(EconomyManager.getTeamStrategy(670)).toBe("ECO")
    })

    test("Ts with saved AK-47s and $0-$200 after a time loss keep them on the next buy", () => {
        const players = ["a", "b", "c", "d", "e"].map(id => ({ id, role: "RIFLER" }))
        const cash = [0, 200, 150, 2000, 1000]
        const economy: Record<string, PlayerSimulationState> = Object.fromEntries(players.map((p, i) => [p.id, {
            id: p.id, cash: cash[i], weapon: i < 3 ? "ak47" : "glock", hasArmor: i < 3, hasHelmet: i < 3, hasKit: false, utility: [],
        } as PlayerSimulationState]))
        const avg = cash.reduce((s, c) => s + c, 0) / cash.length
        expect(avg).toBeLessThanOrEqual(800)
        const strategy = EconomyManager.getTeamStrategy(avg)
        scriptBuyPhase(players, economy, strategy, false, new SeededRNG(3))
        expect(["a", "b", "c"].map(id => economy[id].weapon)).toEqual(["ak47", "ak47", "ak47"])
        expect(Object.values(economy).every(e => e.cash >= 0)).toBe(true)
    })
})

// ---------------------------------------------------------------- insights helpers

const own = ["o1", "o2", "o3", "o4", "o5"]
const opp = ["x1", "x2", "x3", "x4", "x5"]
const stat = (id: string, rating: number) => ({ playerId: id, rating, kills: 15, deaths: 15 })

/**
 * A map the two sides trade round by round (loser first) until the loser's
 * rounds run out; the winner takes the rest, so the last round is the winner's.
 * Own plays saves against full buys: each own win is an economy key round.
 */
function busyMap(name: string, ownRounds: number, oppRounds: number): MapResult {
    const ownWon = ownRounds > oppRounds
    const loser = Math.min(ownRounds, oppRounds), total = ownRounds + oppRounds
    const winners = Array.from({ length: total }, (_, i) => i < 2 * loser ? (i % 2 === 0) !== ownWon : ownWon)
    const rounds = winners.map((ownWins, i) => {
        const pistol = i === 0 || i === 12
        return { roundNumber: i + 1, winningTeamId: ownWins ? "own" : "opp", buys: { home: pistol ? "PISTOL" : "ECO", away: pistol ? "PISTOL" : "FULL" } } as unknown as RoundResult
    })
    return { map: name, winner: ownRounds > oppRounds ? "own" : "opp", homeScore: ownRounds, awayScore: oppRounds, rounds } as unknown as MapResult
}

function series(maps: MapResult[], ratings = [1.2, 1.1, 1.0, 0.95, 0.92], management?: MatchResult["management"]): MatchResult {
    const ownMaps = maps.filter(m => m.winner === "own").length
    return {
        homeScore: ownMaps, awayScore: maps.length - ownMaps, winnerId: ownMaps * 2 > maps.length ? "own" : "opp",
        playerStats: Object.fromEntries([...own.map((id, i) => [id, stat(id, ratings[i])]), ...opp.map(id => [id, stat(id, 1)])]),
        maps,
        ...(management ? { management } : {}),
    } as unknown as MatchResult
}

const insights = (r: MatchResult, nextMatchId?: string) =>
    buildMatchInsights({ result: r, teamId: "own", isHome: true, ownLineup: own, opponentLineup: opp, ...(nextMatchId ? { nextMatchId } : {}) })

// ---------------------------------------------------------------- MATCHENGINE-02

describe("MATCHENGINE-02: every map of a series keeps its key rounds", () => {
    test("a BO3 whose map 1 alone has 10+ lines still lists map 3's pistols, overtime and decider", () => {
        const r = series([busyMap("Mirage", 13, 11), busyMap("Sandstone", 7, 13), busyMap("Ancient", 22, 20)])
        const all = insights(r).keyRounds
        expect(all.length).toBeLessThanOrEqual(KEY_ROUND_LIMIT)
        for (const map of ["Mirage", "Sandstone", "Ancient"]) {
            const lines = all.filter(k => k.map === map)
            expect(lines.some(k => k.label === "Map-deciding round")).toBe(true)
            expect(lines.filter(k => k.kind === "pistol")).toHaveLength(2)
        }
        expect(all.some(k => k.map === "Ancient" && k.label === "Map went to overtime")).toBe(true)
        // Maps stay in series order, rounds ascending within a map.
        const order = all.map(k => ["Mirage", "Sandstone", "Ancient"].indexOf(k.map))
        expect(order).toEqual([...order].sort((a, b) => a - b))
    })

    test("a BO1 keeps the decider and still shows economy rounds; headline counts every pistol", () => {
        const r = series([busyMap("Mirage", 13, 11)])
        const result = insights(r)
        expect(result.keyRounds.length).toBeGreaterThan(3)
        expect(result.keyRounds.length).toBeLessThanOrEqual(KEY_ROUND_LIMIT)
        expect(result.keyRounds.some(k => k.label === "Map-deciding round")).toBe(true)
        expect(result.keyRounds.some(k => k.label === "Won on a save against a full buy")).toBe(true)
        expect(result.headline).toContain("pistol rounds")
    })
})

// ---------------------------------------------------------------- MATCHENGINE-04 / -05 / -07

describe("MATCHENGINE-04: 'Struggled' only for a starter rated under 0.90", () => {
    test("the lowest of five at 1.05 is not listed as struggling", () => {
        expect(insights(series([busyMap("Mirage", 13, 5)], [1.4, 1.3, 1.2, 1.1, 1.05])).standouts.struggled).toBeUndefined()
    })
    test("a lowest starter under 0.90 still is", () => {
        expect(insights(series([busyMap("Mirage", 13, 5)], [1.4, 1.3, 1.2, 1.1, 0.85])).standouts.struggled?.playerId).toBe("o5")
    })
})

describe("MATCHENGINE-05: the training prompt needs two weak starters or one well under 0.90", () => {
    const training = (ratings: number[]) => insights(series([busyMap("Mirage", 13, 5)], ratings)).actions.find(a => a.href === "/training")
    test("one starter at 0.85: no prompt", () => expect(training([1.2, 1.1, 1.0, 0.95, 0.85])).toBeUndefined())
    test("two starters under 0.90: prompt with both counted", () => expect(training([1.2, 1.1, 1.0, 0.88, 0.85])?.reason).toBe("2 starters rated below 0.90"))
    test("one starter under 0.80: prompt", () => expect(training([1.2, 1.1, 1.0, 0.95, 0.75])?.reason).toBe("1 starter rated below 0.90"))
})

describe("MATCHENGINE-07: one next-match button when there is no next match", () => {
    test("the tactics prompt without a next match does not add 'Prepare next match' to the same page", () => {
        // Own lost with the better buy 4 times: the tactics prompt fires.
        const map = busyMap("Mirage", 13, 11)
        map.rounds.forEach(r => { if ((r.buys as { home: string }).home === "ECO") (r as unknown as { buys: { home: string; away: string } }).buys = { home: "FULL", away: "ECO" } })
        const actions = insights(series([map])).actions
        expect(actions.filter(a => a.href === "/schedule")).toHaveLength(1)
        expect(actions.some(a => a.label === "Tactics and loadouts")).toBe(true)
        expect(actions.some(a => a.label === "Prepare next match")).toBe(false)
    })
    test("without the tactics prompt, 'Prepare next match' is the one button", () => {
        const actions = insights(series([busyMap("Mirage", 13, 5)])).actions
        expect(actions.filter(a => a.href === "/schedule").map(a => a.label)).toEqual(["Prepare next match"])
        expect(insights(series([busyMap("Mirage", 13, 5)]), "n1").actions.filter(a => a.href.includes("/tactics")).map(a => a.label)).toEqual(["Prepare next match"])
    })
})

// ---------------------------------------------------------------- MATCHENGINE-06

describe("MATCHENGINE-06: the playstyle counter line names what the cap left of it", () => {
    const team = (id: string, playstyle: string) => ({ id, playstyle, economyStyle: "standard" })
    const record = (staff: object, mine = "aggressive", theirs = "structured", counterMod = 1.04) => buildManagementRecord({
        ctx: {
            managedTeamId: "own",
            home: { team: team("own", mine), staff, counterMod },
            away: { team: team("opp", theirs), staff: {}, counterMod: 1 },
        } as unknown as LegacySeriesContext,
        match: { vodReviewed: true }, mode: "instant", timeoutsUsed: 0, maps: [],
    })!
    const coach = (level: number) => ({ coach: { level } })
    const styleLine = (m: MatchResult["management"]) => insights(series([busyMap("Mirage", 13, 5)], undefined, m)).tactics[0]

    test("no staff: the full +4% is applied and shown", () => {
        const m = record({})
        expect(m.counter).toBe("advantage")
        expect(m.counterEdge).toBeCloseTo(0.04)
        expect(styleLine(m)).toContain("(+4% base strength)")
    })
    test("a coach at level 4 (8%) leaves +2%", () => {
        const m = record(coach(4))
        expect(m.counterEdge).toBeCloseTo(0.02)
        expect(styleLine(m)).toContain("(+2% base strength)")
    })
    test("a level-5 coach fills the cap: the line says it added nothing", () => {
        const m = record(coach(5))
        expect(m.counterEdge).toBe(0)
        expect(styleLine(m)).toBe("Playstyle Aggressive countered the scouted opponent style, but staff bonuses already fill the +10% cap, so it added nothing.")
    })
    test("being countered over a full cap costs only what dips under it, or nothing", () => {
        const partly = record({ ...coach(5), analyst: { level: 1 } }, "structured", "aggressive", 0.97)
        expect(partly.counter).toBe("disadvantage")
        expect(partly.counterEdge).toBeCloseTo(-0.01)
        expect(styleLine(partly)).toContain("(-1% base strength)")
        const none = record({ ...coach(5), analyst: { level: 2 } }, "structured", "aggressive", 0.97)
        expect(none.counterEdge).toBe(0)
        expect(styleLine(none)).toBe("Playstyle Structured was countered by the scouted opponent style, but staff bonuses above the +10% cap absorbed it, so it cost nothing.")
        expect(styleLine(record({}, "structured", "aggressive", 0.97))).toContain("(-3% base strength)")
    })
    test("older results without counterEdge keep the nominal numbers", () => {
        expect(styleLine({ teamId: "own", playstyle: "aggressive", opponentScouted: true, counter: "advantage", timeoutsUsed: 0, strategyCalls: 0, mode: "instant" })).toContain("(+4% base strength)")
        expect(styleLine({ teamId: "own", playstyle: "aggressive", opponentScouted: true, counter: "disadvantage", timeoutsUsed: 0, strategyCalls: 0, mode: "instant" })).toContain("(-3% base strength)")
    })
})

// ---------------------------------------------------------------- MATCHENGINE-03

describe("MATCHENGINE-03: the season's biggest win / heaviest defeat use the signed round margin", () => {
    function fakeMap(map: string, homeIds: string[], awayIds: string[], h: number, a: number): MapResult {
        const rounds: RoundResult[] = []
        const round = (ct: string, t: string): RoundResult => ({ roundNumber: rounds.length + 1, winner: "ct", winType: "ELIMINATION", ctTeam: ct, tTeam: t, kills: [], events: [], damage: {} } as unknown as RoundResult)
        for (let i = 0; i < h; i++) rounds.push(round("home", "away"))
        for (let i = 0; i < a; i++) rounds.push(round("away", "home"))
        void homeIds; void awayIds
        return { map, rounds, finalScore: { team1: h, team2: a }, homeScore: h, awayScore: a } as unknown as MapResult
    }
    function result(save: GameSave, homeId: string, awayId: string, maps: [number, number][]): MatchResult {
        const home = save.teams.find(t => t.id === homeId)!.rosterIds.slice(0, 5), away = save.teams.find(t => t.id === awayId)!.rosterIds.slice(0, 5)
        const homeMaps = maps.filter(([h, a]) => h > a).length
        return {
            engineVersion: "script-v1", winnerId: homeMaps * 2 > maps.length ? homeId : awayId, homeScore: homeMaps, awayScore: maps.length - homeMaps,
            maps: maps.map(([h, a], i) => fakeMap(["Mirage", "Nuke", "Inferno"][i], home, away, h, a)), mvpPlayerId: home[0], playerStats: {}, lineups: { [homeId]: home, [awayId]: away },
        } as unknown as MatchResult
    }
    const official = (id: string, home: string, away: string, week: number): MatchSaveData =>
        ({ id, homeTeamId: home, awayTeamId: away, tournamentId: "league_s1_test_d1", stage: "Round 1", week, format: "BO3", seed: 1 }) as MatchSaveData

    test("a 2-1 won 28-35 on rounds is no biggest win; a 2-1 lost 35-28 is no heaviest defeat", () => {
        const save = createLaunchFixture("first-week", 51017)
        const mine = save.playerTeamId!, other = save.teams.find(t => t.id !== mine)!.id
        recordOfficialMatch(save, official("w1", mine, other, 3), result(save, mine, other, [[13, 11], [2, 13], [13, 11]]))
        recordOfficialMatch(save, official("l1", mine, other, 4), result(save, mine, other, [[11, 13], [13, 2], [11, 13]]))
        const user = save.recordBook!.open.find(o => o.season === 1)!.user[mine]
        expect(user.wins).toBe(1)
        expect(user.losses).toBe(1)
        expect(user.biggestWin).toBeUndefined()
        expect(user.worstLoss).toBeUndefined()
        recordOfficialMatch(save, official("w2", mine, other, 5), result(save, mine, other, [[13, 3], [13, 9]]))
        expect(user.biggestWin).toMatchObject({ value: 14, score: "2-0", matchId: "w2" })
    })
})

// ---------------------------------------------------------------- MATCHENGINE-10

describe("MATCHENGINE-10: a pistol snowball needs the follow-up rounds too", () => {
    const roster = (prefix: string) => Object.fromEntries([1, 2, 3, 4, 5].map(i => [`${prefix}${i}`, { playerId: `${prefix}${i}`, kills: 15, deaths: 15, assists: 3, adr: 75, rating: 1, clutches: 0 }]))
    const ids = (prefix: string) => [1, 2, 3, 4, 5].map(i => ({ id: `${prefix}${i}` }))
    /** A 13-11 home win; `homeRounds` are the round numbers home wins. */
    function analyze(homeRounds: number[]) {
        const won = new Set(homeRounds)
        const rounds = Array.from({ length: 24 }, (_, i) => ({ roundNumber: i + 1, winner: won.has(i + 1) ? "ct" : "t", ctTeam: "home", tTeam: "away" }))
        return MatchAnalyzer.analyze(
            { id: "m1", homeTeamId: "home", awayTeamId: "away" },
            { homeScore: 1, awayScore: 0, playerStats: { ...roster("h"), ...roster("a") }, maps: [{ name: "Mirage", homeScore: 13, awayScore: 11, rounds }] } as unknown as MatchResult,
            "Home", "Away", ids("h"), ids("a"),
        )
    }
    test("both pistols won but only 2 of the 4 follow-ups: not ECONOMY", () => {
        // Pistols 1 and 13; follow-ups 2 and 14 won, 3 and 15 lost.
        const a = analyze([1, 2, 13, 14, 4, 5, 6, 7, 8, 9, 10, 11, 12])
        expect(a.keyFactor).not.toBe("ECONOMY")
        expect(a.losingFactor).not.toBe("Never recovered from pistol losses")
    })
    test("both pistols and 3 of the 4 follow-ups won: ECONOMY", () => {
        const a = analyze([1, 2, 3, 13, 14, 4, 5, 6, 7, 8, 9, 10, 11])
        expect(a.keyFactor).toBe("ECONOMY")
        expect(a.winningFactor).toBe("Snowballed from pistol round victories")
    })
})

// ---------------------------------------------------------------- MATCHENGINE-11

describe("MATCHENGINE-11: a veto PICK weighs the opponent's comfort", () => {
    const pool = [MapId.SANDSTONE, MapId.MIRAGE, MapId.INFERNO, MapId.NUKE, MapId.OVERPASS, MapId.VERTIGO, MapId.ANCIENT, MapId.ANUBIS]
    const table = (values: Partial<Record<MapId, number>>) => new Map<MapId, number>(pool.map(m => [m, values[m] ?? 60]))
    const analyst = (level: number) => ({ id: "an", level } as never)
    const players = [] as Player[]

    test("pickStrengths is the picker's edge, on the 0-100 scale", () => {
        const net = pickStrengths(table({ [MapId.MIRAGE]: 70 }), table({ [MapId.MIRAGE]: 80 }))
        expect(net.get(MapId.MIRAGE)).toBe(40)
        expect(net.get(MapId.NUKE)).toBe(50)
    })

    test("home does not pick its favourite map when the opponent is even better there", () => {
        // Bans: home bans away's best (Ancient), away bans home's best (Vertigo).
        // Home then likes Mirage most (75) but away is 78 there; home leads most on Inferno (+8).
        const home = table({ [MapId.VERTIGO]: 80, [MapId.MIRAGE]: 75, [MapId.INFERNO]: 68 })
        const away = table({ [MapId.ANCIENT]: 90, [MapId.MIRAGE]: 78 })
        for (let seed = 1; seed <= 20; seed++) {
            const v = simulateMapVeto(new SeededRNG(seed), "home", "away", players, players, analyst(5), analyst(5), home, away)
            expect(v.veto.slice(0, 2).map(e => e.map)).toEqual([MapId.ANCIENT, MapId.VERTIGO])
            expect(v.veto.find(e => e.teamId === "home" && e.action === "PICK")!.map).toBe(MapId.INFERNO)
        }
    })
})
