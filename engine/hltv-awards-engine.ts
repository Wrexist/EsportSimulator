/**
 * HLTV Top 20 Awards Engine - Authentic Implementation
 * 
 * Based on the real HLTV Top 20 Players ranking system:
 * 
 * REVEAL SCHEDULE:
 * - Revealed daily during January (offseason)
 * - #20 revealed on Day 1, #1 revealed on Day 20
 * - Each day triggers a notification for that player
 * 
 * RANKING CRITERIA (weighted):
 * - HLTV Rating 2.0 at Big Events (40%)
 * - Impact Rating (15%)
 * - Big Event Playoffs Performance (20%)
 * - MVP/EVP Awards (15%)
 * - Major Performance Multiplier (10%)
 * 
 * SPECIAL AWARDS:
 * - MVP of the Year (most MVPs)
 * - Rookie of the Year (best player under 21)
 * - IGL of the Year (highest rated IGL)
 * - AWPer of the Year (highest rated AWPer)
 */

import { GameSave, PlayerSaveData } from "./save-types"
import { evaluatePlayer } from "./player-evaluation"
import { EventType } from "@/types"

// ===== REAL DATA AGGREGATION =====

interface AggregatedStats {
    kills: number; deaths: number; assists: number
    adrTotal: number; kastTotal: number; ratingTotal: number
    matchCount: number; mvpCount: number; mapsPlayed: number
}

/**
 * Aggregate real player stats from completed matches for a given year.
 * Returns a Map of playerId -> aggregated stats.
 */
function aggregatePlayerStatsForYear(save: GameSave, year: number): Map<string, AggregatedStats> {
    const stats = new Map<string, AggregatedStats>()
    if (!save.completedMatches) return stats

    for (const match of save.completedMatches) {
        if (Math.ceil((match.week ?? 0) / 52) !== year) continue
        if (!match.result?.playerStats) continue

        for (const [playerId, ps] of Object.entries(match.result.playerStats)) {
            const existing = stats.get(playerId) || {
                kills: 0, deaths: 0, assists: 0,
                adrTotal: 0, kastTotal: 0, ratingTotal: 0,
                matchCount: 0, mvpCount: 0, mapsPlayed: 0
            }
            existing.kills += ps.kills ?? 0
            existing.deaths += ps.deaths ?? 0
            existing.assists += ps.assists ?? 0
            existing.adrTotal += ps.adr ?? 0
            existing.kastTotal += ps.kast ?? 0
            existing.ratingTotal += ps.rating ?? 0
            existing.matchCount++
            existing.mapsPlayed += ps.mapsPlayed ?? 1
            if (match.result.mvpPlayerId === playerId) existing.mvpCount++
            stats.set(playerId, existing)
        }
    }
    return stats
}

// ===== TYPES =====

export interface Top20Player {
    rank: number
    playerId: string
    playerName: string
    nickname: string
    nationality: string
    portraitPath: string
    teamId: string
    teamName: string
    teamLogo: string
    overallRating: number

    // HLTV-style stats
    hltvRating: number      // HLTV 2.0 Rating (0.80-1.50+)
    impactRating: number    // Impact contribution (0.80-1.50+)
    kast: number            // Kill/Assist/Survived/Traded % (50-85%)
    adr: number             // Average Damage per Round (60-100+)
    kpr: number             // Kills Per Round (0.5-1.0+)

    // Achievements
    mvpCount: number        // Big Event MVP medals
    evpCount: number        // Big Event EVP (Exceptional Valuable Player)
    majorMvps: number       // Major MVPs (extra prestige)
    majorWins: number       // Major championships won
    bigEventWins: number    // All Big Event wins
    mapsPlayed: number      // Total maps at Big Events

    // Meta
    age: number
    role: string
    isPlayerTeam: boolean

    // Day revealed (1-20, where 1 = #20 player, 20 = #1 player)
    revealDay: number
}

export interface AnnualAwards {
    year: number
    generatedWeek: number
    revealStartWeek: number  // Week when reveals start
    currentRevealDay: number // How many have been revealed (0-20)
    isFullyRevealed: boolean

    top20: Top20Player[]

    // Special awards
    mvpOfTheYear: Top20Player | null       // Most MVPs
    rookieOfTheYear: Top20Player | null    // Best under 21
    iglOfTheYear: Top20Player | null       // Best IGL
    awperOfTheYear: Top20Player | null     // Best AWPer
}

// ===== CONSTANTS =====

// Big Event tiers for weighting
const BIG_EVENT_TIERS = ["S_TIER", "A_TIER"]

// Role detection keywords
const IGL_ROLES = ["IGL", "LEADER", "CAPTAIN"]
const AWPER_ROLES = ["AWPER", "AWP", "OP"]

// ===== STAT CALCULATIONS =====

/**
 * Calculate HLTV 2.0 Rating based on player stats
 * Real formula: Weighted combination of kills, deaths, assists, traded, flash assists, etc.
 * Simplified: Based on OVR + key mechanical stats
 */
function calculateHLTVRating(player: PlayerSaveData, rngSeed: number): number {
    const evaluation = evaluatePlayer(player as any)
    const ovr = evaluation.overallRating

    // Base rating from OVR (maps 50-100 to 0.80-1.40)
    let rating = 0.80 + (ovr - 50) * 0.012

    // Mechanical stat bonuses
    const rifle = (player as any).rifle || 50
    const pistol = (player as any).pistol || 50
    const clutch = (player as any).clutch || 50
    const reaction = (player as any).reaction || 50

    // Add mechanical influence
    rating += ((rifle - 70) * 0.003)
    rating += ((pistol - 70) * 0.001)
    rating += ((clutch - 70) * 0.002)
    rating += ((reaction - 70) * 0.002)

    // Seeded variance for consistency
    const variance = (Math.sin(rngSeed * player.id.charCodeAt(0)) * 0.05)
    rating += variance

    // Clamp to realistic HLTV range
    return Math.max(0.80, Math.min(1.55, parseFloat(rating.toFixed(2))))
}

/**
 * Calculate Impact Rating (contribution to round wins)
 */
function calculateImpactRating(player: PlayerSaveData, rngSeed: number): number {
    const evaluation = evaluatePlayer(player as any)
    const ovr = evaluation.overallRating

    // Base impact from OVR
    let impact = 0.85 + (ovr - 50) * 0.010

    // Entry/Clutch players have higher impact
    const clutch = (player as any).clutch || 50
    const creativity = (player as any).creativity || 50

    impact += ((clutch - 60) * 0.003)
    impact += ((creativity - 60) * 0.002)

    // Role-based bonuses (Entry fraggers and AWPers typically higher impact)
    const role = player.role?.toUpperCase() || ""
    if (role.includes("ENTRY") || role.includes("AWP")) {
        impact += 0.03
    }

    // Seeded variance
    const variance = (Math.cos(rngSeed * player.id.charCodeAt(1) * 1.5) * 0.04)
    impact += variance

    return Math.max(0.80, Math.min(1.50, parseFloat(impact.toFixed(2))))
}

/**
 * Calculate KAST % (Kill/Assist/Survive/Trade percentage)
 */
function calculateKAST(player: PlayerSaveData, rngSeed: number): number {
    const ovr = evaluatePlayer(player as any).overallRating
    const teamwork = (player as any).teamwork || 50

    // Base KAST scales with OVR (60-85% range)
    let kast = 60 + (ovr - 50) * 0.4
    kast += (teamwork - 50) * 0.15

    // Variance
    const variance = Math.sin(rngSeed * player.id.charCodeAt(2)) * 3
    kast += variance

    return Math.max(55, Math.min(85, parseFloat(kast.toFixed(1))))
}

/**
 * Calculate ADR (Average Damage per Round)
 */
function calculateADR(player: PlayerSaveData, rngSeed: number): number {
    const ovr = evaluatePlayer(player as any).overallRating
    const rifle = (player as any).rifle || 50

    // Base ADR (60-100+ range)
    let adr = 60 + (ovr - 50) * 0.6
    adr += (rifle - 50) * 0.2

    // Variance
    const variance = Math.cos(rngSeed * player.id.charCodeAt(3) * 2) * 5
    adr += variance

    return Math.max(60, Math.min(110, parseFloat(adr.toFixed(1))))
}

/**
 * Calculate KPR (Kills Per Round)
 */
function calculateKPR(player: PlayerSaveData, rngSeed: number): number {
    const ovr = evaluatePlayer(player as any).overallRating

    // Base KPR (0.55-1.0+ range)
    let kpr = 0.55 + (ovr - 50) * 0.008

    // Variance
    const variance = Math.sin(rngSeed * player.id.charCodeAt(4) * 0.7) * 0.05
    kpr += variance

    return Math.max(0.55, Math.min(1.05, parseFloat(kpr.toFixed(2))))
}

// ===== MAIN GENERATION =====

/**
 * Generate Top 20 players for the year
 * Uses comprehensive stats and achievements
 */
export function generateAnnualTop20(
    save: GameSave,
    playerTeamId: string
): AnnualAwards {
    const { players, teams, currentWeek } = save
    const year = Math.ceil(currentWeek / 52)
    const rngSeed = currentWeek * 1337 + year * 42

    // Aggregate real match data for the year
    const realStats = aggregatePlayerStatsForYear(save, year)

    // Get all active players
    const activePlayers = players.filter(p => !p.isRetired)

    // Calculate comprehensive stats for each player
    const playerScores = activePlayers.map(player => {
        const evaluation = evaluatePlayer(player as any)
        const team = teams.find(t => t.rosterIds?.includes(player.id))
        const real = realStats.get(player.id)

        // Use real data when player has 10+ matches, otherwise fabricate
        let hltvRating: number, impactRating: number, kast: number, adr: number, kpr: number, mvpCount: number, mapsPlayed: number
        if (real && real.matchCount >= 10) {
            hltvRating = real.ratingTotal / real.matchCount
            kast = real.kastTotal / real.matchCount
            adr = real.adrTotal / real.matchCount
            kpr = real.mapsPlayed > 0 ? real.kills / real.mapsPlayed : 0.5
            mvpCount = real.mvpCount
            mapsPlayed = real.mapsPlayed
            // Impact has no direct match analog — derive from KPR and clutch contribution
            impactRating = hltvRating * 0.7 + kpr * 0.3
        } else {
            hltvRating = calculateHLTVRating(player, rngSeed)
            kast = calculateKAST(player, rngSeed)
            adr = calculateADR(player, rngSeed)
            kpr = calculateKPR(player, rngSeed)
            impactRating = calculateImpactRating(player, rngSeed)
            mvpCount = 0
            mapsPlayed = 0
        }

        // Simulate achievements based on team performance and player skill
        const teamRank = team?.worldRanking || 50
        const isTopTeam = teamRank <= 10
        const isElitePlayer = evaluation.overallRating >= 85

        const seedMod = (rngSeed * player.id.charCodeAt(0)) % 100 / 100

        // MVP count: prefer real data, supplement with fabricated for achievements
        if (!real || real.matchCount < 10) {
            const mvpChance = isElitePlayer && isTopTeam ? 0.7 : isElitePlayer ? 0.4 : isTopTeam ? 0.25 : 0.1
            mvpCount = Math.floor(seedMod * (mvpChance * 6))
        }
        const evpCount = Math.floor((seedMod * 1.3) % 1 * 4)
        const majorMvps = (isElitePlayer && isTopTeam && seedMod > 0.7) ? 1 : 0
        const majorWins = (isTopTeam && seedMod > 0.6) ? Math.floor(seedMod * 2) : 0
        const bigEventWins = isTopTeam ? Math.floor(seedMod * 5) : Math.floor(seedMod * 2)
        if (!real || real.matchCount < 10) {
            mapsPlayed = 80 + Math.floor(seedMod * 120)
        }

        // HLTV Composite Score (weighted formula)
        const compositeScore = (
            (hltvRating * 40) +           // 40% HLTV Rating
            (impactRating * 15) +          // 15% Impact
            ((kast / 100) * 15) +          // 15% KAST (normalized)
            (mvpCount * 8) +               // MVP weight
            (evpCount * 3) +               // EVP weight
            (majorMvps * 15) +             // Major MVP bonus
            (majorWins * 12) +              // Major wins
            (bigEventWins * 5) +            // Big event wins
            (evaluation.overallRating * 0.3) + // Small OVR factor
            ((100 - teamRank) * 0.2)       // Team prestige
        )

        return {
            player,
            team,
            evaluation,
            hltvRating,
            impactRating,
            kast,
            adr,
            kpr,
            mvpCount,
            evpCount,
            majorMvps,
            majorWins,
            bigEventWins,
            mapsPlayed,
            compositeScore
        }
    })

    // Sort by composite score and take top 20
    const sortedPlayers = playerScores
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .slice(0, 20)

    // Build Top 20 array
    const top20: Top20Player[] = sortedPlayers.map((entry, index) => ({
        rank: index + 1,
        playerId: entry.player.id,
        playerName: entry.player.name,
        nickname: entry.player.nickname,
        nationality: entry.player.nationality,
        portraitPath: entry.player.portraitPath || "",
        teamId: entry.team?.id || "",
        teamName: entry.team?.name || "Free Agent",
        teamLogo: entry.team?.logoPath || "",
        overallRating: entry.evaluation.overallRating,

        // HLTV stats
        hltvRating: entry.hltvRating,
        impactRating: entry.impactRating,
        kast: entry.kast,
        adr: entry.adr,
        kpr: entry.kpr,

        // Achievements
        mvpCount: entry.mvpCount,
        evpCount: entry.evpCount,
        majorMvps: entry.majorMvps,
        majorWins: entry.majorWins,
        bigEventWins: entry.bigEventWins,
        mapsPlayed: entry.mapsPlayed,

        // Meta
        age: entry.player.age || 20,
        role: entry.player.role || "Rifler",
        isPlayerTeam: entry.team?.id === playerTeamId,

        // Reveal day (20 = #1, 1 = #20)
        revealDay: 20 - index
    }))

    // Determine special awards
    const mvpOfTheYear = [...top20].sort((a, b) =>
        (b.mvpCount + b.majorMvps * 2) - (a.mvpCount + a.majorMvps * 2)
    )[0] || null

    const rookieOfTheYear = top20.find(p => p.age <= 21) || null

    const iglOfTheYear = top20.find(p =>
        IGL_ROLES.some(r => p.role.toUpperCase().includes(r))
    ) || null

    const awperOfTheYear = top20.find(p =>
        AWPER_ROLES.some(r => p.role.toUpperCase().includes(r))
    ) || null

    return {
        year,
        generatedWeek: currentWeek,
        revealStartWeek: currentWeek,
        currentRevealDay: 0,
        isFullyRevealed: false,
        top20,
        mvpOfTheYear,
        rookieOfTheYear,
        iglOfTheYear,
        awperOfTheYear
    }
}

/**
 * Check if HLTV Awards should be triggered
 * Awards start revealing at Week 1 of each new year (Jan 1)
 */
export function shouldTriggerAwards(currentWeek: number): boolean {
    // Trigger on first week of year 2 onwards (week 53, 105, 157, etc.)
    return currentWeek >= 53 && currentWeek % 52 === 1
}

/**
 * Get which player rank should be revealed on a given day
 * Day 1 = #20, Day 20 = #1
 */
export function getRevealForDay(day: number): number {
    if (day < 1 || day > 20) return 0
    return 21 - day // Day 1 = rank 20, Day 20 = rank 1
}

/**
 * Add HLTV Awards event to event log with daily reveal support
 */
export function addHLTVAwardsEvent(save: GameSave, awards: AnnualAwards): void {
    // Check if we already generated awards for this year
    const existingAwards = save.eventsLog.find(e =>
        e.type === EventType.MEDIA &&
        (e.data as any)?.hltvAwards?.year === awards.year
    )

    if (existingAwards) return

    // Find if any player team members are in top 20
    const playerTeamMembers = awards.top20.filter(p => p.isPlayerTeam)

    const eventMessage = playerTeamMembers.length > 0
        ? `🏆 HLTV Top 20 of ${awards.year} is being revealed! Your team has ${playerTeamMembers.length} player(s) in the ranking. Check the awards ceremony to see where they placed!`
        : `🏆 HLTV Top 20 of ${awards.year} is being revealed! The world's best players are being announced one by one. Watch the ceremony to see who made the list.`

    save.eventsLog.push({
        id: `hltv_top20_year${awards.year}`,
        type: EventType.MEDIA,
        week: save.currentWeek,
        data: {
            title: `🏆 HLTV Top 20 of ${awards.year}`,
            message: eventMessage,
            hltvAwards: awards,
            hasPlayerTeamMember: playerTeamMembers.length > 0,
            playerTeamMembers: playerTeamMembers.map(p => ({
                rank: p.rank,
                nickname: p.nickname,
                revealDay: p.revealDay
            }))
        },
        acknowledged: false
    })
}

export default {
    generateAnnualTop20,
    shouldTriggerAwards,
    addHLTVAwardsEvent,
    getRevealForDay,
    calculateHLTVRating
}
