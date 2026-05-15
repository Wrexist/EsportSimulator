/**
 * Weekly AI-world tick.
 *
 * Orchestrates everything that happens beyond the player's own team each
 * tick:
 *   1. World ranking refresh
 *   2. Per-team academy scouting roll
 *   3. AIManager weekly logic (roster management, transfer offers — gated
 *      to weeks 1-8 and 26-34 transfer windows)
 *   4. AI-to-AI transfers (transfer window only)
 *   5. Staff market auto-refresh every 4 weeks
 *   6. Season-end (every 52 weeks) — retire aging AI players + generate
 *      youth prospects for teams with Training facility level ≥ 3 (2 for
 *      level 5, 1 otherwise).
 *
 * Extracted from atomic-week-processor.ts. Signature unchanged.
 */

import type { GameSave } from "../save-types"
import { SeededRNG } from "../rng"
import { AIManager } from "../ai-manager"
import { StaffGenerator } from "../staff-generator"
import { logger } from "@/lib/logger"

const YOUTH_NATIONALITIES = [
    "Denmark", "Sweden", "France", "Germany", "Poland",
    "Brazil", "USA", "Russia", "Kazakhstan", "China",
]
const NICKNAME_PREFIXES = ["Neo", "Hyper", "Swift", "Blaze", "Frost", "Storm", "Volt", "Shadow", "Apex", "Nova"]
const NICKNAME_SUFFIXES = ["X", "Z", "1", "Y", "Q", "0", "K", "R"]
const YOUTH_ROLES: ("Rifler" | "AWPer" | "Support" | "Entry" | "Lurker")[] =
    ["Rifler", "AWPer", "Support", "Entry", "Lurker"]

export function processAIWorldLogic(save: GameSave, playerTeamId: string, rng: SeededRNG): void {
    // 1. Elo updates are handled atomically inside processMatches via
    //    LeagueEngine, so nothing to do here.

    // 2. World rankings
    AIManager.refreshWorldRankings(save)

    // 3. Per-team academy scouting + weekly AI decisions
    save.teams.forEach(team => {
        AIManager.processAcademyScouting(save, team, rng)
    })

    // Transfer windows: weeks 1-8 (pre-season) and 26-34 (mid-season).
    const weekOfSeason = ((save.currentWeek - 1) % 52) + 1
    const isTransferWindow = weekOfSeason <= 8 || (weekOfSeason >= 26 && weekOfSeason <= 34)
    AIManager.processWeeklyAI(save, playerTeamId, rng, isTransferWindow)

    if (isTransferWindow) {
        AIManager.processAIToAITransfers(save, playerTeamId, rng)
    }

    // 4. Staff market auto-refresh every 4 weeks.
    if (save.currentWeek > 0 && save.currentWeek % 4 === 0) {
        const staffRng = new SeededRNG(rng.next() * 2147483646 || 1)
        save.marketStaff = StaffGenerator.generateWeeklyMarket(save.currentWeek, 20, staffRng)
        save.nextMarketRefreshWeek = save.currentWeek + 4
    }

    // 5. Season-end transition.
    if (save.currentWeek > 0 && save.currentWeek % 52 === 0) {
        AIManager.processSeasonEnd(save)
        generateYouthIntake(save, playerTeamId, rng)
    }
}

/**
 * Per-team youth prospect generation at season end. Teams need a Training
 * facility of level ≥ 3 to qualify; level 5+ gets 2 prospects, else 1.
 */
function generateYouthIntake(save: GameSave, playerTeamId: string, rng: SeededRNG): void {
    logger.debug("[Season End] Generating Youth Prospects...")

    save.teams.forEach(team => {
        const trainingFacility = team.facilities?.find(f => f.type === "TRAINING")
        if (!trainingFacility || trainingFacility.level < 3) return

        const prospectsToGenerate = trainingFacility.level >= 5 ? 2 : 1

        for (let i = 0; i < prospectsToGenerate; i++) {
            const prospectId = `youth_${team.id}_${save.currentWeek}_${i}`
            const prospectAge = 16 + Math.floor(rng.next() * 3) // 16-18
            const potential = 60 + Math.floor(rng.next() * 30) // 60-89
            const nationality = YOUTH_NATIONALITIES[Math.floor(rng.next() * YOUTH_NATIONALITIES.length)]
            const nickname =
                NICKNAME_PREFIXES[Math.floor(rng.next() * NICKNAME_PREFIXES.length)] +
                NICKNAME_SUFFIXES[Math.floor(rng.next() * NICKNAME_SUFFIXES.length)]
            const role = YOUTH_ROLES[Math.floor(rng.next() * YOUTH_ROLES.length)]
            const currentSkill = Math.max(40, potential - 25 - Math.floor(rng.next() * 10))

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prospect snapshot composed inline
            const newProspect: any = {
                id: prospectId,
                nickname,
                firstName: "Youth",
                lastName: "Prospect",
                nationality,
                age: prospectAge,
                role,
                skill: currentSkill,
                potential,
                morale: 80,
                fatigue: 0,
                form: 70,
                health: 100,
                energy: 100,
                maxEnergy: 100,
                matchesPlayed: 0,
                isYouthPlayer: true,
                rifle: currentSkill * 0.8,
                awp: role === "AWPer" ? currentSkill : currentSkill * 0.5,
                pistol: currentSkill * 0.7,
                grenades: currentSkill * 0.7,
                tactic: currentSkill * 0.6,
                creativity: currentSkill * 0.6,
                reaction: currentSkill * 0.7,
                clutch: currentSkill * 0.5,
                teamwork: currentSkill * 0.6,
                stressResistance: currentSkill * 0.5,
                entry: currentSkill * 0.5,
                trading: currentSkill * 0.5,
                leader: currentSkill * 0.3,
                amicability: currentSkill * 0.6,
                eyesight: currentSkill * 0.7,
                strength: currentSkill * 0.6,
                endurance: currentSkill * 0.6,
                portraitPath: null,
                xp: 0,
                xpToNextLevel: 1000,
                level: 1,
            }

            save.players.push(newProspect)

            if (!save.academyPlayers) save.academyPlayers = []
            save.academyPlayers.push({
                id: `academy_${prospectId}_${save.currentWeek}`,
                playerId: prospectId,
                enrolledWeek: save.currentWeek,
                trainingFocus: 'BALANCED' as const,
                developmentProgress: 0,
                potentialRevealed: false,
                totalXpGained: 0,
                academyMatchesPlayed: 0,
                readyForPromotion: false,
                scoutNotes: `Youth intake prospect for ${team.name}`,
                energy: 100,
            })

            logger.debug(`[Youth Academy] ${team.name} signed prospect: ${nickname} (Skill: ${currentSkill}, Potential: ${potential})`)
        }

        // Notify player team about its own youth intake.
        if (team.id === playerTeamId) {
            save.eventsLog.unshift({
                id: `youth_intake_${save.currentWeek}`,
                type: "TRAINING_COMPLETE",
                week: save.currentWeek,
                acknowledged: false,
                data: {
                    title: "Youth Intake Complete",
                    message: `${prospectsToGenerate} new prospect${prospectsToGenerate > 1 ? 's have' : ' has'} joined your Youth Academy. Check the Squad page to view and promote them.`,
                    severity: "success",
                },
            })
        }
    })
}
