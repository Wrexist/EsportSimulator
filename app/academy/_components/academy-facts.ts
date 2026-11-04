import { t } from "@/lib/i18n"
/**
 * Academy facts for the UI, taken from the code that applies them
 * (store/slices/academy-slice.ts, engine/academy-engine.ts,
 * engine/academy-constants.ts). Keep in sync if those numbers move.
 */

import type { AcademyTrainingFocus } from "@/types/academy"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { recruitmentSalary } from "@/engine/recruitment"

export const ACADEMY_ROLES = ["IGL", "Entry", "AWPer", "Support", "Rifler"] as const

/** academy-slice POTENTIAL_REVEAL_WEEKS (level 5 also reveals on enrolment). */
export const POTENTIAL_REVEAL_WEEKS: Record<number, number> = { 1: 12, 2: 8, 3: 4, 4: 2, 5: 2 }

/** academy-slice releaseProspect default fee. */
export const RELEASE_FEE = 1000

/** Length of a promoted prospect's first senior contract. */
export const PROMOTION_LENGTH_WEEKS = 104

/**
 * Terms the academy promotion uses (squad page and academy share them).
 * SQUAD-15: the wage is the one the market would ask for this player at this
 * club (engine/recruitment.ts recruitmentSalary, as AI clubs promote theirs),
 * not a flat $2,000/wk that a Division 5 club paying $250 cannot carry.
 */
export function promotionTerms(player: PlayerSaveData, currentWeek: number, team?: Pick<TeamSaveData, "reputation"> & Partial<Pick<TeamSaveData, "leagueTier">>): { salaryPerWeek: number; lengthWeeks: number } {
    return { salaryPerWeek: recruitmentSalary(player, currentWeek, team), lengthWeeks: PROMOTION_LENGTH_WEEKS }
}

/** AcademyEngine.evaluatePromotion: progress ≥ 85 and these minimums. */
export const PROMOTION_PROGRESS = 85
/** Labels are translation keys (attr.*), read with t() when shown. */
export const PROMOTION_MINIMUMS = [
    { key: "skill", label: "attr.skill", min: 45 },
    { key: "rifle", label: "attr.rifle", min: 40 },
    { key: "teamwork", label: "attr.teamwork", min: 35 },
] as const

/** academy-slice: bench prospects get 25% drill XP; under 15 energy drills give 20% less. */
export const BENCH_XP_SHARE = 0.25
export const FATIGUE_THRESHOLD = 15

/**
 * ACADEMY_FOCUS_STATS — focus re-weights a drill's gains toward these stats; it adds no growth.
 * The label is t(`ac.focus.${id}`) and the stats line t(`ac.focus.${id}.stats`).
 */
export const FOCUS_OPTIONS: { id: AcademyTrainingFocus }[] = [
    { id: "BALANCED" }, { id: "MECHANICAL" }, { id: "TACTICAL" }, { id: "MENTAL" }, { id: "PHYSICAL" },
]

const DRILL_STATS = new Set(["skill", "rifle", "pistol", "reaction", "grenades", "tactic", "teamwork", "trading", "creativity", "clutch", "stressResistance", "health", "endurance"])

/** Lower-case stat name for drill and gain lines (ac.stat.*), or the raw key when unknown. */
export function drillStatName(stat: string): string {
    return DRILL_STATS.has(stat) ? t(`ac.stat.${stat}`) : stat
}
