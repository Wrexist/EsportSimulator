"use client"

import React from "react"
import { motion } from "framer-motion"
import { Trophy, ChevronRight, AlertTriangle, Award } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TeamLogoImage } from "@/components/ui/asset-images"
import { getStakes as sharedGetStakes } from "@/lib/match-stakes"

import { formatCurrency } from "@/lib/utils-extended"
interface MatchOutcome {
    won: boolean
    advanced?: boolean       // true = advanced, false = eliminated
    nextStageName?: string   // e.g. "Semi-Finals"
    isChampion?: boolean     // won the grand final
}

interface TournamentMatchContextProps {
    tournamentName?: string
    tournamentLogo?: string
    tournamentTier?: string
    currentStage?: string
    matchFormat?: string
    prizePool?: number
    isElimination?: boolean
    nextStage?: string
    className?: string
    outcome?: MatchOutcome
}

// Re-export the canonical stakes derivation from lib/match-stakes so
// every screen (tactics, result, pre-match popup) shares one vocabulary.
const getStakes = sharedGetStakes

// Helper to get tier styling
function getTierStyle(tier?: string) {
    switch (tier?.toUpperCase()) {
        case "S_TIER":
            return { bg: "bg-gold/[0.06]", border: "border-gold/40", text: "text-gold", label: "S-TIER" }
        case "A_TIER":
            return { bg: "bg-hover", border: "border-line-strong", text: "text-ink-1", label: "A-TIER" }
        case "B_TIER":
            return { bg: "bg-hover", border: "border-line-strong", text: "text-ink-1", label: "B-TIER" }
        case "C_TIER":
            return { bg: "bg-positive/10", border: "border-positive/40", text: "text-positive", label: "C-TIER" }
        case "QUALIFIER":
            return { bg: "bg-slate-500/10", border: "border-slate-500/30", text: "text-slate-400", label: "QUALIFIER" }
        default:
            return { bg: "bg-raised", border: "border-line", text: "text-ink-2", label: tier || "TOURNAMENT" }
    }
}

export function TournamentMatchContext({
    tournamentName,
    tournamentLogo,
    tournamentTier,
    currentStage,
    matchFormat,
    prizePool,
    isElimination = true,
    nextStage,
    className,
    outcome
}: TournamentMatchContextProps) {
    if (!tournamentName) return null

    const tierStyle = getTierStyle(tournamentTier)
    const stakes = getStakes(currentStage || "", isElimination, nextStage)
    // Fix: Only mark as grand final for actual grand finals, not quarter-finals
    const stageLower = currentStage?.toLowerCase() || ""
    const isGrandFinal = stageLower.includes("grand final") ||
        stageLower === "final" ||
        stageLower === "finals" ||
        (stageLower.includes("final") && !stageLower.includes("semi") && !stageLower.includes("quarter"))

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "bg-panel border-line overflow-hidden",
                isGrandFinal && "border-gold/40",
                className
            )}
        >
            {/* Header with Tournament Info */}
            <div className={cn("p-4 flex items-center gap-4", tierStyle.bg)}>
                {/* Tournament Logo */}
                <div className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center shrink-0",
                    tierStyle.bg, tierStyle.border, "border"
                )}>
                    {tournamentLogo ? (
                        <TeamLogoImage src={tournamentLogo} alt={tournamentName} size={48} />
                    ) : (
                        <Trophy className={cn("w-7 h-7", tierStyle.text)} />
                    )}
                </div>

                {/* Tournament Name & Stage */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Badge className={cn("text-[11px] font-bold px-2", tierStyle.bg, tierStyle.text, "border-none")}>
                            {tierStyle.label}
                        </Badge>
                        {isGrandFinal && (
                            <Badge className="text-[11px] font-bold px-2 bg-gold/15 text-gold border-none animate-pulse">
                                GRAND FINAL
                            </Badge>
                        )}
                    </div>
                    <h3 className="text-lg font-bold text-ink-1 uppercase tracking-tight truncate">
                        {tournamentName}
                    </h3>
                    <p className="text-[11px] text-ink-3 uppercase tracking-widest mt-0.5">
                        {currentStage || "Tournament Match"}
                    </p>
                </div>

                {/* Format Badge */}
                <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary" className="text-[11px] font-bold uppercase tracking-wider bg-raised border-line">
                        {matchFormat || "BO1"}
                    </Badge>
                    {prizePool && prizePool > 0 && (
                        <span className="text-[11px] text-positive tabular-nums">
                            {formatCurrency(prizePool, "$", false)}
                        </span>
                    )}
                </div>
            </div>

            {/* Post-match outcome or pre-match stakes */}
            {outcome ? (
                <motion.div
                    className={cn(
                        "p-5 border-t border-line flex items-center gap-4",
                        outcome.won
                            ? outcome.isChampion ? "bg-gold/[0.06]" : "bg-positive/10"
                            : "bg-negative/10"
                    )}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                        outcome.won
                            ? outcome.isChampion
                                ? "bg-gold/15 border-gold/40"
                                : "bg-positive/10 border-positive/40"
                            : "bg-negative/10 border-negative/40"
                    )}>
                        {outcome.won
                            ? outcome.isChampion
                                ? <Trophy className="w-5 h-5 text-gold" />
                                : <ChevronRight className="w-5 h-5 text-positive" />
                            : <AlertTriangle className="w-5 h-5 text-negative" />
                        }
                    </div>
                    <div>
                        <p className={cn(
                            "text-[11px] font-bold uppercase tracking-widest mb-1",
                            outcome.won
                                ? outcome.isChampion ? "text-gold" : "text-positive"
                                : "text-negative"
                        )}>
                            {outcome.won
                                ? outcome.isChampion ? "TOURNAMENT CHAMPION" : "VICTORY"
                                : "DEFEATED"
                            }
                        </p>
                        <p className="text-sm text-ink-1 font-medium">
                            {outcome.won
                                ? outcome.isChampion
                                    ? "Congratulations! You won the tournament!"
                                    : outcome.advanced
                                        ? `Advanced to ${outcome.nextStageName || "next round"}`
                                        : stakes.win
                                : outcome.advanced === false
                                    ? "Eliminated from tournament"
                                    : stakes.loss
                            }
                        </p>
                    </div>
                </motion.div>
            ) : (
                <>
                    {/* Stakes Section */}
                    <div className="grid grid-cols-2 gap-0 border-t border-line">
                        {/* Win Outcome */}
                        <motion.div
                            className="p-4 flex items-start gap-3 border-r border-line bg-positive/10"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <div className="w-8 h-8 rounded-lg bg-positive/10 border border-positive/40 flex items-center justify-center shrink-0">
                                <ChevronRight className="w-5 h-5 text-positive" />
                            </div>
                            <div>
                                <p className="text-[11px] text-positive font-bold uppercase tracking-widest mb-1">
                                    IF YOU WIN
                                </p>
                                <p className="text-sm text-ink-1 font-medium">
                                    {stakes.win}
                                </p>
                            </div>
                        </motion.div>

                        {/* Loss Outcome */}
                        <motion.div
                            className="p-4 flex items-start gap-3 bg-negative/10"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.15 }}
                        >
                            <div className="w-8 h-8 rounded-lg bg-negative/10 border border-negative/40 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-4 h-4 text-negative" />
                            </div>
                            <div>
                                <p className="text-[11px] text-negative font-bold uppercase tracking-widest mb-1">
                                    IF YOU LOSE
                                </p>
                                <p className="text-sm text-ink-2 font-medium">
                                    {stakes.loss}
                                </p>
                            </div>
                        </motion.div>
                    </div>

                    {/* Grand Final Special Banner */}
                    {isGrandFinal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="p-3 bg-raised border-t border-gold/40 flex items-center justify-center gap-2"
                        >
                            <Award className="w-4 h-4 text-gold" />
                            <span className="text-[11px] font-bold text-gold uppercase tracking-widest">
                                Championship Match - History Awaits
                            </span>
                            <Award className="w-4 h-4 text-gold" />
                        </motion.div>
                    )}
                </>
            )}
        </motion.div>
    )
}
