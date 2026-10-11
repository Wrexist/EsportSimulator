/**
 * Save-staff → runtime-staff adapter for the live-match flow.
 *
 * Takes the filtered StaffSaveData array for one team and returns the
 * three runtime staff objects (coach / analyst / psychologist) that
 * SimulationEngineV2 understands. If a role isn't on the team, that
 * slot is `undefined`.
 *
 * Extracted from useLiveMatch.ts (Phase L4). Pure function — no React,
 * no closure capture, no side effects. Lifts a 10-line inline helper
 * out of the init useEffect.
 */

import { createCoach, createAnalyst, createPsychologist } from "@/types"
import { applyPreMatchTalents } from "./apply-talents"

interface StaffSource {
    id: string
    name: string
    level: number
    salaryPerWeek: number
    role: string
    unlockedTalentIds?: string[]
}

export interface RuntimeTeamStaff {
    coach?: ReturnType<typeof createCoach>
    analyst?: ReturnType<typeof createAnalyst>
    psychologist?: ReturnType<typeof createPsychologist>
}

/**
 * Build the runtime staff bundle for one team. Picks first match per
 * role — if a team has two coaches, only the first is used (matches
 * the existing single-staff-per-role contract everywhere else).
 */
export function buildRuntimeStaff(staffData: StaffSource[]): RuntimeTeamStaff {
    const coachData = staffData.find(s => s.role === "coach")
    const analystData = staffData.find(s => s.role === "analyst")
    const psychData = staffData.find(s => s.role === "psychologist")

    return {
        coach: coachData
            ? createCoach(coachData.id, coachData.name, coachData.level, coachData.salaryPerWeek)
            : undefined,
        analyst: analystData
            ? createAnalyst(analystData.id, analystData.name, analystData.level, analystData.salaryPerWeek)
            : undefined,
        psychologist: psychData
            ? createPsychologist(psychData.id, psychData.name, psychData.level, psychData.salaryPerWeek)
            : undefined,
    }
}

/**
 * Both teams' match-day staff: pre-match talents (morale floor, timeout
 * morale) applied to the rosters in place, runtime staff built, and each
 * side's anti_strat talent cutting the opponent coach's tactic bonus.
 * Shared by the managed path (prepareLegacySeries) and the AI path
 * (MatchEngine.simulateMatch) so staff are worth the same in both.
 */
export function buildMatchStaff(
    homePlayers: { morale: number }[],
    awayPlayers: { morale: number }[],
    homeStaffData: StaffSource[],
    awayStaffData: StaffSource[],
): { homeStaff: RuntimeTeamStaff; awayStaff: RuntimeTeamStaff; homeAntiStrat: number; awayAntiStrat: number } {
    const { homeAntiStrat, awayAntiStrat } = applyPreMatchTalents(homePlayers, awayPlayers, homeStaffData, awayStaffData)
    const homeStaff = buildRuntimeStaff(homeStaffData)
    const awayStaff = buildRuntimeStaff(awayStaffData)
    if (homeAntiStrat > 0 && awayStaff.coach) awayStaff.coach.tacticBonus = Math.round(awayStaff.coach.tacticBonus * (1 - homeAntiStrat))
    if (awayAntiStrat > 0 && homeStaff.coach) homeStaff.coach.tacticBonus = Math.round(homeStaff.coach.tacticBonus * (1 - awayAntiStrat))
    return { homeStaff, awayStaff, homeAntiStrat, awayAntiStrat }
}
