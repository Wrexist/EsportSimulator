"use client"

/**
 * C10: the pro's card on Home: where he stands in the squad, his contract,
 * his numbers and when clubs look at him next (engine/pro-career.ts).
 */

import Link from "next/link"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import type { GameSave } from "@/engine/save-types"
import { isProActive, proStatus } from "@/engine/pro-career"
import { Panel } from "@/src/components/ui/Panel"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils-extended"
import { cn } from "@/lib/utils"

export function ProCareerPanel() {
    const view = useGameStore(useShallow(s => ({ proCareer: s.proCareer, players: s.players, teams: s.teams, contracts: s.contracts, playerTeamId: s.playerTeamId, currentWeek: s.currentWeek })))
    const save = view as unknown as GameSave
    if (!isProActive(save)) return null
    const status = proStatus(save)
    if (!status) return null
    const { player, team, ovr, squadRank, squadSize, starter, weeksUntilOffers } = status
    const contract = view.contracts.find(c => c.playerId === player.id)
    const clubs = view.proCareer?.clubs.length ?? 1
    const stat = (label: string, value: React.ReactNode) => (
        <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-ink-1">{value}</div>
        </div>
    )
    return (
        <Panel title="Your pro career" actions={<span className={cn("rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]", starter ? "bg-positive/15 text-positive" : "bg-caution/15 text-caution")} data-testid="pro-status">{starter ? "In the starting five" : "On the bench"}</span>}>
            <div className="flex items-center gap-4">
                <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={64} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate font-display text-2xl font-bold uppercase leading-none text-ink-1">{player.nickname}</span>
                        <RoleTag role={player.role} />
                    </div>
                    <p className="mt-1 text-sm text-ink-3">Age {player.age} · {team.name}{clubs > 1 ? ` · club ${clubs} of your career` : ""}</p>
                </div>
                <div className="flex items-center gap-2"><RatingChip value={ovr} size="lg" /><span className="text-xs text-ink-3">ceiling {Math.round(player.potential ?? ovr)}</span></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {stat("Squad rank", `${squadRank} of ${squadSize}`)}
                {stat("Matches · rating", `${player.matchesPlayed ?? 0} · ${(player.avgRating ?? 0) > 0 ? player.avgRating.toFixed(2) : "–"}`)}
                {stat("Contract", contract ? `${formatCurrency(contract.salaryPerWeek, "$", false)}/wk to wk ${contract.endWeek}` : "–")}
                {stat("Clubs scout you", weeksUntilOffers === 0 ? "This week" : `In ${weeksUntilOffers} week${weeksUntilOffers === 1 ? "" : "s"}`)}
            </div>
            <p className="mt-3 text-xs text-ink-3">
                {starter
                    ? "The coach starts the five best players. Keep improving to keep your place and catch a bigger club's eye."
                    : `The coach starts the five best players; you are number ${squadRank}. Train hard to pass the player above you.`}
            </p>
            <div className="mt-3 flex gap-2">
                <Button asChild size="sm" variant="outline"><Link href={`/player/${player.id}`}>Your profile</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href="/training">Your training</Link></Button>
            </div>
        </Panel>
    )
}
