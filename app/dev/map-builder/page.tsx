"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Download, Copy, Trash2, RotateCcw, Check } from "lucide-react"
import { MAP_LAYOUTS_ORDERED } from "@/data/map-layouts"
import type { MapLayoutJson } from "@/data/map-layouts/types"
import { MapBuilderCanvas } from "@/components/dev/MapBuilderCanvas"
import { cn } from "@/lib/utils"

const LOCAL_STORAGE_PREFIX = "esim:map-builder:"

function storageKey(mapId: string): string {
    return `${LOCAL_STORAGE_PREFIX}${mapId}`
}

function loadFromStorage(mapId: string): MapLayoutJson | null {
    if (typeof window === "undefined") return null
    try {
        const raw = window.localStorage.getItem(storageKey(mapId))
        if (!raw) return null
        return JSON.parse(raw) as MapLayoutJson
    } catch {
        return null
    }
}

function saveToStorage(mapId: string, layout: MapLayoutJson): void {
    if (typeof window === "undefined") return
    try {
        window.localStorage.setItem(storageKey(mapId), JSON.stringify(layout))
    } catch {
        // Storage quota or private-browsing — non-fatal.
    }
}

function clearStorage(mapId: string): void {
    if (typeof window === "undefined") return
    window.localStorage.removeItem(storageKey(mapId))
}

export default function MapBuilderPage() {
    const [selectedMapId, setSelectedMapId] = useState<string>(MAP_LAYOUTS_ORDERED[0].mapId)
    const [layouts, setLayouts] = useState<Record<string, MapLayoutJson>>(() => {
        const base: Record<string, MapLayoutJson> = {}
        for (const m of MAP_LAYOUTS_ORDERED) base[m.mapId] = m
        return base
    })
    const [copyState, setCopyState] = useState<"idle" | "copied">("idle")

    // Hydrate edits from localStorage on mount.
    useEffect(() => {
        const next = { ...layouts }
        let changed = false
        for (const m of MAP_LAYOUTS_ORDERED) {
            const stored = loadFromStorage(m.mapId)
            if (stored) {
                next[m.mapId] = stored
                changed = true
            }
        }
        if (changed) setLayouts(next)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const selected = layouts[selectedMapId]
    const radarImagePath = useMemo(
        () => `/maps/${selected.radarImage.upper}.png`,
        [selected.radarImage.upper],
    )
    const filename = useMemo(
        () => `${selected.displayName.toLowerCase().replace(/\s+/g, "_")}.json`,
        [selected.displayName],
    )

    const handleChange = useCallback((next: MapLayoutJson) => {
        setLayouts(prev => {
            const updated = { ...prev, [next.mapId]: next }
            saveToStorage(next.mapId, next)
            return updated
        })
    }, [])

    const handleExport = useCallback(() => {
        const json = JSON.stringify(selected, null, 2) + "\n"
        const blob = new Blob([json], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [selected, filename])

    /**
     * Export every map as a single bundled .json file. Useful when you've
     * edited several maps and want to drop them in one go — much faster
     * than 8 download clicks.
     */
    const handleExportAll = useCallback(() => {
        const bundle: Record<string, MapLayoutJson> = {}
        for (const m of MAP_LAYOUTS_ORDERED) {
            bundle[m.mapId] = layouts[m.mapId]
        }
        const json = JSON.stringify(bundle, null, 2) + "\n"
        const blob = new Blob([json], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "all-map-layouts.json"
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [layouts])

    const handleCopy = useCallback(async () => {
        const json = JSON.stringify(selected, null, 2)
        try {
            await navigator.clipboard.writeText(json)
            setCopyState("copied")
            setTimeout(() => setCopyState("idle"), 1500)
        } catch {
            // Fallback: fall through silently — export button still works.
        }
    }, [selected])

    const handleReset = useCallback(() => {
        if (!window.confirm(`Reset ${selected.displayName} to the committed baseline? Your local edits will be lost.`)) return
        clearStorage(selected.mapId)
        const baseline = MAP_LAYOUTS_ORDERED.find(m => m.mapId === selected.mapId)
        if (baseline) {
            setLayouts(prev => ({ ...prev, [selected.mapId]: baseline }))
        }
    }, [selected])

    const dirtyMaps = useMemo(() => {
        const set = new Set<string>()
        for (const m of MAP_LAYOUTS_ORDERED) {
            const stored = loadFromStorage(m.mapId)
            if (stored && JSON.stringify(stored) !== JSON.stringify(m)) {
                set.add(m.mapId)
            }
        }
        return set
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layouts])

    return (
        <div className="min-h-screen liquid-app-bg text-white p-6">
            <div className="max-w-[1600px] mx-auto space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/dev"
                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors"
                            aria-label="Back to dev tools"
                        >
                            <ArrowLeft size={16} />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold uppercase tracking-tight">Map Builder</h1>
                            <p className="text-xs text-white/40 mt-0.5">
                                Author per-map geometry for the live radar. Edits autosave to your browser; export JSON when ready to commit.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleReset}
                            className="h-10 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                            title="Discard local edits for this map"
                        >
                            <RotateCcw size={14} /> Reset
                        </button>
                        <button
                            onClick={handleCopy}
                            className="h-10 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                            title="Copy JSON to clipboard"
                        >
                            {copyState === "copied" ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                            {copyState === "copied" ? "Copied" : "Copy JSON"}
                        </button>
                        <button
                            onClick={handleExport}
                            className="h-10 px-4 rounded-lg bg-white hover:bg-white/90 text-black text-xs font-bold uppercase tracking-wider flex items-center gap-2 ring-1 ring-white/40 transition-colors"
                            title={`Download ${filename}`}
                        >
                            <Download size={14} /> Export {filename}
                        </button>
                        <button
                            onClick={handleExportAll}
                            className="h-10 px-4 rounded-lg bg-emerald-500/90 hover:bg-emerald-400 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 ring-1 ring-emerald-300/40 transition-colors"
                            title="Download all 8 maps in one bundle"
                        >
                            <Download size={14} /> Export ALL
                        </button>
                    </div>
                </div>

                {/* Map picker */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {MAP_LAYOUTS_ORDERED.map(m => {
                        const isActive = m.mapId === selectedMapId
                        const isDirty = dirtyMaps.has(m.mapId)
                        return (
                            <button
                                key={m.mapId}
                                onClick={() => setSelectedMapId(m.mapId)}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors whitespace-nowrap flex items-center gap-2",
                                    isActive
                                        ? "bg-white text-black border-white/40"
                                        : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
                                )}
                            >
                                {m.displayName}
                                {isDirty && (
                                    <span
                                        className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-amber-400")}
                                        title="Local edits not yet exported"
                                    />
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Canvas */}
                <MapBuilderCanvas
                    key={selected.mapId} /* Force fresh state per map */
                    initial={selected}
                    radarImagePath={radarImagePath}
                    onChange={handleChange}
                    otherLayouts={MAP_LAYOUTS_ORDERED.map(m => layouts[m.mapId])}
                />

                {/* Footer help */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/60 leading-relaxed">
                    <p className="font-bold text-white/90 mb-1 uppercase tracking-wider text-[10px]">How to use</p>
                    <ul className="space-y-1 list-disc list-inside marker:text-white/30">
                        <li>Pick a tool on the left, then click on the radar to place points.</li>
                        <li><b>Move tool</b> — drag any handle. Right-click a handle to delete it.</li>
                        <li><b>Walls</b> — click the start, then the end of each segment. Pairs.</li>
                        <li><b>Named regions</b> — click vertices, then double-click anywhere to close & name the polygon.</li>
                        <li>Edits autosave to <code className="text-white/80">localStorage</code>. Hit <b>Export</b> to download <code className="text-white/80">{filename}</code> and replace the file under <code className="text-white/80">/data/map-layouts/</code>. Next dev/build pickup uses the new geometry.</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
