"use client"

import React, { useMemo, memo } from "react"
import { motion } from "framer-motion"
import { DollarSign, TrendingUp, TrendingDown, Clock, PieChart, ArrowUpRight, ArrowDownLeft, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"

const CATEGORY_COLORS: Record<string, string> = {
    SALARY: "#ef4444", // red-500
    FACILITY: "#f97316", // orange-500
    EQUIPMENT: "#eab308", // yellow-500
    TRANSFER: "#3b82f6", // blue-500
    OTHER: "#64748b", // slate-500
    PRIZE: "#10b981", // emerald-500
    SPONSOR: "#8b5cf6", // violet-500
}

function FinanceAppComponent() {
    const { playerTeamId, teams, financeLedger, currentWeek } = useGameStore(useShallow(state => ({
        playerTeamId: state.playerTeamId,
        teams: state.teams,
        financeLedger: state.financeLedger,
        currentWeek: state.currentWeek,
    })))
    const team = teams.find(t => t.id === playerTeamId)

    // Filter ledger for this team
    const transactions = useMemo(() => {
        return financeLedger
            .filter(entry => entry.teamId === playerTeamId)
            .sort((a, b) => b.week - a.week || financeLedger.indexOf(b) - financeLedger.indexOf(a)) // Sort by week desc, then index (newest first)
    }, [financeLedger, playerTeamId])

    const expenseBreakdown = useMemo(() => {
        const cats: Record<string, number> = {}
        let total = 0
        transactions.filter(t => t.type === "EXPENSE").forEach(t => {
            const cat = t.category || "OTHER"
            cats[cat] = (cats[cat] || 0) + t.amount
            total += t.amount
        })
        return { cats, total }
    }, [transactions])

    if (!team) return <div className="p-4 text-white">Team not found</div>

    const lastWeekTransactions = transactions.filter(t => t.week === currentWeek - 1)

    // Runway calculation
    const expenses = lastWeekTransactions.filter(t => t.type === "EXPENSE").reduce((acc, t) => acc + t.amount, 0)
    const weeklyBurn = Math.abs(expenses)
    const runway = weeklyBurn > 0 ? Math.floor(team.budget / weeklyBurn) : 999

    // Generate conic gradient
    const getConicGradient = () => {
        if (expenseBreakdown.total === 0) return "conic-gradient(#334155 0% 100%)"

        let currentPos = 0
        const stops = Object.entries(expenseBreakdown.cats).map(([cat, amount]) => {
            const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.OTHER
            const percentage = (amount / expenseBreakdown.total) * 100
            const start = currentPos
            currentPos += percentage
            return `${color} ${start}% ${currentPos}%`
        })
        return `conic-gradient(${stops.join(", ")})`
    }

    return (
        <div className="flex flex-col h-full bg-black/40 text-white">
            {/* Overview Cards */}
            <div className="p-6 grid grid-cols-3 gap-4 border-b border-white/5 bg-white/[0.02]">
                <div className="p-4 bg-gradient-to-br from-emerald-900/40 to-emerald-950/40 rounded-xl border border-emerald-500/20">
                    <div className="flex items-center gap-2 text-emerald-400 mb-1">
                        <Wallet size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Current Balance</span>
                    </div>
                    <div className="text-2xl font-normal text-white">${team.budget.toLocaleString()}</div>
                </div>

                <div className="p-4 bg-gradient-to-br from-blue-900/40 to-blue-950/40 rounded-xl border border-blue-500/20">
                    <div className="flex items-center gap-2 text-blue-400 mb-1">
                        <TrendingUp size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Weekly Net</span>
                    </div>
                    <div className={cn("text-2xl font-normal", (team.weeklyNet || 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {(team.weeklyNet || 0) >= 0 ? "+" : ""}${(team.weeklyNet || 0).toLocaleString()}
                    </div>
                </div>

                <div className="p-4 bg-gradient-to-br from-purple-900/40 to-purple-950/40 rounded-xl border border-purple-500/20">
                    <div className="flex items-center gap-2 text-purple-400 mb-1">
                        <Clock size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Runway</span>
                    </div>
                    <div className="text-2xl font-normal text-white">
                        {runway > 52 ? ">1 Year" : `${runway} Weeks`}
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Breakdowns */}
                <div className="w-64 border-r border-white/5 bg-white/[0.01] p-4 overflow-y-auto custom-scrollbar">
                    <div className="mb-6">
                        <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <PieChart size={14} /> Expenses (All Time)
                        </h3>

                        <div className="flex justify-center mb-6">
                            <div
                                className="w-32 h-32 rounded-full relative shadow-xl shadow-black/50"
                                style={{ background: getConicGradient() }}
                            >
                                <div className="absolute inset-2 bg-neutral-900 rounded-full flex items-center justify-center flex-col">
                                    <span className="text-[10px] text-white/40">Total</span>
                                    <span className="text-xs font-bold text-white">${(expenseBreakdown.total / 1000000).toFixed(1)}M</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {Object.entries(expenseBreakdown.cats)
                                .sort((a, b) => b[1] - a[1])
                                .map(([cat, amount]) => (
                                    <div key={cat} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] || CATEGORY_COLORS.OTHER }} />
                                            <span className="text-white/70 capitalize">{cat.toLowerCase()}</span>
                                        </div>
                                        <div className="text-white font-mono">${(amount / 1000).toFixed(0)}k</div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </div>

                {/* Transaction List */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between text-[10px] text-white/40 uppercase tracking-wider bg-white/[0.01]">
                        <span>Transaction History</span>
                        <span>Recent Activity</span>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        {transactions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-white/30">
                                <PieChart size={48} className="mb-4 opacity-50" />
                                <p className="text-sm">No transactions yet</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {transactions.map((t, idx) => (
                                    <motion.div
                                        key={`${t.week}-${idx}`}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={cn(
                                                "w-10 h-10 rounded-full flex items-center justify-center shrink-0 border",
                                                t.type === "INCOME" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"
                                            )}>
                                                {t.type === "INCOME" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm text-white">{t.description}</div>
                                                <div className="flex items-center gap-2 text-xs text-white/40">
                                                    <Badge variant="outline" className="h-4 px-1 text-[9px] border-white/10 text-white/50">
                                                        Week {t.week}
                                                    </Badge>
                                                    <span style={{ color: CATEGORY_COLORS[t.category] || "#94a3b8" }}>{t.category}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={cn(
                                                "font-mono font-bold",
                                                t.type === "INCOME" ? "text-emerald-400" : "text-white"
                                            )}>
                                                {t.type === "INCOME" ? "+" : "-"}${t.amount.toLocaleString()}
                                            </div>
                                            <div className="text-[10px] text-white/30 font-mono">
                                                Balance: ${t.balance?.toLocaleString()}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export const FinanceApp = memo(FinanceAppComponent)
