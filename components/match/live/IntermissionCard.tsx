"use client"

import { motion } from "framer-motion"
import { ArrowLeftRight, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import type { LiveIntermission } from "@/hooks/useLiveMatch"

export interface HalfStat { label: string; home: number; away: number }

/**
 * Break card over the radar at half time (and between maps): the score,
 * the side switch, how the half went, and a button to start the pistol
 * round now (it starts on its own after `durationMs`).
 */
export function IntermissionCard({ intermission, homeName, awayName, homeIsCT, mapName, nextMapName, stats, onContinue }: {
    intermission: LiveIntermission
    homeName: string
    awayName: string
    /** Sides after the break. */
    homeIsCT: boolean
    mapName: string
    nextMapName?: string
    stats: HalfStat[]
    onContinue: () => void
}) {
    const reduceMotion = useAppReducedMotion()
    const halftime = intermission.kind === "halftime"
    const title = halftime ? "Half time" : intermission.kind === "map-end" ? `${mapName} final` : "Overtime"
    const side = (ct: boolean) => <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-[0.06em]", ct ? "bg-side-ct/15 text-side-ct" : "bg-side-t/15 text-side-t")}>{ct ? "CT" : "T"}</span>
    return (
        <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-x-0 top-[22%] z-30 flex justify-center px-6"
            role="status"
            data-intermission={intermission.kind}
        >
            <div className="w-full max-w-[560px] overflow-hidden rounded-[10px] border border-line-strong bg-panel/[0.97] shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
                <div className="h-0.5 w-full bg-hover" aria-hidden="true">
                    <motion.div className="h-full origin-left bg-gold" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: intermission.durationMs / 1000, ease: "linear" }} />
                </div>
                <div className="px-6 pb-5 pt-4 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">{title}</p>
                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
                        <span className="truncate text-right font-display text-2xl font-bold uppercase leading-none text-ink-1">{homeName}</span>
                        <span className="font-display text-5xl font-bold tabular-nums leading-none text-ink-1">{intermission.homeScore}<span className="mx-2 text-ink-3">–</span>{intermission.awayScore}</span>
                        <span className="truncate text-left font-display text-2xl font-bold uppercase leading-none text-ink-1">{awayName}</span>
                    </div>
                    {halftime && (
                        <p className="mt-3 flex items-center justify-center gap-2 text-sm text-ink-2">
                            Switching sides: {homeName} {side(homeIsCT)} <ArrowLeftRight className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" /> {awayName} {side(!homeIsCT)}
                        </p>
                    )}
                    {intermission.kind === "map-end" && nextMapName && <p className="mt-3 text-sm text-ink-2">Next map: <span className="font-semibold text-ink-1">{nextMapName}</span></p>}
                    {stats.length > 0 && (
                        <dl className="mx-auto mt-4 grid max-w-[420px] grid-cols-[1fr_auto_1fr] gap-x-4 gap-y-1 text-sm">
                            {stats.map(s => (
                                <div key={s.label} className="contents">
                                    <dd className={cn("text-right tabular-nums", s.home > s.away ? "font-semibold text-ink-1" : "text-ink-2")}>{s.home}</dd>
                                    <dt className="text-xs uppercase tracking-[0.06em] text-ink-3">{s.label}</dt>
                                    <dd className={cn("text-left tabular-nums", s.away > s.home ? "font-semibold text-ink-1" : "text-ink-2")}>{s.away}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    <Button onClick={onContinue} className="mt-4 h-9 gap-1 px-4 text-sm">
                        {halftime ? "Start second half" : "Start next map"} <ChevronRight size={16} aria-hidden="true" />
                    </Button>
                </div>
            </div>
        </motion.div>
    )
}
