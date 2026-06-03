"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type {
    LayoutPoint,
    LayoutPolygon,
    LayoutWall,
    MapLayoutJson,
} from "@/data/map-layouts/types"

/* ──────────────────────────────────────────────────────────────────────────
 * Tool & layer config
 * ────────────────────────────────────────────────────────────────────────── */

export type Tool =
    | "ctSpawn" | "tSpawn" | "ctHolds"
    | "aSite" | "bSite" | "mid"
    | "engageA" | "engageB"
    | "tToA" | "tToB" | "ctRotateA" | "ctRotateB"
    | "walls" | "regions"
    | "ruler"
    | "move"

interface ToolDef {
    id: Tool
    label: string
    group: "move" | "spawn" | "anchor" | "path" | "geometry" | "measure"
    color: string
    description: string
    hotkey?: string
}

const TOOLS: ToolDef[] = [
    { id: "move", label: "Select / Move", group: "move", color: "#94a3b8", description: "Drag handles. Right-click handle to delete.", hotkey: "V" },
    { id: "ruler", label: "Ruler", group: "measure", color: "#fde68a", description: "Click two points to measure radar distance.", hotkey: "R" },

    { id: "ctSpawn", label: "CT Spawn (5)", group: "spawn", color: "#60a5fa", description: "CT spawn cluster.", hotkey: "1" },
    { id: "tSpawn", label: "T Spawn (5)", group: "spawn", color: "#f59e0b", description: "T spawn cluster.", hotkey: "2" },
    { id: "ctHolds", label: "CT Holds (5)", group: "spawn", color: "#38bdf8", description: "Per-CT-player hold position.", hotkey: "3" },

    { id: "aSite", label: "A Site", group: "anchor", color: "#ef4444", description: "A bombsite anchor.", hotkey: "A" },
    { id: "bSite", label: "B Site", group: "anchor", color: "#ef4444", description: "B bombsite anchor.", hotkey: "B" },
    { id: "mid", label: "Mid", group: "anchor", color: "#a78bfa", description: "Mid anchor.", hotkey: "M" },
    { id: "engageA", label: "Engage A", group: "anchor", color: "#fb923c", description: "First-contact zone near A.", hotkey: "Q" },
    { id: "engageB", label: "Engage B", group: "anchor", color: "#fb923c", description: "First-contact zone near B.", hotkey: "W" },

    { id: "tToA", label: "T → A path", group: "path", color: "#f59e0b", description: "Waypoints, T spawn to A.", hotkey: "4" },
    { id: "tToB", label: "T → B path", group: "path", color: "#f59e0b", description: "Waypoints, T spawn to B.", hotkey: "5" },
    { id: "ctRotateA", label: "CT rotate → A", group: "path", color: "#60a5fa", description: "CT rotation to A.", hotkey: "6" },
    { id: "ctRotateB", label: "CT rotate → B", group: "path", color: "#60a5fa", description: "CT rotation to B.", hotkey: "7" },

    { id: "walls", label: "Walls", group: "geometry", color: "#fafafa", description: "Click two points per segment. Walls block kill-line plausibility.", hotkey: "L" },
    { id: "regions", label: "Named regions", group: "geometry", color: "#34d399", description: "Click vertices, dbl-click to close. Names like 'A site', 'Banana', 'Mid'.", hotkey: "P" },
]

const ALL_LAYER_KEYS = [
    "ctSpawn", "tSpawn", "ctHolds",
    "aSite", "bSite", "mid", "engageA", "engageB",
    "tToA", "tToB", "ctRotateA", "ctRotateB",
    "walls", "regions",
] as const
type LayerKey = typeof ALL_LAYER_KEYS[number]

/* ──────────────────────────────────────────────────────────────────────────
 * Undo / redo via a small reducer-backed history stack
 * ────────────────────────────────────────────────────────────────────────── */

interface HistoryState {
    past: MapLayoutJson[]
    present: MapLayoutJson
    future: MapLayoutJson[]
}

type HistoryAction =
    | { type: "set"; next: MapLayoutJson }
    | { type: "undo" }
    | { type: "redo" }
    | { type: "reset"; next: MapLayoutJson }

const HISTORY_LIMIT = 80

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
    switch (action.type) {
        case "set": {
            if (state.present === action.next) return state
            const past = [...state.past, state.present].slice(-HISTORY_LIMIT)
            return { past, present: action.next, future: [] }
        }
        case "undo": {
            if (state.past.length === 0) return state
            const prev = state.past[state.past.length - 1]
            const past = state.past.slice(0, -1)
            return { past, present: prev, future: [state.present, ...state.future] }
        }
        case "redo": {
            if (state.future.length === 0) return state
            const [next, ...rest] = state.future
            return { past: [...state.past, state.present], present: next, future: rest }
        }
        case "reset":
            return { past: [], present: action.next, future: [] }
    }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places

function snap(value: number, step: number): number {
    if (step <= 0) return round(value)
    return round(Math.round(value / step) * step)
}

function nearestIndex(points: LayoutPoint[], p: LayoutPoint): number {
    let bestIdx = 0
    let bestD = Number.POSITIVE_INFINITY
    for (let i = 0; i < points.length; i++) {
        const d = (points[i].x - p.x) ** 2 + (points[i].y - p.y) ** 2
        if (d < bestD) {
            bestD = d
            bestIdx = i
        }
    }
    return bestIdx
}

function centroid(poly: LayoutPoint[]): LayoutPoint {
    if (poly.length === 0) return { x: 50, y: 50 }
    let sx = 0
    let sy = 0
    for (const p of poly) {
        sx += p.x
        sy += p.y
    }
    return { x: sx / poly.length, y: sy / poly.length }
}

function distance(a: LayoutPoint, b: LayoutPoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

function pathLength(path: LayoutPoint[]): number {
    let total = 0
    for (let i = 1; i < path.length; i++) total += distance(path[i - 1], path[i])
    return total
}

/* ──────────────────────────────────────────────────────────────────────────
 * Layout validation — surfaces in the right panel
 * ────────────────────────────────────────────────────────────────────────── */

interface ValidationFinding {
    level: "warn" | "error"
    message: string
}

function validate(layout: MapLayoutJson): ValidationFinding[] {
    const out: ValidationFinding[] = []
    const need5 = (arr: LayoutPoint[] | undefined, label: string) => {
        if (!arr || arr.length !== 5) {
            out.push({ level: arr && arr.length > 0 ? "warn" : "error", message: `${label} should have exactly 5 points (has ${arr?.length ?? 0}).` })
        }
    }
    need5(layout.ctSpawn, "CT Spawn")
    need5(layout.tSpawn, "T Spawn")
    need5(layout.ctHolds, "CT Holds")

    if (!layout.aSite || !layout.bSite) {
        out.push({ level: "error", message: "Both A and B site anchors are required." })
    }
    if (!layout.engageA || !layout.engageB) {
        out.push({ level: "error", message: "Both engageA and engageB are required." })
    }
    if (!layout.mid) {
        out.push({ level: "warn", message: "Mid anchor not set — engine will fall back to map center." })
    }

    if (!layout.tToA || layout.tToA.length < 2) out.push({ level: "warn", message: "tToA should have ≥2 waypoints." })
    if (!layout.tToB || layout.tToB.length < 2) out.push({ level: "warn", message: "tToB should have ≥2 waypoints." })
    if (!layout.ctRotateA || layout.ctRotateA.length < 1) out.push({ level: "warn", message: "ctRotateA should have ≥1 waypoint." })
    if (!layout.ctRotateB || layout.ctRotateB.length < 1) out.push({ level: "warn", message: "ctRotateB should have ≥1 waypoint." })

    // Sanity: T spawn shouldn't be next to a bombsite.
    if (layout.tSpawn?.length && layout.aSite) {
        const minD = Math.min(...layout.tSpawn.map(p => distance(p, layout.aSite)))
        if (minD < 12) out.push({ level: "warn", message: "T spawn is suspiciously close to A site (looks like the data wasn't authored)." })
    }

    return out
}

/* ──────────────────────────────────────────────────────────────────────────
 * Props + main component
 * ────────────────────────────────────────────────────────────────────────── */

interface Props {
    initial: MapLayoutJson
    radarImagePath: string
    onChange: (next: MapLayoutJson) => void
    /** Provides a sibling map's layout for copy-from-other-map UX. */
    otherLayouts?: MapLayoutJson[]
}

export function MapBuilderCanvas({ initial, radarImagePath, onChange, otherLayouts }: Props) {
    const [history, dispatch] = useReducer(historyReducer, {
        past: [],
        present: initial,
        future: [],
    })
    const layout = history.present
    const lastInitialRef = useRef(initial)

    useEffect(() => {
        if (lastInitialRef.current !== initial) {
            lastInitialRef.current = initial
            dispatch({ type: "reset", next: initial })
        }
    }, [initial])

    const setLayout = useCallback((next: MapLayoutJson) => {
        dispatch({ type: "set", next })
    }, [])

    useEffect(() => {
        onChange(layout)
    }, [layout, onChange])

    /* ── UI state ──────────────────────────────────────────────────────── */

    const [tool, setTool] = useState<Tool>("move")
    const [hoverPoint, setHoverPoint] = useState<LayoutPoint | null>(null)
    const [wallStart, setWallStart] = useState<LayoutPoint | null>(null)
    const [draftRegion, setDraftRegion] = useState<LayoutPoint[] | null>(null)
    const [rulerStart, setRulerStart] = useState<LayoutPoint | null>(null)
    const [draggingRef, setDraggingRef] = useState<{ field: string; index?: number; subKey?: string; subIndex?: number } | null>(null)
    const [snapStep, setSnapStep] = useState(0)  // 0 = off, e.g. 0.5, 1, 2, 5
    const [hiddenLayers, setHiddenLayers] = useState<Set<LayerKey>>(new Set())
    const [showPreview, setShowPreview] = useState(false)
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [importDialog, setImportDialog] = useState(false)
    const [importText, setImportText] = useState("")

    const svgRef = useRef<SVGSVGElement | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)

    /* ── Keyboard shortcuts ────────────────────────────────────────────── */

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tgt = e.target as HTMLElement | null
            if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return
            if (e.key === "Escape") {
                setWallStart(null)
                setDraftRegion(null)
                setRulerStart(null)
                setTool("move")
                return
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
                e.preventDefault()
                dispatch({ type: "undo" })
                return
            }
            if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
                e.preventDefault()
                dispatch({ type: "redo" })
                return
            }
            const upper = e.key.toUpperCase()
            const match = TOOLS.find(t => t.hotkey === upper)
            if (match) {
                setTool(match.id)
                setWallStart(null)
                setDraftRegion(null)
                setRulerStart(null)
            }
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [])

    /* ── Coordinate transforms (account for pan + zoom) ─────────────────── */

    const cursorToLayout = useCallback((evt: React.MouseEvent<SVGElement> | React.WheelEvent<SVGElement>): LayoutPoint | null => {
        const svg = svgRef.current
        if (!svg) return null
        const rect = svg.getBoundingClientRect()
        const sx = ((evt.clientX - rect.left) / rect.width) * 100
        const sy = ((evt.clientY - rect.top) / rect.height) * 100
        // Map screen-space → layout-space using current pan/zoom
        const lx = (sx - pan.x) / zoom
        const ly = (sy - pan.y) / zoom
        return { x: snap(lx, snapStep), y: snap(ly, snapStep) }
    }, [pan.x, pan.y, zoom, snapStep])

    /* ── Add / edit handlers ───────────────────────────────────────────── */

    const handleCanvasClick = useCallback((evt: React.MouseEvent<SVGElement>) => {
        if (draggingRef) return
        const p = cursorToLayout(evt)
        if (!p) return

        if (tool === "move") return

        if (tool === "ruler") {
            if (!rulerStart) setRulerStart(p)
            else setRulerStart(null)
            return
        }

        if (tool === "walls") {
            if (!wallStart) {
                setWallStart(p)
                return
            }
            const wall: LayoutWall = { from: wallStart, to: p }
            setLayout({ ...layout, walls: [...(layout.walls ?? []), wall] })
            setWallStart(null)
            return
        }

        if (tool === "regions") {
            const next = [...(draftRegion ?? []), p]
            setDraftRegion(next)
            return
        }

        if (tool === "ctSpawn" || tool === "tSpawn" || tool === "ctHolds") {
            const current = layout[tool] ?? []
            if (current.length < 5) {
                setLayout({ ...layout, [tool]: [...current, p] })
            } else {
                const idx = nearestIndex(current, p)
                const next = current.map((q, i) => (i === idx ? p : q))
                setLayout({ ...layout, [tool]: next })
            }
            return
        }

        if (tool === "aSite" || tool === "bSite" || tool === "mid" || tool === "engageA" || tool === "engageB") {
            setLayout({ ...layout, [tool]: p })
            return
        }

        if (tool === "tToA" || tool === "tToB" || tool === "ctRotateA" || tool === "ctRotateB") {
            setLayout({ ...layout, [tool]: [...(layout[tool] ?? []), p] })
            return
        }
    }, [tool, cursorToLayout, layout, wallStart, draftRegion, rulerStart, draggingRef, setLayout])

    const handleRegionDoubleClick = useCallback(() => {
        if (tool !== "regions" || !draftRegion || draftRegion.length < 3) return
        const name = window.prompt("Name this region (e.g. 'A site', 'Banana', 'Mid')", "Region")
        if (!name) {
            setDraftRegion(null)
            return
        }
        const polygon: LayoutPolygon = draftRegion
        setLayout({
            ...layout,
            namedRegions: { ...(layout.namedRegions ?? {}), [name]: polygon },
        })
        setDraftRegion(null)
    }, [tool, draftRegion, layout, setLayout])

    /* ── Drag handles ──────────────────────────────────────────────────── */

    const onHandleMouseDown = useCallback((field: string, index?: number, subKey?: string, subIndex?: number) => (e: React.MouseEvent) => {
        if (e.button !== 0) return
        e.stopPropagation()
        setDraggingRef({ field, index, subKey, subIndex })
    }, [])

    const onHandleRightClick = useCallback((field: string, index?: number) => (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const cloned: any = { ...layout }
        if (field === "walls" && index !== undefined) {
            cloned.walls = (cloned.walls ?? []).filter((_: unknown, i: number) => i !== index)
        } else if (field === "regions" && index !== undefined) {
            const keys = Object.keys(cloned.namedRegions ?? {})
            const key = keys[index]
            if (key) {
                const next = { ...cloned.namedRegions }
                delete next[key]
                cloned.namedRegions = next
            }
        } else if (index !== undefined && Array.isArray(cloned[field])) {
            cloned[field] = cloned[field].filter((_: unknown, i: number) => i !== index)
        }
        setLayout(cloned)
    }, [layout, setLayout])

    const handleMouseMove = useCallback((e: React.MouseEvent<SVGElement>) => {
        const p = cursorToLayout(e)
        if (!p) return
        setHoverPoint(p)
        if (!draggingRef) return

        const cloned: any = { ...layout }
        const { field, index, subKey, subIndex } = draggingRef

        if (subKey === "wallEndpoint" && index !== undefined && subIndex !== undefined) {
            const walls = [...(cloned.walls ?? [])]
            const wall = { ...walls[index] }
            if (subIndex === 0) wall.from = p
            else wall.to = p
            walls[index] = wall
            cloned.walls = walls
        } else if (subKey === "regionVertex" && subIndex !== undefined) {
            // index is the regionKey position in entries
            const entries = Object.entries(cloned.namedRegions ?? {}) as Array<[string, LayoutPoint[]]>
            const entry = entries[index ?? -1]
            if (entry) {
                const [name, poly] = entry
                const next = [...poly]
                next[subIndex] = p
                entries[index!] = [name, next]
                cloned.namedRegions = Object.fromEntries(entries)
            }
        } else if (index !== undefined && Array.isArray(cloned[field])) {
            cloned[field] = cloned[field].map((q: LayoutPoint, i: number) => (i === index ? p : q))
        } else if (index === undefined) {
            cloned[field] = p
        }
        setLayout(cloned)
    }, [cursorToLayout, draggingRef, layout, setLayout])

    const handleMouseUp = useCallback(() => setDraggingRef(null), [])

    /* ── Zoom (wheel) + pan (middle-mouse drag) ─────────────────────────── */

    const handleWheel = useCallback((e: React.WheelEvent<SVGElement>) => {
        if (!svgRef.current) return
        const p = cursorToLayout(e)
        if (!p) return
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
        const newZoom = Math.max(0.6, Math.min(6, zoom * factor))
        // Zoom centered on cursor: keep p stable in screen space
        const rect = svgRef.current.getBoundingClientRect()
        const sx = ((e.clientX - rect.left) / rect.width) * 100
        const sy = ((e.clientY - rect.top) / rect.height) * 100
        const newPanX = sx - p.x * newZoom
        const newPanY = sy - p.y * newZoom
        setZoom(newZoom)
        setPan({ x: newPanX, y: newPanY })
    }, [zoom, cursorToLayout])

    const panStartRef = useRef<{ x: number; y: number; panStart: { x: number; y: number } } | null>(null)

    const handleSvgMouseDown = useCallback((e: React.MouseEvent<SVGElement>) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            e.preventDefault()
            panStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                panStart: { ...pan },
            }
        }
    }, [pan])

    const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGElement>) => {
        if (panStartRef.current) {
            const dx = e.clientX - panStartRef.current.x
            const dy = e.clientY - panStartRef.current.y
            const rect = svgRef.current?.getBoundingClientRect()
            if (!rect) return
            const fx = (dx / rect.width) * 100
            const fy = (dy / rect.height) * 100
            setPan({ x: panStartRef.current.panStart.x + fx, y: panStartRef.current.panStart.y + fy })
            return
        }
        handleMouseMove(e)
    }, [handleMouseMove])

    const handleSvgMouseUp = useCallback(() => {
        panStartRef.current = null
        handleMouseUp()
    }, [handleMouseUp])

    const resetView = useCallback(() => {
        setZoom(1)
        setPan({ x: 0, y: 0 })
    }, [])

    /* ── Layer visibility ──────────────────────────────────────────────── */

    const toggleLayer = useCallback((layer: LayerKey) => {
        setHiddenLayers(prev => {
            const next = new Set(prev)
            if (next.has(layer)) next.delete(layer)
            else next.add(layer)
            return next
        })
    }, [])

    const isHidden = useCallback((layer: LayerKey) => hiddenLayers.has(layer), [hiddenLayers])

    /* ── Bulk actions ──────────────────────────────────────────────────── */

    const clearLayer = useCallback((field: LayerKey) => {
        const cloned: any = { ...layout }
        if (field === "walls") cloned.walls = []
        else if (field === "regions") cloned.namedRegions = {}
        else if (Array.isArray(cloned[field])) cloned[field] = []
        else cloned[field] = { x: 50, y: 50 }
        setLayout(cloned)
    }, [layout, setLayout])

    const reversePathLayer = useCallback((field: "tToA" | "tToB" | "ctRotateA" | "ctRotateB") => {
        const current = layout[field] ?? []
        setLayout({ ...layout, [field]: [...current].reverse() })
    }, [layout, setLayout])

    const insertSiteTemplate = useCallback((site: "a" | "b") => {
        // Drop a small octagonal polygon centered on the site anchor, named "<X> site"
        const anchor = site === "a" ? layout.aSite : layout.bSite
        if (!anchor) return
        const radius = 6
        const verts: LayoutPoint[] = []
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2
            verts.push({ x: round(anchor.x + Math.cos(a) * radius), y: round(anchor.y + Math.sin(a) * radius) })
        }
        const name = `${site.toUpperCase()} site`
        setLayout({
            ...layout,
            namedRegions: { ...(layout.namedRegions ?? {}), [name]: verts },
        })
    }, [layout, setLayout])

    const copyFromOtherMap = useCallback((sourceMapId: string, fields: LayerKey[]) => {
        const source = otherLayouts?.find(m => m.mapId === sourceMapId)
        if (!source) return
        const cloned: any = { ...layout }
        for (const f of fields) {
            if (f === "walls") cloned.walls = source.walls ? [...source.walls] : []
            else if (f === "regions") cloned.namedRegions = source.namedRegions ? { ...source.namedRegions } : {}
            else (cloned as any)[f] = Array.isArray((source as any)[f]) ? [...(source as any)[f]] : (source as any)[f]
        }
        setLayout(cloned)
    }, [layout, setLayout, otherLayouts])

    /* ── Import / export buttons exposed via parent — local Import dialog ── */

    const handleImport = useCallback(() => {
        try {
            const parsed = JSON.parse(importText) as MapLayoutJson
            if (!parsed.mapId || !parsed.tSpawn) {
                window.alert("That doesn't look like a map-layout JSON — needs at minimum `mapId` and `tSpawn`.")
                return
            }
            // Replace fields but preserve mapId / displayName / radarImage of the currently-selected map.
            setLayout({
                ...layout,
                ...parsed,
                mapId: layout.mapId,
                displayName: layout.displayName,
                radarImage: layout.radarImage,
                schemaVersion: 1,
            })
            setImportDialog(false)
            setImportText("")
        } catch (err) {
            window.alert("JSON parse failed: " + (err instanceof Error ? err.message : String(err)))
        }
    }, [importText, layout, setLayout])

    /* ── Validation + derived metrics ──────────────────────────────────── */

    const findings = useMemo(() => validate(layout), [layout])
    const tToALen = useMemo(() => pathLength(layout.tToA ?? []), [layout.tToA])
    const tToBLen = useMemo(() => pathLength(layout.tToB ?? []), [layout.tToB])
    const ctSpawnToA = useMemo(() => {
        if (!layout.ctSpawn?.length || !layout.aSite) return 0
        return distance(layout.ctSpawn[0], layout.aSite)
    }, [layout.ctSpawn, layout.aSite])
    const ctSpawnToB = useMemo(() => {
        if (!layout.ctSpawn?.length || !layout.bSite) return 0
        return distance(layout.ctSpawn[0], layout.bSite)
    }, [layout.ctSpawn, layout.bSite])

    const activeTool = useMemo(() => TOOLS.find(t => t.id === tool)!, [tool])
    const transform = `translate(${pan.x} ${pan.y}) scale(${zoom})`

    /* ──────────────────────────────────────────────────────────────────── */

    return (
        <div ref={containerRef} className="flex gap-4 h-[calc(100vh-260px)] min-h-[600px]">
            {/* Left toolbar */}
            <aside className="w-60 shrink-0 space-y-3 overflow-y-auto pr-2 text-xs">
                {(["move", "measure", "spawn", "anchor", "path", "geometry"] as const).map(group => (
                    <div key={group}>
                        {group !== "move" && group !== "measure" && (
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5 mt-2">
                                {group}
                            </h4>
                        )}
                        <div className="space-y-1">
                            {TOOLS.filter(t => t.group === group).map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        setTool(t.id)
                                        setWallStart(null)
                                        setDraftRegion(null)
                                        setRulerStart(null)
                                    }}
                                    className={cn(
                                        "w-full text-left px-3 py-2 rounded-lg border font-medium transition-colors flex items-center gap-2",
                                        tool === t.id
                                            ? "bg-white/15 border-white/30 text-white"
                                            : "bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]"
                                    )}
                                    title={`${t.description}${t.hotkey ? ` (${t.hotkey})` : ""}`}
                                >
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                                    <span className="flex-1">{t.label}</span>
                                    {t.hotkey && <kbd className="text-[9px] font-mono text-white/40 bg-white/5 px-1.5 py-0.5 rounded">{t.hotkey}</kbd>}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}

                <div className="pt-3 border-t border-white/10 space-y-2">
                    {/* Snap step */}
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-widest text-white/40 w-12">Snap</span>
                        <select
                            value={snapStep}
                            onChange={e => setSnapStep(Number(e.target.value))}
                            className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[11px]"
                        >
                            <option value={0}>Off</option>
                            <option value={0.5}>0.5</option>
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={5}>5</option>
                        </select>
                    </div>

                    {/* Zoom */}
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-widest text-white/40 w-12">Zoom</span>
                        <button
                            onClick={() => setZoom(z => Math.max(0.6, z / 1.2))}
                            className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-xs"
                        >−</button>
                        <span className="font-mono text-[11px] text-white/60 w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
                        <button
                            onClick={() => setZoom(z => Math.min(6, z * 1.2))}
                            className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-xs"
                        >+</button>
                        <button
                            onClick={resetView}
                            className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[9px] uppercase tracking-wider"
                            title="Reset view"
                        >Fit</button>
                    </div>

                    {/* Preview toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showPreview}
                            onChange={e => setShowPreview(e.target.checked)}
                            className="accent-emerald-500"
                        />
                        <span className="text-[11px] text-white/70">Preview engine paths</span>
                    </label>

                    {/* Undo / redo */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => dispatch({ type: "undo" })}
                            disabled={history.past.length === 0}
                            className="flex-1 py-1.5 rounded-md bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 text-[10px] uppercase tracking-wider"
                        >
                            Undo
                            <kbd className="block text-[8px] text-white/30">⌘Z</kbd>
                        </button>
                        <button
                            onClick={() => dispatch({ type: "redo" })}
                            disabled={history.future.length === 0}
                            className="flex-1 py-1.5 rounded-md bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 text-[10px] uppercase tracking-wider"
                        >
                            Redo
                            <kbd className="block text-[8px] text-white/30">⇧⌘Z</kbd>
                        </button>
                    </div>
                </div>

                {/* Layer visibility */}
                <div className="pt-3 border-t border-white/10 space-y-1">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Layer visibility</h4>
                    {ALL_LAYER_KEYS.map(k => (
                        <label key={k} className="flex items-center gap-2 cursor-pointer text-[11px]">
                            <input
                                type="checkbox"
                                checked={!isHidden(k)}
                                onChange={() => toggleLayer(k)}
                                className="accent-white"
                            />
                            <span className={cn(isHidden(k) ? "text-white/30" : "text-white/70")}>{k}</span>
                        </label>
                    ))}
                </div>

                {/* Templates */}
                <div className="pt-3 border-t border-white/10 space-y-1">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Templates</h4>
                    <button
                        onClick={() => insertSiteTemplate("a")}
                        className="w-full py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-[10px] uppercase tracking-wider"
                    >Drop A-site polygon</button>
                    <button
                        onClick={() => insertSiteTemplate("b")}
                        className="w-full py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-[10px] uppercase tracking-wider"
                    >Drop B-site polygon</button>
                </div>

                {/* Import */}
                <div className="pt-3 border-t border-white/10">
                    <button
                        onClick={() => { setImportDialog(true); setImportText("") }}
                        className="w-full py-2 rounded-md bg-white/5 hover:bg-white/10 text-[11px] font-bold uppercase tracking-wider"
                    >Import JSON…</button>
                </div>
            </aside>

            {/* Canvas */}
            <div className="flex-1 min-w-0 relative rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={radarImagePath}
                    alt={`${layout.displayName} radar`}
                    className="absolute inset-0 w-full h-full object-contain opacity-60 pointer-events-none select-none"
                    draggable={false}
                    style={{
                        transform: `translate(${pan.x}%, ${pan.y}%) scale(${zoom})`,
                        transformOrigin: "0 0",
                    }}
                />

                <svg
                    ref={svgRef}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="xMidYMid meet"
                    className={cn(
                        "absolute inset-0 w-full h-full",
                        tool === "move" ? "cursor-grab" : "cursor-crosshair",
                    )}
                    onClick={handleCanvasClick}
                    onMouseDown={handleSvgMouseDown}
                    onMouseMove={handleSvgMouseMove}
                    onMouseUp={handleSvgMouseUp}
                    onMouseLeave={handleSvgMouseUp}
                    onDoubleClick={handleRegionDoubleClick}
                    onWheel={handleWheel}
                    onContextMenu={(e) => { if (tool === "walls" && wallStart) { e.preventDefault(); setWallStart(null) } if (tool === "regions" && draftRegion) { e.preventDefault(); setDraftRegion(null) } }}
                >
                    <g transform={transform}>
                        {/* Grid */}
                        <g opacity="0.07">
                            {Array.from({ length: 10 }, (_, i) => (i + 1) * 10).map(v => (
                                <g key={v}>
                                    <line x1={v} y1={0} x2={v} y2={100} stroke="white" strokeWidth="0.08" />
                                    <line x1={0} y1={v} x2={100} y2={v} stroke="white" strokeWidth="0.08" />
                                </g>
                            ))}
                        </g>

                        {/* Walls */}
                        {!isHidden("walls") && (layout.walls ?? []).map((w, i) => (
                            <g key={`wall-${i}`}>
                                <line x1={w.from.x} y1={w.from.y} x2={w.to.x} y2={w.to.y} stroke="#fafafa" strokeWidth="0.5" opacity="0.7" />
                                <Handle
                                    cx={w.from.x} cy={w.from.y} color="#fafafa" radius={0.7} label=""
                                    onMouseDown={onHandleMouseDown("walls", i, "wallEndpoint", 0)}
                                    onContextMenu={onHandleRightClick("walls", i)}
                                />
                                <Handle
                                    cx={w.to.x} cy={w.to.y} color="#fafafa" radius={0.7} label=""
                                    onMouseDown={onHandleMouseDown("walls", i, "wallEndpoint", 1)}
                                    onContextMenu={onHandleRightClick("walls", i)}
                                />
                            </g>
                        ))}

                        {wallStart && hoverPoint && tool === "walls" && (
                            <line x1={wallStart.x} y1={wallStart.y} x2={hoverPoint.x} y2={hoverPoint.y} stroke="#fafafa" strokeWidth="0.4" strokeDasharray="0.6 0.4" opacity="0.5" />
                        )}

                        {/* Named regions */}
                        {!isHidden("regions") && Object.entries(layout.namedRegions ?? {}).map(([name, polyUnknown], rIdx) => {
                            const poly = polyUnknown as LayoutPolygon
                            const c = centroid(poly)
                            return (
                                <g key={`region-${rIdx}`}>
                                    <polygon
                                        points={poly.map(p => `${p.x},${p.y}`).join(" ")}
                                        fill="#34d399"
                                        fillOpacity="0.10"
                                        stroke="#34d399"
                                        strokeWidth="0.3"
                                        strokeOpacity="0.6"
                                    />
                                    {poly.map((v, vi) => (
                                        <Handle
                                            key={`rv-${rIdx}-${vi}`}
                                            cx={v.x} cy={v.y} color="#34d399" radius={0.55} label=""
                                            onMouseDown={onHandleMouseDown("regions", rIdx, "regionVertex", vi)}
                                        />
                                    ))}
                                    <text
                                        x={c.x} y={c.y}
                                        fontSize="2.4" fill="#34d399" fontWeight="bold" textAnchor="middle"
                                        onContextMenu={onHandleRightClick("regions", rIdx)}
                                        style={{ pointerEvents: "all", cursor: "crosshair" }}
                                    >
                                        {name}
                                    </text>
                                </g>
                            )
                        })}

                        {draftRegion && draftRegion.length > 0 && (
                            <g>
                                <polyline
                                    points={[...draftRegion, ...(hoverPoint ? [hoverPoint] : [])].map(p => `${p.x},${p.y}`).join(" ")}
                                    fill="none" stroke="#34d399" strokeWidth="0.3" strokeDasharray="0.5 0.3" opacity="0.8"
                                />
                                {draftRegion.map((p, i) => (
                                    <circle key={i} cx={p.x} cy={p.y} r="0.6" fill="#34d399" />
                                ))}
                            </g>
                        )}

                        {/* Paths */}
                        {(["tToA", "tToB", "ctRotateA", "ctRotateB"] as const).map(field => {
                            if (isHidden(field)) return null
                            const path = layout[field]
                            if (!path || path.length === 0) return null
                            const tColor = TOOLS.find(t => t.id === field)!.color
                            return (
                                <g key={field}>
                                    <polyline
                                        points={path.map(p => `${p.x},${p.y}`).join(" ")}
                                        fill="none"
                                        stroke={tColor}
                                        strokeWidth="0.35"
                                        strokeOpacity={tool === field ? 0.95 : 0.45}
                                        strokeDasharray={field.startsWith("ct") ? "0.8 0.4" : undefined}
                                    />
                                    {path.map((p, i) => (
                                        <Handle
                                            key={`${field}-${i}`}
                                            cx={p.x} cy={p.y} color={tColor}
                                            radius={tool === field ? 1.1 : 0.7}
                                            label={String(i + 1)}
                                            onMouseDown={onHandleMouseDown(field, i)}
                                            onContextMenu={onHandleRightClick(field, i)}
                                        />
                                    ))}
                                </g>
                            )
                        })}

                        {/* Spawn / hold clusters */}
                        {(["ctSpawn", "tSpawn", "ctHolds"] as const).map(field => {
                            if (isHidden(field)) return null
                            const points = layout[field] ?? []
                            const tColor = TOOLS.find(t => t.id === field)!.color
                            return (
                                <g key={field}>
                                    {points.map((p, i) => (
                                        <Handle
                                            key={`${field}-${i}`}
                                            cx={p.x} cy={p.y} color={tColor}
                                            radius={tool === field ? 1.4 : 1}
                                            label={field === "ctHolds" ? `H${i + 1}` : String(i + 1)}
                                            onMouseDown={onHandleMouseDown(field, i)}
                                            onContextMenu={onHandleRightClick(field, i)}
                                        />
                                    ))}
                                </g>
                            )
                        })}

                        {/* Anchors */}
                        {(["aSite", "bSite", "mid", "engageA", "engageB"] as const).map(field => {
                            if (isHidden(field)) return null
                            const p = layout[field]
                            if (!p) return null
                            const tColor = TOOLS.find(t => t.id === field)!.color
                            const label = field === "aSite" ? "A" : field === "bSite" ? "B" : field === "mid" ? "MID" : field === "engageA" ? "eA" : "eB"
                            return (
                                <Handle
                                    key={field}
                                    cx={p.x} cy={p.y} color={tColor}
                                    radius={tool === field ? 2 : 1.5}
                                    label={label}
                                    onMouseDown={onHandleMouseDown(field)}
                                />
                            )
                        })}

                        {/* Ruler */}
                        {tool === "ruler" && rulerStart && hoverPoint && (
                            <g>
                                <line x1={rulerStart.x} y1={rulerStart.y} x2={hoverPoint.x} y2={hoverPoint.y} stroke="#fde68a" strokeWidth="0.4" strokeDasharray="0.4 0.4" />
                                <circle cx={rulerStart.x} cy={rulerStart.y} r="0.8" fill="#fde68a" />
                                <circle cx={hoverPoint.x} cy={hoverPoint.y} r="0.8" fill="#fde68a" />
                                <text
                                    x={(rulerStart.x + hoverPoint.x) / 2}
                                    y={(rulerStart.y + hoverPoint.y) / 2 - 1.5}
                                    fontSize="2.5" fill="#fde68a" fontWeight="bold" textAnchor="middle"
                                >
                                    {distance(rulerStart, hoverPoint).toFixed(1)}
                                </text>
                            </g>
                        )}

                        {/* Preview overlay — show the implied attack & rotation routes thicker */}
                        {showPreview && (
                            <g opacity={0.4} pointerEvents="none">
                                {layout.tToA && layout.tToA.length > 1 && (
                                    <polyline points={layout.tToA.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="1.4" />
                                )}
                                {layout.tToB && layout.tToB.length > 1 && (
                                    <polyline points={layout.tToB.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="1.4" />
                                )}
                            </g>
                        )}

                        {/* Cursor crosshair */}
                        {hoverPoint && tool !== "move" && (
                            <g pointerEvents="none">
                                <line x1={hoverPoint.x} y1={0} x2={hoverPoint.x} y2={100} stroke={activeTool.color} strokeOpacity={0.3} strokeWidth="0.1" />
                                <line x1={0} y1={hoverPoint.y} x2={100} y2={hoverPoint.y} stroke={activeTool.color} strokeOpacity={0.3} strokeWidth="0.1" />
                            </g>
                        )}
                    </g>
                </svg>

                {/* HUD readout */}
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none text-[10px] font-mono">
                    <div className="px-2 py-1 rounded-md bg-black/60 text-white/70 backdrop-blur-md">
                        {hoverPoint
                            ? `x ${hoverPoint.x.toFixed(1)}  y ${hoverPoint.y.toFixed(1)}${snapStep > 0 ? `  (snap ${snapStep})` : ""}`
                            : "—"}
                    </div>
                    <div className="px-2 py-1 rounded-md bg-black/60 text-white/40 backdrop-blur-md">
                        Tool: <span className="text-white/80">{activeTool.label}</span>
                        {tool === "walls" && wallStart && <span className="text-emerald-400 ml-2">place endpoint</span>}
                        {tool === "regions" && draftRegion && <span className="text-emerald-400 ml-2">{draftRegion.length} vertices — dbl-click to close</span>}
                        <span className="text-white/30 ml-3">ESC clear · ⌥-drag pan · wheel zoom</span>
                    </div>
                </div>
            </div>

            {/* Right inspector */}
            <aside className="w-72 shrink-0 space-y-3 overflow-y-auto text-xs">
                {/* Validation */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Validation</h4>
                    {findings.length === 0 ? (
                        <p className="text-[11px] text-emerald-400 font-bold">All checks pass.</p>
                    ) : (
                        <ul className="space-y-1.5">
                            {findings.map((f, i) => (
                                <li key={i} className={cn(
                                    "text-[11px] leading-snug pl-3 border-l-2",
                                    f.level === "error" ? "border-red-500 text-red-300" : "border-amber-500 text-amber-300",
                                )}>
                                    {f.message}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Metrics */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-1">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Metrics</h4>
                    <Metric label="T → A path length" value={tToALen.toFixed(1)} />
                    <Metric label="T → B path length" value={tToBLen.toFixed(1)} />
                    <Metric label="CT spawn → A" value={ctSpawnToA.toFixed(1)} />
                    <Metric label="CT spawn → B" value={ctSpawnToB.toFixed(1)} />
                    <Metric label="Walls" value={String(layout.walls?.length ?? 0)} />
                    <Metric label="Named regions" value={String(Object.keys(layout.namedRegions ?? {}).length)} />
                </div>

                {/* Bulk actions */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40">Quick actions</h4>
                    <div className="flex flex-wrap gap-1">
                        {(["tToA", "tToB", "ctRotateA", "ctRotateB"] as const).map(f => (
                            <button
                                key={`rev-${f}`}
                                onClick={() => reversePathLayer(f)}
                                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[10px]"
                            >Reverse {f}</button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {(["walls", "regions"] as const).map(f => (
                            <button
                                key={`clr-${f}`}
                                onClick={() => clearLayer(f)}
                                className="px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-300 text-[10px]"
                            >Clear {f}</button>
                        ))}
                    </div>
                </div>

                {/* Copy from other map */}
                {otherLayouts && otherLayouts.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40">Copy from other map</h4>
                        <CopyFromOtherPanel
                            otherLayouts={otherLayouts.filter(m => m.mapId !== layout.mapId)}
                            onCopy={copyFromOtherMap}
                        />
                    </div>
                )}
            </aside>

            {/* Import dialog */}
            {importDialog && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="bg-[#0a0c10] border border-white/10 rounded-2xl p-6 w-full max-w-2xl space-y-3">
                        <h3 className="text-lg font-bold uppercase tracking-tight">Import JSON</h3>
                        <p className="text-xs text-white/40">Paste a full <code className="text-white/70">map-layout</code> JSON below. The current map&apos;s <code>mapId</code>, <code>displayName</code>, and <code>radarImage</code> will be preserved.</p>
                        <textarea
                            value={importText}
                            onChange={e => setImportText(e.target.value)}
                            placeholder="Paste JSON here…"
                            className="w-full h-72 font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-3 resize-none"
                            spellCheck={false}
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setImportDialog(false)}
                                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-wider"
                            >Cancel</button>
                            <button
                                onClick={handleImport}
                                className="px-4 py-2 rounded-lg bg-white text-black hover:bg-white/90 text-xs font-bold uppercase tracking-wider"
                            >Import</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

/* ──────────────────────────────────────────────────────────────────────── */

function Handle(props: {
    cx: number
    cy: number
    color: string
    radius: number
    label: string
    onMouseDown: (e: React.MouseEvent) => void
    onContextMenu?: (e: React.MouseEvent) => void
}) {
    const { cx, cy, color, radius, label, onMouseDown, onContextMenu } = props
    return (
        <g style={{ cursor: "grab" }}>
            <circle
                cx={cx} cy={cy} r={radius}
                fill={color} fillOpacity={0.35}
                stroke={color} strokeWidth={0.25}
                onMouseDown={onMouseDown}
                onContextMenu={onContextMenu}
                style={{ pointerEvents: "all" }}
            />
            {label && (
                <text
                    x={cx} y={cy + radius + 1.6}
                    fontSize="1.6" fill={color} fillOpacity="0.85"
                    textAnchor="middle" pointerEvents="none"
                    fontFamily="ui-monospace, monospace"
                >
                    {label}
                </text>
            )}
        </g>
    )
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between text-[11px]">
            <span className="text-white/50">{label}</span>
            <span className="font-mono text-white/80">{value}</span>
        </div>
    )
}

function CopyFromOtherPanel({ otherLayouts, onCopy }: { otherLayouts: MapLayoutJson[]; onCopy: (mapId: string, fields: LayerKey[]) => void }) {
    const [src, setSrc] = useState(otherLayouts[0]?.mapId ?? "")
    const [fields, setFields] = useState<Set<LayerKey>>(new Set())

    const toggle = (f: LayerKey) => {
        setFields(prev => {
            const next = new Set(prev)
            if (next.has(f)) next.delete(f)
            else next.add(f)
            return next
        })
    }

    return (
        <div className="space-y-2">
            <select
                value={src}
                onChange={e => setSrc(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[11px]"
            >
                {otherLayouts.map(m => (
                    <option key={m.mapId} value={m.mapId}>{m.displayName}</option>
                ))}
            </select>
            <div className="grid grid-cols-2 gap-1">
                {ALL_LAYER_KEYS.map(k => (
                    <label key={k} className="flex items-center gap-1 text-[10px] cursor-pointer">
                        <input type="checkbox" checked={fields.has(k)} onChange={() => toggle(k)} className="accent-white" />
                        <span>{k}</span>
                    </label>
                ))}
            </div>
            <button
                onClick={() => onCopy(src, Array.from(fields))}
                disabled={fields.size === 0}
                className="w-full py-1.5 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-30 text-[10px] font-bold uppercase tracking-wider"
            >Copy selected →</button>
        </div>
    )
}
