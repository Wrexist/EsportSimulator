"use client"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Newspaper, Trophy, Users, Zap, Award, Briefcase, Building2, DollarSign, Stethoscope } from "lucide-react"
import { useMemo, type ReactNode } from "react"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { PlayerLink, TeamLink } from "@/components/ui/EntityLink"
import { t } from "@/lib/i18n"
import { formatGameCalendarDate, gameCalendarDate } from "@/lib/game-calendar"
import { newsContent, newsTitle } from "@/lib/news-text"

// Hoisted: built once at module load instead of per item per render.
const CATEGORY_ICON_MAP: Record<string, ReactNode> = {
    MATCH: <Zap size={14} />,
    TRANSFER: <Users size={14} />,
    TOURNAMENT: <Trophy size={14} />,
    ACHIEVEMENT: <Award size={14} />,
    LEVEL_UP: <Zap size={14} />,
    INJURY: <Stethoscope size={14} />,
    FINANCE: <DollarSign size={14} />,
    FACILITY: <Building2 size={14} />,
    STAFF: <Briefcase size={14} />,
    RETIREMENT: <Award size={14} />,
}
const CATEGORIES = new Set(["MATCH", "TRANSFER", "TOURNAMENT", "ACHIEVEMENT", "LEVEL_UP", "INJURY", "FINANCE", "FACILITY", "STAFF", "RETIREMENT"])
const FALLBACK_ICON = <Newspaper size={14} />

/** News list: crest or category icon, headline, source line, two-line summary. */
export function NewsFeed({ limit }: { limit?: number }) {
    const { newsFeed, gameStartDate, completedMatches, teams } = useGameStore(useShallow(state => ({
        newsFeed: state.newsFeed,
        gameStartDate: state.gameStartDate,
        completedMatches: state.completedMatches,
        teams: state.teams,
    })))

    // O(1) lookups for the render loop.
    const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])
    const teamByRosterPlayerId = useMemo(() => {
        const m = new Map<string, typeof teams[number]>()
        for (const t of teams) {
            for (const pid of t.rosterIds || []) m.set(pid, t)
        }
        return m
    }, [teams])

    // Newest week first. Items of one week keep their stored order (newest
    // first): the week tick and match results add to the feed at different
    // times, so the stored array can jump back and forth in time (HOME-07).
    const sorted = useMemo(() => (newsFeed ?? []).map((item, i) => ({ item, i })).sort((a, b) => b.item.week - a.item.week || a.i - b.i).map(x => x.item), [newsFeed])
    // Match day of a result item: stored on newer items, else from the match.
    const dayByMatchId = useMemo(() => new Map(completedMatches.map(m => [m.id, m.day])), [completedMatches])

    if (!newsFeed || newsFeed.length === 0) {
        return (
            <p className="px-4 py-3 text-sm text-ink-3" role="status" aria-live="polite">
                {t("news.empty")}
            </p>
        )
    }

    const items = limit ? sorted.slice(0, limit) : sorted

    return (
        <ul className="divide-y divide-line">
            {items.map((item) => {
                const team = item.teamId
                    ? teamsById.get(item.teamId)
                    : item.playerId
                        ? teamByRosterPlayerId.get(item.playerId)
                        : null

                const categoryKey = item.category ?? "MATCH"
                const categoryIcon = CATEGORY_ICON_MAP[categoryKey] || FALLBACK_ICON
                const categoryLabel = CATEGORIES.has(categoryKey) ? t(`news.category.${categoryKey}`) : t("home.news")

                // The day it happened (a match result: its match day), else the week's first day.
                let dateStr = ""
                try {
                    const day = item.day ?? (item.matchId ? dayByMatchId.get(item.matchId) : undefined) ?? 0
                    const d = gameStartDate ? gameCalendarDate(gameStartDate, item.week, day) : null
                    if (d && !isNaN(d.getTime())) dateStr = formatGameCalendarDate(d, { month: "short", day: "numeric" })
                } catch {
                    // Date parsing failed - leave blank
                }

                return (
                    <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised text-ink-2">
                            {team ? <TeamLogoDisplay team={team} size={22} /> : categoryIcon}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-snug text-ink-1">
                                {item.playerId ? <PlayerLink id={item.playerId}>{newsTitle(item)}</PlayerLink> : newsTitle(item)}
                            </p>
                            <p className="mt-0.5 text-xs text-ink-3">
                                {categoryLabel}{team && <> · <TeamLink id={team.id}>{team.name}</TeamLink></>}{dateStr ? ` · ${dateStr}` : ""}
                            </p>
                            {item.content && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">{newsContent(item)}</p>}
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}
