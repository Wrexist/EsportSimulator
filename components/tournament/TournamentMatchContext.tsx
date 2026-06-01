"use client"

import React from "react"
import { motion } from "framer-motion"
import { Trophy, ChevronRight, AlertTriangle, Award } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TeamLogoImage } from "@/components/ui/asset-images"

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

// Helper to determine what happens on win/loss based on stage
function getStakes(stage: string, isElimination: boolean, nextStage?: string): { win: string; loss: string } {
    const stageLower = stage?.toLowerCase() || ""

    if (stageLower.includes("grand final") || stageLower.includes("final") && !stageLower.includes("semi") && !stageLower.includes("quarter")) {
        return {
            win: "Win the tournament!",
            loss: isElimination ? "Runner-up finish" : "Second place"
        }
    }

    if (stageLower.includes("semi")) {
        return {
            win: nextStage || "Advance to Grand Final",
            loss: isElimination ? "Eliminated (3rd-4th place)" : "Drop to losers bracket"
        }
    }

    if (stageLower.includes("quarter")) {
        return {
            win: nextStage || "Advance to Semi-finals",
            loss: isElimination ? "Eliminated (5th-8th place)" : "Drop to losers bracket"
        }
    }

    if (stageLower.includes("round of 16") || stageLower.includes("ro16")) {
        return {
            win: nextStage || "Advance to Quarter-finals",
            loss: isElimination ? "Eliminated" : "Drop to losers bracket"
        }
    }

    if (stageLower.includes("round of 32") || stageLower.includes("ro32")) {
        return {
            win: nextStage || "Advance to Round of 16",
            loss: isElimination ? "Eliminated" : "Drop to losers bracket"
        }
    }

    if (stageLower.includes("swiss")) {
        return {
            win: "Improve record, move toward qualification",
            loss: "Record worsens, risk elimination at 0-3"
        }
    }

    if (stageLower.includes("group")) {
        return {
            win: "Improve group standings",
            loss: "Drop in group standings"
        }
    }

    // Generic
    return {
        win: nextStage || "Advance to next round",
        loss: isElimination ? "Eliminated from tournament" : "Continue in bracket"
    }
}

// Helper to get tier styling
function getTierStyle(tier?: string) {
    switch (tier?.toUpperCase()) {
        case "S_TIER":
            return { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", label: "S-TIER" }
        case "A_TIER":
            return { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", label: "A-TIER" }
        case "B_TIER":
            return { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", label: "B-TIER" }
        case "C_TIER":
            return { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", label: "C-TIER" }
        case "QUALIFIER":
            return { bg: "bg-slate-500/10", border: "border-slate-500/30", text: "text-slate-400", label: "QUALIFIER" }
        default:
            return { bg: "bg-white/5", border: "border-white/10", text: "text-white/60", label: tier || "TOURNAMENT" }
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
                "glass-panel border-white/5 overflow-hidden",
                isGrandFinal && "ring-1 ring-amber-500/30",
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
                        <Badge className={cn("text-[9px] font-bold px-2", tierStyle.bg, tierStyle.text, "border-none")}>
                            {tierStyle.label}
                        </Badge>
                        {isGrandFinal && (
                            <Badge className="text-[9px] font-bold px-2 bg-amber-500/20 text-amber-400 border-none animate-pulse">
                                GRAND FINAL
                            </Badge>
                        )}
                    </div>
                    <h3 className="text-lg font-bold text-white uppercase tracking-tight truncate">
                        {tournamentName}
                    </h3>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                        {currentStage || "Tournament Match"}
                    </p>
                </div>

                {/* Format Badge */}
                <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider bg-white/5 border-white/10">
                        {matchFormat || "BO1"}
                    </Badge>
                    {prizePool && prizePool > 0 && (
                        <span className="text-[10px] text-emerald-400 font-mono">
                            ${prizePool.toLocaleString()}
                        </span>
                    )}
                </div>
            </div>

            {/* Post-match outcome or pre-match stakes */}
            {outcome ? (
                <motion.div
                    className={cn(
                        "p-5 border-t border-white/5 flex items-center gap-4",
                        outcome.won
                            ? outcome.isChampion ? "bg-amber-500/10" : "bg-emerald-500/5"
                            : "bg-red-500/5"
                    )}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                        outcome.won
                            ? outcome.isChampion
                                ? "bg-amber-500/20 border-amber-500/30"
                                : "bg-emerald-500/20 border-emerald-500/30"
                            : "bg-red-500/20 border-red-500/30"
                    )}>
                        {outcome.won
                            ? outcome.isChampion
                                ? <Trophy className="w-5 h-5 text-amber-400" />
                                : <ChevronRight className="w-5 h-5 text-emerald-400" />
                            : <AlertTriangle className="w-5 h-5 text-red-400" />
                        }
                    </div>
                    <div>
                        <p className={cn(
                            "text-[9px] font-bold uppercase tracking-widest mb-1",
                            outcome.won
                                ? outcome.isChampion ? "text-amber-400" : "text-emerald-400"
                                : "text-red-400"
                        )}>
                            {outcome.won
                                ? outcome.isChampion ? "TOURNAMENT CHAMPION" : "VICTORY"
                                : "DEFEATED"
                            }
                        </p>
                        <p className="text-sm text-white font-medium">
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
                    <div className="grid grid-cols-2 gap-0 border-t border-white/5">
                        {/* Win Outcome */}
                        <motion.div
                            className="p-4 flex items-start gap-3 border-r border-white/5 bg-emerald-500/5"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                                <ChevronRight className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest mb-1">
                                    IF YOU WIN
                                </p>
                                <p className="text-sm text-white font-medium">
                                    {stakes.win}
                                </p>
                            </div>
                        </motion.div>

                        {/* Loss Outcome */}
                        <motion.div
                            className="p-4 flex items-start gap-3 bg-red-500/5"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.15 }}
                        >
                            <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-4 h-4 text-red-400" />
                            </div>
                            <div>
                                <p className="text-[9px] text-red-400 font-bold uppercase tracking-widest mb-1">
                                    IF YOU LOSE
                                </p>
                                <p className="text-sm text-white/70 font-medium">
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
                            className="p-3 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 border-t border-amber-500/20 flex items-center justify-center gap-2"
                        >
                            <Award className="w-4 h-4 text-amber-400" />
                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                                Championship Match - History Awaits
                            </span>
                            <Award className="w-4 h-4 text-amber-400" />
                        </motion.div>
                    )}
                </>
            )}
        </motion.div>
    )
}
