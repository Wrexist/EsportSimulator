"use client"

import { motion } from "framer-motion"
import { Crown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { WIN_TYPE_TEXT, type RoundCallout } from "@/lib/live-match-roster"
import type { LiveRoundBeat } from "@/hooks/useLiveMatch"

const CALLOUT_TEXT: Record<RoundCallout["kind"], string> = {
    ace: "ACE",
    "4k": "4 kills",
    "3k": "3 kills",
    clutch: "Clutch",
    flawless: "Flawless",
    "eco-win": "Eco win",
    "force-win": "Force win",
}

export function calloutLabel(c: RoundCallout, names: Readonly<Record<string, string>>): string {
    if (c.kind === "clutch") return `${c.details ? `${c.details} clutch` : "Clutch"} · ${names[c.playerId] ?? "Player"}`
    if (c.kind === "ace" || c.kind === "4k" || c.kind === "3k") return `${CALLOUT_TEXT[c.kind]} · ${names[c.playerId] ?? "Player"}`
    return CALLOUT_TEXT[c.kind]
}

/** 1.2 s round-end beat over the radar: who won, how, the MVP and callouts. */
export function RoundEndBanner({ beat, homeName, awayName, names }: {
    beat: LiveRoundBeat
    homeName: string
    awayName: string
    names: Readonly<Record<string, string>>
}) {
    const reduceMotion = useAppReducedMotion()
    const { summary } = beat
    const ct = summary.winnerSide === "ct"
    const winnerName = summary.winner === "home" ? homeName : awayName
    const mvp = summary.mvp
    return (
        <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="pointer-events-none absolute inset-x-0 top-[34%] z-30 flex justify-center px-6"
            role="status"
            aria-live="polite"
            data-round-end-banner=""
        >
            <div className={cn("min-w-[380px] max-w-[560px] overflow-hidden rounded-lg border bg-panel/[0.96] text-center shadow-[0_16px_40px_rgba(0,0,0,0.55)]", ct ? "border-side-ct/50" : "border-side-t/50")}>
                <div className={cn("h-1 w-full", ct ? "bg-side-ct" : "bg-side-t")} aria-hidden="true" />
                <div className="px-6 pb-4 pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
                        Round {beat.roundNumber} · {WIN_TYPE_TEXT[summary.winType] ?? summary.winType}
                    </p>
                    <p className={cn("mt-1 font-display text-4xl font-bold uppercase leading-none", ct ? "text-side-ct" : "text-side-t")}>
                        {winnerName} win
                    </p>
                    <p className="mt-1.5 font-display text-2xl font-bold tabular-nums leading-none text-ink-1">
                        {beat.homeScore} <span className="text-ink-3">–</span> {beat.awayScore}
                    </p>
                    {mvp && (
                        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-sm text-ink-2">
                            <Crown className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">MVP</span>
                            <span className="font-semibold text-ink-1">{names[mvp.playerId] ?? "Player"}</span>
                            <span className="tabular-nums text-ink-3">· {mvp.kills} kill{mvp.kills === 1 ? "" : "s"}{mvp.damage !== undefined ? ` · ${mvp.damage} dmg` : ""}</span>
                        </p>
                    )}
                    {summary.callouts.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                            {summary.callouts.slice(0, 3).map((c, i) => (
                                <span key={`${c.kind}-${i}`} className={cn("rounded-sm px-2 py-0.5 text-xs font-bold uppercase tracking-[0.06em]", c.kind === "ace" || c.kind === "clutch" ? "bg-gold text-gold-on" : "border border-line-strong text-ink-1")}>
                                    {calloutLabel(c, names)}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    )
}
