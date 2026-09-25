"use client"

import { useState, useEffect, useMemo, useId, memo } from "react"
import { MapId } from "@/types"
import { cn } from "@/lib/utils"
import { Map, ChevronUp, Minus, Plus } from "lucide-react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import type { RadarPlayerDot, RadarBombState, RadarKillLine, RadarSmoke } from "@/lib/radar-position-engine"
import type { Point } from "@/lib/map-radar-data"
import { useSettingsStore } from "@/lib/settings-store"
import { useReducedMotion } from "framer-motion"
import { resolveAutoRadarLevel } from "@/lib/radar-level-selector"
import { layoutRadarLabels } from "@/lib/radar-label-layout"

function isFiniteCoord(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value)
}

function clampRadarCoord(value: number, min = 0, max = 100): number {
    return Math.max(min, Math.min(max, value))
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
    referenceImages?: { primary: string; secondary?: string }
    positionSource?: 'estimated' | 'physical-replay'
}

function MapRadarPanelComponent({ currentMapId, mapName, radarDots, bombState, currentTime, killLines, sitePositions, smokes, referenceImages, positionSource = 'estimated' }: MapRadarPanelProps) {
    const panelId = useId().replace(/:/g, "")
    const [isExpanded, setIsExpanded] = useState(true)
    const [showNames, setShowNames] = useState(true)
    const [zoom, setZoom] = useState(1)
    const reducedMotion = useSettingsStore(s => s.reducedMotion)
    const systemReducedMotion = useReducedMotion()
    const staticEffects = reducedMotion || systemReducedMotion
    const [radarLevelMode, setRadarLevelMode] = useState<"auto" | "manual">("auto")
    const [manualRadarLevel, setManualRadarLevel] = useState<"upper" | "lower">("upper")
    const radarImageData = referenceImages || MAP_RADAR_IMAGES[currentMapId]
    const isDualLevel = !!radarImageData?.secondary

    useEffect(() => {
        setManualRadarLevel("upper")
        setRadarLevelMode("auto")
        setZoom(1)
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

    const safeDots = useMemo(() => (radarDots || [])
        .filter(dot => isFiniteCoord(dot.x) && isFiniteCoord(dot.y) && isFiniteCoord(dot.angle))
        .map(dot => ({
            ...dot,
            x: clampRadarCoord(dot.x),
            y: clampRadarCoord(dot.y),
            angle: dot.angle,
        })), [radarDots])

    // Filter dots by level for dual-level maps
    const visibleDots = useMemo(() => safeDots.filter(dot => {
        if (!isDualLevel || !dot.level) return true
        return dot.level === resolvedRadarLevel
    }), [safeDots, isDualLevel, resolvedRadarLevel])
    const labels = useMemo(() => layoutRadarLabels(visibleDots), [visibleDots])

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
                if (elapsed < 0) return null
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
        if (positionSource === 'physical-replay') return { label: "REPLAY", color: "#c4d0e2" }
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
        <div className="map-radar-panel glass-panel-dark rounded-xl border border-white/5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3">
                <button type="button" onClick={() => setIsExpanded(!isExpanded)} aria-label={`${mapName} radar`} aria-expanded={isExpanded} aria-controls={panelId}
                    className="flex min-h-8 items-center gap-2 text-left text-sm font-medium text-slate-100">
                    <Map size={16} className="text-sky-200" />
                    <span>{mapName} <span className="text-slate-400 font-normal">radar</span></span>
                    <ChevronUp size={14} className={cn("text-slate-400 transition-transform", !isExpanded && "rotate-180")} />
                </button>
                {isExpanded && roundPhase && <span className="rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide" style={{backgroundColor: `${roundPhase.color}20`, color: roundPhase.color}}>{roundPhase.label}</span>}
            </div>
            {isExpanded && <div className="flex flex-wrap items-center justify-between gap-2 border-y border-white/10 bg-white/[0.025] px-4 py-2 mb-3">
                {isDualLevel && <div role="group" aria-label="Radar floor" className="flex items-center gap-1">
                    {(["auto", "upper", "lower"] as const).map(level => <button key={level} type="button"
                        onClick={() => { setRadarLevelMode(level === "auto" ? "auto" : "manual"); if (level !== "auto") setManualRadarLevel(level) }}
                        aria-pressed={level === "auto" ? radarLevelMode === "auto" : radarLevelMode === "manual" && manualRadarLevel === level}
                        className={cn("min-h-7 rounded-lg px-2 text-xs capitalize", (level === "auto" ? radarLevelMode === "auto" : radarLevelMode === "manual" && manualRadarLevel === level) ? "bg-white/10 text-white" : "text-slate-400 hover:text-white")}>
                        {level}
                    </button>)}
                </div>}
                {<button type="button" aria-pressed={showNames} onClick={() => setShowNames(value => !value)} className="min-h-7 rounded-lg px-2 text-xs text-slate-300 hover:bg-white/10">Names {showNames ? "on" : "off"}</button>}
                <div role="group" aria-label="Radar zoom" className="flex items-center gap-1 text-xs text-slate-300">
                    <button type="button" aria-label="Zoom radar out" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .5))} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-40"><Minus size={14} /></button>
                    <span className="w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                    <button type="button" aria-label="Zoom radar in" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + .5))} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-40"><Plus size={14} /></button>
                </div>
            </div>}

            {/* Collapsible radar image + overlay */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        id={panelId}
                        initial={false}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-3 flex justify-center">
                            <div className="radar-canvas-frame relative aspect-square w-full max-w-[520px] mx-auto overflow-auto rounded-lg" role="region" aria-label={`${mapName} radar viewport; scroll to pan when zoomed`} tabIndex={0}>
                                <div className="relative" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
                                {/* Radar background image */}
                                <AnimatePresence mode="sync">
                                    <motion.div
                                        key={`${currentMapId}-${resolvedRadarLevel}`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 0.9 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className="absolute inset-0 rounded-lg overflow-hidden ring-1 ring-white/10"
                                        style={{ filter: "brightness(1.18) contrast(1.08) saturate(0.65)" }}
                                    >
                                        <Image
                                            src={radarSrc}
                                            alt={`${mapName} radar`}
                                            fill
                                            className="object-contain"
                                            sizes="(max-height: 800px) 270px, 520px"
                                            priority
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
                                        <filter id={`${panelId}-smoke`}>
                                            <feGaussianBlur stdDeviation="1.2" />
                                        </filter>
                                    </defs>

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
                                            filter={`url(#${panelId}-smoke)`}
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
                                                {!staticEffects && <animate
                                                    attributeName="r"
                                                    values="2.5;4;2.5"
                                                    dur="1.2s"
                                                    repeatCount="indefinite"
                                                />}
                                                {!staticEffects && <animate
                                                    attributeName="opacity"
                                                    values="0.4;0.8;0.4"
                                                    dur="1.2s"
                                                    repeatCount="indefinite"
                                                />}
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
                                            {!staticEffects && <animate
                                                attributeName="r"
                                                values="3;8;0"
                                                dur="0.8s"
                                                fill="freeze"
                                            />}
                                            {!staticEffects && <animate
                                                attributeName="opacity"
                                                values="0.8;0.3;0"
                                                dur="0.8s"
                                                fill="freeze"
                                            />}
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
                                        const label = labels.get(dot.playerId)

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
                                                />
                                                        <circle
                                                            cx={dot.x} cy={dot.y} r={1.5}
                                                            fill={color}
                                                            stroke={ecoStroke} strokeWidth={ecoStrokeWidth}
                                                        />
                                                        {showNames && label && <g>
                                                        <line x1={dot.x} y1={dot.y} x2={label.x + label.width / 2} y2={label.y + label.height / 2} stroke={color} strokeWidth=".2" opacity=".4" />
                                                        <rect x={label.x} y={label.y} width={label.width} height={label.height} rx=".8" fill="#0d1a2d" opacity=".9" />
                                                        <text
                                                            x={label.x + .8}
                                                            y={label.y + 3}
                                                            fontSize="2.6"
                                                            fill="white"
                                                            stroke="#0b1220" strokeWidth="0.7" paintOrder="stroke"
                                                            opacity={0.95}
                                                            fontFamily="sans-serif"
                                                            fontWeight="600"
                                                            textAnchor="start"
                                                        >
                                                            {label.text}
                                                        </text></g>}
                                            </g>
                                        )
                                    })}
                                </svg>

                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3 text-xs text-slate-400">
                            <span className="flex items-center gap-3"><span className="text-sky-300">CT {ctAlive}</span><span className="text-amber-300">T {tAlive}</span><span>alive</span></span>
                            <span title={positionSource === 'physical-replay' ? 'Recorded physical simulation snapshots. This rehearsal does not settle the career match.' : 'Career match positions are estimated from recorded round events.'}>{positionSource === 'physical-replay' ? 'Recorded positions' : 'Estimated positions'} · {isDualLevel ? `${resolvedRadarLevel === "upper" ? "Upper" : "Lower"} floor` : "Single level"}</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export const MapRadarPanel = memo(MapRadarPanelComponent)
