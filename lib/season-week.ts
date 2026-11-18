/**
 * Weeks as the player sees them (HOME-22, SQUAD-57).
 *
 * The save counts weeks from the start of the career (week 56 is season 2,
 * week 4), while every calendar on screen counts 1–52 inside a season. Any
 * week shown to the player goes through here: the season's week, plus the
 * season when it is not the one being played. Engine safe (no store, no React).
 */
import { t, type TextRef } from "./i18n"

export const WEEKS_PER_SEASON = 52

/** Season of an absolute week (week 1–52 is season 1). */
export function seasonOfWeek(week: number): number {
    return Math.floor((Math.max(1, week) - 1) / WEEKS_PER_SEASON) + 1
}

/** Week inside its season, 1–52. */
export function weekOfSeason(week: number): number {
    return ((Math.max(1, week) - 1) % WEEKS_PER_SEASON) + 1
}

/**
 * The number for a "Week {{n}}" text: "4" in the season being played, "4, season 2"
 * for a week in another season. With no current week the season is always named.
 */
export function weekNumberText(week: number, currentWeek?: number): string {
    const w = weekOfSeason(week)
    if (currentWeek !== undefined && seasonOfWeek(week) === seasonOfWeek(currentWeek)) return String(w)
    return t("common.seasonWeekNo", { w, s: seasonOfWeek(week) })
}

/** "Week 4", or "Week 4, season 2" outside the current season. */
export function weekLabel(week: number, currentWeek?: number): string {
    return t("common.week", { n: weekNumberText(week, currentWeek) })
}

/** "Wk 4" in the current season, "S2 W4" outside it (tight table cells). */
export function weekLabelShort(week: number, currentWeek?: number): string {
    if (currentWeek !== undefined && seasonOfWeek(week) === seasonOfWeek(currentWeek)) return t("common.weekShort", { n: weekOfSeason(week) })
    return t("common.seasonWeekShort", { s: seasonOfWeek(week), w: weekOfSeason(week) })
}

/**
 * The same number for a text kept in a save ("His contract ends in Week {{week}}"):
 * read weeks or seasons later, so it always names the season ("13, season 2").
 */
export function weekRef(week: number): TextRef {
    return { key: "common.seasonWeekNo", params: { w: weekOfSeason(week), s: seasonOfWeek(week) } }
}
