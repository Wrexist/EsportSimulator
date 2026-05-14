/**
 * Data Module Index
 * Phase 6: Snapshot data system exports
 */

// ===== SNAPSHOT TYPES =====
export {
    type Snapshot,
    type SnapshotPlayer,
    type SnapshotTeam,
    type SnapshotTournament,
    type SnapshotSource,
    validateSnapshot,
} from "./snapshot-types"

// ===== SNAPSHOT LOADER =====
export {
    SnapshotLoader,
    snapshotLoader,
} from "./snapshot-loader"

// ===== TOURNAMENT CALENDAR =====
export {
    FULL_TOURNAMENT_CALENDAR,
    getTournamentById,
    getTournamentsByTier,
    getTournamentsByWeek,
    getUpcomingTournaments,
    getTierColor,
    getTierBgColor,
} from "./tournament-calendar"

// ===== MAPS =====
export { ACTIVE_MAP_POOL, MAP_NAMES, getMapName } from "./map-pool"
