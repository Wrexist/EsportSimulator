/**
 * Team Creator Engine
 * Handles creation of custom teams for "Build Your Own Team" mode
 */

import {
    CustomTeamData,
    TeamCreationResult,
    DIFFICULTY_SETTINGS,
    REGION_INFO
} from '@/types/team-creator'
import { TeamSaveData, PlayerSaveData } from '@/engine/save-types'
import { SeededRNG } from '@/engine/rng'

type LegacyPlayerFields = {
    teamId?: string
    transferValue?: number
}

// Generate a unique ID for custom teams using crypto.randomUUID for guaranteed uniqueness
function generateCustomTeamId(): string {
    return `custom_${crypto.randomUUID()}`
}

// Sanitize team name for use as slug
function sanitizeTeamSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 30)
}

/**
 * Create a new custom team based on user input
 */
export function createCustomTeam(data: CustomTeamData): TeamCreationResult {
    // Validate input
    if (!data.name || data.name.trim().length < 2) {
        return { teamId: '', teamName: '', startingBudget: 0, reputation: 0, success: false, error: 'Team name must be at least 2 characters' }
    }

    if (!data.shortName || data.shortName.length < 2 || data.shortName.length > 5) {
        return { teamId: '', teamName: '', startingBudget: 0, reputation: 0, success: false, error: 'Team tag must be 2-5 characters' }
    }

    const settings = DIFFICULTY_SETTINGS[data.difficulty]
    if (!settings) {
        return { teamId: '', teamName: '', startingBudget: 0, reputation: 0, success: false, error: 'Invalid difficulty' }
    }

    const teamId = generateCustomTeamId()

    return {
        teamId,
        teamName: data.name.trim(),
        startingBudget: settings.startingBudget,
        reputation: settings.startingReputation,
        success: true
    }
}

/**
 * Generate partial team data for a custom team
 * The game store fills in the remaining fields
 */
export function generateCustomTeamData(data: CustomTeamData, teamId: string): Partial<TeamSaveData> & { id: string; name: string } {
    const settings = DIFFICULTY_SETTINGS[data.difficulty]
    const slug = sanitizeTeamSlug(data.name)

    // Calculate initial fanbase based on region and difficulty
    const baseFanbase = 1000
    const fanbase = Math.round(baseFanbase * settings.fansMultiplier)

    return {
        id: teamId,
        name: data.name.trim(),
        shortName: data.shortName.toUpperCase(),
        tier: "AMATEUR",
        region: data.region,
        logoPath: `/assets/teams/${slug}/logo.webp`, // Will use placeholder
        reputation: settings.startingReputation,
        fanbase: fanbase,
        chemistry: 50,
        elo: 800, // Start at low ELO (bottom tier)
        rosterIds: [], // Empty roster - must sign free agents
        staffIds: [],
        trainingSlotsUsed: 0,
        maxTrainingSlots: 3,
        budget: settings.startingBudget,
        leagueTier: "C_TIER",
        facilitiesLevel: 1,
        customTeam: true, // Flag for custom team
        customTeamData: {
            difficulty: data.difficulty,
            logoIndex: data.logoIndex,
            primaryColor: data.primaryColor,
            secondaryColor: data.secondaryColor,
            logoData: data.logoData,
        },
        difficultySettings: {
            incomeMultiplier: settings.incomeMultiplier,
            fansMultiplier: settings.fansMultiplier,
            tournamentPrizeMultiplier: settings.tournamentPrizeMultiplier,
        }
    }
}

/**
 * Get recommended free agents for a new custom team
 * Returns affordable players based on difficulty budget
 */
export function getStarterFreeAgents(
    allPlayers: PlayerSaveData[],
    budget: number,
    count: number = 10
): PlayerSaveData[] {
    // Filter to only free agents (no teamId or 'free_agent' teamId)
    const freeAgents = allPlayers.filter(p => {
        const legacyTeamId = (p as PlayerSaveData & LegacyPlayerFields).teamId
        return !legacyTeamId || legacyTeamId === 'free_agent' || legacyTeamId === ''
    })

    // Sort by value (ascending) to get affordable options
    const affordable = freeAgents
        .filter(p => {
            const legacyTransferValue = (p as PlayerSaveData & LegacyPlayerFields).transferValue
            const marketValue = legacyTransferValue ?? p.transferListingPrice ?? 50000
            return marketValue <= budget * 0.4
        }) // Can afford up to 40% of budget per player
        .sort((a, b) => (b.skill || 0) - (a.skill || 0)) // Sort by skill descending

    return affordable.slice(0, count)
}

/**
 * Validate team name isn't already taken
 */
export function isTeamNameAvailable(name: string, existingTeams: { name: string }[]): boolean {
    const normalizedName = name.trim().toLowerCase()
    return !existingTeams.some(t => t.name.toLowerCase() === normalizedName)
}

/**
 * Generate a random team name suggestion
 */
export function generateRandomTeamName(rng: SeededRNG): { name: string; shortName: string } {
    const prefixes = [
        'Team', 'Project', 'Club', 'Esports', 'Gaming', 'Squad', 'Force', 'United',
        'Rising', 'Elite', 'Prime', 'Alpha', 'Omega', 'Nova', 'Apex', 'Zero'
    ]

    const suffixes = [
        'Phoenix', 'Dragons', 'Wolves', 'Lions', 'Eagles', 'Titans', 'Knights',
        'Legends', 'Storm', 'Blaze', 'Shadow', 'Strike', 'Thunder', 'Venom',
        'Frost', 'Inferno', 'Horizon', 'Vertex', 'Nexus', 'Pulse'
    ]

    const prefix = prefixes[rng.int(0, prefixes.length - 1)]
    const suffix = suffixes[rng.int(0, suffixes.length - 1)]

    const name = `${prefix} ${suffix}`
    const shortName = `${prefix[0]}${suffix.substring(0, 2)}`.toUpperCase()

    return { name, shortName }
}
