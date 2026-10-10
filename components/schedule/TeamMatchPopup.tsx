"use client"

import React, { useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { TeamSaveData, PlayerSaveData, MatchSaveData, CompletedMatchSaveData } from "@/engine/save-types"
import { TeamLogoImage, PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { resolvePlayerRole } from "@/engine/role-determination"
import { RivalryBanner } from "./RivalryBanner"
import { ScoutingReport } from "./ScoutingReport"
import { ScheduleDialog } from "./ScheduleDialog"
import { getMatchHeadline, getMatchTone } from "@/lib/match-stakes"

interface TeamMatchPopupProps {
    isOpen: boolean
    onClose: () => void
    match: MatchSaveData
    opponent: TeamSaveData | undefined
    opponentRoster: PlayerSaveData[]
    playerTeam: TeamSaveData | undefined
    tournamentName?: string
    stage?: string
    currentWeek: number
    /**
     * Full completed-match history. Used by RivalryBanner to derive the
     * live H2H streak between player and opponent.
     */
    completedMatches?: CompletedMatchSaveData[]
    /** The player team's id. Drives streak orientation in the banner. */
    playerTeamId?: string
    /** False while the fixture is still in the future; the match screen opens on match day. */
    isDue?: boolean
    /** Readable match date, e.g. "Mon, Oct 12". */
    dateLabel?: string
}

export function TeamMatchPopup({
    isOpen,
    onClose,
    match,
    opponent,
    opponentRoster,
    playerTeam,
    tournamentName,
    stage,
    currentWeek: _currentWeek,
    completedMatches,
    playerTeamId,
    isDue = true,
    dateLabel,
}: TeamMatchPopupProps) {
    const router = useRouter()

    // Memoize opponent rating and top players to avoid recalculating evaluatePlayer on every render
    const opponentRating = useMemo(() => opponentRoster.length > 0
        ? Math.round(opponentRoster.slice(0, 5).reduce((sum, p) => sum + evaluatePlayer(p).overallRating, 0) / Math.min(5, opponentRoster.length))
        : 0, [opponentRoster])

    const lineup = useMemo(() => opponentRoster
        .slice(0, 5)
        .map(p => ({ ...p, ovr: evaluatePlayer(p).overallRating })), [opponentRoster])

    const rivalry = useMemo(() => {
        if (!playerTeam || !opponent) return undefined
        return playerTeam.rivalries?.find(r => r.opponentTeamId === opponent.id)
    }, [playerTeam, opponent])

    const recentH2H = useMemo(() => {
        if (!completedMatches || !opponent || !playerTeamId) return []
        return completedMatches
            .filter(m =>
                (m.homeTeamId === playerTeamId && m.awayTeamId === opponent.id)
                || (m.awayTeamId === playerTeamId && m.homeTeamId === opponent.id)
            )
            .sort((a, b) => (b.week || 0) - (a.week || 0))
    }, [completedMatches, opponent, playerTeamId])

    if (!opponent) return null

    const handleGoToMatch = () => {
        onClose()
        router.push(match.result ? `/match/${match.id}/result` : `/match/${match.id}/tactics`)
    }

    // Stakes copy is written for tournament stages; scrims and friendlies have none.
    const hasStakes = !!stage && !match.isScrim
    const tone = hasStakes ? getMatchTone(stage, true) : null
    const headline = hasStakes ? getMatchHeadline(stage, true, opponent.name) : null

    return (
        <ScheduleDialog
            isOpen={isOpen}
            onClose={onClose}
            titleId="modal-title-match-preview"
            title="Match preview"
            subtitle={[tournamentName, stage, match.format, dateLabel].filter(Boolean).join(" · ")}
            closeLabel="Close match preview"
            className="max-w-xl"
            footer={
                <>
                    {!match.result && !isDue && <p className="mr-auto text-xs text-ink-3">Opens on match day{dateLabel ? ` (${dateLabel})` : ""}.</p>}
                    <Button variant="ghost" onClick={onClose}>Close</Button>
                    {match.result
                        ? <Button variant="outline" onClick={handleGoToMatch}>View result</Button>
                        : isDue && <Button onClick={handleGoToMatch}>Go to match</Button>}
                </>
            }
        >
            <div className="space-y-5 p-6">
                {headline && (
                    <p className={cn("text-sm", tone === "championship" ? "text-gold" : "text-ink-2")}>{headline}</p>
                )}

                {playerTeamId && (
                    <RivalryBanner
                        rivalry={rivalry}
                        recentH2H={recentH2H}
                        playerTeamId={playerTeamId}
                        opponentName={opponent.name}
                    />
                )}

                {/* Matchup */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-line bg-raised">
                            <TeamLogoImage src={playerTeam?.logoPath} team={playerTeam} alt={playerTeam?.name || "Your team"} size={42} />
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate font-display text-xl font-bold uppercase leading-none text-ink-1">{playerTeam?.name}</span>
                            <span className="mt-1 block text-xs text-ink-3">World #{playerTeam?.worldRanking ?? "—"}</span>
                        </span>
                    </div>
                    <span className="font-display text-2xl font-bold uppercase text-ink-3">VS</span>
                    <div className="flex min-w-0 flex-row-reverse items-center gap-3 text-right">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-line bg-raised">
                            <TeamLogoImage src={opponent.logoPath} team={opponent} alt={opponent.name} size={42} />
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate font-display text-xl font-bold uppercase leading-none text-ink-1">{opponent.name}</span>
                            <span className="mt-1 block text-xs text-ink-3">World #{opponent.worldRanking ?? "—"}</span>
                        </span>
                    </div>
                </div>

                <dl className="grid grid-cols-3 divide-x divide-line rounded-md border border-line">
                    <div className="px-3 py-2.5">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Their OVR</dt>
                        <dd className="mt-1"><RatingChip value={opponentRating} size="md" bare className="min-w-0 px-0 text-2xl" /></dd>
                    </div>
                    <div className="px-3 py-2.5">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">World rank</dt>
                        <dd className="mt-1 font-display text-2xl font-bold leading-none tabular-nums text-ink-1">#{opponent.worldRanking ?? "—"}</dd>
                    </div>
                    <div className="px-3 py-2.5">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Chemistry</dt>
                        <dd className="mt-1 font-display text-2xl font-bold leading-none tabular-nums text-ink-1">{Math.round(opponent.chemistry ?? 0)}</dd>
                    </div>
                </dl>

                <ScoutingReport opponent={opponent} opponentRoster={opponentRoster} />

                <section aria-labelledby="opponent-lineup-title">
                    <div className="mb-2 flex items-baseline justify-between">
                        <p id="opponent-lineup-title" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Their starting five</p>
                        <span className="text-xs text-ink-3">{opponentRoster.length} on roster</span>
                    </div>
                    <ul className="divide-y divide-line rounded-md border border-line">
                        {lineup.map(player => (
                            <li key={player.id} className="flex items-center gap-3 px-3 py-2">
                                <span className="h-8 w-8 shrink-0 overflow-hidden rounded bg-raised">
                                    <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={32} variant="card" />
                                </span>
                                <span className="flex min-w-0 flex-1 items-center gap-2">
                                    <span className="truncate text-sm font-semibold text-ink-1">{player.nickname}</span>
                                    <CountryFlag country={player.nationality} size={12} />
                                </span>
                                <RoleTag role={resolvePlayerRole(player)} />
                                <RatingChip value={player.ovr} size="sm" />
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </ScheduleDialog>
    )
}
