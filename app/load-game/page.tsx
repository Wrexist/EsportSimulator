"use client"

import React, { useCallback, useEffect, useState } from "react"
import { DRAFT_CUP_DIFFICULTY, DRAFT_CUP_FINISH_LABEL, type DraftCupDifficulty, type DraftCupFinish } from "@/engine/draft-cup"
import Link from "next/link"
import { debug } from "@/lib/debug-logger"
import { useGameStore } from "@/store/game-store"
import { useSettingsStore } from "@/lib/settings-store"
import { useShallow } from "zustand/react/shallow"
import { useRouter } from "next/navigation"
import { AlertCircle, Briefcase, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from "@/components/ui/alert-dialog"
import Image from "next/image"
import { TeamLogoImage } from "@/components/ui/asset-images"
import { trophyArtKind } from "@/components/squad/TrophyCabinet"
import { trophyArtFor } from "@/lib/trophy-art"
import { Panel } from "@/src/components/ui/Panel"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { formatCurrency } from "@/lib/utils-extended"
import { SaveSlotMetadata } from "@/engine"
import { ErrorBoundary } from "@/components/ui/error-boundary"

/** G7: "Draft Cup · Pro · Semi-finalists · 455" (or "in progress"). */
function draftCupSlotLabel(cup: { difficulty: string; finish?: string; score?: number }): string {
    const difficulty = DRAFT_CUP_DIFFICULTY[cup.difficulty as DraftCupDifficulty]?.label ?? cup.difficulty
    const finish = cup.finish ? DRAFT_CUP_FINISH_LABEL[cup.finish as DraftCupFinish] : undefined
    return ["Draft Cup", difficulty, finish ?? "In progress", cup.score != null ? `${cup.score} pts` : null].filter(Boolean).join(" · ")
}

export default function LoadGamePage() {
    return (
        <ErrorBoundary section="Save / Load">
            <LoadGamePageInner />
        </ErrorBoundary>
    )
}

function seasonWeek(week: number | null | undefined) {
    const w = Math.max(1, week || 1)
    return `Season ${Math.ceil(w / 52)} · Week ${((w - 1) % 52) + 1}`
}

/**
 * The save summary's last titles, drawn with the project trophy art
 * (lib/trophy-art) mapped from each title's tournament and tier at render
 * time. The summary's stored `logoPath` (old tournament PNGs) is not used.
 */
function RecentTitles({ trophies }: { trophies: SaveSlotMetadata["trophies"] }) {
    if (!trophies?.length) return null
    const recent = trophies.slice(-5)
    return (
        <span className="flex items-center gap-0.5" title={recent.map(t => t.tournamentName).join(" · ")}>
            <span className="sr-only">Recent titles: {recent.map(t => t.tournamentName).join(", ")}</span>
            {recent.map((t, i) => {
                const art = trophyArtFor(trophyArtKind(t))
                return <Image key={`${t.tournamentId}-${t.week}-${i}`} src={art.src} alt="" aria-hidden="true" width={28} height={28} className="h-7 w-7 object-contain" />
            })}
        </span>
    )
}

const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—"
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function LoadGamePageInner() {
    const router = useRouter()
    const { listSaves, switchSave, deleteSaveInSlot, saveId: currentActiveId, lastLoadError, attemptSaveRecovery, clearLoadError } = useGameStore(useShallow(state => ({
        listSaves: state.listSaves,
        switchSave: state.switchSave,
        deleteSaveInSlot: state.deleteSaveInSlot,
        saveId: state.saveId,
        lastLoadError: state.lastLoadError,
        attemptSaveRecovery: state.attemptSaveRecovery,
        clearLoadError: state.clearLoadError,
    })))
    const { autoSave, autoSaveInterval } = useSettingsStore(useShallow(s => ({ autoSave: s.autoSave, autoSaveInterval: s.autoSaveInterval })))
    const [slots, setSlots] = useState<SaveSlotMetadata[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [loadingSlotId, setLoadingSlotId] = useState<string | null>(null)
    const [recoveringSlotId, setRecoveringSlotId] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // useCallback keeps the effect dep stable.
    const refreshSlots = useCallback(async () => {
        setIsLoading(true)
        try {
            setSlots(await listSaves())
        } catch (error) {
            debug.error("Failed to load saves:", error)
            setSlots([])
        } finally {
            setIsLoading(false)
        }
    }, [listSaves])

    useEffect(() => {
        void refreshSlots()
    }, [refreshSlots])

    const handleLoad = async (id: string, cloudChoice?: "local" | "cloud") => {
        setLoadingSlotId(id)
        clearLoadError()
        try {
            const success = await switchSave(id, cloudChoice)
            if (success) {
                try {
                    router.push("/") // Go to dashboard
                } catch (err) {
                    debug.error("Navigation failed:", err)
                }
            }
            // On failure, lastLoadError is set by the store with errorCode + message.
        } finally {
            setLoadingSlotId(null)
        }
    }

    const handleRecover = async (id: string) => {
        setRecoveringSlotId(id)
        try {
            if (await attemptSaveRecovery(id)) router.push("/")
        } finally {
            setRecoveringSlotId(null)
        }
    }

    const handleDelete = async (id: string) => {
        if (isDeleting) return
        setIsDeleting(true)
        clearLoadError()
        try {
            await deleteSaveInSlot(id)
            await refreshSlots()
        } catch (error) {
            debug.error("Failed to delete save:", error)
        } finally {
            setIsDeleting(false)
            setDeleteTarget(null)
        }
    }

    const careers = slots.filter(s => !s.isEmpty && s.saveId)

    const renderError = (slot: SaveSlotMetadata) => {
        if (!lastLoadError || lastLoadError.saveId !== slot.saveId) return null
        const code = lastLoadError.errorCode
        const isNewerVersion = code === "NEWER_VERSION"
        const isCorrupted = code === "CORRUPTED" || code === "INTEGRITY_FAILED"
        const isCloudConflict = code === "CLOUD_CONFLICT"
        const heading = isCloudConflict ? "Choose which copy to load" : isNewerVersion
            ? "Saved by a newer version"
            : isCorrupted ? "Save appears corrupted" : "Load failed"
        const body = isNewerVersion
            ? "This save was written by a newer build of the game. Update through Steam to continue it, or pick another career."
            : isCorrupted
                ? `${lastLoadError.message} You can leave it untouched or try to recover it from its backup.`
                : lastLoadError.message
        return (
            <tr className="border-b border-line bg-negative/5">
                <td colSpan={7} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-2">
                            <AlertCircle size={16} className="mt-0.5 shrink-0 text-negative" />
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-ink-1">{heading}</p>
                                <p className="text-xs text-ink-2">{body}</p>
                                {isNewerVersion && <p className="mt-1 font-mono text-xs text-ink-3">{lastLoadError.message}</p>}
                            </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            {isNewerVersion ? (
                                <>
                                    <Button size="sm" variant="ghost" onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(`Save: ${slot.saveId}\nError: ${lastLoadError.message}\nApp: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`)
                                        } catch { /* clipboard may be denied */ }
                                        clearLoadError()
                                    }}>Copy details</Button>
                                    <Button size="sm" variant="outline" onClick={clearLoadError}>Skip</Button>
                                </>
                            ) : isCloudConflict ? (
                                <>
                                    <Button size="sm" variant="outline" disabled={loadingSlotId === slot.saveId} onClick={() => slot.saveId && handleLoad(slot.saveId, "local")}>Use this PC</Button>
                                    <Button size="sm" variant="outline" disabled={loadingSlotId === slot.saveId} onClick={() => slot.saveId && handleLoad(slot.saveId, "cloud")}>Use Steam Cloud</Button>
                                    <Button size="sm" variant="ghost" onClick={clearLoadError}>Cancel</Button>
                                </>
                            ) : isCorrupted ? (
                                <>
                                    <Button size="sm" variant="outline" disabled={recoveringSlotId === slot.saveId} onClick={() => slot.saveId && handleRecover(slot.saveId)}>
                                        {recoveringSlotId === slot.saveId ? "Recovering…" : "Recover from backup"}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={clearLoadError}>Skip</Button>
                                </>
                            ) : (
                                <>
                                    <Button size="sm" variant="outline" onClick={() => slot.saveId && handleLoad(slot.saveId)}>Retry</Button>
                                    <Button size="sm" variant="ghost" onClick={clearLoadError}>Dismiss</Button>
                                </>
                            )}
                        </div>
                    </div>
                </td>
            </tr>
        )
    }

    return (
        <div className="mx-auto max-w-[1280px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow="Saves"
                title="Load game"
                subtitle={`${isLoading ? "" : `${careers.length} ${careers.length === 1 ? "career" : "careers"} on this device. `}${autoSave ? `Auto-save is on (every ${autoSaveInterval} min).` : "Auto-save is off."} Each save keeps its last three versions as backups.`}
                aside={
                    <>
                        <Button asChild variant="ghost"><Link href="/main-menu">Main menu</Link></Button>
                        <Button asChild variant="outline"><Link href="/new-game">New career</Link></Button>
                    </>
                }
            />

            <Panel padded={false} className="overflow-hidden">
                {isLoading ? (
                    <p className="flex items-center gap-2 px-4 py-6 text-sm text-ink-3" role="status"><Loader2 size={15} className="animate-spin" /> Loading saves…</p>
                ) : careers.length === 0 ? (
                    <div className="flex items-center justify-between gap-4 px-4 py-5">
                        <p className="text-sm text-ink-3">No saved careers yet.</p>
                        <Button asChild variant="outline" size="sm"><Link href="/new-game">Start a career</Link></Button>
                    </div>
                ) : (
                    <table data-slot="table" className="w-full border-collapse text-left">
                        <thead data-slot="table-header">
                            <tr className="border-b border-line">
                                <th data-slot="table-head" className="pl-4">Career</th>
                                <th data-slot="table-head" className="px-3">Progress</th>
                                <th data-slot="table-head" className="px-3 text-right">Record</th>
                                <th data-slot="table-head" className="px-3 text-right">Titles</th>
                                <th data-slot="table-head" className="px-3 text-right">Funds</th>
                                <th data-slot="table-head" className="px-3">Last saved</th>
                                <th data-slot="table-head" className="pr-4"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {careers.map(slot => {
                                const isActive = !!currentActiveId && slot.saveId === currentActiveId
                                const corrupted = !!slot.isCorrupted
                                const busy = loadingSlotId === slot.saveId
                                return (
                                    <React.Fragment key={slot.saveId}>
                                        <tr data-slot="table-row" data-state={isActive ? "selected" : undefined} className="h-16 border-b border-line">
                                            <td className="py-2 pl-4 pr-3">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-raised">
                                                        {slot.betweenClubs
                                                            ? <Briefcase size={18} className="text-ink-3" aria-hidden="true" />
                                                            : slot.teamName
                                                            ? <TeamLogoImage src={slot.teamLogo} team={slot.teamPreview} alt={slot.teamName} size={34} />
                                                            : <AlertCircle size={18} className={corrupted ? "text-negative" : "text-ink-3"} />}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <h3 className="truncate text-[15px] font-semibold text-ink-1">{slot.teamName || slot.saveName || "Unnamed career"}</h3>
                                                        <p className="truncate text-xs text-ink-3">
                                                            {corrupted ? "Could not be read" : slot.draftCup ? draftCupSlotLabel(slot.draftCup) : slot.saveName || "—"}
                                                            {isActive && <span className="ml-2 font-semibold text-gold">Loaded</span>}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 text-sm text-ink-2">{slot.currentWeek ? seasonWeek(slot.currentWeek) : "—"}</td>
                                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{slot.stats ? `${slot.stats.wins}–${slot.stats.losses}` : "—"}</td>
                                            <td className="px-3">
                                                <div className="flex items-center justify-end gap-2">
                                                    <RecentTitles trophies={slot.trophies} />
                                                    <span className="text-sm tabular-nums text-ink-2">{slot.stats ? slot.stats.tournamentsWon : "—"}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{slot.budget !== undefined ? formatCurrency(slot.budget) : "—"}</td>
                                            <td className="px-3 text-sm text-ink-3">{formatDate(slot.updatedAt)}</td>
                                            <td className="w-44 pr-4">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {corrupted ? (
                                                        <Button size="sm" variant="outline" disabled={recoveringSlotId === slot.saveId} onClick={() => slot.saveId && handleRecover(slot.saveId)}>
                                                            {recoveringSlotId === slot.saveId ? "Recovering…" : "Recover"}
                                                        </Button>
                                                    ) : (
                                                        <Button size="sm" variant="outline" disabled={!!loadingSlotId} onClick={() => slot.saveId && handleLoad(slot.saveId)} aria-busy={busy || undefined}>
                                                            {busy ? <><Loader2 size={13} className="animate-spin" /> Loading</> : isActive ? "Reload" : "Load"}
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="icon-sm"
                                                        variant="ghost"
                                                        aria-label={`Delete ${slot.teamName || slot.saveName || "career"}`}
                                                        disabled={isDeleting || !!loadingSlotId}
                                                        onClick={() => slot.saveId && setDeleteTarget(slot.saveId)}
                                                    >
                                                        <Trash2 size={15} />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                        {renderError(slot)}
                                    </React.Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </Panel>

            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete career?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The career and its backups are removed from this device. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isDeleting}
                            onClick={() => deleteTarget && handleDelete(deleteTarget)}
                            className="bg-negative text-ink hover:bg-negative/90"
                        >
                            {isDeleting ? "Deleting…" : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
