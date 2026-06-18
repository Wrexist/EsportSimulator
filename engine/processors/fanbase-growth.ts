/**
 * Weekly fanbase growth processor.
 *
 * Mutates `team.followers` for every team based on:
 *   - Organic growth from reputation (0–250 fans/week)
 *   - Fan-Zone facility multiplier (+15% per level)
 *   - Recent match results — wins boost followers (more for high-rep teams),
 *     losses cause slight stagnation
 *   - World-ranking clout — Top 30 teams gain bonus organic spread
 *   - Active MARKETING campaigns — `data.followersPerWeek` added directly
 *
 * Extracted from atomic-week-processor.ts so the growth math is unit-testable
 * in isolation and the processor stays focused on orchestration.
 */

import type { GameSave } from "../save-types"
import type { SeededRNG } from "../rng"
import { getRivalryBetween, derbyMultiplier } from "../history-tracker"

export function processFanbaseGrowth(save: GameSave, _rng: SeededRNG): void {
    // _rng accepted for signature parity with the processor — current
    // growth formula is deterministic, but variance can be added without
    // changing call sites.
    void _rng

    save.teams.forEach(team => {
        // Organic growth scales with reputation (0 rep → 0 fans, 100 rep → 105 fans/week).
        const dailyOrganic = (team.reputation / 100) * 15
        let weeklyGrowth = dailyOrganic * 7

        // Fan-Zone facility multiplier (+15% per level on top of organic).
        const fanZoneFacility = team.facilities?.find(f => f.type === "FANZONE")
        const fanZoneBonus = 1 + (fanZoneFacility?.level || 0) * 0.15
        weeklyGrowth *= fanZoneBonus

        // Performance influence from this week's matches.
        const weekMatches = save.completedMatches.filter(m =>
            (m.homeTeamId === team.id || m.awayTeamId === team.id) &&
            m.week === save.currentWeek
        )

        weekMatches.forEach(m => {
            const isHome = m.homeTeamId === team.id
            const opponentId = isHome ? m.awayTeamId : m.homeTeamId
            const won = isHome
                ? m.result.homeScore > m.result.awayScore
                : m.result.awayScore > m.result.homeScore

            // Derby stakes: a heated/fierce rivalry magnifies the fanbase reaction
            // to the result. Still bounded by the 2M ceiling below, so non-farmable.
            const derbyStakes = derbyMultiplier(getRivalryBetween(team, opponentId)?.intensity)

            if (won) {
                // Elite teams gain more from wins (higher fanbase ceilings).
                const gain = (500 + (team.reputation * 5)) * derbyStakes
                weeklyGrowth += gain
            } else {
                // Losses cause slight stagnation rather than catastrophic decline.
                weeklyGrowth -= 100 * derbyStakes
            }
        })

        // Top-30 ranking clout: bigger bonus for higher placement.
        if (team.worldRanking && team.worldRanking <= 30) {
            const rankingBonus = (31 - team.worldRanking) * 50
            weeklyGrowth += rankingBonus
        }

        // Marketing campaigns: each active campaign contributes its
        // `followersPerWeek` value while inside its `duration` window.
        const activeMarketing = save.scheduledActivities?.filter(a =>
            a.type === "MARKETING" &&
            save.currentWeek >= a.week &&
            save.currentWeek < a.week + a.duration &&
            typeof (a.data as { followersPerWeek?: number } | undefined)?.followersPerWeek === "number"
        ) ?? []
        for (const campaign of activeMarketing) {
            const gain = (campaign.data as { followersPerWeek?: number })?.followersPerWeek ?? 0
            if (typeof gain === "number" && gain > 0) {
                weeklyGrowth += gain
            }
        }

        // Ceiling matches the top of the in-game fan-milestone ladder (2M);
        // unbounded growth made merch income explode over long campaigns.
        team.followers = Math.min(2_000_000, Math.max(0, Math.floor((team.followers || 0) + weeklyGrowth)))
    })
}
