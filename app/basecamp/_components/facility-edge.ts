import { FACILITY_EDGE_PER_LEVEL } from "@/engine/match/round-sim/team-edge"

/** Facility edge stops at an average level of 5 (team-edge.ts facilityEdge). */
export const FACILITY_EDGE_MAX_LEVELS = 4

/**
 * Team-strength share from facilities, as the match engine computes it
 * (engine/match/round-sim/team-edge.ts facilityEdge): average level of the
 * built facilities (the legacy campus level when none is built), +1% per
 * level above 1, at most +4%. Returned as a percentage.
 */
export function facilityEdgePct(team: { facilities?: { level?: number }[]; facilitiesLevel?: number }): { pct: number; avgLevel: number } {
    const arr = team.facilities
    const levels = Array.isArray(arr) && arr.length > 0 ? arr.map(f => f.level || 1) : [team.facilitiesLevel || 1]
    const avgLevel = levels.reduce((s, l) => s + l, 0) / levels.length
    return { pct: Math.max(0, Math.min(FACILITY_EDGE_MAX_LEVELS, avgLevel - 1)) * FACILITY_EDGE_PER_LEVEL * 100, avgLevel }
}
