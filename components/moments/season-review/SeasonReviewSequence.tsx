"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft } from "lucide-react"
import type { TeamSaveData } from "@/engine/save-types"
import { REVIEW_PAGE_LABEL, type ReviewPageId, type SeasonReviewView } from "@/lib/season-review-view"
import { useFocusTrap } from "@/lib/accessibility"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { soundManager } from "@/lib/sound-manager"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Logotype } from "@/components/brand/Logotype"
import { tokens } from "@/src/design/tokens"
import { playMomentCue } from "../MomentFrame"
import { useMomentOnScreen } from "../moment-state"
import { AwardPage, ClubPage, RecordsPage, ReviewContext, StoryPage, TeamOfSeasonPage, Top20Page, type ReviewContextValue } from "./SeasonReviewPages"

const EASE = [...tokens.motion.easeOutExpo] as [number, number, number, number]
/** Input is ignored this long after the review opens, so the key or click that led here cannot skip it. */
const ARM_MS = 650
/** The celebration loop runs at most this long (it ends when the review closes). */
const CELEBRATION_MS = 6 * 60_000

export interface SeasonReviewSequenceProps {
    view: SeasonReviewView
    teams: TeamSaveData[]
    /** moment: the season-end moment (cue once, music, "Continue to pre-season"); replay: opened from history. */
    mode: "moment" | "replay"
    momentKey?: string
    /** First page shown (the inbox opens the awards). */
    startAt?: ReviewPageId
    onClose: () => void
}

/**
 * The season review: full-screen pages over the season splash, one at a
 * time. Enter, Space or the right arrow go on (a page still revealing
 * finishes first), the left arrow goes back, Escape skips to the last page
 * (and closes from there). Reduced motion shows every page at once.
 */
export function SeasonReviewSequence({ view, teams, mode, momentKey, startAt, onClose }: SeasonReviewSequenceProps) {
    const reduce = useAppReducedMotion()
    const pages = view.pages
    const [index, setIndex] = useState(() => Math.max(0, startAt ? pages.indexOf(startAt) : 0))
    const [dir, setDir] = useState(1)
    const [armed, setArmed] = useState(false)
    const armedRef = useRef(false)
    const closedRef = useRef(false)
    const finisher = useRef<(() => void) | null>(null)
    const primaryRef = useRef<HTMLButtonElement>(null)
    const page = pages[Math.min(index, pages.length - 1)]
    const pageRef = useRef(page)
    pageRef.current = page
    const last = index >= pages.length - 1
    const headingId = `season-review-${view.season}-${page}`

    const close = useCallback(() => {
        if (closedRef.current) return
        closedRef.current = true
        onClose()
    }, [onClose])
    const go = useCallback((to: number) => {
        finisher.current = null
        setDir(to >= index ? 1 : -1)
        setIndex(Math.max(0, Math.min(pages.length - 1, to)))
    }, [index, pages.length])
    const next = useCallback(() => {
        if (!armedRef.current) return
        if (finisher.current) { const finish = finisher.current; finisher.current = null; finish(); return }
        if (last) close()
        else go(index + 1)
    }, [close, go, index, last])
    const back = useCallback(() => { if (armedRef.current && index > 0) go(index - 1) }, [go, index])
    const skipToEnd = useCallback(() => {
        if (!armedRef.current) return
        if (last) close()
        else go(pages.length - 1)
    }, [close, go, last, pages.length])

    const dialogRef = useFocusTrap<HTMLDivElement>(true, skipToEnd)
    useMomentOnScreen()

    // Open: the review's cue (once per moment), the celebration loop after a
    // successful season, input armed after a beat.
    useEffect(() => {
        if (mode === "moment" && momentKey) playMomentCue(momentKey, "seasonReview")
        else soundManager.play("seasonReview")
        if (mode === "moment" && view.success) soundManager.celebrate(CELEBRATION_MS, 1.5)
        const t = setTimeout(() => {
            armedRef.current = true
            setArmed(true)
            primaryRef.current?.focus({ preventScroll: true })
        }, reduce ? 150 : ARM_MS)
        return () => {
            clearTimeout(t)
            if (mode === "moment" && view.success) soundManager.endCelebration()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per review
    }, [])

    // A key reveal (the MVP, the rookie) gets the award cue; the rest are silent.
    useEffect(() => {
        if (page !== "mvp" && page !== "rookie") return
        const t = setTimeout(() => soundManager.play("award", mode === "moment" ? { key: `${momentKey}:${page}` } : {}), reduce ? 0 : 350)
        return () => clearTimeout(t)
    }, [page, mode, momentKey, reduce])

    // Enter / Space / arrows from anywhere in the review; the page underneath never sees them.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!["Enter", " ", "ArrowRight", "ArrowLeft"].includes(e.key)) return
            const root = dialogRef.current
            const target = e.target as HTMLElement | null
            if (!root || (target && target !== document.body && !root.contains(target))) return
            if ((e.key === "Enter" || e.key === " ") && target?.tagName === "BUTTON" && target !== primaryRef.current) return
            e.preventDefault()
            e.stopPropagation()
            if (e.repeat) return
            if (e.key === "ArrowLeft") back()
            else next()
        }
        window.addEventListener("keydown", onKey, true)
        return () => window.removeEventListener("keydown", onKey, true)
    }, [back, next, dialogRef])

    const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])
    const ctx = useMemo<ReviewContextValue>(() => ({
        view,
        teamOf: id => teamsById.get(id),
        // Only the page on screen may hold Enter (an exiting page's timer must not).
        setFinisher: (owner, f) => { if (owner === pageRef.current) finisher.current = f },
    }), [view, teamsById])

    const closeLabel = mode === "moment" ? "Continue to pre-season" : "Close the review"
    const slide = reduce ? 0 : 36
    const variants = {
        enter: (d: number) => ({ opacity: 0, x: slide * d }),
        center: { opacity: 1, x: 0 },
        exit: (d: number) => ({ opacity: 0, x: -slide * d, transition: { duration: reduce ? 0 : 0.2, ease: EASE } }),
    }

    return (
        <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            data-moment={momentKey ?? `replay:season-review:${view.season}`}
            data-review-page={page}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.35 }}
            className="fixed inset-0 z-celebration flex flex-col overflow-hidden bg-ink outline-hidden"
        >
            {/* Stage: the season splash, low and dark, one gold light from the top. */}
            <motion.div
                aria-hidden="true"
                initial={reduce ? false : { scale: 1.08 }}
                animate={{ scale: 1 }}
                transition={{ duration: reduce ? 0 : 14, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0"
            >
                <Image src="/key-art/season-splash.webp" alt="" fill sizes="100vw" priority className="object-cover opacity-35" />
            </motion.div>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-b from-ink/55 via-ink/85 to-ink" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-radial-[ellipse_70%_45%_at_50%_0%] from-gold/12 to-transparent" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gold/60" />

            <header className="relative flex items-center gap-6 px-10 pt-6">
                <div className="flex items-center gap-4">
                    <Logotype size="compact" decorative />
                    <span aria-hidden="true" className="h-5 w-px bg-line-strong" />
                    <span className="text-[13px] font-semibold uppercase tracking-[0.22em] text-ink-2">Season {view.season} review</span>
                </div>
                <nav aria-label="Review pages" className="ml-auto flex items-center gap-4">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-3 tabular-nums">{index + 1} / {pages.length}</span>
                    <ol className="flex items-center gap-1.5">
                        {pages.map((p, i) => (
                            <li key={p}>
                                <button
                                    type="button"
                                    onClick={() => { if (armedRef.current) go(i) }}
                                    aria-label={`${REVIEW_PAGE_LABEL[p]}${i === index ? " (current)" : ""}`}
                                    aria-current={i === index ? "step" : undefined}
                                    className="group flex h-6 items-center"
                                >
                                    <span className={cn("block h-[3px] w-9 rounded-full transition-colors duration-300", i === index ? "bg-gold" : i < index ? "bg-gold/45 group-hover:bg-gold/70" : "bg-line-strong group-hover:bg-ink-3")} />
                                </button>
                            </li>
                        ))}
                    </ol>
                    {!last && (
                        <Button variant="ghost" size="sm" onClick={skipToEnd} disabled={!armed} className="text-xs">
                            Skip to end <kbd className="rounded-sm border border-line-strong px-1 text-[10px] text-ink-3">Esc</kbd>
                        </Button>
                    )}
                </nav>
            </header>

            <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
                <ReviewContext.Provider value={ctx}>
                    <AnimatePresence mode="wait" initial={false} custom={dir}>
                        <motion.section
                            key={page}
                            custom={dir}
                            variants={variants}
                            initial={reduce ? false : "enter"}
                            animate="center"
                            exit="exit"
                            transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
                            className="my-auto w-full py-6"
                        >
                            {page === "club" && <ClubPage headingId={headingId} />}
                            {page === "mvp" && <AwardPage headingId={headingId} award="mvp" />}
                            {page === "rookie" && <AwardPage headingId={headingId} award="rookie" />}
                            {page === "top20" && <Top20Page headingId={headingId} />}
                            {page === "team" && <TeamOfSeasonPage headingId={headingId} />}
                            {page === "records" && <RecordsPage headingId={headingId} />}
                            {page === "story" && <StoryPage headingId={headingId} />}
                        </motion.section>
                    </AnimatePresence>
                </ReviewContext.Provider>
                <p className="sr-only" aria-live="polite">{`Page ${index + 1} of ${pages.length}: ${REVIEW_PAGE_LABEL[page]}`}</p>
            </main>

            <footer className="relative grid grid-cols-[1fr_auto_1fr] items-center px-10 pb-7 pt-3">
                <div>
                    {index > 0 && (
                        <Button variant="ghost" onClick={back} disabled={!armed} className="text-ink-2">
                            <ArrowLeft aria-hidden="true" /> {REVIEW_PAGE_LABEL[pages[index - 1]]}
                        </Button>
                    )}
                </div>
                <div className="flex flex-col items-center gap-2">
                    <Button ref={primaryRef} onClick={next} disabled={!armed} className="h-12 min-w-[280px] px-10 text-base">
                        {last ? closeLabel : `Next: ${REVIEW_PAGE_LABEL[pages[index + 1]]}`}
                    </Button>
                    <p className="text-xs text-ink-3">Enter or Space to continue · Esc skips to the end</p>
                </div>
                <div />
            </footer>
        </motion.div>
    )
}
