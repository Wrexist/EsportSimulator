/**
 * Snapshot Data Types
 * Phase 6: Replaceable real-world dataset
 * 
 * RULES:
 * - Snapshot data is IMMUTABLE (never mutated)
 * - New career COPIES snapshot data to save
 * - Portraits loaded from local assets only
 */

import { PlayerRole, PlayerTier, TournamentTier, TournamentFormat } from "@/types"

// ===== SNAPSHOT PLAYER =====

/**
 * Player data from snapshot (excludes dynamic fields)
 * Dynamic fields (form, fatigue, morale) are initialized on career start
 */
export interface SnapshotPlayer {
    id: string
    name: string
    nickname: string
    age: number
    nationality: string
    portraitPath: string // Relative path to local asset

    role: PlayerRole
    tier: PlayerTier

    // Technical stats (0-100)
    skill: number
    awp: number
    rifle: number
    pistol: number
    grenades: number
    creativity: number
    clutch: number
    tactic: number

    // Mental stats (0-100) - base values
    leader: number
    teamwork: number
    amicability: number
    productivity: number
    stressResistance: number
    loyalty: number

    // Physical stats (0-100)
    reaction: number
    eyesight: number
    health: number
    strength: number
    endurance: number

    // Potential (determines growth cap)
    potential: number

    // Contract defaults
    defaultSalary: number
    defaultContractYears: number
}

// ===== SNAPSHOT TEAM =====

/**
 * Visual identity for a team. Drives the standings stripe, logo gradients,
 * and any future kit/jersey UI. Optional so legacy / lower-ranked teams
 * without explicit branding still validate.
 */
export interface TeamBranding {
    primaryColor: string   // hex, e.g. "#84CC16"
    secondaryColor: string // darker shade for gradient / outline
    accentColor: string    // third color for two-tone marks
    logoStyle: "monogram" | "mascot" | "emblem" | "wordmark"
}

/**
 * Team data from snapshot
 */
export interface SnapshotTeam {
    id: string
    name: string
    shortName: string
    tier: PlayerTier
    region: string
    logoPath: string // Relative path to local asset

    // Starting roster (player IDs)
    rosterIds: string[]

    // Base attributes
    reputation: number
    fanbase: number
    facilitiesLevel: number
    startingBudget: number

    branding?: TeamBranding
}

// ===== SNAPSHOT TOURNAMENT =====

/**
 * Tournament template from snapshot
 */
export interface SnapshotTournament {
    id: string
    name: string
    shortName: string
    tier: TournamentTier
    region: string
    format: TournamentFormat
    prizePool: number

    // Teams eligible (by tier or explicit IDs)
    minTeamTier?: PlayerTier
    invitedTeamIds?: string[]
    maxTeams?: number
    slots?: number

    // Schedule
    startWeek: number
    duration: number

    // Recurrence
    recurring?: boolean
    frequencyWeeks?: number // e.g., 52 for yearly

    // Runtime compatibility fields present in tournament calendar JSON
    entryType?: string
    qualifierFor?: string
    qualifierSlots?: number
    inviteSlots?: number
    requiredRanking?: number
    requiredPoints?: number
    requiredLeagueTier?: "S_TIER" | "A_TIER" | "B_TIER"
}

// ===== SNAPSHOT SOURCE =====

/**
 * Data source attribution per player
 */
export interface SnapshotSource {
    playerId: string
    source: string // e.g., "Pro.org", "Liquipedia"
    sourceUrl?: string
    license: string // e.g., "CC BY-SA 3.0"
    retrievedAt: string // ISO date
    modifications: string[] // List of modifications made
}

// ===== COMPLETE SNAPSHOT =====

/**
 * Complete snapshot dataset
 */
export interface Snapshot {
    version: string
    createdAt: string
    description: string

    players: SnapshotPlayer[]
    teams: SnapshotTeam[]
    tournaments: SnapshotTournament[]
    sources: SnapshotSource[]
}

// ===== VALIDATION =====

/**
 * Validate snapshot structure
 */
export function validateSnapshot(data: unknown): data is Snapshot {
    if (!data || typeof data !== "object") return false

    const s = data as Record<string, unknown>

    // Required fields
    if (typeof s.version !== "string") return false
    if (!Array.isArray(s.players)) return false
    if (!Array.isArray(s.teams)) return false
    if (!Array.isArray(s.tournaments)) return false
    if (!Array.isArray(s.sources)) return false

    // Validate players have required fields
    for (const player of s.players as unknown[]) {
        if (!validateSnapshotPlayer(player)) return false
    }

    // Validate teams have required fields
    for (const team of s.teams as unknown[]) {
        if (!validateSnapshotTeam(team)) return false
    }

    return true
}

function validateSnapshotPlayer(data: unknown): data is SnapshotPlayer {
    if (!data || typeof data !== "object") return false
    const p = data as Record<string, unknown>

    return (
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        typeof p.nickname === "string" &&
        typeof p.age === "number" &&
        typeof p.skill === "number"
    )
}

function validateSnapshotTeam(data: unknown): data is SnapshotTeam {
    if (!data || typeof data !== "object") return false
    const t = data as Record<string, unknown>

    return (
        typeof t.id === "string" &&
        typeof t.name === "string" &&
        Array.isArray(t.rosterIds)
    )
}
