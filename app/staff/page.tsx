"use client"
import { Trans } from "@/lib/trans"
import { intlLocale, t } from "@/lib/i18n"

import React, { useEffect, useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import type { StaffSaveData } from "@/engine/save-types"
import { isSpecialist } from "@/engine/staff-specialization"
import { staffRefreshCost, staffSeverance } from "@/engine/staff-economy"
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
import { matchCountedIds, roleLabel, specializationLabel, staffEffects, staffMatchPct, staffStatLabel, teamStaffSummary } from "@/components/staff/staff-effects"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"

const MAX_STAFF = 5 // store/slices/staff-management-slice.ts MAX_STAFF_PER_TEAM

/** Staff attributes the engine reads (organization-effects, staff-specialization, scouting processor); label is t(`st.use.${stat}`). */
const USED_STAFF_STATS: Partial<Record<StaffSaveData["role"], string[]>> = {
    coach: ["development"],
    psychologist: ["mentalRecovery", "stressResistance"],
    scout: ["accuracy"],
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
                    <span className="truncate">{specializationLabel(s.specialization)}{s.rarity && s.rarity !== "Common" ? ` · ${t(`st.rarity.${s.rarity}`)}` : ""}</span>
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
        <span className="inline-flex items-center gap-2" aria-label={t("st.levelAria", { n: level })}>
            <span className="font-display text-lg font-bold tabular-nums text-ink-1">{level}</span>
            <span className="flex gap-0.5" aria-hidden="true">
                {[1, 2, 3, 4, 5].map(i => <span key={i} className={cn("h-2.5 w-1 rounded-sm", i <= level ? "bg-ink-2" : "bg-hover")} />)}
            </span>
        </span>
    )
}

export default function StaffPage() {
    const { staff, playerTeamId, fireStaff, marketStaff, refreshStaffMarket, requestStaffMarketRefresh, staffMarketRefreshWeek, currentWeek, unlockStaffTalent, _hasHydrated } = useGameStore(useShallow(state => ({
        staff: state.staff,
        playerTeamId: state.playerTeamId,
        fireStaff: state.fireStaff,
        marketStaff: state.marketStaff,
        refreshStaffMarket: state.refreshStaffMarket,
        requestStaffMarketRefresh: state.requestStaffMarketRefresh,
        staffMarketRefreshWeek: state.staffMarketRefreshWeek,
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
    const funds = team?.budget ?? 0
    const money = (n: number) => formatCurrency(n, "$", false)
    // SQUAD-16: one free refresh per week, then about a week of the average market wage.
    const refresh = staffRefreshCost(marketStaff, currentWeek, staffMarketRefreshWeek)
    const refreshBlock = !refresh.free && funds < refresh.cost ? t("player.releaseBlock.funds", { cost: money(refresh.cost), funds: money(Math.max(0, funds)) }) : null
    const doRefresh = () => {
        const r = requestStaffMarketRefresh()
        if (!r.success) throw new Error(r.message)
        toast.info(t("st.refreshed"))
    }

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
        return <div role="status" className="mx-auto max-w-[1600px] py-10 text-sm text-ink-3">{t("st.loading")}</div>
    }

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
            <ScreenHeader
                eyebrow={t("st.eyebrow", { n: currentWeek })}
                title={t("st.title")}
                subtitle={t("st.subtitle")}
                aside={
                    <KpiStrip>
                        <Kpi label={t("st.kpi.staff")} value={`${hired.length} / ${MAX_STAFF}`} />
                        <Kpi label={t("st.kpi.match")} value={`+${summary.matchPct.toLocaleString(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} hint={summary.uncappedMatchPct > summary.capPct ? t("st.kpi.cappedAt", { n: summary.capPct }) : t("st.kpi.cap", { n: summary.capPct })} />
                        <Kpi label={t("st.kpi.training")} value={`+${Math.round(summary.trainingPct)}%`} hint={t("st.kpi.trainingHint")} />
                        <Kpi label={t("st.kpi.wages")} value={formatCurrency(wageBill, "$", false)} />
                    </KpiStrip>
                }
            />

            <div className={cn("grid grid-cols-1 gap-4", hired.length > 0 && "2xl:grid-cols-[minmax(0,1fr)_540px]")}>
                <div className="min-w-0 space-y-4">
                    <Panel title={t("st.yours")} actions={<span className="text-xs text-ink-3">{t("st.selectRow")}</span>} padded={false}>
                        {hired.length === 0 ? (
                            <p className="px-4 py-5 text-sm text-ink-3">{t("st.noneHired")}</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table data-slot="table" className="w-full min-w-[900px] border-collapse text-left">
                                    <thead data-slot="table-header">
                                        <tr className="border-b border-line">
                                            <th data-slot="table-head" className="pl-4">{t("st.col.staff")}</th>
                                            <th data-slot="table-head" className="px-3">{t("st.col.role")}</th>
                                            <th data-slot="table-head" className="px-3">{t("st.col.level")}</th>
                                            <th data-slot="table-head" className="px-3">{t("st.col.effect")}</th>
                                            <th data-slot="table-head" className="px-3 text-right">{t("st.col.wage")}</th>
                                            <th data-slot="table-head" className="px-3 text-right">{t("st.col.contract")}</th>
                                            <th data-slot="table-head" className="pr-4"><span className="sr-only">{t("st.col.actions")}</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {hired.map(s => {
                                            const weeksLeft = s.contractEndWeek != null ? Math.max(0, s.contractEndWeek - currentWeek) : null
                                            const canRenew = weeksLeft != null && weeksLeft < 52
                                            const isSelected = selected?.id === s.id
                                            const severance = staffSeverance(s, currentWeek)
                                            const releaseBlock = funds < severance.amount ? t("player.releaseBlock.funds", { cost: money(severance.amount), funds: money(Math.max(0, funds)) }) : null
                                            return (
                                                <tr
                                                    key={s.id}
                                                    data-slot="table-row"
                                                    data-state={isSelected ? "selected" : undefined}
                                                    tabIndex={0}
                                                    onClick={() => setSelectedId(s.id)}
                                                    onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelectedId(s.id) } }}
                                                    aria-label={t("st.rowAria", { name: s.name, role: roleLabel(s.role) })}
                                                    className="h-16 cursor-pointer border-b border-line outline-none focus-visible:bg-hover"
                                                >
                                                    <td className="py-2 pl-4 pr-3"><StaffIdentity s={s} /></td>
                                                    <td className="px-3 text-sm text-ink-2">{roleLabel(s.role)}</td>
                                                    <td className="px-3"><LevelPips level={s.level} /></td>
                                                    <td className="px-3 py-2"><Effects lines={staffEffects(s, counted.has(s.id) || s.role === "scout")} /></td>
                                                    <td className="px-3 text-right text-sm tabular-nums text-ink-2">{formatCurrency(s.salaryPerWeek, "$", false)}</td>
                                                    <td className={cn("px-3 text-right text-sm tabular-nums", weeksLeft == null ? "text-ink-3" : contractTone(weeksLeft))}>
                                                        {weeksLeft == null ? t("st.open") : weeksLeft >= 52 ? t("st.years", { n: (weeksLeft / 52).toLocaleString(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : t("st.weeks", { n: weeksLeft })}
                                                    </td>
                                                    <td className="pr-4" onClick={e => e.stopPropagation()}>
                                                        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                                                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={!canRenew}
                                                                title={canRenew ? t("st.renewTip") : t("st.renewLater")}
                                                                onClick={() => setNegotiating({ id: s.id, renewal: true })}>
                                                                {t("st.renew")}
                                                            </Button>
                                                            {releaseBlock ? (
                                                                <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" disabled title={releaseBlock}>{t("st.release")}</Button>
                                                            ) : (
                                                                <ConfirmDialog
                                                                    title={t("st.releaseTitle", { name: s.name })}
                                                                    description={t("st.releaseBody", { amount: money(severance.amount), after: money(funds - severance.amount) })}
                                                                    onConfirm={() => fireStaff(s.id)}
                                                                    destructive
                                                                    confirmText={t("st.releaseConfirm", { amount: money(severance.amount) })}
                                                                    icon="danger"
                                                                >
                                                                    <Button size="sm" variant="ghost" className="h-8 px-3 text-xs">{t("st.release")}</Button>
                                                                </ConfirmDialog>
                                                            )}
                                                            {releaseBlock && <p className="basis-full text-right text-xs text-ink-3">{releaseBlock}</p>}
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
                        title={t("st.market")}
                        actions={
                            <div className="flex items-center gap-2">
                                {refreshBlock && <span className="text-xs text-ink-3">{refreshBlock}</span>}
                                {refresh.free ? (
                                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs" title={t("st.refreshFreeTip")}
                                        onClick={() => { try { doRefresh() } catch (err) { toast.error(err instanceof Error ? err.message : String(err)) } }}>
                                        <RefreshCw size={13} /> {t("st.refresh")}
                                    </Button>
                                ) : refreshBlock ? (
                                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs" disabled title={refreshBlock}>
                                        <RefreshCw size={13} /> {t("st.refreshPaid", { cost: money(refresh.cost) })}
                                    </Button>
                                ) : (
                                    <ConfirmDialog
                                        title={t("st.refreshConfirmTitle")}
                                        description={t("st.refreshConfirmBody", { cost: money(refresh.cost), after: money(funds - refresh.cost) })}
                                        onConfirm={doRefresh}
                                        confirmText={t("st.refreshPaid", { cost: money(refresh.cost) })}
                                        icon="warning"
                                    >
                                        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs" title={t("st.refreshFreeTip")}>
                                            <RefreshCw size={13} /> {t("st.refreshPaid", { cost: money(refresh.cost) })}
                                        </Button>
                                    </ConfirmDialog>
                                )}
                            </div>
                        }
                        padded={false}
                    >
                        {marketStaff.length === 0 ? (
                            <p className="px-4 py-5 text-sm text-ink-3">{t("st.marketEmpty")}</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table data-slot="table" className="w-full min-w-[900px] border-collapse text-left">
                                    <thead data-slot="table-header">
                                        <tr className="border-b border-line">
                                            <th data-slot="table-head" className="pl-4">{t("st.col.staff")}</th>
                                            <th data-slot="table-head" className="px-3">{t("st.col.role")}</th>
                                            <th data-slot="table-head" className="px-3">{t("st.col.level")}</th>
                                            <th data-slot="table-head" className="px-3">{t("st.col.effectIfHired")}</th>
                                            <th data-slot="table-head" className="px-3 text-right">{t("st.col.asking")}</th>
                                            <th data-slot="table-head" className="pr-4"><span className="sr-only">{t("st.col.actions")}</span></th>
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
                                                        {roleLabel(s.role)}
                                                        {isSpecialist(s) && s.role !== "analyst" && <span className="ml-2 rounded-sm border border-line-strong px-1 text-[11px] text-ink-3" title={t("st.specialistTip")}>{t("st.specialist")}</span>}
                                                    </td>
                                                    <td className="px-3"><LevelPips level={s.level} /></td>
                                                    <td className="px-3 py-2">
                                                        <Effects lines={staffEffects(s, !duplicate, marginal)} muted={duplicate} />
                                                    </td>
                                                    <td className="px-3 text-right text-sm tabular-nums text-ink-1">{formatCurrency(s.salaryPerWeek, "$", false)}</td>
                                                    <td className="pr-4 text-right">
                                                        <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={hired.length >= MAX_STAFF}
                                                            title={hired.length >= MAX_STAFF ? t("st.full", { n: MAX_STAFF }) : undefined}
                                                            onClick={() => setNegotiating({ id: s.id, renewal: false })}>
                                                            {t("st.makeOffer")}
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
                            {t("st.marketNote")}
                        </p>
                    </Panel>

                    <div id="delegation" className="scroll-mt-20"><DelegationPanel /></div>
                </div>

                {hired.length > 0 && <aside className="min-w-0">
                    <Panel
                        title={selected ? t("st.talentsOf", { name: selected.name }) : t("st.talents")}
                        actions={selected ? <span className="text-xs text-ink-3"><Trans k="st.pointsToSpend" params={{ n: selected.talentPoints || 0 }} tags={{ b: x => <span className="font-semibold tabular-nums text-ink-1">{x}</span> }} /></span> : null}
                        padded={false}
                        className="2xl:sticky 2xl:top-4"
                    >
                        {selected ? (
                            <>
                                <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
                                    <div className="bg-panel px-4 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("st.experience")}</p>
                                        <p className="mt-1 text-sm tabular-nums text-ink-1">{t("st.levelXp", { level: selected.level, xp: Math.floor(selected.xp || 0), next: selected.xpToNextLevel || 1000 })}</p>
                                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-hover">
                                            <div className="h-full rounded-full bg-ink-2" style={{ width: `${Math.min(100, ((selected.xp || 0) / (selected.xpToNextLevel || 1000)) * 100)}%` }} />
                                        </div>
                                    </div>
                                    <div className="bg-panel px-4 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("st.attributes")}</p>
                                        <dl className="mt-1 space-y-0.5 text-sm">
                                            {Object.entries(selected.stats || {}).map(([k, v]) => {
                                                const use = USED_STAFF_STATS[selected.role]?.includes(k) ? t(`st.use.${k}`) : null
                                                return (
                                                    <div key={k} className="flex justify-between gap-3" title={use ? t("st.drives", { use }) : t("st.notRead")}>
                                                        <dt className={use ? "text-ink-2" : "text-ink-3"}>
                                                            {staffStatLabel(k)}
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
                            <p className="px-4 py-5 text-sm text-ink-3">{t("st.hireToUnlock")}</p>
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
