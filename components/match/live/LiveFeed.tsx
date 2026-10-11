"use client"

import { memo, type ReactNode } from "react"
import { Swords, Zap as ZapIcon, EyeOff, Coins, Shield, Sparkles, Bomb } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LogEntry } from "@/types"
import { WeaponGlyph, HeadshotMark } from "@/components/match/WeaponGlyph"

// Stable React keys for feed rows. Entries are prepended (newest first) and
// the tail is trimmed, so array indices shift on every new line and made React
// rebuild the whole list; each entry object keeps its identity across updates.
const logRowKeys = new WeakMap<object, number>()
let nextLogRowKey = 0
function logRowKey(entry: object): number {
    let key = logRowKeys.get(entry)
    if (key === undefined) {
        key = ++nextLogRowKey
        logRowKeys.set(entry, key)
    }
    return key
}

const sideText = (side: "CT" | "T" | undefined) => side === "CT" ? "text-side-ct" : "text-side-t"
const otherSide = (side: "CT" | "T" | undefined): "CT" | "T" => side === "CT" ? "T" : "CT"
// Round-clock label (m:ss). script-v1 events carry fractional seconds; show whole seconds.
const clock = (t: number | undefined) => {
    if (t == null) return ""
    const s = Math.max(0, Math.floor(t))
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

// Memoized log list: the page re-renders every tick; a stable `logs`
// reference from useLiveMatch means this re-runs only when a line is added.
const LiveLogList = memo(function LiveLogList({ logs }: { logs: LogEntry[] }) {
    return (
        <ol className="space-y-px pb-3">
            {logs.map(l => {
                const rowKey = logRowKey(l)
                const timeStr = clock(l.time)
                const time = <span className="w-8 shrink-0 text-[11px] tabular-nums text-ink-3">{timeStr}</span>

                if (l.type === "KILL") {
                    return (
                        <li key={rowKey} className="flex h-7 items-center gap-2 rounded-[3px] bg-raised px-2 text-[13px]">
                            {time}
                            <span className={cn("min-w-0 truncate font-semibold", sideText(l.killerSide))}>{l.killerName}</span>
                            {l.assisterName && <span className="shrink-0 truncate text-xs text-ink-3">+ {l.assisterName}</span>}
                            <span className="flex shrink-0 items-center gap-1 text-ink-2">
                                <WeaponGlyph weapon={l.weapon} className="h-3 w-8" />
                                {l.isHeadshot && <HeadshotMark className="text-ink-1" />}
                            </span>
                            <span className={cn("min-w-0 truncate font-semibold", sideText(otherSide(l.killerSide)))}>{l.victimName}</span>
                            {(l.location || l.isTrade) && (
                                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                                    {l.location && <span className="whitespace-nowrap text-[11px] text-ink-3" data-kill-location="">{l.location}</span>}
                                    {l.isTrade && <span className="rounded-sm border border-line-strong px-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-ink-2">Trade</span>}
                                </span>
                            )}
                        </li>
                    )
                }

                const plain = (icon: ReactNode, text: string, tone = "text-ink-2") => (
                    <li key={rowKey} className="flex min-h-7 items-center gap-2 rounded-[3px] px-2 py-1 text-xs">
                        {time}
                        {icon}
                        <span className={cn("min-w-0", tone)}>{text}</span>
                    </li>
                )

                if (l.type === "PLANT") return plain(<Bomb className="h-3.5 w-3.5 shrink-0 text-side-t" aria-hidden="true" />, l.message, "text-ink-1")
                if (l.type === "DEFUSE") return plain(<Shield className="h-3.5 w-3.5 shrink-0 text-side-ct" aria-hidden="true" />, l.message, "text-ink-1")
                if (l.type === "EXPLODE") return plain(<ZapIcon className="h-3.5 w-3.5 shrink-0 text-side-t" aria-hidden="true" />, l.message, "text-ink-1")
                if (l.type === "CLUTCH") return plain(<Sparkles className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden="true" />, l.message, "font-semibold text-ink-1")
                if (l.type === "SAVE") return plain(<EyeOff className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />, l.message, "text-ink-3")
                if (l.type === "BUY") return plain(<Coins className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />, l.message, "text-ink-3")

                if (l.type === "ROUND_END") {
                    return (
                        <li key={rowKey} className="my-1.5 flex items-center gap-2 border-y border-line bg-shell px-2 py-1.5 text-xs font-semibold text-ink-1">
                            {l.message}
                        </li>
                    )
                }

                return (
                    <li key={rowKey} className="flex min-h-7 items-center gap-2 px-2 py-1 text-xs text-ink-3">
                        {timeStr && time}
                        <span>{l.message}</span>
                    </li>
                )
            })}
        </ol>
    )
})

export function LiveFeedPanel({ logs }: { logs: LogEntry[] }) {
    return (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-panel" aria-label="Round feed">
            <header className="flex items-center gap-2 border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                <Swords className="h-3.5 w-3.5" aria-hidden="true" /> Round feed
            </header>
            <div className="relative h-full min-h-0 flex-1 overflow-y-auto p-1.5 [scrollbar-width:thin]">
                <LiveLogList logs={logs} />
            </div>
        </section>
    )
}
