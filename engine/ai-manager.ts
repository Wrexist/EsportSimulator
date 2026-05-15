import {
    GameSave,
    TeamSaveData,
    PlayerSaveData,
    ContractSaveData,
} from "./save-types"
import { reconcileTeamRoles } from "./role-reconciler"
import { PlayerRole, EventType } from "../types" // Adjust import path if needed
import { SeededRNG, generateSeed } from "./rng"
import { TrainingManager } from "./training-manager"
import { applyRosterChangePenalty } from "./chemistry-engine"
import { generateProspectBatch } from "./prospect-generator"
import {
    manageStaff as manageStaffFn,
    manageSponsors as manageSponsorsFn,
    manageFacilities as manageFacilitiesFn,
    manageAcademy as manageAcademyFn,
} from "./ai/infrastructure"
import { getPlayerIndex as getPlayerIndexFn } from "./ai/player-index"
import { logger } from "@/lib/logger"

/**
 * AI Manager
 * Phase 7: The Intelligent Opponent
 * 
 * Logic for non-player teams to manage rosters and finances.
 */
export class AIManager {
    private static fallbackRng = new SeededRNG(generateSeed())
    private static readonly MAX_TRANSFER_OFFERS_PER_TEAM_PER_WEEK = 2

    private static roll(rng?: SeededRNG): number {
        return rng ? rng.next() : this.fallbackRng.next()
    }

    // getPlayerIndex implementation extracted to engine/ai/player-index.ts
    // (Phase K2). Facade kept so internal AIManager callers don't change.
    private static getPlayerIndex(save: GameSave): Map<string, PlayerSaveData> {
        return getPlayerIndexFn(save)
    }

    /**
     * Score a candidate free-agent / transfer target.
     *
     * Combines current skill, growth headroom (potential - skill), age bonus
     * for youth, role-coverage bonus when the team is missing the role, and
     * a value-for-money divisor so AI doesn't always go for the most
     * expensive player.
     */
    private static scoreSigningCandidate(
        player: PlayerSaveData,
        weeklySalary: number,
        missingRoles: Set<string>
    ): number {
        const skill = player.skill ?? 50
        const potential = player.potential ?? skill
        const age = player.age ?? 22
        const growthRoom = Math.max(0, potential - skill)
        // Youth bonus (younger = more career left, more dev). Capped at age 17.
        const youthBonus = Math.max(0, 25 - age) * 1.5
        // Role-gap bonus: prefer players that fill a missing role.
        const role = (player.role ?? "RIFLER").toString().toUpperCase()
        const roleBonus = missingRoles.has(role) ? 20 : 0
        // Value-for-money: scale by salary inversely.
        const valueDivisor = Math.max(500, weeklySalary) / 1000
        return (skill + growthRoom * 0.6 + youthBonus + roleBonus) / valueDivisor
    }

    /**
     * Process weekly AI decisions for all AI-controlled teams
     */
    static processWeeklyAI(save: GameSave, playerTeamId: string, rng?: SeededRNG, isTransferWindow: boolean = true) {
        const activeRng = rng ?? new SeededRNG(save.lastRngSeed || generateSeed())
        const aiTeams = save.teams.filter(t => t.id !== playerTeamId)

        aiTeams.forEach(team => {
            this.adaptTeamStrategy(team, save, activeRng)
            if (isTransferWindow) {
                this.manageRoster(team, save)
            }
            this.manageFinances(team, save)
            this.considerRoleTraining(team, save, activeRng)
            // Infrastructure investment (staff / sponsors / facilities /
            // academy) extracted to engine/ai/infrastructure.ts (Phase H3).
            // Routed through module imports so AIManager doesn't have to
            // re-house ~280 lines of self-contained per-team decisions.
            manageStaffFn(team, save, activeRng)
            manageSponsorsFn(team, save, activeRng)
            manageFacilitiesFn(team, save, activeRng)
            manageAcademyFn(team, save, activeRng)

            // Phase 10: Role Refinement (Team-Based)
            const teamPlayers = save.players.filter(p => team.rosterIds.includes(p.id))
            reconcileTeamRoles(teamPlayers)
        })

        // Process Global Transfer Market only during transfer windows
        if (isTransferWindow) {
            this.processAITransferMarket(save, playerTeamId, activeRng)
        }
        if (!rng) save.lastRngSeed = activeRng.getState()
    }

    /**
     * Adapt AI tactical identity weekly to prevent static meta exploitation.
     */
    private static adaptTeamStrategy(team: TeamSaveData, save: GameSave, rng: SeededRNG): void {
        // Enforce minimum cooldown between strategy changes to prevent erratic weekly flipping.
        const MIN_STRATEGY_COOLDOWN = 4 // weeks
        if (save.currentWeek - (team.lastStrategyChangeWeek ?? 0) < MIN_STRATEGY_COOLDOWN) return
        // Keep strategic inertia; only pivot some weeks.
        if (this.roll(rng) > 0.35) return

        const recent = (team.recentForm || []).slice(-5)
        const wins = recent.filter(r => r === "W").length
        const losses = recent.filter(r => r === "L").length
        const inFinancialPressure =
            team.financialState === "RISK" ||
            team.financialState === "CRISIS" ||
            team.financialState === "INSOLVENT" ||
            (team.weeklyNet || 0) < 0

        // Peek at the upcoming opponent so playstyle adaptation can factor
        // in the rock-paper-scissors counter (aggressive>structured,
        // structured>balanced, balanced>aggressive).
        const nextMatch = save.scheduledMatches.find(m =>
            m.week === save.currentWeek + 1 &&
            (m.homeTeamId === team.id || m.awayTeamId === team.id)
        )
        const opponentId = nextMatch
            ? (nextMatch.homeTeamId === team.id ? nextMatch.awayTeamId : nextMatch.homeTeamId)
            : undefined
        const opponent = opponentId ? save.teams.find(t => t.id === opponentId) : undefined
        const counterMap: Record<string, NonNullable<TeamSaveData["playstyle"]>> = {
            aggressive: "balanced",   // balanced beats aggressive
            structured: "aggressive", // aggressive beats structured
            balanced: "structured",   // structured beats balanced
        }
        const counterToOpponent = opponent?.playstyle ? counterMap[opponent.playstyle] : undefined

        // Economy adaptation
        if (inFinancialPressure || team.budget < 50_000) {
            team.economyStyle = "eco"
        } else if (losses >= 3 && team.budget > 100_000) {
            team.economyStyle = "force"
        } else {
            team.economyStyle = this.roll(rng) < 0.25 ? "force" : "standard"
        }

        // Playstyle adaptation:
        //  - On a hot streak, double down on aggression (it's working).
        //  - On a cold streak, swap to structured to stabilize.
        //  - Low chemistry → structured (less reliant on coordination).
        //  - Otherwise: 60% chance to deliberately counter the upcoming
        //    opponent's known playstyle, else pick from a neutral pool. The
        //    weighted-counter behavior makes AI teams feel scout-aware.
        if (wins >= 4) {
            team.playstyle = this.roll(rng) < 0.65 ? "aggressive" : "balanced"
        } else if (losses >= 3) {
            team.playstyle = this.roll(rng) < 0.55 ? "structured" : "default"
        } else if ((team.chemistry || 50) < 50) {
            team.playstyle = "structured"
        } else if (counterToOpponent && this.roll(rng) < 0.6) {
            team.playstyle = counterToOpponent
        } else {
            const styles: Array<NonNullable<TeamSaveData["playstyle"]>> = ["balanced", "default", "aggressive"]
            team.playstyle = styles[Math.floor(this.roll(rng) * styles.length)]
        }

        // Record that strategy changed this week (cooldown enforcement)
        team.lastStrategyChangeWeek = save.currentWeek

        // Opponent anti-strat targeting for upcoming week.
        if (!nextMatch || this.roll(rng) < 0.2) {
            team.targetPlayerId = undefined
            return
        }
        if (!opponent || opponent.rosterIds.length === 0) {
            team.targetPlayerId = undefined
            return
        }

        const playerIndex = this.getPlayerIndex(save)
        const opponentPlayers = opponent.rosterIds
            .map(pid => playerIndex.get(pid))
            .filter((p): p is PlayerSaveData => !!p)

        // O(n) reduce instead of O(n log n) sort to find the best player
        const bestOpponent = opponentPlayers.length > 0
            ? opponentPlayers.reduce((best, p) =>
                (p.skill + p.potential * 0.2) > (best.skill + best.potential * 0.2) ? p : best,
                opponentPlayers[0])
            : undefined

        team.targetPlayerId = bestOpponent?.id
    }

    /**
     * Handle Signings and Releases
     */
    private static manageRoster(team: TeamSaveData, save: GameSave) {
        const rosterSize = team.rosterIds.length

        // 1. Fill Gaps (Need 5 players)
        if (rosterSize < 5) {
            this.signFreeAgent(team, save)
            return
        }

        // 1b. Critical role coverage: even at 5 players, if the team has no
        // IGL or no AWPer, try to bring in a 6th who fills that gap. Limited
        // to teams not in financial pressure so we don't bankrupt anyone.
        const inFinancialPressure =
            team.financialState === "RISK" ||
            team.financialState === "CRISIS" ||
            team.financialState === "INSOLVENT"
        if (rosterSize < 7 && !inFinancialPressure && team.budget > 150_000) {
            const playerIndex = this.getPlayerIndex(save)
            const roles = new Set<string>()
            for (const id of team.rosterIds) {
                const p = playerIndex.get(id)
                if (p?.role) roles.add(p.role.toString().toUpperCase())
            }
            const missingCritical = !roles.has("IGL") || !roles.has("AWPER")
            if (missingCritical) {
                this.signFreeAgent(team, save)
                return
            }
        }

        // 2. Trim Excess (Max 7 players)
        if (rosterSize > 7) {
            this.releaseWorstPlayer(team, save)
        }
    }

    /**
     * Handle Panic Selling and Budget Controls
     */
    private static manageFinances(team: TeamSaveData, save: GameSave) {
        // If in Crisis (Runway < 3 weeks), sell players
        if (team.financialState === "CRISIS" || team.financialState === "INSOLVENT") {
            this.listPlayerForTransfer(team, save)
        }

        // If Runway is getting low (Risk), stop spending (handled in sign check usually)
    }

    /**
     * AI considers starting role training for a player.
     * ~15% chance per week, only if budget is healthy and slots available.
     */
    private static considerRoleTraining(team: TeamSaveData, save: GameSave, rng: SeededRNG) {
        // Only 15% chance per week
        if (this.roll(rng) > 0.15) return

        // Budget check: need at least $100k to consider training
        if (team.budget < 100_000) return

        // Skip if in financial trouble
        if (team.financialState === "CRISIS" || team.financialState === "INSOLVENT" || team.financialState === "RISK") return

        // Slot check
        if ((team.trainingSlotsUsed || 0) >= (team.maxTrainingSlots || 10)) return

        // Find eligible players: no secondary role, not already training, prefer younger
        const teamPlayers = save.players.filter(p =>
            team.rosterIds.includes(p.id) &&
            !p.secondaryRole &&
            !p.injury &&
            (p.energy ?? 100) >= 20
        )

        // Filter out players already in training
        if (!team.activeRoleTraining) team.activeRoleTraining = []
        const trainingIds = new Set(team.activeRoleTraining.map(t => t.playerId))
        const candidates = teamPlayers.filter(p => !trainingIds.has(p.id))

        if (candidates.length === 0) return

        // Prefer younger players (< 25) — they benefit more from versatility
        candidates.sort((a, b) => (a.age || 20) - (b.age || 20))
        const target = candidates[0]

        // Pick a complementary role (different from their primary)
        const roles: ("igl" | "entry" | "support" | "awper" | "rifler")[] = ["igl", "entry", "support", "awper", "rifler"]
        const availableRoles = roles.filter(r => r !== target.role?.toLowerCase())
        if (availableRoles.length === 0) return

        const targetRole = availableRoles[Math.floor(this.roll(rng) * availableRoles.length)]

        TrainingManager.startRoleTraining(save, team.id, target.id, targetRole)
    }


    /** Deterministic small hash of a team ID for RNG salting. */
    private static hashTeamId(id: string): number {
        let h = 0
        for (let i = 0; i < id.length; i++) {
            h = ((h * 31) + id.charCodeAt(i)) | 0
        }
        return h >>> 0
    }

    // === ACTIONS ===

    private static signFreeAgent(team: TeamSaveData, save: GameSave) {
        // Enforce max roster size of 7
        if (team.rosterIds.length >= 7) return

        const allRosteredIds = new Set(save.teams.flatMap(t => t.rosterIds))
        const freeAgents = save.players.filter(p => !allRosteredIds.has(p.id) && !p.isRetired)

        if (freeAgents.length === 0) return

        // Calculate affordable salary based on team budget
        // Salary formula: skill-based with tier multiplier, ensuring it's realistic
        // AI needs at least 26 weeks of runway after signing (half a season)
        const calculateSalary = (player: PlayerSaveData): number => {
            const baseSalary = (player.skill ?? 50) * 50
            const tierMultiplier = player.tier === "ELITE" ? 3 : player.tier === "PRO" ? 2 : 1
            return Math.floor(baseSalary * tierMultiplier)
        }

        // Calculate total existing weekly costs (wages + staff + facilities)
        const existingWageBill = save.contracts
            .filter(c => c.teamId === team.id)
            .reduce((sum, c) => sum + (c.salaryPerWeek || 0), 0)
        const staffCosts = (team.staffIds || []).length * 2000 // ~$2k/week avg per staff
        const existingWeeklyCosts = existingWageBill + staffCosts

        // Identify missing roles on the current roster so the AI fills gaps
        // rather than blindly stacking the highest skill regardless of role.
        const playerIndex = this.getPlayerIndex(save)
        const REQUIRED_ROLES = ["IGL", "AWPER", "ENTRY_FRAGGER", "SUPPORT", "RIFLER"]
        const currentRoles = new Set<string>()
        for (const id of team.rosterIds) {
            const p = playerIndex.get(id)
            if (p?.role) currentRoles.add(p.role.toString().toUpperCase())
        }
        const missingRoles = new Set(REQUIRED_ROLES.filter(r => !currentRoles.has(r)))

        // Filter to affordable candidates first, then score by skill + growth
        // + role-fit + value-for-money so AI picks the smartest signing
        // instead of just highest raw skill (which often over-spends).
        const affordable = freeAgents.filter(p => {
            const weeklySalary = calculateSalary(p)
            const totalWeeklyCost = existingWeeklyCosts + weeklySalary
            const runwayCost = totalWeeklyCost * 26
            return team.budget > runwayCost && team.budget > 50_000
        })
        if (affordable.length === 0) return

        let target: PlayerSaveData | undefined
        let bestScore = -Infinity
        for (const p of affordable) {
            const score = this.scoreSigningCandidate(p, calculateSalary(p), missingRoles)
            if (score > bestScore) {
                bestScore = score
                target = p
            }
        }

        if (!target) return

        const salary = calculateSalary(target)

        // Sign them. Defensive guard against double-add — if a stale roster
        // somehow contains this player already, do nothing rather than
        // creating a duplicate ID.
        if (team.rosterIds.includes(target.id)) return
        team.rosterIds.push(target.id)
        applyRosterChangePenalty(team, save.currentWeek, 1)

        // Create Contract (1 year)
        save.contracts.push({
            playerId: target.id,
            teamId: team.id,
            salaryPerWeek: salary,
            startWeek: save.currentWeek,
            endWeek: save.currentWeek + 52,
            buyout: salary * 52
        })

        // Remove from transfer list if they were there
        target.forSale = false
        target.transferListingPrice = undefined

        // Create Transfer Record
        if (save.transferHistory) {
            save.transferHistory.push({
                id: `transfer_ai_${save.currentWeek}_${target.id}`,
                week: save.currentWeek,
                type: "SIGNING",
                playerId: target.id,
                playerName: target.nickname,
                fromTeamId: null,
                fromTeamName: "Free Agent",
                toTeamId: team.id,
                toTeamName: team.name,
                fee: 0
            })
        }
    }

    private static releaseWorstPlayer(team: TeamSaveData, save: GameSave) {
        // Resolve roster via the cached player index so this is O(rosterSize)
        // instead of O(rosterSize * players).
        const playerIndex = this.getPlayerIndex(save)
        const players = team.rosterIds
            .map(id => playerIndex.get(id))
            .filter((p): p is PlayerSaveData => !!p)

        if (players.length === 0) return

        // Score by skill + youth + growth potential — release the player who
        // gives the least future value, not strictly the lowest current skill.
        // Age 30+ players get penalized so the AI doesn't permanently keep
        // declining veterans over high-skill youngsters.
        const valueScore = (p: PlayerSaveData) => {
            const skill = p.skill ?? 50
            const potential = p.potential ?? skill
            const age = p.age ?? 22
            const declinePenalty = Math.max(0, age - 28) * 2
            return skill + Math.max(0, potential - skill) * 0.5 - declinePenalty
        }
        const worst = players.reduce((min, p) => (valueScore(p) < valueScore(min) ? p : min), players[0])

        // Release
        team.rosterIds = team.rosterIds.filter(id => id !== worst.id)
        applyRosterChangePenalty(team, save.currentWeek, 1)

        // Remove contract with a bounded termination cost so AI follows similar rules to the player.
        const contract = save.contracts.find(c => c.playerId === worst.id && c.teamId === team.id)
        if (contract) {
            const weeksRemaining = Math.max(0, contract.endWeek - save.currentWeek)
            const cappedWeeks = Math.min(weeksRemaining, 26)
            const terminationCost = Math.round(contract.salaryPerWeek * cappedWeeks * 0.5)
            team.budget -= terminationCost
        }
        // Bug fix: scope by (playerId, teamId) — wiping by playerId alone
        // can clobber unrelated historical/ghost contracts that happen to
        // share the player ID across teams.
        save.contracts = save.contracts.filter(c => !(c.playerId === worst.id && c.teamId === team.id))

        // Create Transfer Record (Release)
        if (save.transferHistory) {
            save.transferHistory.push({
                id: `release_ai_${save.currentWeek}_${worst.id}`,
                week: save.currentWeek,
                type: "RELEASE",
                playerId: worst.id,
                playerName: worst.nickname,
                fromTeamId: team.id,
                fromTeamName: team.name,
                toTeamId: null,
                toTeamName: "Free Agent",
                fee: 0
            })
        }

        // Log to ledger? "Contract Termination"
    }

    private static listPlayerForTransfer(team: TeamSaveData, save: GameSave) {
        // In crisis the AI needs to dump wages fast. Pick the player whose
        // salary-to-value ratio hurts the team the most so we get the biggest
        // weekly relief per listing.
        const playerIndex = this.getPlayerIndex(save)
        const players = team.rosterIds
            .map(id => playerIndex.get(id))
            .filter((p): p is PlayerSaveData => !!p)
        const notForSale = players.filter(p => !p.forSale)
        if (notForSale.length === 0) return

        const contractByPlayer = new Map<string, ContractSaveData>()
        for (const c of save.contracts) {
            if (c.teamId === team.id) contractByPlayer.set(c.playerId, c)
        }

        // Higher score = better candidate to dump.
        const wageBurden = (p: PlayerSaveData) => {
            const salary = contractByPlayer.get(p.id)?.salaryPerWeek ?? 0
            const skill = p.skill ?? 50
            const tactic = p.tactic ?? 50
            const age = p.age ?? 22
            const ageDecline = Math.max(0, age - 27) * 5
            // Players with high salary but low contribution score the highest.
            return salary / Math.max(20, skill + tactic - ageDecline)
        }
        const target = notForSale.reduce(
            (worst, p) => (wageBurden(p) > wageBurden(worst) ? p : worst),
            notForSale[0]
        )
        target.forSale = true
        target.transferListingPrice = (target.prestigeScore || 50) * 1000
        target.weeksOnTransferList = 0
    }

    /**
     * AI Teams making offers for User Players
     */
    private static processAITransferMarket(save: GameSave, playerTeamId: string, rng?: SeededRNG) {
        // 1. Find User Players listed for sale
        const playerTeam = save.teams.find(t => t.id === playerTeamId)
        if (!playerTeam) return

        const playerIndex = this.getPlayerIndex(save)
        const userPlayersForSale = playerTeam.rosterIds
            .map(id => playerIndex.get(id))
            .filter((p): p is PlayerSaveData => !!p && !!p.forSale)

        if (userPlayersForSale.length === 0) return

        // 2. Iterate AI Teams
        const aiTeams = save.teams.filter(t => t.id !== playerTeamId)

        // Build Set of existing pending transfer offer keys for O(1) lookups
        const existingOfferKeys = new Set<string>()
        for (const e of save.eventsLog) {
            if (e.week === save.currentWeek && e.type === "TRANSFER_OFFER" && !e.selectedChoiceId && e.data?.teamId && e.data?.playerId) {
                existingOfferKeys.add(`${e.data.teamId}_${e.data.playerId}`)
            }
        }

        aiTeams.forEach(aiTeam => {
            // Budget check
            if (aiTeam.budget < 50000) return
            let offersMade = 0

            // Pre-compute the AI team's role coverage once so we can bias
            // interest toward signing for missing roles. Looking at this for
            // every sale candidate inside the inner loop would re-scan the
            // roster N times for the same team.
            const aiRoles = new Set<string>()
            for (const id of aiTeam.rosterIds) {
                const p = playerIndex.get(id)
                if (p?.role) aiRoles.add(p.role.toString().toUpperCase())
            }

            // Check each player for sale
            userPlayersForSale.forEach(player => {
                if (offersMade >= this.MAX_TRANSFER_OFFERS_PER_TEAM_PER_WEEK) return

                const existingOffer = existingOfferKeys.has(`${aiTeam.id}_${player.id}`)
                if (existingOffer) return

                // Calculate Market Value (Base Value)
                // Potential is more heavily weighted for aggressive scouting
                let baseValue = (player.skill * 100) + (player.potential * 150) // Increased potential weight
                if (player.tier === "ELITE") baseValue *= 50
                else if (player.tier === "PRO") baseValue *= 20
                else baseValue *= 5

                // Determine interest based on price ratio
                // listingPrice vs baseValue (Market Value)
                const listingPrice = player.transferListingPrice || baseValue
                const priceRatio = listingPrice / baseValue

                // Potential aggression: Higher potential candidates get a massive boost to interest
                // Skill 15/Potential 20 is a "Golden Boy" target
                const potentialMultiplier = player.potential > 16 ? 1.5 : (player.potential > 14 ? 1.2 : 1.0)

                // Role-fit: if the AI is missing this player's role entirely
                // it's much more interested. If they already have somebody
                // there it's slightly less interested (small soft penalty)
                // to keep the market diversified rather than every team
                // chasing the same player.
                const playerRole = (player.role ?? "RIFLER").toString().toUpperCase()
                const roleFitMultiplier = !aiRoles.has(playerRole) ? 1.4
                    : aiRoles.size <= 4 ? 1.0
                    : 0.85

                // Probability scaling:
                // Ratio 1.0 -> 30% * potentialMultiplier
                // Ratio 0.5 -> ~80%
                const interestMultiplier = Math.exp(2 * (1 - priceRatio))
                const baseChance = 0.3 * potentialMultiplier * roleFitMultiplier
                const finalChance = Math.min(0.98, baseChance * interestMultiplier)

                if (this.roll(rng) > finalChance) return

                // Calculate Offer Amount
                // AI is anchored to baseValue but influenced slightly by asking price (10% pull)
                // If potential is high, AI is willing to overpay moderately (anchored value shifts up)
                const overpayBuffer = player.potential > 17 ? 1.2 : (player.potential > 15 ? 1.1 : 1.0)
                const anchoredValue = ((baseValue * 0.9) + (listingPrice * 0.1)) * overpayBuffer

                // Randomize offer (+/- 15%)
                const offerAmount = Math.round(anchoredValue * (0.85 + this.roll(rng) * 0.3))

                // Strict Budget Check
                if (offerAmount > aiTeam.budget) return

                // Create Offer Event
                const eventId = `offer_${save.currentWeek}_${aiTeam.id}_${player.id}_${offerAmount}`

                save.eventsLog.push({
                    id: eventId,
                    type: "TRANSFER_OFFER" as unknown as EventType,
                    week: save.currentWeek,
                    data: {
                        teamId: aiTeam.id,
                        teamName: aiTeam.name,
                        playerId: player.id,
                        playerName: player.nickname,
                        offerAmount: offerAmount,
                        message: `${aiTeam.name} has submitted a transfer offer for ${player.nickname}.`
                    },
                    acknowledged: false,
                    choices: [
                        // Economic transfer effects are handled by transferPlayer when the offer is accepted.
                        { id: "accept", text: "Accept Offer", effects: {} },
                        { id: "reject", text: "Reject", effects: {} }
                    ]
                })
                offersMade++
            })
        })
    }

    // === PHASE 5/7 Integration: Missing Methods ===
    // NOTE: updateElo() removed - use LeagueEngine.updateEloAfterMatch() instead

    static refreshWorldRankings(save: GameSave) {
        // Sort teams by Elo with stable tiebreaker (reputation, then numeric ID)
        const sortedTeams = [...save.teams].sort((a, b) => {
            if (b.elo !== a.elo) return b.elo - a.elo
            if (b.reputation !== a.reputation) return b.reputation - a.reputation
            const aNum = parseInt(a.id.replace(/\D/g, ''), 10) || 0
            const bNum = parseInt(b.id.replace(/\D/g, ''), 10) || 0
            return aNum - bNum
        })
        sortedTeams.forEach((team, index) => {
            team.worldRanking = index + 1
        })
    }

    static processAcademyScouting(save: GameSave, team: TeamSaveData, rng: SeededRNG) {
        // 5% chance per week to discover a youth prospect for AI teams
        if (rng.next() > 0.05) return
        if (team.rosterIds.length >= 7) return // Already have enough players

        try {
            // Bug fix: previously passed `team.region` (e.g. "EU", "NA") into
            // the `tier: ScoutingTier` slot, which only accepts
            // "LOCAL" | "REGIONAL" | "INTERNATIONAL". The mismatch silently
            // fell through to the default and produced weaker prospects than
            // intended. Pick a tier based on team prestige so big AI clubs
            // pull stronger talent than tier-2 sides.
            const tier: "LOCAL" | "REGIONAL" | "INTERNATIONAL" =
                team.reputation >= 75 ? "INTERNATIONAL"
                : team.reputation >= 40 ? "REGIONAL"
                : "LOCAL"
            const prospects = generateProspectBatch(1, tier, rng)
            if (prospects.length === 0) return

            const prospect = prospects[0]
            const playerId = `ai_prospect_${team.id}_${save.currentWeek}_${rng.int(1000, 9999)}`
            // Bug fix: previously read `prospect.skill`, `prospect.rifle`, etc.
            // directly. The static import surfaced what the dynamic require
            // hid — the generator nests stats under `prospect.stats`, so every
            // field fell through to the random fallback and AI prospects were
            // effectively all random instead of using the curated generator
            // output.
            const s = prospect.stats
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prospect data composed inline
            const prospectPlayer: any = {
                id: playerId,
                nickname: prospect.nickname || `Rookie_${rng.int(100, 999)}`,
                firstName: prospect.firstName || "Unknown",
                lastName: prospect.lastName || "Player",
                age: prospect.age || 17,
                nationality: prospect.nationality || "Unknown",
                role: prospect.role || "Rifler",
                skill: s?.skill ?? rng.int(30, 55),
                rifle: s?.rifle ?? rng.int(30, 55),
                awp: s?.awp ?? rng.int(20, 45),
                pistol: s?.pistol ?? rng.int(30, 50),
                grenades: s?.grenades ?? rng.int(25, 50),
                creativity: s?.creativity ?? rng.int(25, 50),
                clutch: s?.clutch ?? rng.int(20, 50),
                tactic: s?.tactic ?? rng.int(25, 50),
                leader: s?.leader ?? rng.int(15, 45),
                teamwork: s?.teamwork ?? rng.int(40, 65),
                morale: s?.morale ?? 75,
                amicability: s?.amicability ?? rng.int(40, 70),
                productivity: s?.productivity ?? rng.int(50, 75),
                stressResistance: s?.stressResistance ?? rng.int(30, 55),
                loyalty: rng.int(40, 70),
                reaction: s?.reaction ?? rng.int(35, 60),
                eyesight: rng.int(50, 80),
                health: rng.int(60, 90),
                strength: rng.int(40, 70),
                endurance: rng.int(50, 80),
                fatigue: 0,
                form: 70,
                energy: 100,
                maxEnergy: 100,
                level: 1,
                xp: 0,
                xpToNextLevel: 1000,
                availableSkillPoints: 0,
                talentPoints: 0,
                unlockedTalentIds: [],
                majorWins: 0,
                matchesPlayed: 0,
                totalKills: 0,
                totalDeaths: 0,
                totalMVPs: 0,
                salary: rng.int(500, 2000),
                contractWeeks: 104,
                // Honor the curated potential from the generator when present;
                // fall back to a random 60-90 ceiling for legacy/missing data.
                potential: s?.potential ?? rng.int(60, 90),
            }
            // Commit the prospect AFTER prospect generation has succeeded —
            // the previous flow wrapped the push + penalty inside the same
            // catch as prospect-generation, so a throw from
            // applyRosterChangePenalty would leave the player + roster id
            // committed but the team chemistry penalty unapplied, putting
            // the save in an inconsistent state.
            save.players.push(prospectPlayer)
            team.rosterIds.push(playerId)
        } catch (err) {
            logger.error("[AI] processAcademyScouting failed", err)
            return
        }

        // Apply chemistry penalty outside the catch — if it throws here,
        // we still have a consistent (prospect, roster) pair, and the
        // bubble surfaces the real bug instead of silently swallowing it.
        applyRosterChangePenalty(team, save.currentWeek, 1)
    }

    static processAITeamLogic(save: GameSave, team: TeamSaveData, rng: SeededRNG) {
        // This overlaps with processWeeklyAI. 
        // We can delegate to manageRoster/manageFinances here or keep them separate.
        // For now, let's call our new logic.
        this.manageRoster(team, save)
        this.manageFinances(team, save)
    }

    /**
     * AI-to-AI transfers: AI teams trade players with each other during transfer windows.
     * Max 3 transfers per week to prevent market chaos.
     *
     * Two parallel pools feed `availablePlayers`:
     *   (a) Bench dumps — teams with 6+ roster auto-offer their weakest if
     *       they're below the 55-skill floor. Funnel for replacing dead-weight.
     *   (b) Explicit listings — any AI player with `forSale=true` (set by
     *       listPlayerForTransfer during financial crisis) is offered
     *       regardless of roster size. Previously the forSale flag was set
     *       but never honored by the AI market, so crisis teams had nothing
     *       to actually sell. This fix makes the wage-dump pipeline work
     *       end-to-end.
     */
    static processAIToAITransfers(save: GameSave, playerTeamId: string, rng: SeededRNG): void {
        const MAX_AI_TRANSFERS_PER_WEEK = 3
        let transferCount = 0
        const playerIndex = this.getPlayerIndex(save)

        const availablePlayers: { player: PlayerSaveData; team: TeamSaveData }[] = []
        const offeredIds = new Set<string>()

        for (const team of save.teams) {
            if (team.id === playerTeamId) continue
            const roster = team.rosterIds
                .map(id => playerIndex.get(id))
                .filter((p): p is PlayerSaveData => !!p && !p.isRetired)

            // (a) Bench dump: teams with 6+ healthy players offer their weakest.
            if (roster.length >= 6) {
                const worst = roster.reduce((min, p) => ((p.skill ?? 0) < (min.skill ?? 0) ? p : min), roster[0])
                if (worst && (worst.skill ?? 0) < 55 && !offeredIds.has(worst.id)) {
                    availablePlayers.push({ player: worst, team })
                    offeredIds.add(worst.id)
                }
            }

            // (b) Explicit listings (financial crisis or strategic offload).
            for (const p of roster) {
                if (p.forSale && !offeredIds.has(p.id)) {
                    availablePlayers.push({ player: p, team })
                    offeredIds.add(p.id)
                }
            }
        }

        // Buying teams: AI teams with roster ≤ 5 and budget > 100k
        const buyingTeams = save.teams.filter(t =>
            t.id !== playerTeamId && t.budget > 100_000 && t.rosterIds.length <= 5
        )

        for (const buyer of buyingTeams) {
            if (transferCount >= MAX_AI_TRANSFERS_PER_WEEK) break
            if (rng.next() > 0.05) continue // 5% chance per team per week

            const candidate = availablePlayers
                .filter(ap => ap.team.id !== buyer.id)
                .sort((a, b) => (b.player.skill ?? 0) - (a.player.skill ?? 0))[0]
            if (!candidate) continue

            const fee = (candidate.player.skill ?? 50) * 2000
            const weeklySalary = (candidate.player.skill ?? 50) * 50
            if (buyer.budget < fee + weeklySalary * 26) continue

            // Execute transfer
            candidate.team.rosterIds = candidate.team.rosterIds.filter(id => id !== candidate.player.id)
            // Bug fix: defensive guard against double-add if a buyer somehow
            // already has the player on their roster.
            if (!buyer.rosterIds.includes(candidate.player.id)) {
                buyer.rosterIds.push(candidate.player.id)
            }
            buyer.budget -= fee
            candidate.team.budget += fee
            // Clear listing flags now that the move has settled so the new
            // owner doesn't immediately re-receive a market offer for the
            // same player.
            candidate.player.forSale = false
            candidate.player.transferListingPrice = undefined
            candidate.player.weeksOnTransferList = undefined

            // Bug fix: scope contract removal to the seller — wiping by
            // playerId alone can clobber unrelated historical/ghost contracts.
            const sellerTeamId = candidate.team.id
            save.contracts = save.contracts.filter(c => !(c.playerId === candidate.player.id && c.teamId === sellerTeamId))
            save.contracts.push({
                playerId: candidate.player.id,
                teamId: buyer.id,
                salaryPerWeek: weeklySalary,
                startWeek: save.currentWeek,
                endWeek: save.currentWeek + 52,
                buyout: fee * 2,
            })

            // Transfer record
            if (save.transferHistory) {
                save.transferHistory.push({
                    id: `transfer_ai2ai_${save.currentWeek}_${candidate.player.id}_${buyer.id}`,
                    week: save.currentWeek,
                    type: "TRANSFER",
                    playerId: candidate.player.id,
                    playerName: candidate.player.nickname,
                    fromTeamId: candidate.team.id,
                    fromTeamName: candidate.team.name,
                    toTeamId: buyer.id,
                    toTeamName: buyer.name,
                    fee,
                })
            }

            // News feed
            if (save.newsFeed) {
                save.newsFeed.unshift({
                    id: `news_ai2ai_${save.currentWeek}_${candidate.player.id}`,
                    title: `${candidate.player.nickname} transferred to ${buyer.name}`,
                    content: `${buyer.name} have acquired ${candidate.player.nickname} from ${candidate.team.name} for $${fee.toLocaleString()}.`,
                    category: "TRANSFER",
                    playerId: candidate.player.id,
                    teamId: buyer.id,
                    week: save.currentWeek,
                    engagement: { likes: rng.int(100, 3000), views: rng.int(1000, 15000) }
                })
                if (save.newsFeed.length > 50) save.newsFeed.pop()
            }

            // Remove from available pool so same player isn't sold twice
            const idx = availablePlayers.indexOf(candidate)
            if (idx !== -1) availablePlayers.splice(idx, 1)
            transferCount++
        }
    }

    static processSeasonEnd(save: GameSave) {
        // Retire old AI players (age 33+ with declining stats)
        const playerIndex = this.getPlayerIndex(save)
        for (const team of save.teams) {
            if (team.id === save.playerTeamId) continue // Skip player team

            const retirementCandidates = team.rosterIds
                .map(id => playerIndex.get(id))
                .filter((p): p is PlayerSaveData => !!p && (p.age || 20) >= 33 && (p.skill || 50) < 40)

            for (const player of retirementCandidates) {
                if (team.rosterIds.length <= 5) break // Keep minimum roster
                team.rosterIds = team.rosterIds.filter(id => id !== player.id)
                applyRosterChangePenalty(team, save.currentWeek, 1)
                player.isRetired = true
            }
        }

        // Refresh world rankings at season end
        this.refreshWorldRankings(save)
    }

    static initializeTeamData(save: GameSave) {
        // Initial Rank Refresh to establish world rankings
        this.refreshWorldRankings(save)

        // Only force-assign divisions if we are in week 1 (starting state)
        // or if they are missing entirely
        const isInitialWeek = save.currentWeek === 1

        save.teams.forEach(team => {
            // Initialize Elo (Phase 19)
            if (team.elo === undefined) team.elo = 1000

            // Initialize Division based on world ranking (Ladder Divisions S/A/B)
            // S_TIER: 1-10, A_TIER: 11-40, B_TIER: 41+
            if (isInitialWeek || !team.leagueTier) {
                if ((team.worldRanking || 999) <= 10) {
                    team.leagueTier = "S_TIER"
                } else if ((team.worldRanking || 999) <= 40) {
                    team.leagueTier = "A_TIER"
                } else {
                    team.leagueTier = "B_TIER"
                }
            }
        })
    }
}
