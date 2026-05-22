"use client"

import { useState, useEffect, useMemo } from "react"
import { useDebounce } from "@/hooks/useDebounce"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, DollarSign, Calendar, FileText, UserPlus, ChevronLeft, ChevronRight as ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { TableBody } from "@/components/ui/table"
import {
  GlassTable,
  GlassTableHeader,
  GlassTableHead,
  GlassTableRow,
  GlassTableCell,
  GlassStatCell
} from "@/components/ui/GlassTable"
import { motion } from "framer-motion"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "@/lib/toast"
import { NegotiationModal } from "@/components/transfer/NegotiationModal"
import { ErrorBoundary } from "@/components/ui/error-boundary"

export default function TransfersPage() {
  return (
    <ErrorBoundary section="Transfers / Roster Management">
      <TransfersPageInner />
    </ErrorBoundary>
  )
}

function TransfersPageInner() {
  const { players, teams, getPlayerTeam, transferPlayer, currentWeek } = useGameStore(useShallow(state => ({
    players: state.players,
    teams: state.teams,
    getPlayerTeam: state.getPlayerTeam,
    transferPlayer: state.transferPlayer,
    currentWeek: state.currentWeek,
  })))
  const playerTeam = getPlayerTeam()
  const [searchTerm, setSearchTerm] = useState("")
  const debouncedSearch = useDebounce(searchTerm, 300)
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [negotiationPlayerId, setNegotiationPlayerId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [loadTimeout, setLoadTimeout] = useState(false)
  const PAGE_SIZE = 25

  useEffect(() => {
    if (!playerTeam) {
      const timer = setTimeout(() => setLoadTimeout(true), 5000)
      return () => clearTimeout(timer)
    }
    setLoadTimeout(false)
  }, [playerTeam])

  // Pre-build roster set for O(1) exclusion check and player→team map for
  // O(1) team lookups. Must run before the early return below so hook order
  // stays stable across renders.
  const { rosterSet, playerTeamMap } = useMemo(() => {
    const rosterSet = new Set(playerTeam?.rosterIds ?? [])
    const playerTeamMap = new Map<string, typeof teams[0]>()
    teams.forEach(t => t.rosterIds.forEach(pid => playerTeamMap.set(pid, t)))
    return { rosterSet, playerTeamMap }
  }, [playerTeam?.rosterIds, teams])

  if (!playerTeam) {
    if (loadTimeout) {
      return (
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center space-y-4">
            <p className="text-red-400 text-sm font-bold uppercase tracking-widest">Failed to load team data</p>
            <p className="text-muted-foreground text-xs">Team data could not be retrieved. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-widest hover:bg-primary/80 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest">Loading Market Data...</p>
        </div>
      </div>
    )
  }

  // Filter available players (not in user team, not retired) - single-pass filter + precomputed OVR for sort
  const searchLower = debouncedSearch.toLowerCase()
  const allFiltered = players
    .filter(p =>
      !rosterSet.has(p.id) &&
      !p.isRetired &&
      p.nickname.toLowerCase().includes(searchLower) &&
      (roleFilter ? p.role === roleFilter : true)
    )
    .sort((a, b) =>
      ((b.skill + b.tactic + b.teamwork) - (a.skill + a.tactic + a.teamwork))
    )

  const totalPages = Math.max(1, Math.ceil(allFiltered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const availablePlayers = allFiltered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const getTeamForPlayer = (playerId: string) => {
    return playerTeamMap.get(playerId)
  }

  // Calculate estimated weekly salary based on player value
  const getEstimatedSalary = (player: any) => {
    const ovr = (player.skill + player.tactic + player.teamwork) / 3
    const baseSalary = Math.round(ovr * 50 * (1 + (player.potential / 200)))
    return Math.max(baseSalary, 300) // Minimum $300/week
  }

  // Get contract terms for a player
  const getContractTerms = (player: any) => {
    const team = getTeamForPlayer(player.id)
    const isFreeAgent = !team
    const ovr = (player.skill + player.tactic + player.teamwork) / 3
    const transferFee = isFreeAgent ? 0 : Math.floor(ovr * 1000 * (1 + (player.potential / 100)))
    const salary = getEstimatedSalary(player)

    return {
      isFreeAgent,
      transferFee,
      salary,
      duration: 52, // 1 year
      buyout: isFreeAgent ? 0 : Math.round(transferFee * 1.5)
    }
  }

  const handleBuy = (player: any) => {
    setNegotiationPlayerId(player.id)
  }

  return (
    <div className="space-y-8">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-1"
        >
          <h1 className="text-3xl font-normal liquid-text tracking-tighter uppercase">Scouting & Transfers</h1>
          <p className="text-muted-foreground font-medium text-sm">Discover and negotiate with the world's best talent.</p>
        </motion.div>

        {/* Filters & Search */}
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by nickname..."
              aria-label="Search by nickname"
              className="pl-10 h-11 bg-white/[0.03] border-white/10 rounded-xl focus:ring-primary/40 transition-all font-medium text-sm text-white"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(0) }}
            />
          </div>
          <div className="flex bg-white/[0.03] border border-white/10 rounded-xl p-1">
            {[
              { value: "AWPER", label: "AWPER" },
              { value: "RIFLER", label: "RIFLER" },
              { value: "IGL", label: "IGL" },
              { value: "SUPPORT", label: "SUPPORT" },
              { value: "ENTRY_FRAGGER", label: "ENTRY" },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => { setRoleFilter(roleFilter === value ? null : value); setPage(0) }}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-[10px] font-normal tracking-widest uppercase transition-all",
                  roleFilter === value
                    ? "bg-primary text-white shadow-lg"
                    : "text-muted-foreground hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <GlassTable>
          <GlassTableHeader>
            <GlassTableRow className="hover:bg-transparent">
              <GlassTableHead className="w-[200px]">Player</GlassTableHead>
              <GlassTableHead>Status</GlassTableHead>
              <GlassTableHead>Role</GlassTableHead>
              <GlassTableHead className="text-center">Age</GlassTableHead>
              <GlassTableHead className="text-center">Skill</GlassTableHead>
              <GlassTableHead className="text-center">Tactic</GlassTableHead>
              <GlassTableHead className="text-center">Teamwork</GlassTableHead>
              <GlassTableHead className="text-center font-bold text-white">OVR</GlassTableHead>
              <GlassTableHead className="text-right">Contract Terms</GlassTableHead>
              <GlassTableHead className="text-right"></GlassTableHead>
            </GlassTableRow>
          </GlassTableHeader>
          <TableBody>
            {availablePlayers.length > 0 ? (
              availablePlayers.map((player) => {
                const team = getTeamForPlayer(player.id)
                const ovr = Math.round((player.skill + player.tactic + player.teamwork) / 3)
                const terms = getContractTerms(player)

                return (
                  <GlassTableRow key={player.id} className="group/row">
                    <GlassTableCell>
                      <Link href={`/player/${player.id}`} className="flex items-center gap-3 group-hover/row:translate-x-1 transition-transform">
                        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-bold text-xs text-white">
                          {player.nickname[0]}
                        </div>
                        <span className="font-bold text-white transition-colors group-hover/row:text-primary">{player.nickname}</span>
                      </Link>
                    </GlassTableCell>
                    <GlassTableCell>
                      {terms.isFreeAgent ? (
                        <Badge className="text-[9px] font-normal uppercase tracking-widest bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          <UserPlus size={10} className="mr-1" />
                          Free Agent
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground uppercase font-normal tracking-widest">
                          {team?.name}
                        </span>
                      )}
                    </GlassTableCell>
                    <GlassTableCell>
                      <Badge variant="outline" className="text-[9px] font-normal uppercase tracking-widest border-white/10 bg-white/5 text-muted-foreground">
                        {player.role === "ENTRY_FRAGGER" ? "ENTRY" : player.role}
                      </Badge>
                    </GlassTableCell>
                    <GlassTableCell className="text-center font-sans text-xs opacity-60 text-white">{player.age}</GlassTableCell>
                    <GlassStatCell value={player.skill} />
                    <GlassStatCell value={player.tactic} />
                    <GlassStatCell value={player.teamwork} />
                    <GlassStatCell value={ovr} className="bg-white/[0.03] scale-110 !text-white !opacity-100" />
                    <GlassTableCell className="text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="inline-flex flex-col items-end cursor-help">
                              {terms.isFreeAgent ? (
                                <>
                                  <span className="text-[10px] text-emerald-400 font-bold uppercase">Free</span>
                                  <span className="text-[10px] text-muted-foreground">${terms.salary}/wk</span>
                                </>
                              ) : (
                                <>
                                  <span className="font-sans font-bold text-amber-400">
                                    ${terms.transferFee.toLocaleString()}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">${terms.salary}/wk</span>
                                </>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="bg-zinc-900 border-white/10 p-3">
                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-2 text-white font-bold">
                                <FileText size={14} />
                                Contract Preview
                              </div>
                              <div className="space-y-1 text-muted-foreground">
                                <div className="flex justify-between gap-4">
                                  <span>Transfer Fee:</span>
                                  <span className={terms.isFreeAgent ? "text-emerald-400" : "text-amber-400"}>
                                    {terms.isFreeAgent ? "Free" : `$${terms.transferFee.toLocaleString()}`}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span>Weekly Salary:</span>
                                  <span className="text-white">${terms.salary.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span>Duration:</span>
                                  <span className="text-white">1 year</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span>Buyout Clause:</span>
                                  <span className="text-white">
                                    {terms.buyout > 0 ? `$${terms.buyout.toLocaleString()}` : "None"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </GlassTableCell>
                    <GlassTableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => handleBuy(player)}
                        disabled={playerTeam.budget < terms.transferFee}
                        className={cn(
                          "rounded-lg h-8 px-4 font-normal text-[10px] uppercase tracking-widest transition-all",
                          playerTeam.budget >= terms.transferFee
                            ? terms.isFreeAgent
                              ? "bg-emerald-500 text-white hover:bg-emerald-400"
                              : "bg-white text-black hover:bg-emerald-400 hover:text-white"
                            : "bg-white/5 text-muted-foreground cursor-not-allowed border border-white/5"
                        )}
                      >
                        {terms.isFreeAgent ? "SIGN FREE" : "BUY"}
                      </Button>
                    </GlassTableCell>
                  </GlassTableRow>
                )
              })
            ) : (
              <GlassTableRow>
                <GlassTableCell colSpan={10} className="h-48 text-center">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <p className="text-muted-foreground uppercase font-normal tracking-widest text-[10px]">
                      No players match your filters
                    </p>
                    {(roleFilter || debouncedSearch) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setRoleFilter(null); setSearchTerm(""); setPage(0) }}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                </GlassTableCell>
              </GlassTableRow>
            )}
          </TableBody>
        </GlassTable>
      </motion.div>

      {/* Pagination */}
      {allFiltered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-widest">
            Showing {safePage * PAGE_SIZE + 1}-{Math.min((safePage + 1) * PAGE_SIZE, allFiltered.length)} of {allFiltered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className="h-8 px-3 rounded-lg border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft size={14} className="mr-1" /> Prev
            </Button>
            <span className="text-xs text-white font-bold px-2">
              {safePage + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              className="h-8 px-3 rounded-lg border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-30"
            >
              Next <ChevronRightIcon size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Negotiation Modal */}
      {negotiationPlayerId && (
        <NegotiationModal
          playerId={negotiationPlayerId}
          isOpen={!!negotiationPlayerId}
          onClose={() => setNegotiationPlayerId(null)}
        />
      )}
    </div>
  )
}
