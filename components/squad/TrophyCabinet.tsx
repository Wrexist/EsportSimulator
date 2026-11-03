"use client"
import { t, tn } from "@/lib/i18n"

import React, { memo } from "react"
import Image from "next/image"
import { Trophy } from "lucide-react"
import { isMajorTournament } from "@/engine/official-stats"
import { isLeagueMatchId } from "@/engine/season/regional-league"
import { trophyArtFor, trophyKindForTournament, type TrophyArtKind } from "@/lib/trophy-art"
import { Panel } from "@/src/components/ui/Panel"
import { EmptyState } from "@/src/components/ui/EmptyState"

interface TrophyEntry {
    tournamentId: string
    tournamentName: string
    week: number
    mvpId?: string
    tier?: string
}

/** A won title's art: the major cup, the league shield, else its tier cup. */
export function trophyArtKind(trophy: Pick<TrophyEntry, "tournamentId" | "tier">): TrophyArtKind {
    return trophyKindForTournament(trophy.tier, { major: isMajorTournament(trophy.tournamentId), league: isLeagueMatchId(trophy.tournamentId) })
}

interface TrophyCabinetProps {
    trophies: TrophyEntry[]
    title?: string
    className?: string
}

/** The club's won titles on one shelf, each with its project trophy art (lib/trophy-art). */
function TrophyCabinetInner({ trophies, title, className }: TrophyCabinetProps) {
    return (
        <Panel
            title={title ?? t("squad.trophies.title")}
            actions={<span className="text-xs tabular-nums text-ink-3">{tn("squad.trophies.count", trophies.length)}</span>}
            className={className}
        >
            {trophies.length === 0 ? (
                <EmptyState
                    icon={Trophy}
                    framed={false}
                    title={t("squad.trophies.empty")}
                    description={t("squad.trophies.emptyBody")}
                />
            ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {trophies.map(trophy => {
                        const art = trophyArtFor(trophyArtKind(trophy))
                        return (
                            <li
                                key={`${trophy.tournamentId}-${trophy.week}`}
                                className="flex min-w-0 flex-col items-center rounded-md border border-line bg-raised px-3 pb-3 pt-4 text-center"
                            >
                                <Image src={art.src} alt={art.label} width={64} height={64} className="h-16 w-16 object-contain" />
                                <p className="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-ink-1" title={trophy.tournamentName}>{trophy.tournamentName}</p>
                                <p className="mt-1 text-xs tabular-nums text-ink-3">
                                    {t("common.week", { n: trophy.week })}
                                    {trophy.mvpId && <span className="text-gold"> · {t("squad.trophies.mvp")}</span>}
                                </p>
                            </li>
                        )
                    })}
                </ul>
            )}
        </Panel>
    )
}

export const TrophyCabinet = memo(TrophyCabinetInner)
