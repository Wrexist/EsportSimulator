import { SynergyCalculator } from "./synergy-calculator"
import { PlayerSaveData } from "./save-types"
import { resolvePlayerRole } from "./role-determination"

/**
 * Region groupings for nationality-based filtering.
 * Extracted from SynergyCalculator for reuse.
 */
export const REGION_MAP: Record<string, string> = {
    "SE": "Nordic", "DK": "Nordic", "NO": "Nordic", "FI": "Nordic",
    "DE": "DACH", "AT": "DACH", "CH": "DACH",
    "FR": "Francophone", "BE": "Francophone",
    "BR": "LATAM", "AR": "LATAM", "MX": "LATAM", "CL": "LATAM",
    "RU": "CIS", "UA": "CIS", "KZ": "CIS", "BY": "CIS",
    "US": "NA", "CA": "NA",
    "CN": "East Asia", "KR": "East Asia", "JP": "East Asia",
    "AU": "Oceania", "NZ": "Oceania",
    "PL": "Eastern EU", "CZ": "Eastern EU", "SK": "Eastern EU",
    "TR": "Turkic", "AZ": "Turkic",
}

/** All distinct region names */
export const ALL_REGIONS = [...new Set(Object.values(REGION_MAP))]

/**
 * Common country name → 2-letter code mapping for synergy lookups.
 * Covers the most common nationalities in the esports scene.
 */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
    "sweden": "SE", "denmark": "DK", "norway": "NO", "finland": "FI",
    "germany": "DE", "austria": "AT", "switzerland": "CH",
    "france": "FR", "belgium": "BE",
    "brazil": "BR", "argentina": "AR", "mexico": "MX", "chile": "CL",
    "russia": "RU", "ukraine": "UA", "kazakhstan": "KZ", "belarus": "BY",
    "united states": "US", "usa": "US", "canada": "CA",
    "china": "CN", "south korea": "KR", "korea": "KR", "japan": "JP",
    "australia": "AU", "new zealand": "NZ",
    "poland": "PL", "czech republic": "CZ", "czechia": "CZ", "slovakia": "SK",
    "turkey": "TR", "türkiye": "TR", "azerbaijan": "AZ",
    "united kingdom": "GB", "uk": "GB", "england": "GB",
    "netherlands": "NL", "spain": "ES", "portugal": "PT", "italy": "IT",
    "romania": "RO", "hungary": "HU", "serbia": "RS", "croatia": "HR",
    "bosnia": "BA", "bosnia and herzegovina": "BA",
    "bulgaria": "BG", "greece": "GR", "israel": "IL",
    "mongolia": "MN", "indonesia": "ID", "philippines": "PH",
    "india": "IN", "pakistan": "PK", "iran": "IR",
    "south africa": "ZA", "morocco": "MA", "egypt": "EG",
    "saudi arabia": "SA", "united arab emirates": "AE", "uae": "AE",
    "jordan": "JO", "kuwait": "KW", "qatar": "QA",
    "taiwan": "TW", "hong kong": "HK", "singapore": "SG",
    "thailand": "TH", "vietnam": "VN", "malaysia": "MY",
    "peru": "PE", "colombia": "CO", "venezuela": "VE", "uruguay": "UY",
    "latvia": "LV", "lithuania": "LT", "estonia": "EE",
    "georgia": "GE", "armenia": "AM",
    "malta": "MT", "luxembourg": "LU", "iceland": "IS",
    "ireland": "IE", "scotland": "GB",
    "uzbekistan": "UZ", "kyrgyzstan": "KG",
}

/**
 * Convert a nationality string (could be full name or 2-letter code) to a 2-letter code.
 */
export function toCountryCode(nationality: string): string {
    if (!nationality) return ""
    const upper = nationality.toUpperCase().trim()
    // Already a 2-letter code?
    if (upper.length === 2) return upper
    // Try full name lookup
    return COUNTRY_NAME_TO_CODE[nationality.toLowerCase().trim()] || upper.slice(0, 2)
}

/**
 * Get the region for a given nationality string.
 */
export function getPlayerRegion(nationality: string): string | null {
    const code = toCountryCode(nationality)
    return REGION_MAP[code] || null
}

/**
 * Get all unique nationalities from a player array.
 */
export function getUniqueNationalities(players: { nationality: string }[]): string[] {
    const set = new Set<string>()
    for (const p of players) {
        if (p.nationality) set.add(p.nationality)
    }
    return [...set].sort()
}

/**
 * Get all unique regions from a player array.
 */
export function getUniqueRegions(players: { nationality: string }[]): string[] {
    const set = new Set<string>()
    for (const p of players) {
        const region = getPlayerRegion(p.nationality)
        if (region) set.add(region)
    }
    return [...set].sort()
}

/**
 * Calculate average synergy of a candidate player with a roster.
 * Returns 0-100 score.
 */
export function calculateRosterSynergy(
    candidate: PlayerSaveData,
    roster: PlayerSaveData[]
): number {
    if (roster.length === 0) return 0
    let total = 0
    for (const member of roster) {
        total += SynergyCalculator.calculatePairSynergy(candidate, member)
    }
    return Math.round(total / roster.length)
}

/**
 * Detect which roles are missing from a roster for full system bonuses.
 * System bonuses require: IGL, AWPer, Support, 2+ Riflers/Entry.
 */
export function detectMissingRoles(roster: PlayerSaveData[]): string[] {
    const missing: string[] = []
    const roles = roster.map(p => {
        const resolved = resolvePlayerRole(p)
        return resolved.split(",")[0].trim().toUpperCase()
    })

    if (!roles.some(r => r.includes("IGL"))) missing.push("IGL")
    if (!roles.some(r => r.includes("AWP"))) missing.push("AWPER")
    if (!roles.some(r => r.includes("SUPPORT"))) missing.push("SUPPORT")

    const riflerEntryCount = roles.filter(r =>
        r.includes("RIFLER") || r.includes("ENTRY") || r.includes("STAR")
    ).length
    if (riflerEntryCount < 2) missing.push("RIFLER")

    return missing
}

/**
 * Determine affordability status for a transfer.
 */
export function getAffordabilityStatus(
    transferValue: number,
    teamBudget: number
): "affordable" | "tight" | "over_budget" {
    if (teamBudget <= 0) return "over_budget"
    const ratio = transferValue / teamBudget
    if (ratio < 0.5) return "affordable"
    if (ratio <= 1.0) return "tight"
    return "over_budget"
}

/**
 * Get weeks remaining on a player's contract.
 * Returns null for free agents.
 */
export function getContractWeeksRemaining(
    playerId: string,
    contracts: { playerId: string; endWeek: number }[],
    currentWeek: number
): number | null {
    const contract = contracts.find(c => c.playerId === playerId)
    if (!contract) return null
    return Math.max(0, contract.endWeek - currentWeek)
}
