"use client"
import { t } from "@/lib/i18n"

import { memo } from "react"
import { cn } from "@/lib/utils"
import { buyShortLabel } from "@/lib/live-match-decision"
import type { ScorebugRound } from "@/components/match/LiveMatchScoreboard"

const endLabel = (type: string | undefined) => type && ["ELIMINATION", "BOMB_EXPLODED", "BOMB_DEFUSE", "TIME"].includes(type) ? t(`live.end.${type}`) : "—"

/** Revealed rounds of this map, newest first: who won, how, and both buys (yours / theirs). */
export const RoundsPanel = memo(function RoundsPanel({ rounds, mapName, ownKey, homeName, awayName }: {
    rounds: ScorebugRound[]
    mapName: string
    ownKey: "home" | "away"
    homeName: string
    awayName: string
}) {
    return (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-panel" aria-label={t("live.roundsAria")}>
            <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                <h3 className="text-sm font-semibold text-ink-1">{t("live.rounds")}</h3>
                <span className="text-xs text-ink-3">{t("live.mapPlayed", { map: mapName, n: rounds.length })}</span>
            </header>
            <div className="grid grid-cols-[28px_minmax(0,1fr)_76px_104px] gap-x-2 border-b border-line bg-shell px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                <span>#</span><span>{t("live.winner")}</span><span>{t("live.endedBy")}</span><span className="text-right" title={t("live.buysTitle")}>{t("live.buys")}</span>
            </div>
            <ol className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
                {rounds.length === 0 && <li className="px-3 py-3 text-xs text-ink-3">{t("live.noRounds")}</li>}
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
                            <span className="text-ink-3">{endLabel(r.winType)}</span>
                            <span className="text-right tabular-nums text-ink-2">{buyShortLabel(ownBuy)} <span className="text-ink-3">/</span> {buyShortLabel(theirBuy)}</span>
                        </li>
                    )
                })}
            </ol>
        </section>
    )
})
