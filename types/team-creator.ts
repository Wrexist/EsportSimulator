/**
 * Team Creator Types
 * For Build Your Own Team mode
 */

export type GameDifficulty = 'story' | 'normal' | 'hard' | 'impossible'

export type TeamRegion = 'EU' | 'NA' | 'SA' | 'ASIA' | 'CIS' | 'OCEANIA'

export interface DifficultySettings {
    id: GameDifficulty
    label: string
    description: string
    startingBudget: number
    startingReputation: number
    fansMultiplier: number
    incomeMultiplier: number
    tournamentPrizeMultiplier: number
}

export interface CustomTeamData {
    name: string
    shortName: string // 2-5 character tag
    region: TeamRegion
    difficulty: GameDifficulty
    logoIndex: number // Index of preset logo (0-19)
    primaryColor: string // Hex color
    secondaryColor: string // Hex color
    logoData?: string // Base64 data URL for custom uploaded logo
}

export interface TeamCreationResult {
    teamId: string
    teamName: string
    startingBudget: number
    reputation: number
    success: boolean
    error?: string
}

// Difficulty level configurations
export const DIFFICULTY_SETTINGS: Record<GameDifficulty, DifficultySettings> = {
    story: {
        id: 'story',
        label: 'Story Mode',
        description: 'Relaxed experience focused on narrative. Generous budget and forgiving progression.',
        startingBudget: 500000,
        startingReputation: 50,
        fansMultiplier: 1.5,
        incomeMultiplier: 1.5,
        tournamentPrizeMultiplier: 1.25,
    },
    normal: {
        id: 'normal',
        label: 'Normal',
        description: 'Balanced challenge. Build your way up with fair resources.',
        startingBudget: 250000,
        startingReputation: 25,
        fansMultiplier: 1.0,
        incomeMultiplier: 1.0,
        tournamentPrizeMultiplier: 1.0,
    },
    hard: {
        id: 'hard',
        label: 'Hard',
        description: 'Limited resources force tough decisions. Every dollar counts.',
        startingBudget: 150000,
        startingReputation: 10,
        fansMultiplier: 0.75,
        incomeMultiplier: 0.8,
        tournamentPrizeMultiplier: 1.0,
    },
    impossible: {
        id: 'impossible',
        label: 'Impossible',
        description: 'True underdog story. Minimal budget, zero reputation. Only for masochists.',
        startingBudget: 75000,
        startingReputation: 0,
        fansMultiplier: 0.5,
        incomeMultiplier: 0.6,
        tournamentPrizeMultiplier: 1.0,
    },
}

// Region display names and flags
export const REGION_INFO: Record<TeamRegion, { label: string; flag: string; description: string }> = {
    EU: { label: 'Europe', flag: 'eu', description: 'Strong legacy, most competitive region' },
    NA: { label: 'North America', flag: 'us', description: 'Passionate fanbase, growing scene' },
    SA: { label: 'South America', flag: 'br', description: 'Rising talent, high intensity' },
    ASIA: { label: 'Asia', flag: 'cn', description: 'Emerging powerhouse, huge potential' },
    CIS: { label: 'CIS', flag: 'ru', description: 'Raw talent, legendary AWPers' },
    OCEANIA: { label: 'Oceania', flag: 'au', description: 'Underrated gems, fighting spirit' },
}

// Preset logo colors for custom teams
export const PRESET_COLORS = [
    { primary: '#3B82F6', secondary: '#1E40AF' }, // Blue
    { primary: '#EF4444', secondary: '#991B1B' }, // Red
    { primary: '#10B981', secondary: '#047857' }, // Green
    { primary: '#F59E0B', secondary: '#B45309' }, // Amber
    { primary: '#8B5CF6', secondary: '#5B21B6' }, // Purple
    { primary: '#EC4899', secondary: '#9D174D' }, // Pink
    { primary: '#06B6D4', secondary: '#0E7490' }, // Cyan
    { primary: '#F97316', secondary: '#C2410C' }, // Orange
    { primary: '#84CC16', secondary: '#4D7C0F' }, // Lime
    { primary: '#14B8A6', secondary: '#0F766E' }, // Teal
    { primary: '#A855F7', secondary: '#7E22CE' }, // Violet
    { primary: '#FFFFFF', secondary: '#6B7280' }, // White/Gray
]
