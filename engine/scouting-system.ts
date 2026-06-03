/**
 * Scouting System
 * Phase 9: Information Asymmetry
 * 
 * Core rules:
 * - Players without scouting show fuzzy stats (ranges)
 * - Requires Scout Agent staff member
 * - One player at a time per agent
 * - 4 weeks base, upgradeable
 */

import { PlayerSaveData, ScoutedPlayerEntry, ScoutingMissionData } from "./save-types"
import { SCOUT_LEVEL_CONFIG } from "../lib/constants"

// ===== SCOUT AGENT LEVELS =====

export interface ScoutAgentLevel {
    name: string
    duration: number // weeks
    costPerMission: number
    upgradeCost: number
    accuracy: number // 0-1, affects stat reveal quality
}

export const SCOUT_LEVELS: Record<string, ScoutAgentLevel> = {
    BASIC:    { name: "Basic Scout",    ...SCOUT_LEVEL_CONFIG.BASIC },
    ADVANCED: { name: "Advanced Scout", ...SCOUT_LEVEL_CONFIG.ADVANCED },
    EXPERT:   { name: "Expert Scout",   ...SCOUT_LEVEL_CONFIG.EXPERT },
    ELITE:    { name: "Elite Scout",    ...SCOUT_LEVEL_CONFIG.ELITE },
}

// ===== STAT VISIBILITY =====

export interface VisibleStats {
    // Always visible
    nickname: string
    age: number
    nationality: string
    role: string
    portraitPath: string

    // Fuzzy until scouted (min-max range)
    skillRange: [number, number] | number // [min, max] or exact
    ovrRange: [number, number] | number

    // Only visible after scouting
    exactStats?: Partial<PlayerSaveData>
    proHistory?: { year: number; rank: number }[]
    matchesPlayed?: number
    majorWins?: number

    // Scouting status
    scoutingLevel: "NONE" | "BASIC" | "ADVANCED" | "EXPERT" | "ELITE"
    isScouted: boolean
}

/**
 * Build a fuzzy stat band whose CENTRE is offset from the true value by a
 * stable, per-player pseudo-random amount. Without the offset the band
 * midpoint always equalled the true skill exactly, letting the player read
 * the precise value off any scouting level (making the accuracy tiers
 * meaningless). The offset is bounded so the true value still falls inside
 * the band, and it is deterministic per player so the band does not flicker
 * between renders.
 */
export function fuzzyBand(trueValue: number, halfWidth: number, playerId: string): [number, number] {
    let h = 0
    for (let i = 0; i < playerId.length; i++) h = (h * 31 + playerId.charCodeAt(i)) | 0
    const frac = ((Math.abs(h) % 2001) / 1000) - 1 // -1 .. 1
    const offset = Math.round(frac * halfWidth * 0.5) // within ±halfWidth/2 → true value stays inside
    const center = trueValue + offset
    return [
        Math.max(0, Math.min(99, center - halfWidth)),
        Math.max(0, Math.min(99, center + halfWidth)),
    ]
}

/**
 * Get visible stats for a player based on scouting level
 */
export function getVisibleStats(
    player: PlayerSaveData,
    scoutedPlayers: ScoutedPlayerEntry[],
    ownTeamPlayerIds: string[]
): VisibleStats {
    // Own team players are always fully visible
    const isOwnTeam = ownTeamPlayerIds.includes(player.id)
    const scoutEntry = scoutedPlayers.find(s => s.playerId === player.id)

    const scoutingLevel = isOwnTeam ? "ELITE" : (scoutEntry?.scoutLevel || "NONE")
    const isScouted = isOwnTeam || !!scoutEntry

    // Base visible stats (always shown)
    const baseStats: VisibleStats = {
        nickname: player.nickname,
        age: player.age,
        nationality: player.nationality,
        role: player.role,
        portraitPath: player.portraitPath,
        skillRange: [0, 99],
        ovrRange: [0, 99],
        scoutingLevel,
        isScouted,
    }

    // Calculate fuzzy ranges based on level
    const skill = player.skill || 50

    switch (scoutingLevel) {
        case "NONE":
            // Wide range ±20, centre offset so the midpoint isn't the answer
            baseStats.skillRange = fuzzyBand(skill, 20, player.id)
            baseStats.ovrRange = baseStats.skillRange
            break

        case "BASIC":
            // Narrower range ±12, centre offset
            baseStats.skillRange = fuzzyBand(skill, 12, player.id)
            baseStats.ovrRange = baseStats.skillRange
            // Reveal top 3 stat categories (rough)
            baseStats.exactStats = {
                rifle: player.rifle,
                awp: player.awp,
                clutch: player.clutch,
            }
            break

        case "ADVANCED":
            // Tight range ±6, centre offset
            baseStats.skillRange = fuzzyBand(skill, 6, player.id)
            baseStats.ovrRange = baseStats.skillRange
            // Reveal most stats
            baseStats.exactStats = {
                rifle: player.rifle,
                awp: player.awp,
                pistol: player.pistol,
                grenades: player.grenades,
                clutch: player.clutch,
                reaction: player.reaction,
            }
            break

        case "EXPERT":
            // Very tight ±3, centre offset
            baseStats.skillRange = fuzzyBand(skill, 3, player.id)
            baseStats.ovrRange = baseStats.skillRange
            // Reveal all combat stats
            baseStats.exactStats = {
                skill: player.skill,
                rifle: player.rifle,
                awp: player.awp,
                pistol: player.pistol,
                grenades: player.grenades,
                creativity: player.creativity,
                clutch: player.clutch,
                tactic: player.tactic,
                reaction: player.reaction,
            }
            baseStats.matchesPlayed = player.matchesPlayed
            break

        case "ELITE":
            // Exact values
            baseStats.skillRange = skill
            baseStats.ovrRange = skill
            // Everything revealed
            baseStats.exactStats = { ...player }
            baseStats.proHistory = player.proHistory
            baseStats.matchesPlayed = player.matchesPlayed
            baseStats.majorWins = player.majorWins
            break
    }

    return baseStats
}

/**
 * Start a scouting mission
 */
export function startScoutingMission(
    playerId: string,
    scoutId: string,
    scoutLevel: keyof typeof SCOUT_LEVELS,
    currentWeek: number
): ScoutingMissionData {
    const level = SCOUT_LEVELS[scoutLevel]

    return {
        playerId,
        scoutId,
        startWeek: currentWeek,
        completionWeek: currentWeek + level.duration,
    }
}

/**
 * Check if scouting mission is complete
 */
export function isScoutingComplete(
    mission: ScoutingMissionData | undefined,
    currentWeek: number
): boolean {
    if (!mission) return false
    return currentWeek >= mission.completionWeek
}

/**
 * Complete a scouting mission and return the entry
 */
export function completeScoutingMission(
    mission: ScoutingMissionData,
    scoutLevel: keyof typeof SCOUT_LEVELS,
    currentWeek: number
): ScoutedPlayerEntry {
    return {
        playerId: mission.playerId,
        scoutedWeek: currentWeek,
        scoutLevel: scoutLevel as ScoutedPlayerEntry["scoutLevel"],
    }
}
