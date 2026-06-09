"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trophy, TrendingUp, Users, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { deriveExpectationTier, getTierTargets } from "@/engine/board-expectations"
import type { BoardExpectationTier } from "@/engine/save-types"

interface SeasonObjectivesProps {
    worldRanking: number
    trophiesThisSeason: number
    followers: number
    /** "STABLE" | "TIGHT" | "RISK" | "CRISIS" | "INSOLVENT" */
    financialState?: string
    /** Manager/club reputation, used to derive the board expectation fallback. */
    reputation?: number
    /** Persisted board confidence (0-100). Falls back to a neutral default. */
    boardConfidence?: number
    /** Persisted board expectation tier; derived from stature if absent. */
    boardExpectation?: BoardExpectationTier
    /** Whether the manager is on notice (one bad season from the sack). */
    boardOnNotice?: boolean
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
export function SeasonObjectives({ worldRanking, trophiesThisSeason, followers, financialState, reputation = 50, boardConfidence, boardExpectation, boardOnNotice }: SeasonObjectivesProps) {
    // Board expectation: prefer the persisted tier; otherwise derive from stature
    // so the panel is meaningful even before the first season has been reviewed.
    const tier = boardExpectation ?? deriveExpectationTier(worldRanking, reputation)
    const tierTargets = getTierTargets(tier)
    const confidence = Math.max(0, Math.min(100, boardConfidence ?? 60))
    const confColor = confidence >= 60 ? "bg-emerald-400/70" : confidence >= 30 ? "bg-amber-400/70" : "bg-red-400/70"
    const confText = confidence >= 60 ? "text-emerald-400" : confidence >= 30 ? "text-amber-400" : "text-red-400"
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
                {/* Board expectation + confidence */}
                <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Board Expects</span>
                        {boardOnNotice && (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5">
                                <AlertTriangle size={9} /> On Notice
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-semibold text-white/90 leading-tight">{tierTargets.label}</p>
                    <p className="text-[10px] text-white/40 leading-snug">{tierTargets.blurb}</p>
                    <div className="flex items-center gap-2 pt-0.5">
                        <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold shrink-0">Confidence</span>
                        <div className="h-1.5 flex-1 rounded-full bg-white/5 overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all duration-700", confColor)} style={{ width: `${confidence}%` }} />
                        </div>
                        <span className={cn("text-[10px] font-mono font-bold shrink-0", confText)}>{confidence}</span>
                    </div>
                </div>

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
