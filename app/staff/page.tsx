"use client"

import React, { useEffect, useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import type { StaffSaveData } from "@/engine/save-types"
import { isSpecialist } from "@/engine/staff-specialization"
import { STAFF_TALENT_TREES } from "@/engine/talent-trees"
import { formatCurrency } from "@/lib/utils-extended"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StaffPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { StaffNegotiationModal } from "@/components/staff/StaffNegotiationModal"
import { TalentTree } from "@/components/staff/TalentTree"
import { DelegationPanel } from "@/components/staff/DelegationPanel"
import { ROLE_LABEL, matchCountedIds, staffEffects, staffMatchPct, teamStaffSummary } from "@/components/staff/staff-effects"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"

const MAX_STAFF = 5 // store/slices/staff-management-slice.ts MAX_STAFF_PER_TEAM

/** Staff attributes the engine reads (organization-effects, staff-specialization, scouting processor). */
const USED_STAFF_STATS: Partial<Record<StaffSaveData["role"], Record<string, string>>> = {
    coach: { development: "Training" },
    psychologist: { mentalRecovery: "Recovery", stressResistance: "Defeat morale" },
    scout: { accuracy: "Report depth" },
}

/** Contract weeks left → tone: red inside a month, amber inside a quarter. */
function contractTone(weeksLeft: number): string {
    if (weeksLeft <= 4) return "text-negative"
    if (weeksLeft <= 13) return "text-caution"
    return "text-ink-2"
}

function StaffIdentity({ s }: { s: StaffSaveData }) {
    return (
        <div className="flex min-w-0 items-center gap-3">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised">
                <StaffPortrait src={s.portraitPath} alt={s.name} size={36} className="h-full w-full" />
            </div>
            <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink-1">{s.name}</p>
                <div className="flex items-center gap-1.5 text-xs text-ink-3">
                    {s.nationality && <CountryFlag country={s.nationality} size={14} />}
                    <span className="truncate">{s.specialization}{s.rarity && s.rarity !== "Common" ? ` · ${s.rarity}` : ""}</span>
                </div>
            </div>
        </div>
    )
}

function Effects({ lines, muted }: { lines: string[]; muted?: boolean }) {
    return (
        <ul className={cn("space-y-0.5 text-[13px]", muted ? "text-ink-3" : "text-ink-2")}>
            {lines.map(l => <li key={l}>{l}</li>)}
        </ul>
    )
}

function LevelPips({ level }: { level: number }) {
    return (
        <span className="inline-flex items-center gap-2" aria-label={`Level ${level} of 5`}>
            <span className="font-display text-lg font-bold tabular-nums text-ink-1">{level}</span>
            <span className="flex gap-0.5" aria-hidden="true">
                {[1, 2, 3, 4, 5].map(i => <span key={i} className={cn("h-2.5 w-1 rounded-sm", i <= level ? "bg-ink-2" : "bg-hover")} />)}
            </span>
        </span>
    )
}

export default function StaffPage() {
    const { staff, playerTeamId, fireStaff, marketStaff, refreshStaffMarket, currentWeek, unlockStaffTalent, _hasHydrated } = useGameStore(useShallow(state => ({
        staff: state.staff,
        playerTeamId: state.playerTeamId,
        fireStaff: state.fireStaff,
        marketStaff: state.marketStaff,
        refreshStaffMarket: state.refreshStaffMarket,
        currentWeek: state.currentWeek,
        unlockStaffTalent: state.unlockStaffTalent,
        _hasHydrated: state._hasHydrated,
    })))
    const team = useCurrentTeam()

    const hired = useMemo(
        () => staff.filter(s => s.teamId === playerTeamId && team?.staffIds.includes(s.id) && (s.contractEndWeek === undefined || s.contractEndWeek > currentWeek)),
        [staff, playerTeamId, team, currentWeek],
    )
    const counted = useMemo(() => matchCountedIds(hired), [hired])
    const summary = useMemo(() => teamStaffSummary(hired), [hired])
    const wageBill = hired.reduce((sum, s) => sum + s.salaryPerWeek, 0)

    const [negotiating, setNegotiating] = useState<{ id: string; renewal: boolean } | null>(null)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const selected = hired.find(s => s.id === selectedId) ?? hired[0]

    useEffect(() => {
        // Only refresh if hydrated and market is empty. Keyed on _hasHydrated
        // alone so it can't loop on marketStaff.length toggling.
        if (_hasHydrated && marketStaff.length === 0) refreshStaffMarket()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_hasHydrated])

    if (!team) {
        return <div role="status" className="mx-auto max-w-[1600px] py-10 text-sm text-ink-3">Loading staff…</div>
    }

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
            <ScreenHeader
                eyebrow={`Week ${currentWeek} · Club`}
                title="Staff"
                subtitle="Coach, analyst and psychologist add match strength by level; each also has a development job. One per role counts in matches."
                aside={
                    <KpiStrip>
                        <Kpi label="Staff" value={`${hired.length} / ${MAX_STAFF}`} />
                        <Kpi label="Match strength" value={`+${summary.matchPct.toFixed(1)}%`} hint={summary.uncappedMatchPct > summary.capPct ? `Capped at +${summary.capPct}%` : `Cap +${summary.capPct}%`} />
                        <Kpi label="Training" value={`+${Math.round(summary.trainingPct)}%`} hint="Weekly gains" />
                        <Kpi label="Wages / wk" value={formatCurrency(wageBill, "$", false)} />
                    </KpiStrip>
                }
            />

            <div className={cn("grid grid-cols-1 gap-4", hired.length > 0 && "2xl:grid-cols-[minmax(0,1fr)_540px]")}>
                <div className="min-w-0 space-y-4">
                    <Panel title="Your staff" actions={<span className="text-xs text-ink-3">Select a row to see talents</span>} padded={false}>
                        {hired.length === 0 ? (
                            <p className="px-4 py-5 text-sm text-ink-3">No staff hired. Pick someone from the market below.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table data-slot="table" className="w-full min-w-[900px] border-collapse text-left">
                                    <thead data-slot="table-header">
                                        <tr className="border-b border-line">
                                            <th data-slot="table-head" className="pl-4">Staff</th>
                                            <th data-slot="table-head" className="px-3">Role</th>
                                            <th data-slot="table-head" className="px-3">Level</th>
                                            <th data-slot="table-head" className="px-3">Effect in game</th>
                                            <th data-slot="table-head" className="px-3 text-right">Wage / wk</th>
                                            <th data-slot="table-head" className="px-3 text-right">Contract</th>
                                            <th data-slot="table-head" className="pr-4"><span className="sr-only">Actions</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {hired.map(s => {
                                            const weeksLeft = s.contractEndWeek != null ? Math.max(0, s.contractEndWeek - currentWeek) : null
                                            const canRenew = weeksLeft != null && weeksLeft < 52
                                            const isSelected = selected?.id === s.id
                                            return (
                                                <tr
                                                    key={s.id}
                                                    data-slot="table-row"
                                                    data-state={isSelected ? "selected" : undefined}
                                                    tabIndex={0}
                                                    onClick={() => setSelectedId(s.id)}
                                                    onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelectedId(s.id) } }}
                                                    aria-label={`${s.name}, ${ROLE_LABEL[s.role]}, show talents`}
                                                    className="h-16 cursor-pointer border-b border-line outline-none focus-visible:bg-hover"
                                                >
                                                    <td className="py-2 pl-4 pr-3"><StaffIdentity s={s} /></td>
                                                    <td className="px-3 text-sm text-ink-2">{ROLE_LABEL[s.role]}</td>
                                                    <td className="px-3"><LevelPips level={s.level} /></td>
                                                    <td className="px-3 py-2"><Effects lines={staffEffects(s, counted.has(s.id) || s.role === "scout")} /></td>
                                                    <td className="px-3 text-right text-sm tabular-nums text-ink-2">{formatCurrency(s.salaryPerWeek, "$", false)}</td>
                                                    <td className={cn("px-3 text-right text-sm tabular-nums", weeksLeft == null ? "text-ink-3" : contractTone(weeksLeft))}>
                                                        {weeksLeft == null ? "Open" : weeksLeft >= 52 ? `${(weeksLeft / 52).toFixed(1)}y` : `${weeksLeft}w`}
                                                    </td>
                                                    <td className="pr-4" onClick={e => e.stopPropagation()}>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={!canRenew}
                                                                title={canRenew ? "Open contract renewal" : "Renewal opens in the final year"}
                                                                onClick={() => setNegotiating({ id: s.id, renewal: true })}>
                                                                Renew
                                                            </Button>
                                                            <ConfirmDialog
                                                                title={`Release ${s.name}?`}
                                                                description="Their wage stops now and their effects end. No severance is paid. This can't be undone."
                                                                onConfirm={() => fireStaff(s.id)}
                                                                destructive
                                                                confirmText="Release"
                                                                icon="danger"
                                                            >
                                                                <Button size="sm" variant="ghost" className="h-8 px-3 text-xs">Release</Button>
                                                            </ConfirmDialog>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Panel>

                    <Panel
                        title="Staff market"
                        actions={
                            <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => { refreshStaffMarket(); toast.info("Market refreshed") }}>
                                <RefreshCw size={13} /> Refresh
                            </Button>
                        }
                        padded={false}
                    >
                        {marketStaff.length === 0 ? (
                            <p className="px-4 py-5 text-sm text-ink-3">Nobody is on the market right now.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table data-slot="table" className="w-full min-w-[900px] border-collapse text-left">
                                    <thead data-slot="table-header">
                                        <tr className="border-b border-line">
                                            <th data-slot="table-head" className="pl-4">Staff</th>
                                            <th data-slot="table-head" className="px-3">Role</th>
                                            <th data-slot="table-head" className="px-3">Level</th>
                                            <th data-slot="table-head" className="px-3">Effect if hired</th>
                                            <th data-slot="table-head" className="px-3 text-right">Asking / wk</th>
                                            <th data-slot="table-head" className="pr-4"><span className="sr-only">Actions</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {marketStaff.map(s => {
                                            const duplicate = s.role !== "scout" && hired.some(h => h.role === s.role)
                                            const marginal = Math.max(0, Math.min(summary.capPct, summary.uncappedMatchPct + staffMatchPct(s)) - summary.matchPct)
                                            return (
                                                <tr key={s.id} data-slot="table-row" className="h-16 border-b border-line">
                                                    <td className="py-2 pl-4 pr-3"><StaffIdentity s={s} /></td>
                                                    <td className="px-3 text-sm text-ink-2">
                                                        {ROLE_LABEL[s.role]}
                                                        {isSpecialist(s) && s.role !== "analyst" && <span className="ml-2 rounded-sm border border-line-strong px-1 text-[11px] text-ink-3" title="Specialization matches the role: +10% to training (coach), recovery (psychologist) or scouting accuracy (scout)">Specialist</span>}
                                                    </td>
                                                    <td className="px-3"><LevelPips level={s.level} /></td>
                                                    <td className="px-3 py-2">
                                                        <Effects lines={staffEffects(s, !duplicate, marginal)} muted={duplicate} />
                                                    </td>
                                                    <td className="px-3 text-right text-sm tabular-nums text-ink-1">{formatCurrency(s.salaryPerWeek, "$", false)}</td>
                                                    <td className="pr-4 text-right">
                                                        <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={hired.length >= MAX_STAFF}
                                                            title={hired.length >= MAX_STAFF ? `Staff is full (${MAX_STAFF})` : undefined}
                                                            onClick={() => setNegotiating({ id: s.id, renewal: false })}>
                                                            Make offer
                                                        </Button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-3">
                            Hiring costs a two-week sign-on fee. A second coach, analyst or psychologist adds training or recovery but no extra match strength.
                        </p>
                    </Panel>

                    <div id="delegation" className="scroll-mt-20"><DelegationPanel /></div>
                </div>

                {hired.length > 0 && <aside className="min-w-0">
                    <Panel
                        title={selected ? `${selected.name} · talents` : "Talents"}
                        actions={selected ? <span className="text-xs text-ink-3"><span className="font-semibold tabular-nums text-ink-1">{selected.talentPoints || 0}</span> points to spend</span> : null}
                        padded={false}
                        className="2xl:sticky 2xl:top-4"
                    >
                        {selected ? (
                            <>
                                <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
                                    <div className="bg-panel px-4 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Experience</p>
                                        <p className="mt-1 text-sm tabular-nums text-ink-1">Level {selected.level} · {Math.floor(selected.xp || 0)} / {selected.xpToNextLevel || 1000} XP</p>
                                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-hover">
                                            <div className="h-full rounded-full bg-ink-2" style={{ width: `${Math.min(100, ((selected.xp || 0) / (selected.xpToNextLevel || 1000)) * 100)}%` }} />
                                        </div>
                                    </div>
                                    <div className="bg-panel px-4 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Attributes</p>
                                        <dl className="mt-1 space-y-0.5 text-sm">
                                            {Object.entries(selected.stats || {}).map(([k, v]) => {
                                                const use = USED_STAFF_STATS[selected.role]?.[k]
                                                return (
                                                    <div key={k} className="flex justify-between gap-3" title={use ? `Drives ${use.toLowerCase()}` : "Not read by the game yet"}>
                                                        <dt className={use ? "text-ink-2" : "text-ink-3"}>
                                                            {k.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase())}
                                                            {use && <span className="ml-1.5 rounded-sm border border-line-strong px-1 text-[11px] text-ink-3">{use}</span>}
                                                        </dt>
                                                        <dd className={cn("tabular-nums", use ? "text-ink-1" : "text-ink-3")}>{v}</dd>
                                                    </div>
                                                )
                                            })}
                                        </dl>
                                    </div>
                                </div>
                                <TalentTree
                                    nodes={STAFF_TALENT_TREES[selected.role] || []}
                                    unlockedIds={selected.unlockedTalentIds || []}
                                    availablePoints={selected.talentPoints || 0}
                                    onUnlock={talentId => unlockStaffTalent(selected.id, talentId)}
                                    spacingX={96}
                                />
                            </>
                        ) : (
                            <p className="px-4 py-5 text-sm text-ink-3">Hire staff to unlock their talent trees.</p>
                        )}
                    </Panel>
                </aside>}
            </div>

            {negotiating && (
                <StaffNegotiationModal
                    key={negotiating.id}
                    staffId={negotiating.id}
                    isOpen
                    onClose={() => setNegotiating(null)}
                    isRenewal={negotiating.renewal}
                />
            )}
        </div>
    )
}
