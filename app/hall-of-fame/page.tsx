"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { LoadingState } from "@/components/ui/loading"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { HALL_OF_FAME_TUNING as HOF } from "@/lib/balance-tuning"
import type { HallOfFameEntry, PlayerSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"

function LegendsTable({ legends, playerById, activeIds }: { legends: HallOfFameEntry[]; playerById: Map<string, PlayerSaveData>; activeIds: Set<string> }) {
    return (
        <div className="overflow-x-auto">
            <table data-slot="table" className="w-full min-w-[900px] border-collapse text-left">
                <thead data-slot="table-header">
                    <tr className="border-b border-line">
                        <th data-slot="table-head" className="pl-4">Player</th>
                        <th data-slot="table-head" className="px-3">Role</th>
                        <th data-slot="table-head" className="px-3">Era</th>
                        <th data-slot="table-head" className="px-3 text-right">Majors</th>
                        <th data-slot="table-head" className="px-3 text-right">MVPs</th>
                        <th data-slot="table-head" className="px-3 text-right">Matches</th>
                        <th data-slot="table-head" className="px-3">Why they&apos;re here</th>
                        <th data-slot="table-head" className="pl-3 pr-4">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {legends.map(legend => {
                        const p = playerById.get(legend.id)
                        const active = activeIds.has(legend.id)
                        return (
                            <tr key={legend.id} data-slot="table-row" className="h-14 border-b border-line">
                                <td className="py-2 pl-4 pr-3">
                                    <Link href={`/player/${legend.id}`} className="group flex min-w-0 items-center gap-3">
                                        <span className="h-10 w-10 shrink-0 overflow-hidden rounded bg-raised">
                                            <PlayerPortrait src={legend.portraitPath} seed={legend.id} alt={legend.name} size={40} />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-semibold text-ink-1 group-hover:text-gold">{legend.name}</span>
                                            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                                                <CountryFlag country={legend.nationality} size={12} />
                                                {String(legend.nationality || "").toUpperCase()}
                                            </span>
                                        </span>
                                    </Link>
                                </td>
                                <td className="px-3"><RoleTag role={legend.primaryRole} /></td>
                                <td className="px-3 text-sm tabular-nums text-ink-2">{legend.eraStart}–{active ? "now" : legend.eraEnd}</td>
                                <td className={cn("px-3 text-right text-sm tabular-nums", (p?.majorWins ?? 0) > 0 ? "text-gold" : "text-ink-3")}>{p?.majorWins ?? "—"}</td>
                                <td className="px-3 text-right text-sm tabular-nums text-ink-2">{p?.totalMVPs ?? "—"}</td>
                                <td className="px-3 text-right text-sm tabular-nums text-ink-2">{p?.matchesPlayed?.toLocaleString("en-US") ?? "—"}</td>
                                <td className="px-3">
                                    <span className="flex flex-wrap gap-1">
                                        {legend.inductionReasons.map((r, i) => (
                                            <span key={i} className="rounded-sm border border-line-strong px-1.5 py-0.5 text-[11px] text-ink-2">{r.label}</span>
                                        ))}
                                    </span>
                                </td>
                                <td className="pl-3 pr-4 text-xs text-ink-3">{active ? "Still playing" : "Retired"}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

export default function HallOfFamePage() {
    const { hallOfFame, players, activelyPlayingLegendIds, currentWeek, hydrated, isLoading, playerTeamId } = useGameStore(useShallow(state => ({
        hydrated: state._hasHydrated,
        isLoading: state.isLoading,
        playerTeamId: state.playerTeamId,
        hallOfFame: state.hallOfFame,
        players: state.players,
        activelyPlayingLegendIds: state.activelyPlayingLegendIds,
        currentWeek: state.currentWeek,
    })))

    const activeIds = useMemo(() => new Set(activelyPlayingLegendIds), [activelyPlayingLegendIds])
    const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
    const founding = useMemo(() => hallOfFame
        .filter(l => l.category === "FOUNDING")
        .sort((a, b) => Number(activeIds.has(a.id)) - Number(activeIds.has(b.id)) || a.eraStart - b.eraStart), [hallOfFame, activeIds])
    const inducted = useMemo(() => hallOfFame.filter(l => l.category === "INDUCTED").sort((a, b) => b.eraEnd - a.eraEnd), [hallOfFame])
    const season = Math.floor((currentWeek - 1) / 52) + 1

    if (!hydrated || isLoading || !playerTeamId) return <LoadingState message="Loading Hall of Fame…" size="lg" className="min-h-[50vh]" />

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow={`Season ${season} · Legacy`}
                title="Hall of Fame"
                subtitle="Players who defined eras. New legends are inducted when they retire."
                aside={
                    <KpiStrip>
                        <Kpi label="Founding" value={founding.length} />
                        <Kpi label="Inducted" value={inducted.length} />
                        <Kpi label="Still playing" value={founding.filter(l => activeIds.has(l.id)).length} />
                    </KpiStrip>
                }
            />

            <Panel title="Inducted in your career" padded={false}>
                {inducted.length > 0
                    ? <LegendsTable legends={inducted} playerById={playerById} activeIds={activeIds} />
                    : <p className="px-4 py-5 text-sm text-ink-3">No one yet. The first great career to end here gets the first plaque.</p>}
            </Panel>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Panel title="Founding legends" padded={false}>
                    {founding.length > 0
                        ? <LegendsTable legends={founding} playerById={playerById} activeIds={activeIds} />
                        : <p className="px-4 py-5 text-sm text-ink-3">No founding legends in this world.</p>}
                </Panel>
                <Panel title="How players get in" className="self-start">
                    <p className="text-sm text-ink-2">At retirement a player is inducted with any two of:</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-ink-1">
                        <li>A Major title</li>
                        <li>{HOF.MVP_AWARDS}+ tournament MVPs</li>
                        <li>{HOF.CAREER_KILLS.toLocaleString("en-US")}+ career kills</li>
                        <li>{HOF.CAREER_MATCHES}+ matches</li>
                        <li>A {HOF.CAREER_RATING.toFixed(2)}+ rating over {HOF.RATING_MIN_MATCHES}+ matches</li>
                    </ul>
                    <p className="mt-3 text-sm text-ink-2">
                        {HOF.AUTO_MAJOR_WINS}+ Majors, or a {HOF.AUTO_RATING.toFixed(2)}+ rating over {HOF.RATING_MIN_MATCHES}+ matches, gets a player in on its own.
                    </p>
                </Panel>
            </div>
        </div>
    )
}
