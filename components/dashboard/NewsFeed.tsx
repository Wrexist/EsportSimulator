"use client"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Newspaper, Trophy, Users, Zap, Award, Briefcase, Building2, DollarSign, Stethoscope } from "lucide-react"
import { format } from "date-fns"
import { useMemo, type ReactNode } from "react"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"

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
const CATEGORY_LABEL: Record<string, string> = {
    MATCH: "Match",
    TRANSFER: "Transfer",
    TOURNAMENT: "Tournament",
    ACHIEVEMENT: "Achievement",
    LEVEL_UP: "Progress",
    INJURY: "Injury",
    FINANCE: "Finance",
    FACILITY: "Facility",
    STAFF: "Staff",
    RETIREMENT: "Retirement",
}
const FALLBACK_ICON = <Newspaper size={14} />

/** News list: crest or category icon, headline, source line, two-line summary. */
export function NewsFeed({ limit }: { limit?: number }) {
    const { newsFeed, getDateForWeek, teams } = useGameStore(useShallow(state => ({
        newsFeed: state.newsFeed,
        getDateForWeek: state.getDateForWeek,
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

    if (!newsFeed || newsFeed.length === 0) {
        return (
            <p className="px-4 py-3 text-sm text-ink-3" role="status" aria-live="polite">
                No headlines yet. Results, signings and upgrades make the news.
            </p>
        )
    }

    const items = limit ? newsFeed.slice(0, limit) : newsFeed

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
                const categoryLabel = CATEGORY_LABEL[categoryKey] || "News"

                let dateStr = ""
                try {
                    const d = getDateForWeek(item.week)
                    if (d && !isNaN(d.getTime())) dateStr = format(d, "MMM d")
                } catch {
                    // Date parsing failed - leave blank
                }

                return (
                    <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised text-ink-2">
                            {team ? <TeamLogoDisplay team={team} size={22} /> : categoryIcon}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-snug text-ink-1">{item.title}</p>
                            <p className="mt-0.5 text-xs text-ink-3">
                                {categoryLabel}{team ? ` · ${team.name}` : ""}{dateStr ? ` · ${dateStr}` : ""}
                            </p>
                            {item.content && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">{item.content}</p>}
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}
