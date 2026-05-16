/**
 * Map veto + map-strength helpers.
 *
 * Extracted from match-simulation.ts (Phase I1). All three functions are
 * pure (no `this`, no shared state) and operate over Player + analyst
 * inputs to produce a deterministic 3-map BO3 selection.
 *
 * SimulationEngineV2 retains thin facade methods so external callers
 * (useLiveMatch.ts, match-simulation-slice.ts) that hit
 * `simulationEngineV2.calculateMapStrengths(...)` /
 * `simulationEngineV2.selectMapForVeto(...)` keep working unchanged.
 */

import { MapId } from "@/types"
import type { Player, MapVeto, Analyst } from "@/types"
import type { SeededRNG } from "../rng"

const ACTIVE_MAP_POOL: MapId[] = [
    MapId.DUST2, MapId.MIRAGE, MapId.INFERNO, MapId.NUKE,
    MapId.OVERPASS, MapId.VERTIGO, MapId.ANCIENT, MapId.ANUBIS,
]

/**
 * Compute a 0-100 strength score per map for a roster. Tactical maps
 * (Nuke / Overpass) lean on tactic; aim maps (Dust2 / Mirage) lean on
 * skill; the rest blend both. Returns a defaulted-to-50 map for empty
 * rosters so downstream veto logic never sees missing entries.
 */
export function calculateMapStrengths(players: Player[]): Map<MapId, number> {
    const strengths = new Map<MapId, number>()

    if (players.length === 0) {
        ACTIVE_MAP_POOL.forEach(map => strengths.set(map, 50))
        return strengths
    }

    const avgSkill = players.reduce((sum, p) => sum + p.skill, 0) / players.length
    const avgTactic = players.reduce((sum, p) => sum + p.tactic, 0) / players.length

    ACTIVE_MAP_POOL.forEach(map => {
        let strength = avgSkill

        switch (map) {
            case MapId.NUKE:
            case MapId.OVERPASS:
                strength = avgSkill * 0.4 + avgTactic * 0.6
                break
            case MapId.DUST2:
            case MapId.MIRAGE:
                strength = avgSkill * 0.7 + avgTactic * 0.3
                break
            default:
                strength = avgSkill * 0.5 + avgTactic * 0.5
        }

        strengths.set(map, strength)
    })

    return strengths
}

/**
 * Select the best map to BAN (opponent's strongest) or PICK (own
 * strongest) given a strength table. Higher analyst level reduces the
 * noise added to scoring — at level 5 the analyst always picks the
 * strict best, at level 1 noise can flip the choice.
 */
export function selectMapForVeto(
    rng: SeededRNG,
    availableMaps: MapId[],
    targetStrengths: Map<MapId, number>,
    action: "BAN" | "PICK",
    analystLevel: number,
): MapId {
    // Acknowledge the parameter — BAN and PICK use the same "pick the
    // top-scoring" rule because the caller passes a different
    // strength table (opponent's vs own).
    void action

    const randomFactor = (6 - analystLevel) * 0.1 // 0.5 at L1, 0.1 at L5

    const scored = availableMaps.map(map => ({
        map,
        score: (targetStrengths.get(map) || 50) + rng.range(-randomFactor * 20, randomFactor * 20),
    }))

    scored.sort((a, b) => b.score - a.score)
    return scored[0].map
}

/**
 * Run a 5-step BO3 veto: ban / ban / pick / pick / decider.
 * Home bans away's best, away bans home's best, home picks its best,
 * away picks its best, system random-picks from the remainder.
 *
 * Returns the veto event log + the three maps the match will play.
 */
export function simulateMapVeto(
    rng: SeededRNG,
    homeTeamId: string,
    awayTeamId: string,
    homePlayers: Player[],
    awayPlayers: Player[],
    homeAnalyst?: Analyst,
    awayAnalyst?: Analyst,
    cachedHomeMapStrengths?: Map<MapId, number>,
    cachedAwayMapStrengths?: Map<MapId, number>,
): { veto: MapVeto[]; maps: MapId[] } {
    let availableMaps = [...ACTIVE_MAP_POOL]
    const veto: MapVeto[] = []
    const selectedMaps: MapId[] = []

    const homeVetoSkill = homeAnalyst ? homeAnalyst.level : 1
    const awayVetoSkill = awayAnalyst ? awayAnalyst.level : 1

    const homeMapStrengths = cachedHomeMapStrengths || calculateMapStrengths(homePlayers)
    const awayMapStrengths = cachedAwayMapStrengths || calculateMapStrengths(awayPlayers)

    // Home bans away's strongest map.
    const homeBan = selectMapForVeto(rng, availableMaps, awayMapStrengths, "BAN", awayVetoSkill)
    veto.push({ teamId: homeTeamId, action: "BAN", map: homeBan, order: 1 })
    availableMaps = availableMaps.filter(m => m !== homeBan)

    // Away bans home's strongest map.
    const awayBan = selectMapForVeto(rng, availableMaps, homeMapStrengths, "BAN", homeVetoSkill)
    veto.push({ teamId: awayTeamId, action: "BAN", map: awayBan, order: 2 })
    availableMaps = availableMaps.filter(m => m !== awayBan)

    // Home picks its best remaining.
    const homePick = selectMapForVeto(rng, availableMaps, homeMapStrengths, "PICK", homeVetoSkill)
    veto.push({ teamId: homeTeamId, action: "PICK", map: homePick, order: 3 })
    selectedMaps.push(homePick)
    availableMaps = availableMaps.filter(m => m !== homePick)

    // Away picks its best remaining.
    const awayPick = selectMapForVeto(rng, availableMaps, awayMapStrengths, "PICK", awayVetoSkill)
    veto.push({ teamId: awayTeamId, action: "PICK", map: awayPick, order: 4 })
    selectedMaps.push(awayPick)
    availableMaps = availableMaps.filter(m => m !== awayPick)

    // System decider — random from remaining.
    const decider = rng.pick(availableMaps)
    veto.push({ teamId: "SYSTEM", action: "PICK", map: decider, order: 5 })
    selectedMaps.push(decider)

    return { veto, maps: selectedMaps }
}
