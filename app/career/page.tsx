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
import { ManagerProgression } from "@/engine/manager-progression"
import type { SaveSlotMetadata } from "@/engine/save-types"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"

function eventText(event: { type: string; data?: unknown }): string {
    const d = (event.data ?? {}) as Record<string, unknown>
    const text = d.description ?? d.message ?? d.text ?? d.title
    if (typeof text === "string" && text.trim()) return text
    return event.type.replace(/_/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase())
}

export default function CareerPage() {
    const router = useRouter()
    const {
        playerTeamId, currentWeek, completedMatches, eventsLog, saveId: currentSaveId,
        listSaves, switchSave, deleteSaveInSlot, managerDetails, teams, hydrated, isLoading,
    } = useGameStore(useShallow(state => ({
        hydrated: state._hasHydrated,
        isLoading: state.isLoading,
        playerTeamId: state.playerTeamId,
        currentWeek: state.currentWeek,
        completedMatches: state.completedMatches,
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

    const record = useMemo(() => {
        let wins = 0, losses = 0
        for (const m of completedMatches) {
            if (m.homeTeamId !== playerTeamId && m.awayTeamId !== playerTeamId) continue
            if (!m.result) continue
            const won = (m.homeTeamId === playerTeamId && m.result.homeScore > m.result.awayScore)
                || (m.awayTeamId === playerTeamId && m.result.awayScore > m.result.homeScore)
            if (won) wins++
            else if (m.result.homeScore !== m.result.awayScore) losses++
        }
        return { wins, losses, played: wins + losses, rate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0 }
    }, [completedMatches, playerTeamId])

    const titles = useMemo(() => eventsLog.filter(e => e.type === "TOURNAMENT_WIN").length, [eventsLog])
    const majors = useMemo(() => eventsLog.filter(e => e.type === "TOURNAMENT_WIN" && (e.data as { tier?: string } | undefined)?.tier === "S_TIER").length, [eventsLog])
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
            if (await switchSave(saveId)) { toast.success("Save loaded"); router.refresh() }
            else toast.error("Couldn't load that save")
        } catch {
            toast.error("Couldn't load that save")
        } finally {
            setSwitchingTo(null)
        }
    }

    const handleDelete = async (saveId: string) => {
        if (saveId === currentSaveId) { toast.error("You can't delete the save you're playing"); return }
        if (confirmDelete !== saveId) { setConfirmDelete(saveId); return }
        try {
            await deleteSaveInSlot(saveId)
            await loadSaves()
            setConfirmDelete(null)
            toast.success("Save deleted")
        } catch {
            toast.error("Couldn't delete that save")
        }
    }

    if (!hydrated || isLoading || !playerTeamId) return <LoadingState message="Loading manager profile…" size="lg" className="min-h-[50vh]" />

    const level = managerDetails?.level || 1
    const xp = managerDetails?.xp || 0
    const xpNext = ManagerProgression.getXPForLevel(level + 1)
    const team = teams.find(t => t.id === playerTeamId)
    const seasons = Math.floor((currentWeek - 1) / 52) + 1

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow={team ? `Manager · ${team.name}` : "Manager"}
                title={managerDetails?.name || "Manager profile"}
                subtitle="Your record in this career, your legacy across every save, and your save slots."
                aside={
                    <KpiStrip>
                        <Kpi label="Level" value={level} hint={`${xp.toLocaleString("en-US")} / ${xpNext.toLocaleString("en-US")} XP`} />
                        <Kpi label="Record" value={<span>{record.wins}<span className="text-ink-3">–</span>{record.losses}</span>} hint={`${record.rate}% won`} />
                        <Kpi label="Titles" value={titles} valueClassName={titles > 0 ? "text-gold" : undefined} hint={majors > 0 ? `${majors} major${majors === 1 ? "" : "s"}` : undefined} />
                        <Kpi label="Season" value={seasons} hint={`Week ${currentWeek}`} />
                    </KpiStrip>
                }
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
                <div className="min-w-0 space-y-4">
                    <Panel title={`Level ${level}`} actions={<span className="text-xs tabular-nums text-ink-3">{(xpNext - xp).toLocaleString("en-US")} XP to level {level + 1}</span>}>
                        <Meter value={xpNext > 0 ? (xp / xpNext) * 100 : 0} label="XP to next level" tone="neutral" showValue={false} trackClassName="w-full h-2" />
                        <p className="mt-2 text-xs text-ink-3">Every win earns 100 XP and every loss 25 XP; analyst talents can add up to +50%.</p>
                    </Panel>

                    <CareerLegacyCard />

                    <Panel title="Career log" padded={false}>
                        {log.length > 0 ? (
                            <table data-slot="table" className="w-full border-collapse text-left">
                                <thead data-slot="table-header">
                                    <tr className="border-b border-line">
                                        <th data-slot="table-head" className="w-20 pl-4">Week</th>
                                        <th data-slot="table-head" className="pr-4">Event</th>
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
                        ) : <p className="px-4 py-6 text-sm text-ink-3">Nothing recorded yet. Results, signings and news land here.</p>}
                    </Panel>
                </div>

                <Panel
                    title="Saves"
                    actions={<Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => router.push("/new-game")}><Plus size={13} /> New career</Button>}
                    padded={false}
                    className="self-start"
                >
                    {loadingSaves ? (
                        <p className="flex items-center gap-2 px-4 py-6 text-sm text-ink-3"><Loader2 size={14} className="animate-spin" /> Loading saves…</p>
                    ) : saves.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-ink-3">No saves on this machine yet.</p>
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
                                                ? <TeamLogoImage src={slot.teamLogo} team={slot.teamPreview} alt={slot.teamName || "Team"} size={30} />
                                                : <span className="text-sm font-semibold text-ink-3">{slot.teamName?.[0] ?? "?"}</span>}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink-1">
                                                {slot.teamName || "Unknown team"}
                                                {active && <span className="rounded-sm border border-gold/50 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-gold">Playing</span>}
                                                {slot.isCorrupted && <span className="text-xs font-normal text-negative">Damaged</span>}
                                            </p>
                                            <p className="mt-0.5 text-xs tabular-nums text-ink-3">
                                                Week {slot.currentWeek || 1} · {w}–{l}
                                                {slot.stats?.tournamentsWon ? ` · ${slot.stats.tournamentsWon} titles` : ""}
                                                {slot.budget !== undefined ? ` · ${formatCurrency(slot.budget, "$", true)}` : ""}
                                            </p>
                                        </div>
                                        {!active && id && (
                                            <div className="flex shrink-0 items-center gap-1">
                                                <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={switchingTo !== null} onClick={() => handleSwitch(id)}>
                                                    {switchingTo === id ? <Loader2 size={13} className="animate-spin" /> : "Load"}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className={cn("h-8 px-2 text-xs", confirmDelete === id ? "text-negative" : "text-ink-3")}
                                                    aria-label={confirmDelete === id ? "Confirm delete save" : "Delete save"}
                                                    onClick={() => handleDelete(id)}
                                                >
                                                    {confirmDelete === id ? "Delete?" : <Trash2 size={14} />}
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
    )
}
