"use client"

import { useGameStore } from "@/store/game-store"
import { motion } from "framer-motion"
import { Newspaper, Trophy, Users, Zap, Award, Calendar, Briefcase, Building2, DollarSign, Stethoscope } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"

export function NewsFeed() {
    const { newsFeed, getDateForWeek, teams, players } = useGameStore()

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
                    ? teams.find(t => t.id === item.teamId)
                    : item.playerId
                        ? teams.find(t => t.rosterIds?.includes(item.playerId!))
                        : null
                const player = item.playerId ? players.find(p => p.id === item.playerId) : null

                const categoryIcon = {
                    MATCH: <Zap size={14} />,
                    TRANSFER: <Users size={14} />,
                    TOURNAMENT: <Trophy size={14} />,
                    ACHIEVEMENT: <Award size={14} />,
                    LEVEL_UP: <Zap size={14} />,
                    INJURY: <Stethoscope size={14} className="text-red-400" />,
                    FINANCE: <DollarSign size={14} className="text-emerald-400" />,
                    FACILITY: <Building2 size={14} className="text-blue-400" />,
                    STAFF: <Briefcase size={14} className="text-amber-400" />,
                    RETIREMENT: <Award size={14} className="text-purple-400" />
                }[item.category || "MATCH"] || <Newspaper size={14} />

                const categoryColorMap = {
                    MATCH: "text-blue-400 bg-blue-400/10",
                    TRANSFER: "text-emerald-400 bg-emerald-400/10",
                    TOURNAMENT: "text-amber-400 bg-amber-400/10",
                    ACHIEVEMENT: "text-purple-400 bg-purple-400/10",
                    LEVEL_UP: "text-cyan-400 bg-cyan-400/10",
                    INJURY: "text-red-400 bg-red-400/10",
                    FINANCE: "text-emerald-400 bg-emerald-400/10",
                    FACILITY: "text-blue-400 bg-blue-400/10",
                    STAFF: "text-amber-400 bg-amber-400/10",
                    RETIREMENT: "text-purple-400 bg-purple-400/10"
                }
                const categoryColor = categoryColorMap[item.category as keyof typeof categoryColorMap] || "text-muted-foreground bg-white/5"

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
                                    <div className="flex items-center gap-3 pt-2 text-[9px] font-normal text-white/20 uppercase tracking-widest">
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
