/**
 * MATCHENGINE-04: the map MVP comes from the side that won the map (as the
 * match MVP comes from the series winner), and the tournament "MVP maps"
 * count counts maps, not the match MVP on top.
 */
import { determineMapWinnerMVP } from "@/engine/match/match-stats"
import { prepareLegacySeries } from "@/engine/match/legacy-prepare"
import { finalizeLegacySeries, runLegacySeries } from "@/engine/match/legacy-series"
import { buildSide, even } from "@/engine/match/calibration/fixtures"
import { ACTIVE_MAP_POOL } from "@/data/map-pool"
import { getTournamentMVP } from "@/engine/tournament-stats"
import type { Player, RoundResult, PlayerMatchStats } from "@/types"
import type { CompletedMatchSaveData, PlayerSaveData, TeamSaveData } from "@/engine/save-types"

const player = (id: string) => ({ id, nickname: id }) as unknown as Player
const round = (kills: Record<string, number>) => ({ kills: Object.entries(kills).map(([playerId, k]) => ({ playerId, kills: k })) }) as unknown as RoundResult

test("the loser's top fragger is not the map MVP", () => {
    const home = [player("h1"), player("h2")], away = [player("a1"), player("a2")]
    const map = { homeScore: 9, awayScore: 13, rounds: [round({ h1: 4, a1: 1 }), round({ h1: 3, a2: 2 })] }
    expect(determineMapWinnerMVP(map, home, away)).toBe("a2")
    const stats = { h1: { rating: 1.9 }, a1: { rating: 1.2 }, a2: { rating: 1.1 } } as unknown as Record<string, PlayerMatchStats>
    expect(determineMapWinnerMVP(map, home, away, stats)).toBe("a1")
})

test("every map MVP of a simulated series plays for that map's winner", () => {
    for (let i = 0; i < 12; i++) {
        const home = buildSide({ id: "HOME", skills: even(70) }), away = buildSide({ id: "AWAY", skills: even(70) })
        const ctx = prepareLegacySeries({
            match: { id: `mvp${i}`, seed: 11 + i, format: "BO3", maps: [ACTIVE_MAP_POOL[i % 7], ACTIVE_MAP_POOL[(i + 2) % 7], ACTIVE_MAP_POOL[(i + 4) % 7]], engineVersion: "script-v1" },
            homeTeam: home.team, awayTeam: away.team, homePlayers: home.players, awayPlayers: away.players, staff: [], managedTeamId: "nobody",
        })
        const result = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
        for (const m of result.maps) {
            const winners = (m.homeScore ?? 0) > (m.awayScore ?? 0) ? home.players : away.players
            expect(winners.map(p => p.id)).toContain(m.mvpPlayerId)
        }
    }
}, 60_000)

test("a BO1 where one player is match and map MVP counts one MVP map", () => {
    const teams = [{ id: "A", name: "A", rosterIds: ["p1"] }, { id: "B", name: "B", rosterIds: ["p2"] }] as unknown as TeamSaveData[]
    const players = [{ id: "p1", nickname: "p1" }, { id: "p2", nickname: "p2" }] as unknown as PlayerSaveData[]
    const match = {
        id: "m1", tournamentId: "T", homeTeamId: "A", awayTeamId: "B", week: 1,
        result: {
            homeScore: 1, awayScore: 0, winnerId: "A", mvpPlayerId: "p1",
            maps: [{ homeScore: 13, awayScore: 5, mvpPlayerId: "p1", rounds: [] }],
            playerStats: { p1: { kills: 25, deaths: 10, rating: 1.6, mapsPlayed: 1 }, p2: { kills: 10, deaths: 25, rating: 0.6, mapsPlayed: 1 } },
        },
    } as unknown as CompletedMatchSaveData
    const mvp = getTournamentMVP([match], "T", players, teams)
    expect(mvp?.playerId).toBe("p1")
    expect(mvp?.mvpMaps).toBe(1)
})
