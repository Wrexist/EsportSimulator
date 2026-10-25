"use client"

/** G7: the Draft Cup bracket on Home, round by round. */

import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { Panel } from "@/src/components/ui/Panel"
import { TeamStanding } from "@/src/components/ui/TeamStanding"
import { teamOvrMap } from "@/lib/team-ovr"
import { cn } from "@/lib/utils"

const ROUNDS = [
    { label: "Quarter-finals", match: /^Quarter/ },
    { label: "Semi-finals", match: /^Semi/ },
    { label: "Grand final", match: /^Grand Final/ },
]

export function DraftCupBracket() {
    const { draftCup, tournaments, teams, players } = useGameStore(useShallow(s => ({ draftCup: s.draftCup, tournaments: s.tournaments, teams: s.teams, players: s.players })))
    const tournament = draftCup ? tournaments.find(t => t.id === draftCup.tournamentId) : undefined
    const bracket = tournament?.playoffBracket ?? []
    // Rank and OVR beside each name, so the field reads at a glance.
    const ovrs = useMemo(() => teamOvrMap(teams.filter(t => tournament?.teamIds.includes(t.id)), players), [teams, players, tournament])
    if (!draftCup || !bracket.length) return null
    const team = (id?: string) => teams.find(t => t.id === id)

    return (
        <Panel eyebrow="Draft Cup" title="Bracket" padded={false}>
            <div className="divide-y divide-line">
                {ROUNDS.map(round => {
                    const matches = bracket.filter(m => round.match.test(m.stage)).sort((a, b) => a.id.localeCompare(b.id))
                    return (
                        <section key={round.label} className="px-4 py-2.5">
                            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{round.label}</h3>
                            <ul className="mt-1.5 space-y-1">
                                {matches.map(m => (
                                    <li key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                                        {[m.homeTeamId, m.awayTeamId].map((id, i) => {
                                            const t = team(id)
                                            const mine = id === draftCup.teamId
                                            const won = m.isCompleted && m.winnerId === id
                                            const lost = m.isCompleted && !!id && m.winnerId !== id
                                            const cell = (
                                                <span key={i} className={cn("flex min-w-0 items-center gap-1.5", i === 0 ? "justify-end text-right" : "", lost && "opacity-45")}>
                                                    {i === 1 && <TeamLogoDisplay team={t} size={16} />}
                                                    {i === 0 && t && <TeamStanding rank={t.worldRanking} ovr={ovrs.get(t.id)} />}
                                                    <span className={cn("truncate", mine ? "font-semibold text-gold" : won ? "font-semibold text-ink-1" : "text-ink-2")}>{t?.name ?? "To be decided"}</span>
                                                    {i === 1 && t && <TeamStanding rank={t.worldRanking} ovr={ovrs.get(t.id)} />}
                                                    {i === 0 && <TeamLogoDisplay team={t} size={16} />}
                                                </span>
                                            )
                                            return i === 0 ? [cell, <span key="vs" className="text-xs text-ink-3">vs</span>] : cell
                                        })}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )
                })}
            </div>
        </Panel>
    )
}
