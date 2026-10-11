"use client"

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { MapId } from "@/types"
import type { MatchEvent } from "@/types/match"
import { cn } from "@/lib/utils"
import { Map, ChevronUp, Minus, Plus, Maximize2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { RadarPlayerDot, RadarBombState, RadarKillLine, RadarSmoke, Point, RadarScriptPlayerInfo, RadarArt } from "@/lib/radar-types"
import type { Floor, RoundMap, RoundScript } from "@/engine/match/round-script-types"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { createRadarScene, prepareRadarScript, sampleRadarScene, sceneAliveCounts, sceneFromSnapshot, type PreparedRadarScript, type RadarScene } from "@/lib/radar-scene"
import { createRadarClock, clockSetPlayback, clockSetTick } from "@/lib/radar-clock"
import { radarArtFor } from "@/lib/radar-art"
import { reviewRound, reviewScript, reviewableRounds, type RadarReviewSource } from "@/lib/radar-review"
import { clampReviewTime, formatRoundClock, scrubberSpan } from "@/lib/radar-scrubber"
import type { RadarSite } from "@/lib/radar-draw"
import { roundMapBounds } from "@/lib/radar-view"
import { RadarCanvas, createRadarFeed, type RadarCanvasHandle, type RadarFeed } from "./RadarCanvas"
import { RadarScrubber } from "./RadarScrubber"

export type { RadarScriptPlayerInfo } from "@/lib/radar-types"
export type { RadarReviewSource } from "@/lib/radar-review"

interface MapRadarPanelProps {
    currentMapId: MapId
    mapName: string
    /** Snapshot mode: player dots of the current tick. */
    radarDots?: RadarPlayerDot[]
    /** Snapshot one playback tick ahead; dots glide toward it while animating. */
    nextRadarDots?: RadarPlayerDot[]
    tickDurationMs?: number
    isAnimating?: boolean
    bombState?: RadarBombState
    currentTime?: number
    killLines?: RadarKillLine[]
    sitePositions?: { a: Point; b: Point }
    smokes?: RadarSmoke[]
    /** Art override (physical replay); otherwise the baked radar art / fallback images. */
    referenceImages?: { primary: string; secondary?: string }
    positionSource?: 'estimated' | 'physical-replay'
    /**
     * Grow the radar to the panel's available height (the parent must give
     * the panel a definite height). Otherwise the radar is as wide as the panel.
     */
    fillHeight?: boolean
    /** The shown round is decided: no clutch banner, phase reads "ROUND OVER". */
    roundOver?: boolean
    /**
     * Round script of the shown round. When set (and `currentTime` ≥ 0) the
     * radar draws the script — players sampled every frame, deaths, shot
     * tracers, grenades and the bomb — instead of the snapshot props above.
     */
    script?: RoundScript | null
    /** Round map of the script: site letters and plant areas come from its bombsites. */
    roundMap?: RoundMap | null
    /** Names (and optional weapon / kit) by player id, for script mode. */
    players?: Readonly<Record<string, RadarScriptPlayerInfo>>
    /**
     * Optional: the recorded rounds of this map and the series context. Gives
     * HP (from the round's KILL damage) and weapons for the live round, and
     * lets the scrubber review earlier rounds of the map. Without it only the
     * live round can be reviewed and HP comes from `roundEvents`.
     */
    review?: RadarReviewSource | null
    /** Optional: the live round's events (HP from KILL damage) when `review` is not given. */
    roundEvents?: readonly MatchEvent[]
}

type ReviewUi = { active: boolean; round: number | null; playing: boolean }
const NO_REVIEW: ReviewUi = { active: false, round: null, playing: false }

function MapRadarPanelComponent({
    currentMapId, mapName, radarDots, nextRadarDots, tickDurationMs = 1000, isAnimating = false, bombState, currentTime,
    killLines, sitePositions, smokes, referenceImages, positionSource = 'estimated', fillHeight = false, roundOver = false,
    script, roundMap, players, review, roundEvents,
}: MapRadarPanelProps) {
    const panelId = useId().replace(/:/g, "")
    const [isExpanded, setIsExpanded] = useState(true)
    const [showNames, setShowNames] = useState(true)
    const [floorMode, setFloorMode] = useState<"auto" | Floor>("auto")
    const [shownFloor, setShownFloor] = useState<Floor>("upper")
    const [zoom, setZoom] = useState(1)
    const [canZoomIn, setCanZoomIn] = useState(true)
    const [reviewUi, setReviewUi] = useState<ReviewUi>(NO_REVIEW)
    const [reviewSecond, setReviewSecond] = useState(0)
    const staticEffects = useAppReducedMotion()
    const canvasRef = useRef<RadarCanvasHandle>(null)

    const art: RadarArt | undefined = useMemo(() => referenceImages
        ? { upper: referenceImages.primary, ...(referenceImages.secondary ? { lower: referenceImages.secondary } : {}) }
        : radarArtFor(currentMapId), [referenceImages, currentMapId])
    const isDualLevel = !!art?.lower

    // Script mode: the live match hands over the round script and the clock.
    const tick = currentTime != null && Number.isFinite(currentTime) ? currentTime : 0
    const activeScript = script && currentTime != null && currentTime >= 0 ? script : null

    // The live round's recorded result (events → HP, loadouts → weapons / kits).
    const liveRecord = activeScript ? reviewRound(review, activeScript.round) : undefined
    const events = liveRecord?.events ?? roundEvents
    const economy = liveRecord?.playerEconomy
    const livePrep: PreparedRadarScript | null = useMemo(
        () => (activeScript ? prepareRadarScript(activeScript, { events, economy, players }) : null),
        [activeScript, events, economy, players],
    )

    // Review: the live round, or an earlier round rebuilt on demand.
    const reviewPrep: PreparedRadarScript | null = useMemo(() => {
        if (!reviewUi.active || reviewUi.round === null) return null
        if (activeScript && reviewUi.round === activeScript.round) return livePrep
        if (!review) return null
        const s = reviewScript(review, currentMapId, reviewUi.round)
        if (!s) return null
        const rec = reviewRound(review, reviewUi.round)
        return prepareRadarScript(s, { events: rec?.events, economy: rec?.playerEconomy, players })
    }, [reviewUi.active, reviewUi.round, activeScript, livePrep, review, currentMapId, players])
    const reviewingLive = reviewUi.active && !!activeScript && reviewUi.round === activeScript.round
    const earlierRounds = useMemo(
        () => reviewableRounds(review).filter(r => !activeScript || r < activeScript.round),
        [review, activeScript],
    )
    // A round that cannot be rebuilt (or a finished live round without history) ends the review.
    useEffect(() => {
        if (reviewUi.active && !reviewPrep) setReviewUi(NO_REVIEW)
    }, [reviewUi.active, reviewPrep])

    // ─── Feed for the canvas (mutated, never React state per frame) ────────
    const [feedRef] = useState<{ current: RadarFeed }>(() => ({ current: createRadarFeed(createRadarClock(tick, 0)) }))
    const feed = feedRef.current

    useEffect(() => {
        clockSetTick(feed.clock, tick, performance.now())
        feed.version++
    }, [feed, tick])
    // Reduced motion: dots step once per game tick instead of gliding between ticks.
    const animate = isAnimating && !staticEffects
    useEffect(() => {
        clockSetPlayback(feed.clock, animate, tickDurationMs, performance.now())
    }, [feed, animate, tickDurationMs])
    useEffect(() => {
        feed.prep = livePrep
        feed.snapshot = livePrep ? null : radarDots || killLines || smokes || bombState
            ? { dots: radarDots, nextDots: nextRadarDots, killLines, smokes, bomb: bombState }
            : null
        feed.version++
    }, [feed, livePrep, radarDots, nextRadarDots, killLines, smokes, bombState])
    useEffect(() => {
        const r = feed.review
        r.active = reviewUi.active && !!reviewPrep
        r.prep = reviewPrep
        r.live = reviewingLive
        r.playing = reviewUi.playing
        r.lastMs = performance.now()
        feed.version++
    }, [feed, reviewUi, reviewPrep, reviewingLive])

    // A new map starts on "auto", live, unzoomed.
    useEffect(() => {
        setFloorMode("auto")
        setReviewUi(NO_REVIEW)
        canvasRef.current?.resetView()
    }, [currentMapId])

    // ─── Header / footer state at the shown time (per tick, not per frame) ──
    const shownT = reviewUi.active && reviewPrep ? reviewSecond : tick
    const headerScene: RadarScene | null = useMemo(() => {
        const s = createRadarScene()
        if (reviewUi.active && reviewPrep) return sampleRadarScene(reviewPrep, shownT, s)
        if (livePrep) return sampleRadarScene(livePrep, tick, s)
        if (radarDots || bombState) return sceneFromSnapshot({ t: tick, dots: radarDots, bomb: bombState }, s)
        return null
    }, [reviewUi.active, reviewPrep, shownT, livePrep, tick, radarDots, bombState])
    const alive = headerScene ? sceneAliveCounts(headerScene) : { CT: 0, T: 0 }
    const ctAlive = alive.CT
    const tAlive = alive.T
    const shownOver = reviewUi.active ? !reviewingLive || roundOver : roundOver

    // Clutch detection (live rounds only: after the round ends it would
    // label the end-of-round survivors, e.g. "1v4" after a bomb win).
    const clutchText = !shownOver && !reviewUi.active
        ? ctAlive === 1 && tAlive >= 2 ? `1v${tAlive} CLUTCH` : tAlive === 1 && ctAlive >= 2 ? `1v${ctAlive} CLUTCH` : null
        : null
    const clutchSide = ctAlive === 1 && tAlive >= 2 ? "ct" : "t"

    const roundPhase = (() => {
        const bomb = headerScene?.bomb
        if (bomb && bomb.phase !== "none") {
            const site = bomb.site ? ` ${bomb.site}` : ""
            if (bomb.phase === "defused") return { label: "DEFUSED", color: "#5AA9FF" }
            if (bomb.phase === "exploded") return { label: "BOMB EXPLODED", color: "#FF8A3D" }
            if (shownOver && !reviewUi.active) return { label: "ROUND OVER", color: "#AEB6C2" }
            if (bomb.phase === "defusing") return { label: `DEFUSING${site}`, color: "#5AA9FF" }
            if (bomb.phase === "planted") return { label: `BOMB PLANTED${site}`, color: "#FF5468" }
        }
        if (shownOver && !reviewUi.active) return { label: "ROUND OVER", color: "#AEB6C2" }
        if (positionSource === 'physical-replay') return { label: "REPLAY", color: "#AEB6C2" }
        if (!reviewUi.active && currentTime != null && currentTime <= 3) return { label: "FREEZE TIME", color: "#5AA9FF" }
        if (reviewUi.active) return null
        return { label: "LIVE", color: "#3DD68C" }
    })()

    // Bombsites: the round map's (plant area + letter), else the caller's positions.
    const sites: RadarSite[] = useMemo(() => {
        if (roundMap) {
            return (["A", "B"] as const).map(id => {
                const site = roundMap.sites[id]
                return { id, x: site.center.x, y: site.center.y, floor: site.center.floor, polygon: site.polygon }
            })
        }
        const ok = (p: Point | undefined) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
        if (sitePositions && ok(sitePositions.a) && ok(sitePositions.b)) {
            return [{ id: "A", x: sitePositions.a.x, y: sitePositions.a.y }, { id: "B", x: sitePositions.b.x, y: sitePositions.b.y }]
        }
        return []
    }, [roundMap, sitePositions])

    const contentBounds = useMemo(() => roundMapBounds(roundMap), [roundMap])

    // ─── Review actions ────────────────────────────────────────────────────
    const frameListener = useRef<((t: number, liveT: number) => void) | null>(null)
    const registerFrame = useCallback((fn: ((t: number, liveT: number) => void) | null) => { frameListener.current = fn }, [])
    const lastReviewSecond = useRef(-1)
    const onFrame = useCallback((t: number, liveT: number) => {
        frameListener.current?.(t, liveT)
        if (feed.review.active) {
            const sec = Math.floor(t)
            if (sec !== lastReviewSecond.current) { lastReviewSecond.current = sec; setReviewSecond(sec) }
        }
    }, [feed])

    const onScrub = useCallback((t: number) => {
        // Scrubbing the live round does not touch the match clock; it is limited to what has happened.
        const round = reviewUi.active ? reviewUi.round : activeScript?.round ?? null
        const live = !!activeScript && round === activeScript.round
        const prep = live ? livePrep : reviewPrep
        if (!prep || round === null) return
        const liveT = Math.max(0, feed.clock.tick + feed.clock.alpha)
        // A decided live round is fully known: the whole round can be scrubbed.
        const limited = live && !roundOver
        feed.review.t = clampReviewTime(t, scrubberSpan(prep, limited ? liveT : undefined), limited ? liveT : undefined)
        feed.review.active = true
        feed.review.prep = prep
        feed.review.live = live
        feed.review.playing = false
        feed.version++
        if (!reviewUi.active || reviewUi.playing || reviewUi.round !== round) setReviewUi({ active: true, round, playing: false })
    }, [reviewUi, activeScript, livePrep, reviewPrep, feed, roundOver])
    const onSelectRound = useCallback((round: number | null) => {
        if (round === null) { setReviewUi(NO_REVIEW); return }
        feed.review.t = 0
        lastReviewSecond.current = -1
        setReviewUi({ active: true, round, playing: true })
    }, [feed])
    const onTogglePlay = useCallback(() => {
        if (!reviewUi.active) {
            // Replay the live round from its start; it returns to live when it catches up.
            if (!activeScript) return
            feed.review.t = 0
            lastReviewSecond.current = -1
            setReviewUi({ active: true, round: activeScript.round, playing: true })
            return
        }
        if (!reviewUi.playing && reviewPrep && !reviewingLive && feed.review.t >= reviewPrep.endTime - 0.05) feed.review.t = 0
        setReviewUi(r => ({ ...r, playing: !r.playing }))
    }, [reviewUi, reviewPrep, reviewingLive, activeScript, feed])
    const onBackToLive = useCallback(() => setReviewUi(NO_REVIEW), [])
    const onReviewEnd = useCallback((caughtUp: boolean) => {
        if (caughtUp) setReviewUi(NO_REVIEW)
        else setReviewUi(r => ({ ...r, playing: false }))
    }, [])

    const onFloorChange = useCallback((f: Floor) => setShownFloor(f), [])
    const onZoomChange = useCallback((z: number, canIn: boolean) => { setZoom(z); setCanZoomIn(canIn) }, [])

    if (!art) return null

    const scrubberRound = reviewUi.active ? reviewUi.round : activeScript?.round ?? null
    const scrubberPrep = reviewUi.active ? reviewPrep : livePrep
    const source = activeScript ? "round-script" : radarDots ? "snapshot" : undefined
    const floorLabel = isDualLevel ? (shownFloor === "upper" ? "Upper floor" : "Lower floor") : "Single level"
    const ariaLabel = `${mapName} radar${headerScene ? `: CT ${ctAlive} alive, T ${tAlive} alive` : ""}${roundPhase ? `, ${roundPhase.label.toLowerCase()}` : ""}`

    return (
        <div className={cn("map-radar-panel overflow-hidden rounded-lg border border-line bg-panel", fillHeight && "flex h-full min-h-0 flex-col")}>
            {/* One compact header row: title, round phase, then view controls. */}
            <div className="radar-panel-header flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-1.5">
                <button type="button" onClick={() => setIsExpanded(!isExpanded)} aria-label={`${mapName} radar`} aria-expanded={isExpanded} aria-controls={panelId}
                    className="flex min-h-8 items-center gap-2 text-left text-sm font-semibold text-ink-1">
                    <Map size={16} className="text-ink-3" />
                    <span>{mapName} <span className="font-normal text-ink-3">radar</span></span>
                    <ChevronUp size={14} className={cn("text-ink-3 transition-transform", !isExpanded && "rotate-180")} />
                </button>
                {isExpanded && reviewUi.active && <span className="rounded-sm bg-gold/15 px-1.5 py-0.5 text-[11px] font-bold tracking-[0.06em] text-gold">REVIEW · R{scrubberRound ?? "–"} {formatRoundClock(shownT)}</span>}
                {isExpanded && roundPhase && <span className="rounded-sm px-1.5 py-0.5 text-[11px] font-bold tracking-[0.06em]" style={{ backgroundColor: `${roundPhase.color}20`, color: roundPhase.color }}>{roundPhase.label}</span>}
                {isExpanded && <div className="ml-auto flex flex-wrap items-center gap-2">
                    {isDualLevel && <div role="group" aria-label="Radar floor" className="flex items-center gap-1">
                        {(["auto", "upper", "lower"] as const).map(level => <button key={level} type="button"
                            onClick={() => setFloorMode(level)}
                            aria-pressed={floorMode === level}
                            className={cn("min-h-7 rounded px-2 text-xs capitalize", floorMode === level ? "bg-hover text-ink-1" : "text-ink-3 hover:text-ink-1")}>
                            {level}
                        </button>)}
                    </div>}
                    <button type="button" aria-pressed={showNames} onClick={() => setShowNames(value => !value)} className="min-h-7 rounded px-2 text-xs text-ink-2 hover:bg-hover hover:text-ink-1">Names {showNames ? "on" : "off"}</button>
                    <div role="group" aria-label="Radar zoom" className="flex items-center gap-1 text-xs text-ink-2">
                        <button type="button" aria-label="Zoom radar out" disabled={zoom <= 1.001} onClick={() => canvasRef.current?.zoomBy(1 / 1.5)} className="rounded p-1.5 hover:bg-hover disabled:opacity-40"><Minus size={14} /></button>
                        <span className="w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                        <button type="button" aria-label="Zoom radar in" disabled={!canZoomIn} onClick={() => canvasRef.current?.zoomBy(1.5)} className="rounded p-1.5 hover:bg-hover disabled:opacity-40"><Plus size={14} /></button>
                        <button type="button" aria-label="Reset radar view" title="Reset view (double-click the radar)" disabled={zoom <= 1.001} onClick={() => canvasRef.current?.resetView()} className="rounded p-1.5 hover:bg-hover disabled:opacity-40"><Maximize2 size={13} /></button>
                    </div>
                </div>}
            </div>

            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        id={panelId}
                        initial={false}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className={cn("overflow-hidden", fillHeight && "flex min-h-0 flex-1 flex-col")}
                    >
                        {/* fillHeight: the frame is the largest square that fits (container query units). */}
                        <div className={cn("flex justify-center px-3 py-2", fillHeight && "min-h-0 flex-1 items-center")} style={fillHeight ? { containerType: "size" } : undefined}>
                            <div className={cn("radar-canvas-frame relative mx-auto aspect-square", !fillHeight && "w-full")}
                                style={fillHeight ? { width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" } : undefined}
                                data-radar-source={source}>
                                <RadarCanvas
                                    ref={canvasRef}
                                    feed={feedRef}
                                    art={art}
                                    sites={sites}
                                    contentBounds={contentBounds}
                                    dualLevel={isDualLevel}
                                    floorMode={floorMode}
                                    showNames={showNames}
                                    reducedMotion={staticEffects}
                                    ariaLabel={ariaLabel}
                                    onFloorChange={onFloorChange}
                                    onZoomChange={onZoomChange}
                                    onFrame={onFrame}
                                    onReviewEnd={onReviewEnd}
                                />
                                {clutchText && (
                                    <div className={cn("pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded bg-ink/80 px-3 py-1 font-display text-lg font-bold tracking-[0.06em]", clutchSide === "ct" ? "text-side-ct" : "text-side-t")}>
                                        {clutchText}
                                    </div>
                                )}
                            </div>
                        </div>
                        {livePrep && (
                            <RadarScrubber
                                prep={scrubberPrep}
                                isLiveRound={(!reviewUi.active || reviewingLive) && !roundOver}
                                liveTick={Math.max(0, Math.floor(tick))}
                                roundNumber={scrubberRound}
                                liveRoundNumber={activeScript?.round ?? null}
                                earlierRounds={earlierRounds}
                                reviewActive={reviewUi.active}
                                playing={reviewUi.playing}
                                registerFrame={registerFrame}
                                onScrub={onScrub}
                                onSelectRound={onSelectRound}
                                onTogglePlay={onTogglePlay}
                                onBackToLive={onBackToLive}
                            />
                        )}
                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-ink-3">
                            <span className="flex items-center gap-3"><span className="font-semibold text-side-ct"><span aria-hidden="true">● </span>CT {ctAlive}</span><span className="font-semibold text-side-t"><span aria-hidden="true">◆ </span>T {tAlive}</span><span>alive</span></span>
                            <span title={positionSource === 'physical-replay' ? 'Recorded physical simulation snapshots. This rehearsal does not settle the career match.' : activeScript ? 'Positions follow the round script: routes, duels, grenades and the bomb are placed to match what happened in the round. Scroll to zoom, drag to pan, click a player to highlight.' : 'Career match positions are estimated from recorded round events.'}>
                                {positionSource === 'physical-replay' ? 'Recorded positions' : activeScript ? 'Round script' : 'Estimated positions'} · {floorLabel}
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export const MapRadarPanel = memo(MapRadarPanelComponent)
