import { SeededRNG, generateSeed } from "./rng"

export interface DrillStep {
    message: string
    difficulty: number // 0-100 check
    /**
     * Which player stat the step thematically checks. Currently not read
     * by simulateStep (which uses overall skill rating + difficulty), but
     * surfaced in narrative copy / training UI. Accepts any of the live
     * player attributes — see PlayerSaveData for the canonical list.
     */
    statCheck: string
}

export interface ActiveDrill {
    id: string
    name: string
    description: string
    focus: string
    /**
     * Lucide icon component name. Widened to string so drills can pick
     * from any icon in lucide-react without churning this union every
     * time a new drill is added.
     */
    iconName: string
    steps: DrillStep[]
    rewards: { stat: string; value: number }[]
    /** Positive = adds fatigue, negative = recovery (e.g. Sleep Protocol). */
    fatigueCost: number
}

import drillData from "@/data/drills.json"

export class DrillManager {
    private static drills: ActiveDrill[] = drillData as ActiveDrill[]

    static getDrills(): ActiveDrill[] {
        return this.drills
    }

    static simulateStep(step: DrillStep, playerSkillRating: number, rng?: SeededRNG): { success: boolean, log: string } {
        if (!rng) rng = new SeededRNG(generateSeed()) // Fallback for UI-driven drills
        const roll = rng.range(0, 100)

        // Player skill helps (scale 0-100 maps to 0-50 bonus)
        const bonus = Math.min(50, playerSkillRating * 0.5)
        const target = step.difficulty - bonus

        const success = roll > target

        let log = ""
        if (success) {
            if (roll > target + 30) log = "PERFECT execution! (+Bonus)"
            else log = "Good form, target cleared."
        } else {
            log = "Missed the timing/spray."
        }

        return { success, log }
    }
}
