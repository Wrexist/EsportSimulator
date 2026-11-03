"use client"
import { t, tn } from "@/lib/i18n"
import { countryName } from "@/lib/country"

import { LoadChip } from "@/components/squad/LoadChip"
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
      aria-label={isSwapTarget ? t("squad.row.swapInto", { slot, name: player.nickname }) : t("squad.row.open", { name: player.nickname })}
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
                <span title={t("squad.row.captainTitle")} aria-label={t("squad.row.captain")} className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-gold/60 text-[11px] font-bold leading-none text-gold">C</span>
              )}
              {sittingOut > 0 && (
                <span title={tn("squad.row.benchedTitle", sittingOut)} className="rounded-sm bg-caution/15 px-1.5 py-0.5 text-[11px] font-semibold text-caution">
                  {t("squad.row.benched", { n: sittingOut })}
                </span>
              )}
              {player.injury && (
                <span className="inline-flex items-center gap-1 rounded-sm bg-negative/15 px-1.5 py-0.5 text-[11px] font-semibold text-negative">
                  <Activity size={11} /> {t("squad.row.injured", { weeks: t("common.weeksShort", { count: player.injury.weeksRemaining }) })}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
              <CountryFlag country={player.nationality} size={14} />
              {/* Many generated players carry the nickname as their name; don't repeat it. */}
              <span className="truncate">{player.name && player.name !== player.nickname ? player.name : countryName(player.nationality).toUpperCase()}</span>
            </div>
          </div>
        </div>
      </td>
      <td className="px-3"><RoleTag role={player.role} /></td>
      <td className="px-3"><PersonalityChips player={player} /></td>
      <td className="px-3 text-center"><RatingChip value={player.evaluation.overallRating} /></td>
      <td className="px-3 text-center text-sm tabular-nums text-ink-2">{player.age}</td>
      <td className="px-3"><Meter value={player.morale} label={t("common.morale")} /></td>
      <td className="px-3"><Meter value={player.form} label={t("squad.col.form")} /></td>
      <td className="px-3"><Meter value={playerEnergyPercent(player)} label={t("common.energy")} /></td>
      <td className="px-3"><LoadChip player={player} /></td>
      <td className={cn("px-3 text-right text-sm tabular-nums", contractTone(weeksLeft))}>
        {weeksLeft >= 52 ? t("squad.row.years", { n: (weeksLeft / 52).toFixed(1) }) : t("common.weeksShort", { count: weeksLeft })}
      </td>
      <td className="px-3 text-right text-sm tabular-nums text-ink-2">{formatCurrency(salary, "$", false)}</td>
      <td className="w-36 pr-4 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-2">
          {player.injury && (
            <ConfirmDialog
              title={t("squad.treat.title")}
              description={t("squad.treat.body")}
              onConfirm={() => onTreatInjury(player.id)}
              confirmText={t("squad.treat.confirm")}
              icon="info"
            >
              <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-xs">
                <Plus size={12} /> {t("squad.treat.button")}
              </Button>
            </ConfirmDialog>
          )}
          {isSelected ? (
            <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={onSwapCancel}>{t("squad.cancel")}</Button>
          ) : isBench && swapIdle ? (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs" onClick={() => onSwapInitiate(index)}>
              <ArrowRightLeft size={13} /> {t("squad.swapIn")}
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
      <td colSpan={13} className="px-4 py-2">
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
    addToast({ message: t("squad.lineupUpdated"), type: "info" })
  }, [selectedSwapIndex, swapRosterPositions, playerTeamId, addToast])

  if (!teamData && loading) return <div className="min-h-[50vh]" aria-busy="true" />

  if (!teamData) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4">
        <AlertCircle className="h-12 w-12 text-ink-3 opacity-40" />
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{t("squad.notFound")}</p>
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
        eyebrow={t("squad.eyebrow", { season })}
        title={teamData.name}
        subtitle={t("squad.subtitle")}
        leading={
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-line bg-panel">
            <TeamLogoDisplay team={teamData} size={52} />
          </div>
        }
        aside={
          <KpiStrip>
            <Kpi label={t("common.teamOvr")} value={<RatingChip value={teamOvr} size="lg" bare />} />
            <Kpi label={t("squad.kpi.avgAge")} value={avgAge} />
            <Kpi label={t("squad.kpi.chemistry")} value={`${Math.round(teamData.chemistry ?? 0)}%`} />
            <Kpi label={t("squad.kpi.wages")} value={formatCurrency(wageBill, "$", false)} />
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
                    <th data-slot="table-head">{t("squad.col.player")}</th>
                    <th data-slot="table-head" className="px-3">{t("common.role")}</th>
                    <th data-slot="table-head" className="px-3">{t("squad.col.personality")}</th>
                    <th data-slot="table-head" className="px-3 text-center">{t("common.ovr")}</th>
                    <th data-slot="table-head" className="px-3 text-center">{t("squad.col.age")}</th>
                    <th data-slot="table-head" className="px-3">{t("common.morale")}</th>
                    <th data-slot="table-head" className="px-3">{t("squad.col.form")}</th>
                    <th data-slot="table-head" className="px-3">{t("common.energy")}</th>
                    <th data-slot="table-head" className="px-3" title={t("squad.col.loadTitle")}>{t("squad.col.load")}</th>
                    <th data-slot="table-head" className="px-3 text-right">{t("squad.col.contract")}</th>
                    <th data-slot="table-head" className="px-3 text-right">{t("squad.col.wage")}</th>
                    <th data-slot="table-head" className="pr-4"><span className="sr-only">{t("squad.col.actions")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  <SectionRow
                    label={t("squad.startingFive")}
                    hint={selectedSwapIndex !== null
                      ? <span className="text-xs font-semibold text-gold">{t("squad.chooseStarter")}</span>
                      : <span className="text-xs text-ink-3">{activeRoster.length} / 5</span>}
                  />
                  {activeRoster.length > 0
                    ? activeRoster.map((p, i) => renderRow(p, i + 1, false))
                    : (
                      <tr><td colSpan={13} className="p-6">
                        <EmptyState icon={Users} title={t("squad.noActive")} description={t("squad.noActiveHint")} action={{ label: t("squad.browseTransfers"), href: "/transfers" }} />
                      </td></tr>
                    )}
                  <SectionRow
                    label={t("squad.bench")}
                    hint={<span className={cn("text-xs tabular-nums", roster.length >= SENIOR_ROSTER_MAX ? "text-caution" : "text-ink-3")}>{t("squad.benchCount", { bench: benchRoster.length, size: roster.length, max: SENIOR_ROSTER_MAX })}</span>}
                  />
                  {benchRoster.length > 0
                    ? benchRoster.map((p, i) => renderRow(p, i + 6, true))
                    : <tr><td colSpan={13} className="px-4 py-5 text-sm text-ink-3">{t("squad.benchEmpty")}</td></tr>}
                  {roster.length >= SENIOR_ROSTER_MAX && (
                    <tr><td colSpan={13} role="status" className="border-t border-line px-4 py-3 text-xs text-ink-2">{squadFullMessage(roster.length)}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <SystemBonuses players={activeRoster as any} />
        </div>

        <aside className="min-w-0 space-y-4">
          <DressingRoomPanel team={teamData} />

          <Panel title={t("squad.panel.chemistry")} padded={false} bodyClassName="p-2">
            <ChemistryMatrix players={activeRoster as any} synergyMatrix={teamData.synergyMatrix} teamChemistry={teamData.chemistry} />
          </Panel>

          <Panel title={t("squad.panel.profile")}>
            <SynergyChart players={activeRoster as any} />
          </Panel>

          <Panel
            title={t("squad.panel.academy")}
            actions={<Link href="/academy" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-gold">{t("squad.academy.manage")} <ArrowUpRight size={12} /></Link>}
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
                        <p className="flex items-center gap-1 text-xs text-ink-3"><Star size={10} className="text-gold" /> {t("squad.academy.potential", { n: prospect.potential || 80 })}</p>
                      </div>
                      <RatingChip value={rating} size="sm" />
                      {ap.readyForPromotion && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPromotingProspectId(ap.id)}>{t("squad.academy.promote")}</Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="p-4"><EmptyState title={t("squad.academy.empty")} action={{ label: t("squad.academy.open"), href: "/academy" }} /></div>
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
                    <h2 id="modal-title-promote-prospect" className="font-display text-2xl font-bold uppercase text-ink-1">{t("squad.promote.title")}</h2>
                    <p className="text-xs text-ink-3">{t("squad.promote.subtitle")}</p>
                  </div>
                </div>

                <dl className="divide-y divide-line rounded-lg border border-line text-sm">
                  <div className="flex justify-between px-4 py-2.5"><dt className="text-ink-3">{t("squad.promote.salary")}</dt><dd className="font-semibold text-ink-1">{t("squad.promote.salaryValue")}</dd></div>
                  <div className="flex justify-between px-4 py-2.5"><dt className="text-ink-3">{t("squad.promote.contract")}</dt><dd className="font-semibold text-ink-1">{t("squad.promote.contractValue")}</dd></div>
                  <div className="flex justify-between px-4 py-2.5"><dt className="text-ink-3">{t("squad.promote.slot")}</dt><dd className="font-semibold text-ink-1">{t("squad.bench")}</dd></div>
                </dl>

                <p className="text-sm text-ink-2">
                  {t("squad.promote.body")}
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
                    {t("squad.promote.confirm")}
                  </Button>
                  <Button onClick={() => setPromotingProspectId(null)} variant="outline" className="h-11 flex-1">
                    {t("squad.cancel")}
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
