/** Weekly chances shared by PlayerLifecycleManager and the development outlook. */

/** Natural growth chance per week (PlayerLifecycleManager.processNaturalGrowth). */
export function naturalGrowthChance(age: number, skill: number, potential: number): number {
    if (age > 24) return 0
    const headroom = potential - skill
    if (headroom <= 0) return 0
    const ageFactor = age <= 19 ? 1 : age <= 21 ? 0.7 : age <= 23 ? 0.45 : 0.25
    return Math.min(0.04, (headroom / 100) * 0.18 * ageFactor)
}

/** Age decline chance per week (PlayerLifecycleManager.processAging). */
export function ageDeclineChance(age: number): number {
    return age <= 27 ? 0 : Math.min(0.03, (age - 27) * 0.002)
}
