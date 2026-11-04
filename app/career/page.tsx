"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { debug } from "@/lib/debug-logger"
import { useGameStore } from "@/store/game-store"
import { Button } from "@/components/ui/button"
import { TeamLogoImage } from "@/components/ui/asset-images"
import { LoadingState } from "@/components/ui/loading"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { Meter } from "@/src/components/ui/Meter"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { CareerLegacyCard } from "@/components/career/CareerLegacyCard"
import { LegacyGoalsPanel } from "@/components/career/LegacyGoalsPanel"
import { ClubTimelinePanel, ReputationPanel, stintTitles } from "@/components/career/ManagerRecord"
import { ManagerProgression } from "@/engine/manager-progression"
import type { SaveSlotMetadata } from "@/engine/save-types"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { stripEmoji } from "@/components/inbox/inbox-model"
import { formatCurrency } from "@/lib/utils-extended"
import { t, tn, intlLocale } from "@/lib/i18n"

function eventText(event: { type: string; data?: unknown }): string {
    const d = (event.data ?? {}) as Record<string, unknown>
    const text = d.description ?? d.message ?? d.text ?? d.title
    // Same plain-text rule as the inbox: no emoji headings in UI text.
    if (typeof text === "string" && text.trim()) return stripEmoji(text).replace(/\s+/g, " ").trim()
    return event.type.replace(/_/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase())
}

export default function CareerPage() {
    const router = useRouter()
    const {
        playerTeamId, currentWeek, eventsLog, saveId: currentSaveId,
        listSaves, switchSave, deleteSaveInSlot, managerDetails, teams, hydrated, isLoading,
    } = useGameStore(useShallow(state => ({
        hydrated: state._hasHydrated,
        isLoading: state.isLoading,
        playerTeamId: state.playerTeamId,
        currentWeek: state.currentWeek,
        eventsLog: state.eventsLog,
        saveId: state.saveId,
        listSaves: state.listSaves,
        switchSave: state.switchSave,
        deleteSaveInSlot: state.deleteSaveInSlot,
        managerDetails: state.managerDetails,
        teams: state.teams,
    })))

    const [saves, setSaves] = useState<SaveSlotMetadata[]>([])
    const [loadingSaves, setLoadingSaves] = useState(true)
    const [switchingTo, setSwitchingTo] = useState<string | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

    // Every managed match (friendlies included) from the manager's own counters, not the capped match log.
    const record = useMemo(() => {
        const wins = managerDetails?.careerWins ?? 0, losses = managerDetails?.careerLosses ?? 0
        return { wins, losses, played: wins + losses, rate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0 }
    }, [managerDetails?.careerWins, managerDetails?.careerLosses])

    // Titles won while in charge, club by club (Phase 5.1 timeline).
    const { titles, majors } = useMemo(() => (managerDetails?.stints ?? []).reduce((sum, stint) => {
        const t = stintTitles(stint, teams.find(team => team.id === stint.teamId))
        return { titles: sum.titles + t.titles, majors: sum.majors + t.majors }
    }, { titles: 0, majors: 0 }), [managerDetails?.stints, teams])
    const log = useMemo(() => eventsLog.slice(0, 16), [eventsLog])

    const loadSaves = useCallback(async () => {
        setLoadingSaves(true)
        try { setSaves(await listSaves()) }
        catch (error) { debug.error("Failed to list saves", error) }
        finally { setLoadingSaves(false) }
    }, [listSaves])

    useEffect(() => { loadSaves() }, [currentSaveId, loadSaves])

    const handleSwitch = async (saveId: string) => {
        if (saveId === currentSaveId) return
        setSwitchingTo(saveId)
        try {
            if (await switchSave(saveId)) { toast.success(t("car.toast.loaded")); router.refresh() }
            else toast.error(t("car.toast.loadFailed"))
        } catch {
            toast.error(t("car.toast.loadFailed"))
        } finally {
            setSwitchingTo(null)
        }
    }

    const handleDelete = async (saveId: string) => {
        if (saveId === currentSaveId) { toast.error(t("car.toast.cantDeleteActive")); return }
        if (confirmDelete !== saveId) { setConfirmDelete(saveId); return }
        try {
            await deleteSaveInSlot(saveId)
            await loadSaves()
            setConfirmDelete(null)
            toast.success(t("car.toast.deleted"))
        } catch {
            toast.error(t("car.toast.deleteFailed"))
        }
    }

    if (!hydrated || isLoading || !playerTeamId) return <LoadingState message={t("car.loading")} size="lg" className="min-h-[50vh]" />

    const level = managerDetails?.level || 1
    const xp = managerDetails?.xp || 0
    const xpNext = ManagerProgression.getXPForLevel(level + 1)
    const team = teams.find(t => t.id === playerTeamId)
    const seasons = Math.max(1, Math.floor((currentWeek - 1) / 52) + 1)

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow={team ? t("car.eyebrowClub", { club: team.name }) : t("car.eyebrow")}
                title={managerDetails?.name || t("car.profile")}
                subtitle={t("car.subtitle")}
                aside={
                    <KpiStrip>
                        <Kpi label={t("car.kpi.level")} value={level} hint={t("car.kpi.xp", { xp: xp.toLocaleString(intlLocale()), next: xpNext.toLocaleString(intlLocale()) })} />
                        <Kpi label={t("car.kpi.reputation")} value={Math.round(managerDetails?.reputation ?? 0)} hint={t("car.kpi.of100")} />
                        <Kpi label={t("tro.kpi.record")} value={<span>{record.wins}<span className="text-ink-3">–</span>{record.losses}</span>} hint={t("car.kpi.recordHint", { rate: record.rate })} />
                        <Kpi label={t("tro.kpi.titles")} value={titles} valueClassName={titles > 0 ? "text-gold" : undefined} hint={majors > 0 ? tn("car.kpi.majors", majors) : undefined} />
                        <Kpi label={t("car.kpi.season")} value={seasons} hint={t("car.kpi.week", { week: currentWeek })} />
                    </KpiStrip>
                }
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
                <div className="min-w-0 space-y-4">
                    <Panel title={t("car.levelN", { level })} actions={<span className="text-xs tabular-nums text-ink-3">{t("car.xpToLevel", { xp: (xpNext - xp).toLocaleString(intlLocale()), level: level + 1 })}</span>}>
                        <Meter value={xpNext > 0 ? (xp / xpNext) * 100 : 0} label={t("car.xpNextAria")} tone="neutral" showValue={false} trackClassName="w-full h-2" />
                        <p className="mt-2 text-xs text-ink-3">{t("car.xpNote")}</p>
                    </Panel>

                    <ClubTimelinePanel />

                    <LegacyGoalsPanel />

                    <CareerLegacyCard />

                    <Panel title={t("car.log")} padded={false}>
                        {log.length > 0 ? (
                            <table data-slot="table" className="w-full border-collapse text-left">
                                <thead data-slot="table-header">
                                    <tr className="border-b border-line">
                                        <th data-slot="table-head" className="w-20 pl-4">{t("tro.col.week")}</th>
                                        <th data-slot="table-head" className="pr-4">{t("car.col.event")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {log.map(e => (
                                        <tr key={e.id} data-slot="table-row" className="border-b border-line">
                                            <td className="py-2 pl-4 align-top text-sm tabular-nums text-ink-3">{e.week}</td>
                                            <td className={cn("py-2 pr-4 text-sm", e.type === "TOURNAMENT_WIN" ? "text-gold" : "text-ink-1")}>
                                                <span className="line-clamp-2" title={eventText(e)}>{eventText(e)}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <p className="px-4 py-6 text-sm text-ink-3">{t("car.logEmpty")}</p>}
                    </Panel>
                </div>

                <div className="min-w-0 space-y-4 self-start">
                <ReputationPanel />

                <Panel
                    title={t("car.saves")}
                    actions={<Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => router.push("/new-game")}><Plus size={13} /> {t("car.newCareer")}</Button>}
                    padded={false}
                    className="self-start"
                >
                    {loadingSaves ? (
                        <p className="flex items-center gap-2 px-4 py-6 text-sm text-ink-3"><Loader2 size={14} className="animate-spin" /> {t("car.loadingSaves")}</p>
                    ) : saves.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-ink-3">{t("car.noSaves")}</p>
                    ) : (
                        <ul className="divide-y divide-line">
                            {saves.map((slot, i) => {
                                const id = slot.saveId
                                const active = id === currentSaveId
                                const w = slot.stats?.wins ?? 0
                                const l = slot.stats?.losses ?? 0
                                return (
                                    <li key={id || i} className={cn("flex items-center gap-3 px-4 py-3", active && "bg-raised")}>
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-shell">
                                            {slot.teamLogo
                                                ? <TeamLogoImage src={slot.teamLogo} team={slot.teamPreview} alt={slot.teamName || t("car.team")} size={30} />
                                                : <span className="text-sm font-semibold text-ink-3">{slot.teamName?.[0] ?? "?"}</span>}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink-1">
                                                {slot.teamName || t("car.unknownTeam")}
                                                {active && <span className="rounded-sm border border-gold/50 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-gold">{t("car.playing")}</span>}
                                                {slot.isCorrupted && <span className="text-xs font-normal text-negative">{t("car.damaged")}</span>}
                                            </p>
                                            <p className="mt-0.5 text-xs tabular-nums text-ink-3">
                                                {t("car.kpi.week", { week: slot.currentWeek || 1 })} · {w}–{l}
                                                {slot.stats?.tournamentsWon ? ` · ${tn("tro.review.titles", slot.stats.tournamentsWon)}` : ""}
                                                {slot.budget !== undefined ? ` · ${formatCurrency(slot.budget, "$", true)}` : ""}
                                            </p>
                                        </div>
                                        {!active && id && (
                                            <div className="flex shrink-0 items-center gap-1">
                                                <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={switchingTo !== null} onClick={() => handleSwitch(id)}>
                                                    {switchingTo === id ? <Loader2 size={13} className="animate-spin" /> : t("car.load")}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className={cn("h-8 px-2 text-xs", confirmDelete === id ? "text-negative" : "text-ink-3")}
                                                    aria-label={confirmDelete === id ? t("car.confirmDeleteAria") : t("car.deleteAria")}
                                                    onClick={() => handleDelete(id)}
                                                >
                                                    {confirmDelete === id ? t("car.deleteQ") : <Trash2 size={14} />}
                                                </Button>
                                            </div>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </Panel>
                </div>
            </div>
        </div>
    )
}
