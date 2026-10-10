/**
 * Academy facts for the UI, taken from the code that applies them
 * (store/slices/academy-slice.ts, engine/academy-engine.ts,
 * engine/academy-constants.ts). Keep in sync if those numbers move.
 */

import type { AcademyTrainingFocus } from "@/types/academy"

export const ACADEMY_ROLES = ["IGL", "Entry", "AWPer", "Support", "Rifler"] as const

/** academy-slice POTENTIAL_REVEAL_WEEKS (level 5 also reveals on enrolment). */
export const POTENTIAL_REVEAL_WEEKS: Record<number, number> = { 1: 12, 2: 8, 3: 4, 4: 2, 5: 2 }

/** academy-slice releaseProspect default fee. */
export const RELEASE_FEE = 1000

/** Terms the academy promotion uses (squad page and academy share them). */
export const PROMOTION_TERMS = { salaryPerWeek: 2000, lengthWeeks: 104 }

/** AcademyEngine.evaluatePromotion: progress ≥ 85 and these minimums. */
export const PROMOTION_PROGRESS = 85
export const PROMOTION_MINIMUMS = [
    { key: "skill", label: "Aim", min: 45 },
    { key: "rifle", label: "Rifle", min: 40 },
    { key: "teamwork", label: "Teamwork", min: 35 },
] as const

/** academy-slice: bench prospects get 25% drill XP; under 15 energy drills give 20% less. */
export const BENCH_XP_SHARE = 0.25
export const FATIGUE_THRESHOLD = 15

/** ACADEMY_FOCUS_STATS — focus re-weights a drill's gains toward these stats; it adds no growth. */
export const FOCUS_OPTIONS: { id: AcademyTrainingFocus; label: string; stats: string }[] = [
    { id: "BALANCED", label: "Balanced", stats: "Even split" },
    { id: "MECHANICAL", label: "Mechanical", stats: "Aim, rifle, AWP, pistol" },
    { id: "TACTICAL", label: "Tactical", stats: "Tactics, utility, creativity, teamwork" },
    { id: "MENTAL", label: "Mental", stats: "Leadership, clutch, composure" },
    { id: "PHYSICAL", label: "Physical", stats: "Reaction, endurance, health" },
]

export const DRILL_STAT_LABEL: Record<string, string> = {
    skill: "aim", rifle: "rifle", pistol: "pistol", reaction: "reaction", grenades: "utility", tactic: "tactics",
    teamwork: "teamwork", trading: "trading", creativity: "creativity", clutch: "clutch",
    stressResistance: "composure", health: "health", endurance: "endurance",
}

export const SCOUT_TIER_LABEL: Record<"LOCAL" | "REGIONAL" | "INTERNATIONAL", string> = {
    LOCAL: "Local",
    REGIONAL: "Regional",
    INTERNATIONAL: "Global",
}
