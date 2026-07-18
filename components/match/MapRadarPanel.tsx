"use client"

import { useState, useEffect, useMemo, memo } from "react"
import { MapId } from "@/types"
import { cn } from "@/lib/utils"
import { Map, ChevronUp } from "lucide-react"
import Image from "next/image"
import dynamic from "next/dynamic"
import { motion, AnimatePresence } from "framer-motion"
import type { RadarPlayerDot, RadarBombState, RadarKillLine, RadarSmoke } from "@/lib/radar-position-engine"
import type { Point } from "@/lib/map-radar-data"
import { resolveAutoRadarLevel } from "@/lib/radar-level-selector"

// True-3D renderer is dynamically imported (ssr:false) so three.js / R3F only
// load when the player actually switches to the 3D view — never in the main bundle.
const MapRadar3D = dynamic(() => import("./MapRadar3D"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full grid place-items-center text-[10px] font-bold tracking-widest uppercase text-white/30">
            Loading 3D…
        </div>
    ),
})

function isFiniteCoord(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value)
}

function clampRadarCoord(value: number, min = 0, max = 100): number {
    return Math.max(min, Math.min(max, value))
}

function shortRadarName(name: string): string {
    const safe = (name || "PLAYER").toUpperCase()
    return safe.length <= 6 ? safe : safe.slice(0, 6)
}

const MAP_RADAR_IMAGES: Record<string, { primary: string; secondary?: string }> = {
    [MapId.SANDSTONE]:    { primary: "/maps/de_sandstone_radar_psd.png" },
    [MapId.MIRAGE]:   { primary: "/maps/de_mirage_radar_psd.png" },
    [MapId.INFERNO]:  { primary: "/maps/de_inferno_radar_psd.png" },
    [MapId.NUKE]:     { primary: "/maps/de_nuke_radar_psd_1.png", secondary: "/maps/de_nuke_lower_radar_psd_2.png" },
    [MapId.OVERPASS]: { primary: "/maps/de_overpass_radar_psd.png" },
    [MapId.VERTIGO]:  { primary: "/maps/de_vertigo_radar_psd_1.png", secondary: "/maps/de_vertigo_lower_radar_psd_2.png" },
    [MapId.ANCIENT]:  { primary: "/maps/de_ancient_radar_psd.png" },
    [MapId.ANUBIS]:   { primary: "/maps/de_anubis_radar_psd.png" },
}

interface MapRadarPanelProps {
    currentMapId: MapId
    mapName: string
    radarDots?: RadarPlayerDot[]
    bombState?: RadarBombState
    currentTime?: number
    killLines?: RadarKillLine[]
    sitePositions?: { a: Point; b: Point }
    smokes?: RadarSmoke[]
}

function MapRadarPanelComponent({ currentMapId, mapName, radarDots, bombState, currentTime, killLines, sitePositions, smokes }: MapRadarPanelProps) {
    const [isExpanded, setIsExpanded] = useState(true)
    const [radarLevelMode, setRadarLevelMode] = useState<"auto" | "manual">("auto")
    const [manualRadarLevel, setManualRadarLevel] = useState<"upper" | "lower">("upper")
    // Radar view mode: flat top-down, CSS 2.5D tilt, or true 3D (WebGL).
    // 2.5D tips the ground plane back with players as billboarded tokens; 3D
    // swaps in an orbitable three.js scene (dynamically imported).
    const [view, setView] = useState<"flat" | "tilt" | "3d">("tilt")
    const tilt = view === "tilt"
    const is3D = view === "3d"
    const TILT_DEG = 49

    const radarImageData = MAP_RADAR_IMAGES[currentMapId]
    const isDualLevel = !!radarImageData?.secondary

    useEffect(() => {
        setManualRadarLevel("upper")
        setRadarLevelMode("auto")
    }, [currentMapId])

    const resolvedRadarLevel = useMemo(() => (
        radarLevelMode === "manual"
            ? manualRadarLevel
            : resolveAutoRadarLevel({
                isDualLevel,
                currentLevel: manualRadarLevel,
                currentTime,
                bombState,
                killLines,
                radarDots,
            })
    ), [radarLevelMode, manualRadarLevel, isDualLevel, currentTime, bombState, killLines, radarDots])

    const radarSrc = radarImageData && resolvedRadarLevel === "lower" && radarImageData.secondary
        ? radarImageData.secondary
        : radarImageData?.primary

    const DOT_EDGE_PADDING = 2.1

    const safeDots = useMemo(() => (radarDots || [])
        .filter(dot => isFiniteCoord(dot.x) && isFiniteCoord(dot.y) && isFiniteCoord(dot.angle))
        .map(dot => ({
            ...dot,
            x: clampRadarCoord(dot.x, DOT_EDGE_PADDING, 100 - DOT_EDGE_PADDING),
            y: clampRadarCoord(dot.y, DOT_EDGE_PADDING, 100 - DOT_EDGE_PADDING),
            angle: dot.angle,
        })), [radarDots])

    // Filter dots by level for dual-level maps
    const visibleDots = useMemo(() => safeDots.filter(dot => {
        if (!isDualLevel || !dot.level) return true
        return dot.level === resolvedRadarLevel
    }), [safeDots, isDualLevel, resolvedRadarLevel])

    const visibleKillLines = useMemo(() => (killLines || [])
        .filter(line => (
            isFiniteCoord(line.fromX)
            && isFiniteCoord(line.fromY)
            && isFiniteCoord(line.toX)
            && isFiniteCoord(line.toY)
            && isFiniteCoord(line.time)
        ))
        .map(line => ({
            ...line,
            fromX: clampRadarCoord(line.fromX),
            fromY: clampRadarCoord(line.fromY),
            toX: clampRadarCoord(line.toX),
            toY: clampRadarCoord(line.toY),
            time: line.time,
        }))
        .filter(line => {
            if (!isDualLevel) return true
            if (!line.level) return true
            return line.level === resolvedRadarLevel
        }), [killLines, isDualLevel, resolvedRadarLevel])

    const visibleSmokes = useMemo(() => (smokes || [])
        .filter(smoke => (
            isFiniteCoord(smoke.x)
            && isFiniteCoord(smoke.y)
            && isFiniteCoord(smoke.radius)
            && isFiniteCoord(smoke.startTime)
            && isFiniteCoord(smoke.endTime)
        ))
        .map(smoke => ({
            ...smoke,
            x: clampRadarCoord(smoke.x),
            y: clampRadarCoord(smoke.y),
            radius: Math.max(0, smoke.radius),
            level: smoke.level,
        }))
        .filter(smoke => {
            if (!isDualLevel) return true
            if (!smoke.level) return true
            return smoke.level === resolvedRadarLevel
        }), [smokes, isDualLevel, resolvedRadarLevel])

    // Pre-compute current opacity per kill line. Same motivation as
    // smokeRenderState: the inline branch ran per kill line per frame
    // and a busy fight-round can drop 4-6 kill lines simultaneously.
    const killLineRenderState = useMemo(() => {
        if (currentTime == null) return [] as Array<{ line: typeof visibleKillLines[number]; fadeOpacity: number }>
        return visibleKillLines
            .map(line => {
                const elapsed = currentTime - line.time
                const fadeOpacity = Math.max(0, 1 - elapsed / 2)
                return fadeOpacity > 0 ? { line, fadeOpacity } : null
            })
            .filter(Boolean) as Array<{ line: typeof visibleKillLines[number]; fadeOpacity: number }>
    }, [visibleKillLines, currentTime])

    // Pre-compute current opacity per smoke so the JSX map is a flat
    // value-pass instead of repeating the fade-in/hold/fade-out branch
    // per frame per smoke. Was doing 3-7 visible smokes × per-tick math
    // inside the render loop.
    const smokeRenderState = useMemo(() => {
        if (currentTime == null) return []
        return visibleSmokes.map(smoke => {
            if (currentTime < smoke.startTime || currentTime > smoke.endTime + 2) return null
            let opacity = 0.25
            const fadeInEnd = smoke.startTime + 1
            const fadeOutStart = smoke.endTime
            if (currentTime < fadeInEnd) {
                opacity = 0.25 * ((currentTime - smoke.startTime) / 1)
            } else if (currentTime > fadeOutStart) {
                opacity = 0.25 * Math.max(0, 1 - (currentTime - fadeOutStart) / 2)
            }
            if (opacity <= 0) return null
            return { smoke, opacity }
        }).filter(Boolean) as Array<{ smoke: typeof visibleSmokes[number]; opacity: number }>
    }, [visibleSmokes, currentTime])

    const safeSitePositions = useMemo(() => sitePositions && isFiniteCoord(sitePositions.a.x) && isFiniteCoord(sitePositions.a.y) && isFiniteCoord(sitePositions.b.x) && isFiniteCoord(sitePositions.b.y)
        ? {
            a: { x: clampRadarCoord(sitePositions.a.x), y: clampRadarCoord(sitePositions.a.y) },
            b: { x: clampRadarCoord(sitePositions.b.x), y: clampRadarCoord(sitePositions.b.y) },
        }
        : undefined, [sitePositions])

    const safeBombPosition = useMemo(() => bombState?.position && isFiniteCoord(bombState.position.x) && isFiniteCoord(bombState.position.y)
        ? { x: clampRadarCoord(bombState.position.x), y: clampRadarCoord(bombState.position.y) }
        : undefined, [bombState?.position])
    const bombVisibleOnCurrentLevel = !isDualLevel || !bombState?.level || bombState.level === resolvedRadarLevel

    const ctAlive = safeDots.filter(d => d.side === "ct" && d.isAlive).length
    const tAlive = safeDots.filter(d => d.side === "t" && d.isAlive).length

    // Clutch detection
    const clutchText = (() => {
        if (ctAlive === 1 && tAlive >= 2) return `1v${tAlive} CLUTCH`
        if (tAlive === 1 && ctAlive >= 2) return `1v${ctAlive} CLUTCH`
        return null
    })()
    const clutchSide = ctAlive === 1 && tAlive >= 2 ? "ct" : tAlive === 1 && ctAlive >= 2 ? "t" : null

    // Round phase label
    const roundPhase = (() => {
        if (bombState?.defused) return { label: "DEFUSED", color: "#5b9bd5" }
        if (bombState?.exploded) return { label: "ELIMINATED", color: "#ef4444" }
        if (bombState?.planted) return { label: "BOMB PLANTED", color: "#ef4444", pulse: true }
        if (currentTime != null && currentTime <= 3) return { label: "FREEZE TIME", color: "#60a5fa" }
        return { label: "LIVE", color: "#4ade80" }
    })()

    // Defuse progress ring math
    const DEFUSE_RING_RADIUS = 4.5
    const defuseCircumference = 2 * Math.PI * DEFUSE_RING_RADIUS
    const defuseDashOffset = bombState?.defuseProgress != null
        ? defuseCircumference * (1 - bombState.defuseProgress)
        : defuseCircumference

    // Defused checkmark fade (show for 3 seconds after defuse)
    const defusedFadeOpacity = bombState?.defused && bombState.defuseTime != null && currentTime != null
        ? Math.max(0, 1 - (currentTime - bombState.defuseTime) / 3)
        : 0

    if (!radarImageData || !radarSrc) return null

    return (
        <div className="glass-panel-dark rounded-xl border border-white/5 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-4 py-2"
            >
                <div className="flex items-center gap-2 text-xs font-normal opacity-40 uppercase tracking-widest">
                    <Map className="w-3 h-3" />
                    RADAR
                    {isExpanded && roundPhase && (
                        <span
                            className="ml-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold tracking-wider"
                            style={{
                                backgroundColor: `${roundPhase.color}20`,
                                color: roundPhase.color,
                                opacity: 1,
                                animation: roundPhase.pulse ? "pulse 1.5s ease-in-out infinite" : undefined,
                            }}
                        >
                            {roundPhase.label}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* Alive count badges */}
                    {safeDots.length > 0 && isExpanded && (
                        <div className="flex items-center gap-2 mr-1">
                            <div className="flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#5b9bd5]" />
                                <span className="text-[9px] font-bold text-white/50">{ctAlive}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#e8a838]" />
                                <span className="text-[9px] font-bold text-white/50">{tAlive}</span>
                            </div>
                        </div>
                    )}
                    {isDualLevel && isExpanded && (
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <button
                                onClick={() => setRadarLevelMode("auto")}
                                className={cn(
                                    "px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider border transition-colors",
                                    radarLevelMode === "auto"
                                        ? "bg-white/10 text-white border-white/20"
                                        : "bg-transparent text-white/30 border-white/5 hover:text-white/50"
                                )}
                            >
                                AUTO
                            </button>
                            <button
                                onClick={() => {
                                    setManualRadarLevel("upper")
                                    setRadarLevelMode("manual")
                                }}
                                className={cn(
                                    "px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider border transition-colors",
                                    radarLevelMode === "manual" && manualRadarLevel === "upper"
                                        ? "bg-white/10 text-white border-white/20"
                                        : "bg-transparent text-white/30 border-white/5 hover:text-white/50"
                                )}
                            >
                                UPPER
                            </button>
                            <button
                                onClick={() => {
                                    setManualRadarLevel("lower")
                                    setRadarLevelMode("manual")
                                }}
                                className={cn(
                                    "px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider border transition-colors",
                                    radarLevelMode === "manual" && manualRadarLevel === "lower"
                                        ? "bg-white/10 text-white border-white/20"
                                        : "bg-transparent text-white/30 border-white/5 hover:text-white/50"
                                )}
                            >
                                LOWER
                            </button>
                        </div>
                    )}
                    {isExpanded && (
                        // Inline elements only — this sits inside the header's collapse
                        // <button>, and a nested <button>/<div> trips the HTML parser's
                        // auto-close. Spans with role=button keep the toggles clickable.
                        <span
                            className="inline-flex items-center rounded-full border border-white/10 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {([["flat", "2D"], ["tilt", "2.5D"], ["3d", "3D"]] as const).map(([mode, label]) => (
                                <span
                                    key={mode}
                                    role="button"
                                    tabIndex={0}
                                    onClick={e => { e.stopPropagation(); setView(mode) }}
                                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setView(mode) } }}
                                    className={cn(
                                        "px-2 py-0.5 text-[9px] font-bold tracking-wider cursor-pointer select-none transition-colors",
                                        view === mode
                                            ? "bg-cyan-400/20 text-cyan-100"
                                            : "text-white/35 hover:text-white/60"
                                    )}
                                    aria-pressed={view === mode}
                                    title={`${label} radar view`}
                                >
                                    {label}
                                </span>
                            ))}
                        </span>
                    )}
                    <ChevronUp className={cn("w-3 h-3 text-white/30 transition-transform", !isExpanded && "rotate-180")} />
                </div>
            </button>

            {/* Collapsible radar image + overlay */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-3 flex justify-center">
                            {is3D ? (
                                <div className="relative aspect-square h-48 w-full max-w-full mx-auto rounded-lg overflow-hidden ring-1 ring-white/10">
                                    <MapRadar3D
                                        radarSrc={radarSrc}
                                        dots={visibleDots}
                                        killLines={killLineRenderState}
                                        smokes={smokeRenderState}
                                        bombPosition={safeBombPosition}
                                        bombVisible={bombVisibleOnCurrentLevel}
                                        bombState={bombState}
                                        currentTime={currentTime}
                                        onError={() => setView("tilt")}
                                    />
                                </div>
                            ) : (
                            <div
                                className="relative aspect-square h-48 max-w-full mx-auto"
                                style={tilt ? { perspective: "1100px" } : undefined}
                            >
                                {/* 2.5D ambient floor glow + soft cast shadow behind the tilted plane —
                                    gives the board a holographic "floating table" feel. */}
                                {tilt && (
                                    <>
                                        <div
                                            className="pointer-events-none absolute left-1/2 top-[56%] -translate-x-1/2 -translate-y-1/2"
                                            style={{ width: "120%", height: "120%", background: "radial-gradient(ellipse at center, rgba(34,211,238,0.10), rgba(34,211,238,0) 62%)", filter: "blur(12px)" }}
                                        />
                                        <div
                                            className="pointer-events-none absolute left-1/2 top-[63%] -translate-x-1/2 -translate-y-1/2"
                                            style={{ width: "82%", height: "44%", background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55), rgba(0,0,0,0) 70%)", filter: "blur(8px)" }}
                                        />
                                    </>
                                )}
                                <div
                                    className="relative w-full h-full transition-transform duration-500 ease-out"
                                    style={{
                                        transform: tilt ? `rotateX(${TILT_DEG}deg) scale(1.04)` : "none",
                                        transformOrigin: "center 50%",
                                        transformStyle: "preserve-3d",
                                    }}
                                >
                                {/* Radar background image */}
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={`${currentMapId}-${resolvedRadarLevel}`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 0.68 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className="absolute inset-0 rounded-lg overflow-hidden ring-1 ring-white/10"
                                        style={{ filter: "brightness(1.06) contrast(1.16) saturate(1.18)" }}
                                    >
                                        <Image
                                            src={radarSrc}
                                            alt={`${mapName} radar`}
                                            fill
                                            className="object-contain"
                                            sizes="300px"
                                            unoptimized
                                        />
                                        {/* inner vignette — sinks the map edges for depth */}
                                        <div
                                            className="pointer-events-none absolute inset-0"
                                            style={{ boxShadow: "inset 0 0 28px 4px rgba(0,0,0,0.45)" }}
                                        />
                                    </motion.div>
                                </AnimatePresence>

                                {/* SVG overlay for player dots + bomb + labels */}
                                <svg
                                    viewBox="0 0 100 100"
                                    className="absolute inset-0 w-full h-full pointer-events-none"
                                    preserveAspectRatio="xMidYMid meet"
                                >
                                    <defs>
                                        <filter id="smokeBlur">
                                            <feGaussianBlur stdDeviation="1.2" />
                                        </filter>
                                        <linearGradient id="radarSweepGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="rgba(0,255,170,0)" />
                                            <stop offset="65%" stopColor="rgba(0,255,170,0)" />
                                            <stop offset="100%" stopColor="rgba(0,255,170,0.08)" />
                                        </linearGradient>
                                    </defs>

                                    {/* Subtle radar sweep — only animates while round is LIVE so the GPU
                                        isn't drawing rotations during freeze / FINISHED. */}
                                    {roundPhase?.label === "LIVE" && (
                                        <g opacity="0.18">
                                            <line x1="50" y1="50" x2="95" y2="50" stroke="url(#radarSweepGradient)" strokeWidth="1">
                                                <animateTransform
                                                    attributeName="transform"
                                                    type="rotate"
                                                    from="0 50 50"
                                                    to="360 50 50"
                                                    dur="5s"
                                                    repeatCount="indefinite"
                                                />
                                            </line>
                                        </g>
                                    )}

                                    {/* Site Labels (A / B) — subtle background markers */}
                                    {safeSitePositions && (
                                        <>
                                            <text
                                                x={safeSitePositions.a.x}
                                                y={safeSitePositions.a.y}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                fontSize="5"
                                                fill="white"
                                                opacity="0.12"
                                                fontWeight="bold"
                                                fontFamily="sans-serif"
                                            >
                                                A
                                            </text>
                                            <text
                                                x={safeSitePositions.b.x}
                                                y={safeSitePositions.b.y}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                fontSize="5"
                                                fill="white"
                                                opacity="0.12"
                                                fontWeight="bold"
                                                fontFamily="sans-serif"
                                            >
                                                B
                                            </text>
                                        </>
                                    )}

                                    {/* Smoke clouds — opacity precomputed in smokeRenderState. */}
                                    {smokeRenderState.map(({ smoke, opacity }, idx) => (
                                        <circle
                                            key={`smoke-${idx}`}
                                            cx={smoke.x}
                                            cy={smoke.y}
                                            r={smoke.radius}
                                            fill="rgba(180,180,180,0.6)"
                                            opacity={opacity}
                                            filter="url(#smokeBlur)"
                                        />
                                    ))}

                                    {/* Kill flash lines — opacity from killLineRenderState. */}
                                    {killLineRenderState.map(({ line, fadeOpacity }, idx) => (
                                        <line
                                            key={`kill-${idx}`}
                                            x1={line.fromX}
                                            y1={line.fromY}
                                            x2={line.toX}
                                            y2={line.toY}
                                            stroke={line.isHeadshot ? "#ff6666" : "#ff3333"}
                                            strokeWidth={line.isHeadshot ? "0.6" : "0.35"}
                                            opacity={fadeOpacity * 0.7}
                                            strokeDasharray={line.isHeadshot ? "none" : "1 0.5"}
                                        />
                                    ))}

                                    {/* Headshot marker at victim position */}
                                    {killLineRenderState.map(({ line, fadeOpacity }, idx) => {
                                        if (!line.isHeadshot) return null
                                        return (
                                            <g key={`hs-${idx}`} opacity={fadeOpacity * 0.8}>
                                                <circle
                                                    cx={line.toX} cy={line.toY} r={2.2}
                                                    fill="none" stroke="#ff4444" strokeWidth="0.4"
                                                />
                                                <line x1={line.toX - 1.5} y1={line.toY} x2={line.toX + 1.5} y2={line.toY}
                                                    stroke="#ff4444" strokeWidth="0.3" />
                                                <line x1={line.toX} y1={line.toY - 1.5} x2={line.toX} y2={line.toY + 1.5}
                                                    stroke="#ff4444" strokeWidth="0.3" />
                                            </g>
                                        )
                                    })}

                                    {/* Bomb icon — planted, not yet defused or exploded */}
                                    {bombVisibleOnCurrentLevel && bombState?.planted && !bombState.defused && !bombState.exploded && safeBombPosition && (
                                        <g>
                                            <circle
                                                cx={safeBombPosition.x}
                                                cy={safeBombPosition.y}
                                                r={3}
                                                fill="rgba(255, 50, 50, 0.4)"
                                            >
                                                <animate
                                                    attributeName="r"
                                                    values="2.5;4;2.5"
                                                    dur="1.2s"
                                                    repeatCount="indefinite"
                                                />
                                                <animate
                                                    attributeName="opacity"
                                                    values="0.4;0.8;0.4"
                                                    dur="1.2s"
                                                    repeatCount="indefinite"
                                                />
                                            </circle>
                                            <text
                                                x={safeBombPosition.x}
                                                y={safeBombPosition.y + 0.8}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                fontSize="2.8"
                                                fill="#ff4444"
                                                fontWeight="bold"
                                                fontFamily="monospace"
                                            >
                                                C4
                                            </text>

                                            {/* Defuse progress ring */}
                                            {bombState.defuseProgress != null && bombState.defuseProgress > 0 && (
                                                <circle
                                                    cx={safeBombPosition.x}
                                                    cy={safeBombPosition.y}
                                                    r={DEFUSE_RING_RADIUS}
                                                    fill="none"
                                                    stroke="#5b9bd5"
                                                    strokeWidth="0.8"
                                                    strokeDasharray={defuseCircumference}
                                                    strokeDashoffset={defuseDashOffset}
                                                    strokeLinecap="round"
                                                    transform={`rotate(-90 ${safeBombPosition.x} ${safeBombPosition.y})`}
                                                    opacity={0.9}
                                                />
                                            )}
                                        </g>
                                    )}

                                    {/* Bomb exploded flash */}
                                    {bombVisibleOnCurrentLevel && bombState?.exploded && safeBombPosition && (
                                        <circle
                                            cx={safeBombPosition.x}
                                            cy={safeBombPosition.y}
                                            r={6}
                                            fill="rgba(255, 100, 0, 0.5)"
                                        >
                                            <animate
                                                attributeName="r"
                                                values="3;8;0"
                                                dur="0.8s"
                                                fill="freeze"
                                            />
                                            <animate
                                                attributeName="opacity"
                                                values="0.8;0.3;0"
                                                dur="0.8s"
                                                fill="freeze"
                                            />
                                        </circle>
                                    )}

                                    {/* Bomb defused checkmark */}
                                    {bombVisibleOnCurrentLevel && bombState?.defused && safeBombPosition && defusedFadeOpacity > 0 && (
                                        <g opacity={defusedFadeOpacity}>
                                            <circle
                                                cx={safeBombPosition.x}
                                                cy={safeBombPosition.y}
                                                r={3}
                                                fill="rgba(74, 222, 128, 0.3)"
                                            />
                                            <path
                                                d={`M ${safeBombPosition.x - 1.8} ${safeBombPosition.y + 0.2} L ${safeBombPosition.x - 0.5} ${safeBombPosition.y + 1.5} L ${safeBombPosition.x + 2} ${safeBombPosition.y - 1.2}`}
                                                fill="none"
                                                stroke="#4ade80"
                                                strokeWidth="0.8"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </g>
                                    )}

                                    {/* Clutch banner */}
                                    {clutchText && (
                                        <g>
                                            <rect
                                                x={20} y={3} width={60} height={7}
                                                rx={3.5}
                                                fill="rgba(0,0,0,0.6)"
                                            />
                                            <text
                                                x={50} y={7.8}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                fontSize="4"
                                                fill={clutchSide === "ct" ? "#5b9bd5" : "#e8a838"}
                                                fontWeight="bold"
                                                fontFamily="sans-serif"
                                                letterSpacing="0.5"
                                            >
                                                {clutchText}
                                            </text>
                                        </g>
                                    )}

                                    {/* Player dots */}
                                    {visibleDots.map(dot => {
                                        const isDeadRecently = !dot.isAlive
                                            && dot.deathTime !== undefined
                                            && currentTime !== undefined
                                            && (currentTime - dot.deathTime) < 4

                                        if (!dot.isAlive && !isDeadRecently) return null

                                        const ctColor = "#5b9bd5"
                                        const tColor = "#e8a838"
                                        const color = dot.side === "ct" ? ctColor : tColor
                                        const labelText = shortRadarName(dot.nickname)
                                        const labelAnchor: "start" | "end" = dot.x > 90 ? "end" : "start"
                                        const labelX = dot.x > 90 ? dot.x - 2.4 : dot.x + 2.5
                                        const labelY = dot.y < 6 ? dot.y + 2 : dot.y + 0.6

                                        // Dead player X marker
                                        if (!dot.isAlive && isDeadRecently) {
                                            const elapsed = (currentTime ?? 0) - (dot.deathTime ?? 0)
                                            const fadeOpacity = Math.max(0, 1 - elapsed / 4)
                                            return (
                                                <g key={dot.playerId} opacity={fadeOpacity}>
                                                    <line
                                                        x1={dot.x - 1.5} y1={dot.y - 1.5}
                                                        x2={dot.x + 1.5} y2={dot.y + 1.5}
                                                        stroke="#ff3333" strokeWidth="0.7"
                                                    />
                                                    <line
                                                        x1={dot.x + 1.5} y1={dot.y - 1.5}
                                                        x2={dot.x - 1.5} y2={dot.y + 1.5}
                                                        stroke="#ff3333" strokeWidth="0.7"
                                                    />
                                                </g>
                                            )
                                        }

                                        // Economy border color
                                        const ecoStroke = dot.money != null
                                            ? dot.money >= 4500 ? "white"
                                              : dot.money >= 2000 ? "#f59e0b"
                                              : "#ef4444"
                                            : "white"
                                        const ecoStrokeWidth = dot.money != null && dot.money < 2000 ? "0.5" : "0.35"

                                        // Facing cone points
                                        const coneLen = 3.5
                                        const coneHalf = 0.4 // ~23° half-angle
                                        const cx1 = dot.x + Math.cos(dot.angle - coneHalf) * coneLen
                                        const cy1 = dot.y + Math.sin(dot.angle - coneHalf) * coneLen
                                        const cx2 = dot.x + Math.cos(dot.angle + coneHalf) * coneLen
                                        const cy2 = dot.y + Math.sin(dot.angle + coneHalf) * coneLen

                                        // Alive player dot with glow + cone + nickname
                                        return (
                                            <g key={dot.playerId}>
                                                {/* Facing direction cone */}
                                                <path
                                                    d={`M ${dot.x} ${dot.y} L ${cx1} ${cy1} L ${cx2} ${cy2} Z`}
                                                    fill={color}
                                                    opacity={0.12}
                                                    style={{ transition: 'd 0.5s ease-out' }}
                                                />
                                                {/* Glow */}
                                                <circle
                                                    cx={dot.x} cy={dot.y} r={2.5}
                                                    fill={color} opacity={0.25}
                                                    style={{ transition: 'cx 0.5s ease-out, cy 0.5s ease-out' }}
                                                />
                                                {/* Solid dot + nickname — flat mode only; the 2.5D view
                                                    renders these as billboarded standing tokens (below). */}
                                                {!tilt && (
                                                    <>
                                                        <circle
                                                            cx={dot.x} cy={dot.y} r={1.5}
                                                            fill={color}
                                                            stroke={ecoStroke} strokeWidth={ecoStrokeWidth}
                                                            style={{ transition: 'cx 0.5s ease-out, cy 0.5s ease-out' }}
                                                        />
                                                        <text
                                                            x={labelX}
                                                            y={labelY}
                                                            fontSize="2"
                                                            fill="white"
                                                            opacity={0.65}
                                                            fontFamily="sans-serif"
                                                            fontWeight="600"
                                                            textAnchor={labelAnchor}
                                                            style={{ transition: 'x 0.5s ease-out, y 0.5s ease-out' }}
                                                        >
                                                            {labelText}
                                                        </text>
                                                    </>
                                                )}
                                            </g>
                                        )
                                    })}
                                </svg>

                                    {/* 2.5D depth fog — darkens the far (top) edge for a sense of distance. */}
                                    {tilt && (
                                        <div
                                            className="pointer-events-none absolute inset-0"
                                            style={{ background: "linear-gradient(to top, rgba(5,7,11,0) 52%, rgba(5,7,11,0.55) 100%)" }}
                                        />
                                    )}

                                    {/* 2.5D standing player tokens — billboarded upright on the tilted
                                        plane, each over a flat ground shadow. (Flat mode uses SVG dots.) */}
                                    {tilt && (
                                        <div className="absolute inset-0" style={{ transformStyle: "preserve-3d", pointerEvents: "none" }}>
                                            {visibleDots.filter(d => d.isAlive).map(dot => {
                                                const color = dot.side === "ct" ? "#5b9bd5" : "#e8a838"
                                                const ecoStroke = dot.money != null
                                                    ? dot.money >= 4500 ? "#ffffff" : dot.money >= 2000 ? "#f59e0b" : "#ef4444"
                                                    : "#ffffff"
                                                return (
                                                    <div
                                                        key={dot.playerId}
                                                        className="absolute"
                                                        style={{ left: `${dot.x}%`, top: `${dot.y}%`, transformStyle: "preserve-3d", transition: "left 0.5s ease-out, top 0.5s ease-out" }}
                                                    >
                                                        {/* ground shadow — flat on the plane, beneath the peg */}
                                                        <div style={{ position: "absolute", width: 8, height: 4.5, borderRadius: "9999px", background: "rgba(0,0,0,0.5)", filter: "blur(2px)", transform: "translate(-50%,-40%)" }} />
                                                        {/* standing peg — counter-rotated to face the camera, rising from the ground point */}
                                                        <div style={{ position: "absolute", transformOrigin: "center bottom", transform: `translate(-50%,-100%) rotateX(-${TILT_DEG}deg)`, display: "flex", flexDirection: "column", alignItems: "center" }}>
                                                            {/* head — a 3D bead with economy ring + colored glow */}
                                                            <div style={{ width: 10, height: 10, borderRadius: "9999px", background: `radial-gradient(circle at 35% 30%, #ffffff, ${color} 62%)`, border: `1.5px solid ${ecoStroke}`, boxShadow: `0 0 6px ${color}, 0 1px 3px rgba(0,0,0,0.6)` }} />
                                                            {/* stem fading into the ground */}
                                                            <div style={{ width: 2, height: 8, marginTop: -0.5, borderRadius: "2px", background: `linear-gradient(to bottom, ${color}, rgba(0,0,0,0))` }} />
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export const MapRadarPanel = memo(MapRadarPanelComponent)
