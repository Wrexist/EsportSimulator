/**
 * NEWPLAYER-07: the live screen puts the manager's club on the left (scorebug,
 * roster, break cards, round banner, intro), whether it is the home or the
 * away side of the fixture. The match state stays home / away; these helpers
 * mirror the home / away fields of what is shown when the club is away.
 */
import type { ScorebugRound } from "@/components/match/LiveMatchScoreboard"

type Side = "home" | "away"
const other = (s: Side): Side => (s === "home" ? "away" : "home")

/** The scorebug / Rounds panel history with home and away swapped. */
export function mirrorRounds(rounds: readonly ScorebugRound[]): ScorebugRound[] {
    return rounds.map(r => ({
        ...r,
        winner: other(r.winner),
        homeBuy: r.awayBuy,
        awayBuy: r.homeBuy,
        homeScore: r.awayScore,
        awayScore: r.homeScore,
    }))
}

/** A score pair (break card, round banner) with home and away swapped. */
export function mirrorScore<T extends { homeScore: number; awayScore: number }>(x: T): T {
    return { ...x, homeScore: x.awayScore, awayScore: x.homeScore }
}

/** The round-end beat with its winner and score seen from the other side. */
export function mirrorBeat<T extends { homeScore: number; awayScore: number; summary: { winner: Side } }>(beat: T): T {
    return { ...mirrorScore(beat), summary: { ...beat.summary, winner: other(beat.summary.winner) } }
}
