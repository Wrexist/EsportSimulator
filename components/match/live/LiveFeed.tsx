"use client"
import { t } from "@/lib/i18n"

import { memo, useMemo, type ReactNode } from "react"
import { Swords, Zap as ZapIcon, EyeOff, Coins, Shield, Sparkles, Bomb } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LogEntry } from "@/types"
import { WeaponGlyph, HeadshotMark } from "@/components/match/WeaponGlyph"
import { feedClockLabels } from "@/lib/live-feed-clock"

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

const LEGACY_DIVIDER = /^-{3}\s*(.*?)\s*-{3}$/
/** The text of a section-break row, or null for an ordinary row. */
export function dividerText(l: LogEntry): string | null {
    if (l.type !== "SYSTEM") return null
    if (l.divider) return l.message
    const legacy = LEGACY_DIVIDER.exec(l.message)
    return legacy ? legacy[1] : null
}

const sideText = (side: "CT" | "T" | undefined) => side === "CT" ? "text-side-ct" : "text-side-t"
const otherSide = (side: "CT" | "T" | undefined): "CT" | "T" => side === "CT" ? "T" : "CT"
/** Short labels for what made a kill notable, in the order a caster would say them. */
export function killTags(l: LogEntry): { label: string; title: string; tone: string }[] {
    const tags: { label: string; title: string; tone: string }[] = []
    const tag = (id: string, tone: string) => tags.push({ label: t(`feed.tag.${id}`), title: t(`feed.tagTitle.${id}`), tone })
    if (l.isOpening) tag("opening", "border-line-strong text-ink-1")
    if (l.isClutchKill) tag("clutch", "border-gold text-gold")
    if (l.isThroughSmoke) tag("smoke", "border-line-strong text-ink-2")
    if (l.isTrade) tag("trade", "border-line-strong text-ink-2")
    return tags
}

// One feed line. Entries are immutable and keep their identity, so a new
// line renders only itself, not the up to 200 lines already in the feed.
const LogRow = memo(function LogRow({ l, clockText, bomb }: { l: LogEntry; clockText: string; bomb: boolean }) {
    const timeStr = clockText
    const time = (
        <span className={cn("w-8 shrink-0 text-[11px] tabular-nums", bomb ? "text-side-t" : "text-ink-3")} title={bomb ? t("feed.bombTimer") : t("feed.roundTime")}>
            {timeStr}
        </span>
    )

    if (l.type === "KILL") {
        const tags = killTags(l)
        return (
            // Killer and victim keep their names; on a narrow feed (1280 px) the
            // assister shrinks to "+" (name in the tooltip) and the location
            // drops first (MATCHDAY-17).
            <li className="flex h-7 items-center gap-2 rounded-[3px] bg-raised px-2 text-[13px]">
                {time}
                <span className={cn("min-w-[3ch] shrink truncate font-semibold", sideText(l.killerSide))} title={l.killerName}>{l.killerName}</span>
                {l.assisterName && (
                    <span className="flex min-w-0 shrink-[8] items-center gap-0.5 text-xs text-ink-3" title={`${l.isFlashAssist ? t("feed.flashAssist") : t("feed.assist")}: ${l.assisterName}`}>
                        <span className="shrink-0">+</span>{l.isFlashAssist && <ZapIcon className="h-3 w-3 shrink-0 text-ink-2" aria-label={t("feed.flashAssist")} />}<span className="min-w-0 truncate @max-[26rem]:sr-only">{l.assisterName}</span>
                    </span>
                )}
                <span className="flex shrink-0 items-center gap-1 text-ink-2">
                    <WeaponGlyph weapon={l.weapon} className="h-3 w-8" />
                    {l.isHeadshot && <HeadshotMark className="text-ink-1" />}
                </span>
                <span className={cn("min-w-[3ch] shrink truncate font-semibold", sideText(otherSide(l.killerSide)))} title={l.victimName}>{l.victimName}</span>
                {(l.location || tags.length > 0) && (
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        {l.location && <span className="whitespace-nowrap text-[11px] text-ink-3 @max-[26rem]:hidden" data-kill-location="">{l.location}</span>}
                        {tags.map(tag => (
                            <span key={tag.label} title={tag.title} className={cn("rounded-sm border px-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.04em]", tag.tone)}>{tag.label}</span>
                        ))}
                    </span>
                )}
            </li>
        )
    }

    const plain = (icon: ReactNode, text: string, tone = "text-ink-2") => (
        <li className="flex min-h-7 items-center gap-2 rounded-[3px] px-2 py-1 text-xs">
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
            <li className="my-1.5 flex items-center gap-2 border-y border-line bg-shell px-2 py-1.5 text-xs font-semibold text-ink-1">
                {l.message}
            </li>
        )
    }

    // Half time, next map, overtime and the final line are section breaks, not
    // events: a centred rule instead of "--- TEXT ---" (MATCHDAY-15). Feeds saved
    // before the change still carry the dashes, so those are read as dividers too.
    const divider = dividerText(l)
    if (divider !== null) {
        return (
            <li className="my-1.5 flex items-center gap-2 px-2 py-1 text-xs font-semibold text-ink-2" data-feed-divider="">
                <span className="h-px min-w-3 flex-1 bg-line-strong" aria-hidden="true" />
                <span className="min-w-0 text-balance text-center">{divider}</span>
                <span className="h-px min-w-3 flex-1 bg-line-strong" aria-hidden="true" />
            </li>
        )
    }

    return (
        <li className="flex min-h-7 items-center gap-2 px-2 py-1 text-xs text-ink-3">
            {timeStr && time}
            <span>{l.message}</span>
        </li>
    )
})

// Memoized log list: a stable `logs` reference from useLiveMatch means this
// re-runs only when a line is added, and then only the new line renders.
const LiveLogList = memo(function LiveLogList({ logs }: { logs: LogEntry[] }) {
    const labels = useMemo(() => feedClockLabels(logs), [logs])
    return (
        <ol className="space-y-px pb-3">
            {logs.map(l => {
                const c = labels.get(l)
                return <LogRow key={logRowKey(l)} l={l} clockText={c?.text ?? ""} bomb={!!c?.bomb} />
            })}
        </ol>
    )
})

export function LiveFeedPanel({ logs }: { logs: LogEntry[] }) {
    return (
        <section className="@container flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-panel" aria-label={t("feed.title")}>
            <header className="flex items-center gap-2 border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                <Swords className="h-3.5 w-3.5" aria-hidden="true" /> {t("feed.title")}
            </header>
            <div className="relative h-full min-h-0 flex-1 overflow-y-auto p-1.5 [scrollbar-width:thin]">
                <LiveLogList logs={logs} />
            </div>
        </section>
    )
}
