"use client"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { EmptyState } from "@/src/components/ui/EmptyState"
import { Panel } from "@/src/components/ui/Panel"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { Meter } from "@/src/components/ui/Meter"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { TrophyCabinet } from "@/components/squad/TrophyCabinet"
import { DressingRoomPanel } from "@/components/squad/DressingRoomPanel"
import { PersonalityChips } from "@/components/player/PersonalityChips"
import { captainId } from "@/engine/personality"
import { SENIOR_ROSTER_MAX, squadFullMessage } from "@/engine/roster-rules"
import { PERSONALITY_TUNING } from "@/lib/balance-tuning"
import { AlertCircle, ArrowRightLeft, ArrowUpRight, Users, Plus, Star, CheckCircle2, Activity } from "lucide-react"
import dynamic from "next/dynamic"
const ChemistryMatrix = dynamic(() => import("@/components/squad/ChemistryMatrix"), { ssr: false })
import { motion, AnimatePresence } from "framer-motion"
import { useFocusTrap } from "@/lib/accessibility"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { playerEnergyPercent } from "@/lib/player-energy"
import { formatCurrency } from "@/lib/utils-extended"
import { cn } from "@/lib/utils"
import { useState, useMemo, useCallback, memo, type KeyboardEvent, type ReactNode } from "react"
const SynergyChart = dynamic(() => import("@/components/squad/SynergyChart").then(m => m.SynergyChart), { ssr: false })
const SystemBonuses = dynamic(() => import("@/components/squad/SystemBonuses").then(m => m.SystemBonuses), { ssr: false })
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorBoundary } from "@/components/ui/error-boundary"

/** Contract weeks left → tone: red inside a month, amber inside a quarter. */
function contractTone(weeksLeft: number): string {
  if (weeksLeft <= 4) return "text-negative"
  if (weeksLeft <= 13) return "text-caution"
  return "text-ink-2"
}

type RosterRowProps = {
  player: any
  teamId: string
  index: number
  slot: number
  isCaptain: boolean
  isBench: boolean
  isSelected: boolean
  isSwapTarget: boolean
  weeksLeft: number
  salary: number
  swapIdle: boolean
  onOpen: (playerId: string) => void
  onSwapInitiate: (index: number) => void
  onSwapExecute: (targetIndex: number) => void
  onSwapCancel: () => void
  onTreatInjury: (playerId: string) => void
}

// Module-level + memoized so a row only re-renders when its own props change.
const RosterRow = memo(function RosterRow({
  player, teamId, index, slot, isCaptain, isBench, isSelected, isSwapTarget, weeksLeft, salary, swapIdle,
  onOpen, onSwapInitiate, onSwapExecute, onSwapCancel, onTreatInjury,
}: RosterRowProps) {
  const apps = player.personality?.apps
  const sittingOut = apps?.teamId === teamId && apps.regular && apps.benched >= PERSONALITY_TUNING.BENCH_MATCHES && !player.injury ? apps.benched as number : 0
  const activate = () => {
    if (isSwapTarget) onSwapExecute(index)
    else if (swapIdle) onOpen(player.id)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate() }
  }
  return (
    <tr
      data-slot="table-row"
      data-state={isSelected ? "selected" : undefined}
      tabIndex={0}
      aria-label={isSwapTarget ? `Swap into slot ${slot}: replace ${player.nickname}` : `${player.nickname}, open profile`}
      onClick={activate}
      onKeyDown={onKeyDown}
      className={cn(
        "group h-14 cursor-pointer border-b border-line outline-none transition-colors focus-visible:bg-hover",
        isSwapTarget && "bg-gold/5 hover:bg-gold/10",
        player.injury && "bg-negative/5",
      )}
    >
      <td className="w-10 pl-4 text-xs font-semibold tabular-nums text-ink-3">{isSwapTarget ? <ArrowRightLeft size={14} className="text-gold" /> : slot}</td>
      <td className="py-2 pr-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-raised">
            <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={40} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold text-ink-1 group-hover:text-gold">{player.nickname}</span>
              {isCaptain && (
                <span title="Captain: when he plays, defeats cost the lineup less morale" aria-label="Captain" className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-gold/60 text-[11px] font-bold leading-none text-gold">C</span>
              )}
              {sittingOut > 0 && (
                <span title={`Regular starter left out of ${sittingOut} official matches: loses morale each week until he plays`} className="rounded-sm bg-caution/15 px-1.5 py-0.5 text-[11px] font-semibold text-caution">
                  Benched {sittingOut}
                </span>
              )}
              {player.injury && (
                <span className="inline-flex items-center gap-1 rounded-sm bg-negative/15 px-1.5 py-0.5 text-[11px] font-semibold text-negative">
                  <Activity size={11} /> Injured · {player.injury.weeksRemaining}w
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
              <CountryFlag country={player.nationality} size={14} />
              {/* Many generated players carry the nickname as their name; don't repeat it. */}
              <span className="truncate">{player.name && player.name !== player.nickname ? player.name : String(player.nationality || "").toUpperCase()}</span>
            </div>
          </div>
        </div>
      </td>
      <td className="px-3"><RoleTag role={player.role} /></td>
      <td className="px-3"><PersonalityChips player={player} /></td>
      <td className="px-3 text-center"><RatingChip value={player.evaluation.overallRating} /></td>
      <td className="px-3 text-center text-sm tabular-nums text-ink-2">{player.age}</td>
      <td className="px-3"><Meter value={player.morale} label="Morale" /></td>
      <td className="px-3"><Meter value={player.form} label="Form" /></td>
      <td className="px-3"><Meter value={playerEnergyPercent(player)} label="Energy" /></td>
      <td className={cn("px-3 text-right text-sm tabular-nums", contractTone(weeksLeft))}>
        {weeksLeft >= 52 ? `${(weeksLeft / 52).toFixed(1)}y` : `${weeksLeft}w`}
      </td>
      <td className="px-3 text-right text-sm tabular-nums text-ink-2">{formatCurrency(salary, "$", false)}</td>
      <td className="w-36 pr-4 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-2">
          {player.injury && (
            <ConfirmDialog
              title="Hire medical specialist?"
              description="Costs $5,000 and cuts recovery time by 2 weeks."
              onConfirm={() => onTreatInjury(player.id)}
              confirmText="Hire specialist"
              icon="info"
            >
              <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-xs">
                <Plus size={12} /> Treat $5k
              </Button>
            </ConfirmDialog>
          )}
          {isSelected ? (
            <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={onSwapCancel}>Cancel</Button>
          ) : isBench && swapIdle ? (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs" onClick={() => onSwapInitiate(index)}>
              <ArrowRightLeft size={13} /> Swap in
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  )
})

function SectionRow({ label, hint }: { label: string; hint?: ReactNode }) {
  return (
    <tr className="border-b border-line bg-shell">
      <td colSpan={12} className="px-4 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</span>
          {hint}
        </div>
      </td>
    </tr>
  )
}

export default function SquadPage() {
  return (
    <ErrorBoundary section="Squad / Roster">
      <SquadPageInner />
    </ErrorBoundary>
  )
}

function SquadPageInner() {
  const { players, playerTeamId, academyPlayers, swapRosterPositions, contracts, currentWeek, treatInjury, promoteProspect, addToast, loading } = useGameStore(useShallow(state => ({
    players: state.players,
    playerTeamId: state.playerTeamId,
    academyPlayers: state.academyPlayers,
    swapRosterPositions: state.swapRosterPositions,
    contracts: state.contracts,
    currentWeek: state.currentWeek,
    treatInjury: state.treatInjury,
    promoteProspect: state.promoteProspect,
    addToast: state.addToast,
    // A fresh career or a load is still filling the store: wait, don't say "not found".
    loading: !state._hasHydrated || state.isLoading,
  })))
  const teamData = useCurrentTeam()
  const router = useRouter()

  const [selectedSwapIndex, setSelectedSwapIndex] = useState<number | null>(null)
  const [promotingProspectId, setPromotingProspectId] = useState<string | null>(null)
  const promoteDialogRef = useFocusTrap(!!promotingProspectId, () => setPromotingProspectId(null))

  // O(1) player-id → player map (was an O(roster × players) scan per render).
  const playerById = useMemo(() => {
    const map = new Map<string, typeof players[number]>()
    for (const p of players) map.set(p.id, p)
    return map
  }, [players])

  // Roster with evaluations, in the manager's order (slot order matters).
  const roster = useMemo(() => {
    if (!teamData) return []
    return (teamData.rosterIds || [])
      .map((id, index) => {
        const player = playerById.get(id)
        if (!player) return null
        return { ...player, evaluation: evaluatePlayer(player), originalIndex: index }
      })
      .filter(Boolean) as any[]
  }, [playerById, teamData])

  const contractByPlayerId = useMemo(() => {
    const m = new Map<string, typeof contracts[number]>()
    for (const c of contracts) m.set(c.playerId, c)
    return m
  }, [contracts])

  const openPlayer = useCallback((playerId: string) => router.push(`/player/${playerId}`), [router])
  const handleSwapInitiate = useCallback((index: number) => setSelectedSwapIndex(index), [])
  const handleCancelSwap = useCallback(() => setSelectedSwapIndex(null), [])
  const handleSwapExecute = useCallback((targetIndex: number) => {
    if (selectedSwapIndex === null) return
    swapRosterPositions(playerTeamId!, selectedSwapIndex, targetIndex)
    setSelectedSwapIndex(null)
    addToast({ message: "Lineup updated", type: "info" })
  }, [selectedSwapIndex, swapRosterPositions, playerTeamId, addToast])

  if (!teamData && loading) return <div className="min-h-[50vh]" aria-busy="true" />

  if (!teamData) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4">
        <AlertCircle className="h-12 w-12 text-ink-3 opacity-40" />
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Team data not found</p>
      </div>
    )
  }

  const activeRoster = roster.slice(0, 5)
  const benchRoster = roster.slice(5)
  const captain = captainId(teamData, id => playerById.get(id))
  const teamOvr = activeRoster.length > 0 ? Math.round(activeRoster.reduce((sum, p) => sum + p.evaluation.overallRating, 0) / activeRoster.length) : 0
  const avgAge = activeRoster.length > 0 ? (activeRoster.reduce((sum, p) => sum + (p.age || 0), 0) / activeRoster.length).toFixed(1) : "—"
  const wageBill = roster.reduce((sum, p) => sum + (contractByPlayerId.get(p.id)?.salaryPerWeek ?? 0), 0)
  const season = Math.ceil(currentWeek / 52)

  const renderRow = (player: any, slot: number, isBench: boolean) => {
    const idx = player.originalIndex
    const isSelected = selectedSwapIndex === idx
    // Only starters are swap targets for a selected bench player.
    const isSwapTarget = !isBench && selectedSwapIndex !== null && !isSelected
    const contract = contractByPlayerId.get(player.id)
    return (
      <RosterRow
        key={player.id}
        player={player}
        index={idx}
        slot={slot}
        teamId={teamData.id}
        isCaptain={player.id === captain}
        isBench={isBench}
        isSelected={isSelected}
        isSwapTarget={isSwapTarget}
        weeksLeft={contract ? Math.max(0, contract.endWeek - currentWeek) : 0}
        salary={contract?.salaryPerWeek ?? 0}
        swapIdle={selectedSwapIndex === null}
        onOpen={openPlayer}
        onSwapInitiate={handleSwapInitiate}
        onSwapExecute={handleSwapExecute}
        onSwapCancel={handleCancelSwap}
        onTreatInjury={treatInjury}
      />
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
      <ScreenHeader
        eyebrow={`Season ${season} · Roster`}
        title={teamData.name}
        subtitle="Your starting five plays every match. Click a player for their profile; swap the bench in from the right."
        leading={
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-line bg-panel">
            <TeamLogoDisplay team={teamData} size={52} />
          </div>
        }
        aside={
          <KpiStrip>
            <Kpi label="Team OVR" value={<RatingChip value={teamOvr} size="lg" bare />} />
            <Kpi label="Avg age" value={avgAge} />
            <Kpi label="Chemistry" value={`${Math.round(teamData.chemistry ?? 0)}%`} />
            <Kpi label="Wages / wk" value={formatCurrency(wageBill, "$", false)} />
          </KpiStrip>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Panel padded={false} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table data-slot="table" className="w-full min-w-[1120px] border-collapse text-left">
                <thead data-slot="table-header">
                  <tr className="border-b border-line">
                    <th data-slot="table-head" className="pl-4">#</th>
                    <th data-slot="table-head">Player</th>
                    <th data-slot="table-head" className="px-3">Role</th>
                    <th data-slot="table-head" className="px-3">Personality</th>
                    <th data-slot="table-head" className="px-3 text-center">OVR</th>
                    <th data-slot="table-head" className="px-3 text-center">Age</th>
                    <th data-slot="table-head" className="px-3">Morale</th>
                    <th data-slot="table-head" className="px-3">Form</th>
                    <th data-slot="table-head" className="px-3">Energy</th>
                    <th data-slot="table-head" className="px-3 text-right">Contract</th>
                    <th data-slot="table-head" className="px-3 text-right">Wage / wk</th>
                    <th data-slot="table-head" className="pr-4"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  <SectionRow
                    label="Starting five"
                    hint={selectedSwapIndex !== null
                      ? <span className="text-xs font-semibold text-gold">Choose the starter to replace</span>
                      : <span className="text-xs text-ink-3">{activeRoster.length} / 5</span>}
                  />
                  {activeRoster.length > 0
                    ? activeRoster.map((p, i) => renderRow(p, i + 1, false))
                    : (
                      <tr><td colSpan={12} className="p-6">
                        <EmptyState icon={Users} title="No active players" description="Sign free agents to build your starting lineup" action={{ label: "Browse transfers", href: "/transfers" }} />
                      </td></tr>
                    )}
                  <SectionRow
                    label="Bench"
                    hint={<span className={cn("text-xs tabular-nums", roster.length >= SENIOR_ROSTER_MAX ? "text-caution" : "text-ink-3")}>{benchRoster.length} · squad {roster.length}/{SENIOR_ROSTER_MAX}</span>}
                  />
                  {benchRoster.length > 0
                    ? benchRoster.map((p, i) => renderRow(p, i + 6, true))
                    : <tr><td colSpan={12} className="px-4 py-5 text-sm text-ink-3">Bench is empty. Sign a sixth player to cover injuries.</td></tr>}
                  {roster.length >= SENIOR_ROSTER_MAX && (
                    <tr><td colSpan={12} role="status" className="border-t border-line px-4 py-3 text-xs text-ink-2">{squadFullMessage(roster.length)}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <SystemBonuses players={activeRoster as any} />
        </div>

        <aside className="min-w-0 space-y-4">
          <DressingRoomPanel team={teamData} />

          <Panel title="Chemistry" padded={false} bodyClassName="p-2">
            <ChemistryMatrix players={activeRoster as any} synergyMatrix={teamData.synergyMatrix} teamChemistry={teamData.chemistry} />
          </Panel>

          <Panel title="Team profile">
            <SynergyChart players={activeRoster as any} />
          </Panel>

          <Panel
            title="Academy"
            actions={<Link href="/academy" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-gold">Manage <ArrowUpRight size={12} /></Link>}
            padded={false}
          >
            {academyPlayers && academyPlayers.length > 0 ? (
              <ul className="divide-y divide-line">
                {academyPlayers.map((ap: any) => {
                  const prospect = playerById.get(ap.playerId)
                  if (!prospect) return null
                  const rating = evaluatePlayer(prospect).overallRating
                  return (
                    <li key={ap.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-raised">
                        <PlayerPortrait src={prospect.portraitPath} seed={prospect.id} alt={prospect.nickname} size={32} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-1">{prospect.nickname}</p>
                        <p className="flex items-center gap-1 text-xs text-ink-3"><Star size={10} className="text-gold" /> Potential {prospect.potential || 80}+</p>
                      </div>
                      <RatingChip value={rating} size="sm" />
                      {ap.readyForPromotion && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPromotingProspectId(ap.id)}>Promote</Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="p-4"><EmptyState title="No prospects in training" action={{ label: "Open academy", href: "/academy" }} /></div>
            )}
          </Panel>
        </aside>
      </div>

      <TrophyCabinet trophies={(teamData.trophies || []) as any} />

      {/* Promotion confirmation */}
      <AnimatePresence>
        {promotingProspectId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-modal flex items-center justify-center bg-[#040609]/80 p-4"
          >
            <motion.div
              initial={{ scale: 0.97, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0, y: 8 }}
              ref={promoteDialogRef} tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title-promote-prospect"
              className="max-h-[calc(100dvh-6rem)] w-full max-w-md overflow-y-auto rounded-[10px] border border-line-strong bg-panel p-6"
            >
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-positive/10">
                    <CheckCircle2 size={26} className="text-positive" />
                  </div>
                  <div>
                    <h2 id="modal-title-promote-prospect" className="font-display text-2xl font-bold uppercase text-ink-1">Promote to main roster</h2>
                    <p className="text-xs text-ink-3">Graduate from the academy</p>
                  </div>
                </div>

                <dl className="divide-y divide-line rounded-lg border border-line text-sm">
                  <div className="flex justify-between px-4 py-2.5"><dt className="text-ink-3">Salary</dt><dd className="font-semibold text-ink-1">$2,000 / week</dd></div>
                  <div className="flex justify-between px-4 py-2.5"><dt className="text-ink-3">Contract</dt><dd className="font-semibold text-ink-1">104 weeks (2 years)</dd></div>
                  <div className="flex justify-between px-4 py-2.5"><dt className="text-ink-3">Roster slot</dt><dd className="font-semibold text-ink-1">Bench</dd></div>
                </dl>

                <p className="text-sm text-ink-2">
                  The player moves from the academy to your professional squad. Choose their place in the starting five after promotion. Tournament eligibility is checked separately.
                </p>

                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      const result = promoteProspect(promotingProspectId, { salaryPerWeek: 2000, lengthWeeks: 104 })
                      if (result.success) {
                        addToast({ message: result.message, type: "info" })
                        setPromotingProspectId(null)
                      }
                    }}
                    className="h-11 flex-1"
                  >
                    Confirm promotion
                  </Button>
                  <Button onClick={() => setPromotingProspectId(null)} variant="outline" className="h-11 flex-1">
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
