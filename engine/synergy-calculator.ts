
import { PlayerSaveData, TeamSaveData } from "./save-types"

export class SynergyCalculator {
    /**
     * Calculate synergy score (0-100) between two players
     */
    static calculatePairSynergy(p1: PlayerSaveData, p2: PlayerSaveData): number {
        let score = 50 // Base synergy

        // 1. Nationality Bonus (+15)
        if (p1.nationality && p2.nationality && p1.nationality === p2.nationality) {
            score += 15
        }

        // 2. High Teamwork Bonus (+5)
        // If both players have high teamwork (>80), they work well with anyone
        if ((p1.teamwork || 50) > 80 && (p2.teamwork || 50) > 80) {
            score += 5
        }

        // 3. Clashing Personalities (-10)
        // If both are low amicability (<40), they might clash
        if ((p1.amicability || 50) < 40 && (p2.amicability || 50) < 40) {
            score -= 10
        }

        // 4. Veteran Mentorship (+5)
        // If one is old (>28) and one is young (<21)
        const isP1Vet = (p1.age || 20) > 28
        const isP2Vet = (p2.age || 20) > 28
        const isP1Young = (p1.age || 20) < 21
        const isP2Young = (p2.age || 20) < 21

        if ((isP1Vet && isP2Young) || (isP2Vet && isP1Young)) {
            score += 5
        }

        // 5. Region Bonus (+10)
        // Players from the same geographic region communicate better
        const regionMap: Record<string, string> = {
            // Full country names (as stored in PlayerSaveData.nationality)
            "sweden": "nordic", "denmark": "nordic", "norway": "nordic", "finland": "nordic",
            "germany": "dach", "austria": "dach", "switzerland": "dach",
            "france": "francophone", "belgium": "francophone",
            "brazil": "latam", "argentina": "latam", "mexico": "latam", "chile": "latam", "uruguay": "latam",
            "russia": "cis", "ukraine": "cis", "kazakhstan": "cis", "belarus": "cis", "latvia": "cis", "lithuania": "cis", "estonia": "cis",
            "united states": "na", "canada": "na", "usa": "na",
            "china": "eastasia", "south korea": "eastasia", "korea": "eastasia", "japan": "eastasia",
            "australia": "oceania", "new zealand": "oceania",
            "poland": "eeu", "czech republic": "eeu", "czechia": "eeu", "slovakia": "eeu", "hungary": "eeu", "romania": "eeu", "bulgaria": "eeu", "serbia": "eeu",
            "turkey": "turkic", "azerbaijan": "turkic",
            "mongolia": "mongolia",
            "israel": "middleeast",
            "portugal": "iberian", "spain": "iberian",
            "united kingdom": "anglophone", "uk": "anglophone",
            // ISO codes as fallback
            "se": "nordic", "dk": "nordic", "no": "nordic", "fi": "nordic",
            "de": "dach", "at": "dach", "ch": "dach",
            "fr": "francophone", "be": "francophone",
            "br": "latam", "ar": "latam", "mx": "latam", "cl": "latam",
            "ru": "cis", "ua": "cis", "kz": "cis", "by": "cis",
            "us": "na", "ca": "na",
            "cn": "eastasia", "kr": "eastasia", "jp": "eastasia",
            "au": "oceania", "nz": "oceania",
            "pl": "eeu", "cz": "eeu", "sk": "eeu",
            "tr": "turkic", "az": "turkic",
        }
        const r1 = regionMap[(p1.nationality || "").toLowerCase()]
        const r2 = regionMap[(p2.nationality || "").toLowerCase()]
        if (r1 && r2 && r1 === r2 && p1.nationality !== p2.nationality) {
            score += 10
        }

        // 6. Complementary Roles (+8)
        // Certain role pairings have natural synergy
        const role1 = (p1.role || "").toLowerCase()
        const role2 = (p2.role || "").toLowerCase()
        const complementaryPairs = [
            ["awp", "support"], ["igl", "entry"], ["igl", "support"],
            ["lurk", "entry"], ["star", "support"]
        ]
        for (const [a, b] of complementaryPairs) {
            if ((role1.includes(a) && role2.includes(b)) ||
                (role1.includes(b) && role2.includes(a))) {
                score += 8
                break
            }
        }

        // 7. Similar Experience (+5)
        // Players with similar career length work better together
        const mp1 = p1.matchesPlayed || 0
        const mp2 = p2.matchesPlayed || 0
        if (Math.abs(mp1 - mp2) <= 50) {
            score += 5
        }

        // 8. Toxic Personality Penalty (-15)
        // If either player has very low amicability, they drag everyone down
        if ((p1.amicability || 50) < 20 || (p2.amicability || 50) < 20) {
            score -= 15
        }

        return Math.max(0, Math.min(100, score))
    }

    /**
     * Calculate and return the full synergy matrix for a team
     */
    static calculateTeamMatrix(roster: PlayerSaveData[]): Record<string, number> {
        const matrix: Record<string, number> = {}

        for (let i = 0; i < roster.length; i++) {
            for (let j = i + 1; j < roster.length; j++) {
                const p1 = roster[i]
                const p2 = roster[j]
                const key = [p1.id, p2.id].sort().join("_")

                matrix[key] = this.calculatePairSynergy(p1, p2)
            }
        }

        return matrix
    }
}
