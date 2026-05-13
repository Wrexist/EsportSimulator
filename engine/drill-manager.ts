import { SeededRNG, generateSeed } from "./rng"

export interface DrillStep {
    message: string
    difficulty: number // 0-100 check
    statCheck: "skill" | "reaction" | "tactic" | "teamwork" | "utility"
}

export interface ActiveDrill {
    id: string
    name: string
    description: string
    focus: string
    iconName: "Target" | "Wind" | "Crosshair" // Strings for Lucide icons
    steps: DrillStep[]
    rewards: { stat: string; value: number }[]
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
