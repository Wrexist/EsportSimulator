/**
 * The engine's veto for a match nobody vetoes by hand (Quick sim veto, the
 * coach's delegated veto, one-click "Sim match"): each club bans the other's
 * strongest maps and picks its own, from the season's pool (C6), seeded by the
 * fixture so the same match always gets the same maps.
 */

import { simulationEngineV2, SeededRNG } from "@/engine"
import { ACTIVE_MAP_POOL } from "@/data/map-pool"
import { deterministicSeed } from "@/lib/utils"
import type { MapId } from "@/types/enums"
import type { Player } from "@/types"

export interface VetoFixture {
    id: string
    seed?: number
    week: number
    format?: string
    homeTeamId: string
    awayTeamId: string
}

export function autoVetoMaps(match: VetoFixture, homePlayers: Player[], awayPlayers: Player[]): MapId[] {
    const rng = new SeededRNG(deterministicSeed(match.id, match.seed, match.week, match.format, match.homeTeamId, match.awayTeamId))
    let currentPool = [...ACTIVE_MAP_POOL] as MapId[]
    let picks: MapId[] = []
    const side = (team: "home" | "away") => team === "home"
        ? { chooser: homePlayers, enemy: awayPlayers, chooserId: match.homeTeamId, enemyId: match.awayTeamId }
        : { chooser: awayPlayers, enemy: homePlayers, chooserId: match.awayTeamId, enemyId: match.homeTeamId }
    // Banning looks at the enemy's strengths (ban their best), picking at your own.
    const select = (team: "home" | "away", pool: MapId[], action: "BAN" | "PICK") => {
        const s = side(team)
        const strengths = action === "BAN"
            ? simulationEngineV2.calculateMapStrengths(s.enemy, s.enemyId)
            : simulationEngineV2.calculateMapStrengths(s.chooser, s.chooserId)
        return simulationEngineV2.selectMapForVeto(rng, pool, strengths, action, 3) as MapId
    }
    const runBan = (team: "home" | "away") => { const ban = select(team, currentPool, "BAN"); currentPool = currentPool.filter(m => m !== ban) }
    const runPick = (team: "home" | "away") => { const pick = select(team, currentPool, "PICK"); currentPool = currentPool.filter(m => m !== pick); picks.push(pick) }

    if (match.format === "BO1") {
        // Ban down to one map whatever the season's pool size.
        for (let i = 0; currentPool.length > 1; i++) runBan(i % 2 === 0 ? "home" : "away")
        if (currentPool.length > 0) picks.push(currentPool[0])
    } else if (match.format === "BO5") {
        // Ban down to five, then pick the order A, B, A, B and the decider.
        for (let i = 0; currentPool.length > 5; i++) runBan(i % 2 === 0 ? "home" : "away")
        let tempPool = [...currentPool]
        const ordered: MapId[] = []
        for (const team of ["home", "away", "home", "away"] as const) {
            const pick = select(team, tempPool, "PICK")
            tempPool = tempPool.filter(m => m !== pick)
            ordered.push(pick)
        }
        if (tempPool.length > 0) ordered.push(tempPool[0])
        picks = ordered
    } else {
        // BO3: ban, ban, pick, pick, ban down to the decider.
        runBan("home")
        runBan("away")
        runPick("home")
        runPick("away")
        for (let i = 0; currentPool.length > 1; i++) runBan(i % 2 === 0 ? "home" : "away")
        if (currentPool.length > 0) picks.push(currentPool[0])
    }
    return picks
}
