import { GameSave, PlayerSaveData, HallOfFameEntry } from "./save-types"

/**
 * Hall of Fame Manager
 * Phase 23: Hall of Fame
 * 
 * Handles eligibility checks and induction for retiring players.
 */
export class HallOfFameManager {

    // Thresholds
    private static readonly MIN_CAREER_SEASONS = 6
    private static readonly MIN_MATCHES_PLAYED = 100
    private static readonly ELITE_PRO_RANK = 3 // Top 3 rank required for "Iconic" path
    private static readonly MIN_KILLS_LONGEVITY = 1000

    /**
     * Check if a player qualifies for the Hall of Fame upon retirement.
     * Returns the entry object if qualified, null otherwise.
     */
    static checkEligibility(player: PlayerSaveData, currentYear: number): HallOfFameEntry | null {
        // 1. Mandatory Eligibility
        const careerLength = currentYear - (player.proHistory?.[0]?.year || currentYear) // Estimate from history start?
        // Or assume age - 16? Better: Use matchesPlayed as proxy if history is short.

        // Let's use Matches Played + Age or direct tracking if available.
        // For now, rely on matchesPlayed.
        if ((player.matchesPlayed || 0) < this.MIN_MATCHES_PLAYED) return null

        const reasons: HallOfFameEntry['inductionReasons'] = []

        // 2. Paths to Greatness

        // A) Championship Path
        if ((player.majorWins || 0) >= 1) {
            reasons.push({ type: "CHAMPION", label: `${player.majorWins}x Major Champion`, icon: "Trophy" })
        }
        // Tier 1 wins check (Assume majors are subset? Need better stat tracking for generic tourneys later)

        // B) Individual Greatness Path
        if ((player.totalMVPs || 0) >= 2) {
            reasons.push({ type: "MVP", label: `${player.totalMVPs}x MVP Awards`, icon: "Star" })
        }
        // High Peak Rank
        const bestRank = Math.min(...(player.proHistory?.map(h => h.rank) || [999]))
        if (bestRank <= this.ELITE_PRO_RANK) {
            reasons.push({ type: "IMPACT", label: `Peaked at World #${bestRank}`, icon: "Crown" })
        }

        // C) Longevity Path
        if ((player.totalKills || 0) >= this.MIN_KILLS_LONGEVITY && (player.avgRating || 0) >= 1.10) {
            reasons.push({ type: "LONGEVITY", label: "1000+ Kills & Elite Consistency", icon: "Activity" })
        }

        // 3. Induction Threshold (Need at least 2 significant achievements)
        // Wait, User said "ANY TWO of the following".
        // Major Champion (already pushed)
        // Multiple MVPs (already pushed)
        // Elite Pro Rank (already pushed)
        // Longevity (already pushed)

        if (reasons.length >= 2) {
            // Construct Entry
            return {
                id: player.id,
                name: player.name,
                portraitPath: player.portraitPath,
                eraStart: (currentYear - Math.floor((player.matchesPlayed || 0) / 50)), // Rough estimate
                eraEnd: currentYear,
                primaryRole: player.role,
                category: "INDUCTED",
                inductionReasons: reasons,
                nationality: player.nationality
            }
        }

        return null
    }

    /**
     * Process a retiring player.
     * If eligible, adds to Hall of Fame.
     */
    static processRetirement(save: GameSave, player: PlayerSaveData) {
        if (!player.isRetired) return

        // Check if already in HoF (avoid duplicates)
        if (save.hallOfFame.some(h => h.id === player.id)) return

        const currentYear = new Date(save.gameStartDate).getFullYear() + Math.floor(save.currentWeek / 52)
        const entry = this.checkEligibility(player, currentYear)

        if (entry) {
            save.hallOfFame.push(entry)
            // Send Notification? "Player X has been inducted into the Hall of Fame!"
            save.eventsLog.push({
                id: `hof_induct_${player.id}_${save.currentWeek}`,
                type: "NEWS", // generic
                week: save.currentWeek,
                data: { text: `${player.name} has been inducted into the Hall of Fame!` },
                acknowledged: false,
                choices: [{ id: "ack", text: "Respect", effects: {} }]
            })
        }
    }
}
