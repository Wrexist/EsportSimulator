/**
 * Pure-function helpers used by `useLiveMatch`.
 *
 * Extracted so the hook can focus on React state management while these
 * functions stay easy to unit-test and reason about in isolation.
 */

import { MapId, Player, LivePlayerState } from "@/types"
import { EconomyManager } from "@/engine"
import { createRoundStartEconomy, resolveHomeStartsCT, selectActiveRosterIds } from "@/lib/live-match-utils"

export const ACTIVE_PLAYERS_PER_TEAM = 5
export const ROUND_SECONDS = 115
export const BOMB_SECONDS = 40
export const ROUND_START_DELAY_MS = 1500

/**
 * Normalize a possibly-undefined seed value to a positive integer.
 * Falls back to a hash of the match ID so identical match IDs produce
 * deterministic seeds across reloads.
 */
export function getNormalizedSeed(rawSeed: unknown, matchId: string): number {
    if (typeof rawSeed === "number" && Number.isFinite(rawSeed) && rawSeed > 0) {
        return Math.floor(rawSeed)
    }
    const fallback = Array.from(matchId).reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 0)
    return Math.max(1, fallback)
}

/**
 * Resolve the first {@link ACTIVE_PLAYERS_PER_TEAM} roster IDs to actual
 * Player objects, preserving roster order. Accepts an optional pre-built
 * playerMap to avoid an O(n) `.find` per ID.
 */
export function getActivePlayersByRosterOrder(
    team: { rosterIds?: string[]; roster?: string[] },
    allPlayers: Array<{ id: string }>,
    playerMap?: Map<string, { id: string }>
): Player[] {
    const rosterIds = Array.isArray(team.rosterIds)
        ? team.rosterIds
        : Array.isArray(team.roster) ? team.roster : []
    const activeRosterIds = selectActiveRosterIds(rosterIds, ACTIVE_PLAYERS_PER_TEAM)
    const resolvedPlayers: Player[] = []
    for (const playerId of activeRosterIds) {
        const player = playerMap?.get(playerId) ?? allPlayers.find(p => p.id === playerId)
        if (player) resolvedPlayers.push(player as unknown as Player)
    }
    return resolvedPlayers
}

/** Build an empty map-result placeholder for a series map. */
export function createMapResultShell(
    mapId: MapId,
    homeStartsCT: boolean,
    homeTeamId: string,
    awayTeamId: string
): any {
    return {
        map: mapId,
        ctStartTeamId: homeStartsCT ? homeTeamId : awayTeamId,
        tStartTeamId: homeStartsCT ? awayTeamId : homeTeamId,
        rounds: [],
        finalScore: { team1: 0, team2: 0 },
        homeScore: 0,
        awayScore: 0,
        mvpPlayerId: "",
    }
}

/**
 * Merge any persisted maps with the canonical series order. Maps that are
 * missing or out-of-order get a fresh shell so the engine always sees the
 * full series shape.
 */
export function buildCanonicalResultMaps(
    existingMaps: any[] | undefined,
    canonicalMaps: MapId[],
    homeTeamId: string,
    awayTeamId: string,
    mapStartingSides: Record<string, string> | undefined,
    seed: number
): any[] {
    const sourceMaps = Array.isArray(existingMaps) ? existingMaps : []
    return canonicalMaps.map((mapId, mapIndex) => {
        const existing = sourceMaps[mapIndex]
        if (existing && existing.map === mapId) {
            return {
                ...existing,
                map: mapId,
                rounds: Array.isArray(existing.rounds) ? existing.rounds : [],
                homeScore: typeof existing.homeScore === "number" ? existing.homeScore : (existing.finalScore?.team1 ?? 0),
                awayScore: typeof existing.awayScore === "number" ? existing.awayScore : (existing.finalScore?.team2 ?? 0),
            }
        }

        const homeStartsCT = resolveHomeStartsCT({
            mapId,
            mapStartingSides,
            homeTeamId,
            awayTeamId,
            seed,
            mapIndex,
        })
        return createMapResultShell(mapId, homeStartsCT, homeTeamId, awayTeamId)
    })
}

/**
 * Build the live UI's roster state from the current economy snapshot.
 * Carries forward kill/death counters from `existingRoster` when present.
 */
export function sanitizeRosterFromEconomy(
    activePlayers: Player[],
    economy: Record<string, any>,
    isCT: boolean,
    existingRoster?: LivePlayerState[]
): LivePlayerState[] {
    const existingById = new Map((existingRoster || []).map(player => [player.id, player]))
    const defaultWeapon = isCT ? "usp" : "glock"

    return activePlayers.map(player => {
        const prev = existingById.get(player.id)
        const econ = economy[player.id] || {}
        return {
            id: player.id,
            name: player.nickname,
            kills: prev?.kills || 0,
            deaths: prev?.deaths || 0,
            assists: prev?.assists || 0,
            headshots: prev?.headshots || 0,
            money: typeof econ.cash === "number" ? econ.cash : (prev?.money ?? EconomyManager.ROUND_START_CASH),
            isDead: false,
            weapon: typeof econ.weapon === "string" ? econ.weapon : (prev?.weapon || defaultWeapon),
            hasArmor: Boolean(econ.hasArmor ?? prev?.hasArmor ?? false),
            hasHelmet: Boolean(econ.hasHelmet ?? prev?.hasHelmet ?? false),
            hasKit: Boolean(econ.hasKit ?? prev?.hasKit ?? false),
        }
    })
}

/**
 * Sanitize a persisted economy object for the currently-active 5 players,
 * filling in missing entries and clamping cash to legal bounds.
 */
export function sanitizeEconomyForActivePlayers(
    activePlayers: Player[],
    existingEconomy: Record<string, any> | undefined,
    isCT: boolean
): Record<string, any> {
    const defaultEconomy = createRoundStartEconomy(
        activePlayers.map(player => player.id),
        isCT
    )

    return activePlayers.reduce<Record<string, any>>((acc, player) => {
        const current = existingEconomy?.[player.id]
        const fallbackCash = defaultEconomy[player.id]?.cash ?? EconomyManager.ROUND_START_CASH
        acc[player.id] = {
            ...defaultEconomy[player.id],
            ...(current || {}),
            cash: typeof current?.cash === "number"
                ? Math.max(0, Math.min(EconomyManager.MAX_CASH, Math.floor(current.cash)))
                : fallbackCash,
        }
        return acc
    }, {})
}
