"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { IntegrityChecker, IntegrityIssue } from "@/engine/integrity-checker"
import { simulationEngineV2 } from "@/engine/match-simulation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
    AlertTriangle,
    CheckCircle,
    Download,
    Play,
    RefreshCw,
    Zap,
    Trash2,
    Swords,
    Database,
    Users,
    Trophy,
    Calendar,
    DollarSign,
    Activity,
    Server,
    Shield,
    RotateCcw,
    Home,
    Clock,
    Cpu
} from "lucide-react"
import { MapId } from "@/types"
import Link from "next/link"
import { isDevToolsEnabled } from "@/lib/runtime-flags"

interface HealthCheckResult {
    category: string
    status: "OK" | "WARN" | "ERROR"
    message: string
    value?: string | number
}

export default function DevPage() {
    const devToolsEnabled = isDevToolsEnabled()
    // Was `useGameStore()` (no selector), which subscribes to the entire
    // store and re-renders Dev tools on every mutation across the whole game
    // tick. Pull only what's read here via shallow-equality.
    const store = useGameStore(useShallow(s => ({
        teams: s.teams,
        players: s.players,
        scheduledMatches: s.scheduledMatches,
        completedMatches: s.completedMatches,
        tournaments: s.tournaments,
        playerTeamId: s.playerTeamId,
        currentWeek: s.currentWeek,
        isInitialized: s.isInitialized,
        saveId: s.saveId,
        advanceWeek: s.advanceWeek,
        deleteAllSaves: s.deleteAllSaves,
        debugTriggerInjury: s.debugTriggerInjury,
        clearActiveMatchState: s.clearActiveMatchState,
    })))
    const router = useRouter()
    const [issues, setIssues] = useState<IntegrityIssue[]>([])
    const [status, setStatus] = useState("")
    const [statusLog, setStatusLog] = useState<string[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [determinismResult, setDeterminismResult] = useState<string | null>(null)
    const [confirmNuke, setConfirmNuke] = useState(false)
    const [healthResults, setHealthResults] = useState<HealthCheckResult[]>([])
    const [showHealthDetails, setShowHealthDetails] = useState(false)

    useEffect(() => {
        if (!devToolsEnabled) {
            router.replace("/")
        }
    }, [devToolsEnabled, router])

    if (!devToolsEnabled) {
        return null
    }

    const log = (message: string) => {
        const timestamp = new Date().toLocaleTimeString()
        setStatusLog(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)])
        setStatus(message)
    }

    // Calculate game stats
    const stats = {
        teams: store.teams?.length || 0,
        players: store.players?.length || 0,
        matches: store.scheduledMatches?.length || 0,
        completedMatches: store.completedMatches?.length || 0,
        tournaments: store.tournaments?.length || 0,
        budget: store.teams?.find(t => t.id === store.playerTeamId)?.budget || 0,
        currentWeek: store.currentWeek || 0,
        isInitialized: store.isInitialized || false,
        saveId: store.saveId || "None"
    }

    const runHealthCheck = () => {
        log("Running comprehensive health check...")
        const results: HealthCheckResult[] = []
        const state = useGameStore.getState()

        // Check initialization
        results.push({
            category: "Initialization",
            status: state.isInitialized ? "OK" : "WARN",
            message: state.isInitialized ? "Game is initialized" : "Game not initialized",
            value: state.isInitialized ? "Ready" : "Not Ready"
        })

        // Check teams
        results.push({
            category: "Teams",
            status: state.teams.length >= 10 ? "OK" : state.teams.length > 0 ? "WARN" : "ERROR",
            message: `${state.teams.length} teams loaded`,
            value: state.teams.length
        })

        // Check players
        results.push({
            category: "Players",
            status: state.players.length >= 50 ? "OK" : state.players.length > 0 ? "WARN" : "ERROR",
            message: `${state.players.length} players loaded`,
            value: state.players.length
        })

        // Check roster integrity
        const orphanedPlayers = state.players.filter(p =>
            !state.teams.some(t => t.rosterIds.includes(p.id))
        )
        results.push({
            category: "Roster Integrity",
            status: orphanedPlayers.length === 0 ? "OK" : "WARN",
            message: orphanedPlayers.length === 0 ? "All players assigned to teams" : `${orphanedPlayers.length} orphaned players`,
            value: orphanedPlayers.length
        })

        // Check scheduled matches
        results.push({
            category: "Match Schedule",
            status: state.scheduledMatches.length > 0 ? "OK" : "WARN",
            message: `${state.scheduledMatches.length} matches scheduled`,
            value: state.scheduledMatches.length
        })

        // Check player team
        const playerTeam = state.teams.find(t => t.id === state.playerTeamId)
        results.push({
            category: "Player Team",
            status: playerTeam ? "OK" : "WARN",
            message: playerTeam ? `Managing: ${playerTeam.name}` : "No player team selected",
            value: playerTeam?.name || "None"
        })

        // Check budget
        results.push({
            category: "Budget",
            status: (playerTeam?.budget || 0) > 0 ? "OK" : "WARN",
            message: `Team budget: $${((playerTeam?.budget || 0) / 1000).toFixed(0)}k`,
            value: playerTeam?.budget || 0
        })

        // Check for tournaments
        results.push({
            category: "Tournaments",
            status: state.tournaments?.length > 0 ? "OK" : "WARN",
            message: `${state.tournaments?.length || 0} tournaments configured`,
            value: state.tournaments?.length || 0
        })

        setHealthResults(results)
        setShowHealthDetails(true)
        log(`Health check complete. ${results.filter(r => r.status === "OK").length}/${results.length} checks passed.`)
    }

    const runIntegrityCheck = () => {
        log("Running integrity check...")
        const state = useGameStore.getState()
        const snapshot = JSON.parse(JSON.stringify(state))
        const results = IntegrityChecker.check(snapshot)
        setIssues(results)
        log(`Integrity check complete. ${results.length} issues found.`)
    }

    const runSim = async (weeks: number) => {
        setIsProcessing(true)
        log(`Starting simulation of ${weeks} week(s)...`)
        try {
            for (let i = 0; i < weeks; i++) {
                await store.advanceWeek()
                log(`Week ${store.currentWeek} complete.`)
                await new Promise(r => setTimeout(r, 10))
            }
            log(`✓ Simulation complete. Now at Week ${store.currentWeek}.`)
        } catch (e: any) {
            log(`✗ Error during simulation: ${e.message}`)
        } finally {
            setIsProcessing(false)
        }
    }

    const dumpState = () => {
        const state = useGameStore.getState()
        const data = JSON.stringify(state, null, 2)
        const blob = new Blob([data], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `gamestate_week${state.currentWeek}.json`
        a.click()
        log("State exported to JSON file.")
    }

    const checkDeterminism = () => {
        log("Running determinism test...")
        const seed = 12345
        try {
            const state = useGameStore.getState()
            const t1 = state.teams[0] || { id: "t1", name: "T1", rosterIds: [], budget: 0 } as any
            const t2 = state.teams[1] || { id: "t2", name: "T2", rosterIds: [], budget: 0 } as any
            const p1 = t1.rosterIds.map((id: string) => state.players.find(p => p.id === id)).filter(Boolean) as any[]
            const p2 = t2.rosterIds.map((id: string) => state.players.find(p => p.id === id)).filter(Boolean) as any[]

            if (p1.length < 5 || p2.length < 5) {
                setDeterminismResult("Not enough players to test.")
                log("Determinism: Not enough players.")
                return
            }

            const match: any = { id: "test", seed, format: "BO1", bestOf: 1, homeTeamId: t1.id, awayTeamId: t2.id }
            const res1 = simulationEngineV2.simulateMatch(match, t1 as any, t2 as any, p1, p2)
            const res2 = simulationEngineV2.simulateMatch(match, t1 as any, t2 as any, p1, p2)

            if (JSON.stringify(res1) === JSON.stringify(res2)) {
                setDeterminismResult("PASS: Results identical for same seed.")
                log("✓ Determinism PASS")
            } else {
                setDeterminismResult("FAIL: Results differ!")
                log("✗ Determinism FAIL")
            }
        } catch (e: any) {
            setDeterminismResult(`Error: ${e.message}`)
            log(`✗ Determinism error: ${e.message}`)
        }
    }

    const nukeAllSaves = async () => {
        if (!confirmNuke) {
            setConfirmNuke(true)
            log("⚠️ Click again to confirm NUKE ALL SAVES.")
            return
        }
        setIsProcessing(true)
        log("Nuking all saves...")
        try {
            await store.deleteAllSaves()
            log("✓ All saves deleted. Game state reset.")
            setConfirmNuke(false)
        } catch (e: any) {
            log(`✗ Error: ${e.message}`)
        } finally {
            setIsProcessing(false)
        }
    }

    const resetConfirmNuke = () => {
        if (confirmNuke) {
            setConfirmNuke(false)
            log("Nuke cancelled.")
        }
    }

    const launchTestMatch = () => {
        const state = useGameStore.getState()
        const eliteTeams = state.teams.filter(t => t.tier === "ELITE").slice(0, 2)

        if (eliteTeams.length < 2) {
            log("Not enough elite teams. Start a game first.")
            return
        }

        const [home, away] = eliteTeams
        const testMatchId = `devmatch_${Date.now()}`
        const testMatch = {
            id: testMatchId,
            homeTeamId: home.id,
            awayTeamId: away.id,
            tournamentId: "DEV_TEST",
            stage: "Dev Test",
            week: state.currentWeek || 1,
            format: "BO3" as const,
            seed: Date.now(),
            isScrim: false
        }

        useGameStore.setState(prev => ({
            ...prev,
            scheduledMatches: [...prev.scheduledMatches, testMatch]
        }))

        log(`Launching: ${home.name} vs ${away.name}`)
        router.push(`/match/${testMatchId}/live?maps=${MapId.SANDSTONE},${MapId.MIRAGE},${MapId.INFERNO}`)
    }

    const triggerJobOffer = () => {
        const state = useGameStore.getState()
        state.debugTriggerJobOffer()
        log("Job Offer Triggered! Check Inbox.")
    }

    const addMoney = (amount: number) => {
        const state = useGameStore.getState()
        const playerTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!playerTeam) {
            log("No player team found.")
            return
        }
        useGameStore.setState(prev => ({
            ...prev,
            teams: prev.teams.map(t =>
                t.id === prev.playerTeamId
                    ? { ...t, budget: t.budget + amount }
                    : t
            )
        }))
        log(`Added $${(amount / 1000).toFixed(0)}k to budget.`)
    }

    const getStatusColor = (status: "OK" | "WARN" | "ERROR") => {
        switch (status) {
            case "OK": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
            case "WARN": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
            case "ERROR": return "text-red-400 bg-red-500/10 border-red-500/30"
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center border border-yellow-500/30">
                        <Zap className="h-6 w-6 text-yellow-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-normal text-white">Developer Console</h1>
                        <p className="text-sm text-white/40">Advanced tools for testing and debugging</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/dev/map-builder">
                        <Button variant="outline" size="sm" className="border-white/10">
                            Map Builder
                        </Button>
                    </Link>
                    <Link href="/">
                        <Button variant="outline" size="sm" className="border-white/10">
                            <Home className="mr-2 h-4 w-4" /> Back to Game
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                {[
                    { label: "Week", value: stats.currentWeek, icon: Calendar },
                    { label: "Teams", value: stats.teams, icon: Shield },
                    { label: "Players", value: stats.players, icon: Users },
                    { label: "Matches", value: stats.matches, icon: Swords },
                    { label: "Completed", value: stats.completedMatches, icon: Trophy },
                    { label: "Tournaments", value: stats.tournaments, icon: Trophy },
                    { label: "Budget", value: `$${(stats.budget / 1000).toFixed(0)}k`, icon: DollarSign },
                    { label: "Status", value: stats.isInitialized ? "Active" : "None", icon: Activity }
                ].map((stat, i) => (
                    <div key={i} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-center">
                        <stat.icon className="w-4 h-4 text-white/30 mx-auto mb-1" />
                        <p className="text-lg font-normal text-white">{stat.value}</p>
                        <p className="text-[9px] text-white/30 uppercase tracking-wider">{stat.label}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* Health Check Dashboard */}
                <Card className="border-cyan-500/30 bg-cyan-500/5">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-cyan-400 flex items-center gap-2 text-base">
                            <Activity className="h-4 w-4" /> System Health
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Button onClick={runHealthCheck} className="w-full bg-cyan-600 hover:bg-cyan-700" size="sm">
                            <Cpu className="mr-2 h-4 w-4" /> Run Health Check
                        </Button>
                        {healthResults.length > 0 && (
                            <div className="space-y-1">
                                {healthResults.map((r, i) => (
                                    <div key={i} className={`flex items-center justify-between p-2 rounded-lg border text-xs ${getStatusColor(r.status)}`}>
                                        <span className="font-medium">{r.category}</span>
                                        <span className="font-bold">{r.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Simulation Controls */}
                <Card className="border-white/10">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-white flex items-center gap-2 text-base">
                            <Clock className="h-4 w-4" /> Time Control
                        </CardTitle>
                        <CardDescription>Current Week: {store.currentWeek || 0}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                            <Button onClick={() => runSim(1)} disabled={isProcessing} size="sm" variant="secondary">+1</Button>
                            <Button onClick={() => runSim(5)} disabled={isProcessing} size="sm" variant="secondary">+5</Button>
                            <Button onClick={() => runSim(20)} disabled={isProcessing} size="sm" variant="destructive">+20</Button>
                        </div>
                        <p className="text-[10px] text-white/30">Advance game time by weeks</p>
                    </CardContent>
                </Card>

                {/* Cheats / Quick Actions */}
                <Card className="border-emerald-500/30 bg-emerald-500/5">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-emerald-400 flex items-center gap-2 text-base">
                            <DollarSign className="h-4 w-4" /> Cheats
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                            <Button onClick={() => addMoney(100000)} size="sm" variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">+$100k</Button>
                            <Button onClick={() => addMoney(500000)} size="sm" variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">+$500k</Button>
                            <Button onClick={() => addMoney(1000000)} size="sm" variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">+$1M</Button>
                            <Button onClick={triggerJobOffer} size="sm" variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 col-span-2">Trigger Job Offer</Button>
                            <Button onClick={() => store.debugTriggerInjury()} size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10">Injure P1</Button>
                        </div>
                        <p className="text-[10px] text-white/30">Add money to team budget</p>
                    </CardContent>
                </Card>

                {/* State Tools */}
                <Card className="border-white/10">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-white flex items-center gap-2 text-base">
                            <Database className="h-4 w-4" /> State Management
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <Button onClick={runIntegrityCheck} variant="outline" size="sm" className="border-white/10">
                                <RefreshCw className="mr-1 h-3 w-3" /> Integrity
                            </Button>
                            <Button onClick={dumpState} variant="outline" size="sm" className="border-white/10">
                                <Download className="mr-1 h-3 w-3" /> Export
                            </Button>
                            <Button onClick={checkDeterminism} variant="outline" size="sm" className="border-white/10">
                                <CheckCircle className="mr-1 h-3 w-3" /> Determinism Test
                            </Button>
                            <Button onClick={() => store.clearActiveMatchState()} variant="outline" size="sm" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10">
                                <RotateCcw className="mr-1 h-3 w-3" /> Force Unlock
                            </Button>
                        </div>
                        {determinismResult && (
                            <div className={`p-2 rounded text-xs font-bold ${determinismResult.startsWith("PASS") ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                                {determinismResult}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Sandbox */}
                <Card className="border-blue-500/30 bg-blue-500/5">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-blue-400 flex items-center gap-2 text-base">
                            <Swords className="h-4 w-4" /> Match Sandbox
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Button onClick={launchTestMatch} className="w-full bg-blue-600 hover:bg-blue-700" size="sm">
                            <Play className="mr-2 h-4 w-4" /> Launch Test BO3
                        </Button>
                        <p className="text-[10px] text-white/30">Picks 2 Elite teams, launches live match with commentary</p>
                    </CardContent>
                </Card>

                {/* Danger Zone */}
                <Card className="border-red-500/30 bg-red-500/5">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-red-400 flex items-center gap-2 text-base">
                            <AlertTriangle className="h-4 w-4" /> Danger Zone
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Button
                            onClick={nukeAllSaves}
                            onBlur={resetConfirmNuke}
                            disabled={isProcessing}
                            variant="destructive"
                            size="sm"
                            className={`w-full ${confirmNuke ? "animate-pulse bg-red-700" : ""}`}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {confirmNuke ? "CONFIRM NUKE" : "Nuke All Saves"}
                        </Button>
                        <p className="text-[10px] text-white/30">Permanently deletes all saves. Cannot undo.</p>
                    </CardContent>
                </Card>
            </div>

            {/* Console Log */}
            <Card className="border-white/10">
                <CardHeader className="pb-3">
                    <CardTitle className="text-white flex items-center gap-2 text-base">
                        <Server className="h-4 w-4" /> Console Log
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="bg-black/50 rounded-lg p-4 font-sans text-xs max-h-48 overflow-y-auto space-y-1">
                        {statusLog.length === 0 ? (
                            <span className="text-white/30">Ready. Run a command to see output.</span>
                        ) : (
                            statusLog.map((line, i) => (
                                <div key={i} className={`${line.includes("✓") ? "text-emerald-400" : line.includes("✗") || line.includes("⚠️") ? "text-red-400" : "text-white/60"}`}>
                                    {line}
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Integrity Report */}
            {issues.length > 0 && (
                <Card className="border-orange-500/30">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-orange-400 flex items-center gap-2 text-base">
                            <AlertTriangle className="h-4 w-4" /> Integrity Issues ({issues.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border border-white/10 max-h-60 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-xs">Type</TableHead>
                                        <TableHead className="text-xs">Severity</TableHead>
                                        <TableHead className="text-xs">Message</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {issues.slice(0, 20).map((issue, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="text-xs">{issue.type}</TableCell>
                                            <TableCell>
                                                <Badge variant={issue.severity === "HIGH" ? "destructive" : "secondary"} className="text-[10px]">
                                                    {issue.severity}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-white/60">{issue.message}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
