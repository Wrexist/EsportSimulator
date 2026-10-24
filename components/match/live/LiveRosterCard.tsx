"use client"

import { memo, type ReactNode } from "react"
import { Skull } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { ArmorGlyph, GrenadeGlyph, KitGlyph, WeaponGlyph, weaponDisplayName } from "@/components/match/WeaponGlyph"

/** Marks the player's own team (home is always on the left, so in an away match it is the right-hand side). */
export function YouTag() {
    return <span className="shrink-0 rounded-sm bg-gold/15 px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-[0.06em] text-gold" title="Your team">YOU</span>
}

/** One player's row: everything is a primitive so the memo skips idle ticks. */
export interface RosterCardRowProps {
    id: string
    name: string
    portraitPath?: string
    money: number
    weapon: string
    hp: number
    dead: boolean
    killerName?: string
    killerWeapon?: string
    hasArmor: boolean
    hasHelmet: boolean
    hasKit: boolean
    /** Grenades held, comma-joined (stable string for the memo). */
    nades: string
    kills: number
    assists: number
    deaths: number
    adr?: number
    /** HP is estimated for this round (survivors' chip damage). */
    hpEstimated?: boolean
}

const hpTone = (hp: number) => (hp > 60 ? "bg-ink-1" : hp > 25 ? "bg-caution" : "bg-negative")

const RosterCardRow = memo(function RosterCardRow(p: RosterCardRowProps) {
    const nades = p.nades ? p.nades.split(",") : []
    return (
        <li
            className={cn("grid h-[64px] grid-cols-[40px_minmax(0,1fr)] items-center gap-x-2.5 border-b border-line px-3 last:border-b-0", p.dead && "bg-ink/50")}
            data-live-player={p.id}
            data-dead={p.dead ? "" : undefined}
        >
            <div className={cn("h-10 w-10 overflow-hidden rounded bg-raised", p.dead && "opacity-40 grayscale")}>
                <PlayerPortrait src={p.portraitPath} seed={p.id} alt={p.name} size={40} variant="card" />
            </div>
            <div className="min-w-0 space-y-1.5">
                <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("min-w-0 truncate text-sm font-semibold leading-none", p.dead ? "text-ink-3" : "text-ink-1")}>{p.name}</span>
                    {!p.dead && (
                        <span className="ml-auto flex min-w-0 shrink items-center gap-1.5 text-xs leading-none text-ink-2">
                            <WeaponGlyph weapon={p.weapon} className="h-2.5 w-7 text-ink-1" />
                            <span className="truncate">{weaponDisplayName(p.weapon)}</span>
                        </span>
                    )}
                    <span className={cn("shrink-0 text-right text-[13px] leading-none tabular-nums", p.dead ? "ml-auto text-ink-3" : "text-positive")}>{formatCurrency(p.money, "$", false)}</span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                    {p.dead ? (
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs leading-none text-ink-3">
                            <Skull className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{p.killerName ? <>Killed by <span className="font-semibold text-ink-2">{p.killerName}</span></> : "Dead"}</span>
                            {p.killerWeapon && <WeaponGlyph weapon={p.killerWeapon} className="h-2.5 w-7 text-ink-3" />}
                        </span>
                    ) : (
                        <>
                            <span
                                className="relative h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-hover"
                                role="meter" aria-label={`${p.name} health`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.hp}
                                data-hp-estimated={p.hpEstimated ? "" : undefined}
                                title={p.hpEstimated ? "Health (chip damage on survivors is estimated from the round's damage totals)" : "Health"}
                            >
                                <span className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-300", hpTone(p.hp))} style={{ width: `${Math.max(0, Math.min(100, p.hp))}%` }} />
                            </span>
                            <span className="w-6 shrink-0 text-right text-xs font-semibold leading-none tabular-nums text-ink-1">{p.hp}</span>
                            <span className="flex w-[74px] shrink-0 items-center gap-1 text-ink-2">
                                {p.hasArmor ? <ArmorGlyph helmet={p.hasHelmet} /> : <span className="w-3" aria-hidden="true" />}
                                {p.hasKit ? <KitGlyph className="text-side-ct" /> : <span className="w-3" aria-hidden="true" />}
                                <span className="flex items-center gap-px" aria-label={nades.length ? `${nades.length} grenades` : "No grenades"}>
                                    {nades.slice(0, 4).map((n, i) => <GrenadeGlyph key={`${n}-${i}`} kind={n} />)}
                                </span>
                            </span>
                        </>
                    )}
                    <span className="grid shrink-0 grid-cols-[repeat(3,22px)_32px] text-right text-xs leading-none tabular-nums">
                        <span className="font-semibold text-ink-1" title="Kills">{p.kills}</span>
                        <span className="text-ink-2" title="Assists">{p.assists}</span>
                        <span className="text-ink-2" title="Deaths">{p.deaths}</span>
                        <span className="text-ink-3" title="Average damage per round this match">{p.adr ?? "–"}</span>
                    </span>
                </div>
            </div>
        </li>
    )
})

export function LiveRosterCard({ teamName, isCT, isOwn, alive, teamCash, players, footer }: {
    teamName: string
    /** The player's own team (a YOU tag in the header). */
    isOwn?: boolean
    isCT: boolean
    alive: number
    teamCash: number
    players: RosterCardRowProps[]
    footer?: ReactNode
}) {
    return (
        <section
            className={cn("shrink-0 overflow-hidden rounded-lg border border-line bg-panel", isCT ? "shadow-[inset_3px_0_0_var(--ct)]" : "shadow-[inset_3px_0_0_var(--t)]")}
            data-side={isCT ? "ct" : "t"}
            aria-label={`${teamName} players`}
        >
            <header className="flex items-center gap-2 border-b border-line px-3 py-2">
                <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-[0.06em]", isCT ? "bg-side-ct/15 text-side-ct" : "bg-side-t/15 text-side-t")}>{isCT ? "CT" : "T"}</span>
                <h2 className="min-w-0 truncate font-display text-lg font-bold uppercase leading-none text-ink-1">{teamName}</h2>
                {isOwn && <YouTag />}
                <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-3">
                    <span className="font-semibold text-ink-1">{alive}</span> alive · <span className="text-ink-2">{formatCurrency(teamCash, "$", false)}</span>
                </span>
            </header>
            <div className="flex items-center border-b border-line bg-shell px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                <span>Player</span>
                <span className="ml-auto grid grid-cols-[repeat(3,22px)_32px] text-right">
                    <span title="Kills">K</span><span title="Assists">A</span><span title="Deaths">D</span><span title="Average damage per round this match">ADR</span>
                </span>
            </div>
            <ul>{players.map(p => <RosterCardRow key={p.id} {...p} />)}</ul>
            {footer}
        </section>
    )
}
