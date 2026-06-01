"use client"

import { useMemo } from "react"
import Image from "next/image"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    TrendingUp,
    TrendingDown,
    Users,
    AlertCircle,
    CheckCircle,
    Briefcase,
    Store,
    ChevronRight,
    PieChart,
    Zap,
    Globe,
    BarChart3,
    Activity,
    Shield,
    Flame,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    Wallet
} from "lucide-react"
import { useRouter } from "next/navigation"
import { EconomyManager } from "@/engine/economy-manager"
import { toast } from "@/lib/toast"
import { motion } from "framer-motion"

const economyManager = new EconomyManager()

// Financial scoring weights and thresholds
const BUDGET_SCORE_MAX = 30
const BUDGET_SCORE_DIVISOR = 500_000
const CASHFLOW_SCORE_MAX = 30
const CASHFLOW_SCORE_HALF = 15
const CASHFLOW_NORM_DIVISOR = 10_000
const RUNWAY_SCORE_MAX = 20
const RUNWAY_WEEKS_FOR_MAX = 52
const SPONSOR_SCORE_PER = 7

const HEALTH_BUDGET_WEIGHT = 25
const HEALTH_BUDGET_DIVISOR = 1_000_000
const HEALTH_CASHFLOW_WEIGHT = 25
const HEALTH_CASHFLOW_HALF = 12.5
const HEALTH_CASHFLOW_NORM = 20_000
const HEALTH_RUNWAY_WEIGHT = 25
const HEALTH_SPONSOR_WEIGHT = 8.33

export default function FinancesPage() {
  const router = useRouter()
  const { playerTeamId, currentWeek, players, staff, contracts } = useGameStore(useShallow(state => ({
    playerTeamId: state.playerTeamId,
    currentWeek: state.currentWeek,
    players: state.players,
    staff: state.staff,
    contracts: state.contracts,
  })))
  const playerTeam = useCurrentTeam()

  // O(1) lookups for the salary table below — was doing `contracts.find(...)`
  // per row plus `players.filter(...includes())` over the full league.
  const contractByPlayerId = useMemo(() => {
    const map = new Map<string, typeof contracts[number]>()
    for (const c of contracts) map.set(c.playerId, c)
    return map
  }, [contracts])
  const rosterPlayers = useMemo(() => {
    if (!playerTeam) return [] as typeof players
    const playersById = new Map(players.map(p => [p.id, p]))
    return (playerTeam.rosterIds || [])
      .map(id => playersById.get(id))
      .filter(Boolean) as typeof players
  }, [players, playerTeam])

  // Cast for EconomyManager since it expects the simpler Team type
  const { report, currentMoney, weeklyIncomeTotal, weeklyExpensesTotal, netCashflow, isPositiveCashflow } = useMemo(() => {
    if (!playerTeam) {
      return {
        report: {} as ReturnType<EconomyManager["generateFinancialReport"]>,
        currentMoney: 0,
        weeklyIncomeTotal: 0,
        weeklyExpensesTotal: 0,
        netCashflow: 0,
        isPositiveCashflow: true,
      }
    }

    const r = economyManager.generateFinancialReport(
      playerTeam,
      players,
      staff,
      contracts
    )
    const money = playerTeam.budget ?? 0
    const incomeTotal = r.weeklyIncome?.total ?? 0
    const expensesTotal = r.weeklyExpenses?.total ?? 0
    const net = r.netCashflow ?? 0
    return { report: r, currentMoney: money, weeklyIncomeTotal: incomeTotal, weeklyExpensesTotal: expensesTotal, netCashflow: net, isPositiveCashflow: net >= 0 }
  }, [playerTeam, players, staff, contracts])
  // === ADVANCED FINANCIAL METRICS (memoized) ===

  const { runwayWeeks, financialGrade, healthScore, projectedBudget } = useMemo(() => {
    const sponsorCount = playerTeam?.sponsors?.length || 0
    // Runway Calculation - How many weeks until insolvency
    const runway = netCashflow < 0
      ? Math.floor(currentMoney / Math.abs(netCashflow))
      : 999 // Infinite if zero or positive cashflow

    // Financial Grade (AAA to F)
    const budgetScore = Math.min(currentMoney / BUDGET_SCORE_DIVISOR, 1) * BUDGET_SCORE_MAX
    const cashflowScore = netCashflow > 0 ? CASHFLOW_SCORE_MAX : Math.max(0, CASHFLOW_SCORE_HALF + (netCashflow / CASHFLOW_NORM_DIVISOR) * CASHFLOW_SCORE_HALF)
    const runwayScore = Math.min(runway / RUNWAY_WEEKS_FOR_MAX, 1) * RUNWAY_SCORE_MAX
    const sponsorScore = sponsorCount * SPONSOR_SCORE_PER
    const totalScore = budgetScore + cashflowScore + runwayScore + sponsorScore

    let grade: { grade: string; color: string; bg: string }
    if (totalScore >= 90) grade = { grade: "AAA", color: "text-emerald-400", bg: "bg-emerald-500/20" }
    else if (totalScore >= 80) grade = { grade: "AA", color: "text-green-400", bg: "bg-green-500/20" }
    else if (totalScore >= 70) grade = { grade: "A", color: "text-lime-400", bg: "bg-lime-500/20" }
    else if (totalScore >= 55) grade = { grade: "B", color: "text-yellow-400", bg: "bg-yellow-500/20" }
    else if (totalScore >= 40) grade = { grade: "C", color: "text-orange-400", bg: "bg-orange-500/20" }
    else if (totalScore >= 25) grade = { grade: "D", color: "text-red-400", bg: "bg-red-500/20" }
    else grade = { grade: "F", color: "text-red-500", bg: "bg-red-500/30" }

    // Health Score (0-100)
    const health = Math.min(100, Math.max(0,
      (currentMoney / HEALTH_BUDGET_DIVISOR) * HEALTH_BUDGET_WEIGHT +
      (netCashflow > 0 ? HEALTH_CASHFLOW_WEIGHT : Math.max(0, HEALTH_CASHFLOW_HALF + (netCashflow / HEALTH_CASHFLOW_NORM) * HEALTH_CASHFLOW_HALF)) +
      Math.min(runway / RUNWAY_WEEKS_FOR_MAX, 1) * HEALTH_RUNWAY_WEIGHT +
      sponsorCount * HEALTH_SPONSOR_WEIGHT
    ))

    // 12-Week Projection
    const projected = Array.from({ length: 12 }, (_, i) => ({
      week: currentWeek + i + 1,
      budget: Math.max(0, currentMoney + (netCashflow * (i + 1))),
      isNegative: currentMoney + (netCashflow * (i + 1)) < 0
    }))

    return { runwayWeeks: runway, financialGrade: grade, healthScore: health, projectedBudget: projected }
  }, [currentMoney, netCashflow, playerTeam?.sponsors?.length, currentWeek])

  if (!playerTeam) {
    return <div className="flex items-center justify-center h-64 gap-2 text-white/50"><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Loading finances...</div>
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* ===== GROUNDBREAKING HERO DASHBOARD ===== */}
      <div className="relative overflow-hidden">
        {/* Ambient Glow Background */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-emerald-500/5 rounded-[3rem] blur-3xl opacity-50 pointer-events-none" />

        <div className="relative glass-panel border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-2xl bg-white/[0.02] overflow-hidden">
          {/* Decorative Elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Title & Health Ring */}
            <div className="lg:col-span-4 flex items-center gap-6">
              {/* Animated Health Ring */}
              <div className="relative">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                  {/* Background Ring */}
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                  {/* Progress Ring */}
                  <motion.circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke={healthScore >= 70 ? "#10b981" : healthScore >= 40 ? "#f59e0b" : "#ef4444"}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${healthScore * 2.64} 264`}
                    initial={{ strokeDasharray: "0 264" }}
                    animate={{ strokeDasharray: `${healthScore * 2.64} 264` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                  />
                </svg>
                {/* Center Score */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <motion.span
                    className="text-2xl font-black text-white"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    {Math.round(healthScore)}
                  </motion.span>
                  <span className="text-[8px] uppercase tracking-widest text-white/50">Health</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary/80">
                  <Wallet className="h-4 w-4" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Financial Command</span>
                </div>
                <h1 className="text-3xl font-black tracking-tight uppercase">
                  Empire's <span className="text-primary">Ledger</span>
                </h1>
              </div>
            </div>

            {/* Center: Key Metrics */}
            <div className="lg:col-span-5 grid grid-cols-3 gap-4">
              {/* Net Worth */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center hover:bg-white/10 transition-all group">
                <p className="text-[8px] uppercase font-bold text-white/40 tracking-widest mb-1">Net Worth</p>
                <motion.p
                  className="text-xl font-black text-white"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  ${(currentMoney / 1000000).toFixed(2)}M
                </motion.p>
                <div className={cn("flex items-center justify-center gap-1 mt-1 text-[10px] font-bold", isPositiveCashflow ? "text-emerald-400" : "text-red-400")}>
                  {isPositiveCashflow ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  <span>${Math.abs(netCashflow).toLocaleString()}/wk</span>
                </div>
              </div>

              {/* Runway */}
              <div className={cn(
                "border rounded-2xl p-4 text-center transition-all group",
                runwayWeeks > 26 ? "bg-emerald-500/10 border-emerald-500/20" :
                  runwayWeeks > 12 ? "bg-yellow-500/10 border-yellow-500/20" :
                    "bg-red-500/10 border-red-500/20 animate-pulse"
              )}>
                <p className="text-[8px] uppercase font-bold text-white/40 tracking-widest mb-1">Runway</p>
                <motion.p
                  className={cn(
                    "text-xl font-black",
                    runwayWeeks > 26 ? "text-emerald-400" : runwayWeeks > 12 ? "text-yellow-400" : "text-red-400"
                  )}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {runwayWeeks >= 999 ? "∞" : runwayWeeks}
                </motion.p>
                <p className="text-[10px] text-white/40">{runwayWeeks >= 999 ? "Profitable" : "Weeks Left"}</p>
              </div>

              {/* Weekly Net */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center hover:bg-white/10 transition-all">
                <p className="text-[8px] uppercase font-bold text-white/40 tracking-widest mb-1">Weekly P/L</p>
                <motion.p
                  className={cn("text-xl font-black", isPositiveCashflow ? "text-emerald-400" : "text-red-400")}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {isPositiveCashflow ? "+" : ""}{netCashflow >= 1000 ? `$${(netCashflow / 1000).toFixed(1)}k` : `$${netCashflow}`}
                </motion.p>
                <p className="text-[10px] text-white/40">This Period</p>
              </div>
            </div>

            {/* Right: Financial Grade */}
            <div className="lg:col-span-3 flex items-center justify-end gap-4">
              <div className="text-right">
                <p className="text-[8px] uppercase font-bold text-white/40 tracking-widest mb-1">Credit Rating</p>
                <p className="text-[10px] text-white/60 max-w-[120px]">
                  {financialGrade.grade === "AAA" ? "Elite Status" :
                    financialGrade.grade === "AA" ? "Excellent" :
                      financialGrade.grade === "A" ? "Strong" :
                        financialGrade.grade === "B" ? "Stable" :
                          financialGrade.grade === "C" ? "At Risk" :
                            "Critical"}
                </p>
              </div>
              <motion.div
                className={cn(
                  "w-20 h-20 rounded-2xl flex items-center justify-center font-black text-3xl border-2 shadow-2xl",
                  financialGrade.bg,
                  financialGrade.color,
                  financialGrade.grade === "AAA" ? "border-emerald-400/50 shadow-emerald-500/20" :
                    financialGrade.grade === "F" ? "border-red-500/50 shadow-red-500/20 animate-pulse" :
                      "border-white/10"
                )}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
              >
                {financialGrade.grade}
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full relative z-10">
        <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl mb-6">
          <TabsTrigger value="overview" className="rounded-lg px-6">Overview</TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-lg px-6">Analytics</TabsTrigger>
          <TabsTrigger value="payroll" className="rounded-lg px-6">Payroll</TabsTrigger>
          <TabsTrigger value="sponsors" className="rounded-lg px-6">Sponsors</TabsTrigger>
          <TabsTrigger value="merch" className="rounded-lg px-6">Merch</TabsTrigger>
        </TabsList>

        <TabsContent value="payroll" className="space-y-6">
          <Card className="bg-white/[0.02] border-white/10">
            <CardHeader>
              <CardTitle>Roster Payroll</CardTitle>
              <CardDescription>Breakdown of weekly wages and performance incentives.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-white/10">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/5 font-bold uppercase text-xs">
                    <tr>
                      <th className="p-4">Player</th>
                      <th className="p-4">Weekly Wage</th>
                      <th className="p-4">Contract Length</th>
                      <th className="p-4">Performance Clauses</th>
                      <th className="p-4 text-right">Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rosterPlayers.map(p => {
                      const contract = contractByPlayerId.get(p.id)
                      const salary = contract?.salaryPerWeek || 0
                      const weeksLeft = (contract?.endWeek || currentWeek) - currentWeek

                      return (
                        <tr key={p.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                          <td className="p-4 flex items-center gap-3">
                            <div className="h-8 w-8 bg-zinc-800 rounded-full flex items-center justify-center overflow-hidden">
                              {p.portraitPath ? <Image src={p.portraitPath} alt={p.nickname} width={32} height={32} className="h-full w-full object-cover" /> : <span className="text-xs font-bold">{p.nickname.substring(0, 1)}</span>}
                            </div>
                            <div>
                              <div className="font-bold">{p.nickname}</div>
                              <div className="text-[10px] text-muted-foreground uppercase">{p.role}</div>
                            </div>
                          </td>
                          <td className="p-4 font-sans">${salary.toLocaleString()}</td>
                          <td className="p-4">
                            <Badge variant="outline" className={cn(weeksLeft < 5 ? "border-red-500/50 text-red-500 bg-red-500/10" : "border-white/10")}>
                              {weeksLeft} Weeks
                            </Badge>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                              {contract?.matchWinBonus ? <span>Win Bonus: <span className="text-green-400">+${contract.matchWinBonus.toLocaleString()}</span></span> : null}
                              {contract?.mvpBonus ? <span>MVP Bonus: <span className="text-amber-400">+${contract.mvpBonus.toLocaleString()}</span></span> : null}
                              {!contract?.matchWinBonus && !contract?.mvpBonus && <span className="opacity-50">None</span>}
                            </div>
                          </td>
                          <td className="p-4 text-right font-sans font-bold">
                            ${(salary * weeksLeft).toLocaleString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Income Breakdown */}
            <Card className="bg-white/[0.02] border-white/10 overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <TrendingUp className="h-24 w-24" />
              </div>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-green-500" />
                  Income Streams
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Sponsorship Payouts</span>
                    <span className="font-bold text-green-400">${report.weeklyIncome.sponsors.toLocaleString()}</span>
                  </div>
                  <Progress value={75} className="h-1 bg-green-500/10" />

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Merchandise (Fanbase)</span>
                    <span className="font-bold text-green-400">${report.weeklyIncome.fanbaseBonus.toLocaleString()}</span>
                  </div>
                  <Progress value={25} className="h-1 bg-green-500/10" />

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">League Revenue Share</span>
                    <span className="font-bold text-green-400">${(report.weeklyIncome.leagueShare || 15000).toLocaleString()}</span>
                  </div>
                  <Progress value={100} className="h-1 bg-green-500/10" />
                </div>
                <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                  <span className="text-md font-bold">Projected Weekly Revenue</span>
                  <span className="text-xl font-normal text-green-500">${weeklyIncomeTotal.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            {/* Expense Breakdown */}
            <Card className="bg-white/[0.02] border-white/10 overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <TrendingDown className="h-24 w-24" />
              </div>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-red-500" />
                  Operational Costs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Roster Salaries</span>
                    <span className="font-bold text-red-400">${report.weeklyExpenses.playerSalaries.toLocaleString()}</span>
                  </div>
                  <Progress value={60} className="h-1 bg-red-500/10" />

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Facility Upkeep</span>
                    <span className="font-bold text-red-400">${report.weeklyExpenses.facilities.toLocaleString()}</span>
                  </div>
                  <Progress value={30} className="h-1 bg-red-500/10" />

                  {(report.weeklyExpenses as any).training > 0 && (
                    <>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Role Training</span>
                        <span className="font-bold text-red-400">${((report.weeklyExpenses as any).training || 0).toLocaleString()}</span>
                      </div>
                      <Progress value={15} className="h-1 bg-red-500/10" />
                    </>
                  )}
                </div>
                <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                  <span className="text-md font-bold">Projected Weekly Burn</span>
                  <span className="text-xl font-normal text-red-500">${weeklyExpensesTotal.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== NEW ANALYTICS TAB ===== */}
        <TabsContent value="analytics" className="space-y-6">
          {/* 12-Week Budget Projection */}
          <Card className="bg-white/[0.02] border-white/10 overflow-hidden">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    12-Week Budget Projection
                  </CardTitle>
                  <CardDescription>Forecasted budget based on current cash flow</CardDescription>
                </div>
                <Badge variant="outline" className={cn(
                  "text-xs",
                  netCashflow >= 0 ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"
                )}>
                  {netCashflow >= 0 ? "Growth Trend" : "Burn Trend"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {/* Visual Bar Chart */}
              <div className="flex items-end justify-between gap-2 h-48 mb-4">
                {(() => {
                  // Hoist maxBudget out of the per-bar map — was re-running
                  // Math.max + a fresh spread over all bars on every iteration
                  // (O(n²) over 52 projection weeks, ~2700 ops per render).
                  const maxBudget = projectedBudget.reduce(
                    (m, d) => d.budget > m ? d.budget : m,
                    currentMoney,
                  )
                  return projectedBudget.map((data, i) => {
                  const heightPercent = (data.budget / maxBudget) * 100
                  return (
                    <motion.div
                      key={data.week}
                      className="flex-1 flex flex-col items-center gap-2"
                      initial={{ height: 0 }}
                      animate={{ height: "100%" }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <div
                        className={cn(
                          "w-full rounded-t-lg transition-all relative group",
                          data.isNegative ? "bg-red-500/60" : i === 0 ? "bg-primary" : "bg-primary/60"
                        )}
                        style={{ height: `${Math.max(5, heightPercent)}%` }}
                      >
                        {/* Tooltip on hover */}
                        <div className="absolute -top-16 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 border border-white/10 rounded-lg px-3 py-2 text-xs whitespace-nowrap z-10">
                          <p className="font-bold">${(data.budget / 1000).toFixed(0)}k</p>
                          <p className="text-white/50">Week {data.week}</p>
                        </div>
                      </div>
                      <span className="text-[9px] text-white/30">W{data.week}</span>
                    </motion.div>
                  )
                })
                })()}
              </div>

              {/* Projection Summary */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
                <div className="text-center p-3 bg-white/5 rounded-xl">
                  <p className="text-[9px] uppercase text-white/40 tracking-widest">4-Week Forecast</p>
                  <p className={cn("text-lg font-bold", projectedBudget[3]?.isNegative ? "text-red-400" : "text-white")}>
                    ${(projectedBudget[3]?.budget / 1000).toFixed(0)}k
                  </p>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-xl">
                  <p className="text-[9px] uppercase text-white/40 tracking-widest">8-Week Forecast</p>
                  <p className={cn("text-lg font-bold", projectedBudget[7]?.isNegative ? "text-red-400" : "text-white")}>
                    ${(projectedBudget[7]?.budget / 1000).toFixed(0)}k
                  </p>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-xl">
                  <p className="text-[9px] uppercase text-white/40 tracking-widest">12-Week Forecast</p>
                  <p className={cn("text-lg font-bold", projectedBudget[11]?.isNegative ? "text-red-400" : "text-white")}>
                    ${(projectedBudget[11]?.budget / 1000).toFixed(0)}k
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cash Flow Waterfall */}
            <Card className="bg-white/[0.02] border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-primary" />
                  Weekly Cash Flow
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Waterfall visualization */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                    <span className="text-sm text-white/60">Starting Balance</span>
                    <span className="font-bold text-white">${currentMoney.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-emerald-500/10 rounded-xl border-l-4 border-emerald-500">
                    <div className="flex items-center gap-2">
                      <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm text-emerald-400">Income</span>
                    </div>
                    <span className="font-bold text-emerald-400">+${weeklyIncomeTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-xl border-l-4 border-red-500">
                    <div className="flex items-center gap-2">
                      <ArrowDownRight className="h-4 w-4 text-red-400" />
                      <span className="text-sm text-red-400">Expenses</span>
                    </div>
                    <span className="font-bold text-red-400">-${weeklyExpensesTotal.toLocaleString()}</span>
                  </div>
                  <div className={cn(
                    "flex items-center justify-between p-4 rounded-xl border-2",
                    isPositiveCashflow ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"
                  )}>
                    <span className="text-sm font-bold">Projected Ending</span>
                    <span className={cn("text-xl font-bold", isPositiveCashflow ? "text-emerald-400" : "text-red-400")}>
                      ${(currentMoney + netCashflow).toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Financial Insights */}
            <Card className="bg-white/[0.02] border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-5 w-5 text-primary" />
                  Financial Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Dynamic insights based on financial state */}
                {netCashflow < 0 && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-400">Negative Cash Flow</p>
                        <p className="text-xs text-white/60">Consider reducing expenses or signing sponsors to improve runway.</p>
                      </div>
                    </div>
                  </div>
                )}
                {(playerTeam.sponsors?.length || 0) < 3 && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <div className="flex items-start gap-3">
                      <Flame className="h-5 w-5 text-amber-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-amber-400">Untapped Revenue</p>
                        <p className="text-xs text-white/60">{3 - (playerTeam.sponsors?.length || 0)} sponsor slot(s) available. Sign more deals!</p>
                      </div>
                    </div>
                  </div>
                )}
                {runwayWeeks > 52 && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-emerald-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-emerald-400">Strong Position</p>
                        <p className="text-xs text-white/60">Over 1 year runway. Consider investing in upgrades or star players.</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-primary">Next Milestone</p>
                      <p className="text-xs text-white/60">Week {currentWeek + 4}: Evaluate budget performance and adjust strategy.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sponsors" className="space-y-6">
          <Card className="bg-white/[0.02] border-white/10">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-xl font-normal tracking-tight">Sponsorship Summary</CardTitle>
                  <CardDescription>{playerTeam.sponsors?.length || 0}/3 active partnerships</CardDescription>
                </div>
                <Badge variant="outline" className="h-8 border-green-500/20 bg-green-500/5 text-green-400">
                  ${report.weeklyIncome.sponsors.toLocaleString()}/wk
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(playerTeam.sponsors?.length || 0) > 0 ? (
                <div className="space-y-3">
                  {playerTeam.sponsors?.map((sponsor: any) => (
                    <div key={sponsor.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                      <div>
                        <span className="font-medium text-white">{sponsor.name}</span>
                        <Badge className={cn("ml-2 text-[10px]",
                          sponsor.tier === "ELITE" ? "bg-amber-500/20 text-amber-400" :
                          sponsor.tier === "PREMIUM" ? "bg-purple-500/20 text-purple-400" :
                          "bg-blue-500/20 text-blue-400"
                        )}>{sponsor.tier}</Badge>
                      </div>
                      <div className="text-right">
                        <span className="text-green-400 font-bold">${sponsor.weeklyPayout.toLocaleString()}/wk</span>
                        <span className="text-xs text-muted-foreground ml-2">{sponsor.remainingWeeks}w left</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No active sponsors. Visit the Sponsorship Manager to sign deals.</p>
              )}

              <Button
                className="w-full font-bold"
                onClick={() => router.push("/sponsorships")}
              >
                <ChevronRight size={14} className="mr-1" />
                Open Sponsorship Manager
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="merch" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-white/[0.02] border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-widest flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Hype Factor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <p className="text-4xl font-normal">{playerTeam.merchHype || 10}</p>
                  <Badge className="bg-green-500/20 text-green-500 border-green-500/30">+15% Heat</Badge>
                </div>
                <Progress value={playerTeam.merchHype || 10} className="h-1 mt-4" />
              </CardContent>
            </Card>

            <Card className="bg-white/[0.02] border-white/10 relative group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-widest flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Global Followers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-4xl font-normal">{(playerTeam.followers || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tighter">Social Reach</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <Badge variant="outline" className="text-[10px] border-primary/20 bg-primary/5 text-primary mb-1">
                      Tier {playerTeam.merchStoreLevel || 1} Store
                    </Badge>
                    <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold">
                      <TrendingUp size={12} />
                      Organic Growth
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/[0.02] border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-widest flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  Weekly Sales
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <p className="text-4xl font-normal">${report.weeklyIncome.fanbaseBonus.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mb-1">Global Revenue</p>
                </div>
                <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground">
                  <span>Conversion Rate</span>
                  <span className="text-white">{(report.merchandiseSales.hypeMultiplier * 1.5).toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white/[0.02] border-white/10 overflow-hidden relative group p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-50 group-hover:opacity-70 transition-opacity" />
              <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/20 rounded-2xl">
                    <Store className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-normal">Logistics Suite</h2>
                    <p className="text-sm text-muted-foreground">Current Level: {playerTeam.merchStoreLevel || 1} / 5</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Upgrading your logistics suite increases warehouse efficiency and unlocks new merchandise categories. Higher levels directly multiply your weekly conversion rates.
                </p>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    <span>Upgrade Progress</span>
                    <span>Level {playerTeam.merchStoreLevel || 1}</span>
                  </div>
                  <Progress value={(playerTeam.merchStoreLevel || 1) * 20} className="h-1.5" />
                </div>

                <Button
                  className="w-full h-12 text-md font-bold"
                  variant={(playerTeam.merchStoreLevel || 1) < 5 ? "default" : "outline"}
                  disabled={(playerTeam.merchStoreLevel || 1) >= 5}
                  onClick={() => {
                    const res = useGameStore.getState().upgradeMerchStore(playerTeam.id)
                    if (res.success) toast.success(res.message)
                    else toast.error(res.message)
                  }}
                >
                  {(playerTeam.merchStoreLevel || 1) < 5 ? (
                    `Upgrade to Level ${(playerTeam.merchStoreLevel || 1) + 1} ($${(50000 * Math.pow(2, (playerTeam.merchStoreLevel || 1) - 1)).toLocaleString()})`
                  ) : (
                    "Maximum Level Reached"
                  )}
                </Button>
              </div>
            </Card>

            <Card className="bg-white/[0.02] border-white/10 p-8 space-y-6">
              <div className="flex items-center gap-3">
                <Briefcase className="h-6 w-6 text-primary" />
                <h3 className="text-xl font-bold">Inventory Catalog</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { id: "JERSEY", name: "Pro Jersey", level: 1 },
                  { id: "HOODIE", name: "Team Hoodie", level: 2 },
                  { id: "CAP", name: "Logo Cap", level: 3 },
                  { id: "CHAIR", name: "Gaming Series", level: 4 },
                  { id: "KEYBOARD", name: "Signature Deck", level: 5 },
                ].map(item => {
                  const isUnlocked = (playerTeam.merchStoreLevel || 1) >= item.level
                  const isActive = playerTeam.activeMerchItems?.includes(item.id)
                  return (
                    <button
                      key={item.id}
                      disabled={!isUnlocked}
                      onClick={() => useGameStore.getState().toggleMerchItem(playerTeam.id, item.id)}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-xl border transition-all text-left",
                        isUnlocked
                          ? isActive
                            ? "bg-primary/20 border-primary shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                            : "bg-white/5 border-white/10 hover:border-white/20"
                          : "bg-black/20 border-white/5 opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="space-y-1">
                        <p className="font-bold text-sm">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {isUnlocked ? (isActive ? "Selling" : "Inactive") : `Unlocks at Lvl ${item.level}`}
                        </p>
                      </div>
                      {isUnlocked && (
                        <div className={cn("h-2 w-2 rounded-full", isActive ? "bg-primary" : "bg-neutral-600")} />
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl space-y-2">
                <p className="text-[10px] uppercase font-bold text-primary tracking-widest">Revenue Impact</p>
                <p className="text-xs text-muted-foreground leading-tight">
                  Each active item increases your conversion potential. Diversifying your catalog helps capture more value from your {playerTeam.followers?.toLocaleString()} followers.
                </p>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
