/**
 * One toast per accomplishment (HOME-17). Several career milestones
 * (engine/milestone-checker.ts) mark the same thing as a Steam achievement
 * (engine/steam-service.ts): "Your first win!" and "First Victory" stacked as
 * two toasts over the week report. Whichever of the pair fires first shows;
 * the other is recorded (event log / Steam) without a second toast.
 * Achievement unlocks are async, so either can come first.
 */

/** Milestone id → the achievement that marks the same accomplishment. */
export const MILESTONE_ACHIEVEMENT: Readonly<Record<string, string>> = {
    ms_win_1: "FIRST_WIN",
    ms_win_10: "WIN_10",
    ms_win_50: "WIN_50",
    ms_win_100: "WIN_100",
    ms_win_250: "WIN_250",
    ms_win_500: "WIN_500",
    ms_trophy_1: "TOURNAMENT_WIN",
}

const ACHIEVEMENT_MILESTONE: Readonly<Record<string, string>> = Object.fromEntries(
    Object.entries(MILESTONE_ACHIEVEMENT).map(([ms, ach]) => [ach, ms]),
)

/** How long a shown toast covers its twin. */
export const CELEBRATION_PAIR_WINDOW_MS = 5 * 60_000

const shown = new Map<string, number>()

function claim(key: string, twin: string | undefined, now: number): boolean {
    if (twin) {
        const at = shown.get(twin)
        if (at !== undefined && now - at < CELEBRATION_PAIR_WINDOW_MS) return false
    }
    shown.set(key, now)
    return true
}

/** True when this milestone should toast (its achievement did not just toast). */
export function claimMilestoneToast(milestoneId: string, now = Date.now()): boolean {
    const ach = MILESTONE_ACHIEVEMENT[milestoneId]
    return claim(`ms:${milestoneId}`, ach ? `ach:${ach}` : undefined, now)
}

/** True when this achievement should toast (its milestone did not just toast). */
export function claimAchievementToast(achievementId: string, now = Date.now()): boolean {
    const ms = ACHIEVEMENT_MILESTONE[achievementId]
    return claim(`ach:${achievementId}`, ms ? `ms:${ms}` : undefined, now)
}

/** Tests only. */
export function resetCelebrationToasts(): void {
    shown.clear()
}
