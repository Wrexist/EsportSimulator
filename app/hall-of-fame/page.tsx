"use client"

import { useMemo } from "react"
import { countryName } from "@/lib/country"
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
import { t, intlLocale } from "@/lib/i18n"
import { hofReasonLabel } from "@/lib/hof-labels"

/**
 * The career numbers behind a plaque: the induction snapshot when there is
 * one (Phase 5.1), else the live player record (legends still playing).
 * Founding legends predate this world and have no recorded career here.
 */
function careerOf(legend: HallOfFameEntry, p: PlayerSaveData | undefined) {
    if (legend.career) return legend.career
    if (!p) return undefined
    return {
        maps: p.mapsPlayed ?? 0,
        rating: p.mapsPlayed ? Math.round((p.avgRating || 0) * 100) / 100 : 0,
        trophies: p.careerTrophies ?? 0,
        majors: p.majorWins ?? 0,
    }
}

const dash = <span className="text-ink-3">—</span>

function LegendsTable({ legends, playerById, activeIds }: { legends: HallOfFameEntry[]; playerById: Map<string, PlayerSaveData>; activeIds: Set<string> }) {
    return (
        <div className="overflow-x-auto">
            <table data-slot="table" className="w-full min-w-[980px] border-collapse text-left">
                <thead data-slot="table-header">
                    <tr className="border-b border-line">
                        <th data-slot="table-head" className="pl-4">{t("hof.col.player")}</th>
                        <th data-slot="table-head" className="px-3">{t("hof.col.role")}</th>
                        <th data-slot="table-head" className="px-3">{t("hof.col.era")}</th>
                        <th data-slot="table-head" className="px-3 text-right">{t("hof.col.majors")}</th>
                        <th data-slot="table-head" className="px-3 text-right">{t("hof.col.titles")}</th>
                        <th data-slot="table-head" className="px-3 text-right">{t("hof.col.maps")}</th>
                        <th data-slot="table-head" className="px-3 text-right">{t("hof.col.rating")}</th>
                        <th data-slot="table-head" className="px-3">{t("hof.col.why")}</th>
                        <th data-slot="table-head" className="pl-3 pr-4">{t("hof.col.status")}</th>
                    </tr>
                </thead>
                <tbody>
                    {legends.map(legend => {
                        const p = playerById.get(legend.id)
                        const c = careerOf(legend, p)
                        const active = activeIds.has(legend.id)
                        // A Major is a title: never show fewer titles than Majors. Founding
                        // legends' titles from before this world aren't recorded (like
                        // their maps and rating), so they show "—" until they win here.
                        const titles = !c ? undefined
                            : legend.category === "FOUNDING" && !legend.career && c.trophies === 0 ? undefined
                                : Math.max(c.trophies, c.majors)
                        const era = legend.category === "INDUCTED" ? `${t("common.seasonShort", { s: legend.eraStart })}–${active ? t("hof.now") : t("common.seasonShort", { s: legend.eraEnd })}` : `${legend.eraStart}–${active ? t("hof.now") : legend.eraEnd}`
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
                                                {countryName(legend.nationality).toUpperCase()}
                                            </span>
                                        </span>
                                    </Link>
                                </td>
                                <td className="px-3"><RoleTag role={legend.primaryRole} /></td>
                                <td className="px-3 text-sm tabular-nums text-ink-2">{era}</td>
                                <td className={cn("px-3 text-right text-sm tabular-nums", (c?.majors ?? 0) > 0 ? "text-gold" : "text-ink-3")}>{c ? c.majors : dash}</td>
                                <td className={cn("px-3 text-right text-sm tabular-nums", (titles ?? 0) > 0 ? "text-gold" : "text-ink-2")}>{titles ?? dash}</td>
                                <td className="px-3 text-right text-sm tabular-nums text-ink-2">{c?.maps ? c.maps.toLocaleString(intlLocale()) : dash}</td>
                                <td className="px-3 text-right text-sm font-semibold tabular-nums text-ink-1">{c?.maps ? c.rating.toFixed(2) : dash}</td>
                                <td className="px-3">
                                    <span className="flex flex-wrap gap-1">
                                        {legend.inductionReasons.map((r, i) => (
                                            <span key={i} className="rounded-sm border border-line-strong px-1.5 py-0.5 text-[11px] text-ink-2">{hofReasonLabel(r.label)}</span>
                                        ))}
                                    </span>
                                </td>
                                <td className="pl-3 pr-4 text-xs text-ink-3">{active ? t("hof.stillPlaying") : t("hof.retired")}</td>
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
    const season = Math.max(1, Math.floor((currentWeek - 1) / 52) + 1)

    if (!hydrated || isLoading || !playerTeamId) return <LoadingState message={t("hof.loading")} size="lg" className="min-h-[50vh]" />

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow={t("hof.eyebrow", { season })}
                title={t("hof.title")}
                subtitle={t("hof.subtitle")}
                aside={
                    <KpiStrip>
                        <Kpi label={t("hof.kpi.founding")} value={founding.length} />
                        <Kpi label={t("hof.kpi.inducted")} value={inducted.length} />
                        <Kpi label={t("hof.stillPlaying")} value={founding.filter(l => activeIds.has(l.id)).length} />
                    </KpiStrip>
                }
            />

            <Panel title={t("hof.inductedPanel")} padded={false}>
                {inducted.length > 0
                    ? <LegendsTable legends={inducted} playerById={playerById} activeIds={activeIds} />
                    : <p className="px-4 py-5 text-sm text-ink-3">{t("hof.inductedEmpty")}</p>}
            </Panel>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Panel title={t("hof.foundingPanel")} padded={false}>
                    {founding.length > 0
                        ? <LegendsTable legends={founding} playerById={playerById} activeIds={activeIds} />
                        : <p className="px-4 py-5 text-sm text-ink-3">{t("hof.foundingEmpty")}</p>}
                </Panel>
                <Panel title={t("hof.howTitle")} className="self-start">
                    <p className="text-sm text-ink-2">{t("hof.howIntro")}</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-ink-1">
                        <li>{t("hof.how.major")}</li>
                        <li>{t("hof.how.titles", { n: HOF.CAREER_TITLES })}</li>
                        <li>{t("hof.how.mvp")}</li>
                        <li>{t("hof.how.top20", { n: HOF.TOP20_PLACEMENTS })}</li>
                        <li>{t("hof.how.rating", { rating: HOF.CAREER_RATING.toFixed(2), maps: HOF.RATING_MIN_MAPS })}</li>
                        <li>{t("hof.how.kills", { n: HOF.CAREER_KILLS.toLocaleString(intlLocale()) })}</li>
                        <li>{t("hof.how.matches", { n: HOF.CAREER_MATCHES })}</li>
                    </ul>
                    <p className="mt-3 text-sm text-ink-2">
                        {t("hof.how.auto", { majors: HOF.AUTO_MAJOR_WINS, mvps: HOF.AUTO_SEASON_MVPS, rating: HOF.AUTO_RATING.toFixed(2), maps: HOF.RATING_MIN_MAPS })}
                    </p>
                    <p className="mt-3 text-xs text-ink-3">
                        {t("hof.how.note")}
                    </p>
                </Panel>
            </div>
        </div>
    )
}
