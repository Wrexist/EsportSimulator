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
import { buildMatchStaff } from "./match/live-staff-adapter"
import { logger } from "@/lib/logger"

// ===== ADAPTERS: Save types → Frontend types for SimulationEngineV2 delegation =====

function adaptTeamSaveToTeam(team: TeamSaveData): Team {
    return {
        id: team.id,
        name: team.name,
        tier: (team.tier as PlayerTier) || PlayerTier.PRO,
        logoPath: team.logoPath || '',
        branding: team.branding,
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
        // Not every save carries entry / trading: same neutral default as the managed path.
        entry: (p as { entry?: number }).entry ?? 50,
        trading: (p as { trading?: number }).trading ?? 50,
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
     * @param homeTacticalBonus - Coach-equivalent bonus (Coach.tacticBonus units) used only when the home staff list has no coach
     * @param awayTacticalBonus - Same for the away team
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
        awayTeamStaff?: StaffSaveData[],
        /** The human player's team: it alone plays with only the gear it bought (AI clubs get implicit gear). */
        playerTeamId?: string,
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
            seed: typeof match.seed === "number" && Number.isFinite(match.seed) && match.seed >= 0 ? match.seed : derivedSeed,
            date: new Date(),
            mapVeto: [],
            vetoComplete: match.vetoComplete ?? false,
            maps: (match.maps || []) as MapId[],
            mapStartingSides: match.mapStartingSides,
            engineVersion: match.engineVersion,
            mapResults: [],
            roundHistory: [],
            tournamentId: match.tournamentId,
            stage: match.stage ?? undefined,
            isHighPressure: match.isHighPressure ?? false,
            mentalPrep: match.mentalPrep ?? false,
        } as Match

        // Same match-day staff as the managed path (prepareLegacySeries):
        // talents applied to the rosters, real coach/analyst/psychologist
        // levels, anti_strat cutting the opponent coach. Staff used to be
        // dropped here and replaced by a synthetic coach worth tacticBonus x10.
        const { homeStaff, awayStaff, homeAntiStrat, awayAntiStrat } = buildMatchStaff(
            adaptedHomePlayers, adaptedAwayPlayers,
            homeTeamStaff ?? [], awayTeamStaff ?? [],
        )

        // A caller-supplied tactical bonus is in Coach.tacticBonus units
        // (2 x coach level, i.e. percent team strength). It only stands in
        // for a coach the staff list doesn't provide, so a real coach is
        // never counted twice.
        const makeCoach = (bonus: number): Coach => ({
            id: 'ai_coach', name: 'Coach', type: StaffType.COACH,
            level: Math.max(1, Math.min(5, Math.round(bonus / 2))), salary: 0, contractWeeksRemaining: 52,
            tacticBonus: Math.round(bonus), moraleStability: 0.2,
        })
        if (!homeStaff.coach && homeTacticalBonus > 0) homeStaff.coach = makeCoach(homeTacticalBonus * (1 - awayAntiStrat))
        if (!awayStaff.coach && awayTacticalBonus > 0) awayStaff.coach = makeCoach(awayTacticalBonus * (1 - homeAntiStrat))

        return simEngineV2.simulateMatch(
            matchObj,
            adaptedHome,
            adaptedAway,
            adaptedHomePlayers,
            adaptedAwayPlayers,
            homeStaff,
            awayStaff,
            undefined,
            undefined,
            playerTeamId,
        )
      } catch (error) {
        logger.error('[MatchEngine] simulateMatch failed', error, { matchId: match.id, homeTeam: homeTeam.id, awayTeam: awayTeam.id })
        throw error
      }
    }
}

export const matchEngine = new MatchEngine()
