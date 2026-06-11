import {
    GameSave,
    TeamSaveData,
    PlayerSaveData,
} from "./save-types"
import { reconcileTeamRoles } from "./role-reconciler"
import { PlayerRole } from "../types" // Adjust import path if needed
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
import {
    scoreSigningCandidate as scoreSigningCandidateFn,
    signFreeAgent as signFreeAgentFn,
    releaseWorstPlayer as releaseWorstPlayerFn,
    manageRoster as manageRosterFn,
} from "./ai/roster-management"
import {
    listPlayerForTransfer as listPlayerForTransferFn,
    processAITransferMarket as processAITransferMarketFn,
    processAIToAITransfers as processAIToAITransfersFn,
} from "./ai/transfer-market"
import { logger } from "@/lib/logger"
import { recalculateTeamSynergy } from "./processors/team-synergy-recalc"

/**
 * AI Manager
 * Phase 7: The Intelligent Opponent
 * 
 * Logic for non-player teams to manage rosters and finances.
 */
export class AIManager {
    private static fallbackRng = new SeededRNG(generateSeed())

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
    // Roster management implementation extracted to
    // engine/ai/roster-management.ts (Phase K3). Facades preserved
    // so internal AIManager callers don't need to change.
    private static scoreSigningCandidate(
        player: PlayerSaveData,
        weeklySalary: number,
        missingRoles: Set<string>
    ): number {
        return scoreSigningCandidateFn(player, weeklySalary, missingRoles)
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
        manageRosterFn(team, save)
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
        signFreeAgentFn(team, save)
    }

    private static releaseWorstPlayer(team: TeamSaveData, save: GameSave) {
        releaseWorstPlayerFn(team, save)
    }

    // Transfer-market implementations extracted to engine/ai/transfer-market.ts
    // (Phase K4). Facades preserved — public processAIToAITransfers is the
    // external API surface (called by ai-world-processor).
    private static listPlayerForTransfer(team: TeamSaveData, save: GameSave) {
        listPlayerForTransferFn(team, save)
    }

    /**
     * AI Teams making offers for User Players
     */
    private static processAITransferMarket(save: GameSave, playerTeamId: string, rng?: SeededRNG) {
        processAITransferMarketFn(save, playerTeamId, rng)
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
        // Never auto-manage the player's team — the ai-world-processor loops over
        // ALL teams, and without this guard the player would silently gain an
        // un-consented (and contract-less) prospect on their roster. Mirrors the
        // player-team exclusion every other AI routine already applies.
        if (team.id === save.playerTeamId) return
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
        processAIToAITransfersFn(save, playerTeamId, rng)
    }

    static processSeasonEnd(save: GameSave) {
        // Retire old AI players (age 33+ with declining stats)
        const playerIndex = this.getPlayerIndex(save)
        for (const team of save.teams) {
            if (team.id === save.playerTeamId) continue // Skip player team

            const retirementCandidates = team.rosterIds
                .map(id => playerIndex.get(id))
                .filter((p): p is PlayerSaveData => !!p && (p.age || 20) >= 33 && (p.skill || 50) < 40)

            let teamRetired = false
            for (const player of retirementCandidates) {
                if (team.rosterIds.length <= 5) break // Keep minimum roster
                team.rosterIds = team.rosterIds.filter(id => id !== player.id)
                applyRosterChangePenalty(team, save.currentWeek, 1)
                player.isRetired = true
                teamRetired = true
            }
            // Every other roster-mutation path (transfers, academy promotion)
            // recalculates synergy; retirement must too or the matrix goes stale.
            if (teamRetired) recalculateTeamSynergy(team, save.players)
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
