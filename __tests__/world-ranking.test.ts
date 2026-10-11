/**
 * World ranking (Phase 4.8): zero-sum Elo weighted by match importance,
 * world rank = Elo order, league tiers = rank bands at season end, and a
 * bound on weekly rank volatility over a long simulated world.
 */
import { LeagueEngine } from "@/engine/league-engine"
import {
    applyRatedResult, applyTierBands, isPlayoffStage, matchImportance, rankMovement, ratingExchange,
    refreshWorldRankings, regressRatingsToMean, tierBandLimits, tierForRank, tiersAreBanded,
} from "@/engine/world-ranking"
import { RANKING_TUNING } from "@/lib/balance-tuning"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TeamSaveData } from "@/engine/save-types"

const club = (id: string, elo: number, extra: Partial<TeamSaveData> = {}) =>
    ({ id, name: id.toUpperCase(), elo, reputation: 50, leagueTier: "B_TIER", ...extra }) as TeamSaveData
const sumElo = (teams: TeamSaveData[]) => teams.reduce((s, t) => s + t.elo, 0)

describe("rating exchange", () => {
    test("competition decides the importance: friendlies are unrated, league < qualifier < event tiers", () => {
        expect(matchImportance(null)).toBe("FRIENDLY")
        expect(matchImportance("SCRIM", "S_TIER")).toBe("FRIENDLY")
        expect(matchImportance("league_s1_p1_europe_d1")).toBe("LEAGUE")
        expect(matchImportance("iem_cologne_s1", "S_TIER")).toBe("S_TIER")
        expect(matchImportance("cup_s1", "A-TIER")).toBe("A_TIER")
        expect(matchImportance("mystery_s1", undefined)).toBe("C_TIER")
        expect(isPlayoffStage("Grand Final")).toBe(true)
        expect(isPlayoffStage("Quarter-final 2")).toBe(true)
        expect(isPlayoffStage("Round of 16 Match 3")).toBe(true)
        expect(isPlayoffStage("Group A Upper Final")).toBe(false)
        expect(isPlayoffStage("Swiss Round 3 (1-1)")).toBe(false)
        expect(isPlayoffStage("Europe Division 1 · Round 4")).toBe(false)
    })

    test("importance-weighted K: the same result moves more points the bigger the stage", () => {
        const at = (importance: Parameters<typeof ratingExchange>[0]["importance"], playoff = false) =>
            ratingExchange({ winnerElo: 1500, loserElo: 1500, importance, playoff, roundDiff: 4, maps: 1 }).delta
        const ladder = [at("FRIENDLY"), at("LEAGUE"), at("QUALIFIER"), at("B_TIER"), at("A_TIER"), at("S_TIER"), at("S_TIER", true)]
        expect(ladder[0]).toBe(0)
        for (let i = 1; i < ladder.length; i++) expect(ladder[i]).toBeGreaterThan(ladder[i - 1])
        // League play is the floor of the ladder: S-Tier playoffs weigh ~3x a league night.
        expect(ladder[6] / ladder[1]).toBeGreaterThan(2.5)
        // Playoffs only weigh more at events, not in the league.
        expect(ratingExchange({ winnerElo: 1500, loserElo: 1500, importance: "LEAGUE", playoff: true }).delta)
            .toBe(ratingExchange({ winnerElo: 1500, loserElo: 1500, importance: "LEAGUE" }).delta)
    })

    test("an upset moves more than an expected win; margin adds a little, damped for a favourite's rout", () => {
        const favourite = ratingExchange({ winnerElo: 1700, loserElo: 1400, importance: "A_TIER" })
        const upset = ratingExchange({ winnerElo: 1400, loserElo: 1700, importance: "A_TIER" })
        expect(upset.delta).toBeGreaterThan(favourite.delta * 3)
        const close = ratingExchange({ winnerElo: 1500, loserElo: 1500, importance: "S_TIER", roundDiff: 2, maps: 1 })
        const rout = ratingExchange({ winnerElo: 1500, loserElo: 1500, importance: "S_TIER", roundDiff: 13, maps: 1 })
        expect(rout.delta).toBeGreaterThan(close.delta)
        expect(rout.marginFactor).toBeLessThanOrEqual(1 + RANKING_TUNING.MOV_MAX + 1e-9)
        const favRout = ratingExchange({ winnerElo: 1800, loserElo: 1400, importance: "S_TIER", roundDiff: 13, maps: 1 })
        const dogRout = ratingExchange({ winnerElo: 1400, loserElo: 1800, importance: "S_TIER", roundDiff: 13, maps: 1 })
        expect(favRout.marginFactor).toBeLessThan(dogRout.marginFactor)
        // A forfeit (no maps) carries no margin.
        expect(ratingExchange({ winnerElo: 1500, loserElo: 1500, importance: "S_TIER", roundDiff: 13, maps: 0 }).marginFactor).toBe(1)
    })

    test("zero-sum: the winner gains exactly what the loser loses, also at the floor", () => {
        const a = club("a", 1500), b = club("b", 1450)
        const r = applyRatedResult(b, a, { tournamentId: "iem_s1", tournamentTier: "S_TIER", stage: "Grand Final", roundDiff: 20, maps: 3 })
        expect(r.winnerChange).toBeGreaterThan(0)
        expect(r.winnerChange).toBe(-r.loserChange)
        expect(a.elo + b.elo).toBe(2950)
        const floor = club("floor", RANKING_TUNING.FLOOR + 2), top = club("top", 600 + RANKING_TUNING.FLOOR)
        const atFloor = applyRatedResult(top, floor, { tournamentId: "league_s1_p1_cis_d3" })
        expect(floor.elo).toBeGreaterThanOrEqual(RANKING_TUNING.FLOOR)
        expect(atFloor.winnerChange + atFloor.loserChange).toBe(0)
        // Friendlies leave both ratings alone.
        const before = [a.elo, b.elo]
        expect(applyRatedResult(a, b, { tournamentId: "SCRIM" })).toMatchObject({ winnerChange: 0, loserChange: 0 })
        expect([a.elo, b.elo]).toEqual(before)
    })

    test("a new club is provisional: both sides move by the larger K and the counter runs out", () => {
        const fresh = club("fresh", 1300, { ratedMatches: 0 }), old = club("old", 1300)
        const normal = ratingExchange({ winnerElo: 1300, loserElo: 1300, importance: "LEAGUE" }).delta
        const r = applyRatedResult(fresh, old, { tournamentId: "league_s1_p1_cis_d4" })
        expect(r.winnerChange).toBe(normal * RANKING_TUNING.PROVISIONAL_MULTIPLIER)
        expect(r.loserChange).toBe(-r.winnerChange)
        expect(fresh.ratedMatches).toBe(1)
        expect(old.ratedMatches).toBeUndefined()
        fresh.ratedMatches = RANKING_TUNING.PROVISIONAL_MATCHES
        const later = applyRatedResult(fresh, old, { tournamentId: "league_s1_p1_cis_d4" })
        expect(later.winnerChange).toBeLessThan(r.winnerChange)
    })

    test("LeagueEngine.updateEloAfterMatch rates by context and keeps the pool constant", () => {
        const save = { teams: [club("a", 1500), club("b", 1500), club("c", 1500)] } as unknown as GameSave
        const total = sumElo(save.teams)
        const league = LeagueEngine.updateEloAfterMatch(save, "a", "b", 1, undefined, undefined, undefined, 5, { tournamentId: "league_s1_p1_europe_d1", maps: 1 })!
        const major = LeagueEngine.updateEloAfterMatch(save, "c", "b", 2, "S_TIER", undefined, undefined, 10, { tournamentId: "major_s1", stage: "Semi-final 1", maps: 2 })!
        expect(major.winnerChange).toBeGreaterThan(league.winnerChange * 2)
        expect(LeagueEngine.updateEloAfterMatch(save, "a", "c", 1, undefined, undefined, undefined, 5, { tournamentId: "SCRIM", maps: 1 })).toEqual({ winnerChange: 0, loserChange: 0 })
        expect(sumElo(save.teams)).toBe(total)
    })
})

describe("rank bands and season end", () => {
    test("bands scale with the world and tiersAreBanded detects Elo-threshold tiers", () => {
        expect(tierBandLimits(198).map(b => b.maxRank)).toEqual([16, 48, 111])
        expect(tierForRank(16, 198)).toBe("S_TIER")
        expect(tierForRank(17, 198)).toBe("A_TIER")
        const save = { teams: Array.from({ length: 198 }, (_, i) => club(`t${i + 1}`, 2000 - i, { leagueTier: i < 114 ? "S_TIER" : "A_TIER" })) } as unknown as GameSave
        expect(tiersAreBanded(save)).toBe(false)
        applyTierBands(save)
        expect(tiersAreBanded(save)).toBe(true)
        expect(save.teams.filter(t => t.leagueTier === "S_TIER")).toHaveLength(16)
        expect(save.teams.filter(t => t.leagueTier === "C_TIER")).toHaveLength(87)
    })

    test("processSeasonEnd promotes and relegates by the final rank band, then regresses ratings in order", () => {
        const teams = Array.from({ length: 50 }, (_, i) => club(`t${i + 1}`, 1800 - i * 10))
        const save = { teams, eventsLog: [], currentWeek: 52, playerTeamId: "t25" } as unknown as GameSave
        refreshWorldRankings(save)
        applyTierBands(save)
        // t25 has a great season: from rank 25 (B band: 13-28 of 50) into the top 4 (S band).
        save.teams.find(t => t.id === "t25")!.elo = 1795
        const mean = sumElo(save.teams) / save.teams.length
        const spreadBefore = Math.max(...save.teams.map(t => t.elo)) - Math.min(...save.teams.map(t => t.elo))
        const { promoted, relegated } = LeagueEngine.processSeasonEnd(save, "t25")
        expect(promoted.find(p => p.teamId === "t25")).toMatchObject({ from: "B_TIER", to: "S_TIER" })
        expect(relegated.length).toBeGreaterThan(0)
        expect(tiersAreBanded(save)).toBe(true)
        const msg = save.eventsLog.find(e => e.id.startsWith("promotion_t25"))!.data as { message: string }
        expect(msg.message).toMatch(/finished the season #2 in the world/)
        // Regression: same order, same mean, narrower spread.
        const spreadAfter = Math.max(...save.teams.map(t => t.elo)) - Math.min(...save.teams.map(t => t.elo))
        expect(spreadAfter).toBeLessThan(spreadBefore)
        expect(Math.abs(sumElo(save.teams) / save.teams.length - mean)).toBeLessThan(1)
    })

    test("regression keeps the last ranked Elo in step, so the rollover moves nobody", () => {
        const save = { teams: Array.from({ length: 20 }, (_, i) => club(`t${i + 1}`, 1700 - i * 13)) } as unknown as GameSave
        refreshWorldRankings(save)
        regressRatingsToMean(save)
        for (const t of save.teams) expect(rankMovement(save, t.id)).toMatchObject({ own: 0, others: 0 })
    })
})

/**
 * A synthetic two-season world: 198 clubs with hidden strengths, regional
 * leagues of ten re-drawn by rank every split (a double round robin, one
 * round a week), and events for the top of the ranking (S-tier for the top
 * 24, A-tier for 25-56, open qualifiers for the rest). Results come from the
 * hidden strengths with a seeded RNG. The ranking rules must keep the weekly
 * movement of the top 20 small, never inflate the pool, keep tier counts
 * fixed, and still let a strong club climb from the bottom.
 */
describe("volatility bound over a long simulated world", () => {
    const N = 198
    function simulate(seasons: number) {
        const rng = new SeededRNG(4242)
        const strength = new Map<string, number>()
        const teams: TeamSaveData[] = []
        for (let i = 0; i < N; i++) {
            const id = `t${i + 1}`
            // Opening ratings from a reputation-like order; hidden strength correlates but not perfectly.
            const elo = Math.round(1600 - i * 2.4)
            teams.push(club(id, elo, { reputation: 100 - i / 2 }))
            strength.set(id, 1600 - i * 2.4 + (rng.next() - 0.5) * 240)
        }
        // A strong club opening near the bottom.
        const climber = teams[170]
        strength.set(climber.id, 1850)
        const save = { teams, eventsLog: [], currentWeek: 1, playerTeamId: climber.id } as unknown as GameSave
        refreshWorldRankings(save)
        applyTierBands(save)
        const play = (h: TeamSaveData, a: TeamSaveData, tournamentId: string, tier?: string, stage?: string) => {
            const p = 1 / (1 + Math.pow(10, (strength.get(a.id)! - strength.get(h.id)!) / 400))
            const homeWon = rng.next() < p
            const [w, l] = homeWon ? [h, a] : [a, h]
            applyRatedResult(w, l, { tournamentId, tournamentTier: tier, stage, roundDiff: 1 + Math.floor(rng.next() * 10), maps: 1 })
        }
        const byRank = () => [...save.teams].sort((x, y) => (x.worldRanking ?? 999) - (y.worldRanking ?? 999))
        const weeklyTop20: number[] = []
        const top20 = byRank().slice(0, 20).map(t => t.id)
        const tierCounts: string[] = []
        const climberRanks: number[] = []
        const mean0 = sumElo(save.teams) / N
        let divisions: TeamSaveData[][] = []
        for (let week = 1; week <= seasons * 52; week++) {
            save.currentWeek = week
            const wos = ((week - 1) % 52) + 1
            if (wos === 1 || wos === 26) {
                const ordered = byRank()
                divisions = Array.from({ length: Math.ceil(N / 10) }, (_, d) => ordered.slice(d * 10, d * 10 + 10))
            }
            // League: one round a week in weeks 2-24 and 27-49 (double round robin of ten = 18 rounds).
            const round = wos >= 2 && wos <= 24 ? wos - 2 : wos >= 27 && wos <= 49 ? wos - 27 : -1
            if (round >= 0 && round < 18) for (const div of divisions) {
                const ids = [...div]
                const n = ids.length - (ids.length % 2)
                const r = round % (n - 1)
                const rot = [ids[0], ...ids.slice(1, n).slice(r), ...ids.slice(1, n).slice(0, r)]
                for (let i = 0; i < n / 2; i++) play(rot[i], rot[n - 1 - i], `league_s${Math.ceil(week / 52)}_d`)
            }
            // Events every third week: S-tier for the top 24 (two rounds + playoffs), A-tier for 25-56, qualifiers below.
            if (wos % 3 === 0) {
                const ordered = byRank()
                const bracket = (field: TeamSaveData[], id: string, tier: string) => {
                    const pool = rng.shuffle([...field])
                    for (let i = 0; i + 1 < pool.length; i += 2) play(pool[i], pool[i + 1], id, tier, "Swiss Round 1")
                    for (let i = 0; i + 1 < 8; i += 2) play(field[i], field[i + 1], id, tier, "Quarter-final")
                }
                bracket(ordered.slice(0, 24), "s_event", "S_TIER")
                bracket(ordered.slice(24, 56), "a_event", "A_TIER")
                bracket(ordered.slice(56, 120), "qual", "QUALIFIER")
            }
            const before = new Map(save.teams.map(t => [t.id, t.worldRanking!]))
            refreshWorldRankings(save)
            for (const id of top20) weeklyTop20.push(Math.abs(save.teams.find(t => t.id === id)!.worldRanking! - before.get(id)!))
            climberRanks.push(climber.worldRanking!)
            if (wos === 52) {
                LeagueEngine.processSeasonEnd(save, climber.id)
                tierCounts.push(["S_TIER", "A_TIER", "B_TIER", "C_TIER"].map(t => save.teams.filter(x => x.leagueTier === t).length).join("/"))
            }
        }
        const sorted = [...weeklyTop20].sort((a, b) => a - b)
        return {
            median: sorted[Math.floor(sorted.length / 2)], p90: sorted[Math.floor(sorted.length * 0.9)],
            meanDrift: Math.abs(sumElo(save.teams) / N - mean0), tierCounts, climberRanks,
        }
    }

    test("top-20 weekly rank change: median <= 2, p90 <= 6; no inflation; fixed tier counts; a strong club climbs", () => {
        const r = simulate(3)
        expect(r.median).toBeLessThanOrEqual(2)
        expect(r.p90).toBeLessThanOrEqual(6)
        expect(r.meanDrift).toBeLessThan(1)
        expect(new Set(r.tierCounts)).toEqual(new Set(["16/32/63/87"]))
        // From ~#170 into the top 20 within two seasons, and it stays up.
        expect(r.climberRanks[0]).toBeGreaterThan(150)
        expect(Math.min(...r.climberRanks.slice(0, 104))).toBeLessThanOrEqual(20)
        expect(Math.max(...r.climberRanks.slice(130))).toBeLessThanOrEqual(20)
    })
})
