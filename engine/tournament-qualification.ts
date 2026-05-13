// ============================================================================
// TOURNAMENT QUALIFICATION ENGINE
// Handles tournament eligibility, circuit points, and qualification tracking
// ============================================================================

import { TournamentDefinition, CIRCUIT_POINTS, getTournamentById, formatPrizePool } from "@/data/tournament-calendar"
import { debug } from "@/lib/debug-logger"
import { TeamSaveData, QualificationStatus, CircuitPointsEntry } from "./save-types"
import {
    buildInstanceId,
    getSeasonFromTournamentId,
    getSeasonFromWeek,
    getSeriesIdFromTournamentId,
    isQualificationForTournament,
    normalizeQualificationStatus,
    resolveTournamentIdentity,
} from "./circuit-engine"
export type { QualificationStatus, CircuitPointsEntry } from "./save-types"

// ============================================================================
// TYPES
// ============================================================================

export interface TournamentEligibility {
    eligible: boolean
    reason: string
    requirements: EligibilityRequirement[]
    canRegister: boolean  // Can actively register for open events
}

export interface EligibilityRequirement {
    type: "RANKING" | "POINTS" | "LEAGUE_TIER" | "INVITE" | "QUALIFIER"
    description: string
    required: number | string
    current: number | string
    met: boolean
}

// ============================================================================
// CIRCUIT POINTS MANAGER
// ============================================================================

export class CircuitPointsManager {

    /**
     * Calculate circuit points for a placement in a tournament
     */
    static getPointsForPlacement(tier: keyof typeof CIRCUIT_POINTS, placement: number): number {
        const tierPoints: Record<number, number> = CIRCUIT_POINTS[tier]
        return tierPoints[placement] || 0
    }

    /**
     * Award circuit points to a team for tournament placement
     */
    static awardPoints(
        circuitPoints: CircuitPointsEntry[],
        teamId: string,
        tournament: TournamentDefinition,
        placement: number,
        week: number
    ): CircuitPointsEntry[] {
        const points = this.getPointsForPlacement(tournament.tier, placement)

        if (points === 0) return circuitPoints

        const existing = circuitPoints.find(cp => cp.teamId === teamId)

        if (existing) {
            existing.points += points
            existing.results.push({
                tournamentId: tournament.id,
                tournamentName: tournament.name,
                placement,
                points: points,
                week
            })
        } else {
            circuitPoints.push({
                teamId,
                points,
                results: [{
                    tournamentId: tournament.id,
                    tournamentName: tournament.name,
                    placement,
                    points: points,
                    week
                }]
            })
        }

        return circuitPoints
    }

    /**
     * Get circuit points for a specific team
     */
    static getTeamPoints(circuitPoints: CircuitPointsEntry[], teamId: string): number {
        return circuitPoints.find(cp => cp.teamId === teamId)?.points || 0
    }

    /**
     * Get circuit points leaderboard (sorted by points)
     */
    static getLeaderboard(circuitPoints: CircuitPointsEntry[], limit = 30): CircuitPointsEntry[] {
        return [...circuitPoints]
            .sort((a, b) => {
                if (b.points !== a.points) return b.points - a.points
                // Secondary: most event wins (1st-place finishes)
                const aWins = a.results.filter(r => r.placement === 1).length
                const bWins = b.results.filter(r => r.placement === 1).length
                if (bWins !== aWins) return bWins - aWins
                // Tertiary: most recent result week
                const aLatest = a.results.reduce((max, r) => Math.max(max, r.week), 0)
                const bLatest = b.results.reduce((max, r) => Math.max(max, r.week), 0)
                return bLatest - aLatest
            })
            .slice(0, limit)
    }

    /**
     * Apply seasonal decay to circuit points (25% reduction)
     */
    static applySeasonalDecay(circuitPoints: CircuitPointsEntry[]): CircuitPointsEntry[] {
        return circuitPoints.map(entry => ({
            ...entry,
            points: Math.floor(entry.points * 0.75),
            results: entry.results // Keep history
        })).filter(entry => entry.points > 0)
    }
}

// ============================================================================
// QUALIFICATION ENGINE
// ============================================================================

export class QualificationEngine {
    private static getBaseTournamentId(tournamentId: string): string {
        return getSeriesIdFromTournamentId(tournamentId)
    }

    private static getTournamentSeason(tournamentId: string): number | null {
        return getSeasonFromTournamentId(tournamentId)
    }

    private static isSameTournamentKey(leftId: string, rightId: string): boolean {
        const left = resolveTournamentIdentity(leftId)
        const right = resolveTournamentIdentity(rightId)
        if (left.seriesId !== right.seriesId) return false

        const leftSeasonExplicit = this.getTournamentSeason(leftId)
        const rightSeasonExplicit = this.getTournamentSeason(rightId)
        if (leftSeasonExplicit !== null && rightSeasonExplicit !== null) {
            return left.seasonNumber === right.seasonNumber
        }

        // Legacy base IDs are treated as season aliases until fully migrated.
        return true
    }

    private static withIdentity(
        row: Omit<QualificationStatus, "seriesId" | "instanceId" | "seasonNumber"> & Partial<QualificationStatus>,
        fallbackWeek?: number
    ): QualificationStatus {
        return normalizeQualificationStatus(row as QualificationStatus, fallbackWeek)
    }

    /**
     * Check if a team is eligible to enter a tournament
     */
    static checkEligibility(
        tournament: TournamentDefinition,
        team: TeamSaveData,
        worldRanking: number,
        circuitPoints: CircuitPointsEntry[],
        qualificationStatuses: QualificationStatus[]
    ): TournamentEligibility {
        const requirements: EligibilityRequirement[] = []
        let allMet = true
        let canRegister = false

        // CRITICAL: Check minimum roster size (need at least 5 players to compete)
        const rosterSize = team.rosterIds?.length || 0
        if (rosterSize < 5) {
            requirements.push({
                type: "RANKING",
                description: "Minimum 5 players required",
                required: 5,
                current: rosterSize,
                met: false
            })
            return {
                eligible: false,
                reason: `Need ${5 - rosterSize} more player${5 - rosterSize > 1 ? 's' : ''} to compete`,
                requirements,
                canRegister: false
            }
        }

        // Check entry type requirements
        switch (tournament.entryType) {
            case "OPEN":
                canRegister = true
                requirements.push({
                    type: "RANKING",
                    description: "Open to all teams",
                    required: "Any",
                    current: `#${worldRanking}`,
                    met: true
                })
                break

            case "INVITE":
                if (tournament.requiredRanking) {
                    const met = worldRanking <= tournament.requiredRanking
                    requirements.push({
                        type: "RANKING",
                        description: `World Ranking Top ${tournament.requiredRanking}`,
                        required: tournament.requiredRanking,
                        current: worldRanking,
                        met
                    })
                    if (!met) allMet = false
                } else {
                    // Pure invite - check if invited
                    const isQualified = qualificationStatuses.some(
                        qs => isQualificationForTournament(qs, tournament.id) &&
                            qs.teamId === team.id &&
                            qs.status === "QUALIFIED"
                    )
                    requirements.push({
                        type: "INVITE",
                        description: "Direct invitation required",
                        required: "Invite",
                        current: isQualified ? "Invited" : "Not Invited",
                        met: isQualified
                    })
                    if (!isQualified) allMet = false
                }
                break

            case "QUALIFIER":
                const qualifierStatus = qualificationStatuses.find(
                    qs => isQualificationForTournament(qs, tournament.id) && qs.teamId === team.id
                )
                const hasQualified = qualifierStatus?.status === "QUALIFIED"
                requirements.push({
                    type: "QUALIFIER",
                    description: "Must qualify through qualifier event",
                    required: "Qualified",
                    current: hasQualified ? "Qualified" : "Not Qualified",
                    met: hasQualified
                })
                if (!hasQualified) allMet = false
                break

            case "POINTS":
                if (tournament.requiredPoints) {
                    const teamPoints = CircuitPointsManager.getTeamPoints(circuitPoints, team.id)
                    const met = teamPoints >= tournament.requiredPoints
                    requirements.push({
                        type: "POINTS",
                        description: `Minimum ${tournament.requiredPoints.toLocaleString()} circuit points`,
                        required: tournament.requiredPoints,
                        current: teamPoints,
                        met
                    })
                    if (!met) allMet = false
                    canRegister = met
                }
                break

            case "LEAGUE":
                if (tournament.requiredLeagueTier) {
                    const met = team.leagueTier === tournament.requiredLeagueTier
                    requirements.push({
                        type: "LEAGUE_TIER",
                        description: `Must be in ${tournament.requiredLeagueTier} league`,
                        required: tournament.requiredLeagueTier,
                        current: team.leagueTier || "B_TIER",
                        met
                    })
                    if (!met) allMet = false
                }
                break
        }

        // Generate reason string
        let reason: string
        if (allMet) {
            reason = canRegister
                ? "You can register for this tournament"
                : tournament.entryType === "INVITE"
                    ? "You have been invited"
                    : tournament.entryType === "QUALIFIER"
                        ? "You have qualified"
                        : "You meet all requirements"
        } else {
            const unmetReqs = requirements.filter(r => !r.met)
            reason = unmetReqs.map(r => r.description).join(", ")
        }

        return {
            eligible: allMet,
            reason,
            requirements,
            canRegister: tournament.entryType === "OPEN" || allMet
        }
    }

    /**
     * Check if tournament is locked (invite-only and not invited)
     */
    static isTournamentLocked(
        tournament: TournamentDefinition,
        eligibility: TournamentEligibility
    ): boolean {
        if (tournament.entryType === "OPEN") return false
        return !eligibility.eligible
    }

    /**
     * Register a team for a tournament
     */
    static registerTeam(
        qualificationStatuses: QualificationStatus[],
        tournamentId: string,
        teamId: string,
        via: string = "registered"
    ): QualificationStatus[] {
        // Check if already registered (handles base/seasonal id aliases)
        const existingIndex = qualificationStatuses.findIndex(
            qs => qs.teamId === teamId && this.isSameTournamentKey(qs.tournamentId, tournamentId)
        )

        if (existingIndex >= 0) {
            const updated = [...qualificationStatuses]
            updated[existingIndex] = this.withIdentity({
                ...updated[existingIndex],
                tournamentId,
                status: "REGISTERED",
                qualifiedVia: via
            })
            return updated
        }

        return [
            ...qualificationStatuses,
            this.withIdentity({
                tournamentId,
                teamId,
                status: "REGISTERED",
                qualifiedVia: via
            })
        ]
    }

    /**
     * Qualify a team for a tournament (from qualifier win or invite)
     */
    static qualifyTeam(
        qualificationStatuses: QualificationStatus[],
        tournamentId: string,
        teamId: string,
        via: string,
        position?: number,
        sourceInstanceId?: string,
        stageId?: string
    ): QualificationStatus[] {
        const existing = qualificationStatuses.findIndex(
            qs => qs.teamId === teamId && this.isSameTournamentKey(qs.tournamentId, tournamentId)
        )

        const newStatus: QualificationStatus = this.withIdentity({
            tournamentId,
            teamId,
            status: "QUALIFIED",
            qualifiedVia: via,
            qualifierPosition: position,
            sourceInstanceId,
            stageId
        })

        if (existing >= 0) {
            const updated = [...qualificationStatuses]
            updated[existing] = newStatus
            return updated
        }

        return [...qualificationStatuses, newStatus]
    }

    /**
     * Process qualifier results and qualify teams for main event
     * @param qualificationStatuses Current qualification statuses
     * @param qualifierTournament The qualifier tournament definition (may have seasonal ID)
     * @param placements Array of team placements from the qualifier
     * @param currentWeek Optional current week for calculating seasonal ID (defaults to extracting from qualifier ID)
     */
    static processQualifierResults(
        qualificationStatuses: QualificationStatus[],
        qualifierTournament: TournamentDefinition | { id: string; qualifierFor?: string; qualifierSlots?: number; shortName?: string; slots?: number },
        placements: { teamId: string; position: number }[],
        currentWeek?: number
    ): QualificationStatus[] {
        if (!qualifierTournament.qualifierFor) return qualificationStatuses

        // Get the base definition of the main tournament
        const mainTournament = getTournamentById(qualifierTournament.qualifierFor)
        if (!mainTournament) {
            debug.warn(`[Qualification] Main tournament not found for qualifier: ${qualifierTournament.qualifierFor}`)
            return qualificationStatuses
        }

        const qualifierSeason = getSeasonFromTournamentId(qualifierTournament.id)
            ?? (currentWeek ? getSeasonFromWeek(currentWeek) : 1)
        const mainTournamentSeasonalId = buildInstanceId(mainTournament.id, qualifierSeason)

        const requestedSpots = qualifierTournament.qualifierSlots
            || ((qualifierTournament.slots || 16) <= 8 ? 2 : 4)
        const qualifyingSpots = Math.min(
            Math.max(0, requestedSpots),
            Math.max(1, mainTournament.slots || requestedSpots)
        )

        const qualifiedTeams = [...placements]
            .sort((a, b) => {
                if (a.position !== b.position) return a.position - b.position
                return a.teamId.localeCompare(b.teamId)
            })
            .filter(p => p.position <= qualifyingSpots)
            .map(p => p.teamId)
            .filter((teamId, index, arr) => arr.indexOf(teamId) === index)

        let updated = [...qualificationStatuses]

        for (const teamId of qualifiedTeams) {
            const placement = placements.find(p => p.teamId === teamId)
            updated = this.qualifyTeam(
                updated,
                mainTournamentSeasonalId,
                teamId,
                `Via ${qualifierTournament.shortName || 'Qualifier'}`,
                placement?.position,
                qualifierTournament.id,
                "qualifier_final"
            )
        }

        // Mark non-qualifying teams as ELIMINATED in the qualifier
        const qualifiedSet = new Set(qualifiedTeams)
        for (const placement of placements) {
            if (qualifiedSet.has(placement.teamId)) continue
            updated = this.updateStatus(
                updated,
                qualifierTournament.id as string,
                placement.teamId,
                "ELIMINATED"
            )
        }

        return updated
    }

    /**
     * Update a team's qualification status (e.g. to ELIMINATED)
     */
    static updateStatus(
        qualificationStatuses: QualificationStatus[],
        tournamentId: string,
        teamId: string,
        newStatus: QualificationStatus["status"]
    ): QualificationStatus[] {
        const updated = [...qualificationStatuses]
        let changed = false

        for (let i = 0; i < updated.length; i++) {
            const row = updated[i]
            if (row.teamId !== teamId) continue
            if (!this.isSameTournamentKey(row.tournamentId, tournamentId)) continue

            updated[i] = this.withIdentity({ ...row, tournamentId, status: newStatus })
            changed = true
        }

        if (!changed) return qualificationStatuses
        return updated
    }

    /**
     * Generate automatic invites for top-ranked teams
     */
    static generateAutoInvites(
        qualificationStatuses: QualificationStatus[],
        tournament: TournamentDefinition,
        rankedTeams: { id: string; worldRanking: number }[],
        currentWeek?: number
    ): QualificationStatus[] {
        if (tournament.entryType !== "INVITE" || !tournament.inviteSlots) {
            return qualificationStatuses
        }

        const seasonNumber = getSeasonFromWeek(currentWeek ?? 1)
        const tournamentInstanceId = buildInstanceId(tournament.id, seasonNumber)

        // Use all invite slots — auto-invites fill the full allocation
        const effectiveSlots = tournament.inviteSlots || 0

        const eligibleTeams = rankedTeams
            .filter(t => tournament.requiredRanking ? t.worldRanking <= tournament.requiredRanking : true)
            .slice(0, effectiveSlots)

        let updated = [...qualificationStatuses]

        for (const team of eligibleTeams) {
            const alreadyQualified = updated.some(
                qs => isQualificationForTournament(qs, tournamentInstanceId, currentWeek) && qs.teamId === team.id
            )
            if (!alreadyQualified) {
                updated = this.qualifyTeam(updated, tournamentInstanceId, team.id, "Direct Invite")
            }
        }

        return updated
    }
}

// ============================================================================
// TOURNAMENT PARTICIPATION MANAGER
// ============================================================================

export class TournamentParticipationManager {

    /**
     * Get all tournaments a team is participating in
     */
    static getTeamTournaments(
        qualificationStatuses: QualificationStatus[],
        teamId: string
    ): { tournamentId: string; status: string; via?: string }[] {
        return qualificationStatuses
            .filter(qs => qs.teamId === teamId)
            .map(qs => ({
                tournamentId: qs.tournamentId,
                status: qs.status,
                via: qs.qualifiedVia
            }))
    }

    /**
     * Get all teams participating in a tournament
     */
    static getTournamentParticipants(
        qualificationStatuses: QualificationStatus[],
        tournamentId: string
    ): { teamId: string; status: string; via?: string }[] {
        return qualificationStatuses
            .filter(qs => isQualificationForTournament(qs, tournamentId))
            .map(qs => ({
                teamId: qs.teamId,
                status: qs.status,
                via: qs.qualifiedVia
            }))
    }

    /**
     * Check if team is currently in a tournament
     */
    static isTeamInTournament(
        qualificationStatuses: QualificationStatus[],
        teamId: string,
        tournamentId: string
    ): boolean {
        return qualificationStatuses.some(
            qs => qs.teamId === teamId &&
                isQualificationForTournament(qs, tournamentId) &&
                (qs.status === "QUALIFIED" || qs.status === "REGISTERED")
        )
    }
}
