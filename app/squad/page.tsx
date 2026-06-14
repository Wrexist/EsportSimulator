"use client"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { PlayerCard } from "@/components/ui/PlayerCard"
import { StatTile } from "@/src/components/ui/StatTile"
import { SectionHeader } from "@/src/components/ui/SectionHeader"
import { EmptyState } from "@/src/components/ui/EmptyState"
import { TrophyCabinet } from "@/components/squad/TrophyCabinet"
import { AlertCircle, Zap, ArrowUpRight, Users, ArrowRightLeft, Activity, Plus, Star, CheckCircle2 } from "lucide-react"
import dynamic from "next/dynamic"
const ChemistryMatrix = dynamic(() => import("@/components/squad/ChemistryMatrix"), { ssr: false })
import { motion, AnimatePresence } from "framer-motion"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { getDisplayPlayerTier, TierLevel } from "@/engine/tier-system"
import { useState, useMemo, useCallback, memo } from "react"
const RoleTrainingModal = dynamic(() => import("@/components/training/RoleTrainingModal").then(m => m.RoleTrainingModal), { ssr: false })
const SynergyChart = dynamic(() => import("@/components/squad/SynergyChart").then(m => m.SynergyChart), { ssr: false })
const SystemBonuses = dynamic(() => import("@/components/squad/SystemBonuses").then(m => m.SystemBonuses), { ssr: false })
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorBoundary } from "@/components/ui/error-boundary"

// Module-level + memoized so each card only re-renders when its own props
// change. Was previously inline inside SquadPageInner which gave it a fresh
// component identity every render — React would re-mount the whole subtree
// (PlayerCard animations restarting, 3D portraits reloading) on every store
// mutation, not just swap toggles.
type RosterCardProps = {
  player: any
  index: number
  isBench?: boolean
  isSelected: boolean
  isSwapTarget: boolean
  weeksLeft: number
  yearsLeft: number
  salary: number
  selectedSwapIsNull: boolean
  onSwapInitiate: (index: number) => void
  onSwapExecute: (targetIndex: number) => void
  onSwapCancel: () => void
  onTreatInjury: (playerId: string) => void
}
const RosterCard = memo(function RosterCard({
  player,
  index,
  isBench = false,
  isSelected,
  isSwapTarget,
  weeksLeft: _weeksLeft,
  yearsLeft,
  salary,
  selectedSwapIsNull,
  onSwapInitiate,
  onSwapExecute,
  onSwapCancel,
  onTreatInjury,
}: RosterCardProps) {
  return (
    <PlayerCard
      key={player.id}
      player={{
        id: player.id,
        nickname: player.nickname,
        portraitPath: player.portraitPath,
        role: player.role,
        secondaryRole: player.secondaryRole,
        nationality: player.nationality,
        tier: player.playerTier,
        overallRating: player.evaluation.overallRating,
        morale: player.morale,
        form: player.form,
        fatigue: player.fatigue,
        salaryPerWeek: salary,
        contractYearsLeft: yearsLeft,
      }}
      size="lg"
      variant="default"
      overlays={{ stats: true, contract: true, form: !isBench }}
      href={!isSwapTarget && selectedSwapIsNull ? `/player/${player.id}` : null}
      onClick={isSwapTarget ? () => onSwapExecute(index) : undefined}
      selected={isSelected}
      accent={player.injury ? "danger" : "default"}
      layoutId={`player-${player.id}`}
      enable3DPortrait={!isBench}
    >
      {player.injury && (
        <div className="absolute top-2 right-12 z-20">
          <Badge variant="destructive" className="animate-pulse shadow-lg shadow-red-500/20 px-2 py-1 flex items-center gap-1.5">
            <Activity size={10} className="stroke-[3]" />
            <span className="text-[9px] font-normal uppercase tracking-widest">{player.injury.weeksRemaining}W</span>
          </Badge>
        </div>
      )}

      {player.injury && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-300 pointer-events-none [&>*]:pointer-events-auto">
          <Activity className="text-red-400 w-10 h-10 mb-2 animate-pulse" />
          <h3 className="text-lg font-normal text-white uppercase tracking-tighter">{player.injury.name}</h3>
          <Badge variant="destructive" className="mt-1 mb-2 text-[10px] font-bold uppercase tracking-widest">
            Out for {player.injury.weeksRemaining} Weeks
          </Badge>
          <p className="text-[10px] text-white/60 mb-3 font-medium max-w-[200px]">{player.injury.description}</p>
          <div className="flex flex-col gap-2 w-full max-w-[180px]">
            <Button asChild variant="outline" size="sm" className="h-8 text-[10px] font-bold uppercase tracking-widest">
              <Link href={`/player/${player.id}`} onClick={(e) => e.stopPropagation()}>
                View Profile
              </Link>
            </Button>
            <ConfirmDialog
              title="Hire Medical Specialist?"
              description="This will cost $5,000 and reduce recovery time by 2 weeks."
              onConfirm={() => onTreatInjury(player.id)}
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

      {isSelected && (
        <div className="absolute top-3 right-3 text-primary animate-pulse z-30">
          <ArrowRightLeft size={20} />
        </div>
      )}

      {((isBench && selectedSwapIsNull) || isSelected) && (
        <div className="absolute top-3 right-3 z-30">
          <Button
            size="sm"
            variant={isSelected ? "destructive" : "secondary"}
            className="h-7 text-[9px] font-normal uppercase tracking-widest shadow-lg"
            onClick={(e) => {
              e.stopPropagation()
              if (isSelected) onSwapCancel()
              else onSwapInitiate(index)
            }}
          >
            {isSelected ? "Cancel" : "Swap"}
          </Button>
        </div>
      )}
    </PlayerCard>
  )
})

export default function SquadPage() {
  return (
    <ErrorBoundary section="Squad / Roster">
      <SquadPageInner />
    </ErrorBoundary>
  )
}

function SquadPageInner() {
  const { players, playerTeamId, academyPlayers, swapRosterPositions, startRoleTraining, contracts, currentWeek, treatInjury, promoteProspect, addToast } = useGameStore(useShallow(state => ({
    players: state.players,
    playerTeamId: state.playerTeamId,
    academyPlayers: state.academyPlayers,
    swapRosterPositions: state.swapRosterPositions,
    startRoleTraining: state.startRoleTraining,
    contracts: state.contracts,
    currentWeek: state.currentWeek,
    treatInjury: state.treatInjury,
    promoteProspect: state.promoteProspect,
    addToast: state.addToast,
  })))
  const teamData = useCurrentTeam()

  const [selectedSwapIndex, setSelectedSwapIndex] = useState<number | null>(null)
  const [trainingPlayer, setTrainingPlayer] = useState<any>(null)
  const [promotingProspectId, setPromotingProspectId] = useState<string | null>(null)

  // O(1) player-id → player map. Replaces the `players.find(p => p.id === id)`
  // scan the roster loop below was doing — O(roster × players) per render.
  const playerById = useMemo(() => {
    const map = new Map<string, typeof players[number]>()
    for (const p of players) map.set(p.id, p)
    return map
  }, [players])

  // Hydrate Roster with evaluations - DO NOT SORT to preserve user order
  const roster = useMemo(() => {
    if (!teamData) return []

    return (teamData.rosterIds || [])
      .map((id, index) => {
        const player = playerById.get(id)
        if (!player) return null
        const evaluation = evaluatePlayer(player)
        const playerTier = getDisplayPlayerTier(evaluation.overallRating, teamData?.tier as TierLevel)
        return { ...player, evaluation, playerTier, originalIndex: index }
      })
      .filter(Boolean) as any[]
  }, [playerById, teamData])

  const handleSwapInitiate = useCallback((index: number) => {
    setSelectedSwapIndex(index)
  }, [])

  const handleSwapExecute = useCallback((targetIndex: number) => {
    if (selectedSwapIndex === null) return
    swapRosterPositions(playerTeamId!, selectedSwapIndex, targetIndex)
    setSelectedSwapIndex(null)
    addToast({ message: "Lineup updated", type: "info" })
  }, [selectedSwapIndex, swapRosterPositions, playerTeamId, addToast])

  const handleCancelSwap = useCallback(() => {
    setSelectedSwapIndex(null)
  }, [])

  // O(1) contract lookup — was O(roster × contracts) per render before.
  const contractByPlayerId = useMemo(() => {
    const m = new Map<string, typeof contracts[number]>()
    for (const c of contracts) m.set(c.playerId, c)
    return m
  }, [contracts])

  if (!teamData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground opacity-20" />
        <p className="text-muted-foreground font-bold tracking-widest uppercase text-xs">Team data not found</p>
      </div>
    )
  }

  // Split into Active and Bench
  const activeRoster = roster.slice(0, 5)
  const benchRoster = roster.slice(5)

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
          <StatTile label="Active" value={`${activeRoster.length} / 5`} />
          <StatTile label="Bench" value={benchRoster.length} />
          <StatTile
            label="Rating"
            tone="success"
            value={activeRoster.length > 0 ? Math.round(activeRoster.reduce((sum, p) => sum + p.evaluation.overallRating, 0) / activeRoster.length) : 0}
          />
        </div>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Player Cards (Active + Bench) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Active Roster */}
          <div className="space-y-4">
            <SectionHeader
              icon={Zap}
              title="Starting Lineup"
              actions={<span className="text-[10px] font-bold text-muted-foreground uppercase">Top 5 Players</span>}
            />

            <div className="space-y-3">
              {activeRoster.length > 0 ? (
                activeRoster.map((player) => {
                  const idx = player.originalIndex
                  const isSelected = selectedSwapIndex === idx
                  const isSwapTarget = selectedSwapIndex !== null && !isSelected
                  const contract = contractByPlayerId.get(player.id)
                  const weeksLeft = contract ? Math.max(0, contract.endWeek - currentWeek) : 0
                  return (
                    <RosterCard
                      key={player.id}
                      player={player}
                      index={idx}
                      isSelected={isSelected}
                      isSwapTarget={isSwapTarget}
                      weeksLeft={weeksLeft}
                      yearsLeft={weeksLeft > 0 ? weeksLeft / 52 : 0}
                      salary={contract?.salaryPerWeek ?? 0}
                      selectedSwapIsNull={selectedSwapIndex === null}
                      onSwapInitiate={handleSwapInitiate}
                      onSwapExecute={handleSwapExecute}
                      onSwapCancel={handleCancelSwap}
                      onTreatInjury={treatInjury}
                    />
                  )
                })
              ) : (
                <EmptyState
                  icon={Users}
                  title="No active players"
                  description="Sign free agents to build your starting lineup"
                  action={{ label: "Browse Transfers", href: "/transfers" }}
                />
              )}
            </div>
          </div>

          {/* Bench Roster */}
          <div className="space-y-4 pt-4 border-t border-white/5">
            <SectionHeader
              icon={Users}
              iconClassName="text-white/60"
              tone="muted"
              title="Bench & Reserve"
              actions={selectedSwapIndex !== null ? (
                <span className="text-xs font-bold text-primary animate-pulse">Select a starting player to swap with</span>
              ) : undefined}
            />

            <div className="space-y-3">
              {benchRoster.length > 0 ? (
                benchRoster.map((player) => {
                  const idx = player.originalIndex
                  const isSelected = selectedSwapIndex === idx
                  // Bench cards are never swap-targets (only starters are).
                  const contract = contractByPlayerId.get(player.id)
                  const weeksLeft = contract ? Math.max(0, contract.endWeek - currentWeek) : 0
                  return (
                    <RosterCard
                      key={player.id}
                      player={player}
                      index={idx}
                      isBench
                      isSelected={isSelected}
                      isSwapTarget={false}
                      weeksLeft={weeksLeft}
                      yearsLeft={weeksLeft > 0 ? weeksLeft / 52 : 0}
                      salary={contract?.salaryPerWeek ?? 0}
                      selectedSwapIsNull={selectedSwapIndex === null}
                      onSwapInitiate={handleSwapInitiate}
                      onSwapExecute={handleSwapExecute}
                      onSwapCancel={handleCancelSwap}
                      onTreatInjury={treatInjury}
                    />
                  )
                })
              ) : (
                <EmptyState title="Bench is empty" framed />
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
          <SectionHeader icon={Users} title="Synergy Analysis (Active)" />
          {/* Only show synergy for active roster */}
          <ChemistryMatrix players={activeRoster as any} synergyMatrix={teamData.synergyMatrix} />

            <div className="glass-panel p-6 border-white/5 bg-white/[0.02] rounded-lg">
            <SynergyChart players={activeRoster as any} />
          </div>



          {/* Youth Academy */}
            <div className="glass-panel p-6 border-white/5 bg-white/[0.02] rounded-lg">
            <SectionHeader
              className="mb-6"
              icon={Users}
              title="Youth Academy"
              subtitle="Developing the next generation"
              actions={<Link href="/academy">
                <Button variant="ghost" size="sm" className="h-8 text-[10px] font-normal uppercase text-primary hover:bg-primary/10 border border-primary/20">
                  <ArrowUpRight size={12} className="mr-1" /> Manage
                </Button>
              </Link>}
            />

            <div className="space-y-3">
              {academyPlayers && academyPlayers.length > 0 ? (
                academyPlayers.map((ap: any) => {
                  const prospect = players.find(p => p.id === ap.playerId)
                  if (!prospect) return null
                  const rating = Math.round((prospect.skill + prospect.rifle + prospect.tactic + prospect.teamwork) / 4)
                  return (
                    <PlayerCard
                      key={ap.id}
                      player={{
                        id: prospect.id,
                        nickname: prospect.nickname,
                        portraitPath: prospect.portraitPath,
                        role: prospect.role,
                        nationality: prospect.nationality,
                        overallRating: rating,
                      }}
                      size="sm"
                      variant="compact"
                      overlays={{ stats: true }}
                      href={null}
                    >
                      <div className="absolute top-1/2 right-3 -translate-y-1/2 flex items-center gap-3 z-20">
                        <div className="flex items-center gap-1 text-[8px] font-normal text-amber-400">
                          <Star size={8} className="fill-amber-400" />
                          <span>{prospect.potential || 80}+</span>
                        </div>
                        {ap.readyForPromotion && (
                          <Button
                            onClick={(e) => { e.stopPropagation(); setPromotingProspectId(ap.id) }}
                            size="sm"
                            className="h-8 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-normal uppercase px-2 shadow-sm"
                          >
                            <ArrowUpRight size={12} className="mr-1" /> Promote
                          </Button>
                        )}
                      </div>
                    </PlayerCard>
                  )
                })
              ) : (
                <EmptyState
                  title="No prospects in training"
                  action={{ label: "Start Scouting", href: "/academy" }}
                />
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
                className="glass-panel max-w-md w-full p-8 border-white/10 bg-white/5 relative overflow-hidden rounded-xl"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Users size={120} />
              </div>

              <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
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
