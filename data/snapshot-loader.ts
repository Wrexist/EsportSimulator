/**
 * Snapshot Data Loader
 * Phase 6: Load immutable snapshot and copy to save
 * 
 * LOADING RULES:
 * - Snapshot is NEVER mutated
 * - New career COPIES snapshot data to save format
 * - Portraits resolved from local assets only
 */

import {
    Snapshot,
    SnapshotPlayer,
    SnapshotTeam,
    SnapshotTournament,
    validateSnapshot,
} from "./snapshot-types"
import {
    GameSave,
    PlayerSaveData,
    TeamSaveData,
    ContractSaveData,
    TournamentSaveData,
    MatchSaveData,
    CURRENT_SAVE_VERSION,
} from "@/engine/save-types"
import { FOUNDING_LEGENDS } from "@/engine/hall-of-fame-data"
import { LEGENDARY_PLAYERS } from "@/engine/legendary-players-data"
import { SeededRNG, generateSeed } from "@/engine/rng"
import { PlayerRole, PlayerTier, TournamentTier, TournamentFormat, MatchFormat } from "@/types"

import { reconcileTeamRoles } from "@/engine/role-reconciler"

/**
 * Auto-calculate an initial prestige score for players with empty hltvHistory.
 * Uses team tier, team reputation, player experience (matches), and age.
 */
export function calculateInitialPrestige(
    playerTier: string,
    teamTier: string | undefined,
    teamReputation: number | undefined,
    matchesPlayed: number,
    age: number
): number {
    // Base prestige from team tier
    let base = 0
    const rep = teamReputation || 0
    // Normalize reputation to 0-1 (reputation is 0-100 scale)
    const repNorm = Math.max(0, Math.min(1, rep / 100))

    switch (teamTier) {
        case "ELITE":
            base = 60 + Math.round(repNorm * 30) // 60-90
            break
        case "PRO":
            base = 30 + Math.round(repNorm * 30) // 30-60
            break
        case "SEMI_PRO":
            base = 10 + Math.round(repNorm * 20) // 10-30
            break
        case "ACADEMY":
        default:
            base = Math.round(repNorm * 15) // 0-15
            break
    }

    // Experience modifier: +0 to +10 based on matches played (200+ = full bonus)
    const expBonus = Math.min(10, Math.round((matchesPlayed / 200) * 10))

    // Veteran bonus: +5 for players aged 28+ (reflects career longevity)
    const vetBonus = age >= 28 ? 5 : 0

    // Also consider the player's own tier as a small modifier
    let playerTierBonus = 0
    switch (playerTier) {
        case "ELITE": playerTierBonus = 5; break
        case "PRO": playerTierBonus = 2; break
        default: playerTierBonus = 0; break
    }

    return Math.min(100, Math.max(0, base + expBonus + vetBonus + playerTierBonus))
}

/**
 * Normalize a nickname for matching: lowercase + leet-speak → letters
 * e.g. "dev1ce" → "device", "s1mple" → "simple", "FalleN" → "fallen"
 */
function normalizeNickname(nick: string): string {
    return nick
        .toLowerCase()
        .replace(/1/g, "i")
        .replace(/3/g, "e")
        .replace(/0/g, "o")
        .replace(/4/g, "a")
        .replace(/5/g, "s")
        .replace(/7/g, "t")
}

/**
 * Check if a legendary player has an active counterpart in the snapshot.
 * Matches on normalized nicknames to catch leet-speak variants (dev1ce ↔ device).
 */
function isLegendActiveInSnapshot(
    legend: PlayerSaveData,
    activeNicknames: Set<string>
): boolean {
    const nick = legend.nickname.toLowerCase()
    if (activeNicknames.has(nick)) return true
    const normalized = normalizeNickname(legend.nickname)
    if (activeNicknames.has(normalized)) return true
    return false
}

// ===== SNAPSHOT LOADER =====

export class SnapshotLoader {
    private snapshot: Snapshot | null = null
    private snapshotPath: string

    constructor(snapshotPath: string = "/data/snapshot") {
        this.snapshotPath = snapshotPath
    }

    /**
     * Load snapshot from JSON files
     * Snapshot is immutable once loaded
     */
    async loadSnapshot(): Promise<{ success: boolean; error?: string }> {
        try {
            // Load all JSON files
            const t = Date.now()
            const cacheSuffix = typeof window !== "undefined" ? `?v=${t}` : ""
            const [players, teams, tournaments, sources] = await Promise.all([
                this.loadJson<SnapshotPlayer[]>(`${this.snapshotPath}/players.json${cacheSuffix}`),
                this.loadJson<SnapshotTeam[]>(`${this.snapshotPath}/teams.json${cacheSuffix}`),
                this.loadJson<SnapshotTournament[]>(`${this.snapshotPath}/tournaments.json${cacheSuffix}`),
                this.loadJson<any[]>(`${this.snapshotPath}/sources.json${cacheSuffix}`),
            ])

            const snapshot: Snapshot = {
                version: "1.0.0",
                createdAt: new Date().toISOString(),
                description: "CS2 Pro Scene Snapshot",
                players,
                teams,
                tournaments,
                sources,
            }

            // Validate structure
            if (!validateSnapshot(snapshot)) {
                return { success: false, error: "Invalid snapshot structure" }
            }

            // Freeze to ensure immutability
            this.snapshot = Object.freeze(snapshot) as Snapshot

            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to load snapshot",
            }
        }
    }

    /**
     * Get loaded snapshot (immutable reference)
     */
    getSnapshot(): Readonly<Snapshot> | null {
        return this.snapshot
    }

    /**
     * Create new career save from snapshot
     * COPIES data - never mutates snapshot
     */
    createCareerFromSnapshot(
        saveName: string,
        playerTeamId: string,
        startWeek: number = 1
    ): GameSave | null {
        if (!this.snapshot) return null

        const creationSeed = generateSeed()
        const creationRng = new SeededRNG(creationSeed)
        const saveId = `save_${Date.now()}_${creationSeed.toString(36)}_${Math.floor(creationRng.next() * 1_000_000_000).toString(36)}`
        const now = new Date().toISOString()

        // Build player-to-team lookup for prestige calculation
        const playerTeamMap = new Map<string, SnapshotTeam>()
        for (const team of this.snapshot.teams) {
            for (const playerId of team.rosterIds) {
                playerTeamMap.set(playerId, team)
            }
        }

        // COPY players from snapshot (add dynamic fields)
        const players: PlayerSaveData[] = this.snapshot.players.map(sp =>
            this.snapshotPlayerToSavePlayer(sp, creationRng, playerTeamMap.get(sp.id))
        )

        // COPY teams from snapshot
        const teams: TeamSaveData[] = this.snapshot.teams.map(st =>
            this.snapshotTeamToSaveTeam(st, creationRng)
        )

        // Generate contracts from snapshot defaults
        const contracts: ContractSaveData[] = this.generateContracts(
            this.snapshot.players,
            this.snapshot.teams,
            startWeek,
            creationRng
        )

        // Runtime tournament lifecycle comes from data/tournaments.json seasonal instances.
        // Snapshot remains player/team bootstrap only.
        const tournaments: TournamentSaveData[] = []
        const scheduledMatches: MatchSaveData[] = []

        // Build a set of active player nicknames (both raw lowercase and normalized)
        // to detect legends who are already on active rosters
        const activeNicknames = new Set<string>()
        for (const p of players) {
            activeNicknames.add(p.nickname.toLowerCase())
            activeNicknames.add(normalizeNickname(p.nickname))
        }

        // Filter out legends that have an active counterpart in the snapshot
        // They'll still appear in the Hall of Fame, but won't exist as
        // duplicate retired players and can't be picked as Major rewards
        const availableLegends = LEGENDARY_PLAYERS.filter(
            lp => !isLegendActiveInSnapshot(lp, activeNicknames)
        )
        const excludedLegendIds = LEGENDARY_PLAYERS
            .filter(lp => isLegendActiveInSnapshot(lp, activeNicknames))
            .map(lp => lp.id)

        const save: GameSave = {
            saveVersion: CURRENT_SAVE_VERSION,
            saveId,
            saveName,
            createdAt: now,
            updatedAt: now,

            currentWeek: startWeek,
            currentDay: 0,
            timeMode: "HYBRID_DAILY",
            gameStartDate: now,

            // Manager Career
            playerTeamId,
            managerDetails: {
                name: saveName,
                level: 1,
                xp: 0,
                reputation: 0,
                careerWins: 0,
                careerLosses: 0,
                championships: 0
            },

            teams,
            players: [...players, ...availableLegends],
            contracts,
            tournaments,

            scheduledMatches,
            completedMatches: [],
            scheduledActivities: [],

            staff: [],
            financeLedger: [],
            eventsLog: [],
            acknowledgedEventIds: [],

            // Phase 23: Hall of Fame with Founding Legends
            hallOfFame: [...FOUNDING_LEGENDS],
            legendaryPlayers: [],

            // Legends with active counterparts can't be picked as Major rewards
            signedLegendIds: [...excludedLegendIds],
            activelyPlayingLegendIds: [...excludedLegendIds],

            // Phase 9: Scouting System
            scoutedPlayers: [],
            activeScoutingMission: undefined,

            lastRngSeed: creationRng.getState(),
            weekTickState: null,

            // Phase 20: Tournament System
            circuitPoints: [...teams]
                .sort((a, b) => b.elo - a.elo)
                .map((team, idx) => ({
                    teamId: team.id,
                    points: Math.max(0, 2000 - idx * 80),
                    results: []
                })),
            tournamentQualifications: [],

            // Transfer History System
            transferHistory: [],
            marketStaff: [],
            newsFeed: [],

            // Phase 70: Youth Academy
            academyPlayers: [],
            academyMatchHistory: [],
            academyRoster: { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null },
            academyTrainingSchedule: {},
            academyWeeklyReports: [],
            academyScoutingMissions: [],
            academyPendingProspects: []
        }

        // Phase 10: Role Refinement (Team-Based)
        // Ensure every team has a balanced set of roles based on stats
        teams.forEach(team => {
            const roster = players.filter(p => team.rosterIds.includes(p.id))
            reconcileTeamRoles(roster)
        })

        return save
    }

    // ===== CONVERSION HELPERS =====

    /**
     * Convert snapshot player to save player (adds dynamic fields)
     */
    private snapshotPlayerToSavePlayer(sp: SnapshotPlayer, rng: SeededRNG, team?: SnapshotTeam): PlayerSaveData {
        const hltvHistory = (sp as any).hltvHistory || []
        const matchesPlayed = (sp as any).matchesPlayed || 0

        // Use snapshot's prestigeScore if available, otherwise auto-calculate
        const prestigeScore = (sp as any).prestigeScore
            ?? ((hltvHistory.length > 0)
                ? 0  // Will be calculated by prestige-system from history
                : calculateInitialPrestige(
                    sp.tier,
                    team?.tier,
                    team?.reputation,
                    matchesPlayed,
                    sp.age
                ))

        return {
            // Copy all static fields
            id: sp.id,
            name: sp.name,
            nickname: sp.nickname,
            age: sp.age,
            nationality: sp.nationality,
            portraitPath: sp.portraitPath,
            role: sp.role,
            tier: sp.tier,

            // Stats
            skill: sp.skill,
            awp: sp.awp,
            rifle: sp.rifle,
            pistol: sp.pistol,
            grenades: sp.grenades,
            creativity: sp.creativity,
            clutch: sp.clutch,
            tactic: sp.tactic,
            leader: sp.leader,
            teamwork: sp.teamwork,
            amicability: sp.amicability,
            productivity: sp.productivity,
            stressResistance: sp.stressResistance,
            loyalty: sp.loyalty,
            reaction: sp.reaction,
            eyesight: sp.eyesight,
            health: sp.health,
            strength: sp.strength,
            endurance: sp.endurance,

            // Dynamic fields - INITIALIZED (not from snapshot)
            form: rng.int(70, 89), // 70-89
            fatigue: rng.int(0, 19), // 0-19
            morale: rng.int(70, 89), // 70-89
            energy: 100,
            maxEnergy: 100,
            level: 1,
            xp: 0,
            xpToNextLevel: 1000,
            talentPoints: 0,
            unlockedTalentIds: [],
            potential: sp.potential,

            // Career stats - Copy from snapshot if available (for known pros)
            matchesPlayed,
            roundsPlayed: (sp as any).roundsPlayed || 0,
            avgRating: (sp as any).avgRating || 0,
            clutchSuccessRate: (sp as any).clutchSuccessRate || 0,

            // HLTV Prestige data - Copy from snapshot
            hltvHistory,
            majorWins: (sp as any).majorWins || 0,
            totalMVPs: (sp as any).totalMVPs || 0,
            prestigeScore,

            // Transfer History
            careerHistory: []
        }
    }

    /**
     * Convert snapshot team to save team
     */
    private snapshotTeamToSaveTeam(st: SnapshotTeam, rng: SeededRNG): TeamSaveData {
        return {
            id: st.id,
            name: st.name,
            tier: st.tier,
            region: st.region,
            rosterIds: [...st.rosterIds], // Copy array
            staffIds: [],
            reputation: st.reputation,
            fanbase: st.fanbase,
            chemistry: 70, // Default chemistry
            facilitiesLevel: st.facilitiesLevel,
            budget: st.startingBudget,

            // Phase 55: Training Limits
            trainingSlotsUsed: 0,
            maxTrainingSlots: 3,

            // Phase 19: Calculate Elo from reputation (higher rep = higher starting Elo)
            // Range: 800 (low rep) to 1600 (top rep). Reputation is 0-100 scale.
            elo: Math.max(800, Math.min(1600, 1000 + Math.round((st.reputation || 0) * 6))),
            leagueTier: st.tier === "ELITE" ? "S_TIER" : st.tier === "PRO" ? "A_TIER" : "B_TIER",
            logoPath: st.logoPath,

            // Phase 24: Fan & Merch
            followers: st.fanbase * (5 + rng.int(0, 4)),
            merchStoreLevel: 1,
            activeMerchItems: ["JERSEY"],
            description: `${st.name} is a professional esports organization competing in the ${st.region || 'Global'} region. Pursuing excellence since inception.`,

            // Phase 18/20/21 Fields
            sponsors: [],
            facilities: [],
            merchHype: 10,
            playstyle: "default",
            tacticalPrep: 0,
            youthAcademyIds: []
        }
    }

    // ===== DYNAMIC CONTRACT LOGIC =====

    private calculateDynamicContract(player: SnapshotPlayer, rng: SeededRNG): { salary: number, years: number, buyout: number } {
        // AI Valuation Model
        // Base salary curve: Exponential growth with rating
        // Formula: Base * (Rating/100)^Exp

        let rating = player.skill // Approximate OVR with skill for now
        // If we want true OVR we'd need the weighted formula, but skill is a good proxy for snapshot
        // Actually, let's roughly calc OVR
        rating = (player.skill * 0.4) + (((player.awp + player.rifle) / 2) || player.skill) * 0.2 + (player.tactic || player.skill) * 0.2 + (player.teamwork || 50) * 0.2

        let baseSalary = 500
        if (player.tier === PlayerTier.ELITE) baseSalary = 15000
        else if (player.tier === PlayerTier.PRO) baseSalary = 5000
        else if (player.tier === PlayerTier.SEMI_PRO) baseSalary = 1500
        else baseSalary = 300

        // Tier multipliers
        const tierMult =
            player.tier === PlayerTier.ELITE ? 4.0 :
                player.tier === PlayerTier.PRO ? 2.5 :
                    player.tier === PlayerTier.SEMI_PRO ? 1.5 : 1.0

        // Performance Multiplier (Rating on 0-100 scale)
        // rating/100 keeps factor <= 1.0, combined with baseSalary*tierMult for final salary
        const ratingFactor = Math.pow(rating / 100, 3)

        let salary = Math.round(baseSalary * ratingFactor * tierMult)

        // Cap/Floor adjustments
        if (salary < 250) salary = 250

        // Random variation (+/- 10%)
        salary = Math.floor(salary * rng.range(0.9, 1.1))

        // Round to nearest 50
        salary = Math.round(salary / 50) * 50

        // Contract Length (Age dependent)
        let years = player.defaultContractYears || 1
        if (player.age < 20) years = 3 // Lock in young talent
        else if (player.age > 30) years = 1 // Short deals for vets
        else years = 2 + (rng.bool(0.5) ? 1 : 0)

        return {
            salary,
            years,
            buyout: salary * 52 * (years * 0.5) // Buyout is roughly half total remaining value usually, or higher? Real sports is higher. Let's say 1.5x annual salary.
        }
    }

    /**
     * Generate contracts from snapshot defaults
     */
    private generateContracts(
        players: SnapshotPlayer[],
        teams: SnapshotTeam[],
        startWeek: number,
        rng: SeededRNG
    ): ContractSaveData[] {
        const contracts: ContractSaveData[] = []

        teams.forEach(team => {
            team.rosterIds.forEach(playerId => {
                const player = players.find(p => p.id === playerId)
                if (!player) return

                const contract = this.calculateDynamicContract(player, rng)

                contracts.push({
                    playerId: player.id,
                    teamId: team.id,
                    salaryPerWeek: contract.salary,
                    startWeek: startWeek,
                    endWeek: startWeek + (contract.years * 52),
                    buyout: contract.buyout, // Use calculated buyout from contract formula
                })
            })
        })

        return contracts
    }

    /**
     * Convert snapshot tournament to save tournament
     */
    private snapshotTournamentToSaveTournament(
        st: SnapshotTournament,
        teams: TeamSaveData[],
        startWeek: number
    ): TournamentSaveData {
        // Filter eligible teams
        let eligibleTeams = teams

        if (st.minTeamTier) {
            const tierOrder = [PlayerTier.ELITE, PlayerTier.PRO, PlayerTier.SEMI_PRO, PlayerTier.ACADEMY]
            const minIndex = tierOrder.indexOf(st.minTeamTier)
            eligibleTeams = teams.filter(t => {
                const teamIndex = tierOrder.indexOf(t.tier as PlayerTier)
                return teamIndex <= minIndex
            })
        }

        if (st.invitedTeamIds) {
            eligibleTeams = teams.filter(t => st.invitedTeamIds!.includes(t.id))
        }

        const maxTeams = st.maxTeams ?? st.slots ?? 16

        // Limit to max teams
        const participatingTeams = eligibleTeams.slice(0, maxTeams)

        // Generate initial standings
        const standings = participatingTeams.map(team => ({
            teamId: team.id,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            mapsWon: 0,
            mapsLost: 0,
            points: 0,
            mapDiff: 0,
            roundDiff: 0,
        }))

        return {
            id: st.id,
            name: st.name,
            shortName: st.shortName || st.name,
            tier: st.tier,
            region: st.region,
            format: st.format,
            prizePool: st.prizePool,
            teamIds: participatingTeams.map(t => t.id),
            currentStage: "Group Stage",
            standings,
            startWeek: startWeek + st.startWeek - 1,
            duration: st.duration,
            endWeek: startWeek + st.startWeek + st.duration - 1,
        }
    }

    /**
     * Generate initial match schedule
     */
    private generateInitialSchedule(
        tournaments: TournamentSaveData[],
        startWeek: number
    ): MatchSaveData[] {
        const matches: MatchSaveData[] = []
        let matchId = 1

        tournaments.forEach(tournament => {
            if (tournament.format === TournamentFormat.LEAGUE) {
                // Round-robin schedule
                const teams = tournament.teamIds
                for (let i = 0; i < teams.length; i++) {
                    for (let j = i + 1; j < teams.length; j++) {
                        const week = tournament.startWeek + Math.floor((i + j) % tournament.standings.length)

                        matches.push({
                            id: `match_${matchId++}`,
                            homeTeamId: teams[i],
                            awayTeamId: teams[j],
                            tournamentId: tournament.id,
                            stage: "Group Stage",
                            week,
                            format: MatchFormat.BO3,
                            seed: generateSeed(),
                        })
                    }
                }
            }
        })

        return matches
    }

    // ===== UTILITIES =====

    private async loadJson<T>(path: string): Promise<T> {
        // In browser: fetch from public folder
        // In Node: read from file system
        if (typeof window !== "undefined") {
            const response = await fetch(path)
            if (!response.ok) {
                throw new Error(`Failed to load ${path}: ${response.statusText}`)
            }
            return response.json()
        } else {
            // Node.js fallback
            const fs = await import("fs/promises")
            // Strip cache-busting query params when reading from filesystem.
            const filePath = path.split("?")[0]
            const data = await fs.readFile(filePath, "utf-8")
            return JSON.parse(data)
        }
    }
}

export const snapshotLoader = new SnapshotLoader()
