"use client"

/**
 * G7: end of a Draft Cup run. Shown on Home (and in place of any screen but
 * the match pages) once the drafted side is knocked out or lifts the cup.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useShallow } from "zustand/react/shallow"
import { Trophy } from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { draftCupOutcome, DRAFT_CUP_DIFFICULTY, DRAFT_CUP_FINISH_LABEL, DRAFT_ROLE_LABEL } from "@/engine/draft-cup"
import { loadDraftCupRuns, type DraftCupRunRecord } from "@/lib/draft-cup-runs"
import { Button } from "@/components/ui/button"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { Panel } from "@/src/components/ui/Panel"
import { cn } from "@/lib/utils"

export function DraftCupResult() {
    const { draftCup, teams, players, tournaments, completedMatches, saveId, settleDraftCup } = useGameStore(useShallow(s => ({
        draftCup: s.draftCup, teams: s.teams, players: s.players, tournaments: s.tournaments,
        completedMatches: s.completedMatches, saveId: s.saveId, settleDraftCup: s.settleDraftCup,
    })))
    const outcome = useMemo(() => draftCupOutcome({ draftCup: draftCup ?? undefined, tournaments, completedMatches }), [draftCup, tournaments, completedMatches])
    const [runs, setRuns] = useState<DraftCupRunRecord[]>([])
    useEffect(() => {
        if (!outcome) return
        void settleDraftCup().then(() => setRuns(loadDraftCupRuns()))
    }, [outcome, settleDraftCup])

    if (!draftCup || !outcome) return null
    const team = teams.find(t => t.id === draftCup.teamId)
    const nameOf = (id: string) => teams.find(t => t.id === id)?.name ?? id
    const path = completedMatches
        .filter(m => m.tournamentId === draftCup.tournamentId && (m.homeTeamId === draftCup.teamId || m.awayTeamId === draftCup.teamId))
        .sort((a, b) => a.week - b.week || (a.day ?? 0) - (b.day ?? 0))
    const champion = outcome.finish === "champion"

    return (
        <div className="mx-auto w-full max-w-[1040px] space-y-4">
            <Panel padded={false}>
                <div className="flex flex-wrap items-center gap-5 p-6">
                    <span className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border", champion ? "border-gold bg-gold/10 text-gold" : "border-line bg-raised")}>
                        {champion ? <Trophy size={32} aria-hidden="true" /> : <TeamLogoDisplay team={team} size={48} />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="premium-eyebrow">Draft Cup · {DRAFT_CUP_DIFFICULTY[draftCup.difficulty].label} · {team?.name}</p>
                        <h1 className="page-title">{DRAFT_CUP_FINISH_LABEL[outcome.finish]}</h1>
                        <p className="mt-1 text-sm text-ink-3">
                            {outcome.seriesWon} series won · maps {outcome.mapsWon}–{outcome.mapsLost} · rounds {outcome.roundDiff >= 0 ? "+" : ""}{outcome.roundDiff}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Run score</p>
                        <p className="font-display text-5xl font-bold leading-none tabular-nums text-ink-1">{outcome.score}</p>
                    </div>
                </div>
            </Panel>

            <div className="grid gap-4 md:grid-cols-2">
                <Panel title="Score">
                    <ul className="space-y-1.5 text-sm">
                        {outcome.breakdown.map(b => (
                            <li key={b.label} className="flex justify-between gap-3">
                                <span className="text-ink-2">{b.label}</span>
                                <span className={cn("tabular-nums", b.points < 0 ? "text-negative" : "text-ink-1")}>{b.points >= 0 ? "+" : ""}{b.points}</span>
                            </li>
                        ))}
                        <li className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold">
                            <span className="text-ink-1">Total</span><span className="tabular-nums text-ink-1">{outcome.score}</span>
                        </li>
                    </ul>
                </Panel>

                <Panel title="Your run">
                    <ul className="space-y-2 text-sm">
                        {path.map(m => {
                            const home = m.homeTeamId === draftCup.teamId
                            const won = m.result?.winnerId === draftCup.teamId
                            const maps = (m.result?.maps ?? []).map(map => {
                                const h = map.homeScore ?? map.finalScore?.team1 ?? 0, a = map.awayScore ?? map.finalScore?.team2 ?? 0
                                return home ? `${h}–${a}` : `${a}–${h}`
                            })
                            return (
                                <li key={m.id} className="flex items-baseline justify-between gap-3">
                                    <span className="min-w-0">
                                        <span className="text-ink-3">{m.stage?.replace(/ \d+$/, "")}</span>{" "}
                                        <span className="font-semibold text-ink-1">vs {nameOf(home ? m.awayTeamId : m.homeTeamId)}</span>
                                    </span>
                                    <span className={cn("shrink-0 tabular-nums", won ? "text-positive" : "text-negative")}>
                                        {won ? "W" : "L"} {maps.join(", ")}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                    <p className="mt-3 border-t border-line pt-2 text-xs text-ink-3">
                        Drafted: {draftCup.picks.map(p => `${players.find(x => x.id === p.playerId)?.nickname ?? "?"} (${DRAFT_ROLE_LABEL[p.role]})`).join(", ")}.
                    </p>
                </Panel>
            </div>

            {runs.length > 0 && (
                <Panel title="Best runs on this device" padded={false}>
                    <ol>
                        {runs.map((r, i) => (
                            <li key={`${r.saveId}-${r.at}`} className={cn("flex h-10 items-center gap-3 border-b border-line px-4 text-sm last:border-b-0", r.saveId === saveId && "bg-raised")}>
                                <span className="w-6 text-right tabular-nums text-ink-3">{i + 1}</span>
                                <span className="min-w-0 flex-1 truncate font-semibold text-ink-1">{r.teamName}</span>
                                <span className="text-xs text-ink-3">{DRAFT_CUP_DIFFICULTY[r.difficulty]?.label} · {DRAFT_CUP_FINISH_LABEL[r.finish]}</span>
                                <span className="w-14 text-right font-semibold tabular-nums text-ink-1">{r.score}</span>
                            </li>
                        ))}
                    </ol>
                </Panel>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
                <p className="mr-auto text-xs text-ink-3">This run stays in Load game, with every match report.</p>
                <Button asChild variant="outline"><Link href="/main-menu">Main menu</Link></Button>
                <Button asChild><Link href="/new-game/draft-cup">Draft again</Link></Button>
            </div>
        </div>
    )
}
