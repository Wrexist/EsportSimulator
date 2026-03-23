/**
 * Pre-Season Transfer Processor
 *
 * Runs at the start of a new career to simulate AI teams filling
 * their rosters from the free agent pool.
 *
 * Features:
 * - AI teams fill empty roster spots (need 5 players minimum)
 * - Signings spread across weeks 1–5 (top teams sign first)
 * - Only top 50 teams generate inbox mail events
 * - Creates transfer history records
 */

import {
    GameSave,
    TeamSaveData,
    PlayerSaveData,
    ContractSaveData,
    TransferRecord,
    GameEventSaveData,
} from "./save-types"
import { SeededRNG, generateSeed } from "./rng"

export interface PreSeasonTransferResult {
    transfers: TransferRecord[]
    events: GameEventSaveData[]
    signings: number
    teamsUpdated: number
}

/** Number of weeks over which pre-season signings are spread */
const PRE_SEASON_WEEKS = 5

export class PreSeasonTransferProcessor {
    /**
     * Process the initial pre-season transfer window.
     * Called after createCareerFromSnapshot().
     * Spreads signings across weeks 1–5 based on team reputation.
     */
    static processPreSeasonWindow(save: GameSave, playerTeamId: string): PreSeasonTransferResult {
        const rng = new SeededRNG(save.lastRngSeed || generateSeed())
        const transfers: TransferRecord[] = []
        const events: GameEventSaveData[] = []
        let signings = 0
        let teamsUpdated = 0

        // Sort teams by reputation (highest first — they get first pick)
        const sortedTeams = [...save.teams]
            .filter(t => t.id !== playerTeamId)
            .sort((a, b) => (b.reputation || 0) - (a.reputation || 0))

        // Identify teams that need players
        const teamsNeedingPlayers = sortedTeams.filter(t => t.rosterIds.length < 5)

        // Assign each team a signing week (1–5) based on position in reputation ranking
        const batchSize = Math.max(1, Math.ceil(teamsNeedingPlayers.length / PRE_SEASON_WEEKS))

        // Get all rostered player IDs (refreshed before each signing)
        const getRosteredIds = () => new Set(save.teams.flatMap(t => t.rosterIds))

        for (let i = 0; i < teamsNeedingPlayers.length; i++) {
            const team = teamsNeedingPlayers[i]
            const signingWeek = Math.min(PRE_SEASON_WEEKS, Math.floor(i / batchSize) + 1)

            const playersNeeded = 5 - team.rosterIds.length
            if (playersNeeded <= 0) continue

            teamsUpdated++

            for (let p = 0; p < playersNeeded; p++) {
                const rosteredIds = getRosteredIds()
                const freeAgents = save.players.filter(pl =>
                    !rosteredIds.has(pl.id) &&
                    !pl.isRetired &&
                    pl.tier !== "LEGENDARY" &&
                    !pl.id.startsWith('fpl_nonpro_') &&
                    !pl.id.startsWith('prospect_')
                )

                if (freeAgents.length === 0) break

                const selectedPlayer = this.selectBestFreeAgent(team, freeAgents, save, rng)
                if (!selectedPlayer) break

                const transfer = this.executeSigning(save, team, selectedPlayer, signingWeek)
                transfers.push(transfer)
                signings++
            }
        }

        // Generate mail events — only for top 50 teams
        if (signings > 0) {
            const teamTransfers = new Map<string, TransferRecord[]>()
            for (const t of transfers) {
                if (!t.toTeamId) continue
                const existing = teamTransfers.get(t.toTeamId) || []
                existing.push(t)
                teamTransfers.set(t.toTeamId, existing)
            }

            // Only top 50 teams by reputation get individual mail events
            const topTeamIds = new Set(sortedTeams.slice(0, 50).map(t => t.id))

            for (const [teamId, teamSignings] of teamTransfers) {
                const team = save.teams.find(t => t.id === teamId)
                if (!team) continue
                if (!topTeamIds.has(teamId)) continue

                // Use the signing week from the first transfer for the event week
                const eventWeek = teamSignings[0]?.week || 1

                events.push({
                    id: `evt_preseason_w${eventWeek}_${teamId}`,
                    type: "ROSTER_UPDATE",
                    week: eventWeek,
                    data: {
                        teamId,
                        teamName: team.name,
                        signings: teamSignings.map(t => {
                            const player = save.players.find(pl => pl.id === t.playerId)
                            return {
                                playerName: t.playerName,
                                playerId: t.playerId,
                                ovr: player?.skill || 0,
                                country: player?.nationality || "Unknown",
                                fee: t.fee || 0,
                                fromTeamName: t.fromTeamName || "Free Agent"
                            }
                        }),
                        message: teamSignings.length === 1
                            ? `${team.name} has signed ${teamSignings[0].playerName} from the free agent pool.`
                            : `${team.name} has signed ${teamSignings.length} players: ${teamSignings.map(t => t.playerName).join(", ")}.`
                    },
                    acknowledged: false
                })
            }

            // Summary event at week 1
            events.unshift({
                id: `evt_preseason_summary_w1`,
                type: "TRANSFER_WINDOW",
                week: 1,
                data: {
                    title: "Pre-Season Transfer Window Open",
                    message: `The pre-season transfer window is underway. ${signings} signings are expected across ${teamsUpdated} teams over the next ${PRE_SEASON_WEEKS} weeks.`,
                    totalSignings: signings,
                    teamsUpdated
                },
                acknowledged: false
            })
        }

        save.lastRngSeed = rng.getState()
        return { transfers, events, signings, teamsUpdated }
    }

    /**
     * AI logic to select the best free agent for a team
     */
    private static selectBestFreeAgent(
        team: TeamSaveData,
        availablePlayers: PlayerSaveData[],
        save: GameSave,
        rng: SeededRNG
    ): PlayerSaveData | null {
        if (availablePlayers.length === 0) return null

        const rosterPlayers = save.players.filter(p => team.rosterIds.includes(p.id))
        const hasAWPer = rosterPlayers.some(p => (p.role || "").toUpperCase() === "AWPER")
        const hasIGL = rosterPlayers.some(p => p.role === "IGL")

        const scoredPlayers = availablePlayers.map(player => {
            let score = 0

            score += player.skill * 2

            if (!hasAWPer && (player.role || "").toUpperCase() === "AWPER") {
                score += 50
            }
            if (!hasIGL && player.role === "IGL") {
                score += 40
            }

            if (player.tier === team.tier) score += 20

            if (player.age < 25) score += 10
            else if (player.age > 30) score -= 10

            if (team.reputation > 50 && player.prestigeScore) {
                score += player.prestigeScore * 0.5
            }

            score += rng.next() * 20

            return { player, score }
        })

        scoredPlayers.sort((a, b) => b.score - a.score)
        return scoredPlayers[0]?.player || null
    }

    /**
     * Execute a free agent signing at a specific week
     */
    private static executeSigning(
        save: GameSave,
        team: TeamSaveData,
        player: PlayerSaveData,
        week: number
    ): TransferRecord {
        team.rosterIds.push(player.id)

        const salary = Math.max(500, Math.floor(player.skill * 50))

        const contract: ContractSaveData = {
            playerId: player.id,
            teamId: team.id,
            salaryPerWeek: salary,
            startWeek: week,
            endWeek: week + 52 * 2, // 2 year contract
            buyout: salary * 52 * 1.5
        }
        save.contracts.push(contract)

        if (!player.careerHistory) {
            player.careerHistory = []
        }
        player.careerHistory.push({
            teamId: team.id,
            teamName: team.name,
            joinedWeek: week
        })

        player.forSale = false
        player.transferListingPrice = undefined

        const transfer: TransferRecord = {
            id: `transfer_preseason_w${week}_${player.id}`,
            playerId: player.id,
            playerName: player.nickname || player.name || 'Unknown',
            fromTeamId: null,
            fromTeamName: null,
            toTeamId: team.id,
            toTeamName: team.name,
            fee: 0,
            week: week,
            type: "SIGNING"
        }

        return transfer
    }

    /**
     * Initialize career history for all players based on current rosters
     */
    static initializeCareerHistory(save: GameSave): void {
        for (const player of save.players) {
            const team = save.teams.find(t => t.rosterIds.includes(player.id))

            if (team) {
                player.careerHistory = [{
                    teamId: team.id,
                    teamName: team.name,
                    joinedWeek: 1
                }]
            } else {
                player.careerHistory = []
            }
        }
    }
}
