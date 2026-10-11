"use client"

import { useCallback, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import type { MatchResult } from "@/types"
import type { TeamSaveData } from "@/engine/save-types"
import { MAP_NAMES } from "@/data/map-pool"
import { useFocusTrap } from "@/lib/accessibility"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { cn } from "@/lib/utils"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { tokens } from "@/src/design/tokens"

const EASE = [...tokens.motion.easeOutExpo] as [number, number, number, number]
/** How long the beat holds before the result button takes over. */
export const END_BEAT_MS = 4500

export interface EndBeatPlayer { id: string; nickname: string; portraitPath?: string }

export interface MatchEndBeatProps {
    result: MatchResult
    format: string
    homeTeam: TeamSaveData
    awayTeam: TeamSaveData
    /** The managed club, to colour the outcome; null for a neutral view. */
    playerTeamId: string | null
    players: EndBeatPlayer[]
    onDone: () => void
}

/**
 * The end of a live match: the final score, the winner and the series MVP
 * with rating, K–D and ADR from the match's own stats, for a few seconds;
 * then the result button. Space, Enter or a click move on at once.
 */
export function MatchEndBeat({ result, format, homeTeam, awayTeam, playerTeamId, players, onDone }: MatchEndBeatProps) {
    const reduce = useAppReducedMotion()
    const doneRef = useRef(false)
    const doneCb = useRef(onDone)
    doneCb.current = onDone
    const finish = useCallback(() => {
        if (doneRef.current) return
        doneRef.current = true
        doneCb.current()
    }, [])
    const rootRef = useFocusTrap<HTMLDivElement>(true, finish)

    useEffect(() => {
        const t = setTimeout(finish, END_BEAT_MS)
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== " " && e.key !== "Enter") return
            e.preventDefault()
            e.stopPropagation()
            if (!e.repeat) finish()
        }
        window.addEventListener("keydown", onKey, true)
        return () => { clearTimeout(t); window.removeEventListener("keydown", onKey, true) }
    }, [finish])

    const homeWon = result.homeScore > result.awayScore
    const winner = homeWon ? homeTeam : awayTeam
    const series = String(format || "BO1").toUpperCase() !== "BO1"
    const played = result.maps.filter(m => (m.finalScore?.team1 ?? 0) + (m.finalScore?.team2 ?? 0) > 0)
    const single = !series && played.length === 1 ? played[0] : null
    const hScore = single ? single.finalScore.team1 : result.homeScore
    const aScore = single ? single.finalScore.team2 : result.awayScore
    const mine = playerTeamId === homeTeam.id || playerTeamId === awayTeam.id
    const won = mine && winner.id === playerTeamId
    const tone = !mine ? "text-gold" : won ? "text-positive" : "text-negative"

    const mvpId = result.mvpPlayerId
    const mvpStats = mvpId ? result.playerStats?.[mvpId] : undefined
    const mvp = players.find(p => p.id === mvpId)

    const fade = (delay: number, y = 12) => ({
        initial: reduce ? false as const : { opacity: 0, y },
        animate: { opacity: 1, y: 0 },
        transition: { duration: reduce ? 0 : 0.45, delay: reduce ? 0 : delay, ease: EASE },
    })

    return (
        <motion.div
            ref={rootRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-beat-title"
            onClick={finish}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.3 }}
            className="fixed inset-0 z-celebration flex cursor-pointer items-center justify-center overflow-hidden bg-ink/92 outline-hidden"
        >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-radial-[ellipse_60%_50%_at_50%_40%] from-gold/10 to-transparent" />
            <div className="relative flex w-full max-w-5xl flex-col items-center px-10 text-center">
                <motion.p {...fade(0.05)} className={cn("text-[13px] font-semibold uppercase tracking-[0.28em]", tone)}>
                    {series ? "Series over" : "Map over"}{mine ? ` · ${won ? "Victory" : "Defeat"}` : ""}
                </motion.p>

                <div className="mt-6 flex w-full items-center justify-center gap-10">
                    <motion.div {...fade(0.15)} className={cn("flex min-w-0 flex-1 flex-col items-center gap-3", !homeWon && "opacity-60")}>
                        <TeamLogoDisplay team={homeTeam} size={84} />
                        <span className="line-clamp-2 max-w-full break-words font-display text-[clamp(28px,2.8vw,44px)] font-bold uppercase leading-[0.9] text-ink-1">{homeTeam.name}</span>
                    </motion.div>
                    <motion.p
                        initial={reduce ? false : { opacity: 0, scale: 1.25 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : 0.2, ease: EASE }}
                        className="shrink-0 font-display text-[clamp(84px,9vw,136px)] font-extrabold leading-none tabular-nums text-ink-1"
                    >
                        <span className={homeWon ? "text-ink-1" : "text-ink-3"}>{hScore}</span>
                        <span className="px-4 text-ink-3" aria-hidden="true">–</span>
                        <span className={!homeWon ? "text-ink-1" : "text-ink-3"}>{aScore}</span>
                    </motion.p>
                    <motion.div {...fade(0.15)} className={cn("flex min-w-0 flex-1 flex-col items-center gap-3", homeWon && "opacity-60")}>
                        <TeamLogoDisplay team={awayTeam} size={84} />
                        <span className="line-clamp-2 max-w-full break-words font-display text-[clamp(28px,2.8vw,44px)] font-bold uppercase leading-[0.9] text-ink-1">{awayTeam.name}</span>
                    </motion.div>
                </div>

                <motion.h2 {...fade(0.35)} id="end-beat-title" className="mt-5 font-display text-[clamp(36px,4vw,60px)] font-extrabold uppercase leading-none text-gold">
                    {winner.name} win
                </motion.h2>

                {series && played.length > 0 && (
                    <motion.div {...fade(0.45)} className="mt-4 flex flex-wrap justify-center gap-2">
                        {played.map((m, i) => (
                            <span key={`${m.map}-${i}`} className="inline-flex items-center gap-2 rounded-sm border border-line px-2.5 py-1 text-sm">
                                <span className="font-semibold uppercase tracking-[0.06em] text-ink-2">{MAP_NAMES[m.map] ?? m.map}</span>
                                <span className="tabular-nums text-ink-1">{m.finalScore.team1}–{m.finalScore.team2}</span>
                            </span>
                        ))}
                    </motion.div>
                )}

                {mvpStats && (
                    <motion.div {...fade(0.7, 18)} className="mt-9 flex items-center gap-6 rounded-lg border border-gold/40 bg-panel px-7 py-5 text-left">
                        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-line bg-raised">
                            <PlayerPortrait src={mvp?.portraitPath} alt={mvp?.nickname ?? "MVP"} seed={mvpId} fill className="object-cover object-top" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">{series ? "Series MVP" : "Match MVP"}</p>
                            <p className="mt-1 truncate font-display text-[40px] font-extrabold uppercase leading-none text-ink-1">{mvp?.nickname ?? "MVP"}</p>
                        </div>
                        <dl className="ml-4 grid grid-cols-3 divide-x divide-line border-l border-line">
                            {[
                                { label: "Rating", value: mvpStats.rating.toFixed(2) },
                                { label: "K–D", value: `${mvpStats.kills}–${mvpStats.deaths}` },
                                { label: "ADR", value: Number.isFinite(mvpStats.adr) ? mvpStats.adr.toFixed(1) : "—" },
                            ].map(s => (
                                <div key={s.label} className="px-5">
                                    <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{s.label}</dt>
                                    <dd className="mt-1 font-display text-[30px] font-bold leading-none tabular-nums text-ink-1">{s.value}</dd>
                                </div>
                            ))}
                        </dl>
                    </motion.div>
                )}
                <motion.p {...fade(1, 0)} className="mt-8 text-xs text-ink-3">Space, Enter or click to continue</motion.p>
            </div>
            <motion.div
                aria-hidden="true"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: END_BEAT_MS / 1000, ease: "linear" }}
                className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-gold/70"
            />
        </motion.div>
    )
}
