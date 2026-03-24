"use client"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import Image from "next/image"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { TrophyCabinet } from "@/components/squad/TrophyCabinet"
import { AlertCircle, TrendingUp, Zap, Gamepad2, Heart, ArrowUpRight, User as UserIcon, Users, Target, ArrowRightLeft, Activity, Plus, Star, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ChemistryMatrix } from "@/components/squad/ChemistryMatrix"
import { motion, AnimatePresence } from "framer-motion"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { getDisplayPlayerTier, getTierStyle, TierLevel } from "@/engine/tier-system"
import { resolvePlayerRole } from "@/engine/role-determination"
import { useState } from "react"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { RoleTrainingModal } from "@/components/training/RoleTrainingModal"
import { SynergyChart } from "@/components/squad/SynergyChart"
import { SystemBonuses } from "@/components/squad/SystemBonuses"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export default function SquadPage() {
  const { getPlayerTeam, players, teams, playerTeamId, academyPlayers, setPlaystyle, setEconomyStyle, setTargetPlayer, getUpcomingMatches, performVODReview, promotePlayer, swapRosterPositions, startRoleTraining, contracts, currentWeek, treatInjury, promoteProspect, addToast } = useGameStore(useShallow(state => ({
    getPlayerTeam: state.getPlayerTeam,
    players: state.players,
    teams: state.teams,
    playerTeamId: state.playerTeamId,
    academyPlayers: state.academyPlayers,
    setPlaystyle: state.setPlaystyle,
    setEconomyStyle: state.setEconomyStyle,
    setTargetPlayer: state.setTargetPlayer,
    getUpcomingMatches: state.getUpcomingMatches,
    performVODReview: state.performVODReview,
    promotePlayer: state.promotePlayer,
    swapRosterPositions: state.swapRosterPositions,
    startRoleTraining: state.startRoleTraining,
    contracts: state.contracts,
    currentWeek: state.currentWeek,
    treatInjury: state.treatInjury,
    promoteProspect: state.promoteProspect,
    addToast: state.addToast,
  })))
  const teamData = teams.find(t => t.id === playerTeamId)

  const [selectedSwapIndex, setSelectedSwapIndex] = useState<number | null>(null)
  const [trainingPlayer, setTrainingPlayer] = useState<any>(null)
  const [promotingProspectId, setPromotingProspectId] = useState<string | null>(null)

  if (!teamData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground opacity-20" />
        <p className="text-muted-foreground font-bold tracking-widest uppercase text-xs">Team data not found</p>
      </div>
    )
  }


  // Hydrate Roster with evaluations - DO NOT SORT to preserve user order
  const roster = (teamData.rosterIds || [])
    .map((id, index) => {
      const player = players.find(p => p.id === id)
      if (!player) return null
      const evaluation = evaluatePlayer(player as any)
      const playerTier = getDisplayPlayerTier(evaluation.overallRating, teamData?.tier as TierLevel)
      return { ...player, evaluation, playerTier, originalIndex: index }
    })
    .filter(Boolean) as any[]

  // Split into Active and Bench
  const activeRoster = roster.slice(0, 5)
  const benchRoster = roster.slice(5)

  const handleSwapInitiate = (index: number) => {
    setSelectedSwapIndex(index)
  }

  const handleSwapExecute = (targetIndex: number) => {
    if (selectedSwapIndex !== null) {
      swapRosterPositions(playerTeamId!, selectedSwapIndex, targetIndex)
      setSelectedSwapIndex(null)
    }
  }

  const handleCancelSwap = () => {
    setSelectedSwapIndex(null)
  }

  const getRoleIcon = (role: string) => {
    switch (role?.toUpperCase()) {
      case "AWPER": return <Target size={12} className="text-red-400" />
      case "RIFLER": return <Gamepad2 size={12} className="text-blue-400" />
      case "IGL": return <TrendingUp size={12} className="text-amber-400" />
      case "SUPPORT": return <Heart size={12} className="text-emerald-400" />
      case "ENTRY":
      case "ENTRY_FRAGGER": return <Zap size={12} className="text-orange-400" />
      default: return <UserIcon size={12} />
    }
  }

  // Format role for display (converts ENTRY_FRAGGER to "Entry")
  const formatRole = (role: string) => {
    if (!role) return ""
    if (role.toUpperCase() === "ENTRY_FRAGGER") return "Entry"
    return role
  }

  const LiquidBar = ({ value, label, color, subColor }: { value: number, label: string, color: string, subColor: string }) => (
    <div className="flex flex-col gap-1 w-full group/meter">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[9px] font-normal uppercase tracking-widest text-muted-foreground/60">{label}</span>
        <span className={cn("text-[9px] font-bold font-sans tabular-nums",
          value >= 80 ? "text-emerald-400" : value >= 60 ? "text-white/80" : "text-rose-400"
        )}>{Math.round(value)}%</span>
      </div>

      <div className="relative w-full h-1.5 rounded-full bg-white/5 overflow-hidden ring-1 ring-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          className={cn(
            "absolute inset-y-0 left-0 h-full rounded-full transition-all duration-700 ease-out",
            subColor
          )}
        >
          {/* Glass Shine */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-80" />
          {/* Shimmer */}
          <div className="absolute inset-0 -translate-x-full group-hover/meter:animate-[shimmer_1s_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        </motion.div>
      </div>
    </div>
  )

  const PlayerCard = ({ player, index, isBench = false }: { player: any, index: number, isBench?: boolean }) => {
    const tierStyle = getTierStyle(player.playerTier)
    const isSelected = selectedSwapIndex === index
    const isSwapTarget = selectedSwapIndex !== null && !isBench && !isSelected

    const contract = contracts.find(c => c.playerId === player.id)
    const weeksLeft = contract ? Math.max(0, contract.endWeek - currentWeek) : 0
    const yearsLeft = weeksLeft > 0 ? (weeksLeft / 52).toFixed(1) : "0.0"
    const salary = contract ? contract.salaryPerWeek : 0

    return (
      <div className="relative group">
        <motion.div
          layoutId={`player-${player.id}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: isSelected ? 1.01 : 1,
            backgroundColor: isSelected ? "rgba(59, 130, 246, 0.08)" : isSwapTarget ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.3)",
            borderColor: isSelected ? "rgba(59, 130, 246, 0.4)" : isSwapTarget ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"
          }}
          className={cn(
            "p-1 rounded-2xl border transition-all duration-300 relative overflow-hidden backdrop-blur-md",
            !isSwapTarget && !isBench ? "hover:scale-[1.01] hover:border-white/20 hover:bg-white/[0.04] shadow-lg" : "",
            player.injury ? "border-red-500/30 bg-red-500/[0.02]" : ""
          )}
          onClick={() => { if (isSwapTarget) handleSwapExecute(index) }}
        >
          {/* Injury Overlay (Click-through for Profile, but blocks interaction if needed) */}
          {player.injury && (
            <div className="absolute top-2 right-12 z-20 flex items-center gap-2">
              <Badge variant="destructive" className="animate-pulse shadow-lg shadow-red-500/20 px-2 py-1 flex items-center gap-1.5">
                <Activity size={10} className="stroke-[3]" />
                <span className="text-[9px] font-normal uppercase tracking-widest">{player.injury.weeksRemaining}W</span>
              </Badge>
            </div>
          )}
          {/* INJURY OVERLAY */}
          {player.injury && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-300 pointer-events-none [&>*]:pointer-events-auto">
              <Activity className="text-red-400 w-10 h-10 mb-2 animate-pulse" />
              <h3 className="text-lg font-normal text-white uppercase tracking-tighter">{player.injury.name}</h3>
              <Badge variant="destructive" className="mt-1 mb-2 text-[10px] font-bold uppercase tracking-widest">
                Out for {player.injury.weeksRemaining} Weeks
              </Badge>
              <p className="text-[10px] text-white/60 mb-3 font-medium max-w-[200px]">
                {player.injury.description}
              </p>

              <div className="flex flex-col gap-2 w-full max-w-[180px]">
                <Link
                  href={`/player/${player.id}`}
                  className="inline-flex items-center justify-center h-8 border border-white/20 text-white/80 hover:bg-white/10 rounded-md text-[10px] font-bold uppercase tracking-widest"
                  onClick={(e) => e.stopPropagation()}
                >
                  View Profile
                </Link>
                <ConfirmDialog
                  title="Hire Medical Specialist?"
                  description="This will cost $5,000 and reduce recovery time by 2 weeks."
                  onConfirm={() => treatInjury(player.id)}
                  confirmText="Hire Specialist"
                  icon="info"
                >
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 w-full text-[10px] font-bold uppercase tracking-widest"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Plus size={12} className="mr-2" />
                    Specialist ($5k)
                  </Button>
                </ConfirmDialog>
              </div>

              <p className="mt-2 text-[9px] text-white/30 italic">Reduces recovery time by 2 weeks</p>
            </div>
          )}

          {/* Inner Content Container */}
          <div className="flex flex-col md:flex-row items-center gap-3 p-2 rounded-xl relative z-10">

            {/* Link Overlay */}
            {!isSwapTarget && selectedSwapIndex === null && (
              <Link href={`/player/${player.id}`} className="absolute inset-0 z-20" />
            )}

            {isSelected && <div className="absolute top-3 right-3 text-primary animate-pulse z-30"><ArrowRightLeft size={20} /></div>}

            {/* Swap/Cancel Buttons */}
            {(isBench && selectedSwapIndex === null) || isSelected ? (
              <div className="absolute top-3 right-3 z-30">
                <Button
                  size="sm"
                  variant={isSelected ? "destructive" : "secondary"}
                  className="h-7 text-[9px] font-normal uppercase tracking-widest shadow-lg"
                  onClick={(e) => {
                    e.stopPropagation()
                    isSelected ? handleCancelSwap() : handleSwapInitiate(index)
                  }}
                >
                  {isSelected ? "Cancel" : "Swap"}
                </Button>
              </div>
            ) : null}

            {/* LEFT: Portrait & Core Identity */}
            <div className="flex items-center gap-5 shrink-0 w-72">
              <div className={cn(
                "w-20 h-20 rounded-2xl border-2 flex items-center justify-center overflow-hidden shrink-0 shadow-2xl relative group-hover:scale-105 transition-transform duration-500",
                isSelected ? "bg-primary/10 border-primary" : player.injury ? "bg-red-500/10 border-red-500/40" : "bg-gradient-to-br from-white/10 to-transparent border-white/10"
              )}>
                {/* Background Glow behind head */}
                <div className={cn("absolute inset-0 blur-2xl transition-opacity",
                  player.injury ? "bg-red-500/20 opacity-100" : "bg-primary/20 opacity-0 group-hover:opacity-100"
                )} />
                <PlayerPortrait src={player.portraitPath} alt={player.nickname} size={80} />
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "font-normal text-2xl tracking-tighter leading-none transition-colors",
                    isSelected ? "text-primary" : player.injury ? "text-red-400" : "text-white group-hover:text-white"
                  )}>
                    {player.nickname}
                  </span>
                  {player.injury ? (
                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20">
                      {player.injury.name}
                    </span>
                  ) : (
                    <Badge className={cn("text-[9px] px-2 py-0.5 border-none shadow-lg", tierStyle.bgColor, tierStyle.color)}>
                      {tierStyle.shortLabel}
                    </Badge>
                  )}
                  {(player.talentPoints ?? 0) > 0 && (
                    <span className="relative flex h-5 w-5" title={`${player.talentPoints} skill point${(player.talentPoints ?? 0) > 1 ? "s" : ""} available`}>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-50" />
                      <span className="relative inline-flex rounded-full h-5 w-5 bg-amber-500 text-black text-[10px] font-bold items-center justify-center">
                        {player.talentPoints}
                      </span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 opacity-90">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/5">
                    {getRoleIcon(player.role)}
                    <span className="text-[10px] font-bold uppercase tracking-wide text-white/80">{formatRole(player.role)}</span>
                    {player.secondaryRole && (
                      <span className="text-[9px] text-white/40 uppercase">+{formatRole(player.secondaryRole)}</span>
                    )}
                  </div>
                  <CountryFlag country={player.nationality} showName={false} size={16} />
                  {player.traits && player.traits.length > 0 && (
                    <span className="text-[8px] text-white/30 italic">{(player.traits[0] as string).replace(/_/g, " ")}</span>
                  )}
                </div>

                {/* Contract Pill */}
                <div className="flex items-center gap-2 text-[9px] font-sans font-medium text-white/40 mt-1">
                  <span className="text-emerald-400 font-bold">${(salary / 1000).toFixed(1)}k/wk</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>{yearsLeft}y left</span>
                </div>
              </div>
            </div>

            {/* CENTER: Bars (Flexible Width - Fills Empty Space) */}
            {!isBench && (
              <div className="flex-1 w-full grid grid-cols-1 gap-1.5 px-2">
                <LiquidBar
                  label="Morale"
                  value={player.morale || 75}
                  color="bg-emerald-500"
                  subColor="bg-gradient-to-r from-emerald-600 to-emerald-400"
                />
                <LiquidBar
                  label="Form"
                  value={player.form || 70}
                  color="bg-blue-500"
                  subColor="bg-gradient-to-r from-blue-600 to-blue-400"
                />
                <LiquidBar
                  label="Energy"
                  value={Math.max(0, 100 - (player.fatigue || 0))}
                  color="bg-amber-500"
                  subColor="bg-gradient-to-r from-amber-600 to-amber-400"
                />
              </div>
            )}

            {/* RIGHT: OVR */}
            <div className="shrink-0 w-[90px] flex flex-col items-center justify-center gap-0">
              <div className="relative">
                <span className={cn(
                  "text-5xl font-normal tracking-tighter leading-none drop-shadow-2xl",
                  player.evaluation.overallRating >= 90 ? "text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-amber-600 filter drop-shadow-[0_4px_4px_rgba(245,158,11,0.5)]" :
                    player.evaluation.overallRating >= 80 ? "text-emerald-400" :
                      "text-white/80"
                )}>
                  {player.evaluation.overallRating}
                </span>
              </div>
              <span className="text-[10px] font-normal text-muted-foreground uppercase mt-1 tracking-[0.2em] opacity-60">
                OVR
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="space-y-10 max-w-7xl mx-auto pb-20">
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
              addToast({ message: `Role training started for ${trainingPlayer.nickname}`, type: "info" })
            } else {
              addToast({ message: result.message, type: "error" })
            }
          }}
          currentBudget={teamData?.budget || 0}
        />
      )}

      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-4">
            {/* Team Logo */}
            <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center overflow-hidden">
              <TeamLogoDisplay team={teamData} size={56} />
            </div>
            <div>
              <h1 className="text-4xl font-normal tracking-tighter text-white uppercase flex items-center gap-3">
                {teamData.name}
              </h1>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                Active Roster <span className="w-1 h-1 rounded-full bg-emerald-500" /> Season {Math.ceil(currentWeek / 52)}
              </p>
            </div>
          </div>
        </motion.div>

        <div className="flex items-center gap-4">
          <div className="glass-panel px-6 py-3 rounded-2xl border-white/5 bg-white/[0.02]">
            <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest block mb-0.5">Active</span>
            <span className="text-xl font-normal text-white">{activeRoster.length} / 5</span>
          </div>
          <div className="glass-panel px-6 py-3 rounded-2xl border-white/5 bg-white/[0.02]">
            <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest block mb-0.5">Bench</span>
            <span className="text-xl font-normal text-white/60">{benchRoster.length}</span>
          </div>
          <div className="glass-panel px-6 py-3 rounded-2xl border-white/5 bg-white/[0.02]">
            <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest block mb-0.5">Rating</span>
            <span className="text-xl font-normal text-emerald-400">
              {activeRoster.length > 0 ? Math.round(activeRoster.reduce((sum, p) => sum + p.evaluation.overallRating, 0) / activeRoster.length) : 0}
            </span>
          </div>
        </div>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Player Cards (Active + Bench) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Active Roster */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2">
                <Zap size={16} className="text-primary" /> Starting Lineup
              </h3>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Top 5 Players</span>
            </div>

            <div className="space-y-3">
              {activeRoster.length > 0 ? (
                activeRoster.map((player) => (
                  <PlayerCard key={player.id} player={player} index={player.originalIndex} />
                ))
              ) : (
                <div className="glass-panel p-12 text-center border-dashed border-white/10">
                  <Users size={32} className="text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">No active players</p>
                  <p className="text-xs text-muted-foreground/60 mt-2">Sign free agents to build your starting lineup</p>
                  <Link href="/transfers">
                    <Button variant="outline" size="sm" className="mt-4">
                      Browse Transfers
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Bench Roster */}
          <div className="space-y-4 pt-4 border-t border-white/5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-normal uppercase tracking-widest text-white/60 flex items-center gap-2">
                <Users size={16} /> Bench & Reserve
              </h3>
              {selectedSwapIndex !== null && (
                <span className="text-xs font-bold text-primary animate-pulse">Select a starting player to swap with</span>
              )}
            </div>

            <div className="space-y-3">
              {benchRoster.length > 0 ? (
                benchRoster.map((player) => (
                  <PlayerCard key={player.id} player={player} index={player.originalIndex} isBench />
                ))
              ) : (
                <div className="glass-panel p-8 text-center border-dashed border-white/5 bg-white/[0.01]">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Bench is empty</p>
                </div>
              )}
            </div>
          </div>

          {/* System Bonuses - Moved here so it has more space */}
          <div className="pt-8 border-t border-white/5">
            <SystemBonuses players={activeRoster as any} />
          </div>
        </div>

        {/* Right Side: Chemistry & Tactics */}
        <div className="space-y-6">
          <h3 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2">
            <Users size={16} className="text-primary" /> Synergy Analysis (Active)
          </h3>
          {/* Only show synergy for active roster */}
          <ChemistryMatrix players={activeRoster as any} synergyMatrix={teamData.synergyMatrix} />

          <div className="glass-panel p-6 border-white/5 bg-white/[0.02]">
            <SynergyChart players={activeRoster as any} />
          </div>



          {/* Youth Academy */}
          <div className="glass-panel p-6 border-white/5 bg-white/[0.02]">
            <div className="flex justify-between items-center mb-6">
              <div className="space-y-1">
                <h3 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2">
                  <Users size={16} className="text-primary" /> Youth Academy
                </h3>
                <p className="text-[10px] text-white/30 font-bold uppercase tracking-wider">Developing the next generation</p>
              </div>
              <Link href="/desktop?app=academy">
                <Button variant="ghost" size="sm" className="h-8 text-[10px] font-normal uppercase text-primary hover:bg-primary/10 border border-primary/20">
                  <ArrowUpRight size={12} className="mr-1" /> Manage
                </Button>
              </Link>
            </div>

            <div className="space-y-3">
              {academyPlayers && academyPlayers.length > 0 ? (
                academyPlayers.map((ap: any) => {
                  const prospect = players.find(p => p.id === ap.playerId)
                  if (!prospect) return null
                  const rating = Math.round((prospect.skill + prospect.rifle + prospect.tactic + prospect.teamwork) / 4)
                  return (
                    <div key={ap.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between group/prospect">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center font-normal text-primary border border-primary/20 overflow-hidden shrink-0">
                          <PlayerPortrait
                            src={prospect.portraitPath}
                            alt={prospect.nickname}
                            size={40}
                          />
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-white font-normal text-sm truncate">{prospect.nickname}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-bold text-muted-foreground uppercase">{prospect.role?.replace("_", " ") || "Rifler"}</span>
                            <div className="flex items-center gap-1">
                              <Star size={8} className="text-amber-400 fill-amber-400" />
                              <span className="text-[8px] font-normal text-amber-400">{prospect.potential || 80}+</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-lg font-normal text-white/70 leading-none">{rating}</div>
                          <div className="text-[7px] text-white/30 uppercase mt-1">OVR</div>
                        </div>

                        {ap.readyForPromotion && (
                          <Button
                            onClick={() => setPromotingProspectId(ap.id)}
                            size="sm"
                            className="h-8 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-normal uppercase px-2 shadow-sm"
                          >
                            <ArrowUpRight size={12} className="mr-1" /> Promote
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="py-8 text-center border-2 border-dashed border-white/5 rounded-xl bg-white/[0.01]">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">No prospects in training</p>
                  <Link href="/desktop?app=academy">
                    <Button variant="ghost" size="sm" className="mt-2 h-7 text-[9px] font-normal uppercase text-white/40 hover:text-white">
                      Start Scouting
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div >

      {/* Trophy Cabinet (Moved to bottom) */}
      < div className="pt-10 border-t border-white/5" >
        <TrophyCabinet trophies={(teamData.trophies || []) as any} className="mb-8" />
      </div >

      {/* Promotion Confirmation Modal */}
      <AnimatePresence>
        {promotingProspectId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 top-16 bg-black/85 backdrop-blur-md z-modal flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-panel max-w-md w-full p-8 border-white/10 bg-white/5 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Users size={120} />
              </div>

              <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 size={32} className="text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-normal uppercase tracking-tight text-white">Promote to Main Roster</h2>
                    <p className="text-xs text-white/40 font-medium uppercase tracking-widest mt-1">Graduate Confirmation</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/40 uppercase font-bold tracking-widest">Base Salary</span>
                    <span className="text-white font-normal">$2,000 / week</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/40 uppercase font-bold tracking-widest">Contract Length</span>
                    <span className="text-white font-normal">104 Weeks (2 Years)</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/40 uppercase font-bold tracking-widest">Roster Slot</span>
                    <span className="text-white font-normal">Bench / Reserve</span>
                  </div>
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl">
                  <p className="text-[10px] text-emerald-400/70 font-medium leading-relaxed uppercase tracking-wider text-center">
                    This player will be moved from the Youth Academy to your professional squad. They will be eligible for all tournaments immediately.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      const result = promoteProspect(promotingProspectId, { salaryPerWeek: 2000, lengthWeeks: 104 })
                      if (result.success) {
                        addToast({ message: result.message, type: "info" })
                        setPromotingProspectId(null)
                      }
                    }}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-normal uppercase tracking-widest text-xs h-11"
                  >
                    Confirm Promotion
                  </Button>
                  <Button
                    onClick={() => setPromotingProspectId(null)}
                    variant="ghost"
                    className="flex-1 text-white/40 hover:text-white hover:bg-white/5 font-normal uppercase tracking-widest text-xs h-11 border border-white/5"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div >
  )
}
