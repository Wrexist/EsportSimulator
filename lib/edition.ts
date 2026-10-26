/**
 * Game edition: the full game or the free Steam demo.
 *
 * The edition is fixed at build time (`ESM_EDITION=demo`, see
 * scripts/dist-demo.cjs and next.config.js), so a demo package can never
 * unlock the full game by editing a setting.
 *
 * The demo is the full career with a calendar cap: the first DEMO_LAST_WEEK
 * weeks of season one (league split start, the first events, transfers,
 * training, live matches). When the last demo week is processed the career
 * stops and the save waits for the full game, which shares the same save
 * folder and continues it from the next week. Draft Cup runs are short and
 * end on their own, so the demo leaves them uncapped.
 */

export type Edition = "full" | "demo"

export const EDITION: Edition = process.env.NEXT_PUBLIC_ESM_EDITION === "demo" ? "demo" : "full"
export const IS_DEMO = EDITION === "demo"

/** Last career week the demo plays; the career stops once it has been processed. */
export const DEMO_LAST_WEEK = 12

/** Full game store page; opens in the OS browser through the external-link allowlist. */
export const FULL_GAME_STORE_URL = "https://store.steampowered.com/app/4326170/"

type DemoCapState = { currentWeek?: number | null; draftCup?: unknown; saveId?: string | null }

/** True when a demo career has played all its weeks and must continue in the full game. */
export function demoWeekCapReached(state: DemoCapState, demo: boolean = IS_DEMO): boolean {
    if (!demo || !state.saveId || state.draftCup) return false
    return (state.currentWeek ?? 1) > DEMO_LAST_WEEK
}

/** Demo weeks left to play, counting the current one (0 once the cap is reached). */
export function demoWeeksLeft(currentWeek: number | null | undefined): number {
    return Math.max(0, DEMO_LAST_WEEK - Math.max(1, currentWeek ?? 1) + 1)
}
