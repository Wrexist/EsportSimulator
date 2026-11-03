"use client"
import { t, tn } from "@/lib/i18n"

import { Swords } from "lucide-react"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import type { MarketStanding } from "@/engine/transfer-hype"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { Panel } from "@/src/components/ui/Panel"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { StandingBadge, STANDING_FRAME } from "./StandingBadge"

export interface MarqueeTarget {
    player: PlayerSaveData
    team: TeamSaveData | undefined
    standing: MarketStanding
    value: number
    /** Why he can be had now. */
    reason: "free" | "listed" | "expiring"
    contractWeeksLeft?: number
    rivalCount: number
}

/**
 * Marquee targets: the most valuable Icons, Stars and Wonderkids that can be
 * had right now (free agents, listed players, contracts in their last half
 * year), as cards above the market table. A click opens the deal.
 */
export function MarqueeTargets({ targets, selectedId, onSelect }: { targets: MarqueeTarget[]; selectedId: string | null; onSelect: (id: string) => void }) {
    if (targets.length === 0) return null
    return (
        <Panel
            eyebrow={t("marquee.eyebrow")}
            title={t("marquee.title")}
            actions={<span className="text-xs text-ink-3">{t("marquee.actions", { weeks: 26 })}</span>}
        >
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                {targets.map(tg => {
                    const selected = tg.player.id === selectedId
                    return (
                        <li key={tg.player.id}>
                            <button
                                type="button"
                                onClick={() => onSelect(tg.player.id)}
                                aria-pressed={selected}
                                aria-label={t("market.showDeal", { name: tg.player.nickname })}
                                className={cn(
                                    "group relative flex w-full items-stretch overflow-hidden rounded-lg border bg-raised text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-gold",
                                    STANDING_FRAME[tg.standing],
                                    selected && "ring-1 ring-gold",
                                )}
                            >
                                <div className="relative h-[116px] w-[92px] shrink-0 overflow-hidden bg-shell">
                                    <PlayerPortrait src={tg.player.portraitPath} seed={tg.player.id} alt={tg.player.nickname} fill className="object-cover object-top transition-transform duration-500 group-hover:scale-105" />
                                    <div aria-hidden="true" className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 px-3 py-2.5">
                                    <div className="min-w-0">
                                        <StandingBadge standing={tg.standing} size="xs" />
                                        <p className={cn("mt-1 truncate font-display text-xl font-bold uppercase leading-none", selected ? "text-gold" : "text-ink-1 group-hover:text-gold")}>{tg.player.nickname}</p>
                                        <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
                                            <CountryFlag country={tg.player.nationality} size={12} />
                                            <RoleTag role={tg.player.role} />
                                            <span className="tabular-nums">{tg.player.age}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-end justify-between gap-2 text-xs">
                                        <div className="min-w-0">
                                            <p className="truncate text-ink-3">
                                                {tg.reason === "free" ? t("market.row.free") : tg.reason === "listed" ? t("marquee.listed", { club: tg.team?.name ?? "" }) : tn("marquee.weeksLeft", tg.contractWeeksLeft ?? 0, { club: tg.team?.name ?? "" })}
                                            </p>
                                            <p className="font-semibold tabular-nums text-ink-1">{tg.reason === "free" ? t("marquee.noFee") : formatCurrency(tg.value, "$", true)}</p>
                                        </div>
                                        {tg.rivalCount > 0 && (
                                            <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-gold" title={tn("marquee.rivals", tg.rivalCount)}>
                                                <Swords size={11} aria-hidden="true" />{tg.rivalCount}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        </li>
                    )
                })}
            </ul>
        </Panel>
    )
}
