/**
 * Pure-function helpers used by `useLiveMatch`.
 *
 * Extracted so the hook can focus on React state management while these
 * functions stay easy to unit-test and reason about in isolation.
 */

import { MapId, MapResult, Player, LivePlayerState, CustomTactics, MatchEvent, ActiveMatchState, SimState } from "@/types"
import { EconomyManager } from "@/engine"
import { normalizeRestoredSim, playLegacyRound, type LegacyRoundStep, type LegacySeriesContext, type LegacySeriesState } from "@/engine/match/legacy-series"
import { roundEndPending, type LivePlaybackCheckpoint } from "@/engine/match/live-checkpoint"
import { sanitizeRestoredSimState } from "@/engine/match/live-match-init"
import { createRoundStartEconomy, resolveHomeStartsCT, selectActiveRosterIds } from "@/lib/live-match-utils"

export const ACTIVE_PLAYERS_PER_TEAM = 5
export { ROUND_SECONDS, BOMB_SECONDS } from "./live-clock"
export const ROUND_START_DELAY_MS = 1500
/** Live playback speeds offered by the control bar (game seconds per real second). */
export const LIVE_SPEED_PRESETS = [1, 2, 4, 8] as const

/**
 * Normalize a possibly-undefined seed value to a positive integer.
 * Falls back to a hash of the match ID so identical match IDs produce
 * deterministic seeds across reloads.
 */
export function getNormalizedSeed(rawSeed: unknown, matchId: string): number {
    if (typeof rawSeed === "number" && Number.isFinite(rawSeed) && rawSeed >= 0) {
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
    allPlayers: Array<{ id: string; isRetired?: boolean }>,
    playerMap?: Map<string, { id: string; isRetired?: boolean }>
): Player[] {
    const rosterIds = Array.isArray(team.rosterIds)
        ? team.rosterIds
        : Array.isArray(team.roster) ? team.roster : []
    const activeRosterIds = selectActiveRosterIds(rosterIds, ACTIVE_PLAYERS_PER_TEAM)
    const resolvedPlayers: Player[] = []
    for (const playerId of activeRosterIds) {
        const player = playerMap?.get(playerId) ?? allPlayers.find(p => p.id === playerId)
        if (player && !player.isRetired) resolvedPlayers.push(player as unknown as Player)
    }
    return resolvedPlayers
}

/** Build an empty map-result placeholder for a series map. */
export function createMapResultShell(
    mapId: MapId,
    homeStartsCT: boolean,
    homeTeamId: string,
    awayTeamId: string
): MapResult {
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
    existingMaps: MapResult[] | undefined,
    canonicalMaps: MapId[],
    homeTeamId: string,
    awayTeamId: string,
    mapStartingSides: Record<string, string> | undefined,
    seed: number
): MapResult[] {
    const sourceMaps = Array.isArray(existingMaps) ? existingMaps : []
    return canonicalMaps.map((mapId, mapIndex) => {
        const existing = sourceMaps[mapIndex]
        if (existing && existing.map === mapId) {
            // Save-store snapshots may be deeply frozen. The live runner owns and
            // mutates its map history, so detach every nested value on restore.
            const restored = structuredClone(existing)
            return {
                ...restored,
                map: mapId,
                rounds: Array.isArray(restored.rounds) ? restored.rounds : [],
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

export interface RestoredLiveSeries {
    sim: SimState
    maps: MapResult[]
    /** A round was computed and its playback had not reached ROUND_END. */
    inFlight: boolean
    currentMapIndex: number
}

/**
 * The series state a live checkpoint holds: the canonical sim (economy,
 * streaks, score, side) and the recorded rounds. Rounds already computed
 * are never re-simulated; the next round is played from exactly this state,
 * so a resumed (or skipped) match continues the one that was on screen.
 */
export function restoreLiveSeriesState(args: {
    ctx: LegacySeriesContext
    checkpoint: ActiveMatchState
    playback: LivePlaybackCheckpoint
    homePlayers: Player[]
    awayPlayers: Player[]
    mapStartingSides?: Record<string, string>
}): RestoredLiveSeries {
    const { ctx, checkpoint, playback, homePlayers, awayPlayers, mapStartingSides } = args
    const restoredSim = checkpoint.simState as SimState | undefined
    const requestedMapIndex = restoredSim?.currentMapIndex ?? checkpoint.gameState?.currentMapIndex ?? 0
    const currentMapIndex = Math.max(0, Math.min(ctx.maps.length - 1, requestedMapIndex))
    const currentMapId = ctx.maps[currentMapIndex] || MapId.SANDSTONE
    const homeTeamId = ctx.home.team.id, awayTeamId = ctx.away.team.id
    const homeStartsCT = typeof restoredSim?.homeStartsCT === "boolean"
        ? restoredSim.homeStartsCT
        : resolveHomeStartsCT({ mapId: currentMapId, mapStartingSides, homeTeamId, awayTeamId, seed: ctx.seed, mapIndex: currentMapIndex })
    const homeEconomy = sanitizeEconomyForActivePlayers(homePlayers, restoredSim?.homeEconomy, homeStartsCT)
    const awayEconomy = sanitizeEconomyForActivePlayers(awayPlayers, restoredSim?.awayEconomy, !homeStartsCT)
    const inFlight = roundEndPending(playback.events, playback.processedTime) && !checkpoint.isWaitingForStrategy
    // Pre-v2 checkpoints applied halftime/overtime/map transitions at
    // ROUND_END playback; normalise them exactly once.
    const sim: SimState = normalizeRestoredSim(ctx, {
        ...sanitizeRestoredSimState({ restoredSim, homeEconomy, awayEconomy, homeStartsCT, currentMapIndex }),
        ...(restoredSim?.rulesVersion ? { rulesVersion: restoredSim.rulesVersion } : {}),
        ...(restoredSim?.lastRound ? { lastRound: restoredSim.lastRound } : {}),
    }, inFlight)
    const source = checkpoint.matchResult as unknown as { maps?: MapResult[] } | undefined
    const maps = buildCanonicalResultMaps(source?.maps, ctx.maps as MapId[], homeTeamId, awayTeamId, mapStartingSides, ctx.seed)
    return { sim, maps, inFlight, currentMapIndex }
}

/**
 * "Skip match": play every remaining round at once with the live screen's
 * per-round step and no manager call (exactly what auto tactics does), so the
 * series ends with the same rounds as letting it play out on auto — and the
 * same result as instant simulation from this state (L14.A1).
 */
export function finishLegacySeriesFromState(
    ctx: LegacySeriesContext,
    start: LegacySeriesState,
    options: { regroupRounds: number; customTactics?: CustomTactics },
): { state: LegacySeriesState; lastStep?: LegacyRoundStep; roundsPlayed: number; regroupRounds: number } {
    let state = start
    let lastStep: LegacyRoundStep | undefined
    let regroupRounds = Math.max(0, options.regroupRounds)
    let roundsPlayed = 0
    while (!state.finished) {
        if (roundsPlayed >= 500) throw Error("Series did not finish")
        lastStep = playLegacyRound(ctx, state, { regroup: regroupRounds > 0, customTactics: options.customTactics })
        if (regroupRounds > 0) regroupRounds -= 1
        state = lastStep.state
        roundsPlayed += 1
    }
    return { state, lastStep, roundsPlayed, regroupRounds }
}

export type LivePlayerTally = Record<string, { kills: number; deaths: number; assists: number; headshots: number }>

/** Cumulative K/D/A/HS per player from recorded rounds, optionally skipping one round. */
export function tallyLivePlayerStats(maps: MapResult[], skip?: { mapIndex: number; roundNumber: number }): LivePlayerTally {
    const stats: LivePlayerTally = {}
    const bump = (pid: string) => (stats[pid] ??= { kills: 0, deaths: 0, assists: 0, headshots: 0 })
    maps.forEach((mapData, mapIndex) => {
        mapData.rounds.forEach(roundData => {
            if (skip && mapIndex === skip.mapIndex && roundData.roundNumber === skip.roundNumber) return
            roundData.kills.forEach(kill => { bump(kill.playerId).kills += kill.kills })
            roundData.deaths?.forEach(death => { bump(death.playerId).deaths += death.deaths })
            roundData.events?.forEach((event: MatchEvent) => {
                if (event.type !== "KILL") return
                if (event.assisterId) bump(event.assisterId).assists += 1
                if (event.isHeadshot && event.playerId) bump(event.playerId).headshots += 1
            })
        })
    })
    return stats
}
