"use client"

import React, { useState } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { PlayerPortrait } from "@/components/ui/asset-images"
import {
  Dumbbell,
  Brain,
  Zap,
  Target,
  Shield,
  Coffee,
  LucideIcon,
  Swords,
  Crosshair,
  User,
  Users,
  LayoutGrid,
  Settings2,
  Coins,
  Wind
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { TrainingFocus, Role, CustomTactics } from "@/types"
import dynamic from "next/dynamic"
const RoleTrainingModal = dynamic(() => import("@/components/training/RoleTrainingModal").then(m => m.RoleTrainingModal), { ssr: false })
const WeaponTrainingModal = dynamic(() => import("@/components/training/WeaponTrainingModal").then(m => m.WeaponTrainingModal), { ssr: false })
const TacticalLoadoutEditor = dynamic(() => import("@/components/match/TacticalLoadoutEditor").then(m => m.TacticalLoadoutEditor), { ssr: false })
import { motion, AnimatePresence } from "framer-motion"
import { DrillManager, ActiveDrill } from "@/engine/drill-manager"
import { useRef, useEffect, useCallback } from "react"

// Helper for Focus Icons
const getFocusIcon = (focus: string | undefined): LucideIcon => {
  switch (focus) {
    case TrainingFocus.AIM: return Crosshair
    case TrainingFocus.TACTICS: return Brain
    case TrainingFocus.TEAMPLAY: return Users
    case TrainingFocus.REST: return Coffee
    default: return User
  }
}

export default function TrainingPage() {
  const { players, teams, playerTeamId, staff, startRoleTraining, cancelRoleTraining, setPlayerTrainingFocus, runTeamDrill, customTactics, updateCustomTactic } = useGameStore(useShallow(state => ({
    players: state.players,
    teams: state.teams,
    playerTeamId: state.playerTeamId,
    staff: state.staff,
    startRoleTraining: state.startRoleTraining,
    cancelRoleTraining: state.cancelRoleTraining,
    setPlayerTrainingFocus: state.setPlayerTrainingFocus,
    runTeamDrill: state.runTeamDrill,
    customTactics: state.customTactics,
    updateCustomTactic: state.updateCustomTactic,
  })))
  const [selectedDrill, setSelectedDrill] = useState("recoil_master")
  const [trainingPlayer, setTrainingPlayer] = useState<any>(null)
  const [weaponTrainingPlayer, setWeaponTrainingPlayer] = useState<any>(null)
  const [isEditingTactics, setIsEditingTactics] = useState(false)
  const [editingStrategy, setEditingStrategy] = useState<keyof CustomTactics>("FULL")
  const [editingSide, setEditingSide] = useState<"ct" | "t">("ct")

  // Active Drill State
  const [activeRun, setActiveRun] = useState<{
    drill: ActiveDrill
    stepIndex: number
    logs: string[]
    progress: number
    completed: boolean
  } | null>(null)

  const terminalEndRef = useRef<HTMLDivElement>(null)

  const playerTeam = teams.find(t => t.id === playerTeamId)
  const teamPlayers = players.filter(p => playerTeam?.rosterIds.includes(p.id))

  const activeStaff = staff.filter(s => s.teamId === playerTeamId)
  const coach = activeStaff.find(s => s.role === "coach")
  const drillCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDrillComplete = useCallback((drill: ActiveDrill) => {
    setActiveRun(prev => prev ? ({ ...prev, completed: true, logs: [...prev.logs, "TRAINING SESSION COMPLETE.", "CALCULATING GAINS..."] }) : null)

    // Actual store update (delayed for animation)
    if (drillCompleteTimerRef.current) clearTimeout(drillCompleteTimerRef.current)
    drillCompleteTimerRef.current = setTimeout(() => {
      const result = runTeamDrill(drill.id, drill.rewards.map(r => ({ stat: r.stat, amount: r.value })), drill.fatigueCost)
      if (result.success) {
        toast.success("Training Complete", { description: result.message })
      } else {
        toast.error("Training Failed", { description: result.message })
      }
      setActiveRun(null)
      drillCompleteTimerRef.current = null
    }, 2000)
  }, [runTeamDrill])

  // Scroll to bottom of terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeRun?.logs])

  // Drill Simulation Loop
  useEffect(() => {
    if (!activeRun || activeRun.completed) return

    const timer = setTimeout(() => {
      const { drill, stepIndex, logs } = activeRun

      if (stepIndex >= drill.steps.length) {
        // Drill Complete
        handleDrillComplete(drill)
        return
      }

      const currentStep = drill.steps[stepIndex]
      // Simulate step based on average team skill
      const avgSkill = teamPlayers.length > 0
        ? Math.round(teamPlayers.reduce((sum, p) => sum + (p.skill || 70), 0) / teamPlayers.length)
        : 70
      const result = DrillManager.simulateStep(currentStep, avgSkill)

      const newLogs = [...logs, `STEP ${stepIndex + 1}: ${currentStep.message}`, `> ${result.log}`]
      if (result.success) newLogs.push(`> STATUS: COMPLETED`)

      setActiveRun({
        ...activeRun,
        stepIndex: stepIndex + 1,
        logs: newLogs,
        progress: ((stepIndex + 1) / drill.steps.length) * 100
      })

    }, 1500) // Delay between steps

    return () => clearTimeout(timer)
  }, [activeRun, teamPlayers, handleDrillComplete])

  const startDrill = () => {
    const drill = DrillManager.getDrills().find(d => d.id === selectedDrill)
    if (!drill) return

    setActiveRun({
      drill,
      stepIndex: 0,
      logs: [`INITIALIZING ${drill.name.toUpperCase()}...`, "LOADING MAP ASSETS...", "CONNECTING TO SERVER..."],
      progress: 0,
      completed: false
    })
  }

  // Clean up drill complete timer on unmount
  useEffect(() => {
    return () => {
      if (drillCompleteTimerRef.current) clearTimeout(drillCompleteTimerRef.current)
    }
  }, [])

  // Empty roster state
  if (teamPlayers.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto pb-20">
        <div className="text-center py-20 glass-panel border-dashed border-white/10">
          <Dumbbell size={40} className="text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">No players to train</p>
          <p className="text-sm text-muted-foreground/60 mt-2">Sign players via Transfers to start training</p>
          <Link href="/transfers">
            <Button variant="outline" size="sm" className="mt-5">
              Browse Transfers
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto pb-20">
      {/* Role Training Modal */}
      {trainingPlayer && (
        <RoleTrainingModal
          player={trainingPlayer}
          isOpen={!!trainingPlayer}
          onClose={() => setTrainingPlayer(null)}
          onStartTraining={(role) => {
            const result = startRoleTraining(trainingPlayer.id, role)
            if (result.success) {
              setTrainingPlayer(null)
              toast.success("Role Training Started", { description: result.message })
            } else {
              toast.error("Failed to start", { description: result.message })
            }
          }}
          currentBudget={playerTeam?.budget || 0}
          trainingSlotsUsed={(playerTeam as any)?.trainingSlotsUsed || 0}
          maxTrainingSlots={(playerTeam as any)?.maxTrainingSlots || 10}
        />
      )}

      {/* Weapon Training Modal */}
      {weaponTrainingPlayer && (
        <WeaponTrainingModal
          player={weaponTrainingPlayer}
          isOpen={!!weaponTrainingPlayer}
          onClose={() => setWeaponTrainingPlayer(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-normal tracking-tighter uppercase liquid-text mb-2">Performance Center</h1>
          <p className="text-muted-foreground font-medium uppercase text-xs tracking-[0.2em]">Forging elites through algorithmic discipline</p>
        </div>

        <div className="flex gap-4">
          <div className="glass-panel px-6 py-3 border-primary/20 bg-primary/5 flex items-center gap-4">
            <div>
              <p className="text-[10px] font-normal uppercase text-muted-foreground">Training Slots</p>
              <p className="text-sm font-normal text-white">{playerTeam?.trainingSlotsUsed || 0} / {playerTeam?.maxTrainingSlots || 10}</p>
            </div>
          </div>

          <div className="glass-panel px-6 py-3 border-primary/20 bg-primary/5 flex items-center gap-4">
            <Zap className="text-primary" size={20} />
            <div>
              <p className="text-[10px] font-normal uppercase text-muted-foreground">Staff Bonus</p>
              <p className="text-sm font-normal text-white">+{coach?.level || 0}% Efficiency</p>
            </div>
          </div>

          {(playerTeam as any)?.activeRoleTraining?.length > 0 && (
            <div className="glass-panel px-6 py-3 border-rose-500/20 bg-rose-500/5 flex items-center gap-4">
              <Coins className="text-rose-400" size={20} />
              <div>
                <p className="text-[10px] font-normal uppercase text-muted-foreground">Training Cost</p>
                <p className="text-sm font-normal text-rose-400">-${(((playerTeam as any)?.activeRoleTraining?.length || 0) * 5000).toLocaleString()}/wk</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

        {/* LEFT COLUMN: Team Drills - Sticky */}
        <div className="space-y-6 xl:sticky xl:top-8 xl:self-start">
          <h3 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2">
            <LayoutGrid size={16} className="text-primary" /> Active Drill Module
          </h3>

          {!activeRun ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {DrillManager.getDrills().map((drill) => (
                <div
                  key={drill.id}
                  onClick={() => setSelectedDrill(drill.id)}
                  className={cn(
                    "glass-panel p-6 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 group",
                    selectedDrill === drill.id
                      ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.5)] animate-[pulse-glow_2s_ease-in-out_infinite]"
                      : "border-white/5 hover:border-white/20"
                  )}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-0.5">
                      <div className="w-full h-full bg-neutral-950 rounded-[inherit] flex items-center justify-center">
                        {/* Dynamic Icon Mapping */}
                        {drill.iconName === "Target" && <Target className="text-rose-400" />}
                        {drill.iconName === "Wind" && <Wind className="text-sky-400" />}
                        {drill.iconName === "Crosshair" && <Crosshair className="text-amber-400" />}
                      </div>
                    </div>
                    <Badge className="bg-white/10 text-muted-foreground uppercase text-[8px] font-normal">
                      Authentic CS2
                    </Badge>
                  </div>

                  <h4 className="text-lg font-normal text-white uppercase tracking-tight mb-1">{drill.name}</h4>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-3">{drill.focus}</p>
                  <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{drill.description}</p>

                  <div className="flex justify-between items-center pt-4 border-t border-white/5">
                    <span className={cn("text-[10px] font-normal uppercase text-rose-400")}>
                      +{drill.fatigueCost} Fatigue
                    </span>
                    <div className="flex gap-1">
                      {drill.rewards.map((g: any) => (
                        <Badge key={g.stat} className="text-[8px] font-bold text-emerald-400 bg-white/5 border-none">
                          +{g.value} {g.stat}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <Button
                className="col-span-1 md:col-span-2 py-6 text-base font-normal uppercase tracking-[0.2em] shadow-xl shadow-primary/10 rounded-xl"
                onClick={startDrill}
                disabled={!selectedDrill}
              >
                Initialize Simulation
              </Button>
            </div>
          ) : (
            <div className="glass-panel p-6 border-primary/20 bg-black/40 relative overflow-hidden">
              {/* Scanlines Effect */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 pointer-events-none bg-[length:100%_2px,3px_100%]" />

              <div className="relative z-10 space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-2xl font-normal text-white uppercase tracking-tighter animate-pulse">{activeRun.drill.name}</h4>
                    <p className="text-xs font-sans text-primary">RUNNING SIMULATION_PROTOCOL_V2...</p>
                  </div>
                  <Badge variant="outline" className="animate-spin-slow border-primary text-primary h-8 w-8 rounded-full p-0 flex items-center justify-center">
                    <Zap size={14} />
                  </Badge>
                </div>

                {/* Terminal Output */}
                <div className="h-48 bg-black/80 rounded-lg border border-white/10 p-4 font-sans text-xs overflow-y-auto custom-scrollbar space-y-1 shadow-inner">
                  {activeRun.logs.map((log: string, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "flex gap-2",
                        log.includes("COMPLETE") ? "text-emerald-400 font-bold" :
                          log.includes("PERFECT") ? "text-amber-400" :
                            "text-muted-foreground"
                      )}
                    >
                      <span className="text-white/20">[{new Date().toLocaleTimeString().split(' ')[0]}]</span>
                      <span>{log}</span>
                    </motion.div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs uppercase font-bold text-muted-foreground">
                    <span>Progress</span>
                    <span>{(activeRun.progress).toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${activeRun.progress}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Individual Focus */}
        <div className="space-y-6">
          <h3 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2">
            <User size={16} className="text-primary" /> Player Development
          </h3>

          {!playerTeam?.activeRoleTraining?.length && (
            <div className="flex items-center justify-center min-h-[30vh]">
              <div className="text-center space-y-2">
                <p className="text-muted-foreground text-sm">No active training sessions. Set up player training from the schedule.</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {teamPlayers.map(player => {
              const activeTraining = playerTeam?.activeRoleTraining?.find(t => t.playerId === player.id)
              const Icon = getFocusIcon(player.trainingFocus)
              const condition = Math.max(0, 100 - (player.fatigue || 0))

              return (
                <div
                  key={player.id}
                  className="glass-panel p-4 group hover:border-white/20 transition-all duration-300"
                >
                  <div className="flex items-center gap-4">
                    {/* Portrait */}
                    <div className="relative">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 overflow-hidden">
                        <PlayerPortrait
                          src={player.portraitPath}
                          alt={player.nickname}
                          size={56}
                        />
                      </div>
                      {/* Level Badge */}
                      <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[9px] font-normal px-1.5 py-0.5 rounded-full">
                        {player.level || 1}
                      </div>
                    </div>

                    {/* Player Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-white truncate">{player.nickname}</h4>
                        <span className="text-[10px] text-white/40 uppercase font-bold">{player.role}</span>
                        {activeTraining && (
                          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[8px] h-4">
                            Training {activeTraining.targetRole}
                          </Badge>
                        )}
                      </div>

                      {/* Condition Bar */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 max-w-[120px]">
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                condition > 70 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" :
                                  condition > 40 ? "bg-gradient-to-r from-amber-500 to-amber-400" :
                                    "bg-gradient-to-r from-rose-500 to-rose-400"
                              )}
                              style={{ width: `${condition}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-[10px] text-white/50 font-medium">{condition}%</span>
                      </div>

                      {/* XP Progress */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 max-w-[120px]">
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-amber-500/60 to-amber-400/60 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, ((player.xp || 0) / (player.xpToNextLevel || 1000)) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-[9px] text-white/30 font-sans">{player.xp || 0}/{player.xpToNextLevel || 1000} XP</span>
                      </div>
                    </div>

                    {/* Training Focus Selector */}
                    <div className="hidden sm:block">
                      <Select
                        value={player.trainingFocus || "BALANCED"}
                        onValueChange={(val) => setPlayerTrainingFocus(player.id, val)}
                      >
                        <SelectTrigger className="h-9 w-[130px] text-xs bg-white/5 border-white/10 text-white rounded-xl">
                          <div className="flex items-center gap-2">
                            <Icon size={14} className="text-primary" />
                            <span className="truncate">{player.trainingFocus || "Balanced"}</span>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BALANCED">Balanced</SelectItem>
                          <SelectItem value={TrainingFocus.AIM}>Aim & Mechanics</SelectItem>
                          <SelectItem value={TrainingFocus.TACTICS}>Tactics & IGL</SelectItem>
                          <SelectItem value={TrainingFocus.TEAMPLAY}>Teamplay & Util</SelectItem>
                          <SelectItem value={TrainingFocus.REST}>Rest & Recovery</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 p-0 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={() => setWeaponTrainingPlayer(player)}
                        disabled={!!player.injury}
                        title={player.injury ? `Injured: ${player.injury.type}` : "Specialist Training"}
                      >
                        <Crosshair size={16} />
                      </Button>

                      {activeTraining ? (
                        <button
                          className="h-9 px-3 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center gap-1.5 hover:bg-red-500/10 hover:border-red-500/30 transition-colors group cursor-pointer"
                          title="Click to cancel training"
                          onClick={() => {
                            cancelRoleTraining(player.id)
                            toast.success("Role training cancelled", { description: `${player.nickname} is no longer training` })
                          }}
                        >
                          <span className="text-[10px] font-bold text-purple-400 group-hover:text-red-400 transition-colors">
                            {activeTraining.weeksCompleted}/{activeTraining.totalWeeks}
                          </span>
                          <span className="text-[9px] text-red-400 hidden group-hover:inline">✕</span>
                        </button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 w-9 p-0 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                          onClick={() => setTrainingPlayer(player)}
                          disabled={!!player.injury}
                          title={player.injury ? `Injured: ${player.injury.type}` : "Train Role"}
                        >
                          <Swords size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>

      {/* LOADOUT MANAGER SECTION */}
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2">
            <Shield size={16} className="text-primary" /> Loadout Manager
          </h3>
          <p className="text-xs text-white/40 mt-1">Customize your team's buy strategy and weapon loadouts for each economy situation</p>
        </div>
        <div className="glass-panel p-6">
          <p className="text-xs text-white/60 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            CT Side = Defense roles
            <span className="w-2 h-2 rounded-full bg-orange-400 ml-4"></span>
            T Side = Attack roles
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(["ECO", "FORCE", "SEMIBUY", "FULL", "DOUBLE AWP"] as const).map((strat) => (
              <div key={strat} className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full h-16 flex flex-col gap-1 border-white/10 hover:bg-white/10"
                  onClick={() => {
                    setEditingStrategy(strat)
                    setEditingSide("ct")
                    setIsEditingTactics(true)
                  }}
                >
                  <span className="font-normal text-xs uppercase">{strat}</span>
                  <span className="text-[9px] text-white/40">CT Side</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-16 flex flex-col gap-1 border-white/10 hover:bg-orange-500/10"
                  onClick={() => {
                    setEditingStrategy(strat)
                    setEditingSide("t")
                    setIsEditingTactics(true)
                  }}
                >
                  <span className="font-normal text-xs uppercase">{strat}</span>
                  <span className="text-[9px] text-orange-400">T Side</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TACTICS EDITOR MODAL */}
      <AnimatePresence>
        {isEditingTactics && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 top-16 z-modal flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          >
            <TacticalLoadoutEditor
              side={editingSide}
              strategyId={editingStrategy}
              config={customTactics[editingStrategy][editingSide]}
              playerNames={teamPlayers.map(p => p.nickname)}
              playerImages={teamPlayers.map(p => p.portraitPath || "")}
              onSave={(newConfig) => {
                updateCustomTactic(editingStrategy, editingSide, newConfig)
                setIsEditingTactics(false)
                toast.success("Tactics Updated", { description: `${editingStrategy} (${editingSide.toUpperCase()}) loadout saved.` })
              }}
              onClose={() => setIsEditingTactics(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div >
  )
}
