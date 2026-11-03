/**
 * HOME-17: a first win showed two toasts ("Your first win!" milestone and the
 * matching Steam achievement). Whichever comes first toasts; its twin does not.
 */
import { CELEBRATION_PAIR_WINDOW_MS, MILESTONE_ACHIEVEMENT, claimAchievementToast, claimMilestoneToast, resetCelebrationToasts } from "@/lib/celebration-toasts"
import { ACHIEVEMENTS } from "@/engine/steam-service"

beforeEach(() => resetCelebrationToasts())

test("every paired achievement exists", () => {
    for (const ach of Object.values(MILESTONE_ACHIEVEMENT)) expect(ACHIEVEMENTS[ach]).toBeDefined()
})

test("milestone first: the matching achievement does not toast again", () => {
    expect(claimMilestoneToast("ms_win_1", 1000)).toBe(true)
    expect(claimAchievementToast("FIRST_WIN", 1500)).toBe(false)
})

test("achievement first: the matching milestone does not toast again", () => {
    expect(claimAchievementToast("FIRST_WIN", 1000)).toBe(true)
    expect(claimMilestoneToast("ms_win_1", 1200)).toBe(false)
})

test("unrelated achievements and milestones both toast", () => {
    expect(claimAchievementToast("FIRST_TOURNAMENT", 1000)).toBe(true) // "Into the Arena"
    expect(claimMilestoneToast("ms_win_1", 1100)).toBe(true)
    expect(claimMilestoneToast("ms_kills_1000", 1100)).toBe(true)
})

test("outside the window the pair is independent", () => {
    expect(claimAchievementToast("FIRST_WIN", 0)).toBe(true)
    expect(claimMilestoneToast("ms_win_1", CELEBRATION_PAIR_WINDOW_MS + 1)).toBe(true)
})
