"use client"

import React, { useCallback, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { LayoutPoint, MapLayoutJson, LayoutPolygon, LayoutWall } from "@/data/map-layouts/types"

/* ────────────────────────────────────────────────────────────────────────────
 * Schema for the in-progress edit. Mirrors MapLayoutJson plus a few editor-
 * only fields (active tool, dirty flag) that don't get exported.
 * ────────────────────────────────────────────────────────────────────────── */

export type Tool =
    | "ctSpawn" | "tSpawn" | "ctHolds"
    | "aSite" | "bSite" | "mid"
    | "engageA" | "engageB"
    | "tToA" | "tToB" | "ctRotateA" | "ctRotateB"
    | "walls" | "regions"
    | "move"

const TOOLS: Array<{
    id: Tool
    label: string
    group: "spawn" | "anchor" | "path" | "geometry" | "move"
    color: string
    description: string
}> = [
    { id: "move", label: "Select / Move", group: "move", color: "#94a3b8", description: "Drag handles. Right-click a handle to delete." },

    { id: "ctSpawn", label: "CT Spawn (5)", group: "spawn", color: "#60a5fa", description: "5 CT spawn cluster points." },
    { id: "tSpawn", label: "T Spawn (5)", group: "spawn", color: "#f59e0b", description: "5 T spawn cluster points." },
    { id: "ctHolds", label: "CT Holds (5)", group: "spawn", color: "#38bdf8", description: "Per-CT-player default hold position." },

    { id: "aSite", label: "A Site (1)", group: "anchor", color: "#ef4444", description: "A bomb-plant anchor." },
    { id: "bSite", label: "B Site (1)", group: "anchor", color: "#ef4444", description: "B bomb-plant anchor." },
    { id: "mid", label: "Mid (1)", group: "anchor", color: "#a78bfa", description: "Center / mid anchor." },
    { id: "engageA", label: "Engage A (1)", group: "anchor", color: "#fb923c", description: "First-contact zone near A approach." },
    { id: "engageB", label: "Engage B (1)", group: "anchor", color: "#fb923c", description: "First-contact zone near B approach." },

    { id: "tToA", label: "T → A path", group: "path", color: "#f59e0b", description: "Ordered waypoints from T spawn to A site." },
    { id: "tToB", label: "T → B path", group: "path", color: "#f59e0b", description: "Ordered waypoints from T spawn to B site." },
    { id: "ctRotateA", label: "CT rotate → A", group: "path", color: "#60a5fa", description: "Waypoints for CTs rotating to A." },
    { id: "ctRotateB", label: "CT rotate → B", group: "path", color: "#60a5fa", description: "Waypoints for CTs rotating to B." },

    { id: "walls", label: "Walls (segments)", group: "geometry", color: "#fafafa", description: "Click two points per segment. Walls block kill-line plausibility." },
    { id: "regions", label: "Named regions", group: "geometry", color: "#34d399", description: "Click vertices, double-click to close. Name the region when prompted." },
]

interface Props {
    initial: MapLayoutJson
    radarImagePath: string
    onChange: (next: MapLayoutJson) => void
}

export function MapBuilderCanvas({ initial, radarImagePath, onChange }: Props) {
    const [layout, setLayout] = useState<MapLayoutJson>(initial)
    const [tool, setTool] = useState<Tool>("move")
    const [hoverPoint, setHoverPoint] = useState<LayoutPoint | null>(null)
    const [wallStart, setWallStart] = useState<LayoutPoint | null>(null)
    const [draftRegion, setDraftRegion] = useState<LayoutPoint[] | null>(null)
    const [draggingRef, setDraggingRef] = useState<{ field: string; index?: number; subIndex?: number } | null>(null)

    const svgRef = useRef<SVGSVGElement | null>(null)

    /* ────────────────────────────────────────────────────────────────────── */

    const updateLayout = useCallback((next: MapLayoutJson) => {
        setLayout(next)
        onChange(next)
    }, [onChange])

    const cursorToLayout = useCallback((evt: React.MouseEvent<SVGElement>): LayoutPoint | null => {
        const svg = svgRef.current
        if (!svg) return null
        const rect = svg.getBoundingClientRect()
        const x = ((evt.clientX - rect.left) / rect.width) * 100
        const y = ((evt.clientY - rect.top) / rect.height) * 100
        return { x: round(x), y: round(y) }
    }, [])

    /* ── Add / replace handlers per tool ──────────────────────────────────── */

    const handleCanvasClick = useCallback((evt: React.MouseEvent<SVGElement>) => {
        if (tool === "move") return
        const p = cursorToLayout(evt)
        if (!p) return
        if (draggingRef) return

        if (tool === "walls") {
            if (!wallStart) {
                setWallStart(p)
                return
            }
            const wall: LayoutWall = { from: wallStart, to: p }
            updateLayout({ ...layout, walls: [...(layout.walls ?? []), wall] })
            setWallStart(null)
            return
        }

        if (tool === "regions") {
            const next = [...(draftRegion ?? []), p]
            setDraftRegion(next)
            return
        }

        if (tool === "ctSpawn" || tool === "tSpawn" || tool === "ctHolds") {
            // Replace the cluster index by clicking — append until 5, then wrap.
            const current = layout[tool]
            if (current.length < 5) {
                updateLayout({ ...layout, [tool]: [...current, p] })
            } else {
                // Snap to the nearest existing point and replace it.
                const idx = nearestIndex(current, p)
                const next = current.map((q, i) => (i === idx ? p : q))
                updateLayout({ ...layout, [tool]: next })
            }
            return
        }

        if (tool === "aSite" || tool === "bSite" || tool === "mid" || tool === "engageA" || tool === "engageB") {
            updateLayout({ ...layout, [tool]: p })
            return
        }

        if (tool === "tToA" || tool === "tToB" || tool === "ctRotateA" || tool === "ctRotateB") {
            updateLayout({ ...layout, [tool]: [...layout[tool], p] })
            return
        }
    }, [tool, cursorToLayout, layout, wallStart, draftRegion, updateLayout, draggingRef])

    const handleRegionDoubleClick = useCallback(() => {
        if (tool !== "regions" || !draftRegion || draftRegion.length < 3) return
        const name = window.prompt("Name this region (e.g. 'A site', 'Banana', 'Mid')", "Region")
        if (!name) {
            setDraftRegion(null)
            return
        }
        const polygon: LayoutPolygon = draftRegion
        const next: MapLayoutJson = {
            ...layout,
            namedRegions: { ...(layout.namedRegions ?? {}), [name]: polygon },
        }
        updateLayout(next)
        setDraftRegion(null)
    }, [tool, draftRegion, layout, updateLayout])

    /* ── Drag handles ──────────────────────────────────────────────────────── */

    const onHandleMouseDown = useCallback((field: string, index?: number, subIndex?: number) => (e: React.MouseEvent) => {
        if (e.button !== 0) return
        e.stopPropagation()
        setDraggingRef({ field, index, subIndex })
    }, [])

    const onHandleRightClick = useCallback((field: string, index?: number, subIndex?: number) => (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        // Remove the point.
        const cloned: any = { ...layout }
        if (subIndex !== undefined && field === "walls") {
            // Remove a single wall entirely (subIndex unused; field-level)
            cloned.walls = (cloned.walls ?? []).filter((_: any, i: number) => i !== index)
        } else if (subIndex !== undefined && field === "regions") {
            // Remove a region by its key (index is the regionKey position)
            const keys = Object.keys(cloned.namedRegions ?? {})
            const key = keys[index ?? -1]
            if (key) {
                const next = { ...cloned.namedRegions }
                delete next[key]
                cloned.namedRegions = next
            }
        } else if (index !== undefined && Array.isArray(cloned[field])) {
            cloned[field] = cloned[field].filter((_: any, i: number) => i !== index)
        }
        updateLayout(cloned)
    }, [layout, updateLayout])

    const handleMouseMove = useCallback((e: React.MouseEvent<SVGElement>) => {
        const p = cursorToLayout(e)
        if (!p) return
        setHoverPoint(p)
        if (!draggingRef) return
        const cloned: any = { ...layout }
        const { field, index } = draggingRef
        if (index !== undefined && Array.isArray(cloned[field])) {
            cloned[field] = cloned[field].map((q: LayoutPoint, i: number) => (i === index ? p : q))
        } else if (index === undefined) {
            cloned[field] = p
        }
        updateLayout(cloned)
    }, [cursorToLayout, draggingRef, layout, updateLayout])

    const handleMouseUp = useCallback(() => {
        setDraggingRef(null)
    }, [])

    /* ── Render layers ─────────────────────────────────────────────────────── */

    const activeColor = useMemo(() => TOOLS.find(t => t.id === tool)?.color ?? "#fff", [tool])

    return (
        <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[600px]">
            {/* Toolbar */}
            <aside className="w-60 shrink-0 space-y-3 overflow-y-auto pr-2">
                {(["move", "spawn", "anchor", "path", "geometry"] as const).map(group => (
                    <div key={group}>
                        {group !== "move" && (
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
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
                                    }}
                                    className={cn(
                                        "w-full text-left px-3 py-2 rounded-lg border text-xs font-medium transition-colors flex items-center gap-2",
                                        tool === t.id
                                            ? "bg-white/15 border-white/30 text-white"
                                            : "bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]"
                                    )}
                                    title={t.description}
                                >
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}

                <div className="pt-2 border-t border-white/10 text-[10px] text-white/40 leading-relaxed space-y-1">
                    <p>{TOOLS.find(t => t.id === tool)?.description}</p>
                    {tool === "regions" && draftRegion && (
                        <p className="text-emerald-400">
                            {draftRegion.length} vertices · double-click canvas to close.
                        </p>
                    )}
                    {tool === "walls" && wallStart && (
                        <p className="text-emerald-400">Click the second endpoint.</p>
                    )}
                    {hoverPoint && (
                        <p className="font-mono text-white/30">
                            x: {hoverPoint.x.toFixed(1)} · y: {hoverPoint.y.toFixed(1)}
                        </p>
                    )}
                </div>
            </aside>

            {/* Canvas */}
            <div className="flex-1 min-w-0 relative rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                {/* Radar image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={radarImagePath}
                    alt={`${layout.displayName} radar`}
                    className="absolute inset-0 w-full h-full object-contain opacity-60 pointer-events-none select-none"
                    draggable={false}
                />

                <svg
                    ref={svgRef}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="xMidYMid meet"
                    className="absolute inset-0 w-full h-full cursor-crosshair"
                    onClick={handleCanvasClick}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onDoubleClick={handleRegionDoubleClick}
                >
                    {/* Light grid for orientation */}
                    <g opacity="0.07">
                        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(v => (
                            <React.Fragment key={v}>
                                <line x1={v} y1={0} x2={v} y2={100} stroke="white" strokeWidth="0.1" />
                                <line x1={0} y1={v} x2={100} y2={v} stroke="white" strokeWidth="0.1" />
                            </React.Fragment>
                        ))}
                    </g>

                    {/* Walls */}
                    {(layout.walls ?? []).map((w, i) => (
                        <g key={`wall-${i}`}>
                            <line x1={w.from.x} y1={w.from.y} x2={w.to.x} y2={w.to.y} stroke="#fafafa" strokeWidth="0.6" opacity="0.7" />
                            <circle cx={w.from.x} cy={w.from.y} r="0.5" fill="#fafafa" />
                            <circle cx={w.to.x} cy={w.to.y} r="0.5" fill="#fafafa" />
                            <rect
                                x={(w.from.x + w.to.x) / 2 - 1}
                                y={(w.from.y + w.to.y) / 2 - 1}
                                width={2}
                                height={2}
                                fill="rgba(0,0,0,0)"
                                onContextMenu={onHandleRightClick("walls", i, 0)}
                                style={{ pointerEvents: "all", cursor: "crosshair" }}
                            />
                        </g>
                    ))}

                    {/* Wall draft */}
                    {wallStart && hoverPoint && tool === "walls" && (
                        <line x1={wallStart.x} y1={wallStart.y} x2={hoverPoint.x} y2={hoverPoint.y} stroke="#fafafa" strokeWidth="0.4" strokeDasharray="0.6 0.4" opacity="0.5" />
                    )}

                    {/* Named regions */}
                    {Object.entries(layout.namedRegions ?? {}).map(([name, polyUnknown], rIdx) => {
                        const poly = polyUnknown as LayoutPolygon
                        return (
                            <g key={`region-${rIdx}`}>
                                <polygon
                                    points={poly.map((p: LayoutPoint) => `${p.x},${p.y}`).join(" ")}
                                    fill="#34d399"
                                    fillOpacity="0.10"
                                    stroke="#34d399"
                                    strokeWidth="0.3"
                                    strokeOpacity="0.6"
                                />
                                <text
                                    x={centroid(poly).x}
                                    y={centroid(poly).y}
                                    fontSize="2.4"
                                    fill="#34d399"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                    onContextMenu={onHandleRightClick("regions", rIdx, 0)}
                                    style={{ pointerEvents: "all", cursor: "crosshair" }}
                                >
                                    {name}
                                </text>
                            </g>
                        )
                    })}

                    {/* Draft region */}
                    {draftRegion && draftRegion.length > 0 && (
                        <g>
                            <polyline
                                points={[...draftRegion, ...(hoverPoint ? [hoverPoint] : [])].map(p => `${p.x},${p.y}`).join(" ")}
                                fill="none"
                                stroke="#34d399"
                                strokeWidth="0.3"
                                strokeDasharray="0.5 0.3"
                                opacity="0.8"
                            />
                            {draftRegion.map((p, i) => (
                                <circle key={i} cx={p.x} cy={p.y} r="0.6" fill="#34d399" />
                            ))}
                        </g>
                    )}

                    {/* Paths */}
                    {(["tToA", "tToB", "ctRotateA", "ctRotateB"] as const).map(field => {
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
                                        cx={p.x}
                                        cy={p.y}
                                        color={tColor}
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
                        const points = layout[field] ?? []
                        const tColor = TOOLS.find(t => t.id === field)!.color
                        return (
                            <g key={field}>
                                {points.map((p, i) => (
                                    <Handle
                                        key={`${field}-${i}`}
                                        cx={p.x}
                                        cy={p.y}
                                        color={tColor}
                                        radius={tool === field ? 1.4 : 1}
                                        label={field === "ctHolds" ? `H${i + 1}` : String(i + 1)}
                                        onMouseDown={onHandleMouseDown(field, i)}
                                        onContextMenu={onHandleRightClick(field, i)}
                                    />
                                ))}
                            </g>
                        )
                    })}

                    {/* Single anchors */}
                    {(["aSite", "bSite", "mid", "engageA", "engageB"] as const).map(field => {
                        const p = layout[field]
                        if (!p) return null
                        const tColor = TOOLS.find(t => t.id === field)!.color
                        const label = field === "aSite" ? "A" : field === "bSite" ? "B" : field === "mid" ? "MID" : field === "engageA" ? "eA" : "eB"
                        return (
                            <Handle
                                key={field}
                                cx={p.x}
                                cy={p.y}
                                color={tColor}
                                radius={tool === field ? 2 : 1.5}
                                label={label}
                                onMouseDown={onHandleMouseDown(field)}
                            />
                        )
                    })}

                    {/* Cursor crosshair */}
                    {hoverPoint && tool !== "move" && (
                        <g pointerEvents="none">
                            <line x1={hoverPoint.x} y1={0} x2={hoverPoint.x} y2={100} stroke={activeColor} strokeOpacity={0.3} strokeWidth="0.1" />
                            <line x1={0} y1={hoverPoint.y} x2={100} y2={hoverPoint.y} stroke={activeColor} strokeOpacity={0.3} strokeWidth="0.1" />
                        </g>
                    )}
                </svg>
            </div>
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────────── */

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
                cx={cx}
                cy={cy}
                r={radius}
                fill={color}
                fillOpacity={0.35}
                stroke={color}
                strokeWidth={0.25}
                onMouseDown={onMouseDown}
                onContextMenu={onContextMenu}
                style={{ pointerEvents: "all" }}
            />
            <text
                x={cx}
                y={cy + radius + 1.6}
                fontSize="1.6"
                fill={color}
                fillOpacity="0.85"
                textAnchor="middle"
                pointerEvents="none"
                fontFamily="ui-monospace, monospace"
            >
                {label}
            </text>
        </g>
    )
}

function round(n: number): number {
    return Math.round(n * 100) / 100
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
