"use client"

import React, { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Crosshair, Repeat2 } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { DrillManager } from "@/engine/drill-manager"
import type { PlayerSaveData } from "@/engine/save-types"
import type { CustomTactics } from "@/types"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { toast } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { Panel } from "@/src/components/ui/Panel"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { Meter } from "@/src/components/ui/Meter"
import { FOCUS_OPTIONS, STAT_LABEL, drillStatLabel, trainingModifiers, weeklyPreview, type WeeklyPreview } from "@/components/training/weekly-training"

const RoleTrainingModal = dynamic(() => import("@/components/training/RoleTrainingModal").then(m => m.RoleTrainingModal), { ssr: false })
const WeaponTrainingModal = dynamic(() => import("@/components/training/WeaponTrainingModal").then(m => m.WeaponTrainingModal), { ssr: false })
const TacticalLoadoutEditor = dynamic(() => import("@/components/match/TacticalLoadoutEditor").then(m => m.TacticalLoadoutEditor), { ssr: false })

/** Team drills refuse to run when an eligible player is at or above this fatigue (team-drills-slice). */
const EXHAUSTION_THRESHOLD = 90
const STRATEGIES = ["ECO", "FORCE", "SEMIBUY", "FULL", "DOUBLE AWP"] as const

function fatigueTone(fatigue: number) {
    if (fatigue >= EXHAUSTION_THRESHOLD) return "negative" as const
    if (fatigue >= 60) return "caution" as const
    return "neutral" as const
}

/** "Rifle, AWP +0.42 · Aim +0.21 · Pistol at potential" — stats grouped by equal weekly gain. */
function GainSummary({ preview }: { preview: WeeklyPreview }) {
    if (preview.gains.length === 0) {
        return <span className="text-ink-2">Recovers {Math.abs(preview.fatigue).toFixed(0)} fatigue{preview.morale ? `, +${preview.morale} morale` : ""}</span>
    }
    const growing = preview.gains.filter(g => g.amount >= 0.005)
    const capped = preview.gains.filter(g => g.amount < 0.005).map(g => STAT_LABEL[g.stat] ?? g.stat)
    if (growing.length === 0) return <span className="text-ink-3">All focus stats at potential — no gains</span>
    const groups = new Map<string, string[]>()
    for (const g of growing) {
        const key = g.amount.toFixed(2)
        groups.set(key, [...(groups.get(key) || []), STAT_LABEL[g.stat] ?? g.stat])
    }
    return (
        <span className="text-ink-2">
            {[...groups.entries()].sort((a, b) => Number(b[0]) - Number(a[0])).map(([amount, stats], i) => (
                <span key={amount}>
                    {i > 0 && <span className="text-ink-3"> · </span>}
                    {stats.join(", ")} <span className="font-semibold tabular-nums text-ink-1">+{amount}</span>
                </span>
            ))}
            {capped.length > 0 && <span className="text-ink-3"> · {capped.join(", ")} at potential</span>}
        </span>
    )
}

export default function TrainingPage() {
    const { players, staff, currentWeek, cancelRoleTraining, startRoleTraining, setPlayerTrainingFocus, runTeamDrill, customTactics, updateCustomTactic, activeMatchId } = useGameStore(useShallow(state => ({
        players: state.players,
        staff: state.staff,
        currentWeek: state.currentWeek,
        startRoleTraining: state.startRoleTraining,
        cancelRoleTraining: state.cancelRoleTraining,
        setPlayerTrainingFocus: state.setPlayerTrainingFocus,
        runTeamDrill: state.runTeamDrill,
        customTactics: state.customTactics,
        updateCustomTactic: state.updateCustomTactic,
        activeMatchId: state.activeMatchId,
    })))
    const team = useCurrentTeam()
    const router = useRouter()
    const drills = DrillManager.getDrills()
    const [selectedDrill, setSelectedDrill] = useState(drills[0]?.id ?? "")
    const [trainingPlayer, setTrainingPlayer] = useState<PlayerSaveData | null>(null)
    const [weaponTrainingPlayer, setWeaponTrainingPlayer] = useState<PlayerSaveData | null>(null)
    const [editing, setEditing] = useState<{ strategy: keyof CustomTactics; side: "ct" | "t" } | null>(null)

    // Roster order, like Squad. Memoized: the global players list is ~1000 entries.
    const roster = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p]))
        return (team?.rosterIds || []).map(id => byId.get(id)).filter((p): p is PlayerSaveData => !!p && !p.isRetired)
    }, [players, team?.rosterIds])
    const mods = useMemo(() => trainingModifiers(team ?? undefined, staff, currentWeek), [team, staff, currentWeek])
    const roleTraining = useMemo(() => team?.activeRoleTraining || [], [team?.activeRoleTraining])
    const inRoleTraining = useCallback((id: string) => roleTraining.some(t => t.playerId === id), [roleTraining])

    const slotsUsed = team?.trainingSlotsUsed || 0
    const slotsMax = team?.maxTrainingSlots || 10
    const slotsLeft = Math.max(0, slotsMax - slotsUsed)
    const drillPlayers = roster.filter(p => !inRoleTraining(p.id))
    const exhausted = drillPlayers.find(p => (p.fatigue || 0) >= EXHAUSTION_THRESHOLD)
    const drill = drills.find(d => d.id === selectedDrill)
    const drillBlock = !drill ? "Pick a drill"
        : activeMatchId ? "Finish the active match first"
            : slotsLeft === 0 ? "No drill slots left this week"
                : drillPlayers.length === 0 ? "Nobody available — everyone is retraining"
                    : exhausted && drill.fatigueCost > 0 ? `${exhausted.nickname} is exhausted (fatigue ${Math.round(exhausted.fatigue)}); pick a recovery drill`
                        : null

    const runDrill = () => {
        if (!drill || drillBlock) return
        const result = runTeamDrill(drill.id, drill.rewards.map(r => ({ stat: r.stat, amount: r.value })), drill.fatigueCost)
        if (result.success) toast.success(drill.name, { description: `${drillPlayers.length} players trained. +50 XP each.` })
        else toast.error("Drill not run", { description: result.message })
    }

    if (!team) {
        // The career store rehydrates after a full navigation.
        return <div role="status" className="mx-auto max-w-[1600px] py-10 text-sm text-ink-3">Loading squad…</div>
    }

    if (roster.length === 0) {
        return (
            <div className="mx-auto max-w-[1600px] space-y-6">
                <ScreenHeader eyebrow="Development" title="Training" />
                <Panel>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-ink-3">No players to train yet.</p>
                        <Button variant="outline" size="sm" asChild><Link href="/transfers">Browse transfers</Link></Button>
                    </div>
                </Panel>
            </div>
        )
    }

    const gainPct = Math.round((mods.general - 1) * 100)

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
            <ScreenHeader
                eyebrow={`Week ${currentWeek} · Development`}
                title="Training"
                subtitle="Weekly focus runs automatically at the end of each week. Team drills apply right away and use a slot."
                aside={
                    <KpiStrip>
                        <Kpi label="Drill slots left" value={slotsLeft} hint={`of ${slotsMax} this week`} />
                        <Kpi label="Training bonus" value={`+${gainPct}%`} hint="Coach and training facility" />
                        <Kpi label="Retraining" value={roleTraining.length} hint={roleTraining.length ? `${formatCurrency(roleTraining.length * 5000, "$", false)} / wk` : "No one"} />
                    </KpiStrip>
                }
            />

            <Panel title="This week's plan" actions={<span className="text-xs text-ink-3">Gains stop at each player&apos;s potential</span>} padded={false}>
                <div className="overflow-x-auto">
                    <table data-slot="table" className="w-full min-w-[1080px] border-collapse text-left">
                        <thead data-slot="table-header">
                            <tr className="border-b border-line">
                                <th data-slot="table-head" className="pl-4">Player</th>
                                <th data-slot="table-head" className="px-3">Role</th>
                                <th data-slot="table-head" className="px-3">Weekly focus</th>
                                <th data-slot="table-head" className="px-3">Fatigue</th>
                                <th data-slot="table-head" className="px-3">Expected / week</th>
                                <th data-slot="table-head" className="pr-4 text-right"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {roster.map(p => {
                                const retraining = roleTraining.find(t => t.playerId === p.id)
                                const preview = weeklyPreview(p, mods)
                                const fatigue = Math.round(p.fatigue || 0)
                                return (
                                    <tr key={p.id} data-slot="table-row" className="h-14 border-b border-line">
                                        <td className="py-2 pl-4 pr-3">
                                            <button type="button" onClick={() => router.push(`/player/${p.id}`)} className="group flex min-w-0 items-center gap-3 text-left">
                                                <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised">
                                                    <PlayerPortrait src={p.portraitPath} seed={p.id} alt={p.nickname} size={36} />
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block truncate text-[15px] font-semibold text-ink-1 group-hover:text-gold">{p.nickname}</span>
                                                    <span className="block text-xs text-ink-3">Lvl {p.level || 1} · potential {p.potential}</span>
                                                </span>
                                            </button>
                                        </td>
                                        <td className="px-3"><RoleTag role={p.role} /></td>
                                        <td className="px-3">
                                            {retraining ? (
                                                <span className="text-sm text-ink-2">Retraining to {retraining.targetRole.toUpperCase()} · {retraining.weeksCompleted}/{retraining.totalWeeks} wks</span>
                                            ) : (
                                                <Select value={p.trainingFocus || "BALANCED"} onValueChange={val => setPlayerTrainingFocus(p.id, val)}>
                                                    <SelectTrigger className="h-9 w-[200px] text-sm" aria-label={`${p.nickname} weekly focus`}>
                                                        <SelectValue>{FOCUS_OPTIONS.find(o => o.value === (p.trainingFocus || "BALANCED"))?.label ?? "Club default (aim)"}</SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {FOCUS_OPTIONS.map(o => (
                                                            <SelectItem key={o.value} value={o.value}>
                                                                <span className="flex flex-col">
                                                                    <span>{o.label}</span>
                                                                    <span className="text-xs text-ink-3">{o.trains}</span>
                                                                </span>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </td>
                                        <td className="px-3">
                                            <div className="flex items-center gap-3">
                                                <Meter value={fatigue} label="Fatigue" tone={fatigueTone(fatigue)} />
                                                {!retraining && (
                                                    <span className="text-xs tabular-nums text-ink-3">{preview.fatigue >= 0 ? "+" : "−"}{Math.abs(preview.fatigue).toFixed(0)}/wk</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 text-sm">
                                            {retraining ? <span className="text-ink-3">Skips weekly training · −10 energy/wk</span> : <GainSummary preview={preview} />}
                                        </td>
                                        <td className="pr-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => setWeaponTrainingPlayer(p)} disabled={!!p.injury}
                                                    title={p.injury ? `Injured: ${p.injury.type}` : "Paid weapon drills"}>
                                                    <Crosshair size={13} /> Weapons
                                                </Button>
                                                {retraining ? (
                                                    <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => { cancelRoleTraining(p.id); toast.success("Role training cancelled", { description: `${p.nickname} is back in team training. 50% of what was paid is refunded.` }) }}>
                                                        Stop retraining
                                                    </Button>
                                                ) : (
                                                    <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => setTrainingPlayer(p)} disabled={!!p.injury || !!p.secondaryRole}
                                                        title={p.secondaryRole ? "Already plays two roles" : p.injury ? `Injured: ${p.injury.type}` : "8-week role retraining"}>
                                                        <Repeat2 size={13} /> Retrain
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-3">
                    Gains include your coach and facilities. Aim is the base of every duel; rifle, AWP and pistol adjust it by weapon. Rest lowers fatigue, which costs duel rating in matches.
                </p>
            </Panel>

            <Panel
                title="Team drills"
                actions={
                    <div className="flex items-center gap-3">
                        {drillBlock && drill && <span className="hidden text-xs text-caution md:inline">{drillBlock}</span>}
                        <Button size="sm" className="h-8 px-4" onClick={runDrill} disabled={!!drillBlock} title={drillBlock ?? undefined}>
                            {drill ? `Run ${drill.name}` : "Run drill"}
                        </Button>
                    </div>
                }
            >
                <p className="mb-3 text-sm text-ink-3">
                    A drill applies at once to the {drillPlayers.length} players not retraining: listed gains, the fatigue shown and +50 XP. Weapon drills also add mastery XP.
                </p>
                <div role="radiogroup" aria-label="Team drills" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {drills.map(d => {
                        const selected = d.id === selectedDrill
                        return (
                            <button
                                key={d.id}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => setSelectedDrill(d.id)}
                                className={cn(
                                    "rounded-md border px-3 py-2.5 text-left transition-colors duration-150",
                                    selected ? "border-gold bg-hover" : "border-line bg-raised hover:border-line-strong",
                                )}
                            >
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-sm font-semibold text-ink-1">{d.name}</span>
                                    <span className={cn("shrink-0 text-xs tabular-nums", d.fatigueCost < 0 ? "text-positive" : "text-ink-3")}>
                                        {d.fatigueCost > 0 ? `+${d.fatigueCost}` : d.fatigueCost === 0 ? "±0" : `−${Math.abs(d.fatigueCost)}`} fatigue
                                    </span>
                                </span>
                                <span className="mt-1.5 flex flex-wrap gap-1">
                                    {d.rewards.map(r => (
                                        <span key={r.stat} className="rounded-sm bg-shell px-1.5 py-0.5 text-xs text-ink-2">
                                            +{r.value} {drillStatLabel(r.stat)}
                                        </span>
                                    ))}
                                </span>
                            </button>
                        )
                    })}
                </div>
                {drill && <p className="mt-3 text-sm text-ink-3"><span className="font-semibold text-ink-2">{drill.name}.</span> {drill.description}</p>}
            </Panel>

            <Panel title="Buy loadouts" actions={<span className="text-xs text-ink-3">Used by the match engine&apos;s buy phase</span>} padded={false}>
                <table data-slot="table" className="w-full border-collapse text-left">
                    <thead data-slot="table-header">
                        <tr className="border-b border-line">
                            <th data-slot="table-head" className="pl-4">Buy</th>
                            <th data-slot="table-head" className="px-3"><span className="text-side-ct">CT</span> side</th>
                            <th data-slot="table-head" className="pr-4"><span className="text-side-t">T</span> side</th>
                        </tr>
                    </thead>
                    <tbody>
                        {STRATEGIES.map(strat => (
                            <tr key={strat} data-slot="table-row" className="h-12 border-b border-line last:border-0">
                                <td className="pl-4 text-sm font-semibold text-ink-1">{strat === "SEMIBUY" ? "Semi-buy" : strat === "DOUBLE AWP" ? "Double AWP" : strat.charAt(0) + strat.slice(1).toLowerCase()}</td>
                                {(["ct", "t"] as const).map(side => (
                                    <td key={side} className={side === "ct" ? "px-3" : "pr-4"}>
                                        <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => setEditing({ strategy: strat, side })}>
                                            Edit {side.toUpperCase()} loadout
                                        </Button>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Panel>

            {trainingPlayer && (
                <RoleTrainingModal
                    player={trainingPlayer}
                    isOpen={!!trainingPlayer}
                    onClose={() => setTrainingPlayer(null)}
                    onStartTraining={role => {
                        const result = startRoleTraining(trainingPlayer.id, role)
                        if (result.success) {
                            setTrainingPlayer(null)
                            toast.success("Role training started", { description: result.message })
                        } else {
                            toast.error("Could not start", { description: result.message })
                        }
                    }}
                    currentBudget={team.budget || 0}
                    trainingSlotsUsed={slotsUsed}
                    maxTrainingSlots={slotsMax}
                />
            )}

            {weaponTrainingPlayer && (
                <WeaponTrainingModal player={weaponTrainingPlayer} isOpen={!!weaponTrainingPlayer} onClose={() => setWeaponTrainingPlayer(null)} />
            )}

            {editing && (
                <div className="fixed inset-0 top-16 z-modal flex items-center justify-center bg-ink/80 p-4">
                    <TacticalLoadoutEditor
                        side={editing.side}
                        strategyId={editing.strategy}
                        config={customTactics[editing.strategy][editing.side]}
                        playerIds={roster.map(p => p.id)}
                        playerNames={roster.map(p => p.nickname)}
                        playerImages={roster.map(p => p.portraitPath || "")}
                        onSave={newConfig => {
                            updateCustomTactic(editing.strategy, editing.side, newConfig)
                            toast.success("Loadout saved", { description: `${editing.strategy} (${editing.side.toUpperCase()})` })
                            setEditing(null)
                        }}
                        onClose={() => setEditing(null)}
                    />
                </div>
            )}
        </div>
    )
}
