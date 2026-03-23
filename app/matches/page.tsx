"use client"

import { useGameStore } from "@/store/game-store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, Trophy, Play, Zap, Swords } from "lucide-react"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog"
import { useState, useEffect } from "react"
import { simulationEngineV2, CompletedMatchSaveData, MatchSaveData } from "@/engine"
import { useRouter } from "next/navigation"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

export default function MatchesPage() {
  const router = useRouter()
  const { scheduledMatches, completedMatches, teams, players, playerTeamId, saveMatchResult, advanceWeek, isLoading, staff } = useGameStore()
  const [selectedMatch, setSelectedMatch] = useState<MatchSaveData | null>(null)

  // Quick Sim Dialog State
  const [isSimDialogOpen, setIsSimDialogOpen] = useState(false)
  const [matchToSim, setMatchToSim] = useState<MatchSaveData | null>(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  // Helper to resolve team
  const getTeam = (id: string) => teams.find(t => t.id === id)

  // Filter matches
  const playerMatches = scheduledMatches.filter(
    (m) => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId
  )

  // Sort by week
  playerMatches.sort((a, b) => a.week - b.week)

  // Check LocalStorage on mount to sync 'dontShowAgain' state (optional, or just read on check)
  useEffect(() => {
    const skipped = localStorage.getItem("skipQuickSimConfirm") === "true"
    if (skipped) setDontShowAgain(true)
  }, [])

  const handleQuickSimClick = (match: MatchSaveData) => {
    const skipped = localStorage.getItem("skipQuickSimConfirm") === "true"
    if (skipped) {
      performQuickSim(match)
    } else {
      setMatchToSim(match)
      setIsSimDialogOpen(true)
    }
  }

  const confirmQuickSim = () => {
    if (dontShowAgain) {
      localStorage.setItem("skipQuickSimConfirm", "true")
    }
    if (matchToSim) {
      performQuickSim(matchToSim)
    }
    setIsSimDialogOpen(false)
  }

  const performQuickSim = (match: MatchSaveData) => {
    const hTeam = getTeam(match.homeTeamId)
    const aTeam = getTeam(match.awayTeamId)
    if (!hTeam || !aTeam) return

    const hPlayers = hTeam.rosterIds.map(id => players.find(p => p.id === id)).filter(Boolean) as any[]
    const aPlayers = aTeam.rosterIds.map(id => players.find(p => p.id === id)).filter(Boolean) as any[]

    const matchFormat = match.format === "BO3" ? 3 : match.format === "BO5" ? 5 : 1
    const runtimeMatch: any = {
      id: match.id,
      homeTeamId: hTeam.id,
      awayTeamId: aTeam.id,
      seed: match.seed,
      bestOf: matchFormat,
      format: match.format,
      tournamentId: match.tournamentId
    }

    const mapStaff = (teamData: typeof hTeam) => {
      const staffIds = teamData?.staffIds || []
      const sData = (staff || []).filter((s: any) => staffIds.includes(s.id))
      return {
        coach: sData.find((s: any) => s.role === "coach"),
        analyst: sData.find((s: any) => s.role === "analyst"),
        psychologist: sData.find((s: any) => s.role === "psychologist"),
      }
    }

    const result = simulationEngineV2.simulateMatch(
      runtimeMatch,
      hTeam as any,
      aTeam as any,
      hPlayers,
      aPlayers,
      mapStaff(hTeam) as any,
      mapStaff(aTeam) as any
    )

    saveMatchResult(match.id, result)
    setSelectedMatch(null)
  }

  // Renamed old handleQuickSim to performQuickSim for clarity, removing old usage


  const handlePlayMatch = (matchId: string) => {
    router.push(`/match/${matchId}/veto`)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Matches</h1>
              <p className="text-muted-foreground">Schedule and results</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => advanceWeek()} disabled={isLoading} variant="outline">
                <Clock className="mr-2 h-4 w-4" />
                Advance Week
              </Button>
              <Link href="/">
                <Button variant="outline">Back to Home</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <Tabs defaultValue="upcoming" className="space-y-4">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="history">Match History</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Shared Schedule
                </CardTitle>
                <CardDescription>Your team's upcoming games</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {playerMatches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Calendar className="w-12 h-12 text-white/20 mb-4" />
                    <h3 className="text-lg font-medium text-white/60 mb-2">No Matches Scheduled</h3>
                    <p className="text-sm text-white/40 max-w-md">
                      No matches are scheduled for this period. Check the tournament calendar or advance to the next week.
                    </p>
                  </div>
                ) : (
                  playerMatches.map((match) => {
                    const hTeam = getTeam(match.homeTeamId)
                    const aTeam = getTeam(match.awayTeamId)

                    return (
                      <Card key={match.id} className="hover:bg-accent/50 transition-colors">
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between mb-4">
                            <Badge variant="outline">Week {match.week}</Badge>
                            <Badge variant="secondary">{match.format}</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-center flex-1">
                              <div className="font-bold text-lg">{hTeam?.name}</div>
                            </div>
                            <div className="text-2xl font-bold px-4 text-muted-foreground">VS</div>
                            <div className="text-center flex-1">
                              <div className="font-bold text-lg">{aTeam?.name}</div>
                            </div>
                          </div>
                          <div className="mt-6 flex justify-center gap-3">
                            <Button onClick={() => handlePlayMatch(match.id)} className="w-32">
                              <Play className="mr-2 h-4 w-4" /> Play
                            </Button>

                            <Button
                              variant="secondary"
                              className="w-32"
                              onClick={() => handleQuickSimClick(match)}
                            >
                              <Zap className="mr-2 h-4 w-4" /> Quick Sim
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            {/* Team Summary Stats */}
            {(() => {
              const teamHistory = completedMatches.filter(
                (m: any) => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId
              )
              const summary = teamHistory.reduce((s: any, m: any) => {
                if (!m.result) return s
                const isHome = m.homeTeamId === playerTeamId
                const won = isHome ? m.result.homeScore > m.result.awayScore : m.result.awayScore > m.result.homeScore
                if (won) s.wins++; else s.losses++
                return s
              }, { wins: 0, losses: 0 })
              const total = summary.wins + summary.losses
              const winRate = total > 0 ? Math.round((summary.wins / total) * 100) : 0

              // Current streak
              let streak = 0
              let streakType: string | null = null
              const sorted = [...teamHistory].sort((a: any, b: any) => b.week - a.week)
              for (const m of sorted) {
                if (!m.result) continue
                const isHome = m.homeTeamId === playerTeamId
                const won = isHome ? m.result.homeScore > m.result.awayScore : m.result.awayScore > m.result.homeScore
                const res = won ? "W" : "L"
                if (!streakType) streakType = res
                if (res === streakType) streak++; else break
              }

              return total > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-white/[0.02] border-white/10">
                    <CardContent className="pt-4 pb-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Record</p>
                      <p className="text-2xl font-bold mt-1">{summary.wins}-{summary.losses}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white/[0.02] border-white/10">
                    <CardContent className="pt-4 pb-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Win Rate</p>
                      <p className="text-2xl font-bold mt-1 text-primary">{winRate}%</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white/[0.02] border-white/10">
                    <CardContent className="pt-4 pb-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Current Streak</p>
                      <p className={`text-2xl font-bold mt-1 ${streakType === "W" ? "text-emerald-400" : "text-red-400"}`}>
                        {streak}{streakType}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white/[0.02] border-white/10">
                    <CardContent className="pt-4 pb-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Matches</p>
                      <p className="text-2xl font-bold mt-1">{total}</p>
                    </CardContent>
                  </Card>
                </div>
              ) : null
            })()}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Completed Matches
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {completedMatches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Swords className="w-12 h-12 text-white/20 mb-4" />
                    <h3 className="text-lg font-medium text-white/60 mb-2">No Match History</h3>
                    <p className="text-sm text-white/40 max-w-md">
                      You haven't played any matches yet. Head to the Upcoming tab to play or simulate your first match.
                    </p>
                  </div>
                ) : completedMatches.slice().reverse().map((match) => { // Show newest first
                  const hTeam = getTeam(match.homeTeamId)
                  const aTeam = getTeam(match.awayTeamId)
                  const result = match.result
                  if (!result) return null // Should not happen for CompletedMatchSaveData

                  const isHome = match.homeTeamId === playerTeamId
                  const homeWon = result.homeScore > result.awayScore
                  const won = isHome ? homeWon : !homeWon

                  // Fallback for null result if structure changed
                  if (result.homeScore === undefined) return null

                  return (
                    <Link href={`/match/${match.id}/result`} key={match.id}>
                      <Card className={`mb-4 cursor-pointer hover:ring-2 hover:ring-primary transition-all border-l-4 ${won ? "border-l-green-500" : "border-l-red-500"}`}>
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant={won ? "default" : "destructive"}>{won ? "Victory" : "Defeat"}</Badge>
                              <span className="text-sm text-muted-foreground">Week {match.week}</span>
                            </div>
                            <div className="font-sans font-bold text-xl">
                              {result.homeScore} - {result.awayScore}
                            </div>
                          </div>
                          <div className="flex justify-between mt-2">
                            <span>{hTeam?.name}</span>
                            <span>{aTeam?.name}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isSimDialogOpen} onOpenChange={setIsSimDialogOpen}>
        <DialogContent className="bg-[#0f1115] border-white/10 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Quick Simulation
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Are you sure you want to simulate this match?
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
            <p className="text-sm text-white/80">
              You are changing the outcome to random chance based on team strength. You will skip the veto phase and live playback.
            </p>
            {matchToSim && (
              <div className="flex items-center justify-center gap-4 py-4 font-bold text-lg">
                <span className="text-white">{getTeam(matchToSim.homeTeamId)?.name}</span>
                <span className="text-white/40 text-sm">VS</span>
                <span className="text-white">{getTeam(matchToSim.awayTeamId)?.name}</span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="sim-confirm"
              checked={dontShowAgain}
              onCheckedChange={(c) => setDontShowAgain(c === true)}
              className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
            />
            <Label
              htmlFor="sim-confirm"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-white/70"
            >
              Don't show this again
            </Label>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsSimDialogOpen(false)} className="text-white/50 hover:text-white">
              Cancel
            </Button>
            <Button
              onClick={confirmQuickSim}
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold"
            >
              <Zap className="mr-2 h-4 w-4" />
              Simulate Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
