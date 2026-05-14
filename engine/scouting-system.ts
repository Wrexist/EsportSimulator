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
    hltvHistory?: { year: number; rank: number }[]
    matchesPlayed?: number
    majorWins?: number

    // Scouting status
    scoutingLevel: "NONE" | "BASIC" | "ADVANCED" | "EXPERT" | "ELITE"
    isScouted: boolean
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
            // Wide range ±20
            baseStats.skillRange = [Math.max(0, skill - 20), Math.min(99, skill + 20)]
            baseStats.ovrRange = [Math.max(0, skill - 20), Math.min(99, skill + 20)]
            break

        case "BASIC":
            // Narrower range ±12
            baseStats.skillRange = [Math.max(0, skill - 12), Math.min(99, skill + 12)]
            baseStats.ovrRange = [Math.max(0, skill - 12), Math.min(99, skill + 12)]
            // Reveal top 3 stat categories (rough)
            baseStats.exactStats = {
                rifle: player.rifle,
                awp: player.awp,
                clutch: player.clutch,
            }
            break

        case "ADVANCED":
            // Tight range ±6
            baseStats.skillRange = [Math.max(0, skill - 6), Math.min(99, skill + 6)]
            baseStats.ovrRange = [Math.max(0, skill - 6), Math.min(99, skill + 6)]
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
            // Very tight ±3
            baseStats.skillRange = [Math.max(0, skill - 3), Math.min(99, skill + 3)]
            baseStats.ovrRange = [Math.max(0, skill - 3), Math.min(99, skill + 3)]
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
            baseStats.hltvHistory = player.hltvHistory
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
