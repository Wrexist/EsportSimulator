export const REGIONS = {
    EU: [
        "Sweden", "Denmark", "France", "Germany", "Poland", "Russia", "Ukraine",
        "Spain", "Portugal", "United Kingdom", "Norway", "Finland", "Bulgaria",
        "Serbia", "Bosnia and Herzegovina", "Croatia", "Slovakia", "Czech Republic",
        "Estonia", "Latvia", "Lithuania", "Belgium", "Netherlands", "Italy",
        "Hungary", "Romania", "Turkey", "Kazakhstan", "Belarus", "Kosovo", "Montenegro", "Macedonia", "Albania", "Switzerland", "Austria"
    ],
    NA: ["United States", "Canada", "Mexico"],
    SA: ["Brazil", "Argentina", "Chile", "Colombia"],
    ASIA: ["China", "Mongolia", "Korea", "Japan", "Thailand", "Indonesia", "India"],
    OCE: ["Australia", "New Zealand"]
}

export const getRegionForCountry = (country: string): string => {
    if (!country) return "WORLD"
    // Heuristic: check lists. 
    // Optimization: In a real app we'd trigger a map, but array includes is fine for <100 countries
    if (REGIONS.EU.includes(country)) return "EU"
    if (REGIONS.NA.includes(country)) return "NA"
    if (REGIONS.SA.includes(country)) return "SA"
    if (REGIONS.ASIA.includes(country)) return "ASIA"
    if (REGIONS.OCE.includes(country)) return "OCE"

    // Fallback/CIS special handling? 
    // HLTV often treats CIS as separate or part of EU/Asia depending on era. 
    // For this sim, we might group CIS into EU for "region flag" purposes or keep separate?
    // User requested "europe flag if its mostly europe", so grouping CIS into EU might be desired or "CIS" flag?
    // Let's stick to standard regions for now.
    return "WORLD"
}

export const getTeamFlag = (rosterIds: string[], players: any[]): string => {
    if (!rosterIds || rosterIds.length === 0) return "un" // Unknown

    const regionCounts: Record<string, number> = { EU: 0, NA: 0, SA: 0, ASIA: 0, OCE: 0, WORLD: 0 }

    rosterIds.forEach(pid => {
        const player = players.find(p => p.id === pid)
        if (player && player.nationality) {
            const region = getRegionForCountry(player.nationality)
            regionCounts[region] = (regionCounts[region] || 0) + 1
        }
    })

    // Find majority
    const total = rosterIds.length
    const threshold = Math.ceil(total / 2) // Majority needed (>50% usually, or just max?)
    // Usually 3/5 defines the region.

    for (const [region, count] of Object.entries(regionCounts)) {
        if (count >= 3) {
            // Map region to flag code
            switch (region) {
                case "EU": return "eu"
                case "NA": return "us" // Often NA uses US flag or a custom NA one. Flagcdn doesn't have "na". 
                // Maybe just separate US/CA? But if mixed US/CA, what flag? 
                // Usually in CS, NA teams just use the org flag, but if we need a regional flag...
                // User said "nah flag". Maybe "north america"? 
                // I will use "us" as a proxy or "un" if mixed? 
                // Actually, let's return a specific code and handle it in CountryFlag.
                // FlagCDN supports UN (United Nations).
                case "SA": return "br" // Proxy
                case "ASIA": return "cn" // Proxy
                case "OCE": return "au" // Proxy
                default: return "un"
            }
        }
    }

    return "un" // International / World
}

/**
 * Get the region text for a team based on player nationalities
 * Returns: EU, NA, SA, ASIA, OCE, or INT (international)
 */
export const getTeamRegion = (rosterIds: string[], players: any[]): string => {
    if (!rosterIds || rosterIds.length === 0) return "INT"

    const regionCounts: Record<string, number> = { EU: 0, NA: 0, SA: 0, ASIA: 0, OCE: 0, WORLD: 0 }

    rosterIds.forEach(pid => {
        const player = players.find(p => p.id === pid)
        if (player && player.nationality) {
            const region = getRegionForCountry(player.nationality)
            regionCounts[region] = (regionCounts[region] || 0) + 1
        }
    })

    // Find majority (3+ out of 5 players = majority)
    for (const [region, count] of Object.entries(regionCounts)) {
        if (count >= 3) {
            return region === "WORLD" ? "INT" : region
        }
    }

    return "INT" // International / Mixed
}
