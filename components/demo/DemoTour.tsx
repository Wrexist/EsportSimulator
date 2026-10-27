"use client"

/**
 * Demo tour on Home (demo builds only): the headline features to try before
 * the demo weeks run out, ticked as the player meets them (lib/demo-tour.ts).
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Check } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useSettingsStore } from "@/lib/settings-store"
import { IS_DEMO, demoWeeksLeft } from "@/lib/edition"
import { DEMO_TOUR, demoTourDone } from "@/lib/demo-tour"
import { loadDraftCupRuns } from "@/lib/draft-cup-runs"
import { cn } from "@/lib/utils"

export function DemoTour({ demo = IS_DEMO }: { demo?: boolean }) {
    const visited = useSettingsStore(s => s.demoTourVisited)
    const { week, playbook, signedPlayer, inCareer } = useGameStore(useShallow(s => {
        const team = s.teams.find(t => t.id === s.playerTeamId)
        return {
            week: s.currentWeek,
            playbook: team?.playbook,
            signedPlayer: s.transferHistory.some(r => r.toTeamId === s.playerTeamId && (r.type === "SIGNING" || r.type === "TRANSFER")),
            inCareer: !!s.saveId && !!s.playerTeamId && !s.draftCup,
        }
    }))
    const [draftCupPlayed, setDraftCupPlayed] = useState(false)
    useEffect(() => { try { setDraftCupPlayed(loadDraftCupRuns().length > 0) } catch { /* no device storage */ } }, [])

    if (!demo || !inCareer) return null
    const done = demoTourDone(draftCupPlayed ? [...visited, "draftCup"] : visited, { playbook, signedPlayer })
    const weeksLeft = demoWeeksLeft(week)

    return (
        <section aria-labelledby="demo-tour-title" className="rounded-lg border border-gold/50 bg-panel">
            <header className="flex min-h-11 items-center justify-between gap-4 border-b border-line px-4 py-2">
                <p id="demo-tour-title" className="text-sm font-semibold text-ink-1">
                    <span className="mr-2 font-bold uppercase tracking-[0.12em] text-gold">Demo</span>
                    Try it all <span className="ml-1 text-xs font-normal tabular-nums text-ink-3">{done.size} / {DEMO_TOUR.length}</span>
                </p>
                <span className="text-xs text-ink-3">{weeksLeft === 1 ? "Last demo week" : `${weeksLeft} demo weeks left`}</span>
            </header>
            <ol className="divide-y divide-line">
                {DEMO_TOUR.map(item => {
                    const isDone = done.has(item.id)
                    return (
                        <li key={item.id}>
                            <Link href={item.href} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-raised">
                                <span aria-hidden="true" className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", isDone ? "border-positive bg-positive text-ink" : "border-line-strong")}>
                                    {isDone && <Check size={10} strokeWidth={3} />}
                                </span>
                                <span className="min-w-0">
                                    <span className={cn("block text-sm font-semibold", isDone ? "text-ink-3" : "text-ink-1")}>{item.label}</span>
                                    <span className="block text-xs text-ink-3">{item.detail}</span>
                                </span>
                                <span className="sr-only">{isDone ? "(done)" : ""}</span>
                            </Link>
                        </li>
                    )
                })}
            </ol>
        </section>
    )
}
