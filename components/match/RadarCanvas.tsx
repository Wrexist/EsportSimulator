"use client"

import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from "react"
import type { Floor } from "@/engine/match/round-script-types"
import { RadarRenderer, imageContentBounds, type RadarSite } from "@/lib/radar-draw"
import { createRadarScene, sampleRadarScene, sceneAliveCounts, sceneFromSnapshot, type PreparedRadarScript, type RadarScene, type SnapshotInput } from "@/lib/radar-scene"
import { clockTime, type RadarClock } from "@/lib/radar-clock"
import type { LiveTimeSource } from "@/lib/live-clock"
import { sceneAutoFloor } from "@/lib/radar-level-selector"
import { DEFAULT_VIEW, MAX_ZOOM, fitView, panBy, zoomAt, type RadarBounds, type RadarView } from "@/lib/radar-view"
import type { RadarArt } from "@/lib/radar-types"

/**
 * What the canvas draws, owned (and mutated) by the radar panel. The canvas
 * reads it on every animation frame; the panel writes it when its props
 * change, so playback never goes through React state.
 */
export interface RadarFeed {
    /** The live round (script mode). */
    prep: PreparedRadarScript | null
    /** Snapshot mode input (time comes from the clock). */
    snapshot: Omit<SnapshotInput, "t" | "alpha"> | null
    /** Tick clock: glides between the panel's `currentTime` ticks (used without `source`). */
    clock: RadarClock
    /** Continuous round clock (the live match), sampled every frame; null = the tick clock. */
    source: LiveTimeSource | null
    /**
     * Reduced motion with a continuous clock: step once per round second, and
     * at the panel's `currentTime` (the screen's reveal time) in between.
     */
    stepped: boolean
    /**
     * Wall ms (performance.now()) when the shown round was decided, -1 while it
     * plays: transient effects keep fading for up to AFTERGLOW_SECONDS after it
     * instead of freezing on the last frame.
     */
    settledAt: number
    review: {
        active: boolean
        prep: PreparedRadarScript | null
        t: number
        playing: boolean
        /** Reviewing the live round: playback stops when it catches up with the match. */
        live: boolean
        lastMs: number
    }
    /** Bump to force a redraw. */
    version: number
}

export function createRadarFeed(clock: RadarClock): RadarFeed {
    return { prep: null, snapshot: null, clock, source: null, stepped: false, settledAt: -1, review: { active: false, prep: null, t: 0, playing: false, live: false, lastMs: 0 }, version: 0 }
}

/** Live round time the feed shows at wall-clock `now`. */
export function feedLiveTime(feed: RadarFeed, now = performance.now()): number {
    if (!feed.source) return clockTime(feed.clock, now)
    const t = feed.source.now(now)
    return feed.stepped ? Math.max(clockTime(feed.clock, now), Math.floor(t)) : t
}

/**
 * Seconds the scene keeps aging after the round is decided: longer than every
 * transient effect (tracer 1.2 s, hit 0.8 s, pop 0.7 s, death burst 0.6 s).
 */
export const AFTERGLOW_SECONDS = 1.5

export interface RadarCanvasHandle {
    zoomBy(factor: number): void
    resetView(): void
    invalidate(): void
}

interface RadarCanvasProps {
    feed: React.MutableRefObject<RadarFeed>
    art: RadarArt | undefined
    sites: RadarSite[]
    /** Where players can be (round map); the home view frames it. Else the art's opaque area. */
    contentBounds?: RadarBounds | null
    dualLevel: boolean
    /** "auto" follows the action; otherwise the chosen floor. */
    floorMode: "auto" | Floor
    showNames: boolean
    reducedMotion: boolean
    ariaLabel: string
    /** The floor shown changed (auto-follow). */
    onFloorChange?: (floor: Floor) => void
    /** Zoom relative to the home view (1 = fit), and whether it can zoom in further. */
    onZoomChange?: (zoom: number, canZoomIn: boolean) => void
    /** Called every drawn frame with the shown time and the live time (scrubber playhead). */
    onFrame?: (t: number, liveT: number) => void
    /** Review playback reached the live match (or the end of the round). */
    onReviewEnd?: (caughtUp: boolean) => void
}

interface PerfStats { n: number; sum: number; max: number; samples: number[]; drawn: number; skipped: number; flush: boolean }

declare global {
    interface Window { __radarPerf?: PerfStats }
}

const WHEEL_ZOOM = 0.0016

function RadarCanvasInner(props: RadarCanvasProps, ref: React.ForwardedRef<RadarCanvasHandle>) {
    const wrapRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const rendererRef = useRef<RadarRenderer | null>(null)
    const sceneRef = useRef<RadarScene>(createRadarScene())
    const viewRef = useRef<RadarView>(DEFAULT_VIEW)
    /** Fit-to-content view (the art's opaque area); reset and zoom-out return here. */
    const homeRef = useRef<RadarView>(DEFAULT_VIEW)
    const selectedRef = useRef<string | null>(null)
    const floorRef = useRef<Floor>(props.floorMode === "auto" ? "upper" : props.floorMode)
    const dirtyRef = useRef(true)
    const propsRef = useRef(props)
    propsRef.current = props

    useImperativeHandle(ref, () => ({
        zoomBy(factor: number) {
            const r = rendererRef.current
            if (!r) return
            setView(zoomAt(viewRef.current, factor, r.width / 2, r.height / 2, r.width, r.height, homeRef.current))
        },
        resetView() { setView(homeRef.current) },
        invalidate() { dirtyRef.current = true },
    }), [])

    const imageBoundsRef = useRef<RadarBounds | null>(null)
    /** Home view from the content bounds (round map) or the art; follows it if the view is at home. */
    function applyHome() {
        const box = propsRef.current.contentBounds ?? imageBoundsRef.current
        if (!box) return
        const atHome = viewRef.current === homeRef.current
        homeRef.current = fitView(box)
        if (atHome) setView(homeRef.current)
    }

    function setView(view: RadarView) {
        if (view === viewRef.current) return
        viewRef.current = view
        rendererRef.current?.setView(view)
        dirtyRef.current = true
        propsRef.current.onZoomChange?.(view.zoom / homeRef.current.zoom, view.zoom < MAX_ZOOM - 1e-6)
    }

    // Any prop change redraws once.
    useEffect(() => { dirtyRef.current = true }, [props.showNames, props.reducedMotion, props.floorMode, props.dualLevel])

    // Renderer, size and the animation loop.
    useEffect(() => {
        const canvas = canvasRef.current, wrap = wrapRef.current
        if (!canvas || !wrap) return
        let renderer: RadarRenderer
        try {
            renderer = new RadarRenderer(canvas)
        } catch {
            return // No 2D canvas (tests, very old engines): the panel still shows its controls.
        }
        rendererRef.current = renderer
        renderer.setView(viewRef.current)
        const resize = () => {
            const rect = wrap.getBoundingClientRect()
            if (renderer.resize(rect.width, rect.height, Math.min(3, window.devicePixelRatio || 1))) dirtyRef.current = true
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(wrap)
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
        const onFonts = () => { renderer.clearSprites(); dirtyRef.current = true }
        fonts?.ready.then(onFonts).catch(() => { })
        fonts?.addEventListener?.("loadingdone", onFonts)

        // Dev builds keep frame timings on window.__radarPerf (tools may replace the object).
        const measure = process.env.NODE_ENV !== "production"
        if (measure) window.__radarPerf ??= { n: 0, sum: 0, max: 0, samples: [], drawn: 0, skipped: 0, flush: false }

        let raf = 0
        let lastT = NaN, lastFloor: Floor | null = null, lastVersion = -1, lastAnimMs = 0, animating = false
        let lastSel: string | null = null, lastNames: boolean | null = null
        const attrs = { deaths: -1, tracers: -1, bomb: "", smokes: -1, molotovs: -1, ct: -1, t: -1, floor: "", review: "" }

        const frame = (now: number) => {
            raf = requestAnimationFrame(frame)
            const perf: PerfStats | undefined = measure ? window.__radarPerf : undefined
            const p = propsRef.current
            const feed = p.feed.current
            const review = feed.review
            const liveT = feedLiveTime(feed, now)

            // Time shown: the review time, or the live clock.
            let t = liveT
            let prep = feed.prep
            if (review.active) {
                prep = review.prep
                if (review.playing) {
                    const dt = Math.min(0.25, Math.max(0, (now - review.lastMs) / 1000))
                    review.t += dt
                    const end = review.live ? liveT : (prep?.endTime ?? review.t)
                    if (review.t >= end) {
                        review.t = end
                        review.playing = false
                        p.onReviewEnd?.(review.live)
                    }
                }
                review.lastMs = now
                t = review.t
            }

            // A decided round: effects finish fading (players stay put: their
            // tracks end with the round). Reduced motion: they end at once.
            const afterglow = review.active || feed.settledAt < 0 ? 0
                : p.reducedMotion ? AFTERGLOW_SECONDS
                    : Math.min(AFTERGLOW_SECONDS, Math.max(0, (now - feed.settledAt) / 1000))
            const sceneT = t + afterglow

            const scene = sceneRef.current
            if (prep) sampleRadarScene(prep, sceneT, scene)
            else if (feed.snapshot && !review.active) sceneFromSnapshot({ ...feed.snapshot, t: Math.floor(liveT), alpha: liveT - Math.floor(liveT) }, scene)
            else scene.playerCount = scene.deathCount = scene.tracerCount = scene.hitCount = scene.shotCount = scene.utilityCount = scene.grenadeCount = 0, scene.bomb.phase = "none", scene.bomb.hasPos = false
            const hasScene = !!prep || (!!feed.snapshot && !review.active)

            // Floor: manual, or follow the action.
            const floor: Floor = !p.dualLevel ? "upper" : p.floorMode === "auto" ? sceneAutoFloor(scene, floorRef.current, true) : p.floorMode
            if (floor !== floorRef.current) {
                floorRef.current = floor
                p.onFloorChange?.(floor)
            }

            const changed = dirtyRef.current || sceneT !== lastT || floor !== lastFloor || feed.version !== lastVersion
                || selectedRef.current !== lastSel || p.showNames !== lastNames
            const wallClockDue = animating && now - lastAnimMs >= (sceneT === lastT ? 33 : 0)
            if (!changed && !wallClockDue) {
                if (perf) perf.skipped++
                return
            }
            dirtyRef.current = false
            lastT = sceneT; lastFloor = floor; lastVersion = feed.version; lastSel = selectedRef.current; lastNames = p.showNames; lastAnimMs = now

            const t0 = perf ? performance.now() : 0
            animating = renderer.draw(hasScene ? scene : null, {
                level: floor, dualLevel: p.dualLevel, showNames: p.showNames, reducedMotion: p.reducedMotion,
                nowMs: now, selectedId: selectedRef.current,
            })
            if (perf) {
                // Optionally force the raster so the number includes it (software rendering).
                if (perf.flush) renderer.canvas.getContext("2d")?.getImageData(0, 0, 1, 1)
                const ms = performance.now() - t0
                perf.n++; perf.sum += ms; perf.drawn++
                if (ms > perf.max) perf.max = ms
                if (perf.samples.length >= 600) perf.samples.shift()
                perf.samples.push(ms)
            }
            p.onFrame?.(t, liveT)

            // Cheap state mirror for tooling and tests (written only on change).
            const el = wrap
            let smokes = 0, molotovs = 0
            for (let i = 0; i < scene.utilityCount; i++) {
                if (scene.utility[i].kind === "smoke") smokes++
                else if (scene.utility[i].kind === "molotov") molotovs++
            }
            const alive = sceneAliveCounts(scene)
            const set = (name: string, key: keyof typeof attrs, value: number | string) => {
                if (attrs[key] === value) return
                ;(attrs as Record<string, number | string>)[key] = value
                el.setAttribute(name, String(value))
            }
            set("data-deaths", "deaths", scene.deathCount)
            set("data-tracers", "tracers", scene.tracerCount)
            set("data-bomb", "bomb", hasScene ? scene.bomb.phase : "none")
            set("data-smokes", "smokes", smokes)
            set("data-molotovs", "molotovs", molotovs)
            set("data-alive-ct", "ct", alive.CT)
            set("data-alive-t", "t", alive.T)
            set("data-floor", "floor", floor)
            set("data-review", "review", review.active ? "on" : "off")
        }
        raf = requestAnimationFrame(frame)

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            fonts?.removeEventListener?.("loadingdone", onFonts)
            rendererRef.current = null
        }
    }, [])

    // Map art per floor.
    const upper = props.art?.upper, lower = props.art?.lower, baked = !!props.art?.baked
    useEffect(() => {
        const r = rendererRef.current
        if (!r) return
        r.setArtStyle(baked)
        let cancelled = false
        const bounds: Partial<Record<Floor, RadarBounds | null>> = {}
        // Without round-map bounds the home view fits both floors' opaque art.
        const refit = () => {
            const boxes = [bounds.upper, bounds.lower].filter((b): b is RadarBounds => !!b)
            imageBoundsRef.current = boxes.length
                ? boxes.reduce((a, b) => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) }))
                : null
            applyHome()
        }
        const load = (floor: Floor, src: string | undefined) => {
            r.setImage(floor, null)
            if (!src) return
            const img = new Image()
            img.decoding = "async"
            img.onload = () => {
                if (cancelled) return
                r.setImage(floor, img)
                bounds[floor] = imageContentBounds(img)
                refit()
                dirtyRef.current = true
            }
            img.src = src
        }
        load("upper", upper)
        load("lower", lower)
        dirtyRef.current = true
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- applyHome reads refs only
    }, [upper, lower, baked])

    useEffect(() => {
        rendererRef.current?.setSites(props.sites)
        dirtyRef.current = true
    }, [props.sites])

    const cb = props.contentBounds
    useEffect(() => {
        applyHome()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- applyHome reads refs only
    }, [cb?.minX, cb?.minY, cb?.maxX, cb?.maxY])

    // Wheel zoom (non-passive so the page does not scroll), drag to pan, click to select.
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const local = (e: { clientX: number; clientY: number }) => {
            const rect = canvas.getBoundingClientRect()
            return { x: e.clientX - rect.left, y: e.clientY - rect.top }
        }
        const onWheel = (e: WheelEvent) => {
            const r = rendererRef.current
            if (!r) return
            e.preventDefault()
            const { x, y } = local(e)
            const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
            setView(zoomAt(viewRef.current, Math.exp(-delta * WHEEL_ZOOM), x, y, r.width, r.height, homeRef.current))
        }
        let drag: { id: number; x: number; y: number; moved: boolean } | null = null
        const onDown = (e: PointerEvent) => {
            if (e.button !== 0) return
            drag = { id: e.pointerId, ...local(e), moved: false }
            canvas.setPointerCapture?.(e.pointerId)
        }
        const onMove = (e: PointerEvent) => {
            const r = rendererRef.current
            if (!drag || drag.id !== e.pointerId || !r) return
            const at = local(e)
            const dx = at.x - drag.x, dy = at.y - drag.y
            if (!drag.moved && Math.hypot(dx, dy) < 4) return
            drag.moved = true
            drag.x = at.x; drag.y = at.y
            setView(panBy(viewRef.current, dx, dy, r.width, r.height, homeRef.current))
            canvas.style.cursor = "grabbing"
        }
        const onUp = (e: PointerEvent) => {
            if (!drag || drag.id !== e.pointerId) return
            const wasDrag = drag.moved
            drag = null
            canvas.style.cursor = ""
            if (wasDrag) return
            const r = rendererRef.current
            const { x, y } = local(e)
            const hit = r?.hitTest(sceneRef.current, x, y, 16, floorRef.current, propsRef.current.dualLevel) ?? null
            selectedRef.current = hit && hit !== selectedRef.current ? hit : null
            dirtyRef.current = true
        }
        const onDouble = () => setView(homeRef.current)
        canvas.addEventListener("wheel", onWheel, { passive: false })
        canvas.addEventListener("pointerdown", onDown)
        canvas.addEventListener("pointermove", onMove)
        canvas.addEventListener("pointerup", onUp)
        canvas.addEventListener("pointercancel", onUp)
        canvas.addEventListener("dblclick", onDouble)
        return () => {
            canvas.removeEventListener("wheel", onWheel)
            canvas.removeEventListener("pointerdown", onDown)
            canvas.removeEventListener("pointermove", onMove)
            canvas.removeEventListener("pointerup", onUp)
            canvas.removeEventListener("pointercancel", onUp)
            canvas.removeEventListener("dblclick", onDouble)
        }
    }, [])

    const onKeyDown = (e: React.KeyboardEvent) => {
        const r = rendererRef.current
        if (!r) return
        const step = 40
        const home = homeRef.current
        let next: RadarView | null = null
        if (e.key === "+" || e.key === "=") next = zoomAt(viewRef.current, 1.25, r.width / 2, r.height / 2, r.width, r.height, home)
        else if (e.key === "-" || e.key === "_") next = zoomAt(viewRef.current, 0.8, r.width / 2, r.height / 2, r.width, r.height, home)
        else if (e.key === "0") next = home
        else if (e.key === "ArrowLeft") next = panBy(viewRef.current, step, 0, r.width, r.height, home)
        else if (e.key === "ArrowRight") next = panBy(viewRef.current, -step, 0, r.width, r.height, home)
        else if (e.key === "ArrowUp") next = panBy(viewRef.current, 0, step, r.width, r.height, home)
        else if (e.key === "ArrowDown") next = panBy(viewRef.current, 0, -step, r.width, r.height, home)
        if (!next) return
        e.preventDefault()
        setView(next)
    }

    return (
        <div ref={wrapRef} className="relative h-full w-full overflow-hidden rounded-md bg-[#0B0E13] ring-1 ring-line" data-radar-canvas="">
            <canvas
                ref={canvasRef}
                className="block h-full w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-gold"
                role="img"
                aria-label={props.ariaLabel}
                tabIndex={0}
                onKeyDown={onKeyDown}
            />
        </div>
    )
}

export const RadarCanvas = memo(forwardRef(RadarCanvasInner))
