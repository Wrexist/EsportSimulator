"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react"
import type { Floor, RoundScript, Side } from "@/engine/match/round-script-types"
import { radarScriptFrame, type FramePlayer, type RadarScriptFrame } from "@/lib/radar-script-frame"
import { layoutRadarLabels, RADAR_LABEL_BASELINE, RADAR_LABEL_FONT_SIZE, type RadarLabel } from "@/lib/radar-label-layout"
import type { RadarPlayerDot } from "@/lib/radar-types"

export const CT_COLOR = "#5AA9FF"
export const T_COLOR = "#FF8A3D"
const BOMB_COLOR = "#FF4D5E"
const DEFUSE_COLOR = "#7CC4FF"
const INK = "#07090C"
/** Opacity multiplier for things on the floor the radar is not showing. */
const OTHER_FLOOR = 0.28
const CONE_LENGTH = 7
const CONE_HALF_ANGLE = 0.36

export interface RadarScriptPlayerInfo {
    name: string
    money?: number
}

interface RadarScriptLayerProps {
    script: RoundScript
    /** Playback clock in whole game seconds (the live match ticks once per second). */
    currentTime: number
    /** Wall-clock length of one tick; the layer glides between ticks over it. */
    tickDurationMs: number
    /** Playback is running (and motion is allowed): sample the script every frame. */
    animate: boolean
    level: Floor
    dualLevel: boolean
    players?: Readonly<Record<string, RadarScriptPlayerInfo>>
    showNames: boolean
    /** Reduced motion: no pulsing / flickering SVG animations. */
    staticEffects: boolean
    filterId: string
}

const sideColor = (side: Side) => (side === "CT" ? CT_COLOR : T_COLOR)

/**
 * Round time the radar shows. Ticks arrive once per game second; between
 * ticks the clock advances with requestAnimationFrame so the script is
 * sampled continuously. Pausing freezes it where it is, and resuming
 * continues from there instead of jumping ahead.
 */
function useScriptClock(currentTime: number, tickDurationMs: number, animate: boolean): number {
    const [t, setT] = useState(currentTime)
    const alpha = useRef(0)
    const tickStart = useRef(0)
    const shownTick = useRef(currentTime)

    useEffect(() => {
        if (shownTick.current === currentTime) return
        shownTick.current = currentTime
        alpha.current = 0
        tickStart.current = performance.now()
        setT(currentTime)
    }, [currentTime])

    useEffect(() => {
        if (!animate || !(tickDurationMs > 0)) return
        tickStart.current = performance.now() - alpha.current * tickDurationMs
        let raf = 0
        const loop = () => {
            const a = Math.min(1, Math.max(0, (performance.now() - tickStart.current) / tickDurationMs))
            alpha.current = a
            setT(currentTime + a)
            if (a < 1) raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(raf)
    }, [currentTime, tickDurationMs, animate])

    return t
}

function ecoStroke(money: number | undefined): { stroke: string; width: number } {
    if (money == null) return { stroke: "white", width: 0.35 }
    if (money >= 4500) return { stroke: "white", width: 0.35 }
    if (money >= 2000) return { stroke: "#f59e0b", width: 0.35 }
    return { stroke: "#ef4444", width: 0.5 }
}

/** Arc of a progress ring (0..1), starting at 12 o'clock. */
function ringArc(cx: number, cy: number, r: number, progress: number): string {
    const p = Math.max(0.001, Math.min(0.999, progress))
    const a = -Math.PI / 2 + p * Math.PI * 2
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
    return `M ${cx} ${cy - r} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${x} ${y}`
}

function BombGlyph({ x, y, scale = 1, opacity = 1 }: { x: number; y: number; scale?: number; opacity?: number }) {
    const w = 2 * scale, h = 1.35 * scale
    return (
        <g opacity={opacity}>
            <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={0.25 * scale} fill={BOMB_COLOR} stroke={INK} strokeWidth={0.25 * scale} />
            <line x1={x - w / 2 + 0.35 * scale} y1={y} x2={x + w / 2 - 0.35 * scale} y2={y} stroke={INK} strokeWidth={0.18 * scale} opacity={0.8} />
        </g>
    )
}

function RadarScriptLayerComponent({ script, currentTime, tickDurationMs, animate, level, dualLevel, players, showNames, staticEffects, filterId }: RadarScriptLayerProps) {
    const t = useScriptClock(currentTime, tickDurationMs, animate)
    const frame: RadarScriptFrame = useMemo(() => radarScriptFrame(script, t), [script, t])
    const onLevel = (floor: Floor) => onLevelOf(floor, dualLevel, level)
    const floorOpacity = (floor: Floor) => (onLevel(floor) ? 1 : OTHER_FLOOR)

    // Names are placed once per tick (collision layout) and then ride along
    // with their dot, so they glide instead of re-running the layout — and
    // jumping — every frame.
    const labelOffsets = useRef(new Map<string, { dx: number; dy: number }>())
    const tickLabels = useMemo(() => {
        const tickFrame = radarScriptFrame(script, currentTime)
        const dots: RadarPlayerDot[] = tickFrame.players
            .filter(p => p.alive && onLevelOf(p.floor, dualLevel, level))
            .map(p => ({ playerId: p.id, nickname: players?.[p.id]?.name ?? p.id, x: p.x, y: p.y, side: p.side === "CT" ? "ct" : "t", isAlive: true, angle: p.aim }))
        const placed = layoutRadarLabels(dots, labelOffsets.current)
        const offsets = new Map<string, { dx: number; dy: number }>()
        for (const dot of dots) {
            const label = placed.get(dot.playerId)
            if (label) offsets.set(dot.playerId, { dx: label.x - dot.x, dy: label.y - dot.y })
        }
        labelOffsets.current = offsets
        return placed
    }, [script, currentTime, players, dualLevel, level])

    const labels = useMemo(() => {
        const moved = new Map<string, RadarLabel>()
        if (!showNames) return moved
        for (const p of frame.players) {
            if (!p.alive || !onLevelOf(p.floor, dualLevel, level)) continue
            const label = tickLabels.get(p.id)
            const offset = labelOffsets.current.get(p.id)
            if (!label || !offset) continue
            moved.set(p.id, {
                ...label,
                x: Math.max(1, Math.min(99 - label.width, p.x + offset.dx)),
                y: Math.max(1, Math.min(99 - label.height, p.y + offset.dy)),
            })
        }
        return moved
    }, [frame, tickLabels, showNames, dualLevel, level])

    const { bomb } = frame
    const alivePlayers = frame.players.filter(p => p.alive)
    const defuser = bomb.phase === "defusing" ? frame.players.find(p => p.id === bomb.defuserId) : undefined

    return (
        <g data-radar-source="round-script">
            {/* Smokes and fires under everything else. */}
            {frame.utility.filter(u => u.kind === "smoke" || u.kind === "molotov").map((u, i) => {
                const o = u.opacity * floorOpacity(u.at.floor)
                if (u.kind === "smoke") {
                    return (
                        <g key={`util-${i}`} data-utility="smoke" opacity={o}>
                            <circle cx={u.at.x} cy={u.at.y} r={u.radius} fill="#8E97A3" opacity={0.7} />
                            <circle cx={u.at.x} cy={u.at.y} r={u.radius * 0.78} fill="#DDE2E8" opacity={0.75} filter={`url(#${filterId}-smoke)`} />
                            <circle cx={u.at.x} cy={u.at.y} r={u.radius} fill="none" stroke="#EEF1F4" strokeWidth={0.25} opacity={0.8} />
                        </g>
                    )
                }
                return (
                    <g key={`util-${i}`} data-utility="molotov" opacity={o}>
                        <circle cx={u.at.x} cy={u.at.y} r={u.radius} fill="#FF5A1F" opacity={0.42}>
                            {!staticEffects && <animate attributeName="opacity" values="0.34;0.5;0.38;0.46;0.34" dur="0.9s" repeatCount="indefinite" />}
                        </circle>
                        <circle cx={u.at.x} cy={u.at.y} r={u.radius} fill="none" stroke="#FFB020" strokeWidth={0.28} strokeDasharray="0.7 0.45" opacity={0.85} />
                    </g>
                )
            })}

            {/* Death markers: an X in the victim's colour where they fell, for the rest of the round. */}
            {frame.deaths.map(d => {
                const age = frame.t - d.t
                const color = sideColor(d.side)
                const s = 1.25
                const path = `M ${d.at.x - s} ${d.at.y - s} L ${d.at.x + s} ${d.at.y + s} M ${d.at.x + s} ${d.at.y - s} L ${d.at.x - s} ${d.at.y + s}`
                return (
                    <g key={`death-${d.victimId}`} data-death-marker={d.victimId} opacity={(age < 1 ? 1 : 0.82) * floorOpacity(d.at.floor)}>
                        {age < 0.6 && <circle cx={d.at.x} cy={d.at.y} r={1.4 + age * 5} fill="none" stroke={color} strokeWidth={0.3} opacity={1 - age / 0.6} />}
                        <path d={path} stroke={INK} strokeWidth={1.15} strokeLinecap="round" />
                        <path d={path} stroke={color} strokeWidth={0.6} strokeLinecap="round" />
                    </g>
                )
            })}

            {/* Flash / HE pops. */}
            {frame.utility.filter(u => u.kind === "flash" || u.kind === "he").map((u, i) => {
                const o = u.opacity * floorOpacity(u.at.floor)
                const r = 0.8 + u.progress * (u.kind === "he" ? 3.6 : 3)
                return u.kind === "flash" ? (
                    <g key={`pop-${i}`} data-utility="flash" opacity={o}>
                        <circle cx={u.at.x} cy={u.at.y} r={r} fill="#FFFFFF" opacity={0.45} />
                        <circle cx={u.at.x} cy={u.at.y} r={r} fill="none" stroke="#FFFFFF" strokeWidth={0.3} />
                    </g>
                ) : (
                    <g key={`pop-${i}`} data-utility="he" opacity={o}>
                        <circle cx={u.at.x} cy={u.at.y} r={r} fill="#FFD166" opacity={0.4} />
                        <circle cx={u.at.x} cy={u.at.y} r={r} fill="none" stroke="#FF8A3D" strokeWidth={0.35} />
                    </g>
                )
            })}

            {/* Shot tracers: killer → victim for a moment after each kill. */}
            {frame.tracers.map((tr, i) => {
                const color = sideColor(tr.side)
                const o = tr.strength * floorOpacity(tr.at.floor)
                return (
                    <g key={`tracer-${i}`} data-tracer="" opacity={o}>
                        <line x1={tr.from.x} y1={tr.from.y} x2={tr.at.x} y2={tr.at.y} stroke={INK} strokeWidth={tr.headshot ? 0.95 : 0.8} strokeLinecap="round" opacity={0.6} />
                        <line x1={tr.from.x} y1={tr.from.y} x2={tr.at.x} y2={tr.at.y} stroke={color} strokeWidth={tr.headshot ? 0.55 : 0.42} strokeLinecap="round" />
                        <circle cx={tr.at.x} cy={tr.at.y} r={tr.headshot ? 0.9 : 0.7} fill={color} />
                    </g>
                )
            })}

            {/* The bomb on the ground: dropped, being planted, planted, defused or exploded. */}
            {bomb.at && bomb.phase !== "carried" && bomb.phase !== "none" && (() => {
                const { x, y } = bomb.at
                const o = floorOpacity(bomb.at.floor)
                if (bomb.phase === "dropped") return <g data-bomb="dropped" opacity={o}><BombGlyph x={x} y={y} scale={0.9} /></g>
                if (bomb.phase === "planting") {
                    return (
                        <g data-bomb="planting" opacity={o}>
                            <circle cx={x} cy={y} r={3.2} fill="none" stroke={BOMB_COLOR} strokeWidth={0.2} opacity={0.35} />
                            <path d={ringArc(x, y, 3.2, bomb.progress ?? 0)} fill="none" stroke={BOMB_COLOR} strokeWidth={0.55} strokeLinecap="round" />
                        </g>
                    )
                }
                if (bomb.phase === "exploded") {
                    const since = bomb.since ?? 0
                    return (
                        <g data-bomb="exploded" opacity={o}>
                            <circle cx={x} cy={y} r={2.4} fill="#2A1A12" opacity={0.6} />
                            {since < 1.4 && <circle cx={x} cy={y} r={3 + since * 9} fill="#FF7A1A" opacity={0.55 * (1 - since / 1.4)} />}
                            <BombGlyph x={x} y={y} scale={0.8} opacity={0.5} />
                        </g>
                    )
                }
                if (bomb.phase === "defused") {
                    const since = bomb.since ?? 0
                    return (
                        <g data-bomb="defused" opacity={o}>
                            <BombGlyph x={x} y={y} scale={0.85} opacity={0.45} />
                            {since < 3 && <g opacity={1 - since / 3}>
                                <circle cx={x} cy={y} r={3.2} fill="rgba(74, 222, 128, 0.22)" stroke="#4ade80" strokeWidth={0.3} />
                                <path d={`M ${x - 1.6} ${y + 0.1} L ${x - 0.4} ${y + 1.3} L ${x + 1.8} ${y - 1.1}`} fill="none" stroke="#4ade80" strokeWidth={0.7} strokeLinecap="round" strokeLinejoin="round" />
                            </g>}
                        </g>
                    )
                }
                // planted / defusing
                return (
                    <g data-bomb={bomb.phase} opacity={o}>
                        <circle cx={x} cy={y} r={3} fill="none" stroke={BOMB_COLOR} strokeWidth={0.45} opacity={0.75}>
                            {!staticEffects && <animate attributeName="r" values="2.2;4.6;2.2" dur="1.1s" repeatCount="indefinite" />}
                            {!staticEffects && <animate attributeName="opacity" values="0.9;0.15;0.9" dur="1.1s" repeatCount="indefinite" />}
                        </circle>
                        <circle cx={x} cy={y} r={1.9} fill="rgba(255, 77, 94, 0.25)" />
                        <BombGlyph x={x} y={y} />
                        {bomb.phase === "defusing" && <>
                            <circle cx={x} cy={y} r={4.6} fill="none" stroke={DEFUSE_COLOR} strokeWidth={0.2} opacity={0.4} />
                            <path data-defuse-progress="" d={ringArc(x, y, 4.6, bomb.progress ?? 0)} fill="none" stroke={DEFUSE_COLOR} strokeWidth={0.7} strokeLinecap="round" />
                        </>}
                    </g>
                )
            })()}

            {/* Players: view cone, side shape (CT circle / T diamond), bomb carrier icon. */}
            {alivePlayers.map(p => <RadarScriptDot key={p.id} p={p} money={players?.[p.id]?.money} onLevel={onLevel(p.floor)} defusing={defuser?.id === p.id} />)}

            {/* Grenades in flight. */}
            {frame.grenades.map((g, i) => (
                <circle key={`nade-${i}`} data-grenade={g.kind} cx={g.x} cy={g.y} r={0.5}
                    fill={g.kind === "smoke" ? "#D9DDE3" : g.kind === "molotov" ? "#FF7A1A" : g.kind === "flash" ? "#FFFFFF" : "#B5E06A"}
                    stroke={INK} strokeWidth={0.18} opacity={floorOpacity(g.floor)} />
            ))}

            {/* Names on top. */}
            {alivePlayers.map(p => {
                const label = labels.get(p.id)
                if (!label) return null
                const color = sideColor(p.side)
                const nearX = Math.max(label.x, Math.min(p.x, label.x + label.width))
                const nearY = Math.max(label.y, Math.min(p.y, label.y + label.height))
                return (
                    <g key={`label-${p.id}`}>
                        {Math.hypot(nearX - p.x, nearY - p.y) > 3.2 && <line x1={p.x} y1={p.y} x2={nearX} y2={nearY} stroke={color} strokeWidth=".25" opacity=".7" />}
                        <rect x={label.x} y={label.y} width={label.width} height={label.height} rx=".7" fill="#0D1015" opacity=".88" />
                        <text x={label.x + .7} y={label.y + RADAR_LABEL_BASELINE} fontSize={RADAR_LABEL_FONT_SIZE} fill="white" stroke={INK} strokeWidth="0.7" paintOrder="stroke"
                            opacity={0.95} fontFamily="sans-serif" fontWeight="600" textAnchor="start">
                            {label.text}
                        </text>
                    </g>
                )
            })}
        </g>
    )
}

function onLevelOf(floor: Floor, dualLevel: boolean, level: Floor): boolean {
    return !dualLevel || floor === level
}

function RadarScriptDot({ p, money, onLevel, defusing }: { p: FramePlayer; money?: number; onLevel: boolean; defusing: boolean }) {
    const color = sideColor(p.side)
    const eco = ecoStroke(money)
    const x1 = p.x + Math.cos(p.aim - CONE_HALF_ANGLE) * CONE_LENGTH
    const y1 = p.y + Math.sin(p.aim - CONE_HALF_ANGLE) * CONE_LENGTH
    const x2 = p.x + Math.cos(p.aim + CONE_HALF_ANGLE) * CONE_LENGTH
    const y2 = p.y + Math.sin(p.aim + CONE_HALF_ANGLE) * CONE_LENGTH
    return (
        <g data-player={p.id} opacity={onLevel ? 1 : OTHER_FLOOR}>
            {onLevel && <path data-view-cone="" d={`M ${p.x} ${p.y} L ${x1} ${y1} Q ${p.x + Math.cos(p.aim) * CONE_LENGTH * 1.08} ${p.y + Math.sin(p.aim) * CONE_LENGTH * 1.08} ${x2} ${y2} Z`} fill={color} opacity={0.25} />}
            {defusing && <circle cx={p.x} cy={p.y} r={2.6} fill="none" stroke={DEFUSE_COLOR} strokeWidth={0.35} strokeDasharray="0.8 0.5" />}
            {p.side === "CT" ? (
                <circle cx={p.x} cy={p.y} r={1.5} fill={color} stroke={eco.stroke} strokeWidth={eco.width} data-side-shape="ct-circle" />
            ) : (
                <path d={`M ${p.x} ${p.y - 1.8} L ${p.x + 1.8} ${p.y} L ${p.x} ${p.y + 1.8} L ${p.x - 1.8} ${p.y} Z`} fill={color} stroke={eco.stroke} strokeWidth={eco.width} data-side-shape="t-diamond" />
            )}
            {p.hasBomb && <g data-bomb-carrier={p.id}>
                <rect x={p.x + 0.85} y={p.y + 0.95} width={2.5} height={1.85} rx={0.45} fill={INK} opacity={0.85} />
                <BombGlyph x={p.x + 2.1} y={p.y + 1.875} scale={1} />
            </g>}
        </g>
    )
}

export const RadarScriptLayer = memo(RadarScriptLayerComponent)
