"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { motion } from "framer-motion"
import { Settings2, Pause, Play, Timer, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { Button } from "@/components/ui/button"
import { ArmorGlyph, GrenadeGlyph, KitGlyph, WeaponGlyph, weaponDisplayName } from "@/components/match/WeaponGlyph"
import { STRATEGY_LABEL, type BuyPreviewOption, type DecisionPreview } from "@/lib/live-match-decision"
import type { ManagerStrategy } from "@/engine/match/legacy-series"
import { REGROUP_EDGE, REGROUP_MIN_LOSS_STREAK } from "@/engine/match/manager-controls"
import { useAppReducedMotion } from "@/lib/reduced-motion"

const money = (n: number) => formatCurrency(Math.round(n), "$", false)

export interface DecisionCardProps {
    preview: DecisionPreview
    names: Readonly<Record<string, string>>
    onPick: (strategy: ManagerStrategy) => void
    onEditLoadout: (strategy: ManagerStrategy) => void
    /** Auto tactics: the card confirms the recommended call after `durationMs`. */
    auto: { on: boolean; hold: boolean; durationMs: number; onToggleHold: () => void; key: string }
    timeout: { remaining: number; active: boolean; disabled: boolean; onCall: () => void }
    /** Overtime header (start of overtime or an overtime side switch). */
    overtimeNote?: string
}

/**
 * What one call buys for one player: weapon glyph, cost, gear. A narrow card
 * (the radar column at 1366 px) keeps the weapon and the cost; the gear is in
 * the tooltip.
 */
function BuyCell({ p, muted }: { p: BuyPreviewOption["players"][number]; muted: boolean }) {
    return (
        <div className={cn("flex h-7 min-w-0 items-center gap-1.5 px-2 @max-[52rem]:gap-1 @max-[52rem]:px-1.5", muted && "opacity-50")} title={`${weaponDisplayName(p.weapon)}${p.armor ? (p.helmet ? " · kevlar + helmet" : " · kevlar") : ""}${p.kit ? " · kit" : ""}${p.utility.length ? ` · ${p.utility.join(", ")}` : ""} · ${money(p.cash - p.spend)} left`}>
            <WeaponGlyph weapon={p.weapon} className="h-2.5 w-7 shrink-0 text-ink-1 @max-[52rem]:w-5" />
            <span className={cn("text-xs tabular-nums", p.spend > 0 ? "text-ink-1" : "text-ink-3")}>{p.spend > 0 ? money(p.spend) : "—"}</span>
            <span className="ml-auto flex shrink-0 items-center gap-0.5 text-ink-3 @max-[52rem]:hidden">
                {p.armor && <ArmorGlyph helmet={p.helmet} className="h-2.5 w-2.5" />}
                {p.kit && <KitGlyph className="h-2.5 w-2.5 text-side-ct" />}
                {p.utility.length > 0 && <span className="text-[11px] tabular-nums text-ink-2">{p.utility.length}<GrenadeGlyph kind={p.utility[0]} className="ml-px inline h-2.5 w-1.5 align-[-1px]" /></span>}
            </span>
        </div>
    )
}

/** Whole seconds left on the auto call, counting down (restarts when `restart` changes). */
function Countdown({ ms, restart }: { ms: number; restart: unknown }) {
    const [left, setLeft] = useState(Math.ceil(ms / 1000))
    useEffect(() => {
        const start = Date.now()
        const tick = () => setLeft(Math.max(0, Math.ceil((ms - (Date.now() - start)) / 1000)))
        tick()
        const id = setInterval(tick, 250)
        return () => clearInterval(id)
    }, [ms, restart])
    return <>{left}</>
}

export function DecisionCard({ preview, names, onPick, onEditLoadout, auto, timeout, overtimeNote }: DecisionCardProps) {
    const reduceMotion = useAppReducedMotion()
    const sideCT = preview.side === "CT"
    const recommended = preview.options.find(o => o.id === preview.auto)?.id
    const counting = auto.on && !auto.hold
    // Folded: only the calls (the radar and its round scrubber stay visible).
    const [folded, setFolded] = useState(false)
    // A call that buys exactly what another one buys is a note, not a column (fewer, wider choices).
    const calls = preview.options.filter(o => !o.sameAs)
    const same = preview.options.filter(o => o.sameAs)
    const cols = { "--cols": calls.length } as CSSProperties
    return (
        <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="tactical-decisions @container relative w-full overflow-hidden rounded-lg border border-line-strong bg-panel/[0.97] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
            aria-label={`Round ${preview.round} buy decision`}
        >
            {auto.on && (
                <div className="h-1 w-full bg-hover" aria-hidden="true">
                    {counting && (
                        <motion.div
                            key={auto.key}
                            className="h-full origin-left bg-gold"
                            initial={{ scaleX: 1 }}
                            animate={{ scaleX: 0 }}
                            transition={{ duration: auto.durationMs / 1000, ease: "linear" }}
                        />
                    )}
                </div>
            )}
            <div className="px-3 pb-3 pt-2.5">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-[0.06em]", sideCT ? "bg-side-ct/15 text-side-ct" : "bg-side-t/15 text-side-t")}>{preview.side}</span>
                    <h3 className="font-display text-xl font-bold uppercase leading-none text-ink-1">Round {preview.round} · Select strategy</h3>
                    {overtimeNote && <span className="rounded-sm border border-gold/40 px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-[0.06em] text-gold">{overtimeNote}</span>}
                    <span className="ml-auto text-xs text-ink-3">
                        Team <span className="font-semibold tabular-nums text-ink-1">{money(preview.teamCash)}</span>
                        <span className="mx-1.5">·</span>avg <span className="tabular-nums text-ink-2">{money(preview.avgCash)}</span>
                    </span>
                    <button
                        type="button"
                        onClick={() => setFolded(f => !f)}
                        aria-expanded={!folded}
                        className="flex h-7 items-center gap-1 rounded px-1.5 text-xs font-semibold text-ink-3 hover:bg-hover hover:text-ink-1"
                        title={folded ? "Show what each call buys per player" : "Fold the card to see the radar"}
                    >
                        {folded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                        {folded ? "Players" : "Fold"}
                    </button>
                    {recommended && (
                        <button
                            type="button"
                            onClick={() => onEditLoadout(recommended)}
                            className="hidden h-7 items-center gap-1 rounded px-1.5 text-xs font-semibold text-ink-3 hover:bg-hover hover:text-ink-1 @max-[52rem]:flex"
                        >
                            <Settings2 size={13} aria-hidden="true" /> Edit loadouts
                        </button>
                    )}
                    {auto.on && (
                        <button
                            type="button"
                            onClick={auto.onToggleHold}
                            className="flex h-7 items-center gap-1.5 rounded border border-line-strong bg-raised px-2 text-xs font-semibold text-ink-2 hover:bg-hover hover:text-ink-1"
                            title={auto.hold ? "Let auto tactics confirm the call (Space)" : "Hold the auto call to decide yourself (Space)"}
                        >
                            {auto.hold ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
                            {auto.hold ? "Auto held" : "Hold auto"}
                        </button>
                    )}
                </header>

                <p className="mt-1.5 text-xs leading-snug text-ink-2">
                    <span className="mr-1.5 rounded-sm bg-gold/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-gold">Recommended{recommended ? `: ${STRATEGY_LABEL[recommended]}` : ""}</span>
                    {preview.reason}
                </p>

                {/* Calls × players: what each call buys each player, at its real cost. */}
                <div className="mt-2.5 overflow-hidden rounded-md border border-line">
                    <div className="grid grid-cols-[132px_repeat(var(--cols),minmax(0,1fr))] border-b border-line bg-shell @max-[52rem]:grid-cols-[112px_repeat(var(--cols),minmax(0,1fr))]" style={cols}>
                        <div className="flex items-end px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Player · cash</div>
                        {calls.map(o => {
                            const label = STRATEGY_LABEL[o.id]
                            const isRec = o.id === recommended
                            return (
                                <div key={o.id} className="relative border-l border-line p-1">
                                    <Button
                                        variant="secondary"
                                        onClick={() => onPick(o.id)}
                                        title={`${label}: ${money(o.total)} total${isRec ? " (recommended)" : ""}`}
                                        className={cn(
                                            "flex h-[50px] w-full flex-col items-start justify-center gap-0.5 rounded-[4px] border pl-2 pr-7 text-left @max-[52rem]:pl-1.5 @max-[52rem]:pr-1.5",
                                            isRec ? "border-gold bg-gold hover:border-gold-hover hover:bg-gold-hover" : "border-line bg-raised hover:border-gold hover:bg-hover",
                                        )}
                                    >
                                        <span className={cn("whitespace-nowrap text-sm font-semibold leading-none @max-[52rem]:text-xs", isRec ? "text-gold-on" : "text-ink-1")}>{label}</span>
                                        <span className={cn("whitespace-nowrap text-xs leading-none tabular-nums", isRec ? "text-gold-on/80" : "text-ink-3")}>
                                            {isRec && counting ? <>Auto in <Countdown ms={auto.durationMs} restart={auto.key} /> s</> : o.total > 0 ? <>{money(o.total)}<span className="@max-[52rem]:hidden"> total</span></> : "No spend"}
                                        </span>
                                    </Button>
                                    <button
                                        type="button"
                                        aria-label={`Edit ${label} loadout`}
                                        title={`Edit ${label} loadout`}
                                        onClick={e => { e.stopPropagation(); onEditLoadout(o.id) }}
                                        className={cn("absolute right-2 top-2 rounded p-1 transition-colors @max-[52rem]:hidden", isRec ? "text-gold-on/80 hover:bg-black/10 hover:text-gold-on" : "text-ink-3 hover:bg-hover hover:text-ink-1")}
                                    >
                                        <Settings2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                    {!folded && preview.options[0]?.players.map((p, row) => (
                        <div key={p.id} className="grid grid-cols-[132px_repeat(var(--cols),minmax(0,1fr))] border-b border-line last:border-b-0 @max-[52rem]:grid-cols-[112px_repeat(var(--cols),minmax(0,1fr))]" style={cols}>
                            <div className="flex h-7 min-w-0 items-center gap-1.5 px-2 text-xs">
                                <span className="min-w-0 truncate font-semibold text-ink-1">{names[p.id] ?? p.id}</span>
                                <span className="ml-auto shrink-0 tabular-nums text-positive">{money(p.cash)}</span>
                            </div>
                            {calls.map(o => (
                                <div key={o.id} className={cn("border-l border-line", o.id === recommended && "bg-gold/[0.08]")}>
                                    <BuyCell p={o.players[row]} muted={false} />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                {same.length > 0 && (
                    <p className="mt-1.5 text-xs text-ink-3">
                        {same.map(o => `${STRATEGY_LABEL[o.id]} buys the same as ${STRATEGY_LABEL[o.sameAs!]}`).join(" · ")}.
                    </p>
                )}

                <footer className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={timeout.onCall}
                        disabled={timeout.disabled}
                        title={`Between rounds only: regroup — +${REGROUP_EDGE * 100}% round-win chance for 2 rounds while you have lost ${REGROUP_MIN_LOSS_STREAK}+ in a row. Two per series; no benefit without a losing streak.`}
                        className="h-8 shrink-0 gap-1.5 px-3 text-xs"
                    >
                        <Timer size={13} aria-hidden="true" /> Tactical timeout ({timeout.remaining})
                    </Button>
                    <p className="min-w-0 flex-1 text-xs leading-snug text-ink-3 @max-[52rem]:hidden">
                        {timeout.active
                            ? <span className="font-semibold text-ink-1">Regrouping: +{REGROUP_EDGE * 100}% round-win chance while on a {REGROUP_MIN_LOSS_STREAK}+ loss streak.</span>
                            : <>+{REGROUP_EDGE * 100}% round-win chance for two rounds, only after {REGROUP_MIN_LOSS_STREAK}+ losses in a row.</>}
                    </p>
                    {(preview.lossBonus !== undefined || preview.winReward !== undefined) && (
                        <p className="shrink-0 text-xs text-ink-3">
                            {preview.winReward !== undefined && <>Win <span className="tabular-nums text-ink-2">+{money(preview.winReward)}</span></>}
                            {preview.lossBonus !== undefined && <><span className="mx-1.5">·</span>Loss <span className="tabular-nums text-ink-2">+{money(preview.lossBonus)}</span> each</>}
                        </p>
                    )}
                </footer>
            </div>
        </motion.section>
    )
}
