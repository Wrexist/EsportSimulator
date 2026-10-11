"use client"

import { motion } from "framer-motion"
import { useShallow } from "zustand/react/shallow"
import type { WelcomeMoment } from "@/engine/moments"
import { TIER_DISPLAY } from "@/engine/league-engine"
import { useGameStore } from "@/store/game-store"
import { formatGameCalendarDate, gameCalendarDate } from "@/lib/game-calendar"
import { competitionOf } from "@/lib/match-framing"
import { formatCurrency } from "@/lib/utils-extended"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { TierTag } from "@/src/components/ui/TierTag"
import { MomentFacts, MomentFrame, MomentOverline, MomentRule, useReveal, type MomentFact } from "./MomentFrame"

/**
 * New-career welcome: the board brief. The club, where it stands, the
 * board's objectives for the season (engine/board-expectations.ts), the
 * budget and the first fixture, then the dashboard.
 */
export function WelcomeMomentView({ moment, onDismiss }: { moment: WelcomeMoment; onDismiss: () => void }) {
    const reveal = useReveal()
    const s = useGameStore(useShallow(st => ({
        teams: st.teams,
        managerName: st.managerDetails?.name,
        boardState: st.boardState,
        league: st.league,
        scheduledMatches: st.scheduledMatches,
        tournaments: st.tournaments,
        gameStartDate: st.gameStartDate,
        currentWeek: st.currentWeek,
    })))
    const team = s.teams.find(t => t.id === moment.teamId)
    const objectives = s.boardState?.teamId === moment.teamId ? s.boardState.objectives ?? [] : []
    const division = s.league?.current?.divisions.find(d => d.teamIds.includes(moment.teamId))
    const tierLabel = team?.leagueTier ? TIER_DISPLAY[team.leagueTier as keyof typeof TIER_DISPLAY]?.label ?? team.leagueTier : undefined
    const first = s.scheduledMatches
        .filter(m => m.homeTeamId === moment.teamId || m.awayTeamId === moment.teamId)
        .sort((a, b) => a.week - b.week || (a.day ?? 6) - (b.day ?? 6))[0]
    const opponent = first ? s.teams.find(t => t.id === (first.homeTeamId === moment.teamId ? first.awayTeamId : first.homeTeamId)) : undefined
    const comp = first ? competitionOf(first, s.tournaments) : null
    const firstDate = first && s.gameStartDate ? formatGameCalendarDate(gameCalendarDate(s.gameStartDate, first.week, first.day ?? 0), { weekday: "short", month: "short", day: "numeric" }) : null

    const facts: MomentFact[] = []
    if (team?.worldRanking) facts.push({ label: "World ranking", value: `#${team.worldRanking}`, hint: tierLabel })
    if (division) facts.push({ label: "League", value: `Division ${division.level}`, hint: division.name })
    if (team) facts.push({ label: "Budget", value: formatCurrency(Math.round(team.budget), "$", false) })

    const headlineId = `moment-welcome-${moment.key}`
    return (
        <MomentFrame momentKey={moment.key} labelledBy={headlineId} sound="welcome" onDismiss={onDismiss} actionLabel="To the dashboard">
            <div className="flex w-full max-w-5xl flex-col items-center">
                <motion.div {...reveal(0)} className="flex h-28 w-28 items-center justify-center rounded-xl border border-line bg-raised">
                    <TeamLogoDisplay team={team} size={88} />
                </motion.div>
                <motion.div {...reveal(0.2)} className="mt-6">
                    <MomentOverline>Board brief{s.managerName ? ` · ${s.managerName}` : ""}</MomentOverline>
                </motion.div>
                <motion.h2 {...reveal(0.3, 22)} id={headlineId} className="mt-3 max-w-5xl font-display text-[clamp(48px,5.4vw,92px)] font-extrabold uppercase leading-[0.86] text-ink-1">
                    Welcome to {team?.name ?? "the club"}
                </motion.h2>
                <MomentRule className="mt-7" delay={0.4} />
                {facts.length > 0 && (
                    <motion.div {...reveal(0.5)} className="mt-7 w-full max-w-3xl">
                        <MomentFacts facts={facts} />
                    </motion.div>
                )}
                <div className="mt-6 grid w-full grid-cols-1 gap-4 text-left lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                    <motion.section {...reveal(0.65)} className="rounded-lg border border-line bg-panel px-6 py-5" aria-labelledby={`${headlineId}-obj`}>
                        <h3 id={`${headlineId}-obj`} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">The board expects this season</h3>
                        {objectives.length > 0 ? (
                            <ol className="mt-3 space-y-2.5">
                                {objectives.map((o, i) => (
                                    <li key={o.id} className="flex items-baseline gap-3 text-[15px] leading-snug text-ink-1">
                                        <span className="font-display text-lg font-bold tabular-nums text-gold">{i + 1}</span>
                                        <span>{o.label}</span>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="mt-3 text-sm text-ink-2">No objectives set yet.</p>
                        )}
                    </motion.section>
                    <motion.section {...reveal(0.75)} className="rounded-lg border border-line bg-panel px-6 py-5" aria-labelledby={`${headlineId}-fix`}>
                        <h3 id={`${headlineId}-fix`} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">First fixture</h3>
                        {first && opponent && comp ? (
                            <div className="mt-3 flex items-center gap-4">
                                <TeamLogoDisplay team={opponent} size={48} />
                                <div className="min-w-0">
                                    <p className="truncate font-display text-[26px] font-bold uppercase leading-none text-ink-1">{opponent.name}</p>
                                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-2">
                                        {comp.tier && <TierTag tier={comp.tier} />}
                                        <span>{comp.name}{comp.stage ? ` · ${comp.stage}` : ""}</span>
                                    </p>
                                    <p className="mt-1 text-xs text-ink-3">{firstDate ? `${firstDate} · ` : ""}Week {first.week}{first.format ? ` · ${String(first.format).toUpperCase()}` : ""}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-ink-2">No fixture scheduled yet.</p>
                        )}
                    </motion.section>
                </div>
            </div>
        </MomentFrame>
    )
}
