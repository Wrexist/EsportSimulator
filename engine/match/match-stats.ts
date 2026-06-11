/**
 * Match stats aggregation: turns round-level kill/death/assist events
 * into per-player K/D/ADR/KAST/rating, plus picks the map MVP (most
 * kills) and match MVP (highest rating on winning side).
 *
 * Extracted from match-simulation.ts (Phase I2). All three functions
 * are pure — they take round results in, return aggregate stats out —
 * with the only RNG dependency being a small ±5% performance jitter
 * applied per-player in generateMatchStats. SimulationEngineV2 keeps
 * the same method names as facades that delegate here.
 */

import type {
    Player,
    PlayerMatchStats,
    RoundResult,
    MapResult,
} from "@/types"
import type { SeededRNG } from "../rng"

/**
 * Pick the player with the most kills across a list of round results.
 * Used per-map. Falls back to the first roster player if no kills
 * happened (e.g., an unfinished map result snapshot).
 */
export function determineMapMVP(
    rounds: RoundResult[],
    homePlayers: Player[],
    awayPlayers: Player[],
): string {
    const killCounts: Record<string, number> = {}

    rounds.forEach(round => {
        round.kills.forEach(k => {
            killCounts[k.playerId] = (killCounts[k.playerId] || 0) + k.kills
        })
    })

    let mvpId = homePlayers[0]?.id || awayPlayers[0]?.id
    let maxKills = 0

    Object.entries(killCounts).forEach(([playerId, kills]) => {
        if (kills > maxKills) {
            maxKills = kills
            mvpId = playerId
        }
    })

    return mvpId
}

/**
 * Aggregate per-player K/D/A + ADR + KAST + rating + first-blood
 * counts from a list of MapResults. The ±5% performance jitter
 * derives from the supplied RNG so the stat block is deterministic
 * for the same seed.
 *
 * Rating is an Pro 2.0-style approximation:
 *   0.35 × (kills/deaths) + 0.35 × (KAST/100) + 0.30 × impact
 * clamped to [0.3, 2.0].
 */
export function generateMatchStats(
    rng: SeededRNG,
    homePlayers: Player[],
    awayPlayers: Player[],
    mapResults: MapResult[],
    homeWon: boolean,
): Record<string, PlayerMatchStats> {
    const stats: Record<string, PlayerMatchStats> = {}
    const allPlayers = [...homePlayers, ...awayPlayers]

    const totalRounds = mapResults.reduce((sum, m) => sum + m.rounds.length, 0)

    // First pass: aggregate kills + deaths from round events.
    const killCounts: Record<string, number> = {}
    const deathCounts: Record<string, number> = {}
    mapResults.forEach(map => {
        map.rounds.forEach(round => {
            round.kills.forEach(k => {
                killCounts[k.playerId] = (killCounts[k.playerId] || 0) + k.kills
            })
            round.deaths?.forEach(d => {
                deathCounts[d.playerId] = (deathCounts[d.playerId] || 0) + d.deaths
            })
        })
    })

    allPlayers.forEach(player => {
        const isWinner = homePlayers.includes(player) ? homeWon : !homeWon
        const performanceMod = rng.range(0.95, 1.05)

        const kills = killCounts[player.id] || 0
        const deaths = deathCounts[player.id] || 0

        // Assists derived from KILL events with this player as assister.
        let assists = 0
        mapResults.forEach(map => {
            map.rounds.forEach(round => {
                round.events?.forEach(e => {
                    if (e.type === "KILL" && e.assisterId === player.id) {
                        assists++
                    }
                })
            })
        })

        // ADR approx: 85 dmg per kill + 20 per assist, normalized to rounds.
        const adr = totalRounds > 0
            ? Math.round(((kills * 85 + assists * 20) / totalRounds) * (isWinner ? 1.05 : 0.95) * performanceMod)
            : 0

        // KAST: % of rounds where the player got a Kill, Assist, Survived,
        // or was Traded. Approximated as "got kill or assist or didn't die".
        let kastRounds = 0
        mapResults.forEach(map => {
            map.rounds.forEach(round => {
                const gotKill = round.kills?.some(k => k.playerId === player.id && k.kills > 0) ?? false
                const gotAssist = round.events?.some(e => e.type === "KILL" && e.assisterId === player.id) ?? false
                const died = round.deaths?.some(d => d.playerId === player.id && d.deaths > 0) ?? false
                if (gotKill || gotAssist || !died) kastRounds++
            })
        })
        const kast = totalRounds > 0 ? Math.round((kastRounds / totalRounds) * 100) : 0

        // First-blood + headshot + clutch counts from event log.
        let fKills = 0
        let fDeaths = 0
        let headshots = 0
        let clutchCount = 0
        mapResults.forEach(map => {
            map.rounds.forEach(round => {
                if (round.events) {
                    const killEvents = round.events.filter(e => e.type === "KILL").sort((a, b) => a.time - b.time)
                    if (killEvents.length > 0) {
                        if (killEvents[0].playerId === player.id) fKills++
                        if (killEvents[0].victimId === player.id) fDeaths++
                    }

                    round.events.forEach(e => {
                        if (e.type === "KILL" && e.playerId === player.id && e.isHeadshot) {
                            headshots++
                        }
                        // Real CLUTCH events (round-outcome.ts emits one per
                        // 1vX win) — previously the stat was rng.int(0,2),
                        // unrelated to whether the player actually clutched.
                        if (e.type === "CLUTCH" && e.playerId === player.id) {
                            clutchCount++
                        }
                    })
                }
            })
        })

        const kd = deaths > 0 ? kills / deaths : kills
        const impact = (kills * 1.5 + assists * 0.5) / Math.max(1, totalRounds)
        const rating = Math.max(0.3, Math.min(2.0,
            (kd * 0.35 + (kast / 100) * 0.35 + impact * 0.3) * performanceMod
        ))

        stats[player.id] = {
            playerId: player.id,
            matchId: "",
            kills,
            deaths,
            assists,
            headshots,
            adr,
            kast,
            rating,
            clutches: clutchCount,
            firstKills: fKills,
            firstDeaths: fDeaths,
            mapsPlayed: mapResults.length,
        }
    })

    return stats
}

/**
 * Pick the match MVP — highest-rating player on the winning side.
 * Falls back to the first winning player if no stats are present.
 */
export function determineMVP(
    stats: Record<string, PlayerMatchStats>,
    winningPlayers: Player[],
): string {
    let mvpId = winningPlayers[0]?.id || ""
    let bestRating = 0

    winningPlayers.forEach(player => {
        const playerStats = stats[player.id]
        if (playerStats && playerStats.rating > bestRating) {
            bestRating = playerStats.rating
            mvpId = player.id
        }
    })

    return mvpId
}
