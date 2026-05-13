import {
    MatchResult,
    Match,
} from "@/types/match"
import { MatchFormat, MapId, PlayerRole } from "@/types/enums"
import { Player } from "@/types/player"
import { Team, Coach } from "@/types/team"
import { PlayerTier, StaffType } from "@/types/enums"
import { TeamSaveData, PlayerSaveData, MatchSaveData, StaffSaveData } from "@/engine/save-types"
import { SeededRNG } from "@/engine/rng"
import { SimulationEngineV2 } from "./match-simulation"
import { collectTeamTalentBonuses, applyTalentMoraleFloor } from "./talent-trees"

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
        awayTacticalBonus: number = 0,
        homeTeamStaff?: StaffSaveData[],
        awayTeamStaff?: StaffSaveData[]
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

        // Collect staff talent passive bonuses
        const homeTalentBonuses = collectTeamTalentBonuses(homeTeamStaff || [])
        const awayTalentBonuses = collectTeamTalentBonuses(awayTeamStaff || [])

        // anti_strat talent: reduces opponent tactic effectiveness (multiplicative)
        const homeAntiStrat = (homeTalentBonuses["anti_strat"] || 0) / 100
        const awayAntiStrat = (awayTalentBonuses["anti_strat"] || 0) / 100
        awayTacticalBonus *= (1 - homeAntiStrat)
        homeTacticalBonus *= (1 - awayAntiStrat)

        // morale_floor / tilt_immunity talent: enforce minimum morale for match
        applyTalentMoraleFloor(adaptedHomePlayers, homeTalentBonuses)
        applyTalentMoraleFloor(adaptedAwayPlayers, awayTalentBonuses)

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
        if (process.env.NODE_ENV !== 'production') {
          console.error('[MatchEngine] simulateMatch failed:', error, { matchId: match.id, homeTeam: homeTeam.id, awayTeam: awayTeam.id })
        }
        throw error
      }
    }
}

export const matchEngine = new MatchEngine()
