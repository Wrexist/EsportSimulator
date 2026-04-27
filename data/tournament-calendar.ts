"use client"

// ============================================================================
// TOURNAMENT CALENDAR - Full Competitive Circuit
// ============================================================================

import type { EntryPolicy } from "@/types/circuit"

export type TournamentTier = "S_TIER" | "A_TIER" | "B_TIER" | "C_TIER" | "QUALIFIER"
export type TournamentRegion = "INTERNATIONAL" | "EU" | "NA" | "SA" | "ASIA" | "CIS" | "OCEANIA" | "MENA"
export type TournamentFormat = "bracket" | "league" | "swiss" | "double_elim" | "gsl"
export type EntryType = "OPEN" | "INVITE" | "QUALIFIER" | "POINTS" | "LEAGUE"

export interface TournamentDefinition {
    id: string
    seriesId?: string
    name: string
    shortName: string
    tier: TournamentTier
    region: TournamentRegion
    format: TournamentFormat
    prizePool: number
    slots: number
    startWeek: number
    duration: number
    entryType: EntryType
    entryPolicy?: EntryPolicy
    description: string
    // Qualification requirements
    qualifierFor?: string        // Tournament ID this qualifies for
    requiredRanking?: number     // Must be top X in world rankings
    requiredPoints?: number      // Must have X circuit points
    requiredLeagueTier?: "S_TIER" | "A_TIER" | "B_TIER"
    // Slot distribution
    inviteSlots?: number         // Direct invite slots
    qualifierSlots?: number      // Slots from qualifiers
    regionalSlots?: Record<TournamentRegion, number>  // Slots per region
    // Visual theming
    color: string                // Primary brand color
    icon: string                 // Icon name for display
    logoPath?: string            // Path to tournament logo
    trophyPath?: string          // Path to tournament trophy
}

// Discovery window: tournaments are hidden until X weeks before start
export const TOURNAMENT_DISCOVERY_WINDOW = 8

// Circuit points for placements
export const CIRCUIT_POINTS = {
    S_TIER: { 1: 2000, 2: 1500, 3: 1000, 4: 1000, 5: 600, 6: 600, 7: 400, 8: 400, 9: 200, 10: 200, 11: 200, 12: 200, 13: 100, 14: 100, 15: 100, 16: 100 },
    A_TIER: { 1: 500, 2: 300, 3: 200, 4: 200, 5: 100, 6: 100, 7: 50, 8: 50, 9: 25, 10: 25, 11: 25, 12: 25 },
    B_TIER: { 1: 150, 2: 100, 3: 75, 4: 75, 5: 50, 6: 50 },
    C_TIER: { 1: 50, 2: 30, 3: 20, 4: 20 },
    QUALIFIER: { 1: 0, 2: 0, 3: 0, 4: 0 }  // Qualifiers give slots, not points
} as const

import tournamentData from "./tournaments.json"

export const FULL_TOURNAMENT_CALENDAR = tournamentData as TournamentDefinition[]

// Sort first so derived lists are also sorted
FULL_TOURNAMENT_CALENDAR.sort((a, b) => a.startWeek - b.startWeek)

/** O(1) lookup map for tournament definitions by ID (static, built once at module load) */
export const TOURNAMENT_CALENDAR_INDEX = new Map<string, TournamentDefinition>(
    FULL_TOURNAMENT_CALENDAR.map(t => [t.id, t])
)

// ============================================================================
// DERIVED LISTS (For Backward Compatibility)
// ============================================================================
export const S_TIER_TOURNAMENTS = FULL_TOURNAMENT_CALENDAR.filter(t => t.tier === "S_TIER")
export const A_TIER_TOURNAMENTS = FULL_TOURNAMENT_CALENDAR.filter(t => t.tier === "A_TIER")
export const B_TIER_TOURNAMENTS = FULL_TOURNAMENT_CALENDAR.filter(t => t.tier === "B_TIER")
export const C_TIER_TOURNAMENTS = FULL_TOURNAMENT_CALENDAR.filter(t => t.tier === "C_TIER")
export const QUALIFIER_TOURNAMENTS = FULL_TOURNAMENT_CALENDAR.filter(t => t.tier === "QUALIFIER")

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getTournamentsByTier(tier: TournamentTier): TournamentDefinition[] {
    return FULL_TOURNAMENT_CALENDAR.filter(t => t.tier === tier)
}

export function getTournamentsByWeek(week: number): TournamentDefinition[] {
    const weekOfSeason = ((week - 1) % 52) + 1
    return FULL_TOURNAMENT_CALENDAR.filter(t => {
        const endWeek = t.startWeek + t.duration
        if (endWeek <= 52) {
            return weekOfSeason >= t.startWeek && weekOfSeason < endWeek
        }
        // Wraps around season boundary
        return weekOfSeason >= t.startWeek || weekOfSeason < (endWeek - 52)
    })
}

export function getUpcomingTournaments(currentWeek: number, count = 10): TournamentDefinition[] {
    return FULL_TOURNAMENT_CALENDAR
        .map(t => {
            // Calculate absolute next start week
            let absStart = t.startWeek
            while (absStart <= currentWeek) {
                absStart += 52
            }
            return { ...t, absStart }
        })
        .filter(t => t.absStart <= currentWeek + TOURNAMENT_DISCOVERY_WINDOW)
        .sort((a, b) => a.absStart - b.absStart)
        .slice(0, count)
}

export function getDiscoveredTournaments(currentWeek: number): TournamentDefinition[] {
    return FULL_TOURNAMENT_CALENDAR.filter(t => {
        const weekOfSeason = ((currentWeek - 1) % 52) + 1
        return t.startWeek <= weekOfSeason + TOURNAMENT_DISCOVERY_WINDOW
    })
}

export function getTournamentById(id: string): TournamentDefinition | undefined {
    // Try exact match first (O(1) via index)
    const exact = TOURNAMENT_CALENDAR_INDEX.get(id)
    if (exact) return exact

    // Try stripping seasonal suffix (e.g., "major_copenhagen_s1" -> "major_copenhagen")
    const baseId = id.replace(/_s\d+$/, '')
    return TOURNAMENT_CALENDAR_INDEX.get(baseId)
}

export function getEntryPolicy(tournament: TournamentDefinition): EntryPolicy {
    if (tournament.entryPolicy) return tournament.entryPolicy

    switch (tournament.entryType) {
        case "OPEN":
            return { kind: "OPEN_QUALIFIER" }
        case "QUALIFIER":
            return { kind: "CLOSED_QUALIFIER" }
        case "INVITE":
            if (typeof tournament.requiredRanking === "number") {
                return { kind: "RANKING_INVITE", requiredRanking: tournament.requiredRanking }
            }
            return { kind: "DIRECT_INVITE" }
        case "POINTS":
            return { kind: "POINTS_INVITE", requiredPoints: tournament.requiredPoints }
        case "LEAGUE":
            return { kind: "LEAGUE_SLOT", requiredLeagueTier: tournament.requiredLeagueTier }
        default:
            return { kind: "DIRECT_INVITE" }
    }
}

export function getQualifiersFor(tournamentId: string): TournamentDefinition[] {
    return FULL_TOURNAMENT_CALENDAR.filter(t => t.qualifierFor === tournamentId)
}

export function getTierColor(tier: TournamentTier): string {
    switch (tier) {
        case "S_TIER": return "text-amber-400"
        case "A_TIER": return "text-blue-400"
        case "B_TIER": return "text-purple-400"
        case "C_TIER": return "text-emerald-400"
        case "QUALIFIER": return "text-slate-400"
        default: return "text-white"
    }
}

export function getTierBgColor(tier: TournamentTier): string {
    switch (tier) {
        case "S_TIER": return "bg-amber-500/20"
        case "A_TIER": return "bg-blue-500/20"
        case "B_TIER": return "bg-purple-500/20"
        case "C_TIER": return "bg-emerald-500/20"
        case "QUALIFIER": return "bg-slate-500/20"
        default: return "bg-white/10"
    }
}

export function formatPrizePool(amount: number): string {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
    return `$${amount}`
}

export function getEntryTypeLabel(entryType: EntryType): string {
    switch (entryType) {
        case "OPEN": return "Open Entry"
        case "INVITE": return "Invite Only"
        case "QUALIFIER": return "Via Qualifier"
        case "POINTS": return "Points Required"
        case "LEAGUE": return "League Qualification"
        default: return "Unknown"
    }
}

export function getEntryTypeColor(entryType: EntryType): { bg: string; text: string; border: string } {
    switch (entryType) {
        case "OPEN": return { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30" }
        case "INVITE": return { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30" }
        case "QUALIFIER": return { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30" }
        case "POINTS": return { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30" }
        case "LEAGUE": return { bg: "bg-indigo-500/20", text: "text-indigo-400", border: "border-indigo-500/30" }
        default: return { bg: "bg-white/10", text: "text-white", border: "border-white/20" }
    }
}
