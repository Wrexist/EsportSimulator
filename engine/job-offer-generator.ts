/**
 * Job Offer Generator
 * Phase 60: Job Market System
 * 
 * Generates job offers for the manager based on their performance,
 * reputation, and achievements.
 */

import { GameSave, TeamSaveData, GameEventSaveData, TournamentSaveData } from "./save-types"
import { EventType } from "@/types/enums"
import { SeededRNG, generateSeed } from "./rng"

// ===== CONSTANTS =====

const JOB_OFFER_BASE_CHANCE = 0.05 // 5% base chance per week
const MAJOR_WIN_BONUS = 0.30       // +30% chance after winning a major
const TOURNAMENT_WIN_BONUS = 0.15  // +15% chance after any tournament win
const GOOD_RECORD_BONUS = 0.10     // +10% chance if positive win ratio

const OFFER_REASONS = [
    "impressed by your recent tournament performance",
    "looking for a fresh tactical approach",
    "seeking experienced leadership",
    "building a new roster and need proven management",
    "heard great things about your player development",
    "admire your team's playstyle adaptation",
]

// ===== JOB OFFER GENERATOR =====

export class JobOfferGenerator {
    private static roll(rng: SeededRNG): number {
        return rng.next()
    }

    /**
     * Check and potentially generate job offers for the manager
     * Called once per week in the weekly processor
     */
    static processWeeklyJobOffers(save: GameSave, rng?: SeededRNG): void {
        const activeRng = rng ?? new SeededRNG(save.lastRngSeed || generateSeed())
        const currentTeam = save.teams.find(t => t.id === save.playerTeamId)
        if (!currentTeam) return

        // Calculate offer probability based on performance
        const offerChance = this.calculateOfferChance(save, currentTeam)

        // Roll for offer
        if (this.roll(activeRng) > offerChance) {
            if (!rng) save.lastRngSeed = activeRng.getState()
            return
        }

        // Find eligible teams that might make an offer
        const eligibleTeams = this.getEligibleOfferingTeams(save, currentTeam)
        if (eligibleTeams.length === 0) return

        // Pick a random team to make the offer
        const offeringTeam = eligibleTeams[Math.floor(this.roll(activeRng) * eligibleTeams.length)]

        // Generate the job offer event
        this.createJobOffer(save, offeringTeam, activeRng)
        if (!rng) save.lastRngSeed = activeRng.getState()
    }

    /**
     * Force a job offer generation for testing/debug
     */
    static forceJobOffer(save: GameSave, rng?: SeededRNG): void {
        const activeRng = rng ?? new SeededRNG(save.lastRngSeed || generateSeed())
        const currentTeam = save.teams.find(t => t.id === save.playerTeamId)
        if (!currentTeam) return

        const eligibleTeams = this.getEligibleOfferingTeams(save, currentTeam)
        // Fallback if no eligible teams (e.g. low reputation), just pick any other team
        const targetTeams = eligibleTeams.length > 0 ? eligibleTeams : save.teams.filter(t => t.id !== currentTeam.id)

        if (targetTeams.length === 0) return

        const offeringTeam = targetTeams[Math.floor(this.roll(activeRng) * targetTeams.length)]
        this.createJobOffer(save, offeringTeam, activeRng)
        if (!rng) save.lastRngSeed = activeRng.getState()
    }

    /**
     * Calculate probability of receiving a job offer this week
     */
    private static calculateOfferChance(save: GameSave, currentTeam: TeamSaveData): number {
        let chance = JOB_OFFER_BASE_CHANCE

        // Check recent tournament wins
        const recentTournaments = save.tournaments.filter((t: TournamentSaveData) =>
            t.isCompleted === true &&
            t.winnerId === save.playerTeamId &&
            save.currentWeek - (t.endWeek || 0) <= 8 // Within last 8 weeks
        )

        if (recentTournaments.length > 0) {
            // Check for major win
            const majorWin = recentTournaments.some(t => t.tier === "S_TIER")
            if (majorWin) {
                chance += MAJOR_WIN_BONUS
            } else {
                chance += TOURNAMENT_WIN_BONUS
            }
        }

        // Check win ratio from completed matches
        const teamMatches = save.completedMatches.filter(
            m => m.homeTeamId === currentTeam.id || m.awayTeamId === currentTeam.id
        )
        if (teamMatches.length >= 10) {
            const wins = teamMatches.filter(m => {
                const isHome = m.homeTeamId === currentTeam.id
                return isHome
                    ? m.result.homeScore > m.result.awayScore
                    : m.result.awayScore > m.result.homeScore
            }).length

            if (wins / teamMatches.length > 0.6) {
                chance += GOOD_RECORD_BONUS
            }
        }

        // Manager level affects chance (higher level = more opportunities)
        const managerLevel = Math.max(1, save.managerDetails?.level || 1)
        chance += (managerLevel - 1) * 0.02 // +2% per level above 1

        return Math.min(chance, 0.5) // Cap at 50%
    }

    /**
     * Find teams that could realistically offer the manager a job
     */
    private static getEligibleOfferingTeams(save: GameSave, currentTeam: TeamSaveData): TeamSaveData[] {
        const managerLevel = Math.max(1, save.managerDetails?.level || 1)

        // Get all teams sorted by Elo
        const rankedTeams = [...save.teams].sort((a, b) => (b.elo || 1000) - (a.elo || 1000))
        const currentRank = rankedTeams.findIndex(t => t.id === currentTeam.id) + 1

        return save.teams.filter(team => {
            // Can't offer from current team
            if (team.id === currentTeam.id) return false

            // Check if manager is qualified for this team tier (save-scoped progression)
            const requiredLevel = team.reputation >= 75 ? 10 : team.reputation >= 40 ? 5 : 1
            if (managerLevel < requiredLevel) {
                return false
            }

            // Teams only offer if they're in a similar or higher tier
            const teamRank = rankedTeams.findIndex(t => t.id === team.id) + 1

            // Higher ranked teams only offer if you've proven yourself
            if (teamRank < currentRank - 5) {
                // Only if you've won something significant
                const hasRecentWin = save.tournaments.some((t: TournamentSaveData) =>
                    t.isCompleted === true &&
                    t.winnerId === save.playerTeamId &&
                    save.currentWeek - (t.endWeek || 0) <= 16
                )
                if (!hasRecentWin) return false
            }

            // Lower ranked teams always interested in proven managers
            // Similar ranked teams might want you
            return true
        })
    }

    /**
     * Calculate salary based on team budget
     */
    private static calculateSalaryOffer(save: GameSave, offeringTeam: TeamSaveData): number {
        // Salary based on team budget and tier
        const salaryBase = Math.floor((offeringTeam.budget || 100000) * 0.01) // 1% of budget per week
        return Math.max(5000, Math.min(50000, salaryBase))
    }

    /**
     * Create a job offer event
     */
    private static createJobOffer(save: GameSave, offeringTeam: TeamSaveData, rng: SeededRNG): void {
        const salaryOffer = this.calculateSalaryOffer(save, offeringTeam)

        // Phase 19: World Ranking - Calculate rank if not present
        const rank = offeringTeam.worldRanking || save.teams.sort((a, b) => b.elo - a.elo).findIndex(t => t.id === offeringTeam.id) + 1

        const event: GameEventSaveData = {
            id: `job_offer_${save.currentWeek}_${offeringTeam.id}`,
            type: "JOB_OFFER",
            week: save.currentWeek,
            acknowledged: false,
            data: {
                type: EventType.JOB_OFFER, // This seems redundant with event.type but keeping for consistency if used elsewhere
                offeringTeamId: offeringTeam.id,
                offeringTeamName: offeringTeam.name,
                offeringTeamLogo: offeringTeam.logoPath,
                offeringTeamRegion: offeringTeam.region,
                offeringTeamRank: rank,
                salaryOffer: salaryOffer,
                originalOffer: salaryOffer,
                signingBonus: salaryOffer * 4,
                deadlineWeek: save.currentWeek + 1,
                // Negotiation state
                negotiationPatience: Math.floor(this.roll(rng) * 3) + 1, // 1-3 attempts
                negotiationAttempts: 0
            },
            choices: [
                {
                    id: "ACCEPT",
                    text: `Accept offer from ${offeringTeam.name}`,
                    effects: { reputation: 10 }
                },
                {
                    id: "DECLINE",
                    text: "Decline and stay with current team",
                    effects: { loyalty: 10 }
                }
            ]
        }

        save.eventsLog.unshift(event)
    }

    /**
     * Negotiate the job offer for a higher salary
     */
    static negotiateJobOffer(save: GameSave, eventId: string): { success: boolean; message: string; newOffer?: number; withdrew?: boolean } {
        const event = save.eventsLog.find(e => e.id === eventId)
        if (!event || event.type !== "JOB_OFFER") {
            return { success: false, message: "Offer not found" }
        }

        const data = event.data as any

        // Check if offer is still valid
        if (save.currentWeek > data.deadlineWeek) {
            return { success: false, message: "Offer has expired", withdrew: true }
        }

        if (data.negotiationPatience <= 0) {
            return { success: false, message: "The board is unwilling to negotiate further." }
        }

        // Calculate leverage
        const managerRep = save.managerDetails.reputation
        const teamTier = save.teams.find(t => t.id === data.offeringTeamId)?.tier || "Slum"

        // Base chance 40% + bonus from rep
        let successChance = 0.4
        if (managerRep > 50) successChance += 0.2
        if (teamTier === "ELITE") successChance -= 0.1 // Harder to negotiate with elite teams

        const rng = new SeededRNG(save.lastRngSeed || generateSeed())
        const roll = this.roll(rng)

        data.negotiationAttempts++

        if (roll < successChance) {
            // Success: Increase offer by 5-15%
            const increase = 0.05 + (this.roll(rng) * 0.10)
            const oldOffer = data.salaryOffer
            data.salaryOffer = Math.floor(oldOffer * (1 + increase))

            // Decrease patience slightly (successful negotiation might still annoy them)
            // But let's say successful negotiation uses up 1 patience
            data.negotiationPatience--
            save.lastRngSeed = rng.getState()

            return {
                success: true,
                message: `Success! They increased the offer to $${data.salaryOffer.toLocaleString()}.`,
                newOffer: data.salaryOffer
            }
        } else {
            // Failure
            data.negotiationPatience--

            // Critical fail check (withdraw offer) if patience hits 0 and roll was very bad
            if (data.negotiationPatience <= 0 && roll > 0.9) {
                // Withdraw offer
                // We'll mark it in a way the UI handles, or just delete it/change type
                event.acknowledged = true // Hide it basically? Or change text to WITHDRAWN
                // Better to remove choice options
                event.choices = []
                event.data.isWithdrawn = true
                save.lastRngSeed = rng.getState()
                return { success: false, message: "They were offended by your demands and withdrew the offer!", withdrew: true }
            }

            save.lastRngSeed = rng.getState()
            return { success: false, message: "They refused to increase the offer." }
        }
    }

    /**
     * Accept a job offer and switch teams
     */
    static acceptJobOffer(save: GameSave, eventId: string): { success: boolean; message: string } {
        // Find the event
        const event = save.eventsLog.find(e => e.id === eventId)
        if (!event || event.type !== "JOB_OFFER") {
            return { success: false, message: "Job offer not found" }
        }

        const offerData = event.data as any
        const newTeam = save.teams.find(t => t.id === offerData.offeringTeamId)
        if (!newTeam) {
            return { success: false, message: "Team no longer exists" }
        }

        // Check deadline
        if (save.currentWeek > offerData.deadlineWeek) {
            return { success: false, message: "Offer has expired" }
        }

        // Store old team ID for the transition event
        const oldTeamId = save.playerTeamId
        const oldTeam = save.teams.find(t => t.id === oldTeamId)

        // Switch teams
        save.playerTeamId = newTeam.id

        // Mark event as acknowledged
        event.acknowledged = true
        event.selectedChoiceId = "ACCEPT"

        // Create a notification event
        const transitionEvent = {
            id: `job_transition_${save.currentWeek}_${newTeam.id}`,
            week: save.currentWeek,
            type: "MEDIA" as any,
            data: {
                type: EventType.MEDIA,
                subject: `Manager moves to ${newTeam.name}!`,
                sentiment: "POSITIVE" as const,
                reputationImpact: 5,
                fanbaseImpact: -20, // Old fans are disappointed
            },
            acknowledged: false,
        }
        save.eventsLog.unshift(transitionEvent)

        return {
            success: true,
            message: `Welcome to ${newTeam.name}!`
        }
    }

    /**
     * Decline a job offer
     */
    static declineJobOffer(save: GameSave, eventId: string): { success: boolean; message: string } {
        const event = save.eventsLog.find(e => e.id === eventId)
        if (!event || event.type !== "JOB_OFFER") {
            return { success: false, message: "Job offer not found" }
        }

        const offerData = event.data as any

        // Mark as declined
        event.acknowledged = true
        event.selectedChoiceId = "DECLINE"

        // Boost loyalty with current team
        const currentTeam = save.teams.find(t => t.id === save.playerTeamId)
        if (currentTeam) {
            currentTeam.chemistry = Math.min(100, (currentTeam.chemistry || 50) + 5)
        }

        return {
            success: true,
            message: `You declined the offer from ${offerData.offeringTeamName}. Your team appreciates your loyalty!`
        }
    }
}

export default JobOfferGenerator
