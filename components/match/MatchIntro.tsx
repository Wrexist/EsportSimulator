"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { TeamSaveData } from "@/engine/save-types"
import type { CompetitionFraming } from "@/lib/match-framing"
import type { HeadToHead } from "@/lib/match-intro"
import { MAP_NAMES } from "@/data/map-pool"
import { useFocusTrap } from "@/lib/accessibility"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { soundManager } from "@/lib/sound-manager"
import { cn } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { FormGuide, type FormResult } from "@/src/components/ui/FixtureBanner"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { TierTag } from "@/src/components/ui/TierTag"
import { tokens } from "@/src/design/tokens"

const EASE = [...tokens.motion.easeOutExpo] as [number, number, number, number]
/** Seconds: the card builds, then 3-2-1 (one second each), then live. */
const COUNTDOWN_AT = 2.4
const STEP = 0.8
const TOTAL = COUNTDOWN_AT + STEP * 3

export interface IntroLineupPlayer { id: string; nickname: string; role?: string | null }

export interface MatchIntroProps {
    matchId: string
    homeTeam: TeamSaveData
    awayTeam: TeamSaveData
    format: string
    competition: CompetitionFraming
    maps: string[]
    homePlayers: IntroLineupPlayer[]
    awayPlayers: IntroLineupPlayer[]
    h2h: HeadToHead
    context: string | null
    onDone: () => void
}

function Side({ team, align, reduce }: { team: TeamSaveData; align: "left" | "right"; reduce: boolean }) {
    const right = align === "right"
    const form = (team.recentForm ?? []).slice(-5) as FormResult[]
    return (
        <motion.div
            initial={reduce ? false : { opacity: 0, x: right ? 90 : -90 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reduce ? 0 : 0.75, delay: reduce ? 0 : 0.15, ease: EASE }}
            className="flex min-w-0 flex-1 flex-col items-center text-center"
        >
            <div className="flex h-[min(17vh,160px)] w-[min(17vh,160px)] shrink-0 items-center justify-center rounded-xl border border-line bg-raised">
                <TeamLogoDisplay team={team} size={120} />
            </div>
            <p className="mt-5 line-clamp-2 max-w-full break-words font-display text-[clamp(40px,4.4vw,76px)] font-extrabold uppercase leading-[0.88] text-ink-1">{team.name}</p>
            <div className="mt-3 flex items-center gap-4">
                <span className="text-sm text-ink-3">World <span className="font-display text-xl font-bold tabular-nums text-ink-1">#{team.worldRanking ?? "—"}</span></span>
                <FormGuide results={form} emptyLabel="No results yet" />
            </div>
        </motion.div>
    )
}

function Lineup({ players, align }: { players: IntroLineupPlayer[]; align: "left" | "right" }) {
    const right = align === "right"
    return (
        <ol className={cn("space-y-1.5", right && "text-right")}>
            {players.slice(0, 5).map(p => (
                <li key={p.id} className={cn("flex items-center gap-2.5", right && "flex-row-reverse")}>
                    <RoleTag role={p.role} className="w-[74px] justify-center" />
                    <span className="truncate font-display text-[22px] font-bold uppercase leading-none text-ink-1">{p.nickname}</span>
                </li>
            ))}
        </ol>
    )
}

/**
 * Pre-match versus card, broadcast style: both clubs, rank and form, the
 * head-to-head, competition, stage and maps, both starting fives with roles,
 * one line of context, then 3-2-1 and the match goes live. Space, Enter or a
 * click skip it. Shown once per match, before the first round.
 */
export function MatchIntro(props: MatchIntroProps) {
    const { matchId, homeTeam, awayTeam, format, competition, maps, homePlayers, awayPlayers, h2h, context, onDone } = props
    const reduce = useAppReducedMotion()
    const [count, setCount] = useState<number | null>(null)
    const doneRef = useRef(false)
    const doneCb = useRef(onDone)
    doneCb.current = onDone
    const finish = useCallback(() => {
        if (doneRef.current) return
        doneRef.current = true
        doneCb.current()
    }, [])
    const rootRef = useFocusTrap(true, finish)

    useEffect(() => {
        soundManager.play("matchIntro")
        const timers = [3, 2, 1].map((n, i) => setTimeout(() => {
            setCount(n)
            soundManager.play("countdown")
        }, (COUNTDOWN_AT + STEP * i) * 1000))
        timers.push(setTimeout(finish, TOTAL * 1000))
        return () => timers.forEach(clearTimeout)
    }, [matchId, finish])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== " " && e.key !== "Enter") return
            e.preventDefault()
            e.stopPropagation()
            if (!e.repeat) finish()
        }
        window.addEventListener("keydown", onKey, true)
        return () => window.removeEventListener("keydown", onKey, true)
    }, [finish])

    const fade = (delay: number, y = 10) => ({
        initial: reduce ? false as const : { opacity: 0, y },
        animate: { opacity: 1, y: 0 },
        transition: { duration: reduce ? 0 : 0.45, delay: reduce ? 0 : delay, ease: EASE },
    })
    const bestOf = String(format || "BO1").toUpperCase()
    const mapLabel = (m: string, i: number) => `${maps.length > 1 ? `Map ${i + 1} · ` : ""}${MAP_NAMES[m] ?? m}`

    return (
        <motion.div
            ref={rootRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`${homeTeam.name} versus ${awayTeam.name}`}
            onClick={finish}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.3 }}
            className="fixed inset-0 z-celebration cursor-pointer overflow-hidden bg-ink outline-hidden"
        >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-radial-[ellipse_60%_50%_at_50%_45%] from-gold/8 to-transparent" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-linear-to-r from-side-ct/6 to-transparent" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-linear-to-l from-side-t/6 to-transparent" />

            <div className="relative mx-auto flex h-full w-full max-w-[1500px] flex-col justify-center px-12 py-10">
                {/* Competition · stage · format */}
                <motion.div {...fade(0.05)} className="flex items-center justify-center gap-3 text-[13px] font-semibold uppercase tracking-[0.22em] text-ink-2">
                    {competition.tier && <TierTag tier={competition.tier} />}
                    <span className="text-ink-1">{competition.name}</span>
                    {competition.stage && <><span aria-hidden="true" className="text-ink-3">·</span><span>{competition.stage}</span></>}
                    <span aria-hidden="true" className="text-ink-3">·</span>
                    <span>{bestOf}</span>
                </motion.div>

                {/* Versus */}
                <div className="mt-10 flex items-center gap-8">
                    <Side team={homeTeam} align="left" reduce={reduce} />
                    <div className="flex w-[180px] shrink-0 items-center justify-center" aria-live="polite">
                        <AnimatePresence mode="popLayout" initial={false}>
                            {count === null ? (
                                <motion.span
                                    key="vs"
                                    initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 1.3 }}
                                    transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.55, ease: EASE }}
                                    className="font-display text-[88px] font-extrabold uppercase leading-none text-gold"
                                >
                                    VS
                                </motion.span>
                            ) : (
                                <motion.span
                                    key={`n${count}`}
                                    initial={reduce ? false : { opacity: 0, scale: 1.6 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.7 }}
                                    transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
                                    className="font-display text-[140px] font-extrabold leading-none tabular-nums text-ink-1"
                                >
                                    {count}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </div>
                    <Side team={awayTeam} align="right" reduce={reduce} />
                </div>

                {/* Head to head + context */}
                <motion.div {...fade(0.9)} className="mt-10 flex flex-col items-center gap-2 text-center">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-ink-3">Head to head</p>
                    {h2h.meetings > 0 ? (
                        <p className="flex items-center gap-4 font-display font-bold uppercase leading-none">
                            <span className="text-[22px] text-ink-2">{homeTeam.shortName || homeTeam.name}</span>
                            <span className="text-[44px] tabular-nums text-ink-1">{h2h.homeWins}<span className="px-2 text-ink-3">–</span>{h2h.awayWins}</span>
                            <span className="text-[22px] text-ink-2">{awayTeam.shortName || awayTeam.name}</span>
                        </p>
                    ) : (
                        <p className="font-display text-[28px] font-bold uppercase leading-none text-ink-1">First meeting</p>
                    )}
                    {h2h.meetings > 0 && <p className="text-xs text-ink-3">{h2h.meetings} recorded meeting{h2h.meetings === 1 ? "" : "s"}</p>}
                    {context && <p className="mt-3 rounded-sm border border-gold/40 bg-gold/8 px-4 py-1.5 text-sm font-semibold text-gold">{context}</p>}
                </motion.div>

                {/* Starting fives around the maps */}
                <motion.div {...fade(1.2)} className="mt-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-10">
                    <Lineup players={homePlayers} align="left" />
                    <div className="flex flex-col items-center gap-2 pt-1">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-ink-3">{maps.length > 1 ? "Maps" : "Map"}</p>
                        {maps.map((m, i) => (
                            <span key={`${m}-${i}`} className="rounded-sm border border-line-strong bg-panel px-3 py-1 text-sm font-semibold uppercase tracking-[0.06em] text-ink-1">{mapLabel(m, i)}</span>
                        ))}
                    </div>
                    <Lineup players={awayPlayers} align="right" />
                </motion.div>

                <motion.p {...fade(1.4, 0)} className="mt-10 text-center text-xs text-ink-3">Space, Enter or click to skip</motion.p>
            </div>

            {/* Time to live */}
            <motion.div
                aria-hidden="true"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: TOTAL, ease: "linear" }}
                className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-gold/70"
            />
        </motion.div>
    )
}
