/**
 * Academy Engine
 * Phase 3: Core academy business logic
 * 
 * Features:
 * - Weekly development processing
 * - Development match simulation
 * - Promotion readiness evaluation
 * - Cost calculations
 */

import {
    AcademyPlayer,
    AcademyMatchResult,
    AcademyTrainingFocus,
    AcademyLevelInfo,
    TrainableStat
} from "../types/academy"
import { PlayerRole } from "../types/enums"
import {
    ACADEMY_LEVELS,
    DEVELOPMENT_CONFIG,
    DEV_MATCH_CONFIG,
    BALANCING_CONFIG,
    getAcademyLevelInfo,
    calculateWeeklyUpkeep
} from "./academy-constants"
import { SeededRNG, generateSeed } from "./rng"

// ===== PLAYER SAVE DATA TYPE (minimal interface) =====
// Using a minimal interface to avoid circular imports
interface PlayerData {
    id: string
    nickname: string
    age: number
    role: PlayerRole
    skill: number
    awp: number
    rifle: number
    pistol: number
    grenades: number
    creativity: number
    clutch: number
    tactic: number
    entry: number
    trading: number
    leader: number
    teamwork: number
    stressResistance: number
    reaction: number
    endurance: number
    health: number
    potential: number
    morale: number
    form: number
    fatigue: number
    [key: string]: unknown
}

// ===== TRAINING FOCUS STAT MAPPINGS =====

const TRAINING_FOCUS_STATS: Record<AcademyTrainingFocus, TrainableStat[]> = {
    MECHANICAL: ["skill", "awp", "rifle", "pistol", "reaction"],
    TACTICAL: ["tactic", "grenades", "creativity", "trading"],
    MENTAL: ["leader", "teamwork", "stressResistance", "clutch"],
    PHYSICAL: ["reaction", "endurance", "health"],
    BALANCED: ["skill", "rifle", "tactic", "teamwork", "reaction"]
}

// XP multipliers by focus (specialized = faster, balanced = slower but broader)
const TRAINING_FOCUS_XP_MULTIPLIER: Record<AcademyTrainingFocus, number> = {
    MECHANICAL: 1.2,
    TACTICAL: 1.15,
    MENTAL: 1.1,
    PHYSICAL: 1.0,
    BALANCED: 0.85
}

// ===== DEVELOPMENT MATCH OPPONENT GENERATION =====

interface SimulatedOpponent {
    name: string
    averageRating: number
    difficulty: "EASY" | "MEDIUM" | "HARD"
}

const fallbackRng = new SeededRNG(generateSeed())

function random(rng?: SeededRNG): number {
    return rng ? rng.next() : fallbackRng.next()
}

function randomInt(min: number, max: number, rng?: SeededRNG): number {
    return Math.floor(random(rng) * (max - min + 1)) + min
}

function makeDeterministicId(prefix: string, gameWeek: number, rng?: SeededRNG): string {
    const suffix = randomInt(0, 0x7fffffff, rng).toString(36)
    return `${prefix}_${gameWeek}_${suffix}`
}

function generateOpponent(academyLevel: number, rng?: SeededRNG): SimulatedOpponent {
    const names = DEV_MATCH_CONFIG.opponentNames
    const name = names[randomInt(0, names.length - 1, rng)]

    // Opponent difficulty scales with academy level
    const difficultyRoll = random(rng)
    let difficulty: "EASY" | "MEDIUM" | "HARD"
    let baseRating: number

    if (academyLevel >= 4) {
        // High level academy faces tougher opponents
        if (difficultyRoll < 0.3) {
            difficulty = "EASY"
            baseRating = 35 + random(rng) * 15
        } else if (difficultyRoll < 0.7) {
            difficulty = "MEDIUM"
            baseRating = 45 + random(rng) * 15
        } else {
            difficulty = "HARD"
            baseRating = 55 + random(rng) * 15
        }
    } else if (academyLevel >= 2) {
        if (difficultyRoll < 0.5) {
            difficulty = "EASY"
            baseRating = 30 + random(rng) * 15
        } else if (difficultyRoll < 0.85) {
            difficulty = "MEDIUM"
            baseRating = 40 + random(rng) * 15
        } else {
            difficulty = "HARD"
            baseRating = 50 + random(rng) * 10
        }
    } else {
        difficulty = "EASY"
        baseRating = 25 + random(rng) * 15
    }

    return { name, averageRating: Math.round(baseRating), difficulty }
}

// ===== ACADEMY ENGINE CLASS =====

export class AcademyEngine {

    /**
     * Process weekly development for a single prospect
     * Returns XP gained and stats improved
     */
    static processWeeklyDevelopment(
        prospect: AcademyPlayer,
        player: PlayerData,
        facilityLevel: number,
        rng?: SeededRNG
    ): { xpGained: number; statsImproved: Partial<Record<TrainableStat, number>> } {
        const levelInfo = getAcademyLevelInfo(facilityLevel)
        if (!levelInfo) {
            return { xpGained: 0, statsImproved: {} }
        }

        // Calculate base XP
        let xpGained: number = DEVELOPMENT_CONFIG.baseWeeklyXP

        // Apply facility development bonus
        xpGained = Math.round(xpGained * levelInfo.devBonus)

        // Apply training focus multiplier
        xpGained = Math.round(xpGained * TRAINING_FOCUS_XP_MULTIPLIER[prospect.trainingFocus])

        // Age factor: younger players develop faster
        const ageFactor = 1 + (18 - Math.min(player.age, 18)) * 0.05
        xpGained = Math.round(xpGained * ageFactor)

        // Morale/form factor
        const conditionFactor = (player.morale + player.form) / 200
        xpGained = Math.round(xpGained * (0.8 + conditionFactor * 0.4))

        // Calculate stat improvements
        const statsImproved: Partial<Record<TrainableStat, number>> = {}
        const focusStats = TRAINING_FOCUS_STATS[prospect.trainingFocus]

        // Improvement is based on XP, potential ceiling, and current stat level
        const statGainBase = DEVELOPMENT_CONFIG.statGainPer100XP * (xpGained / 100)

        focusStats.forEach(stat => {
            const currentValue = player[stat] as number
            if (typeof currentValue !== "number") return

            // Calculate improvement (harder to improve closer to potential)
            const potentialCap = player.potential
            const roomToGrow = Math.max(0, potentialCap - currentValue)
            const growthFactor = roomToGrow / 100

            const improvement = statGainBase * growthFactor * (0.8 + random(rng) * 0.4)

            if (improvement > 0.01) {
                statsImproved[stat] = Math.round(improvement * 100) / 100
            }
        })

        return { xpGained, statsImproved }
    }

    /**
     * Simulate a development match
     * Returns match result with XP distribution
     */
    static simulateDevelopmentMatch(
        prospects: AcademyPlayer[],
        players: PlayerData[],
        facilityLevel: number,
        gameWeek: number,
        rng?: SeededRNG
    ): AcademyMatchResult {
        const levelInfo = getAcademyLevelInfo(facilityLevel)
        const opponent = generateOpponent(facilityLevel, rng)

        // Calculate team average rating
        const prospectPlayers = prospects.map(p =>
            players.find(pl => pl.id === p.playerId)
        ).filter(Boolean) as PlayerData[]

        if (prospectPlayers.length === 0) {
            return {
                id: makeDeterministicId("dev_match", gameWeek, rng),
                week: gameWeek,
                opponentName: opponent.name,
                won: false,
                scoreHome: 0,
                scoreAway: 13,
                xpGained: {},
                participantIds: []
            }
        }

        const teamAvgRating = prospectPlayers.reduce((sum, p) => {
            // Simple rating calculation
            const rating = (p.skill + p.rifle + p.tactic + p.teamwork) / 4
            return sum + rating
        }, 0) / prospectPlayers.length

        // Win probability based on rating difference
        const ratingDiff = teamAvgRating - opponent.averageRating

        // Scaling win prob: 50% base + (diff * factor)
        const baseWinProb = 0.5 + (ratingDiff * BALANCING_CONFIG.winProbFactor)
        const winProb = Math.min(BALANCING_CONFIG.maxWinProb, Math.max(BALANCING_CONFIG.minWinProb, baseWinProb))

        const won = random(rng) < winProb

        // Simulate score (MR12)
        let scoreHome: number
        let scoreAway: number

        const roundsToWin = BALANCING_CONFIG.mr12WinRounds // 13

        if (won) {
            scoreHome = roundsToWin
            // Loser rounds scale inversely with win prob but with variance
            const gapFactor = Math.max(0, winProb - 0.5) * 2 // 0 to 0.8
            const maxLoserRounds = Math.max(0, Math.floor((roundsToWin - 1) * (1 - gapFactor)))
            scoreAway = randomInt(0, maxLoserRounds, rng)

            // Random chance for a close 13-10 or 13-11 game even if dominating
            if (random(rng) > 0.8 && scoreAway < 8) scoreAway = 8 + randomInt(0, 3, rng)
        } else {
            scoreAway = roundsToWin
            const gapFactor = Math.max(0, 0.5 - winProb) * 2
            const maxLoserRounds = Math.max(0, Math.floor((roundsToWin - 1) * (1 - gapFactor)))
            scoreHome = randomInt(0, maxLoserRounds, rng)

            if (random(rng) > 0.8 && scoreHome < 8) scoreHome = 8 + randomInt(0, 3, rng)
        }

        // Distribute XP
        const xpGained: Record<string, number> = {}
        let bestPerformerId: string | undefined
        let bestPerformance = 0

        prospectPlayers.forEach(player => {
            // Base match XP
            let playerXP: number = DEVELOPMENT_CONFIG.matchXPBonus

            // Win bonus
            if (won) playerXP = Math.round(playerXP * 1.3)

            // Apply facility bonus
            if (levelInfo) playerXP = Math.round(playerXP * levelInfo.devBonus)

            // Random performance variance
            const performanceRoll = 0.7 + random(rng) * 0.6
            playerXP = Math.round(playerXP * performanceRoll)

            xpGained[player.id] = playerXP

            // Track best performer for MVP
            if (performanceRoll > bestPerformance) {
                bestPerformance = performanceRoll
                bestPerformerId = player.id
            }
        })

        // MVP bonus
        if (bestPerformerId && xpGained[bestPerformerId]) {
            xpGained[bestPerformerId] += DEVELOPMENT_CONFIG.mvpXPBonus
        }

        return {
            id: makeDeterministicId("dev_match", gameWeek, rng),
            week: gameWeek,
            opponentName: opponent.name,
            won,
            scoreHome,
            scoreAway,
            mvpId: bestPerformerId,
            xpGained,
            participantIds: prospectPlayers.map(p => p.id)
        }
    }

    /**
     * Evaluate if a prospect is ready for promotion
     */
    static evaluatePromotion(
        prospect: AcademyPlayer,
        player: PlayerData
    ): { ready: boolean; rating: number; recommendation: string } {
        // Calculate overall prospect rating
        const technicalAvg = (player.skill + player.rifle + player.awp + player.pistol) / 4
        const tacticalAvg = (player.tactic + player.grenades + player.creativity) / 3
        const mentalAvg = (player.teamwork + player.leader + player.stressResistance) / 3

        const overallRating = (technicalAvg * 0.5) + (tacticalAvg * 0.25) + (mentalAvg * 0.25)

        // Check development progress
        const progressReady = prospect.developmentProgress >= DEVELOPMENT_CONFIG.promotionThreshold

        // Check minimum stat thresholds
        const meetsMinimums = player.skill >= 45 && player.rifle >= 40 && player.teamwork >= 35

        // Age consideration (older prospects pushed harder)
        const ageUrgent = player.age >= 18

        // Determine readiness
        const ready = progressReady && meetsMinimums

        // Generate recommendation
        let recommendation: string

        if (ready && overallRating >= 55) {
            recommendation = "Exceptional prospect. Ready for immediate first-team consideration."
        } else if (ready && overallRating >= 45) {
            recommendation = "Solid development. Ready for bench role or gradual integration."
        } else if (ready) {
            recommendation = "Meets basic requirements. May benefit from more academy time."
        } else if (progressReady && !meetsMinimums) {
            recommendation = "Trained enough but skills lacking. Consider specialist coaching."
        } else if (ageUrgent && prospect.developmentProgress >= 60) {
            recommendation = "Age deadline approaching. Decide soon: promote or release."
        } else {
            const progressNeeded = DEVELOPMENT_CONFIG.promotionThreshold - prospect.developmentProgress
            recommendation = `Needs ${Math.round(progressNeeded)}% more development progress.`
        }

        return {
            ready,
            rating: Math.round(overallRating),
            recommendation
        }
    }

    /**
     * Calculate development progress increase from XP gain
     */
    static calculateProgressGain(xpGained: number): number {
        return (xpGained / 100) * DEVELOPMENT_CONFIG.progressPer100XP
    }

    /**
     * Get total weekly upkeep cost for academy
     */
    static getWeeklyUpkeep(level: number, prospectCount: number): number {
        return calculateWeeklyUpkeep(level, prospectCount)
    }

    /**
     * Get next upgrade cost
     */
    static getUpgradeCost(currentLevel: number): number {
        if (currentLevel >= 5) return 0
        const nextLevel = currentLevel + 1
        return ACADEMY_LEVELS[nextLevel as keyof typeof ACADEMY_LEVELS].buildCost
    }

    /**
     * Get academy level info
     */
    static getLevelInfo(level: number): AcademyLevelInfo | null {
        return getAcademyLevelInfo(level)
    }

    /**
     * Check if prospect can be enrolled (capacity)
     */
    static canEnrollProspect(currentProspectCount: number, facilityLevel: number): boolean {
        const levelInfo = getAcademyLevelInfo(facilityLevel)
        if (!levelInfo) return false
        return currentProspectCount < levelInfo.maxProspects
    }

    /**
     * Apply weekly stat improvements to player
     * Returns the updated player data (caller should merge)
     */
    static applyStatImprovements(
        player: PlayerData,
        improvements: Partial<Record<TrainableStat, number>>
    ): Partial<PlayerData> {
        const updates: Partial<PlayerData> = {}

        for (const [stat, improvement] of Object.entries(improvements)) {
            const current = player[stat as TrainableStat]
            if (typeof current === "number" && improvement) {
                // Cap at potential
                const potentialCap = player.potential
                const newValue = Math.min(potentialCap, current + improvement)
                updates[stat as TrainableStat] = Math.round(newValue * 10) / 10
            }
        }

        return updates
    }

    /**
     * Generate scout notes for a prospect
     */
    static generateScoutNotes(player: PlayerData, potentialRevealed: boolean): string {
        const notes: string[] = []

        // Identify standout attributes
        const attributes = [
            { name: "rifle", value: player.rifle, label: "exceptional rifler" },
            { name: "awp", value: player.awp, label: "natural AWPer" },
            { name: "clutch", value: player.clutch, label: "clutch performer" },
            { name: "tactic", value: player.tactic, label: "tactically aware" },
            { name: "leader", value: player.leader, label: "leadership potential" },
            { name: "reaction", value: player.reaction, label: "lightning reflexes" }
        ]

        const standouts = attributes.filter(a => a.value >= 55).slice(0, 2)
        const weaknesses = attributes.filter(a => a.value < 35).slice(0, 1)

        if (standouts.length > 0) {
            notes.push(`Shows signs of ${standouts.map(s => s.label).join(" and ")}.`)
        }

        if (weaknesses.length > 0) {
            notes.push(`Needs work on ${weaknesses[0].name}.`)
        }

        // Age comment
        if (player.age <= 16) {
            notes.push("Very young - significant growth potential.")
        } else if (player.age >= 18) {
            notes.push("Approaching decision point for promotion.")
        }

        // Potential comment (if revealed)
        if (potentialRevealed) {
            if (player.potential >= 85) {
                notes.push("ELITE: Potential future star.")
            } else if (player.potential >= 70) {
                notes.push("HIGH: Could develop into solid pro.")
            } else if (player.potential >= 55) {
                notes.push("MEDIUM: Serviceable depth option.")
            } else {
                notes.push("LOW: Limited ceiling.")
            }
        } else {
            notes.push("Full potential assessment pending.")
        }

        return notes.join(" ")
    }
}

export default AcademyEngine
