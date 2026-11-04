/**
 * Seasonal map pool (C6).
 *
 * A career's first season plays all seven maps of ROTATION_MAP_POOL. From
 * the second season on, one map is benched for the whole season and the
 * other six are the active pool for every veto, league and event. The
 * benched map is never the same two seasons running, so a benched map
 * always returns the next season and veto prep has to change each year.
 * The new pool is announced in the inbox when the season starts.
 *
 * Deterministic: the bench follows the save id and season number. Engine
 * safe: no store, no React.
 */
import { eventText } from "@/lib/news-ref"
import { LIST_REF, type TextRef } from "@/lib/i18n"
import type { MapId } from "@/types"
import type { GameSave } from "../save-types"
import { ROTATION_MAP_POOL, getMapName, setActiveMapPool } from "@/data/map-pool"
import { deriveSeed } from "../rng"
import { getSeasonNumber } from "../career-stats"

export interface MapRotation {
    season: number
    active: MapId[]
    benched: MapId[]
    /** Last season's benched map(s), back in the pool this season. */
    returning: MapId[]
}

export const MAP_ROTATION_TUNING = {
    /** Maps benched each season (from the second season on). */
    BENCHED_PER_SEASON: 1,
    /** First season with a benched map. */
    FIRST_ROTATING_SEASON: 2,
} as const

/** The rotation for `season`, given last season's (deterministic per save). */
export function rotationForSeason(saveId: string, season: number, previous?: Pick<MapRotation, "benched">): MapRotation {
    const all = [...ROTATION_MAP_POOL]
    if (season < MAP_ROTATION_TUNING.FIRST_ROTATING_SEASON) return { season, active: all, benched: [], returning: [] }
    const last = previous?.benched ?? []
    const candidates = all.filter(m => !last.includes(m))
    const benched: MapId[] = []
    for (let i = 0; i < MAP_ROTATION_TUNING.BENCHED_PER_SEASON && candidates.length > 0; i++) {
        const pick = deriveSeed(saveId, "map-rotation", season, i) % candidates.length
        benched.push(candidates.splice(pick, 1)[0])
    }
    return { season, active: all.filter(m => !benched.includes(m)), benched, returning: last.filter(m => !benched.includes(m)) }
}

/** Make the save's season pool the active pool (full pool when it has none yet). */
export function applyMapRotation(save: Pick<GameSave, "mapRotation"> | null | undefined): void {
    setActiveMapPool(save?.mapRotation?.active)
}

/**
 * At the first tick of a new season: set the season's pool on the save,
 * apply it, and announce it to the manager. Idempotent per season.
 */
export function rotateSeasonMapPool(save: GameSave): MapRotation | null {
    const season = getSeasonNumber(save.currentWeek)
    if (save.mapRotation?.season === season) { applyMapRotation(save); return null }
    if (season < MAP_ROTATION_TUNING.FIRST_ROTATING_SEASON) return null
    const rotation = rotationForSeason(save.saveId, season, save.mapRotation)
    save.mapRotation = rotation
    applyMapRotation(save)
    const id = `map_pool_${season}`
    if (!save.eventsLog.some(e => e.id === id)) {
        const names = (ms: MapId[]): TextRef => ({ key: LIST_REF, params: Object.fromEntries(ms.map((m, i) => [i, getMapName(m)])) })
        save.eventsLog.unshift({
            id,
            type: "TOURNAMENT_UPDATE",
            week: save.currentWeek,
            acknowledged: false,
            data: {
                ...eventText({ key: "ev.maps.t", params: { season, maps: names(rotation.benched) } }, {
                    key: "ev.maps.m",
                    params: {
                        season, active: names(rotation.active),
                        benched: { key: "ev.maps.benched", count: rotation.benched.length, params: { maps: names(rotation.benched) } },
                        returning: rotation.returning.length ? { key: "ev.maps.returning", count: rotation.returning.length, params: { maps: names(rotation.returning) } } : "",
                    },
                }),
            },
        })
    }
    return rotation
}
