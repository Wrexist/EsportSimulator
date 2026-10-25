/**
 * Job Offer Generator
 * Phase 60: Job Market System
 * 
 * Generates job offers for the manager based on their performance,
 * reputation, and achievements.
 */

import { GameSave, TeamSaveData, GameEventSaveData, TournamentSaveData } from "./save-types"
import { switchClubManagement } from "./club-management"
import { ensureBoardState } from "./board-expectations"
import { updateCareerStats } from "./career-stats"
import { closeStint, openStint } from "./manager-timeline"
import { EventType } from "@/types/enums"
import { SeededRNG, generateSeed } from "./rng"

/** Highest club reputation that offers a first job to an unemployed new manager (G9). */
export const FIRST_JOB_MAX_REPUTATION = 35

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
        // A Draft Cup is one cup with a drafted team: no other club hires its manager.
        if (save.draftCup) return
        const activeRng = rng ?? new SeededRNG(save.lastRngSeed ?? generateSeed())
        const currentTeam = save.teams.find(t => t.id === save.playerTeamId)
        if (!currentTeam) return

        if (save.gameOverReason || (save.managerDetails.lastJobChangeWeek != null && save.currentWeek - save.managerDetails.lastJobChangeWeek < 12)) return
        if (save.eventsLog.some(e => e.type === 'JOB_OFFER' && !e.selectedChoiceId && !e.data.isWithdrawn && Number(e.data.deadlineWeek) >= save.currentWeek)) return
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
     * Between clubs (Phase 4.4, G9): a dismissed manager (sacked, or the club
     * folded) or a new manager who started without a club gets offers from
     * clubs willing to hire, so the career goes on. Same offer events as the
     * weekly market, flagged `afterDismissal` so they can be taken while the
     * career has no club; `firstJob` marks the unemployed start (no spell
     * ended, no dismissal counted).
     */
    static createDismissalOffers(save: GameSave, rng?: SeededRNG, count = 3): GameEventSaveData[] {
        const open = this.openBetweenClubsOffers(save)
        if (open.length) return open
        return this.createBetweenClubsOffers(save, rng ?? new SeededRNG((save.lastRngSeed ?? 1) ^ save.currentWeek), count, false)
    }

    /** Unemployed start (G9): offers from clubs low enough to take a chance on a manager with no record. */
    static createFirstJobOffers(save: GameSave, rng?: SeededRNG, count = 3): GameEventSaveData[] {
        return this.createBetweenClubsOffers(save, rng ?? new SeededRNG((save.lastRngSeed ?? 1) ^ 0x51ed), count, true)
    }

    /** Offers that can still be taken while between clubs. */
    static openBetweenClubsOffers(save: GameSave): GameEventSaveData[] {
        return save.eventsLog.filter(e => e.type === "JOB_OFFER" && e.data?.afterDismissal && !e.selectedChoiceId && !e.data.isWithdrawn
            && Number(e.data.deadlineWeek) >= save.currentWeek)
    }

    /**
     * Clubs that would hire you now, best first: for a first job the clubs
     * with reputation up to FIRST_JOB_MAX_REPUTATION (the lowest clubs in a
     * small world); after a dismissal clubs up to the old club's stature
     * that your manager level qualifies for (any of them if too few do).
     * Clubs already offered in this spell between clubs are left out.
     */
    static betweenClubsPool(save: GameSave, firstJob: boolean): TeamSaveData[] {
        const spellStart = save.gameOverWeek ?? save.currentWeek
        const offered = new Set(save.eventsLog
            .filter(e => e.type === "JOB_OFFER" && e.data?.afterDismissal && e.week >= spellStart)
            .map(e => String(e.data.offeringTeamId)))
        const open = save.teams.filter(t => t.id !== save.playerTeamId && t.rosterIds.length > 0 && !offered.has(t.id))
        let pool: TeamSaveData[]
        if (firstJob) {
            // A small world without enough low clubs: the cap rises to the third-lowest
            // club in the whole world, counting clubs already offered, so declining
            // and asking for more never moves the offers up the table.
            const lowest = save.teams.filter(t => t.id !== save.playerTeamId && t.rosterIds.length > 0)
                .map(t => t.reputation).sort((a, b) => a - b)
            const cap = Math.max(FIRST_JOB_MAX_REPUTATION, lowest[Math.min(2, lowest.length - 1)] ?? 0)
            pool = open.filter(t => t.reputation <= cap)
        } else {
            const oldTeam = save.teams.find(t => t.id === save.playerTeamId)
            const managerLevel = Math.max(1, save.managerDetails?.level || 1)
            const ceiling = Math.max(30, (oldTeam?.reputation ?? 50))
            const fits = (team: TeamSaveData, relaxed: boolean) => {
                if (team.reputation > ceiling) return false
                const requiredLevel = team.reputation >= 75 ? 10 : team.reputation >= 40 ? 5 : 1
                return relaxed || managerLevel >= requiredLevel
            }
            pool = open.filter(t => fits(t, false))
            if (pool.length < 3) pool = open.filter(t => fits(t, true))
        }
        return pool.sort((a, b) => b.reputation - a.reputation || (a.worldRanking ?? 999) - (b.worldRanking ?? 999) || a.id.localeCompare(b.id))
    }

    private static createBetweenClubsOffers(save: GameSave, rng: SeededRNG, count: number, firstJob: boolean): GameEventSaveData[] {
        if (save.draftCup) return []
        const pool = this.betweenClubsPool(save, firstJob)
        // Pick among the top dozen so the offers vary.
        const shortlist = rng.shuffle(pool.slice(0, Math.max(count, 12))).slice(0, count)
        const created: GameEventSaveData[] = []
        for (const team of shortlist) {
            const event = this.createJobOffer(save, team, rng)
            if (!event) continue
            event.id = firstJob ? `job_offer_first_${team.id}` : `job_offer_dismissal_${save.currentWeek}_${team.id}`
            event.data.afterDismissal = true
            if (firstJob) { event.data.firstJob = true; event.data.originTeamId = null }
            event.data.deadlineWeek = save.currentWeek + 52
            event.choices = [
                { id: "ACCEPT", text: `Accept offer from ${team.name}`, effects: firstJob ? {} : { reputation: 5 } },
                { id: "DECLINE", text: "Decline", effects: {} },
            ]
            created.push(event)
        }
        return created
    }

    /**
     * Between clubs: ask around for more offers once you have turned some
     * down. Tops the open offers back up to `count` from clubs not yet
     * offered in this spell; returns how many were added (0 when no other
     * club is hiring). No time passes and nothing about the clubs changes.
     */
    static findMoreOffers(save: GameSave, count = 3): number {
        if (!save.gameOverReason) return 0
        const missing = count - this.openBetweenClubsOffers(save).length
        if (missing <= 0) return 0
        const firstJob = save.gameOverReason === "UNEMPLOYED"
        const asked = save.eventsLog.filter(e => e.type === "JOB_OFFER" && e.data?.afterDismissal).length
        const rng = new SeededRNG(((save.lastRngSeed ?? 1) ^ 0x7a11) + asked * 7919)
        return this.createBetweenClubsOffers(save, rng, missing, firstJob).length
    }

    /**
     * Force a job offer generation for testing/debug
     */
    static forceJobOffer(save: GameSave, rng?: SeededRNG): void {
        if (save.draftCup) return
        const activeRng = rng ?? new SeededRNG(save.lastRngSeed ?? generateSeed())
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
    private static createJobOffer(save: GameSave, offeringTeam: TeamSaveData, rng: SeededRNG): GameEventSaveData | undefined {
        const salaryOffer = this.calculateSalaryOffer(save, offeringTeam)

        // Phase 19: World Ranking - Calculate rank if not present
        const rank = offeringTeam.worldRanking || [...save.teams].sort((a, b) => b.elo - a.elo).findIndex(t => t.id === offeringTeam.id) + 1

        const event: GameEventSaveData = {
            id: `job_offer_${save.currentWeek}_${offeringTeam.id}`,
            type: "JOB_OFFER",
            week: save.currentWeek,
            acknowledged: false,
            data: {
                type: EventType.JOB_OFFER, // This seems redundant with event.type but keeping for consistency if used elsewhere
                originTeamId: save.playerTeamId,
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

        if (save.eventsLog.some(e => e.id === event.id)) return undefined
        save.eventsLog.unshift(event)
        return event
    }

    private static offerUnavailable(save: GameSave, event: GameEventSaveData): string | undefined {
        if (save.gameOverReason && !event.data?.afterDismissal) return "This career has ended"
        if (event.selectedChoiceId || event.data.isWithdrawn) return "Offer is no longer available"
        if (!Number.isFinite(event.data.deadlineWeek) || save.currentWeek > Number(event.data.deadlineWeek)) return "Offer has expired"
        if (event.data.originTeamId && event.data.originTeamId !== save.playerTeamId) return "Offer belongs to your previous club tenure"
        if (event.data.offeringTeamId === save.playerTeamId) return "You already manage this club"
        return undefined
    }

    /**
     * Negotiate the job offer for a higher salary
     */
    static negotiateJobOffer(save: GameSave, eventId: string): { success: boolean; message: string; newOffer?: number; withdrew?: boolean } {
        const event = save.eventsLog.find(e => e.id === eventId)
        if (!event || event.type !== "JOB_OFFER") {
            return { success: false, message: "Offer not found" }
        }

        const unavailable = this.offerUnavailable(save, event)
        if (unavailable) return { success: false, message: unavailable }

        const data = event.data as {
            deadlineWeek: number
            negotiationPatience: number
            negotiationAttempts: number
            salaryOffer: number
            offeringTeamId: string
        }

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

        const rng = new SeededRNG(save.lastRngSeed ?? generateSeed())
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
        // Saves from before the Draft Cup guard can still hold one.
        if (save.draftCup) return { success: false, message: "Not available during a Draft Cup" }

        const unavailable = this.offerUnavailable(save, event)
        if (unavailable) return { success: false, message: unavailable }
        const afterDismissal = !!event.data.afterDismissal
        if (!afterDismissal && (save.activeMatchId || save.activeMatchState)) return { success: false, message: "Finish the active match before changing clubs" }
        const lastChange = save.managerDetails.lastJobChangeWeek
        if (!afterDismissal && lastChange != null && save.currentWeek - lastChange < 12) return { success: false, message: "You must spend 12 weeks at your current club before moving again" }
        const newTeam = save.teams.find(t => t.id === event.data.offeringTeamId)
        if (!newTeam) return { success: false, message: "Team no longer exists" }
        const salary = Number(event.data.salaryOffer ?? 0)
        if (!Number.isSafeInteger(salary) || salary < 0 || salary > 100000 || !Number.isFinite(newTeam.budget)) return { success: false, message: "Invalid offer terms" }
        const oldTeam = save.teams.find(t => t.id === save.playerTeamId)
        // The move takes effect next week for historical attribution: completed
        // results in the current week still belong to the departing tenure.
        const firstJob = !!event.data.firstJob
        save.careerStats = updateCareerStats(save)
        // Phase 5.1 timeline: a dismissal already closed the stint; otherwise this is a move.
        // A first job (unemployed start) ends no spell: the placeholder club was never managed.
        if (firstJob) save.managerDetails.stints = []
        else closeStint(save, "moved")
        switchClubManagement(save, oldTeam, newTeam)
        if (firstJob && newTeam.startingLeagueTier == null) newTeam.startingLeagueTier = newTeam.leagueTier
        save.managerDetails.lastJobChangeWeek = save.currentWeek
        save.managerDetails.tenureStartWeek = save.currentWeek + 1
        openStint(save)
        if (afterDismissal) {
            // A fresh start: the career continues at the new club. Assigned,
            // not deleted: the store merges the produced state, so a deleted
            // key would keep its old value there.
            save.gameOverReason = undefined
            save.gameOverWeek = undefined
            if (!firstJob) save.managerDetails.dismissals = (save.managerDetails.dismissals ?? 0) + 1
        }
        ensureBoardState(save)
        const signingBonus = salary * 4
        const ledgerId = `manager_signing_${event.id}`
        if (signingBonus > 0 && !save.financeLedger.some(e => e.id === ledgerId)) {
            newTeam.budget += signingBonus
            save.financeLedger.push({ id: ledgerId, week: save.currentWeek, teamId: newTeam.id, type: 'INCOME', category: 'OTHER', amount: signingBonus, description: `Manager signing bonus - ${newTeam.name}`, balance: newTeam.budget })
        }
        for (const other of save.eventsLog) {
            if (other.type === 'JOB_OFFER' && !other.selectedChoiceId) { other.data.isWithdrawn = true; other.choices = [] }
            if (other.choices?.length && (!other.data.teamId || other.data.teamId === oldTeam?.id) && !other.selectedChoiceId) { other.data.isWithdrawn = true; other.choices = [] }
        }
        event.acknowledged = true
        event.selectedChoiceId = 'ACCEPT'
        const id = `job_transition_${event.id}`
        const objectives = (save.boardState?.objectives ?? []).map(o => o.label).join("; ")
        if (!save.eventsLog.some(e => e.id === id)) save.eventsLog.unshift({ id, week: save.currentWeek, type: 'CAREER_UPDATE', acknowledged: false, data: { teamId: newTeam.id, title: `Welcome to ${newTeam.name}!`, message: `You now manage ${newTeam.name}. Club signing funds: $${signingBonus.toLocaleString()}.${firstJob ? "" : " Your previous club keeps its academy, scouting reports and plans."}${objectives ? ` The board's objectives: ${objectives}.` : ""}` } })
        return { success: true, message: `Welcome to ${newTeam.name}!` }
    }

    /**
     * Decline a job offer
     */
    static declineJobOffer(save: GameSave, eventId: string): { success: boolean; message: string } {
        const event = save.eventsLog.find(e => e.id === eventId)
        if (!event || event.type !== "JOB_OFFER") {
            return { success: false, message: "Job offer not found" }
        }

        const unavailable = this.offerUnavailable(save, event)
        if (unavailable) return { success: false, message: unavailable }
        const offerData = event.data as { offeringTeamName: string }

        // Mark as declined
        event.acknowledged = true
        event.selectedChoiceId = "DECLINE"
        if (event.data.afterDismissal) { event.choices = []; return { success: true, message: `You turned down ${offerData.offeringTeamName}.` } }

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
