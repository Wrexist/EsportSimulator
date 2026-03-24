import {
    MatchResult,
    RoundResult,
    MapResult,
    Match,
    calculatePlayerRating
} from "@/types/match"
import { MatchFormat, MapId, PlayerRole } from "@/types/enums"
import { ACTIVE_MAP_POOL } from "@/data/map-pool"
import { Player, PlayerMatchStats } from "@/types/player"
import { Team, Coach } from "@/types/team"
import { PlayerTier, StaffType } from "@/types/enums"
import { TeamSaveData, PlayerSaveData, MatchSaveData } from "@/engine/save-types"
import { SeededRNG } from "@/engine/rng"
import { EconomyManager } from "@/engine/economy-manager"
import { SimulationEngineV2 } from "./match-simulation"

// ===== ADAPTERS: Save types → Frontend types for SimulationEngineV2 delegation =====

function adaptTeamSaveToTeam(team: TeamSaveData): Team {
    return {
        id: team.id,
        name: team.name,
        tier: (team.tier as PlayerTier) || PlayerTier.PRO,
        logoPath: team.logoPath || '',
        roster: team.rosterIds || [],
        staff: [],
        reputation: team.reputation ?? 50,
        fanbase: team.followers ?? 0,
        chemistry: team.chemistry ?? 50,
        facilitiesLevel: team.facilitiesLevel ?? 1,
        trainingSlotsUsed: team.trainingSlotsUsed ?? 0,
        maxTrainingSlots: 10,
        budget: team.budget ?? 0,
        playstyle: team.playstyle,
        tacticalPrep: team.tacticalPrep ?? 0,
        economyStyle: team.economyStyle,
        equipment: team.equipment || [],
    } as Team
}

function adaptPlayerSaveToPlayer(p: PlayerSaveData): Player {
    return {
        id: p.id,
        name: p.name || p.nickname || 'Unknown',
        nickname: p.nickname || 'Unknown',
        age: p.age ?? 25,
        nationality: p.nationality || '',
        portraitPath: p.portraitPath || '',
        firstName: (p.name || '').split(' ')[0] || undefined,
        lastName: (p.name || '').split(' ').slice(1).join(' ') || undefined,
        role: (p.role as PlayerRole) || PlayerRole.RIFLER,
        secondaryRole: p.secondaryRole as PlayerRole | undefined,
        tier: (p.tier as PlayerTier) || PlayerTier.PRO,
        // Technical stats
        skill: p.skill ?? 50,
        awp: p.awp ?? 50,
        rifle: p.rifle ?? 50,
        pistol: p.pistol ?? 50,
        grenades: p.grenades ?? 50,
        creativity: p.creativity ?? 50,
        clutch: p.clutch ?? 50,
        tactic: p.tactic ?? 50,
        entry: 50,
        trading: 50,
        // Mental stats
        leader: p.leader ?? 50,
        teamwork: p.teamwork ?? 50,
        morale: p.morale ?? 70,
        amicability: p.amicability ?? 50,
        productivity: p.productivity ?? 50,
        stressResistance: p.stressResistance ?? 50,
        loyalty: p.loyalty ?? 50,
        // Physical stats
        reaction: p.reaction ?? 50,
        eyesight: p.eyesight ?? 50,
        health: p.health ?? 100,
        strength: p.strength ?? 50,
        endurance: p.endurance ?? 50,
        // Dynamic
        form: p.form ?? 50,
        fatigue: p.fatigue ?? 0,
        potential: p.potential ?? 60,
        energy: p.energy ?? 100,
        maxEnergy: 100,
        // Career
        matchesPlayed: p.matchesPlayed ?? 0,
        roundsPlayed: p.roundsPlayed ?? 0,
        avgRating: p.avgRating ?? 1.0,
        clutchSuccessRate: 0,
        // Contract (minimal for sim)
        contract: {
            playerId: p.id,
            salaryPerWeek: 0,
            startWeek: 0,
            endWeek: 52,
            buyout: 0,
        },
        // Weapon mastery — normalize SaveData format (number | object) to Player format (number only)
        weaponMastery: p.weaponMastery
            ? Object.fromEntries(
                Object.entries(p.weaponMastery).map(([k, v]) => [
                    k,
                    typeof v === 'number' ? v : v.xp,
                ])
            )
            : undefined,
        // Traits
        traits: p.traits || [],
        perks: p.perks || [],
        level: p.level,
        xp: p.xp,
        xpToNextLevel: p.xpToNextLevel,
        talentPoints: p.talentPoints,
        unlockedTalentIds: p.unlockedTalentIds,
        totalMVPs: p.totalMVPs,
    }
}

// Singleton instance for delegation
const simEngineV2 = new SimulationEngineV2()

/** Map-specific CT-side advantage multiplier */
const MAP_CT_BIAS: Record<string, number> = {
    [MapId.NUKE]: 1.15,
    [MapId.OVERPASS]: 1.12,
    [MapId.MIRAGE]: 1.08,
    [MapId.INFERNO]: 1.08,
    [MapId.VERTIGO]: 1.05,
    [MapId.ANCIENT]: 0.98,
    [MapId.ANUBIS]: 0.98,
    [MapId.DUST2]: 1.02,
}

/** Convert average team cash to a buy power factor (0-1) */
function getBuyPower(avgCash: number): number {
    const strategy = EconomyManager.getTeamStrategy(avgCash)
    switch (strategy) {
        case "PISTOL": return 0.50
        case "ECO": return 0.55
        case "FORCE": return 0.72
        case "SEMIBUY": return 0.85
        case "FULL": return 1.0
        default: return 1.0
    }
}

/**
 * Match Engine Phase 5
 * fully deterministic, round-by-round simulation
 */
export class MatchEngine {

    /**
     * Simulates a full match between two teams
     * @param match - The match context (format, id, etc)
     * @param homeTeam - Home team data
     * @param awayTeam - Away team data
     * @param homePlayers - Array of home team players
     * @param awayPlayers - Array of away team players
     * @param rng - Seeded RNG for deterministic results
     */
    public simulateMatch(
        match: MatchSaveData,
        homeTeam: TeamSaveData,
        awayTeam: TeamSaveData,
        homePlayers: PlayerSaveData[],
        awayPlayers: PlayerSaveData[],
        rng: SeededRNG,
        homeTacticalBonus: number = 0,
        awayTacticalBonus: number = 0
    ): MatchResult {
      try {
        // Delegate to SimulationEngineV2 for rich simulation (weapon tracking, economy, momentum)
        const adaptedHome = adaptTeamSaveToTeam(homeTeam)
        const adaptedAway = adaptTeamSaveToTeam(awayTeam)
        const adaptedHomePlayers = homePlayers.map(adaptPlayerSaveToPlayer)
        const adaptedAwayPlayers = awayPlayers.map(adaptPlayerSaveToPlayer)

        // Consume one RNG value to derive seed (keeps global RNG deterministic)
        const derivedSeed = Math.floor(rng.next() * 2147483646) || 1

        // Build a Match object compatible with SimulationEngineV2
        const matchObj = {
            id: match.id,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            format: match.format as MatchFormat,
            seed: derivedSeed,
            date: new Date(),
            mapVeto: [],
            vetoComplete: false,
            maps: [] as MapId[],
            mapResults: [],
            roundHistory: [],
            tournamentId: match.tournamentId,
            stage: match.stage ?? undefined,
            isHighPressure: match.isHighPressure ?? false,
            mentalPrep: match.mentalPrep ?? false,
        } as Match

        // Convert tactical bonuses to staff objects
        const makeCoach = (bonus: number): Coach => ({
            id: 'ai_coach', name: 'Coach', type: StaffType.COACH,
            level: Math.ceil(bonus * 5), salary: 0, contractWeeksRemaining: 52,
            tacticBonus: Math.ceil(bonus * 10), moraleStability: 0.2,
        })

        const homeStaff = homeTacticalBonus > 0 ? { coach: makeCoach(homeTacticalBonus) } : undefined
        const awayStaff = awayTacticalBonus > 0 ? { coach: makeCoach(awayTacticalBonus) } : undefined

        return simEngineV2.simulateMatch(
            matchObj,
            adaptedHome,
            adaptedAway,
            adaptedHomePlayers,
            adaptedAwayPlayers,
            homeStaff,
            awayStaff
        )
      } catch (error) {
        console.error('[MatchEngine] simulateMatch failed:', error, { matchId: match.id, homeTeam: homeTeam.id, awayTeam: awayTeam.id })
        throw error
      }
    }

    /**
     * Simulates a single map round-by-round
     */
    private simulateMap(
        mapId: MapId,
        team1: TeamSaveData,
        team2: TeamSaveData,
        players1: PlayerSaveData[],
        players2: PlayerSaveData[],
        matchStats: Record<string, PlayerMatchStats>,
        rng: SeededRNG,
        bonus1: number,
        bonus2: number
    ): MapResult {
        const rounds: RoundResult[] = []
        let team1Score = 0
        let team2Score = 0

        // MR12 Format (13 to win)
        const MAX_ROUNDS = 24
        const WIN_THRESHOLD = 13

        // Economy tracking
        let team1Cash = EconomyManager.ROUND_START_CASH
        let team2Cash = EconomyManager.ROUND_START_CASH
        let team1LossStreak = 0
        let team2LossStreak = 0

        // Map-specific CT bias
        const mapBias = MAP_CT_BIAS[mapId] ?? 1.08

        // Determine Sides (Random knife round logic implied)
        // Team1 starts CT, Team2 starts T (simplified)
        let currentCtId = team1.id
        let currentTId = team2.id

        // Loop rounds
        let roundNum = 1
        while (team1Score < WIN_THRESHOLD && team2Score < WIN_THRESHOLD && roundNum <= MAX_ROUNDS) {

            // Half-time switch + economy reset (pistol round)
            if (roundNum === 13) {
                const temp = currentCtId
                currentCtId = currentTId
                currentTId = temp
                team1Cash = EconomyManager.ROUND_START_CASH
                team2Cash = EconomyManager.ROUND_START_CASH
                team1LossStreak = 0
                team2LossStreak = 0
            }

            const isTeam1CT = currentCtId === team1.id
            const ctPlayers = isTeam1CT ? players1 : players2
            const tPlayers = isTeam1CT ? players2 : players1
            const ctTeam = isTeam1CT ? team1 : team2
            const tTeam = isTeam1CT ? team2 : team1

            // Calculate buy power from economy
            const ctBuyPower = getBuyPower(isTeam1CT ? team1Cash : team2Cash)
            const tBuyPower = getBuyPower(isTeam1CT ? team2Cash : team1Cash)

            const roundResult = this.simulateRound(
                roundNum,
                ctTeam,
                tTeam,
                ctPlayers,
                tPlayers,
                matchStats,
                rng,
                isTeam1CT ? bonus1 : bonus2,
                isTeam1CT ? bonus2 : bonus1,
                ctBuyPower,
                tBuyPower,
                mapBias
            )

            rounds.push(roundResult)

            // Update economy after round
            const team1Won = roundResult.winningTeamId === team1.id
            if (team1Won) {
                team1Score++
                team1Cash = Math.min(EconomyManager.MAX_CASH, team1Cash + EconomyManager.getWinBonus(roundResult.winType))
                team1LossStreak = 0
                team2LossStreak++
                team2Cash = Math.min(EconomyManager.MAX_CASH, team2Cash + EconomyManager.getLossBonus(team2LossStreak - 1))
            } else {
                team2Score++
                team2Cash = Math.min(EconomyManager.MAX_CASH, team2Cash + EconomyManager.getWinBonus(roundResult.winType))
                team2LossStreak = 0
                team1LossStreak++
                team1Cash = Math.min(EconomyManager.MAX_CASH, team1Cash + EconomyManager.getLossBonus(team1LossStreak - 1))
            }

            roundNum++
        }

        // Handle Overtime (MR3)
        if (team1Score === 12 && team2Score === 12) {
            let otNumber = 1
            while (team1Score === team2Score) {
                const otResult = this.simulateOvertime(
                    otNumber,
                    team1Score,
                    team2Score,
                    team1,
                    team2,
                    players1,
                    players2,
                    matchStats,
                    rng,
                    bonus1,
                    bonus2
                )
                team1Score = otResult.team1Score
                team2Score = otResult.team2Score
                rounds.push(...otResult.rounds)
                otNumber++

                // Safety break to prevent infinite OT (max 10 OTs)
                if (otNumber > 10) {
                    if (rng.next() > 0.5) team1Score++
                    else team2Score++
                    break
                }
            }
        }

        // Determine Map MVP (best rating across ALL players, not just winners)
        const allPlayers = [...players1, ...players2]

        let bestMapRating = -1
        let mapMvpId = allPlayers.length > 0 ? allPlayers[0].id : ""

        allPlayers.forEach(p => {
            const pStats = matchStats[p.id]
            if (pStats) {
                const r = calculatePlayerRating(pStats)
                if (r > bestMapRating) {
                    bestMapRating = r
                    mapMvpId = p.id
                }
            }
        })

        return {
            map: mapId,
            ctStartTeamId: team1.id,
            tStartTeamId: team2.id,
            rounds,
            finalScore: { team1: team1Score, team2: team2Score },
            mvpPlayerId: mapMvpId
        }
    }

    /**
     * Simulates MR3 Overtime (6 rounds total, 3 per half)
     */
    private simulateOvertime(
        otNumber: number,
        startScore1: number,
        startScore2: number,
        team1: TeamSaveData,
        team2: TeamSaveData,
        players1: PlayerSaveData[],
        players2: PlayerSaveData[],
        matchStats: Record<string, PlayerMatchStats>,
        rng: SeededRNG,
        bonus1: number,
        bonus2: number
    ): { team1Score: number, team2Score: number, rounds: RoundResult[] } {
        let t1Score = startScore1
        let t2Score = startScore2
        const otRounds: RoundResult[] = []

        const WIN_THRESHOLD = startScore1 + 4 // e.g. 13+3=16 for OT1

        // CS2 overtime resets economy to $10,000 per team
        const OT_START_CASH = 10000
        let team1Cash = OT_START_CASH
        let team2Cash = OT_START_CASH
        let team1LossStreak = 0
        let team2LossStreak = 0

        // OT Half 1 (3 rounds): Team1 CT, Team2 T (usually based on last half)
        let currentCtId = team1.id
        let currentTId = team2.id

        for (let r = 1; r <= 6; r++) {
            // Switch sides and reset economy after 3 rounds (OT half-time)
            if (r === 4) {
                const temp = currentCtId
                currentCtId = currentTId
                currentTId = temp
                team1Cash = OT_START_CASH
                team2Cash = OT_START_CASH
                team1LossStreak = 0
                team2LossStreak = 0
            }

            const isTeam1CT = currentCtId === team1.id
            const ctPlayers = isTeam1CT ? players1 : players2
            const tPlayers = isTeam1CT ? players2 : players1
            const ctTeam = isTeam1CT ? team1 : team2
            const tTeam = isTeam1CT ? team2 : team1

            // Calculate buy power from OT economy
            const ctBuyPower = getBuyPower(isTeam1CT ? team1Cash : team2Cash)
            const tBuyPower = getBuyPower(isTeam1CT ? team2Cash : team1Cash)

            const roundResult = this.simulateRound(
                24 + (otNumber - 1) * 6 + r, // Round number continues
                ctTeam,
                tTeam,
                ctPlayers,
                tPlayers,
                matchStats,
                rng,
                isTeam1CT ? bonus1 : bonus2,
                isTeam1CT ? bonus2 : bonus1,
                ctBuyPower,
                tBuyPower
            )

            otRounds.push(roundResult)

            // Update economy after OT round
            const team1Won = roundResult.winningTeamId === team1.id
            if (team1Won) {
                t1Score++
                team1Cash = Math.min(EconomyManager.MAX_CASH, team1Cash + EconomyManager.getWinBonus(roundResult.winType))
                team1LossStreak = 0
                team2LossStreak++
                team2Cash = Math.min(EconomyManager.MAX_CASH, team2Cash + EconomyManager.getLossBonus(team2LossStreak - 1))
            } else {
                t2Score++
                team2Cash = Math.min(EconomyManager.MAX_CASH, team2Cash + EconomyManager.getWinBonus(roundResult.winType))
                team2LossStreak = 0
                team1LossStreak++
                team1Cash = Math.min(EconomyManager.MAX_CASH, team1Cash + EconomyManager.getLossBonus(team1LossStreak - 1))
            }

            // Check if win threshold reached early (unlikely in MR3 but possible if one team wins 4 in a row)
            if (t1Score >= WIN_THRESHOLD || t2Score >= WIN_THRESHOLD) break
        }

        return { team1Score: t1Score, team2Score: t2Score, rounds: otRounds }
    }

    /**
     * Simulates a single round
     * Calculates winner based on team stats + tactics + RNG
     * Distributes kills to individual players
     */
    private simulateRound(
        roundNum: number,
        ctTeam: TeamSaveData,
        tTeam: TeamSaveData,
        ctPlayers: PlayerSaveData[],
        tPlayers: PlayerSaveData[],
        matchStats: Record<string, PlayerMatchStats>,
        rng: SeededRNG,
        ctBonus: number,
        tBonus: number,
        ctBuyPower: number = 1.0,
        tBuyPower: number = 1.0,
        mapBias: number = 1.08
    ): RoundResult {

        // 1. Calculate Power Levels (factoring in economy buy power)
        const getTeamPower = (team: TeamSaveData, players: PlayerSaveData[], buyPwr: number) => {
            const avgSkill = players.reduce((sum, p) => sum + (p.skill ?? 50), 0) / players.length
            const chemistry = team.chemistry ?? 50
            const tactical = team.tacticalPrep || 0
            const mentalBonus = 0 // TeamSaveData does not track mentalPrep; no mental prep bonus in legacy sim path

            return (avgSkill * 0.6 + chemistry * 0.3 + tactical * 0.1 + mentalBonus) * buyPwr
        }

        const ctPower = getTeamPower(ctTeam, ctPlayers, ctBuyPower) + ctBonus
        const tPower = getTeamPower(tTeam, tPlayers, tBuyPower) + tBonus

        // Win Probability
        // Power difference of 10 leads to significant advantage
        const powerDiff = (ctPower * mapBias) - tPower
        const baseWinProb = 0.5 + (powerDiff / 100) // 50 stats diff = 100% win rate (theoretical)
        const ctWinProb = Math.max(0.1, Math.min(0.9, baseWinProb))

        // 2. Determine Winner
        const ctWon = rng.next() < ctWinProb
        const winningTeam = ctWon ? ctTeam : tTeam
        const losingTeam = ctWon ? tTeam : ctTeam
        const winningPlayers = ctWon ? ctPlayers : tPlayers
        const losingPlayers = ctWon ? tPlayers : ctPlayers

        // 3. Simulate Combat (Kills/Deaths)
        // Winners usually survive more.
        // Losing team usually gets wiped (5 deaths) or saves (3-4 deaths).
        // Winning team usually loses 1-3 players.

        // Snapshot kill/death counts before this round to detect who got kills/died
        const allRoundPlayers = [...winningPlayers, ...losingPlayers]
        const killsBefore: Record<string, number> = {}
        const deathsBefore: Record<string, number> = {}
        allRoundPlayers.forEach(p => {
            killsBefore[p.id] = matchStats[p.id]?.kills ?? 0
            deathsBefore[p.id] = matchStats[p.id]?.deaths ?? 0
        })

        const loserDeaths = rng.next() > 0.3 ? 5 : 3 + Math.floor(rng.next() * 2) // 70% chance of wipe
        const winnerDeaths = Math.floor(rng.next() * 3) // 0-2 deaths usually

        // Distribute kills (Loser deaths = Winner kills)
        this.distributeKills(loserDeaths, winningPlayers, losingPlayers, matchStats, rng)
        // Distribute kills (Winner deaths = Loser kills)
        this.distributeKills(winnerDeaths, losingPlayers, winningPlayers, matchStats, rng)

        // Track first kill and first death of the round
        const firstKiller = winningPlayers.find(p => matchStats[p.id] && matchStats[p.id].kills > (killsBefore[p.id] ?? 0))
            || losingPlayers.find(p => matchStats[p.id] && matchStats[p.id].kills > (killsBefore[p.id] ?? 0))
        const firstDead = losingPlayers.find(p => matchStats[p.id] && matchStats[p.id].deaths > (deathsBefore[p.id] ?? 0))
            || winningPlayers.find(p => matchStats[p.id] && matchStats[p.id].deaths > (deathsBefore[p.id] ?? 0))

        if (firstKiller && matchStats[firstKiller.id]) {
            matchStats[firstKiller.id].firstKills++
        }
        if (firstDead && matchStats[firstDead.id]) {
            matchStats[firstDead.id].firstDeaths++
        }

        // Clutch detection: if winning team had 4+ deaths (1vX situation)
        if (winnerDeaths >= 4 && rng.next() < 0.15) {
            const clutchPlayer = this.pickWeightedPlayer(winningPlayers, p => p.skill, rng)
            if (matchStats[clutchPlayer.id]) {
                matchStats[clutchPlayer.id].clutches++
            }
        }

        // 5. Track KAST (Kill/Assist/Survived/Traded) per round
        // A player gets a KAST round if they: got a kill this round, OR survived
        // We use kast field as a counter of KAST-qualifying rounds (finalized to % after map ends)

        // Winning players: survived if they didn't die (check actual death delta)
        winningPlayers.forEach((p) => {
            if (!matchStats[p.id]) return
            const gotKill = matchStats[p.id].kills > (killsBefore[p.id] ?? 0)
            const died = matchStats[p.id].deaths > (deathsBefore[p.id] ?? 0)
            if (gotKill || !died) {
                matchStats[p.id].kast += 1
            }
        })

        // Losing players: get KAST if they got a kill this round
        losingPlayers.forEach(p => {
            if (!matchStats[p.id]) return
            const gotKill = matchStats[p.id].kills > (killsBefore[p.id] ?? 0)
            if (gotKill) {
                matchStats[p.id].kast += 1
            }
        })

        // 4. Determine Win Type
        let winType: "ELIMINATION" | "BOMB_EXPLODED" | "BOMB_DEFUSE" | "TIME" = "ELIMINATION"
        const winTypeRoll = rng.next()
        if (ctWon) {
            // CT Wins: 70% Elimination, 25% Defuse, 5% Time
            if (winTypeRoll < 0.7) winType = "ELIMINATION"
            else if (winTypeRoll < 0.95) winType = "BOMB_DEFUSE"
            else winType = "TIME"
        } else {
            // T Wins: 60% Elimination, 40% Bomb Exploded
            if (winTypeRoll < 0.6) winType = "ELIMINATION"
            else winType = "BOMB_EXPLODED"
        }

        // Build per-player kill/death deltas for this round
        const roundKills: { playerId: string; kills: number }[] = []
        const roundDeaths: { playerId: string; deaths: number }[] = []
        allRoundPlayers.forEach(p => {
            const kDelta = (matchStats[p.id]?.kills ?? 0) - (killsBefore[p.id] ?? 0)
            const dDelta = (matchStats[p.id]?.deaths ?? 0) - (deathsBefore[p.id] ?? 0)
            if (kDelta > 0) roundKills.push({ playerId: p.id, kills: kDelta })
            if (dDelta > 0) roundDeaths.push({ playerId: p.id, deaths: dDelta })
        })

        return {
            roundNumber: roundNum,
            winner: ctWon ? "ct" : "t",
            winningTeamId: winningTeam.id,
            winType,
            ctTeam: ctTeam.id,
            tTeam: tTeam.id,
            kills: roundKills,
            deaths: roundDeaths
        }
    }

    /**
     * Distributes N kills among valid killers targeting victims
     * Also tracks headshots and assists
     */
    private distributeKills(
        count: number,
        killers: PlayerSaveData[],
        victims: PlayerSaveData[],
        stats: Record<string, PlayerMatchStats>,
        rng: SeededRNG
    ) {
        for (let i = 0; i < count; i++) {
            // Pick a killer based on skill weights
            const killer = this.pickWeightedPlayer(killers, p => p.skill, rng)
            // Pick a victim (uniform for now)
            const victim = victims[Math.floor(rng.next() * victims.length)]

            // Update Stats
            if (stats[killer.id]) {
                stats[killer.id].kills++
                // Accumulate raw damage (finalized to ADR after map ends)
                stats[killer.id].adr += 85

                // Headshot tracking (~40% headshot rate)
                if (rng.next() < 0.40) {
                    stats[killer.id].headshots++
                }

                // Assist tracking (~30% chance a teammate assisted)
                if (rng.next() < 0.30 && killers.length > 1) {
                    const teammates = killers.filter(p => p.id !== killer.id)
                    const assister = this.pickWeightedPlayer(teammates, p => p.skill, rng)
                    if (stats[assister.id]) {
                        stats[assister.id].assists++
                    }
                }
            }

            if (stats[victim.id]) {
                stats[victim.id].deaths++
            }
        }
    }

    private pickWeightedPlayer(players: PlayerSaveData[], weightFn: (p: PlayerSaveData) => number, rng: SeededRNG): PlayerSaveData {
        const weights = players.map(weightFn)
        const totalWeight = weights.reduce((a, b) => a + b, 0)
        let random = rng.next() * totalWeight

        for (let i = 0; i < players.length; i++) {
            random -= weights[i]
            if (random <= 0) return players[i]
        }
        return players[0]
    }

    private createEmptyStats(playerId: string, matchId: string): PlayerMatchStats {
        return {
            playerId,
            matchId,
            kills: 0,
            deaths: 0,
            assists: 0,
            headshots: 0,
            adr: 0,
            kast: 0,
            rating: 0,
            clutches: 0,
            firstKills: 0,
            firstDeaths: 0,
            mapsPlayed: 0
        }
    }
}

export const matchEngine = new MatchEngine()
