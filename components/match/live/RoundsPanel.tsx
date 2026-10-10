"use client"

import { memo } from "react"
import { cn } from "@/lib/utils"
import { buyShortLabel } from "@/lib/live-match-decision"
import type { ScorebugRound } from "@/components/match/LiveMatchScoreboard"

const END_LABEL: Record<string, string> = { ELIMINATION: "Elimination", BOMB_EXPLODED: "Bomb", BOMB_DEFUSE: "Defused", TIME: "Time" }

/** Revealed rounds of this map, newest first: who won, how, and both buys (yours / theirs). */
export const RoundsPanel = memo(function RoundsPanel({ rounds, mapName, ownKey, homeName, awayName }: {
    rounds: ScorebugRound[]
    mapName: string
    ownKey: "home" | "away"
    homeName: string
    awayName: string
}) {
    return (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-panel" aria-label="Rounds on this map">
            <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                <h3 className="text-sm font-semibold text-ink-1">Rounds</h3>
                <span className="text-xs text-ink-3">{mapName} · {rounds.length} played</span>
            </header>
            <div className="grid grid-cols-[28px_minmax(0,1fr)_76px_104px] gap-x-2 border-b border-line bg-shell px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                <span>#</span><span>Winner</span><span>Ended by</span><span className="text-right" title="Buy each team ran: yours / theirs">Buys</span>
            </div>
            <ol className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
                {rounds.length === 0 && <li className="px-3 py-3 text-xs text-ink-3">No rounds finished on this map yet.</li>}
                {[...rounds].reverse().map(r => {
                    const ownBuy = ownKey === "home" ? r.homeBuy : r.awayBuy
                    const theirBuy = ownKey === "home" ? r.awayBuy : r.homeBuy
                    const ownWin = r.winner === ownKey
                    return (
                        <li key={r.round} className="grid h-8 grid-cols-[28px_minmax(0,1fr)_76px_104px] items-center gap-x-2 border-b border-line px-3 text-xs last:border-b-0">
                            <span className="tabular-nums text-ink-3">{r.round}</span>
                            <span className="flex min-w-0 items-center gap-1.5">
                                <span className={cn("h-2 w-2 shrink-0 rounded-[1px]", r.side === "ct" ? "bg-side-ct" : "bg-side-t")} aria-hidden="true" />
                                <span className={cn("truncate font-semibold", ownWin ? "text-ink-1" : "text-ink-2")}>{r.winner === "home" ? homeName : awayName}</span>
                            </span>
                            <span className="text-ink-3">{END_LABEL[r.winType ?? ""] ?? "—"}</span>
                            <span className="text-right tabular-nums text-ink-2">{buyShortLabel(ownBuy)} <span className="text-ink-3">/</span> {buyShortLabel(theirBuy)}</span>
                        </li>
                    )
                })}
            </ol>
        </section>
    )
})
