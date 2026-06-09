"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trophy, TrendingUp, Users, ShieldCheck, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SeasonObjectivesProps {
    worldRanking: number
    trophiesThisSeason: number
    followers: number
    /** "STABLE" | "TIGHT" | "RISK" | "CRISIS" | "INSOLVENT" */
    financialState?: string
}

interface Objective {
    id: string
    label: string
    icon: React.ReactNode
    met: boolean
    /** 0..1 progress toward the (adaptive) target. */
    progress: number
    detail: string
}

const fmt = (n: number) => n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `${Math.round(n / 1_000)}k` : `${Math.round(n)}`

/** First threshold strictly above `value`, or null if all are reached. */
function nextThreshold(value: number, ladder: number[]): number | null {
    for (const t of ladder) if (value < t) return t
    return null
}

const RANK_LADDER = [16, 8, 4, 1] // smaller is better; "reached" means rank <= tier
const FAN_LADDER = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000]

/**
 * Derived, motivational season objectives. Pure presentation — no engine or
 * persisted state. Targets are adaptive so there's always a clear next goal:
 * climb the rankings tier by tier, grow the fanbase to the next milestone, win
 * silverware, and keep the books healthy.
 */
export function SeasonObjectives({ worldRanking, trophiesThisSeason, followers, financialState }: SeasonObjectivesProps) {
    // Ranking: find the best tier not yet reached (rank still above it).
    const rankTarget = RANK_LADDER.find(tier => worldRanking > tier) ?? null
    const rankMet = rankTarget === null
    const rankProgress = rankMet ? 1 : Math.max(0, Math.min(1, 1 - (worldRanking - rankTarget) / Math.max(1, worldRanking)))

    // Fans: next milestone above current.
    const fanTarget = nextThreshold(followers, FAN_LADDER)
    const fansMet = fanTarget === null
    const fanProgress = fansMet ? 1 : Math.max(0, Math.min(1, followers / fanTarget))

    const solvent = financialState !== "RISK" && financialState !== "CRISIS" && financialState !== "INSOLVENT"

    const objectives: Objective[] = [
        {
            id: "trophy",
            label: "Win a trophy this season",
            icon: <Trophy size={15} />,
            met: trophiesThisSeason >= 1,
            progress: trophiesThisSeason >= 1 ? 1 : 0,
            detail: trophiesThisSeason >= 1 ? `${trophiesThisSeason} won` : "None yet",
        },
        {
            id: "rank",
            label: rankMet ? "Defend world #1" : `Break into the top ${rankTarget}`,
            icon: <TrendingUp size={15} />,
            met: rankMet,
            progress: rankProgress,
            detail: `World #${worldRanking || "—"}`,
        },
        {
            id: "fans",
            label: fansMet ? "Global fanbase secured" : `Reach ${fmt(fanTarget!)} fans`,
            icon: <Users size={15} />,
            met: fansMet,
            progress: fanProgress,
            detail: `${fmt(followers)} fans`,
        },
        {
            id: "finance",
            label: "Keep the club financially healthy",
            icon: <ShieldCheck size={15} />,
            met: solvent,
            progress: solvent ? 1 : 0,
            detail: financialState ? financialState.charAt(0) + financialState.slice(1).toLowerCase() : "—",
        },
    ]

    const completed = objectives.filter(o => o.met).length

    return (
        <Card className="glass-panel border-white/10 rounded-lg overflow-hidden">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-xs font-normal uppercase tracking-[0.3em] text-white/50">
                    <span>Season Objectives</span>
                    <span className="text-[10px] font-bold text-cyan-400/80 tracking-normal">{completed}/{objectives.length}</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
                {objectives.map(obj => (
                    <div key={obj.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className={cn("shrink-0", obj.met ? "text-emerald-400" : "text-white/40")}>
                                    {obj.met ? <CheckCircle2 size={15} /> : obj.icon}
                                </span>
                                <span className={cn("text-xs font-medium truncate", obj.met ? "text-white/80 line-through decoration-emerald-400/40" : "text-white/80")}>
                                    {obj.label}
                                </span>
                            </div>
                            <span className="text-[10px] font-mono text-white/40 shrink-0">{obj.detail}</span>
                        </div>
                        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                            <div
                                className={cn("h-full rounded-full transition-all duration-700", obj.met ? "bg-emerald-400/70" : "bg-cyan-400/50")}
                                style={{ width: `${Math.round(obj.progress * 100)}%` }}
                            />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
