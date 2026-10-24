"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import type { TeamSaveData } from "@/engine/save-types"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { getTierStyle, type TierLevel } from "@/engine/tier-system"
import { TeamLogoImage, PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { PlayerLink, TeamLink, TournamentLink } from "@/components/ui/EntityLink"
import { Panel } from "@/src/components/ui/Panel"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { cn } from "@/lib/utils"
import { formatScoutedRating, fuzzyBand } from "@/engine/scouting-system"

const RESULTS_SHOWN = 10

/**
 * A club's page: standing, roster (exact ratings only once scouted, the
 * rankings rule), recent results and trophies, and the head-to-head with the
 * managed club. Opened from any club name.
 */
export function TeamProfile({ team }: { team: TeamSaveData }) {
    const { teams, players, playerTeamId, completedMatches, tournaments, isPlayerScouted } = useGameStore(useShallow(s => ({
        teams: s.teams, players: s.players, playerTeamId: s.playerTeamId, completedMatches: s.completedMatches,
        tournaments: s.tournaments, isPlayerScouted: s.isPlayerScouted,
    })))
    const teamById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])
    const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
    const tournamentById = useMemo(() => new Map(tournaments.map(t => [t.id, t])), [tournaments])
    const isOwn = team.id === playerTeamId

    const results = useMemo(() => completedMatches
        .filter(m => !m.isScrim && m.result && (m.homeTeamId === team.id || m.awayTeamId === team.id))
        .sort((a, b) => b.week - a.week || (b.day ?? 0) - (a.day ?? 0)), [completedMatches, team.id])
    const h2h = useMemo(() => {
        if (isOwn || !playerTeamId) return null
        const games = results.filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
        const wins = games.filter(m => m.result.winnerId === playerTeamId).length
        return { played: games.length, wins, losses: games.length - wins }
    }, [results, isOwn, playerTeamId])
    const record = useMemo(() => {
        const wins = results.filter(m => m.result.winnerId === team.id).length
        return { wins, losses: results.length - wins }
    }, [results, team.id])

    const tier = getTierStyle(team.tier as TierLevel)
    const trophies = [...(team.trophies ?? [])].sort((a, b) => b.week - a.week)

    return (
        <div className="space-y-4">
            <header className="flex flex-wrap items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-raised">
                    <TeamLogoImage src={team.logoPath} alt="" size={52} team={team} />
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">{isOwn ? "Your club" : "Club"}</p>
                    <h1 className="font-display text-4xl font-bold uppercase leading-none text-ink-1">{team.name}</h1>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                        {team.worldRanking != null && <span className="font-semibold text-ink-2">World #{team.worldRanking}</span>}
                        <span aria-hidden="true">·</span><span>{tier.label}</span>
                        {team.region && <><span aria-hidden="true">·</span><CountryFlag country={team.region} showName size={14} /></>}
                    </p>
                </div>
            </header>

            <KpiStrip className="w-fit max-w-full flex-wrap">
                <Kpi label="Elo" value={Math.round(team.elo ?? 0)} />
                {team.peakWorldRanking != null && <Kpi label="Best rank" value={`#${team.peakWorldRanking}`} />}
                <Kpi label="Record" value={`${record.wins}–${record.losses}`} hint="Official matches this career" />
                <Kpi label="Trophies" value={trophies.length} />
                {h2h && <Kpi label="Against you" value={`${h2h.losses}–${h2h.wins}`} hint={h2h.played ? `${h2h.played} meetings` : "Never met"} />}
            </KpiStrip>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <Panel title="Roster" padded={false}>
                    <table data-slot="table" className="w-full border-collapse text-left">
                        <thead data-slot="table-header">
                            <tr className="border-b border-line">
                                <th data-slot="table-head" className="pl-4">Player</th>
                                <th data-slot="table-head" className="px-3">Role</th>
                                <th data-slot="table-head" className="px-3 text-right">Age</th>
                                <th data-slot="table-head" className="pr-4 text-right">OVR</th>
                            </tr>
                        </thead>
                        <tbody>
                            {team.rosterIds.map(id => {
                                const player = playerById.get(id)
                                if (!player) return null
                                const ovr = evaluatePlayer(player).overallRating
                                const exact = isOwn || isPlayerScouted(player.id)
                                return (
                                    <tr key={id} data-slot="table-row" className="h-12 border-b border-line last:border-b-0">
                                        <td className="py-1.5 pl-4">
                                            <PlayerLink id={player.id} className="flex min-w-0 items-center gap-3">
                                                <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised">
                                                    <PlayerPortrait src={player.portraitPath} seed={player.id} alt="" size={36} variant="card" />
                                                </span>
                                                <CountryFlag country={player.nationality} size={14} />
                                                <span className="truncate text-sm font-semibold">{player.nickname}</span>
                                            </PlayerLink>
                                        </td>
                                        <td className="px-3"><RoleTag role={(player.role || "Rifler").split(",")[0]} /></td>
                                        <td className="px-3 text-right text-sm tabular-nums text-ink-2">{player.age}</td>
                                        <td className="pr-4 text-right">
                                            {exact
                                                ? <RatingChip value={ovr} size="sm" />
                                                : <span className="text-sm tabular-nums text-ink-3" title="Scout this player to see the exact rating">{formatScoutedRating(fuzzyBand(ovr, 20, `${player.id}:ovr`))}</span>}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </Panel>

                <div className="min-w-0 space-y-4">
                    <Panel title="Recent results" padded={false}>
                        {results.length === 0
                            ? <p className="px-4 py-3 text-sm text-ink-3">No official matches yet.</p>
                            : (
                                <ul className="divide-y divide-line">
                                    {results.slice(0, RESULTS_SHOWN).map(m => {
                                        const home = m.homeTeamId === team.id
                                        const opponentId = home ? m.awayTeamId : m.homeTeamId
                                        const opponent = teamById.get(opponentId)
                                        const us = home ? m.result.homeScore : m.result.awayScore
                                        const them = home ? m.result.awayScore : m.result.homeScore
                                        const won = m.result.winnerId === team.id
                                        const competition = m.tournamentId ? tournamentById.get(m.tournamentId) : undefined
                                        const involvesYou = m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId
                                        return (
                                            <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                                                <span className={cn("w-5 font-semibold", won ? "text-positive" : "text-negative")}>{won ? "W" : "L"}</span>
                                                <span className="w-12 tabular-nums text-ink-1">{us}–{them}</span>
                                                <span className="min-w-0 flex-1 truncate">
                                                    <span className="text-ink-3">vs </span>
                                                    <TeamLink id={opponent ? opponentId : null} className="font-semibold text-ink-1">{opponent?.name ?? "Unknown club"}</TeamLink>
                                                    {competition && <> <span className="text-ink-3">·</span> <TournamentLink id={competition.id} className="text-ink-3">{competition.name}</TournamentLink></>}
                                                </span>
                                                <span className="shrink-0 text-xs tabular-nums text-ink-3">
                                                    {involvesYou ? <Link href={`/match/${m.id}/result`} className="hover:text-gold">Wk {m.week}</Link> : `Wk ${m.week}`}
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                    </Panel>

                    <Panel title="Trophies" padded={false}>
                        {trophies.length === 0
                            ? <p className="px-4 py-3 text-sm text-ink-3">No trophies yet.</p>
                            : (
                                <ul className="divide-y divide-line">
                                    {trophies.map(t => (
                                        <li key={`${t.tournamentId}-${t.week}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                                            <TournamentLink id={tournamentById.has(t.tournamentId) ? t.tournamentId : null} className="min-w-0 truncate font-semibold text-ink-1">{t.tournamentName}</TournamentLink>
                                            <span className="shrink-0 text-xs text-ink-3">
                                                {t.mvpId && playerById.get(t.mvpId) && <>MVP <PlayerLink id={t.mvpId} className="text-ink-2">{playerById.get(t.mvpId)!.nickname}</PlayerLink> · </>}
                                                Wk {t.week}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                    </Panel>
                </div>
            </div>
        </div>
    )
}
