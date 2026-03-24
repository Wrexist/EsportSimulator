"use client"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Building, UserCheck } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function TeamPage() {
  const { teams, playerTeamId, players, contracts } = useGameStore(useShallow(state => ({
    teams: state.teams,
    playerTeamId: state.playerTeamId,
    players: state.players,
    contracts: state.contracts,
  })))
  const playerTeam = teams.find(t => t.id === playerTeamId)
  const roster = playerTeam?.rosterIds.map(id => players.find(p => p.id === id)).filter((p): p is any => !!p) || []

  if (!playerTeam || roster.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Team Data</CardTitle>
            <CardDescription>Start a new game to manage your team</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button>Go Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const teamChemistry = playerTeam.chemistry
  const avgRating = roster.reduce((sum, p) => sum + (p.skill || 0), 0) / roster.length

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">{playerTeam.name}</h1>
              <p className="text-muted-foreground">
                CS2 • {playerTeam.region}
              </p>
            </div>
            <Link href="/">
              <Button variant="outline">Back to Home</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Team Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-primary">{avgRating.toFixed(1)}</div>
              <div className="text-sm text-muted-foreground">Team Rating</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-500">{teamChemistry}%</div>
              <div className="text-sm text-muted-foreground">Chemistry</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-500">{playerTeam.reputation}</div>
              <div className="text-sm text-muted-foreground">Reputation</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold font-sans text-muted-foreground">${(playerTeam.budget / 1000).toFixed(0)}k</div>
              <div className="text-sm text-muted-foreground">Budget</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="roster" className="space-y-4">
          <TabsList>
            <TabsTrigger value="roster">
              <Users className="mr-2 h-4 w-4" />
              Roster
            </TabsTrigger>
            <TabsTrigger value="facilities">
              <Building className="mr-2 h-4 w-4" />
              Facilities
            </TabsTrigger>
            <TabsTrigger value="staff">
              <UserCheck className="mr-2 h-4 w-4" />
              Staff
            </TabsTrigger>
          </TabsList>

          <TabsContent value="roster" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Roster ({roster.length} players)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {roster.map((player) => {
                  const rating = player.skill
                  const getRatingColor = (r: number) => {
                    if (r >= 85) return "text-green-500"
                    if (r >= 70) return "text-blue-500"
                    if (r >= 50) return "text-yellow-500"
                    return "text-gray-500"
                  }

                  return (
                    <Card key={player.id} className="border-l-4 border-l-primary">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="text-xl font-bold">{player.nickname}</h3>
                            <div className="flex gap-2 items-center mt-1">
                              <Badge variant="outline">{player.role}</Badge>
                              <span className="text-sm text-muted-foreground">
                                {player.age}y • {player.nationality}
                              </span>
                            </div>
                          </div>
                          <div className={`text-3xl font-bold ${getRatingColor(rating)}`}>{rating}</div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Rifle</div>
                            <Progress value={player.rifle} className="h-2" />
                            <div className="text-xs mt-1">{player.rifle}/100</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">AWP</div>
                            <Progress value={player.awp} className="h-2" />
                            <div className="text-xs mt-1">{player.awp}/100</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Teamwork</div>
                            <Progress value={player.teamwork} className="h-2" />
                            <div className="text-xs mt-1">{player.teamwork}/100</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Reaction</div>
                            <Progress value={player.reaction} className="h-2" />
                            <div className="text-xs mt-1">{player.reaction}/100</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Clutch</div>
                            <Progress value={player.clutch} className="h-2" />
                            <div className="text-xs mt-1">{player.clutch}/100</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Morale</div>
                            <Progress value={player.morale} className="h-2" />
                            <div className="text-xs mt-1">{player.morale}/100</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Form</div>
                            <div className="text-lg font-semibold">{player.form}%</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Morale</div>
                            <div className="text-lg font-semibold">{player.morale}%</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Fatigue</div>
                            <div className="text-lg font-semibold">{player.fatigue}%</div>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
                          <div className="flex justify-between">
                            <span>Salary: ${(contracts.find(c => c.playerId === player.id)?.salaryPerWeek || 0).toFixed(0)}/week</span>
                            <span>Points: {player.xp} XP</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="facilities" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Team Facilities</CardTitle>
                <CardDescription>Upgrade facilities to improve player development</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-medium">Facilities</span>
                    <span className="text-sm text-muted-foreground">Level {playerTeam.facilitiesLevel}</span>
                  </div>
                  <Progress value={(playerTeam.facilitiesLevel / 5) * 100} />
                  <p className="text-sm text-muted-foreground mt-2">
                    Affects team training efficiency and morale recovery.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="staff" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Team Staff</CardTitle>
                <CardDescription>Hire staff to support your team</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {playerTeam.staffIds.length > 0 ? (
                  playerTeam.staffIds.map(staffId => {
                    return <div key={staffId} className="p-3 bg-muted rounded-lg border">Staff member active</div>
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground italic">No staff members hired</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
