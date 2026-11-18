/**
 * News items and storyline lines keep their English text and, when written
 * with translation keys, a TextRef next to it: these show the active language.
 */
import { isTextRef, tRef, type TextRef } from "./i18n"
import "./stored-text"

export const newsTitle = (n: { title: string; titleRef?: TextRef }): string => (isTextRef(n.titleRef) ? tRef(n.titleRef) : n.title)
export const newsContent = (n: { content: string; contentRef?: TextRef }): string => (isTextRef(n.contentRef) ? tRef(n.contentRef) : n.content)
/** A storyline beat, a choice or any `{ text, ref }` line. */
export const lineText = (l: { text: string; ref?: TextRef }): string => (isTextRef(l.ref) ? tRef(l.ref) : l.text)

type DatedNews = { week: number; day?: number; matchId?: string }

/** Day of the week a news item happened on: its own day, a result's match day, else the week's first day. */
export function newsDay(n: DatedNews, dayByMatchId?: ReadonlyMap<string, number | undefined>): number {
    return n.day ?? (n.matchId ? dayByMatchId?.get(n.matchId) : undefined) ?? 0
}

/**
 * Newest first by week and day (NEWPLAYER-16); items of the same day keep
 * their stored order (newest first). The stored array is not in date order:
 * the week tick and in-week actions add to it at different times (HOME-07).
 */
export function sortNewsByDate<T extends DatedNews>(items: readonly T[], dayByMatchId?: ReadonlyMap<string, number | undefined>): T[] {
    return items.map((item, i) => ({ item, i, day: newsDay(item, dayByMatchId) }))
        .sort((a, b) => b.item.week - a.item.week || b.day - a.day || a.i - b.i)
        .map(x => x.item)
}
