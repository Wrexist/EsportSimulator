"use client"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { motion } from "framer-motion"
import { Newspaper, Trophy, Users, Zap, Award, Briefcase, Building2, DollarSign, Stethoscope } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"

// Hoisted: these were being rebuilt for every news item every render
// (newsFeed × 10 icon JSX nodes × N renders). Now built once at module load.
const CATEGORY_ICON_MAP: Record<string, React.ReactNode> = {
    MATCH: <Zap size={14} />,
    TRANSFER: <Users size={14} />,
    TOURNAMENT: <Trophy size={14} />,
    ACHIEVEMENT: <Award size={14} />,
    LEVEL_UP: <Zap size={14} />,
    INJURY: <Stethoscope size={14} className="text-red-400" />,
    FINANCE: <DollarSign size={14} className="text-emerald-400" />,
    FACILITY: <Building2 size={14} className="text-blue-400" />,
    STAFF: <Briefcase size={14} className="text-amber-400" />,
    RETIREMENT: <Award size={14} className="text-purple-400" />,
}
const CATEGORY_COLOR_MAP: Record<string, string> = {
    MATCH: "text-blue-400 bg-blue-400/10",
    TRANSFER: "text-emerald-400 bg-emerald-400/10",
    TOURNAMENT: "text-amber-400 bg-amber-400/10",
    ACHIEVEMENT: "text-purple-400 bg-purple-400/10",
    LEVEL_UP: "text-cyan-400 bg-cyan-400/10",
    INJURY: "text-red-400 bg-red-400/10",
    FINANCE: "text-emerald-400 bg-emerald-400/10",
    FACILITY: "text-blue-400 bg-blue-400/10",
    STAFF: "text-amber-400 bg-amber-400/10",
    RETIREMENT: "text-purple-400 bg-purple-400/10",
}
const FALLBACK_ICON = <Newspaper size={14} />
const FALLBACK_COLOR = "text-muted-foreground bg-white/5"

export function NewsFeed() {
    const { newsFeed, getDateForWeek, teams, players } = useGameStore(useShallow(state => ({
        newsFeed: state.newsFeed,
        getDateForWeek: state.getDateForWeek,
        teams: state.teams,
        players: state.players,
    })))

    // O(1) lookups for the render loop. Was previously doing two `teams.find`
    // and one `players.find` per news item — O(items × (2·teams + players)).
    // On a long save this dwarfed everything else on the dashboard.
    const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])
    const playersById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
    const teamByRosterPlayerId = useMemo(() => {
        const m = new Map<string, typeof teams[number]>()
        for (const t of teams) {
            for (const pid of t.rosterIds || []) m.set(pid, t)
        }
        return m
    }, [teams])

    if (!newsFeed || newsFeed.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground/30">
                <Newspaper size={48} className="mb-4 opacity-10" />
                <p className="text-[10px] font-normal uppercase tracking-[0.2em]">Zero News Headlines</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {newsFeed.map((item, idx) => {
                const team = item.teamId
                    ? teamsById.get(item.teamId)
                    : item.playerId
                        ? teamByRosterPlayerId.get(item.playerId)
                        : null
                const player = item.playerId ? playersById.get(item.playerId) : null

                // Same key for both lookups so an unknown category never picks up a
                // MATCH icon next to a "default" colour swatch.
                const categoryKey = item.category ?? "MATCH"
                const categoryIcon = CATEGORY_ICON_MAP[categoryKey] || FALLBACK_ICON
                const categoryColor = CATEGORY_COLOR_MAP[categoryKey] || FALLBACK_COLOR

                // Safe Date Formatting
                let dateStr = "Recent"
                try {
                    const d = getDateForWeek(item.week)
                    if (d && !isNaN(d.getTime())) {
                        dateStr = format(d, "MMM d")
                    }
                } catch {
                    // Date parsing failed - use default
                }

                return (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        key={item.id}
                        className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all group cursor-default relative overflow-hidden"
                    >
                        <div className="flex items-start gap-4 relative z-10">
                            {/* Category Icon / Team Logo */}
                            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0", team ? "bg-white/5" : categoryColor)}>
                                {team ? (
                                    <TeamLogoDisplay team={team} size={24} />
                                ) : categoryIcon}
                            </div>

                            <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between">
                                    <Badge variant="outline" className={cn("text-[8px] font-normal uppercase tracking-widest px-2 py-0 border-none", categoryColor)}>
                                        {item.category}
                                    </Badge>
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase">
                                        {dateStr}
                                    </span>
                                </div>

                                <h4 className="text-sm font-normal text-white leading-tight tracking-tight group-hover:text-primary transition-colors">
                                    {item.title}
                                </h4>
                                {team && (
                                    <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                                        {team.name}
                                    </span>
                                )}
                                <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
                                    {item.content}
                                </p>

                                {item.engagement && (
                                    <div className="flex items-center gap-3 pt-2 text-[9px] font-normal text-white/55 uppercase tracking-widest">
                                        <span className="flex items-center gap-1 group-hover:text-red-400/50 transition-colors">
                                            ❤️ {item.engagement.likes.toLocaleString()}
                                        </span>
                                        <span className="flex items-center gap-1 group-hover:text-blue-400/50 transition-colors">
                                            👁️ {item.engagement.views.toLocaleString()}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Subtle background glow based on category */}
                        <div className={cn("absolute -right-4 -bottom-4 w-24 h-24 blur-[40px] opacity-10 rounded-full", categoryColor.split(' ')[1])} />
                    </motion.div>
                )
            })}
        </div>
    )
}
