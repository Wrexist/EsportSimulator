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
import { generateProspect } from "../prospect-generator"
import { PlayerRole } from "@/types/enums"
import { logger } from "@/lib/logger"

// Flavour backstory fragments so intakes read as distinct scouted talents
// rather than a wall of identical "Youth Prospect" clones. Picked
// deterministically from the seeded rng.
const YOUTH_BACKSTORIES = [
    "Dominated regional online qualifiers before turning 17.",
    "A raw mechanical talent first spotted at a local LAN.",
    "Grinded matchmaking into the top 0.1% before being scouted.",
    "Captained a promising amateur roster in the lower divisions.",
    "Known for ice-cold nerves when the round is on the line.",
    "A prodigy whose aim drew attention from several academies.",
    "Rose through community cups with a fearless entry style.",
    "A tactical thinker who calls like a veteran despite his age.",
    "Self-taught AWPer with a highlight reel that went viral.",
    "A late bloomer who has improved faster than any peer this cycle.",
    "Left a rival academy's tryouts as the standout performer.",
    "Streams for a small but devoted following between practice blocks.",
]

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
        const isPlayerTeam = team.id === playerTeamId

        for (let i = 0; i < prospectsToGenerate; i++) {
            const prospectId = `youth_${team.id}_${save.currentWeek}_${i}`

            // Region-appropriate identity + role from the shared prospect
            // generator (hundreds of first/last-name combos + a rich nickname
            // generator), so regen intakes read like authored players instead
            // of a wall of "Youth Prospect" clones from an 80-combo pool.
            const identity = generateProspect("LOCAL", undefined, rng)

            const prospectAge = 16 + Math.floor(rng.next() * 3) // 16-18
            const potential = 60 + Math.floor(rng.next() * 30) // 60-89
            const role = identity.role
            const currentSkill = Math.max(40, potential - 25 - Math.floor(rng.next() * 10))

            // Per-stat variance so even two same-role, same-skill prospects
            // feel distinct rather than a flat multiple of one number.
            const vary = (mult: number) => {
                const factor = 0.85 + rng.next() * 0.3 // [0.85, 1.15]
                return Math.round(Math.min(100, Math.max(1, currentSkill * mult * factor)))
            }
            const backstory = YOUTH_BACKSTORIES[Math.floor(rng.next() * YOUTH_BACKSTORIES.length)]

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prospect snapshot composed inline
            const newProspect: any = {
                id: prospectId,
                nickname: identity.nickname,
                firstName: identity.firstName,
                lastName: identity.lastName,
                name: `${identity.firstName} "${identity.nickname}" ${identity.lastName}`,
                nationality: identity.nationality,
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
                // Ownership tag: which club's youth setup this prospect belongs
                // to. Prevents the player's academy reads from ever picking up
                // an AI club's youth (see the youthAcademyIds routing below).
                academyTeamId: team.id,
                backstory,
                rifle: vary(0.8),
                awp: role === PlayerRole.AWPER ? vary(1.0) : vary(0.5),
                pistol: vary(0.7),
                grenades: vary(0.7),
                tactic: vary(0.6),
                creativity: vary(0.6),
                reaction: vary(0.7),
                clutch: vary(0.5),
                teamwork: vary(0.6),
                stressResistance: vary(0.5),
                entry: vary(0.5),
                trading: vary(0.5),
                leader: vary(0.3),
                amicability: vary(0.6),
                eyesight: vary(0.7),
                strength: vary(0.6),
                endurance: vary(0.6),
                portraitPath: null,
                xp: 0,
                xpToNextLevel: 1000,
                level: 1,
            }

            save.players.push(newProspect)

            if (isPlayerTeam) {
                // The PLAYER's own youth intake enters the player-owned academy
                // pipeline (roster tab, weekly upkeep, promotion).
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
                    scoutNotes: backstory,
                    energy: 100,
                })
            } else {
                // AI youth belong to THEIR club, tracked on the owning team —
                // never pushed into the single global save.academyPlayers array.
                // The old code did, which polluted the player's academy roster
                // and upkeep with every AI club's prospects, filled the player's
                // enrol capacity, and even let the player promote another club's
                // youth onto their roster for just a contract (no transfer fee).
                if (!team.youthAcademyIds) team.youthAcademyIds = []
                team.youthAcademyIds.push(prospectId)
            }

            logger.debug(`[Youth Academy] ${team.name} signed prospect: ${identity.nickname} (Skill: ${currentSkill}, Potential: ${potential})`)
        }

        // Notify player team about its own youth intake.
        if (isPlayerTeam) {
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
