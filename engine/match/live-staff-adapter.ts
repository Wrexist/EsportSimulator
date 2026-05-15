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

interface StaffSource {
    id: string
    name: string
    level: number
    salaryPerWeek: number
    role: string
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
