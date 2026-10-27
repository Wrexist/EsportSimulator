"use client"

/**
 * End of the free demo. Shown in place of every career screen once a demo
 * career has played its last week (lib/edition.ts). The save stays on disk
 * in the folder the full game reads, so buying the game continues it.
 */

import Link from "next/link"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { DEMO_LAST_WEEK, FULL_GAME_STORE_URL } from "@/lib/edition"
import { Button } from "@/components/ui/button"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { Panel } from "@/src/components/ui/Panel"
import { divisionOfTeam, ordinal, tablePosition } from "@/engine/season/regional-league"

/** What the rest of the full game holds after the demo weeks. */
const FULL_GAME_HIGHLIGHTS: { title: string; detail: string }[] = [
    { title: "The majors", detail: "Qualify through the open qualifiers and RMRs and lift the biggest trophies." },
    { title: "Promotion and relegation", detail: "Finish the split, move up the divisions and defend your place." },
    { title: "Transfer windows", detail: "Exclusive signings, rival bids and contracts you sign yourself." },
    { title: "Academy and staff", detail: "Raise prospects, hire coaches and build the club around them." },
    { title: "Season after season", detail: "Careers run for as long as you like, with job offers, the board and the Hall of Fame." },
    { title: "Legends", detail: "Win a major and pick an all-time great to join your roster." },
]

export function DemoEnd() {
    const { team, played, won, trophies, division, position } = useGameStore(useShallow(s => {
        const team = s.teams.find(t => t.id === s.playerTeamId)
        const mine = s.completedMatches.filter(m => m.homeTeamId === s.playerTeamId || m.awayTeamId === s.playerTeamId)
        const division = s.playerTeamId ? divisionOfTeam(s, s.playerTeamId) : undefined
        return {
            team,
            played: mine.length,
            won: mine.filter(m => m.result?.winnerId === s.playerTeamId).length,
            trophies: team?.trophies?.length ?? 0,
            division: division?.name,
            position: s.playerTeamId ? tablePosition(division, s.playerTeamId) : undefined,
        }
    }))

    return (
        <div className="mx-auto w-full max-w-[880px] space-y-4">
            <Panel padded={false}>
                <div className="flex flex-wrap items-center gap-5 p-6">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-line bg-raised">
                        <TeamLogoDisplay team={team} size={48} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="premium-eyebrow">Demo complete · {team?.name}</p>
                        <h1 className="page-title">Your first {DEMO_LAST_WEEK} weeks are in the books</h1>
                        <p className="mt-1 text-sm text-ink-3">
                            {played} {played === 1 ? "match" : "matches"} played · {won} won
                            {position && division ? ` · ${ordinal(position)} in ${division}` : ""}
                            {team?.worldRanking ? ` · world ranking #${team.worldRanking}` : ""}
                            {trophies > 0 ? ` · ${trophies} ${trophies === 1 ? "trophy" : "trophies"}` : ""}
                        </p>
                    </div>
                </div>
            </Panel>

            <Panel title="Keep this career going">
                <p className="text-sm text-ink-2">
                    The season is far from over: the rest of the league split, the majors, the transfer windows and every season after it.
                    Get the full game on Steam and this save is waiting in Load game, ready to play week {DEMO_LAST_WEEK + 1}.
                </p>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {FULL_GAME_HIGHLIGHTS.map(h => (
                        <li key={h.title} className="rounded-md border border-line bg-raised px-3 py-2.5">
                            <p className="text-sm font-semibold text-ink-1">{h.title}</p>
                            <p className="mt-0.5 text-xs text-ink-3">{h.detail}</p>
                        </li>
                    ))}
                </ul>
                <p className="mt-3 text-xs text-ink-3">Esports Manager: FPS is in Early Access. What you tell us in reviews and on the forums shapes the next patches.</p>
            </Panel>

            <div className="flex flex-wrap items-center justify-end gap-2">
                <Button asChild variant="outline"><Link href="/main-menu">Main menu</Link></Button>
                <Button asChild variant="outline"><Link href="/new-game">New demo career</Link></Button>
                <Button asChild>
                    <a href={FULL_GAME_STORE_URL} target="_blank" rel="noreferrer">Get the full game</a>
                </Button>
            </div>
        </div>
    )
}

/** Small reminder of how many demo weeks remain, shown in the career chrome. */
export function DemoWeeksPill({ weeksLeft }: { weeksLeft: number }) {
    return (
        <a
            href={FULL_GAME_STORE_URL}
            target="_blank"
            rel="noreferrer"
            className="fixed bottom-4 left-4 z-40 rounded-full border border-gold/60 bg-panel/95 px-3 py-1.5 text-xs font-semibold text-ink-2 shadow-lg hover:border-gold hover:text-ink-1"
        >
            <span className="font-bold uppercase tracking-[0.12em] text-gold">Demo</span>
            {" · "}
            {weeksLeft === 1 ? "last week" : `${weeksLeft} weeks left`}
        </a>
    )
}
