"use client"

import { memo, useEffect, useMemo, useRef } from "react"
import { ChevronLeft, ChevronRight, Pause, Play, Radio } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PreparedRadarScript } from "@/lib/radar-scene"
import { formatRoundClock, scrubberSpan, scrubberTicks, type ScrubTick } from "@/lib/radar-scrubber"

const SIDE_COLOR = { CT: "#5AA9FF", T: "#FF8A3D" } as const
const UTILITY_COLOR = { smoke: "#C9CFD7", flash: "#FFFFFF", molotov: "#FF7A1A", he: "#B5E06A" } as const

export interface RadarScrubberProps {
    /** Round shown on the timeline (the reviewed one, or the live one). */
    prep: PreparedRadarScript | null
    /** The timeline shows the live round: ticks and scrubbing stop at the live time. */
    isLiveRound: boolean
    /** Live clock in whole game seconds (filters live ticks). */
    liveTick: number
    roundNumber: number | null
    liveRoundNumber: number | null
    /** Earlier rounds that can be reviewed. */
    earlierRounds: readonly number[]
    reviewActive: boolean
    playing: boolean
    /** Registers the per-frame playhead updater (time shown, live time). */
    registerFrame: (fn: ((t: number, liveT: number) => void) | null) => void
    onScrub: (t: number) => void
    onSelectRound: (round: number | null) => void
    onTogglePlay: () => void
    onBackToLive: () => void
}

function RadarScrubberComponent(p: RadarScrubberProps) {
    const trackRef = useRef<HTMLDivElement>(null)
    const headRef = useRef<HTMLDivElement>(null)
    const fillRef = useRef<HTMLDivElement>(null)
    const timeRef = useRef<HTMLSpanElement>(null)
    const sliderRef = useRef<HTMLDivElement>(null)
    const shownRef = useRef(0)
    const liveRef = useRef(0)

    const upTo = p.isLiveRound ? p.liveTick : Infinity
    const ticks: ScrubTick[] = useMemo(() => (p.prep ? scrubberTicks(p.prep, upTo) : []), [p.prep, upTo])
    const span = useMemo(() => (p.prep ? scrubberSpan(p.prep, p.isLiveRound ? p.liveTick : undefined) : 115), [p.prep, p.isLiveRound, p.liveTick])
    const spanRef = useRef(span)
    spanRef.current = span

    // Playhead, filled bar and clock follow the canvas every frame (no React state).
    const { registerFrame } = p
    useEffect(() => {
        let lastSecond = -1
        registerFrame((t, liveT) => {
            shownRef.current = t
            liveRef.current = liveT
            const s = spanRef.current
            const pct = `${Math.max(0, Math.min(100, (t / s) * 100))}%`
            if (headRef.current) headRef.current.style.left = pct
            if (fillRef.current) fillRef.current.style.width = `${Math.max(0, Math.min(100, (liveT / s) * 100))}%`
            const sec = Math.floor(t)
            if (sec !== lastSecond && timeRef.current) {
                lastSecond = sec
                timeRef.current.textContent = formatRoundClock(t)
                sliderRef.current?.setAttribute("aria-valuenow", String(sec))
                sliderRef.current?.setAttribute("aria-valuetext", formatRoundClock(t))
            }
        })
        return () => registerFrame(null)
    }, [registerFrame])

    const limit = () => (p.isLiveRound ? Math.min(spanRef.current, liveRef.current) : spanRef.current)
    const timeAt = (clientX: number) => {
        const rect = trackRef.current?.getBoundingClientRect()
        if (!rect || rect.width <= 0) return 0
        const t = ((clientX - rect.left) / rect.width) * spanRef.current
        return Math.max(0, Math.min(limit(), t))
    }

    const dragging = useRef(false)
    const onPointerDown = (e: React.PointerEvent) => {
        if (!p.prep || e.button !== 0) return
        dragging.current = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
        p.onScrub(timeAt(e.clientX))
    }
    const onPointerMove = (e: React.PointerEvent) => {
        if (dragging.current) p.onScrub(timeAt(e.clientX))
    }
    const onPointerUp = () => { dragging.current = false }

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (!p.prep) return
        const step = e.shiftKey ? 5 : 1
        let t: number | null = null
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") t = shownRef.current - step
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") t = shownRef.current + step
        else if (e.key === "Home") t = 0
        else if (e.key === "End") t = limit()
        else if (e.key === "Escape" && p.reviewActive) { e.preventDefault(); p.onBackToLive(); return }
        if (t === null) return
        e.preventDefault()
        e.stopPropagation()
        p.onScrub(Math.max(0, Math.min(limit(), t)))
    }

    const earlier = p.earlierRounds
    const shownRound = p.roundNumber
    const prevRound = (() => {
        if (shownRound === null) return earlier.length ? earlier[earlier.length - 1] : null
        const before = earlier.filter(r => r < shownRound)
        return before.length ? before[before.length - 1] : null
    })()
    const nextRound = (() => {
        if (shownRound === null || p.isLiveRound) return undefined
        const after = earlier.filter(r => r > shownRound)
        return after.length ? after[0] : null // null = the live round
    })()

    return (
        <div className="radar-scrubber flex shrink-0 items-center gap-2 border-t border-line px-3 py-1.5" data-review={p.reviewActive ? "on" : "off"}>
            <div className="flex items-center gap-0.5" role="group" aria-label="Round to review">
                <button type="button" aria-label="Review the previous round" disabled={prevRound === null}
                    onClick={() => prevRound !== null && p.onSelectRound(prevRound)}
                    className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink-1 disabled:opacity-30">
                    <ChevronLeft size={14} />
                </button>
                <span className="min-w-[2.75rem] text-center text-xs font-semibold tabular-nums text-ink-1">
                    {shownRound !== null ? `R${shownRound}` : "R–"}
                </span>
                <button type="button" aria-label={nextRound === null ? "Back to the live round" : "Review the next round"} disabled={nextRound === undefined}
                    onClick={() => nextRound === null ? p.onBackToLive() : nextRound !== undefined && p.onSelectRound(nextRound)}
                    className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink-1 disabled:opacity-30">
                    <ChevronRight size={14} />
                </button>
            </div>
            <button type="button" aria-label={p.playing ? "Pause review" : "Play review"} disabled={!p.prep}
                onClick={p.onTogglePlay}
                className="rounded p-1.5 text-ink-2 hover:bg-hover hover:text-ink-1 disabled:opacity-30">
                {p.playing ? <Pause size={14} /> : <Play size={14} />}
            </button>

            <div
                ref={sliderRef}
                role="slider"
                tabIndex={p.prep ? 0 : -1}
                aria-label={p.isLiveRound ? "Review this round (the match keeps playing)" : `Review round ${shownRound ?? ""}`}
                aria-valuemin={0}
                aria-valuemax={Math.round(span)}
                aria-valuenow={0}
                aria-disabled={!p.prep}
                onKeyDown={onKeyDown}
                className="group relative h-8 min-w-0 flex-1 cursor-pointer touch-none select-none rounded outline-none focus-visible:ring-2 focus-visible:ring-gold"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                <div ref={trackRef} className="absolute inset-x-1 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10">
                    {p.isLiveRound && <div ref={fillRef} className="absolute inset-y-0 left-0 rounded-full bg-white/20" />}
                    {ticks.map((tick, i) => <Tick key={`${tick.kind}-${i}`} tick={tick} span={span} />)}
                    <div ref={headRef} className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: "0%" }}>
                        <div className={cn("h-4 w-1 rounded-sm shadow-[0_0_0_2px_rgba(7,9,12,0.9)]", p.reviewActive ? "bg-gold" : "bg-ink-1")} />
                    </div>
                </div>
            </div>
            <span ref={timeRef} className="w-9 text-right text-xs tabular-nums text-ink-2">0:00</span>
            {p.reviewActive ? (
                <button type="button" onClick={p.onBackToLive}
                    className="flex min-h-7 items-center gap-1.5 rounded bg-gold px-2.5 text-xs font-semibold text-gold-on hover:bg-gold-hover">
                    <Radio size={13} aria-hidden="true" /> Back to live
                </button>
            ) : (
                <span className="flex min-h-7 items-center gap-1.5 rounded px-2 text-[11px] font-bold tracking-[0.06em] text-positive">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-positive" /> LIVE
                </span>
            )}
        </div>
    )
}

function Tick({ tick, span }: { tick: ScrubTick; span: number }) {
    const left = `${Math.max(0, Math.min(100, (tick.t / span) * 100))}%`
    if (tick.kind === "utility") {
        return <span title={tick.label} className="absolute top-[7px] h-1 w-1 -translate-x-1/2 rounded-full opacity-80"
            style={{ left, backgroundColor: UTILITY_COLOR[tick.utility ?? "smoke"] }} />
    }
    if (tick.kind === "kill") {
        return <span title={tick.label} data-scrub-tick="kill"
            className={cn("absolute top-1/2 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-sm shadow-[0_0_0_1px_rgba(7,9,12,0.8)]", tick.headshot ? "h-3.5" : "h-3")}
            style={{ left, backgroundColor: tick.side ? SIDE_COLOR[tick.side] : "#AEB6C2" }} />
    }
    const color = tick.kind === "defuse" ? SIDE_COLOR.CT : "#FF5468"
    return <span title={tick.label} data-scrub-tick={tick.kind}
        className={cn("absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] shadow-[0_0_0_1.5px_rgba(7,9,12,0.9)]", tick.kind === "explode" && "ring-2 ring-[#FF5468]/40")}
        style={{ left, backgroundColor: color }} />
}

export const RadarScrubber = memo(RadarScrubberComponent)
