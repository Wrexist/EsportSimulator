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
        const names = (ms: MapId[]) => ms.map(getMapName).join(" and ")
        save.eventsLog.unshift({
            id,
            type: "TOURNAMENT_UPDATE",
            week: save.currentWeek,
            acknowledged: false,
            data: {
                title: `Season ${season} map pool: ${names(rotation.benched)} benched`,
                message: [
                    `The competitive map pool for season ${season} is ${names(rotation.active)}.`,
                    `${names(rotation.benched)} ${rotation.benched.length === 1 ? "is" : "are"} out of the pool for the whole season: no league or event match will be played on ${rotation.benched.length === 1 ? "it" : "them"}.`,
                    rotation.returning.length ? `${names(rotation.returning)} ${rotation.returning.length === 1 ? "is" : "are"} back after a season out.` : "",
                    "Vetoes ban down from six maps, so check your map records and playbook before the first match.",
                ].filter(Boolean).join(" "),
            },
        })
    }
    return rotation
}
