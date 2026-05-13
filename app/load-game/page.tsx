"use client"

import React, { useEffect, useState } from "react"
import { debug } from "@/lib/debug-logger"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
    Save,
    Trash2,
    Play,
    Calendar,
    Shield,
    Clock,
    AlertCircle,
    ArrowLeft
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import { cn } from "@/lib/utils"
import { SaveSlotMetadata } from "@/engine"
import { ErrorBoundary } from "@/components/ui/error-boundary"

export default function LoadGamePage() {
    return (
        <ErrorBoundary section="Save / Load">
            <LoadGamePageInner />
        </ErrorBoundary>
    )
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
    const [slots, setSlots] = useState<SaveSlotMetadata[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [loadingSlotId, setLoadingSlotId] = useState<string | null>(null)
    const [recoveringSlotId, setRecoveringSlotId] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    useEffect(() => {
        void refreshSlots()
    }, [])

    const refreshSlots = async () => {
        setIsLoading(true)
        try {
            const availableSlots = await listSaves()
            setSlots(availableSlots)
        } catch (error) {
            debug.error("Failed to load saves:", error)
            setSlots([])
        } finally {
            setIsLoading(false)
        }
    }

    const handleLoad = async (id: string) => {
        setLoadingSlotId(id)
        clearLoadError()
        try {
            const success = await switchSave(id)
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
            const ok = await attemptSaveRecovery(id)
            if (ok) {
                router.push("/")
            }
        } finally {
            setRecoveringSlotId(null)
        }
    }

    const handleSkip = () => {
        clearLoadError()
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

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return "Unknown"
        return new Date(dateStr).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        })
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white p-8 md:p-12">
            <div className="max-w-6xl mx-auto space-y-12">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="space-y-2">
                        <button
                            onClick={() => router.push("/")}
                            className="flex items-center gap-2 text-muted-foreground hover:text-white transition-colors text-xs font-bold uppercase tracking-widest mb-4"
                        >
                            <ArrowLeft size={14} /> Back to Dashboard
                        </button>
                        <h1 className="text-5xl font-normal tracking-tighter uppercase liquid-text">
                            Career Archives
                        </h1>
                        <p className="text-muted-foreground font-medium uppercase text-xs tracking-[0.2em]">Select a legacy to continue your journey</p>
                    </div>

                    <div className="hidden md:flex items-center gap-4 glass-panel p-4 border-white/5">
                        <div className="text-right">
                            <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground">Active Career</p>
                            <p className="text-sm font-bold text-primary">
                                {currentActiveId ? (slots.find(s => s.saveId === currentActiveId)?.saveName || "NONE") : "NONE"}
                            </p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                            <Save size={24} className="text-primary" />
                        </div>
                    </div>
                </div>

                {/* Slots Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout">
                        {slots.length > 0 ? (
                            slots.filter(s => !s.isEmpty && s.saveId).map((slot, idx) => (
                                <motion.div
                                    key={slot.saveId || idx}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className={cn(
                                        "glass-panel group relative overflow-hidden flex flex-col border-white/5 hover:border-primary/30 transition-all duration-500",
                                        currentActiveId && slot.saveId === currentActiveId && "border-primary/50 bg-primary/5"
                                    )}
                                >
                                    {/* Slot Background Decor */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/10 transition-colors" />

                                    <div className="p-6 flex-1 space-y-6">
                                        <div className="flex justify-between items-start">
                                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 flex items-center justify-center font-normal text-2xl shadow-xl group-hover:scale-110 transition-transform">
                                                {slot.teamName?.[0] || "?"}
                                            </div>
                                            <Badge className={cn(
                                                "uppercase font-normal text-[8px] tracking-widest",
                                                currentActiveId && slot.saveId === currentActiveId ? "bg-primary text-white" : "bg-white/5 text-muted-foreground"
                                            )}>
                                                {currentActiveId && slot.saveId === currentActiveId ? "ACTIVE" : "ARCHIVED"}
                                            </Badge>
                                        </div>

                                        <div>
                                            <h3 className="text-xl font-normal text-white uppercase truncate">{slot.saveName || "Unnamed Career"}</h3>
                                            <p className="text-sm font-bold text-muted-foreground uppercase tracking-tight flex items-center gap-2 mt-1">
                                                <Shield size={12} className="text-primary" /> {slot.teamName || "Unassigned"}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                            <div className="space-y-1">
                                                <p className="text-[8px] font-normal text-muted-foreground uppercase tracking-widest">Progress</p>
                                                <div className="flex items-center gap-2 text-white font-bold text-xs">
                                                    <Calendar size={12} className="text-muted-foreground" />
                                                    Week {slot.currentWeek || 1}
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[8px] font-normal text-muted-foreground uppercase tracking-widest">Last Update</p>
                                                <div className="flex items-center gap-2 text-white font-bold text-xs">
                                                    <Clock size={12} className="text-muted-foreground" />
                                                    {formatDate(slot.updatedAt || undefined)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Load Error */}
                                    {lastLoadError?.saveId === slot.saveId && (() => {
                                        const code = lastLoadError.errorCode
                                        const isNewerVersion = code === "NEWER_VERSION"
                                        const isCorrupted = code === "CORRUPTED" || code === "INTEGRITY_FAILED"
                                        const heading = isNewerVersion
                                            ? "Save From Newer Version"
                                            : isCorrupted
                                                ? "Save Appears Corrupted"
                                                : "Load Failed"
                                        const body = isNewerVersion
                                            ? "This save was written by a newer build of the game. Update via Steam to continue this career, or skip this save and pick another to play."
                                            : isCorrupted
                                                ? `${lastLoadError.message} You can skip this save (it will be left untouched) or attempt to recover from a backup.`
                                                : lastLoadError.message
                                        return (
                                            <div className="mx-4 mb-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                                                <div className="flex items-start gap-2">
                                                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                                    <div>
                                                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1">{heading}</p>
                                                        <p className="text-[10px] text-red-400/80 leading-relaxed">{body}</p>
                                                        {isNewerVersion && (
                                                            <p className="text-[9px] text-red-400/60 mt-1 font-mono">
                                                                {lastLoadError.message}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 mt-3">
                                                    {isNewerVersion ? (
                                                        <>
                                                            <button
                                                                onClick={handleSkip}
                                                                className="flex-1 py-2 rounded-lg bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white hover:bg-white/10 transition-colors"
                                                            >
                                                                Skip Save
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        await navigator.clipboard.writeText(
                                                                            `Save: ${slot.saveId}\nError: ${lastLoadError.message}\nApp: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`
                                                                        )
                                                                    } catch { /* clipboard may be denied; fail silently */ }
                                                                    handleSkip()
                                                                }}
                                                                className="flex-1 py-2 rounded-lg bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/70 hover:bg-white/10 transition-colors"
                                                            >
                                                                Copy Details
                                                            </button>
                                                        </>
                                                    ) : isCorrupted ? (
                                                        <>
                                                            <button
                                                                onClick={() => slot.saveId && handleRecover(slot.saveId)}
                                                                disabled={recoveringSlotId === slot.saveId}
                                                                className="flex-1 py-2 rounded-lg bg-amber-500/20 text-[9px] font-bold uppercase tracking-widest text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                                            >
                                                                {recoveringSlotId === slot.saveId ? "Recovering..." : "Attempt Recovery"}
                                                            </button>
                                                            <button
                                                                onClick={handleSkip}
                                                                className="flex-1 py-2 rounded-lg bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/70 hover:bg-white/10 transition-colors"
                                                            >
                                                                Skip Save
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => slot.saveId && handleLoad(slot.saveId)}
                                                                className="flex-1 py-2 rounded-lg bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white hover:bg-white/10 transition-colors"
                                                            >
                                                                Retry
                                                            </button>
                                                            <button
                                                                onClick={handleSkip}
                                                                className="px-4 py-2 rounded-lg bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/50 hover:bg-white/10 transition-colors"
                                                            >
                                                                Dismiss
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })()}

                                    {/* Actions */}
                                    <div className="p-2 flex gap-2 bg-white/5 border-t border-white/5">
                                        <button
                                            onClick={() => slot.saveId && handleLoad(slot.saveId)}
                                            disabled={!!loadingSlotId}
                                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white text-[10px] font-normal uppercase tracking-widest hover:bg-primary/80 transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] disabled:opacity-50 disabled:cursor-wait"
                                        >
                                            {loadingSlotId === slot.saveId ? (
                                                <><Clock size={12} className="animate-spin" /> Loading...</>
                                            ) : (
                                                <><Play size={12} fill="currentColor" /> Resume Career</>
                                            )}
                                        </button>
                                        <button
                                            disabled={isDeleting || !!loadingSlotId}
                                            onClick={() => slot.saveId && setDeleteTarget(slot.saveId)}
                                            className="w-12 flex items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all border border-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </motion.div>
                            ))
                        ) : (
                            <div className="col-span-full py-32 flex flex-col items-center text-center space-y-6">
                                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                    <AlertCircle size={40} className="text-muted-foreground" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-normal text-white uppercase">No legacies found</h3>
                                    <p className="text-muted-foreground max-w-xs mx-auto text-sm">You haven't started any career paths yet. Create a new one from the dashboard.</p>
                                </div>
                                <button
                                    onClick={() => router.push("/")}
                                    className="px-8 py-4 rounded-2xl bg-white text-black text-xs font-normal uppercase tracking-widest hover:scale-105 transition-transform"
                                >
                                    Start New Career
                                </button>
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer Info */}
                <div className="glass-panel p-6 border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                            <Save size={18} className="text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-[10px] font-normal uppercase tracking-widest text-white">Auto-Backup Active</p>
                            <p className="text-xs text-muted-foreground">Your progress is safely stored in local archives.</p>
                        </div>
                    </div>
                    <div className="flex gap-8">
                        <div className="text-center">
                            <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground">Total Slots</p>
                            <p className="text-xl font-normal text-white">{slots.length} / 10</p>
                        </div>
                        <div className="w-px h-10 bg-white/10 self-center" />
                        <div className="text-center">
                            <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground">Storage Status</p>
                            <p className="text-xl font-normal text-emerald-500 uppercase">Synced</p>
                        </div>
                    </div>
                </div>

                {/* Delete Confirmation Dialog */}
                <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
                    <AlertDialogContent className="bg-[#0e1217] border-white/10">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-white">Delete Career</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to delete this career? This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting} className="border-white/10 text-white hover:bg-white/10">
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                disabled={isDeleting}
                                onClick={() => deleteTarget && handleDelete(deleteTarget)}
                                className="bg-red-600 hover:bg-red-700 text-white"
                            >
                                {isDeleting ? "Deleting..." : "Delete"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    )
}
